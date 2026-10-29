import type { ChatResult } from '@fiestapay/shared';
import type { Config, OpenAIConfig } from '../config.js';
import type { Pool } from '../db/pool.js';
import { HttpError, unavailable } from '../errors.js';
import { audit } from '../domain/audit.js';
import { ModerationHold, appendChatTurn, assertChatRevision, assertSessionMayAct } from '../domain/moderation.js';
import { assertPrivateAccess } from '../domain/access.js';
import { assertActive } from '../domain/events.js';
import { concealExpired } from '../domain/retention.js';
import { reserveAiRequest } from './budget.js';
import { findGuestBySession, getEventBySlug, loadGuest, type EventRow, type GuestRow } from '../domain/read.js';
import { decideAssistantTurn, guestSystemInstruction, loadServerFacts, policyAnswer } from './assistant-policy.js';
import type { HistoryRole, StoredPart, StoredTurn } from './history.js';
import { createResponse, openaiCallsOf, openaiTextOf, toOpenAIInput, toOpenAITools, type RespondFn } from './openai.js';
import { TOOL_NAMES, TOOL_DECLARATIONS, runTool, type FunctionDeclaration, type ToolOutcome } from './tools.js';

/** Hard ceiling per (event, session) conversation, so one visitor cannot drain the AI budget. */
export const MAX_MESSAGES_PER_SCOPE = 60;

/** Calls beyond this in a single model round are answered as refused and never executed. */
export const MAX_TOOL_CALLS_PER_ROUND = 5;

const FALLBACK_TEXT =
  'No pude redactar una respuesta. Puedes seguir con los formularios de la pagina: asistencia, cotizacion y pago funcionan sin el asistente.';

/** Test seam: a scripted model replaces the OpenAI HTTP round trip. */
export interface ChatProviders {
  respond?: RespondFn | undefined;
}

export interface ToolCall {
  id?: string;
  name: string;
  args: unknown;
  argsValid: boolean;
}

export interface ModelRound {
  /** Turn to persist and replay, or null when the round produced nothing usable. */
  turn: StoredTurn | null;
  calls: ToolCall[];
  text: string;
}

/** What the conversation loop needs from a provider; the loop itself is provider neutral. */
export interface ProviderAdapter {
  maxToolRounds: number;
  round(history: StoredTurn[]): Promise<ModelRound>;
  responses(answers: { call: ToolCall; response: Record<string, unknown> }[]): StoredTurn;
}

export function openaiAdapter(
  config: OpenAIConfig,
  instruction: string,
  respond: RespondFn,
  declarations: FunctionDeclaration[] = TOOL_DECLARATIONS,
): ProviderAdapter {
  const tools = toOpenAITools(declarations);
  return {
    maxToolRounds: config.maxToolRounds,
    async round(history) {
      const output = await respond(config, { instructions: instruction, input: toOpenAIInput(history), tools });
      // An incomplete response may hold a partial set of calls: none of it is stored or run.
      if (output.status !== 'completed') return { turn: null, calls: [], text: '' };
      return {
        turn: output.items.length > 0 ? { role: 'model', parts: output.items.map((item) => ({ openai: item })) } : null,
        calls: openaiCallsOf(output.items),
        text: openaiTextOf(output.items),
      };
    },
    responses(answers) {
      return {
        role: 'function',
        parts: answers.map(({ call, response }): StoredPart => ({
          openai: { type: 'function_call_output', call_id: call.id ?? '', output: JSON.stringify(response) },
        })),
      };
    },
  };
}

export interface ConversationResult {
  text: string;
  quote?: ToolOutcome['quote'];
  actions: string[];
}

/**
 * Model rounds until a round has no calls or the round limit is hit. Every call gets an answer;
 * only known tools with valid arguments, within the per-round limit, are executed.
 */
export async function converse(
  adapter: ProviderAdapter,
  history: StoredTurn[],
  execute: (name: string, args: unknown) => Promise<ToolOutcome>,
  persist: (turn: StoredTurn) => Promise<void>,
  options?: { allowedTools?: ReadonlySet<string>; rethrow?: (err: unknown) => boolean },
): Promise<ConversationResult> {
  const allowedTools = options?.allowedTools ?? TOOL_NAMES;
  let quote: ToolOutcome['quote'];
  const actions = new Set<string>();
  let text = '';

  for (let round = 0; round <= adapter.maxToolRounds; round += 1) {
    const output = await adapter.round(history);
    if (output.turn) {
      history.push(output.turn);
      await persist(output.turn);
    }

    if (output.calls.length === 0 || round === adapter.maxToolRounds) {
      text = output.text;
      break;
    }

    const answers: { call: ToolCall; response: Record<string, unknown> }[] = [];
    for (const [index, call] of output.calls.entries()) {
      if (index >= MAX_TOOL_CALLS_PER_ROUND) {
        answers.push({ call, response: { ok: false, motivo: 'Demasiadas herramientas en un solo paso' } });
        continue;
      }
      if (!allowedTools.has(call.name)) {
        answers.push({ call, response: { ok: false, motivo: 'Herramienta no disponible' } });
        continue;
      }
      if (!call.argsValid) {
        answers.push({ call, response: { ok: false, motivo: 'Argumentos invalidos; pide los datos otra vez.' } });
        continue;
      }
      let outcome: ToolOutcome;
      try {
        outcome = await execute(call.name, call.args);
      } catch (err) {
        // A block, a revoked organizer key, or a deletion that landed while the model was
        // running must not be stored as a tool answer. Other domain refusals stay information.
        if (err instanceof ModerationHold || options?.rethrow?.(err)) throw err;
        const motivo = err instanceof HttpError ? err.message : 'No se pudo ejecutar la herramienta';
        outcome = { response: { ok: false, motivo } };
      }
      if (outcome.quote) quote = outcome.quote;
      for (const action of outcome.actions ?? []) actions.add(action);
      answers.push({ call, response: outcome.response });
    }

    const turn = adapter.responses(answers);
    history.push(turn);
    await persist(turn);
  }

  return { text, ...(quote ? { quote } : {}), actions: [...actions] };
}

function systemInstruction(event: EventRow, guest: GuestRow | null): string {
  return guestSystemInstruction({
    title: event.title,
    slug: event.slug,
    template: event.template,
    guestName: guest?.name ?? null,
  });
}

/** OpenAI only. A missing key is a 503, never another model. */
function selectProvider(
  config: Config,
  providers: ChatProviders,
): { maxHistoryMessages: number; adapter: (instruction: string) => ProviderAdapter } {
  const openai = config.openai;
  if (!openai) throw unavailable(config.openaiDisabledReason ?? 'El asistente no esta configurado');
  const respond = providers.respond ?? createResponse;
  return { maxHistoryMessages: openai.maxHistoryMessages, adapter: (instruction) => openaiAdapter(openai, instruction, respond) };
}

async function loadHistory(pool: Pool, eventId: string, sessionId: string, limit: number): Promise<StoredTurn[]> {
  const { rows } = await pool.query<{ role: HistoryRole; parts: unknown }>(
    `SELECT role, parts FROM (
       SELECT id, role, parts FROM chat_messages
        WHERE event_id = $1 AND session_id = $2 AND deleted_at IS NULL
        ORDER BY id DESC LIMIT $3
     ) recent ORDER BY id ASC`,
    [eventId, sessionId, limit],
  );
  return rows.map((row) => ({
    role: row.role,
    parts: Array.isArray(row.parts) ? (row.parts as StoredPart[]) : [],
  }));
}

/** User turns of both roles share one ceiling for the same event and browser session. */
export async function countScopedUserMessages(pool: Pool, eventId: string, sessionId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT (
       (SELECT COUNT(*) FROM chat_messages WHERE event_id = $1 AND session_id = $2 AND role = 'user')
       + (SELECT COUNT(*) FROM organizer_chat_messages WHERE event_id = $1 AND session_id = $2 AND role = 'user')
     )::text AS count`,
    [eventId, sessionId],
  );
  return Number(rows[0]?.count ?? '0');
}

/**
 * Text channel of the assistant. History, tools and scope all live on the server: the browser
 * sends one message and receives text plus, at most, a quote card and reviewable action
 * proposals. Nothing here can move money or change attendance on its own.
 */
export async function chatWithAssistant(
  pool: Pool,
  config: Config,
  sessionId: string,
  slug: string,
  message: string,
  providers: ChatProviders = {},
  presentedKey: string | null = null,
): Promise<ChatResult> {
  const event = await getEventBySlug(pool, slug);
  await concealExpired(pool, event);
  assertActive(event);
  await assertPrivateAccess(pool, event, sessionId, presentedKey);
  const guest = await findGuestBySession(pool, event.id, sessionId);
  // Before provider selection, the credit row, and any provider HTTP. A block that lands
  // during the round is checked again under the chat scope lock, never held across the call.
  await assertSessionMayAct(pool, event.id, sessionId);
  const provider = selectProvider(config, providers);

  if ((await countScopedUserMessages(pool, event.id, sessionId)) >= MAX_MESSAGES_PER_SCOPE) {
    throw new HttpError(429, 'Alcanzaste el limite de mensajes del asistente en este evento');
  }

  await reserveAiRequest(pool, sessionId, event.id);
  const userTurn: StoredTurn = { role: 'user', parts: [{ text: message }] };
  const storedUser = await appendChatTurn(pool, event.id, sessionId, 'user', userTurn.parts);
  await audit(pool, event.id, 'chat_message');
  const decision = decideAssistantTurn(message);
  if (decision.kind !== 'model') {
    const facts = decision.kind === 'faq' ? await loadServerFacts(pool, event, config.publicOrigin) : null;
    const text = policyAnswer('guest', decision, facts);
    const saved = await appendChatTurn(pool, event.id, sessionId, 'model', [{ text }], storedUser.revision);
    const freshGuest = guest ? await loadGuest(pool, guest, event) : undefined;
    return {
      text,
      ...(freshGuest ? { guest: freshGuest } : {}),
      userMessageId: storedUser.id,
      assistantMessageId: saved.id,
    };
  }
  const history = await loadHistory(pool, event.id, sessionId, provider.maxHistoryMessages);
  const assistantIds: string[] = [];

  const result = await converse(
    provider.adapter(systemInstruction(event, guest)),
    history,
    async (name, args) => {
      await assertChatRevision(pool, event.id, sessionId, storedUser.revision);
      return runTool({ pool, sessionId, event, guest, quoteTtlSeconds: config.quoteTtlSeconds }, name, args);
    },
    async (turn) => {
      const saved = await appendChatTurn(pool, event.id, sessionId, turn.role, turn.parts, storedUser.revision);
      if (turn.role === 'model') assistantIds.push(saved.id);
    },
  );

  const freshGuest = guest ? await loadGuest(pool, guest, event) : undefined;
  const assistantMessageId = assistantIds[assistantIds.length - 1];
  return {
    text: result.text.length > 0 ? result.text : FALLBACK_TEXT,
    ...(result.quote ? { quote: result.quote } : {}),
    ...(freshGuest ? { guest: freshGuest } : {}),
    ...(result.actions.length > 0 ? { actions: result.actions } : {}),
    userMessageId: storedUser.id,
    ...(assistantMessageId ? { assistantMessageId } : {}),
  };
}
