import type { Config } from '../config.js';
import type { Pool } from '../db/pool.js';
import { unavailable } from '../errors.js';
import { claimsSensitiveExecution } from './assistant-policy.js';
import { reserveAiRequest } from './budget.js';
import { openaiAdapter, type ModelRound, type ProviderAdapter } from './chat.js';
import { createResponse, type RespondFn } from './openai.js';

/** Public replies stay readable in the small drawer and bounded before they reach the browser. */
export const MAX_PUBLIC_REPLY_CHARS = 2000;

export const PUBLIC_CHAT_UNAVAILABLE =
  'El chat público no está disponible en este momento. Tu pregunta no obtuvo respuesta. Puedes reintentar manualmente o continuar con los formularios y el panel; la recuperación del organizador sigue disponible cuando está configurada.';

/** Test seam: a scripted model replaces the OpenAI HTTP round trip. */
export interface PublicChatProviders {
  respond?: RespondFn | undefined;
}

/**
 * A general, informational prompt. It intentionally has no event, guest or organizer facts:
 * the public channel cannot read private state and receives one question per request.
 */
export const PUBLIC_CHAT_INSTRUCTION = [
  'Eres el asistente público e informativo de FiestaPay. Respondes en español claro, breve y útil.',
  'Este chat es general y separado de cualquier evento o del panel del organizador. No tienes acceso a eventos, invitados, pagos, cuentas, claves ni historiales, y no debes dar por hechos datos de una invitación concreta.',
  'FiestaPay es una demo que usa PayPal Sandbox: los pagos son de prueba y no hay dinero real. El flujo general es crear una invitación, compartir su enlace, unirse con un alias, confirmar asistencia y pagar una cuota fija con PayPal sandbox. El organizador ve el avance del financiamiento y una tabla de invitados que usa AG Grid como muestra de visualización.',
  'La recuperación del acceso del organizador depende del correo opcional configurado en el panel y del enlace /recover. Si el correo no está configurado, conserva el enlace de organizador; no prometas una recuperación por correo que el servidor no ofrece.',
  'No creas ni modificas eventos, asistencias, pagos, reembolsos ni reservas. No ejecutas acciones y no tienes herramientas. Nunca afirmes que algo se confirmó, pagó, reembolsó, canceló o eliminó.',
  'Privacidad: esta conversación existe solo en la ventana abierta. Tus consultas se procesan con OpenAI para responder. El servidor guarda metadatos de consumo (sesión y presupuesto compartido), no el contenido de tus mensajes públicos. No afirmes que la retención del proveedor sea cero.',
  'No pidas tarjeta, contraseña, claves ni datos personales. Si piden datos de otra persona o secretos, niégate. No prometas servicios de terceros, reservas reales ni resultados financieros.',
].join('\n');

function isPublicAnswerSafe(text: string): boolean {
  return !claimsSensitiveExecution(text);
}

/** Reuses the existing OpenAI adapter, config and low reasoning; no tools are declared. */
export async function chatPublic(
  pool: Pool,
  config: Config,
  sessionId: string,
  message: string,
  providers: PublicChatProviders = {},
): Promise<{ text: string }> {
  const openai = config.openai;
  if (!openai) throw unavailable(config.openaiDisabledReason ?? PUBLIC_CHAT_UNAVAILABLE);

  // Reservation is before any provider construction or HTTP. The public channel shares the
  // same advisory lock, UTC daily total and per-session ceiling as guest and organizer chat.
  await reserveAiRequest(pool, sessionId, null);

  const respond = providers.respond ?? createResponse;
  const adapter: ProviderAdapter = openaiAdapter(openai, PUBLIC_CHAT_INSTRUCTION, respond, []);
  let round: ModelRound;
  try {
    round = await adapter.round([{ role: 'user', parts: [{ text: message }] }]);
  } catch {
    // Provider failures are never turned into a fabricated assistant answer.
    throw unavailable(PUBLIC_CHAT_UNAVAILABLE);
  }

  if (round.calls.length > 0) throw unavailable(PUBLIC_CHAT_UNAVAILABLE);
  const text = round.text.trim();
  if (text.length === 0 || !isPublicAnswerSafe(text)) throw unavailable(PUBLIC_CHAT_UNAVAILABLE);

  return { text: text.slice(0, MAX_PUBLIC_REPLY_CHARS) };
}
