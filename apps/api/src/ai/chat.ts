import type { ChatResult } from '@fiestapay/shared';
import type { Config, GeminiConfig, OpenAIConfig } from '../config.js';
import type { Pool } from '../db/pool.js';
import { HttpError, unavailable } from '../errors.js';
import { audit } from '../domain/audit.js';
import { assertActive } from '../domain/events.js';
import { reserveAiRequest } from './budget.js';
import { findGuestBySession, getEventBySlug, loadGuest, type EventRow, type GuestRow } from '../domain/read.js';
import { callsOf, generateContent, textOf, toGeminiHistory, type GenerateFn, type HistoryRole } from './gemini.js';
import type { StoredPart, StoredTurn } from './history.js';
import { createResponse, openaiCallsOf, openaiTextOf, toOpenAIInput, toOpenAITools, type RespondFn } from './openai.js';
import { TOOL_NAMES, TOOL_DECLARATIONS, runTool, type ToolOutcome } from './tools.js';

/** Hard ceiling per (event, session) conversation, so one visitor cannot drain the AI budget. */
export const MAX_MESSAGES_PER_SCOPE = 60;

/** Calls beyond this in a single model round are answered as refused and never executed. */
export const MAX_TOOL_CALLS_PER_ROUND = 5;

const FALLBACK_TEXT =
  'No pude redactar una respuesta. Puedes seguir con los formularios de la pagina: asistencia, cotizacion y pago funcionan sin el asistente.';

/** Test seams: scripted models replacing each provider's HTTP round trip. */
export interface ChatProviders {
  generate?: GenerateFn | undefined;
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

export function geminiAdapter(config: GeminiConfig, instruction: string, generate: GenerateFn): ProviderAdapter {
  return {
    maxToolRounds: config.maxToolRounds,
    async round(history) {
      const output = await generate(config, {
        systemInstruction: instruction,
        history: toGeminiHistory(history),
        declarations: TOOL_DECLARATIONS,
      });
      return {
        turn: output.parts.length > 0 ? { role: 'model', parts: output.parts } : null,
        calls: callsOf(output.parts).map((c) => ({ ...(c.id ? { id: c.id } : {}), name: c.name, args: c.args, argsValid: true })),
        text: textOf(output.parts),
      };
    },
    responses(answers) {
      return {
        role: 'function',
        parts: answers.map(({ call, response }): StoredPart => ({
          functionResponse: { ...(call.id ? { id: call.id } : {}), name: call.name, response },
        })),
      };
    },
  };
}

export function openaiAdapter(config: OpenAIConfig, instruction: string, respond: RespondFn): ProviderAdapter {
  const tools = toOpenAITools(TOOL_DECLARATIONS);
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
): Promise<ConversationResult> {
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
      if (!TOOL_NAMES.has(call.name)) {
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
        // A domain refusal (expired quote, archived event, RSVP missing) is information for the
        // model, not a failed request.
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
  return [
    'Eres el asistente de FiestaPay, una demo que organiza encuentros y cobra cuotas con PayPal en sandbox.',
    `Solo puedes hablar del evento "${event.title}" (enlace ${event.slug}). Si preguntan por otro evento, explica que no tienes acceso.`,
    guest
      ? `Conversas con ${guest.name}, invitado de este evento.`
      : 'La persona todavia no se unio a la invitacion; invitala a unirse desde la pagina.',
    'Responde en espanol, breve y concreto.',
    'Reglas que no puedes romper:',
    '1. Los importes, el precio y el estado de pago vienen solo de las herramientas del servidor. Nunca inventes cifras ni las calcules de memoria.',
    '2. No puedes cobrar, aprobar ni confirmar pagos. Solo preparas una cotizacion y pides confirmacion explicita en la interfaz; el pago lo aprueba la persona en PayPal.',
    '3. Nunca afirmes que un pago quedo hecho. Si preguntan, consulta el estado con las herramientas y repite lo que digan.',
    '4. No cambias la asistencia por tu cuenta: propon el cambio con propose_rsvp y di que debe confirmarlo en la pagina.',
    '5. Si falta un dato del evento, di que el organizador no lo registro. No supongas menu, horarios ni expositores.',
    '6. Antes de una cotizacion repite la cuenta del servidor, por ejemplo "2 personas por $25,00, total $50,00. Confirmo?".',
    '7. Son pagos de prueba en el sandbox de PayPal; nunca prometas reservas reales ni servicios de terceros.',
  ].join('\n');
}

/** The selected provider only: a missing configuration is a 503, never a switch to the other one. */
function selectProvider(
  config: Config,
  providers: ChatProviders,
): { maxHistoryMessages: number; adapter: (instruction: string) => ProviderAdapter } {
  if (config.llmProvider === 'openai') {
    const openai = config.openai;
    if (!openai) throw unavailable(config.openaiDisabledReason ?? 'El asistente no esta configurado');
    const respond = providers.respond ?? createResponse;
    return { maxHistoryMessages: openai.maxHistoryMessages, adapter: (i) => openaiAdapter(openai, i, respond) };
  }
  const gemini = config.gemini;
  if (!gemini) throw unavailable(config.geminiDisabledReason ?? 'El asistente no esta configurado');
  const generate = providers.generate ?? generateContent;
  return { maxHistoryMessages: gemini.maxHistoryMessages, adapter: (i) => geminiAdapter(gemini, i, generate) };
}

async function loadHistory(pool: Pool, eventId: string, sessionId: string, limit: number): Promise<StoredTurn[]> {
  const { rows } = await pool.query<{ role: HistoryRole; parts: unknown }>(
    `SELECT role, parts FROM (
       SELECT id, role, parts FROM chat_messages
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

async function appendTurn(
  pool: Pool,
  eventId: string,
  sessionId: string,
  role: HistoryRole,
  parts: StoredPart[],
): Promise<void> {
  await pool.query('INSERT INTO chat_messages (event_id, session_id, role, parts) VALUES ($1,$2,$3,$4::jsonb)', [
    eventId,
    sessionId,
    role,
    JSON.stringify(parts),
  ]);
}

async function scopeMessageCount(pool: Pool, eventId: string, sessionId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM chat_messages
       WHERE event_id = $1 AND session_id = $2 AND role = 'user'`,
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
): Promise<ChatResult> {
  const provider = selectProvider(config, providers);

  const event = await getEventBySlug(pool, slug);
  assertActive(event);
  const guest = await findGuestBySession(pool, event.id, sessionId);

  if ((await scopeMessageCount(pool, event.id, sessionId)) >= MAX_MESSAGES_PER_SCOPE) {
    throw new HttpError(429, 'Alcanzaste el limite de mensajes del asistente en este evento');
  }

  const history = await loadHistory(pool, event.id, sessionId, provider.maxHistoryMessages);
  await reserveAiRequest(pool, sessionId, event.id);
  const userTurn: StoredTurn = { role: 'user', parts: [{ text: message }] };
  await appendTurn(pool, event.id, sessionId, 'user', userTurn.parts);
  await audit(pool, event.id, 'chat_message');
  history.push(userTurn);

  const result = await converse(
    provider.adapter(systemInstruction(event, guest)),
    history,
    (name, args) => runTool({ pool, sessionId, event, guest, quoteTtlSeconds: config.quoteTtlSeconds }, name, args),
    (turn) => appendTurn(pool, event.id, sessionId, turn.role, turn.parts),
  );

  const freshGuest = guest ? await loadGuest(pool, guest, event) : undefined;
  return {
    text: result.text.length > 0 ? result.text : FALLBACK_TEXT,
    ...(result.quote ? { quote: result.quote } : {}),
    ...(freshGuest ? { guest: freshGuest } : {}),
    ...(result.actions.length > 0 ? { actions: result.actions } : {}),
  };
}
