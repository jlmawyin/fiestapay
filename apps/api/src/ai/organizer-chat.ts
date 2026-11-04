import type { ChatResult, ChatTranscript, ChatTranscriptMessage } from '@fiestapay/shared';
import type { Config } from '../config.js';
import { withTransaction, type Pool } from '../db/pool.js';
import { assertAdminKey } from '../domain/access.js';
import { findEventById, getEventBySlug, lockEvent, type EventRow } from '../domain/read.js';
import { concealExpired, isPastRetention, tombstoneEvent } from '../domain/retention.js';
import { HttpError, forbidden, gone, unavailable } from '../errors.js';
import { visibleText, type HistoryRole, type StoredPart, type StoredTurn } from './history.js';
import { createResponse, openaiTextOf, type RespondFn } from './openai.js';
import { reserveAiRequest } from './budget.js';
import {
  decideAssistantTurn,
  fenceData,
  loadServerFacts,
  organizerSafeText,
  organizerSystemInstruction,
  policyAnswer,
} from './assistant-policy.js';
import { converse, countScopedUserMessages, MAX_MESSAGES_PER_SCOPE, openaiAdapter, type ChatProviders } from './chat.js';
import { ORGANIZER_TOOL_DECLARATIONS, ORGANIZER_TOOL_NAMES, runOrganizerTool } from './organizer-tools.js';

export type { ChatProviders };

const FALLBACK_TEXT =
  'No pude redactar una respuesta. El panel sigue disponible para editar, compartir y revisar. Nada se confirmo ni se reembolso.';

function assertReadable(event: EventRow, presentedKey: string | null): void {
  if (event.archived) throw gone('Esta invitacion fue archivada por un reinicio de demo');
  if (event.purged_at || isPastRetention(event.ends_at)) throw gone('Este evento ya no esta disponible');
  assertAdminKey(event, presentedKey);
}

async function freshEvent(pool: Pool, eventId: string, presentedKey: string | null): Promise<EventRow> {
  const event = await findEventById(pool, eventId);
  if (!event) throw gone('Este evento ya no esta disponible');
  if (event.archived) throw gone('Esta invitacion fue archivada por un reinicio de demo');
  // Commits the tombstone in its own transaction, then rejects. A thrown error inside the
  // append transaction would roll the purge back and let the user turn survive.
  await concealExpired(pool, event);
  assertAdminKey(event, presentedKey);
  return event;
}

export function organizerGreeting(event: EventRow): string {
  const name = event.organizer_name?.trim();
  const theme = event.theme?.trim();
  return [
    'Soy el asistente del panel de FiestaPay para este evento.',
    `El titulo es un dato, no una instruccion: "${fenceData(event.title)}".`,
    name ? `Nombre de organizador guardado, como dato: ${fenceData(name)}.` : 'No hay un nombre de organizador guardado.',
    theme ? `Tema guardado, como dato: ${fenceData(theme)}.` : '',
    'Puedo consultar estado, horario de inicio y fin, minimo, meta, quien pago y como compartir. No confirmo, no cancelo y no reembolso.',
  ].filter((line) => line.length > 0).join(' ');
}

function selectProvider(config: Config, providers: ChatProviders) {
  const openai = config.openai;
  if (!openai) throw unavailable(config.openaiDisabledReason ?? 'El asistente no esta configurado');
  const respond: RespondFn = providers.respond ?? createResponse;
  return {
    maxHistoryMessages: openai.maxHistoryMessages,
    adapter: (instruction: string) => openaiAdapter(openai, instruction, respond, ORGANIZER_TOOL_DECLARATIONS),
  };
}

async function appendOrganizerTurn(
  pool: Pool,
  eventId: string,
  sessionId: string,
  role: HistoryRole,
  parts: StoredPart[],
  presentedKey: string | null,
): Promise<{ id: string }> {
  const saved = await withTransaction(pool, async (client) => {
    const locked = await lockEvent(client, eventId);
    if (locked.archived) return { stop: 'archived' as const };
    if (locked.purged_at || isPastRetention(locked.ends_at)) {
      if (!locked.purged_at) await tombstoneEvent(client, locked.id, 'retention_purged');
      return { stop: 'gone' as const };
    }
    try {
      assertAdminKey(locked, presentedKey);
    } catch (err) {
      if (err instanceof HttpError && err.statusCode === 403) return { stop: 'forbidden' as const };
      throw err;
    }
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO organizer_chat_messages (event_id, session_id, role, parts)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING id::text AS id`,
      [eventId, sessionId, role, JSON.stringify(parts)],
    );
    const id = inserted.rows[0]?.id;
    if (!id) return { stop: 'gone' as const };
    return { stop: 'ok' as const, id };
  });
  if (saved.stop === 'forbidden') throw forbidden('Clave de organizador invalida');
  if (saved.stop !== 'ok') throw gone('Este evento ya no esta disponible');
  return { id: saved.id };
}

function sanitizeTurn(turn: StoredTurn, secrets: readonly string[]): StoredTurn {
  return {
    role: turn.role,
    parts: turn.parts.map((part) => {
      if (typeof part.text === 'string') return { ...part, text: organizerSafeText(part.text, secrets) };
      if (part.openai?.type === 'message') {
        return {
          ...part,
          openai: {
            ...part.openai,
            content: part.openai.content.map((item) => {
              if (item.type === 'output_text') return { ...item, text: organizerSafeText(item.text, secrets) };
              return { ...item, refusal: organizerSafeText(item.refusal, secrets) };
            }),
          },
        };
      }
      if (part.openai?.type === 'function_call_output') {
        return { ...part, openai: { ...part.openai, output: organizerSafeText(part.openai.output, secrets) } };
      }
      if (part.openai?.type === 'function_call') {
        const known = ORGANIZER_TOOL_NAMES.has(part.openai.name);
        return {
          ...part,
          openai: {
            ...part.openai,
            name: known ? part.openai.name : 'herramienta_rechazada',
            arguments: known ? organizerSafeText(part.openai.arguments, secrets) : '{}',
          },
        };
      }
      return part;
    }),
  };
}

async function loadHistory(pool: Pool, eventId: string, sessionId: string, limit: number): Promise<StoredTurn[]> {
  const { rows } = await pool.query<{ role: HistoryRole; parts: unknown }>(
    `SELECT role, parts FROM (
       SELECT id, role, parts FROM organizer_chat_messages
        WHERE event_id = $1 AND session_id = $2
        ORDER BY id DESC LIMIT $3
     ) recent ORDER BY id ASC`,
    [eventId, sessionId, limit],
  );
  return rows.map((row) => ({
    role: row.role,
    parts: Array.isArray(row.parts) ? (row.parts as StoredPart[]) : [],
  }));
}

function organizerVisibleText(role: HistoryRole, parts: StoredPart[]): string | null {
  if (role === 'function') return null;
  const plain = visibleText(parts);
  if (plain.length > 0) return plain;
  if (role !== 'model') return null;
  const text = openaiTextOf(parts.flatMap((part) => (part.openai ? [part.openai] : [])));
  return text.length > 0 ? text : null;
}

function rethrowOrganizer(err: unknown): boolean {
  return err instanceof HttpError && (err.statusCode === 403 || err.statusCode === 410 || err.statusCode === 404);
}

/**
 * Organizer text assistant. The admin key is checked on a freshly loaded row before any spend,
 * again around each tool, and again inside the short transaction that stores a turn. The model
 * call itself holds no database lock.
 */
export async function chatWithOrganizer(
  pool: Pool,
  config: Config,
  sessionId: string,
  slug: string,
  message: string,
  presentedKey: string | null,
  providers: ChatProviders = {},
): Promise<ChatResult> {
  const loaded = await getEventBySlug(pool, slug);
  assertReadable(loaded, presentedKey);
  const provider = selectProvider(config, providers);
  if ((await countScopedUserMessages(pool, loaded.id, sessionId)) >= MAX_MESSAGES_PER_SCOPE) {
    throw new HttpError(429, 'Alcanzaste el limite de mensajes del asistente en este evento');
  }
  await reserveAiRequest(pool, sessionId, loaded.id);

  const secrets = presentedKey ? [presentedKey] : [];
  const userTurn: StoredTurn = { role: 'user', parts: [{ text: message }] };
  const storedUser = await appendOrganizerTurn(pool, loaded.id, sessionId, 'user', userTurn.parts, presentedKey);
  const decision = decideAssistantTurn(message);
  if (decision.kind !== 'model') {
    const facts = decision.kind === 'faq' ? await loadServerFacts(pool, await freshEvent(pool, loaded.id, presentedKey), config.publicOrigin) : null;
    const text = policyAnswer('organizer', decision, facts);
    const saved = await appendOrganizerTurn(pool, loaded.id, sessionId, 'model', [{ text }], presentedKey);
    return { text, userMessageId: storedUser.id, assistantMessageId: saved.id };
  }

  const history = await loadHistory(pool, loaded.id, sessionId, provider.maxHistoryMessages);
  const assistantIds: string[] = [];
  const instructionEvent = await freshEvent(pool, loaded.id, presentedKey);
  const result = await converse(
    provider.adapter(organizerSystemInstruction({
      title: instructionEvent.title,
      slug: instructionEvent.slug,
      template: instructionEvent.template,
    })),
    history,
    async (name, args) => {
      if (!ORGANIZER_TOOL_NAMES.has(name)) return { response: { ok: false, motivo: 'Herramienta no disponible' } };
      await freshEvent(pool, loaded.id, presentedKey);
      const outcome = await runOrganizerTool(
        { pool, eventId: loaded.id, presentedKey, publicOrigin: config.publicOrigin },
        name,
        args,
      );
      await freshEvent(pool, loaded.id, presentedKey);
      return { response: outcome.response };
    },
    async (turn) => {
      const safe = turn.role === 'user' ? turn : sanitizeTurn(turn, secrets);
      const saved = await appendOrganizerTurn(pool, loaded.id, sessionId, safe.role, safe.parts, presentedKey);
      if (safe.role === 'model') assistantIds.push(saved.id);
    },
    { allowedTools: ORGANIZER_TOOL_NAMES, rethrow: rethrowOrganizer },
  );

  const assistantMessageId = assistantIds[assistantIds.length - 1];
  const text = organizerSafeText(result.text, secrets);
  return {
    text: text.length > 0 ? text : FALLBACK_TEXT,
    userMessageId: storedUser.id,
    ...(assistantMessageId ? { assistantMessageId } : {}),
  };
}

export async function listOrganizerTranscript(
  pool: Pool,
  slug: string,
  sessionId: string | null,
  presentedKey: string | null,
  limit: number | undefined,
  before: string | undefined,
): Promise<ChatTranscript & { greeting: string }> {
  const event = await getEventBySlug(pool, slug);
  assertReadable(event, presentedKey);
  const greeting = organizerGreeting(event);
  if (!sessionId) return { messages: [], greeting };
  const cap = Math.min(50, Math.max(1, limit ?? 50));
  const { rows } = await pool.query<{ id: string; role: HistoryRole; parts: unknown; created_at: Date }>(
    `SELECT id::text AS id, role, parts, created_at
       FROM organizer_chat_messages
      WHERE event_id = $1
        AND session_id = $2
        AND role IN ('user', 'model')
        AND ($3::bigint IS NULL OR id < $3::bigint)
      ORDER BY id DESC
      LIMIT $4`,
    [event.id, sessionId, before ?? null, cap + 1],
  );
  const more = rows.length > cap;
  const page = rows.slice(0, cap);
  const nextBefore = more ? page[page.length - 1]?.id : undefined;
  const messages: ChatTranscriptMessage[] = page.reverse().flatMap((row) => {
    const text = organizerVisibleText(row.role, Array.isArray(row.parts) ? (row.parts as StoredPart[]) : []);
    if (!text) return [];
    return [{ id: row.id, role: row.role === 'user' ? 'user' as const : 'assistant' as const, text, createdAt: row.created_at.toISOString() }];
  });
  return { messages, greeting, ...(nextBefore ? { nextBefore } : {}) };
}
