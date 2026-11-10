import { UI_LABELS, type AssistantContext, type Locale } from '@fiestapay/shared';
import type { Config } from '../config.js';
import type { Pool } from '../db/pool.js';
import { HttpError, unavailable } from '../errors.js';
import { claimsSensitiveExecution } from './assistant-policy.js';
import { reserveAiRequest } from './budget.js';
import { assistantDeadline, assistantTimeoutError, isAbortLike, safeReason, withinDeadline } from './deadlines.js';
import { openaiCallsOf, openaiTextOf, withRespondSignal, type RespondFn } from './openai.js';
import { programGuide, publicPageContext } from './program-guide.js';
import { selectTextProvider, type TextProviderSelection } from './text-provider.js';

/** Public replies stay readable in the small drawer and bounded before they reach the browser. */
export const MAX_PUBLIC_REPLY_CHARS = 2000;

/** Visible text budget of the public chat; Gemini adds its own reasoning headroom separately. */
export const PUBLIC_CHAT_MAX_OUTPUT_TOKENS = 700;

const PUBLIC_CHAT_UNAVAILABLE_ES =
  'El chat público no está disponible en este momento. Tu pregunta no obtuvo respuesta. Puedes reintentar manualmente o continuar con los formularios y el panel; la recuperación del organizador sigue disponible cuando está configurada.';
const PUBLIC_CHAT_UNAVAILABLE_EN =
  'The public chat is not available right now. Your question received no answer. You can try again manually or continue with the forms and the panel; organizer recovery remains available when configured.';

export function publicChatUnavailable(locale: Locale = 'es'): string {
  return locale === 'en' ? PUBLIC_CHAT_UNAVAILABLE_EN : PUBLIC_CHAT_UNAVAILABLE_ES;
}

/** Spanish landing copy kept as a stable constant for older callers. */
export const PUBLIC_CHAT_UNAVAILABLE = PUBLIC_CHAT_UNAVAILABLE_ES;

/** Test seam: a scripted model replaces the OpenAI HTTP round trip. */
export interface PublicChatProviders {
  respond?: RespondFn | undefined;
  /** Shorter deadline for deterministic tests; production always uses 40 s. */
  deadlineMs?: number | undefined;
}

const PRODUCT_BASE_ES = [
  'Eres el asistente público e informativo de FiestaPay.',
  'Este chat es general y separado de cualquier evento o del panel del organizador. No tienes acceso a eventos, invitados, pagos, cuentas, claves ni historiales, y no debes dar por hechos datos de una invitación concreta.',
  'FiestaPay es una demo que usa PayPal Sandbox: los pagos son de prueba y no hay dinero real. El flujo general es crear una invitación, compartir su enlace, unirse con un alias, confirmar asistencia y pagar una cuota fija con PayPal sandbox. El organizador ve el avance del financiamiento y una tabla de invitados que usa AG Grid como muestra de visualización.',
  'La recuperación del acceso del organizador depende del correo opcional configurado en el panel y del enlace /recover. Si el correo no está configurado, conserva el enlace de organizador; no prometas una recuperación por correo que el servidor no ofrece.',
  'No creas ni modificas eventos, asistencias, pagos, reembolsos ni reservas. No ejecutas acciones y no tienes herramientas. Nunca afirmes que algo se confirmó, pagó, reembolsó, canceló o eliminó.',
  'Privacidad: este chat público es sin estado; cada solicitud es independiente y la conversación existe solo en la ventana abierta. Tus consultas se procesan con Gemini para responder. El servidor guarda metadatos de consumo (sesión y presupuesto compartido), no el contenido de tus mensajes públicos. No afirmes que la retención del proveedor sea cero.',
  'No pidas tarjeta, contraseña, claves ni datos personales. Si piden datos de otra persona o secretos, niégate. No prometas servicios de terceros, reservas reales ni resultados financieros.',
];

const PRODUCT_BASE_EN = [
  'You are the public, informational FiestaPay assistant.',
  'This chat is general and separate from any event or the organizer panel. You have no access to events, guests, payments, accounts, keys or histories, and you must not treat data from a specific invitation as fact.',
  'FiestaPay is a demo that uses PayPal Sandbox: payments are tests and no real money moves. The general flow is to create an invitation, share its link, join with an alias, confirm attendance and pay a fixed fee with PayPal sandbox. The organizer sees funding progress and a guest table that uses AG Grid as a visualization sample.',
  'Organizer access recovery depends on the optional email configured in the panel and the /recover link. If the email is not configured, keep the organizer link; do not promise an email recovery the server does not offer.',
  'You do not create or modify events, attendance, payments, refunds or bookings. You execute no actions and have no tools. Never claim that something was confirmed, paid, refunded, cancelled or deleted.',
  'Privacy: this public chat is stateless; each request is independent and the conversation exists only in the open window. Your questions are processed with Gemini to answer them. The server stores usage metadata (session and shared budget), not the content of your public messages. Do not claim the provider retention is zero.',
  'Do not ask for a card, password, keys or personal data. If someone asks for another person\'s data or secrets, refuse. Do not promise third-party services, real bookings or financial outcomes.',
];

/** Public chat has two contexts and shares one informational policy. No event data in either. */
export function publicChatInstruction(locale: Locale = 'es', context: AssistantContext = 'landing'): string {
  const base = locale === 'en' ? PRODUCT_BASE_EN : PRODUCT_BASE_ES;
  const L = UI_LABELS[locale];
  const textUi = locale === 'en'
    ? `Public text guide: the "${L.guidedTour}" is available in "${L.judgesDemo}". Button names quoted in this chat can be tapped to go to that element on screen; quote only labels that exist and never invent names or links. This chat still has no tools and cannot open pages or press anything itself.`
    : `Guía de texto pública: el "${L.guidedTour}" existe en "${L.judgesDemo}". Los nombres de botones citados entre comillas dobles en este chat se pueden tocar para ir a ese elemento de la pantalla; cita solo etiquetas que existan y no inventes nombres ni enlaces. Este chat sigue sin herramientas y no abre páginas ni pulsa nada por sí solo.`;
  return [
    ...base,
    publicPageContext(locale, context),
    programGuide('public', 'text', locale),
    textUi,
  ].join('\n');
}

/** Spanish landing prompt kept as a stable constant for older callers. */
export const PUBLIC_CHAT_INSTRUCTION = publicChatInstruction('es', 'landing');

function isPublicAnswerSafe(text: string): boolean {
  return !claimsSensitiveExecution(text);
}

/** Uses the configured text provider; no tools are declared and no history is replayed. */
export async function chatPublic(
  pool: Pool,
  config: Config,
  sessionId: string,
  message: string,
  providers: PublicChatProviders = {},
  options: { locale?: Locale; context?: AssistantContext } = {},
): Promise<{ text: string }> {
  const startedAt = Date.now();
  const signal = assistantDeadline(providers.deadlineMs);
  const locale = options.locale ?? 'es';
  const context = options.context ?? 'landing';
  const unavailableText = publicChatUnavailable(locale);
  // Provider selection happens before any budget reservation. A missing active provider
  // keeps its own reason (OpenAI or Gemini); only a configured provider can reach the network.
  const provider: TextProviderSelection = selectTextProvider(config, locale, providers.respond);

  // Reservation is before any provider construction or HTTP. The public channel shares the
  // same advisory lock, UTC daily total and per-session ceiling as guest and organizer chat.
  await reserveAiRequest(pool, sessionId, null);

  // The public drawer is small: cap visible tokens at 700 while the shared deadline still
  // bounds the whole request, retries included.
  const modelConfig = {
    ...provider.config,
    maxOutputTokens: Math.min(provider.config.maxOutputTokens, PUBLIC_CHAT_MAX_OUTPUT_TOKENS),
  };

  let output;
  try {
    output = await withinDeadline(
      signal,
      provider.respond(modelConfig, withRespondSignal({
        instructions: publicChatInstruction(locale, context),
        input: [{ role: 'user', content: message }],
        tools: [],
      }, signal)),
      locale,
      startedAt,
    );
  } catch (err) {
    if (isAbortLike(err, signal) || (err instanceof HttpError && err.logCause === 'timeout')) {
      throw assistantTimeoutError(locale, Date.now() - startedAt);
    }
    // Provider failures are never turned into a fabricated assistant answer.
    const cause = err instanceof HttpError && err.logCause ? err.logCause : 'unreadable';
    throw unavailable(unavailableText, {
      logCause: cause,
      elapsedMs: err instanceof HttpError && err.elapsedMs !== undefined ? err.elapsedMs : Date.now() - startedAt,
    });
  }

  if (output.status !== 'completed') {
    throw unavailable(unavailableText, {
      logCause: `incomplete_${safeReason(output.incompleteReason)}`,
      elapsedMs: Date.now() - startedAt,
    });
  }
  if (openaiCallsOf(output.items).length > 0) {
    throw unavailable(unavailableText, { logCause: 'tool_call', elapsedMs: Date.now() - startedAt });
  }
  const text = openaiTextOf(output.items).trim();
  if (text.length === 0) {
    throw unavailable(unavailableText, { logCause: 'empty', elapsedMs: Date.now() - startedAt });
  }
  if (!isPublicAnswerSafe(text)) {
    throw unavailable(unavailableText, { logCause: 'unsafe', elapsedMs: Date.now() - startedAt });
  }

  return { text: text.slice(0, MAX_PUBLIC_REPLY_CHARS) };
}
