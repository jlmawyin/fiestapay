import { defineCatalog } from '../catalog';

/**
 * Judges-demo panel "How FiestaPay uses PayPal and AI". Every claim is
 * sourced from the production code (apps/api/src/**) and docs
 * (DEVPOST_DRAFT.md, JUDGES.md, GEMINI.md, AI_TOOLS.md). Model and tool
 * names are exact as in the code. No Payouts, split, fund holding, or
 * invented figures.
 */
export const paypalAiCatalog = defineCatalog({
  es: {
    title: 'Cómo usa FiestaPay PayPal e IA',
    lead: 'Cada paso describe el código en producción y su documentación. Pagos en PayPal Sandbox, sin dinero real.',
    paypalTitle: 'PayPal: cobro verificado',
    paypalStep1: 'El servidor crea una orden Orders v2 con intent CAPTURE usando el importe del servidor en centavos enteros.',
    paypalStep2: 'La persona aprueba dentro de PayPal (sandbox); la app nunca inicia sesión ni aprueba por ella.',
    paypalStep3: 'El servidor captura y verifica la captura: receptor, importe y moneda deben coincidir.',
    paypalStep4: 'El webhook firmado se verifica con la API oficial de verificación de firma de PayPal.',
    paypalStep5: 'La captura, el webhook y la relectura convergen en un libro de pagos idempotente: una sola entrada por captura, sin duplicados.',
    paypalNote: 'Cuota fija por persona a un único receptor sandbox. Sin Payouts, split ni retención de fondos.',
    aiTitle: 'IA: Gemini explica y prepara, la persona aprueba',
    aiStep1: 'Voz en tiempo real con Gemini Live API (gemini-3.8-live, audio nativo): el navegador conecta con un token efímero de un solo uso y la clave nunca llega al navegador. La voz pública solo tiene la herramienta show_on_screen: abre páginas de FiestaPay y resalta botones, nunca pulsa.',
    aiStep2: 'Asistentes de texto por rol con gemini-3.5-flash: público sin herramientas, invitado (get_event_details, get_my_status, get_collection_progress, prepare_quote, propose_rsvp) y organizador (get_organizer_event_summary, get_funding_progress, get_guest_roster_summary, guide_organizer_action).',
    aiStep3: '«Crear en una frase» (POST /api/ai/draft-event) solo propone: el servidor calcula la cuota por persona y el organizador confirma.',
    aiStep4: 'Recordatorios redactados (POST /api/events/:slug/reminders/draft): borradores editables que el organizador envía a mano por WhatsApp.',
    aiStep5: 'Sugerencia de tema (POST /api/ai/suggest-presentation): solo describe la reunión, con respaldo por reglas si la IA no responde.',
    aiStep6: 'El agente del invitado prepara el pago (prepare_quote) y muestra la tarjeta «Aprobar en PayPal»; el estado queda «pendiente de aprobación» y nada cuenta como pagado sin captura verificada.',
    repoLabel: 'Código público',
    repoNote: 'FiestaPay es código abierto (MIT).',
  },
  en: {
    title: 'How FiestaPay uses PayPal and AI',
    lead: 'Every step describes the production code and its docs. PayPal Sandbox payments, no real money.',
    paypalTitle: 'PayPal: verified checkout',
    paypalStep1: 'The server creates an Orders v2 order with intent CAPTURE using the server amount in integer cents.',
    paypalStep2: 'The person approves inside PayPal (sandbox); the app never logs in or approves for them.',
    paypalStep3: 'The server captures and verifies the capture: receiver, amount, and currency must match.',
    paypalStep4: 'The signed webhook is verified with PayPal’s official signature-verification API.',
    paypalStep5: 'The capture call, the webhook, and the owner re-read converge into an idempotent payment ledger: one entry per capture, no duplicates.',
    paypalNote: 'Fixed share per person to a single sandbox receiver. No Payouts, split, or fund holding.',
    aiTitle: 'AI: Gemini explains and prepares, the person approves',
    aiStep1: 'Real-time voice with the Gemini Live API (gemini-3.8-live, native audio): the browser connects with a single-use ephemeral token and the key never reaches the browser. Public voice only has the show_on_screen tool: it opens FiestaPay pages and highlights buttons, never presses.',
    aiStep2: 'Role text assistants with gemini-3.5-flash: public with no tools, guest (get_event_details, get_my_status, get_collection_progress, prepare_quote, propose_rsvp), and organizer (get_organizer_event_summary, get_funding_progress, get_guest_roster_summary, guide_organizer_action).',
    aiStep3: '“Describe in one sentence” (POST /api/ai/draft-event) only proposes: the server computes the per-person share and the organizer confirms.',
    aiStep4: 'Drafted reminders (POST /api/events/:slug/reminders/draft): editable drafts the organizer sends by hand over WhatsApp.',
    aiStep5: 'Theme suggestion (POST /api/ai/suggest-presentation): only describes the gathering, with a rules fallback when AI is unavailable.',
    aiStep6: 'The guest agent prepares the payment (prepare_quote) and shows the “Approve in PayPal” card; the status stays “pending approval” and nothing counts as paid without a verified capture.',
    repoLabel: 'Public source code',
    repoNote: 'FiestaPay is open source (MIT).',
  },
});
