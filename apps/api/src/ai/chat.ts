import type { ChatResult } from '@fiestapay/shared';
import type { Config } from '../config.js';
import type { Pool } from '../db/pool.js';
import { HttpError, unavailable } from '../errors.js';
import { audit } from '../domain/audit.js';
import { assertActive } from '../domain/events.js';
import { reserveAiRequest } from './budget.js';
import { findGuestBySession, getEventBySlug, loadGuest, type EventRow, type GuestRow } from '../domain/read.js';
import {
  callsOf,
  generateContent,
  textOf,
  type GenerateFn,
  type GeminiPart,
  type HistoryRole,
  type HistoryTurn,
} from './gemini.js';
import { TOOL_NAMES, TOOL_DECLARATIONS, runTool, type ToolOutcome } from './tools.js';

/** Hard ceiling per (event, session) conversation, so one visitor cannot drain the AI budget. */
export const MAX_MESSAGES_PER_SCOPE = 60;

const FALLBACK_TEXT =
  'No pude redactar una respuesta. Puedes seguir con los formularios de la pagina: asistencia, cotizacion y pago funcionan sin el asistente.';

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

async function loadHistory(pool: Pool, eventId: string, sessionId: string, limit: number): Promise<HistoryTurn[]> {
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
    parts: Array.isArray(row.parts) ? (row.parts as GeminiPart[]) : [],
  }));
}

async function appendTurn(
  pool: Pool,
  eventId: string,
  sessionId: string,
  role: HistoryRole,
  parts: GeminiPart[],
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
  generate: GenerateFn = generateContent,
): Promise<ChatResult> {
  const gemini = config.gemini;
  if (!gemini) throw unavailable(config.geminiDisabledReason ?? 'El asistente no esta configurado');

  const event = await getEventBySlug(pool, slug);
  assertActive(event);
  const guest = await findGuestBySession(pool, event.id, sessionId);

  if ((await scopeMessageCount(pool, event.id, sessionId)) >= MAX_MESSAGES_PER_SCOPE) {
    throw new HttpError(429, 'Alcanzaste el limite de mensajes del asistente en este evento');
  }

  const history = await loadHistory(pool, event.id, sessionId, gemini.maxHistoryMessages);
  await reserveAiRequest(pool, sessionId, event.id);
  const userTurn: HistoryTurn = { role: 'user', parts: [{ text: message }] };
  await appendTurn(pool, event.id, sessionId, 'user', userTurn.parts);
  await audit(pool, event.id, 'chat_message');
  history.push(userTurn);

  const instruction = systemInstruction(event, guest);
  let quote: ToolOutcome['quote'];
  const actions = new Set<string>();
  let text = '';

  for (let round = 0; round <= gemini.maxToolRounds; round += 1) {
    const output = await generate(gemini, {
      systemInstruction: instruction,
      history,
      declarations: TOOL_DECLARATIONS,
    });

    const calls = callsOf(output.parts);
    if (output.parts.length > 0) {
      history.push({ role: 'model', parts: output.parts });
      await appendTurn(pool, event.id, sessionId, 'model', output.parts);
    }

    if (calls.length === 0 || round === gemini.maxToolRounds) {
      text = textOf(output.parts);
      break;
    }

    const responses: GeminiPart[] = [];
    for (const call of calls) {
      if (!TOOL_NAMES.has(call.name)) {
        responses.push({
          functionResponse: { ...(call.id ? {id:call.id} : {}), name: call.name, response: { ok: false, motivo: 'Herramienta no disponible' } },
        });
        continue;
      }
      let outcome: ToolOutcome;
      try {
        outcome = await runTool(
          { pool, sessionId, event, guest, quoteTtlSeconds: config.quoteTtlSeconds },
          call.name,
          call.args,
        );
      } catch (err) {
        // A domain refusal (expired quote, archived event, RSVP missing) is information for the
        // model, not a failed request.
        const motivo = err instanceof HttpError ? err.message : 'No se pudo ejecutar la herramienta';
        outcome = { response: { ok: false, motivo } };
      }
      if (outcome.quote) quote = outcome.quote;
      for (const action of outcome.actions ?? []) actions.add(action);
      responses.push({ functionResponse: { ...(call.id ? {id:call.id} : {}), name: call.name, response: outcome.response } });
    }

    history.push({ role: 'function', parts: responses });
    await appendTurn(pool, event.id, sessionId, 'function', responses);
  }

  const freshGuest = guest ? await loadGuest(pool, guest, event) : undefined;
  return {
    text: text.length > 0 ? text : FALLBACK_TEXT,
    ...(quote ? { quote } : {}),
    ...(freshGuest ? { guest: freshGuest } : {}),
    ...(actions.size > 0 ? { actions: [...actions] } : {}),
  };
}
