import type { AssistantContext, Locale } from '@fiestapay/shared';
import { UI_LABELS, formatMoney } from '@fiestapay/shared';
import type { Config } from '../config.js';
import type { Pool } from '../db/pool.js';
import { unavailable } from '../errors.js';
import { claimsSensitiveExecution } from './assistant-policy.js';
import { reserveAiRequest } from './budget.js';
import { openaiCallsOf, openaiTextOf, type RespondFn } from './openai.js';
import { programGuide } from './program-guide.js';
import { selectTextProvider, type TextProviderSelection } from './text-provider.js';

/** Public replies stay readable in the small drawer and bounded before they reach the browser. */
export const MAX_PUBLIC_REPLY_CHARS = 2000;

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
  const L = UI_LABELS[locale];
  const perPerson = formatMoney(2500, locale);
  const base = locale === 'en' ? PRODUCT_BASE_EN : PRODUCT_BASE_ES;
  const landing = locale === 'en'
    ? [
      'Landing context: explain the product and how to create an invitation of your own.',
      `From the "/" home page, "${L.createInvitation}" goes to /create, "${L.judgesDemo}" opens /demo, "${L.myInvitations}" lists only the person's own invitations, "${L.newInvitation}" is in the header, "${L.languageSelector}" changes the language and "${L.recoverLink}" is on /recover with an optional verified email.`,
      'Do not describe the judge demo as if the person were already inside it; invite them to open it instead.',
    ].join('\n')
    : [
      'Contexto portada: explica el producto y cómo crear una invitación propia.',
      `Desde la portada "/", "${L.createInvitation}" lleva a /create, "${L.judgesDemo}" abre /demo, "${L.myInvitations}" lista solo las invitaciones propias, "${L.newInvitation}" está en la cabecera, "${L.languageSelector}" cambia el idioma y "${L.recoverLink}" está en /recover con correo opcional verificado.`,
      'No describas la demo para jueces como si la persona ya estuviera dentro; invítala a abrirla.',
    ].join('\n');
  const demo = locale === 'en'
    ? [
      'Demo context: guide the judge through the three steps of /demo without inventing results.',
      `Step 1: "${L.previewPanel}" shows 10 fictional read-only rows on the same page; it creates or modifies no event. Step 2: "${L.paymentDemo}" creates a fictional demo meal of ${perPerson} per person, joins as the fictional demo guest with one companion and opens the normal invitation; it does not create the order or pay by itself. Step 3: "${L.talkToAssistant}".`,
      `Also explain "${L.privateDemo}", "${L.myDemos}" and "${L.resetDemos}", which archives only this browser's demos and never touches own or other people's invitations. The "${L.sandboxBadge}" banner means fictional data and no real money.`,
    ].join('\n')
    : [
      'Contexto demo: guía al juez por los tres pasos de /demo sin inventar resultados.',
      `Paso 1: "${L.previewPanel}" muestra 10 filas ficticias de solo lectura en la misma página; no crea ni modifica ningún evento. Paso 2: "${L.paymentDemo}" crea una comida demo ficticia de ${perPerson} por persona, se une como el invitado demo ficticio con un acompañante y abre la invitación normal; no crea la orden ni paga por sí solo. Paso 3: "${L.talkToAssistant}".`,
      `Explica también "${L.privateDemo}", "${L.myDemos}" y "${L.resetDemos}", que archiva solo las demos de este navegador y nunca toca invitaciones propias ni ajenas. El banner "${L.sandboxBadge}" indica datos ficticios y ningún dinero real.`,
    ].join('\n');
  return [
    ...base,
    context === 'demo' ? demo : landing,
    programGuide('public', 'text', locale),
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
  const locale = options.locale ?? 'es';
  const context = options.context ?? 'landing';
  const unavailableText = publicChatUnavailable(locale);
  // Provider selection happens before any budget reservation. A missing active provider
  // keeps its own reason (OpenAI or Gemini); only a configured provider can reach the network.
  const provider: TextProviderSelection = selectTextProvider(config, locale, providers.respond);

  // Reservation is before any provider construction or HTTP. The public channel shares the
  // same advisory lock, UTC daily total and per-session ceiling as guest and organizer chat.
  await reserveAiRequest(pool, sessionId, null);

  let output;
  try {
    output = await provider.respond(provider.config, {
      instructions: publicChatInstruction(locale, context),
      input: [{ role: 'user', content: message }],
      tools: [],
    });
  } catch {
    // Provider failures are never turned into a fabricated assistant answer.
    throw unavailable(unavailableText);
  }

  if (output.status !== 'completed' || openaiCallsOf(output.items).length > 0) throw unavailable(unavailableText);
  const text = openaiTextOf(output.items).trim();
  if (text.length === 0 || !isPublicAnswerSafe(text)) throw unavailable(unavailableText);

  return { text: text.slice(0, MAX_PUBLIC_REPLY_CHARS) };
}
