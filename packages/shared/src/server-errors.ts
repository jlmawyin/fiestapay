import type { Locale } from './i18n.js';

/**
 * The API keeps answering `{ error: "<Spanish text>" }` exactly as before (backward compatible,
 * existing tests assert it). In English the web client translates that text here.
 *
 * SERVER_ERROR_EN maps every fixed Spanish message the API can send to English.
 * SERVER_ERROR_PATTERNS_EN covers messages with variable parts (numbers, field paths).
 * Anything unmapped falls back to a generic English message by HTTP status, never to Spanish.
 * An API test keeps this map in sync with the error literals in apps/api/src.
 */
export const SERVER_ERROR_EN: Readonly<Record<string, string>> = {
  // Global handler and helper defaults.
  'Sesion requerida': 'Your session is missing or expired. Reload the page and try again.',
  'No autorizado': 'You are not allowed to do this.',
  'No encontrado': 'We could not find what you were looking for.',
  'Error interno del servidor': 'Something went wrong on the server. Please try again.',
  'Solicitud invalida': 'The request is not valid. Please review the data and try again.',
  'Ruta no encontrada': 'We could not find that page.',
  'JSON invalido': 'The request body is not valid JSON.',
  'Origen no permitido': 'This origin is not allowed to send that request.',
  'Datos invalidos': 'The data is not valid.',
  'Sesion no encontrada': 'Your session was not found. Reload the page and try again.',

  // Events, access and funding.
  'Clave de organizador invalida': 'The organizer key is not valid.',
  'Codigo de acceso requerido': 'An access code is required.',
  'Este evento ya no esta disponible': 'This invitation is no longer available.',
  'Esta invitacion fue archivada por un reinicio de demo': 'This invitation was archived when the demo was reset.',
  'Esta invitacion fue archivada por un reinicio de demo; no se inician pagos nuevos':
    'This invitation was archived when the demo was reset, so new payments cannot start.',
  'Solo quien creo el evento puede emitir la primera clave':
    'Only the person who created the event can issue the first organizer key.',
  'Este evento ya tiene clave de organizador': 'This event already has an organizer key.',
  'El organizador cerro las nuevas asistencias y pagos': 'The organizer closed new RSVPs and payments.',
  'Aun no se alcanza el minimo para confirmar el evento':
    'The minimum has not been reached yet, so the event cannot be confirmed.',
  'El cupo no puede ser menor que las reservas confirmadas': 'Capacity cannot be lower than the confirmed reservations.',
  'No se pueden cambiar la cuota, la meta o el minimo cuando ya hay invitados o pagos':
    'The price, goal or minimum cannot change once there are guests or payments.',
  'No se pudo generar un enlace de invitacion unico': 'We could not generate a unique invitation link. Please try again.',
  'theme: Tema invalido para esta plantilla': 'theme: That theme is not valid for this template.',
  'Tema invalido para esta plantilla': 'That theme is not valid for this template.',

  // Input validation messages (zod custom messages and parse fallbacks).
  'Fecha invalida': 'The date is not valid.',
  'El minimo no puede superar la meta': 'The minimum cannot be higher than the goal.',
  'La hora de fin debe ser posterior al inicio': 'The end time must be after the start time.',
  'La fecha limite debe ser posterior a ahora y no posterior al inicio':
    'The deadline must be in the future and no later than the start time.',
  'Sin minimo no hay fecha limite de financiamiento': 'Without a minimum there is no funding deadline.',
  'El inicio debe ser en el futuro': 'The start time must be in the future.',
  'La cuota por el cupo debe cubrir la meta y el minimo':
    'The price times capacity must cover the goal and the minimum.',
  'Identificador de cotizacion invalido': 'The quote identifier is not valid.',
  'Slug invalido': 'The invitation link is not valid.',
  'Identificador invalido': 'The identifier is not valid.',
  'Cursor invalido': 'The page cursor is not valid.',
  'El cliente no puede fijar el estado de pago o de financiamiento':
    'The client cannot set the payment or funding state.',
  'Fecha limite invalida': 'The deadline is not valid.',
  'La fecha limite debe ser posterior a este momento': 'The deadline must be after this moment.',
  'La fecha limite no puede ser posterior al inicio': 'The deadline cannot be after the start time.',
  'La decision de financiamiento ya es definitiva': 'The funding decision is already final.',
  'No se pueden cambiar el minimo ni la fecha limite cuando ya hay una orden':
    'The minimum and deadline cannot change once an order exists.',
  'La fecha limite de financiamiento quedaria despues del inicio':
    'The funding deadline would fall after the start time.',
  'Un evento anterior conserva la exencion y no admite fecha limite':
    'An older event keeps its exemption and does not accept a deadline.',
  'Un minimo requiere fecha limite de financiamiento': 'A minimum requires a funding deadline.',
  'El minimo no se alcanzo a tiempo; no se inician cobros nuevos':
    'The minimum was not reached in time, so new charges cannot start.',
  'La fecha limite de financiamiento vencio; el cobro espera la decision':
    'The funding deadline passed, so the charge is waiting for the decision.',

  // Quotes, orders and captures.
  'Primero unete a la invitacion': 'Join the invitation first.',
  'Cotizacion no encontrada': 'We could not find that quote.',
  'La cotizacion ya no es valida; pide una nueva': 'That quote is no longer valid. Request a new one.',
  'La cotizacion expiro; pide una nueva': 'That quote expired. Request a new one.',
  'Tu asistencia cambio despues de esta cotizacion; pide una nueva':
    'Your RSVP changed after that quote. Request a new one.',
  'El importe cambio desde la cotizacion; pide una nueva': 'The amount changed since that quote. Request a new one.',
  'No hay saldo pendiente por pagar': 'There is no outstanding balance to pay.',
  'Tu pago anterior esta en verificacion con PayPal; espera a que se confirme':
    'Your previous payment is being verified by PayPal. Wait until it is confirmed.',
  'Tu pago esta en verificacion con PayPal; espera a que se confirme para cambiar tu asistencia':
    'Your payment is being verified by PayPal. Wait until it is confirmed before changing your RSVP.',
  'Tu pago dejo de ser valido mientras se creaba; pide una cotizacion nueva':
    'Your payment stopped being valid while it was being created. Request a new quote.',
  'Confirma tu asistencia antes de cotizar o pagar': 'Confirm your RSVP before requesting a quote or paying.',
  'PayPal no confirmo la creacion; vuelve a intentar el mismo pago':
    'PayPal did not confirm the creation. Try the same payment again.',
  'PayPal rechazo la creacion de la orden': 'PayPal rejected creating the order.',
  'Orden no encontrada': 'We could not find that order.',
  'Esta orden pertenece a otro invitado': 'That order belongs to another guest.',
  'La orden aun no se creo en PayPal; vuelve a intentarlo': 'The order has not been created in PayPal yet. Try again.',
  'El estado de la orden cambio; vuelve a consultarla': 'The order status changed. Check it again.',
  'PayPal no respondio a tiempo; el pago quedo en verificacion, consulta el estado de la orden':
    'PayPal did not answer in time. The payment is under verification; check the order status.',
  'PayPal no confirmó la captura; consulta el estado o reintenta esta misma orden':
    'PayPal did not confirm the capture. Check the status or retry this same order.',
  'PayPal aun no confirma la captura; consulta el estado de la orden':
    'PayPal has not confirmed the capture yet. Check the order status.',
  'Esta orden fue reemplazada; pide una cotizacion nueva': 'This order was replaced. Request a new quote.',
  'Tu asistencia cambio despues de esta orden; pide una cotizacion nueva':
    'Your RSVP changed after this order. Request a new quote.',
  'El organizador revoco el acceso de esta sesion': 'The organizer revoked access for this session.',
  'La orden tiene otra captura registrada; requiere conciliacion manual':
    'The order already has a different capture recorded and needs manual reconciliation.',
  'La orden aun no tiene identificador de PayPal': 'The order does not have a PayPal identifier yet.',
  'El receptor configurado no coincide con el de la orden':
    'The configured receiver does not match the order receiver.',
  'No hay captura registrada para ese reembolso': 'No capture is recorded for that refund.',

  // PayPal verification reasons.
  'Respuesta de PayPal sin orden': 'PayPal returned no order.',
  'La orden de PayPal no coincide': 'The PayPal order does not match.',
  'La orden no tiene exactamente una unidad de compra': 'The order does not have exactly one purchase unit.',
  'La orden no identifica al receptor': 'The order does not identify the receiver.',
  'El receptor de la orden no es el comercio configurado': 'The order receiver is not the configured merchant.',
  'La orden no corresponde a esta obligacion': 'The order does not match this obligation.',
  'La orden todavia no tiene una captura verificable': 'The order does not have a verifiable capture yet.',
  'La orden tiene varias capturas; requiere conciliacion manual':
    'The order has several captures and needs manual reconciliation.',
  'La captura no corresponde a esta obligacion': 'The capture does not match this obligation.',
  'Moneda de la captura incorrecta': 'The capture currency is wrong.',
  'Importe de la captura invalido': 'The capture amount is not valid.',
  'El importe capturado no coincide con la orden': 'The captured amount does not match the order.',
  'Reembolso sin identificador': 'The refund has no identifier.',
  'El reembolso aun no esta COMPLETED': 'The refund is not COMPLETED yet.',
  'Moneda del reembolso incorrecta': 'The refund currency is wrong.',
  'Importe del reembolso invalido': 'The refund amount is not valid.',
  'El reembolso no referencia una captura': 'The refund does not reference a capture.',
  'El reembolso no coincide con una captura registrada': 'The refund does not match a recorded capture.',
  'El reembolso supera lo capturado': 'The refund is larger than the captured amount.',

  // Moderation and RSVP.
  'La conversacion fue moderada y esa respuesta no se guardo':
    'The conversation was moderated and that reply was not saved.',
  'El pago esta en verificacion. La reserva se mantiene hasta que se concilie. Puedes bloquear ahora y reintentar la retirada cuando el pago quede cerrado.':
    'The payment is being verified. The reservation stays until it is reconciled. You can block now and retry the removal once the payment is settled.',
  'Asistencia retirada. El dinero ya capturado no se reembolsa automaticamente; el excedente queda para una conciliacion humana.':
    'RSVP removed. Money already captured is not refunded automatically; the excess is left for manual reconciliation.',
  'Asistencia retirada. No se movio ningun pago.': 'RSVP removed. No payment moved.',
  'La retirada no se deshace al desbloquear. El acceso sigue revocado.':
    'Unblocking does not undo a removal. Access stays revoked.',
  'Evento no encontrado': 'We could not find that event.',
  'Invitado no encontrado': 'We could not find that guest.',
  'Conversacion no encontrada': 'We could not find that conversation.',
  'Mensaje no encontrado': 'We could not find that message.',
  'Conversacion requerida': 'A conversation is required.',
  'El acceso ya estaba revocado. La asistencia y los pagos no cambiaron.':
    'Access was already revoked. RSVP and payments did not change.',
  'Acceso revocado. La asistencia y los pagos no cambiaron.': 'Access revoked. RSVP and payments did not change.',
  'Acceso restaurado. Un navegador nuevo sigue siendo otra sesion.':
    'Access restored. A new browser is still a different session.',
  'Esta persona ya estaba retirada.': 'This person was already removed.',
  'Esa sesion ya no puede unirse, escribir ni iniciar voz. No identifica a la persona en otro navegador.':
    'That session can no longer join, write or start voice. It does not identify the person in another browser.',
  'Sesion desbloqueada.': 'Session unblocked.',

  // Organizer recovery.
  'El correo de recuperacion no esta configurado': 'Email recovery is not configured.',
  'Demasiados intentos de correo. Espera antes de volver a solicitarlo.':
    'Too many email attempts. Wait before requesting another one.',
  'Correo invalido': 'The email is not valid.',
  'Enlace invalido': 'The link is not valid.',
  'El enlace no es valido. Solicita uno nuevo.': 'That link is not valid. Request a new one.',
  'Este enlace caduco. Solicita uno nuevo.': 'That link expired. Request a new one.',
  'Este enlace ya se uso. Solicita uno nuevo.': 'That link was already used. Request a new one.',
  'El servidor de salida rechazo el correo y no queda verificado':
    'The outgoing server rejected the email, so it is not verified.',
  'El envio no confirmo a tiempo. Si no llega, solicita otro enlace':
    'The delivery did not confirm in time. If it does not arrive, request another link.',
  'No se pudo enviar el correo de verificacion': 'We could not send the verification email.',

  // Assistant (text and voice) budgets and providers.
  'El asistente no esta configurado': 'The assistant is not configured.',
  'El asistente no respondio a tiempo; usa los formularios de la pagina':
    'The assistant did not answer in time. Use the forms on the page.',
  'El asistente devolvio una respuesta ilegible': 'The assistant returned an unreadable answer.',
  'El asistente no pudo completar la respuesta; usa los formularios de la pagina':
    'The assistant could not complete the answer. Use the forms on the page.',
  'El agente tardó demasiado en responder. Tu pregunta no se procesó; puedes reintentar.':
    'The agent took too long to respond. Your question was not processed; you can try again.',
  'Se alcanzó el límite de consultas IA; continúa con el formulario':
    'The AI request limit was reached. Continue with the form.',
  'Alcanzaste el limite de mensajes del asistente en este evento':
    'You reached the assistant message limit for this event.',
  'El chat público no está disponible en este momento. Tu pregunta no obtuvo respuesta. Puedes reintentar manualmente o continuar con los formularios y el panel; la recuperación del organizador sigue disponible cuando está configurada.':
    'The public chat is not available right now. Your question did not get an answer. You can retry manually or continue with the forms and the dashboard; organizer recovery stays available when it is configured.',
  'La voz no está habilitada': 'Voice is not enabled.',
  'Únete con un alias antes de iniciar la voz': 'Join with an alias before starting voice.',
  'Herramienta o sesión de voz no autorizada': 'That voice tool or session is not authorized.',
  'Reserva de voz inválida': 'The voice reservation is not valid.',
  'Duración de voz inválida': 'The voice duration is not valid.',
  'Ya tienes una sesión de voz activa. Espera a que termine o pulsa Detener.':
    'You already have an active voice session. Wait for it to end or press Stop.',
  'Has iniciado demasiadas sesiones de voz. Espera un minuto antes de intentarlo otra vez.':
    'You started too many voice sessions. Wait a minute before trying again.',
  'Se alcanzó el límite diario de voz; continúa por texto.': 'The daily voice limit was reached. Continue by text.',
  'Sesión de voz no encontrada': 'We could not find that voice session.',
  'No se pudo iniciar la voz. Continúa por texto': 'Voice could not start. Continue by text.',
  'El proveedor de voz no está disponible': 'The voice provider is not available.',
  'El proveedor no entregó una sesión de voz': 'The voice provider did not return a voice session.',

  // PayPal webhook and configuration reasons.
  'PayPal no esta configurado en este servidor': 'PayPal is not configured on this server.',
  'PAYPAL_WEBHOOK_ID no esta configurado': 'PAYPAL_WEBHOOK_ID is not configured.',
  'Cuerpo vacio': 'The request body is empty.',
  'Webhook sin id o tipo': 'The webhook has no id or type.',
  'Firma de webhook invalida': 'The webhook signature is not valid.',
  'Notificacion aun no aplicable; reintenta': 'The notification cannot be applied yet. Retry.',
  'PAYPAL_BASE_URL invalida': 'PAYPAL_BASE_URL is not valid.',
  'PAYPAL_BASE_URL debe apuntar al sandbox de PayPal': 'PAYPAL_BASE_URL must point to the PayPal sandbox.',
  'Falta PUBLIC_ORIGIN para los enlaces de recuperacion': 'PUBLIC_ORIGIN is missing for recovery links.',
  'SMTP_PORT invalido': 'SMTP_PORT is not valid.',
  'SMTP_HOST invalido': 'SMTP_HOST is not valid.',
  'SMTP_USER invalido': 'SMTP_USER is not valid.',
  'SMTP_PASS invalido': 'SMTP_PASS is not valid.',
  'EMAIL_FROM invalido': 'EMAIL_FROM is not valid.',
  'El asistente no esta configurado: falta OPENAI_API_KEY':
    'The assistant is not configured: OPENAI_API_KEY is missing.',
  'El asistente no esta configurado: falta GEMINI_API_KEY':
    'The assistant is not configured: GEMINI_API_KEY is missing.',
  'El asistente no esta configurado: falta GEMINI_API_KEY o VERTEX_API_KEY':
    'The assistant is not configured: GEMINI_API_KEY or VERTEX_API_KEY is missing.',
  'GEMINI_TEXT_BACKEND invalido: solo se admite developer o vertex':
    'GEMINI_TEXT_BACKEND is not valid: only developer or vertex is accepted.',
  'VERTEX_LOCATION invalida: usa solo minusculas, numeros y guiones':
    'VERTEX_LOCATION is not valid: use only lowercase letters, numbers and hyphens.',
  'VERTEX_PROJECT_ID invalido: usa un id de proyecto o un numero de proyecto de Google Cloud':
    'VERTEX_PROJECT_ID is not valid: use a Google Cloud project id or project number.',
  'OPENAI_BASE_URL debe usar https': 'OPENAI_BASE_URL must use https.',
  'OPENAI_BASE_URL invalida': 'OPENAI_BASE_URL is not valid.',

  // Webhook retry reasons (logged; kept translated so they never leak Spanish if surfaced).
  'notificacion de captura sin referencia de orden': 'capture notification without an order reference',
  'orden desconocida todavia': 'order unknown yet',
  'reembolso aun no aplicable': 'refund not applicable yet',
};

export interface ServerErrorPattern {
  pattern: RegExp;
  to: (match: RegExpMatchArray) => string;
}

export const SERVER_ERROR_PATTERNS_EN: readonly ServerErrorPattern[] = [
  {
    // Seat counts change per request; the field path may be prefixed by parseOr400.
    pattern: /^(?:[\w.]+: )?Cupo insuficiente: quedan (\d+) plazas y pediste (\d+)$/,
    to: (match) => `Not enough seats: ${match[1]} left and you requested ${match[2]}.`,
  },
  {
    pattern: /^El asistente no esta disponible \(proveedor respondio (\d+)\)$/,
    to: (match) => `The assistant is not available right now (provider answered ${match[1]}).`,
  },
  {
    // Environment variable names are dynamic and must stay visible verbatim.
    pattern: /^Falta configuracion de PayPal: (.+)$/,
    to: (match) => `PayPal is missing configuration: ${match[1]}.`,
  },
  {
    pattern: /^Falta configuracion de correo: (.+)$/,
    to: (match) => `Email is missing configuration: ${match[1]}.`,
  },
  {
    // parseOr400 prefixes `field: `; translate the message and keep the field path.
    pattern: /^([a-z][A-Za-z0-9_.]*): (.+)$/,
    to: (match) => `${match[1]}: ${translateServerError(match[2]!, 400, 'en')}`,
  },
];

export function genericServerErrorEn(status: number): string {
  if (status === 400) return 'The request is not valid. Please review the data and try again.';
  if (status === 401) return 'Your session is missing or expired. Reload the page and try again.';
  if (status === 403) return 'You are not allowed to do this.';
  if (status === 404) return 'We could not find what you were looking for.';
  if (status === 408) return 'The server took too long to answer. Please try again.';
  if (status === 409) return 'Something changed in the meantime. Reload and try again.';
  if (status === 410) return 'This invitation is no longer available.';
  if (status === 429) return 'Too many requests. Please wait a moment and try again.';
  if (status === 502 || status === 503) return 'The service is temporarily unavailable. Please try again shortly.';
  if (status === 504) return 'The server took too long to answer. Please try again.';
  return 'Something went wrong on the server. Please try again.';
}

/** Spanish is returned untouched. English never shows Spanish server text. */
export function translateServerError(message: string, status: number, locale: Locale): string {
  if (locale === 'es') return message;
  const exact = SERVER_ERROR_EN[message];
  if (exact) return exact;
  for (const { pattern, to } of SERVER_ERROR_PATTERNS_EN) {
    const match = message.match(pattern);
    if (match) return to(match);
  }
  return genericServerErrorEn(status);
}
