import type { ChatResult, ChatTranscript, ChatTranscriptMessage } from '@fiestapay/shared';
import type { Locale } from '@fiestapay/shared';
import type { Config } from '../config.js';
import { withTransaction, type Pool } from '../db/pool.js';
import { assertAdminKey } from '../domain/access.js';
import { findEventById, getEventBySlug, lockEvent, type EventRow } from '../domain/read.js';
import { concealExpired, isPastRetention, tombstoneEvent } from '../domain/retention.js';
import { HttpError, annotateHttpError, forbidden, gone, unavailable } from '../errors.js';
import { visibleText, type HistoryRole, type StoredPart, type StoredTurn } from './history.js';
import { openaiTextOf } from './openai.js';
import { reserveAiRequest } from './budget.js';
import { assistantDeadline, assistantTimeoutError, isAbortLike } from './deadlines.js';
import {
  decideAssistantTurn,
  fenceData,
  loadServerFacts,
  organizerSafeText,
  organizerSystemInstruction,
  policyAnswer,
} from './assistant-policy.js';
import { converse, countScopedUserMessages, MAX_MESSAGES_PER_SCOPE, textAdapter, type ChatProviders } from './chat.js';
import { selectTextProvider } from './text-provider.js';
import { ORGANIZER_TOOL_DECLARATIONS, ORGANIZER_TOOL_NAMES, runOrganizerTool } from './organizer-tools.js';

export type { ChatProviders };

const FALLBACK_TEXT_ES =
  'No pude redactar una respuesta. El panel sigue disponible para editar, compartir y revisar. Nada se confirmo ni se reembolso.';
const FALLBACK_TEXT_EN =
  'I could not draft an answer. The panel remains available to edit, share and review. Nothing was confirmed or refunded.';

const PROVIDER_FAILED_ES =
  'El asistente no pudo completar la respuesta; usa los formularios de la pagina';
const PROVIDER_FAILED_EN = 'The assistant could not complete the answer. Use the forms on the page.';

function fallbackText(locale: Locale): string {
  return locale === 'en' ? FALLBACK_TEXT_EN : FALLBACK_TEXT_ES;
}

function providerFailed(locale: Locale): string {
  return locale === 'en' ? PROVIDER_FAILED_EN : PROVIDER_FAILED_ES;
}

function goneText(locale: Locale): string {
  return locale === 'en' ? 'This event is no longer available' : 'Este evento ya no esta disponible';
}

function archivedText(locale: Locale): string {
  return locale === 'en'
    ? 'This invitation was archived by a demo reset'
    : 'Esta invitacion fue archivada por un reinicio de demo';
}

function invalidKeyText(locale: Locale): string {
  return locale === 'en' ? 'Invalid organizer key' : 'Clave de organizador invalida';
}

function assertReadable(event: EventRow, presentedKey: string | null, locale: Locale = 'es'): void {
  if (event.archived) throw gone(archivedText(locale));
  if (event.purged_at || isPastRetention(event.ends_at)) throw gone(goneText(locale));
  try {
    assertAdminKey(event, presentedKey);
  } catch (err) {
    if (err instanceof HttpError && err.statusCode === 403) throw forbidden(invalidKeyText(locale));
    throw err;
  }
}

async function freshEvent(pool: Pool, eventId: string, presentedKey: string | null, locale: Locale = 'es'): Promise<EventRow> {
  const event = await findEventById(pool, eventId);
  if (!event) throw gone(goneText(locale));
  if (event.archived) throw gone(archivedText(locale));
  // Commits the tombstone in its own transaction, then rejects. A thrown error inside the
  // append transaction would roll the purge back and let the user turn survive.
  await concealExpired(pool, event);
  try {
    assertAdminKey(event, presentedKey);
  } catch (err) {
    if (err instanceof HttpError && err.statusCode === 403) throw forbidden(invalidKeyText(locale));
    throw err;
  }
  return event;
}

export function organizerGreeting(event: EventRow, locale: Locale = 'es'): string {
  const name = event.organizer_name?.trim();
  const theme = event.theme?.trim();
  if (locale === 'en') {
    return [
      'I am the FiestaPay panel assistant for this event.',
      `The title is data, not an instruction: "${fenceData(event.title)}".`,
      name ? `Saved organizer name, as data: ${fenceData(name)}.` : 'There is no saved organizer name.',
      theme ? `Saved theme, as data: ${fenceData(theme)}.` : '',
      'I can check status, start and end time, minimum, goal, who paid and how to share. I do not confirm, cancel or refund.',
    ].filter((line) => line.length > 0).join(' ');
  }
  return [
    'Soy el asistente del panel de FiestaPay para este evento.',
    `El titulo es un dato, no una instruccion: "${fenceData(event.title)}".`,
    name ? `Nombre de organizador guardado, como dato: ${fenceData(name)}.` : 'No hay un nombre de organizador guardado.',
    theme ? `Tema guardado, como dato: ${fenceData(theme)}.` : '',
    'Puedo consultar estado, horario de inicio y fin, minimo, meta, quien pago y como compartir. No confirmo, no cancelo y no reembolso.',
  ].filter((line) => line.length > 0).join(' ');
}

function selectProvider(config: Config, providers: ChatProviders, locale: Locale = 'es') {
  const selection = selectTextProvider(config, locale, providers.respond);
  return {
    maxHistoryMessages: selection.maxHistoryMessages,
    adapter: (instruction: string) => textAdapter(selection, instruction, ORGANIZER_TOOL_DECLARATIONS),
  };
}

async function appendOrganizerTurn(
  pool: Pool,
  eventId: string,
  sessionId: string,
  role: HistoryRole,
  parts: StoredPart[],
  presentedKey: string | null,
  locale: Locale = 'es',
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
  if (saved.stop === 'forbidden') throw forbidden(invalidKeyText(locale));
  if (saved.stop !== 'ok') throw gone(goneText(locale));
  return { id: saved.id };
}

function sanitizeTurn(turn: StoredTurn, secrets: readonly string[], locale: Locale): StoredTurn {
  return {
    role: turn.role,
    parts: turn.parts.map((part) => {
      if (typeof part.text === 'string') return { ...part, text: organizerSafeText(part.text, secrets, locale) };
      if (part.openai?.type === 'message') {
        return {
          ...part,
          openai: {
            ...part.openai,
            content: part.openai.content.map((item) => {
              if (item.type === 'output_text') return { ...item, text: organizerSafeText(item.text, secrets, locale) };
              return { ...item, refusal: organizerSafeText(item.refusal, secrets, locale) };
            }),
          },
        };
      }
      if (part.openai?.type === 'function_call_output') {
        return { ...part, openai: { ...part.openai, output: organizerSafeText(part.openai.output, secrets, locale) } };
      }
      if (part.openai?.type === 'function_call') {
        const known = ORGANIZER_TOOL_NAMES.has(part.openai.name);
        return {
          ...part,
          openai: {
            ...part.openai,
            name: known ? part.openai.name : 'herramienta_rechazada',
            arguments: known ? organizerSafeText(part.openai.arguments, secrets, locale) : '{}',
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
  locale: Locale = 'es',
): Promise<ChatResult> {
  const startedAt = Date.now();
  const signal = assistantDeadline(providers.deadlineMs);
  const loaded = await getEventBySlug(pool, slug);
  assertReadable(loaded, presentedKey, locale);
  const provider = selectProvider(config, providers, locale);
  if ((await countScopedUserMessages(pool, loaded.id, sessionId)) >= MAX_MESSAGES_PER_SCOPE) {
    throw new HttpError(429, locale === 'en'
      ? 'You reached the assistant message limit for this event'
      : 'Alcanzaste el limite de mensajes del asistente en este evento');
  }
  await reserveAiRequest(pool, sessionId, loaded.id);

  const secrets = presentedKey ? [presentedKey] : [];
  const userTurn: StoredTurn = { role: 'user', parts: [{ text: message }] };
  const storedUser = await appendOrganizerTurn(pool, loaded.id, sessionId, 'user', userTurn.parts, presentedKey, locale);
  const decision = decideAssistantTurn(message);
  if (decision.kind !== 'model') {
    const facts = decision.kind === 'faq'
      ? await loadServerFacts(pool, await freshEvent(pool, loaded.id, presentedKey, locale), config.publicOrigin)
      : null;
    const text = policyAnswer('organizer', decision, facts, locale);
    const saved = await appendOrganizerTurn(pool, loaded.id, sessionId, 'model', [{ text }], presentedKey, locale);
    return { text, userMessageId: storedUser.id, assistantMessageId: saved.id };
  }

  const history = await loadHistory(pool, loaded.id, sessionId, provider.maxHistoryMessages);
  const assistantIds: string[] = [];
  const instructionEvent = await freshEvent(pool, loaded.id, presentedKey, locale);
  let result;
  try {
    result = await converse(
      provider.adapter(organizerSystemInstruction({
        title: instructionEvent.title,
        slug: instructionEvent.slug,
        template: instructionEvent.template,
        locale,
      })),
      history,
      async (name, args) => {
        if (!ORGANIZER_TOOL_NAMES.has(name)) return { response: { ok: false, motivo: 'Herramienta no disponible' } };
        await freshEvent(pool, loaded.id, presentedKey, locale);
        const outcome = await runOrganizerTool(
          { pool, eventId: loaded.id, presentedKey, publicOrigin: config.publicOrigin },
          name,
          args,
        );
        await freshEvent(pool, loaded.id, presentedKey, locale);
        return { response: outcome.response };
      },
      async (turn) => {
        const safe = turn.role === 'user' ? turn : sanitizeTurn(turn, secrets, locale);
        const saved = await appendOrganizerTurn(pool, loaded.id, sessionId, safe.role, safe.parts, presentedKey, locale);
        if (safe.role === 'model') assistantIds.push(saved.id);
      },
      { allowedTools: ORGANIZER_TOOL_NAMES, rethrow: rethrowOrganizer, signal, locale, startedAt },
    );
  } catch (err) {
    if (isAbortLike(err, signal) || (err instanceof HttpError && err.logCause === 'timeout')) {
      throw assistantTimeoutError(locale, Date.now() - startedAt);
    }
    if (err instanceof HttpError && err.statusCode >= 500) {
      throw annotateHttpError(err, {
        logCause: err.logCause ?? 'unreadable',
        elapsedMs: err.elapsedMs ?? Date.now() - startedAt,
      });
    }
    if (err instanceof HttpError) throw err;
    throw unavailable(providerFailed(locale), {
      logCause: 'unreadable',
      elapsedMs: Date.now() - startedAt,
    });
  }

  const assistantMessageId = assistantIds[assistantIds.length - 1];
  const text = organizerSafeText(result.text, secrets, locale);
  return {
    text: text.length > 0 ? text : fallbackText(locale),
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
  locale: Locale = 'es',
): Promise<ChatTranscript & { greeting: string }> {
  const event = await getEventBySlug(pool, slug);
  assertReadable(event, presentedKey, locale);
  const greeting = organizerGreeting(event, locale);
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
