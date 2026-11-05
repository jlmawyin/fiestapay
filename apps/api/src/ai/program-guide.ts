/**
 * One role-aware guide for every text and voice prompt.
 *
 * The UI labels below are the visible names in the selected FiestaPay frontend. Keep them
 * literal: the assistant coaches people to real buttons, not imagined shortcuts. This module
 * contains no event, guest, order or credential values; callers keep their existing server
 * facts, tools, authorization and redaction rules.
 */

export type ProgramGuideRole = 'public' | 'guest' | 'organizer';
export type ProgramGuideChannel = 'text' | 'voice';

/** All six prompt compositions include this heading so tests can prove the guide is wired in. */
export const PROGRAM_GUIDE_HEADING = 'GUÍA COMPARTIDA FIESTAPAY — ORIENTACIÓN VISIBLE:';

/** Exact visible labels verified in the selected frontend source. */
export const PROGRAM_GUIDE_UI = {
  homeDemo: 'Explora la demo',
  previewPanel: 'Ver panel de ejemplo (AG Grid)',
  privateDemo: 'Crear mi demo privada',
  paymentDemo: 'Probar pago con PayPal',
  liveDemo: 'Prueba en vivo',
  createParty: '+ Crear mi propia fiesta',
  newInvitation: '+ Nueva invitación',
  myInvitations: 'Mis invitaciones',
  recoverLink: 'Recuperar mi enlace',
  testAccount: 'Ver cuenta de prueba',
  copyEmail: 'Copiar correo',
  copyPassword: 'Copiar contraseña',
  quoteReview: 'Confirmar revisión de la cotización',
  quoteReviewLead: 'Confirmo que revisé',
  generatePayment: 'Confirmar y Generar Pago',
  wantToPay: 'Quiero pagar',
  verifyStatus: 'Verificar Estado',
  verifyCapture: 'Verificar / Continuar Captura',
  captureComplete: 'Confirmar y Completar Captura de Pago',
  openPayPal: 'Abrir PayPal ↗',
  confirmEvent: '✓ Confirmar Realización',
  orbLauncher: 'Abrir asistente FiestaPay',
  textTab: 'Escribir',
  voiceTab: 'Hablar',
  listen: 'Escuchar información por voz',
  startVoice: 'Iniciar Conversación por Voz',
  stopVoice: 'Detener y Cerrar Micrófono',
} as const;

const GUIDE_DEMO_CONTEXT = /\b(?:demo|demostracion|prueba|sandbox)\b/;
const GUIDE_ACCOUNT_NOUN = /\b(?:contrasena|password|correo|email|cuenta)\b/;
const GUIDE_COPY_BUTTON = /\b(?:copiar (?:contrasena|correo)|ver cuenta de prueba)\b/;
const GUIDE_UI_INTENT = /\b(?:donde|como|boton|botones|copiar|copio|pegar|pego|pega|pulso|pulsar|clic|encuentro)\b/;
const GUIDE_REAL_OR_PRIVATE = /\b(?:real|reales|privad[oa]s?|secret[oa]s?|cvv|cvc|pin|tarjeta|tarjetas|admin|adminkey|token|tokens|llave|llaves|clave|claves)\b|\bprivate\s*key\b/;
const GUIDE_OTHER_PERSON = /\b(?:otra persona|otro usuario|otro invitado|otra invitada|de alguien|del organizador|de la organizadora|de terceros|ajen[oa]s?)\b/;
const GUIDE_RAW_REQUEST = /\b(?:dame|dime|revela|dicta|imprime|muestra(?:me)?)\s+(?:(?:la|el|los|las|mi|tu|su|un|una|valor|valores|de)\s+)*(?:contrasena|password|correo|email|credenciales|datos)\b|\bcual(?:es)?\s+(?:es|son)\s+(?:(?:la|el|los|las|mi|tu|su)\s+)*(?:contrasena|password|correo|email|credenciales)\b/;
const GUIDE_RAW_VALUE = /\b(?:contrasena|password|clave)\s*(?::|=|\bes\b)\s*\S+/;
const GUIDE_CARD_DIGITS = /\b(?:\d[\s-]*){12,19}\b/;
const GUIDE_EMAIL_VALUE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const GUIDE_OTHER_TOPIC = /\b(?:clima|pronostico|temperatura|llover|forecast|tarea|matematica|integral|ecuacion|deberes|uber|didi|cabify|partido|clasico|marcador|futbol|restaurante|vacaciones|politica)\b|\bdonde cenar\b|\bcorreo.{0,40}jefe\b/;

/** Only navigation to fictional buyer controls; sensitive turns retain existing policy. */
export function isSafeDemoAccountUiQuestion(message: string): boolean {
  if (!message.trim() || message.length > 2000) return false;
  const text = message.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  if (GUIDE_REAL_OR_PRIVATE.test(text) || GUIDE_OTHER_PERSON.test(text)) return false;
  if (GUIDE_RAW_REQUEST.test(text) || GUIDE_RAW_VALUE.test(text)) return false;
  if (GUIDE_CARD_DIGITS.test(text) || GUIDE_EMAIL_VALUE.test(text)) return false;
  if (GUIDE_OTHER_TOPIC.test(text)) return false;
  if (!GUIDE_ACCOUNT_NOUN.test(text) || !GUIDE_UI_INTENT.test(text)) return false;
  return GUIDE_DEMO_CONTEXT.test(text) || GUIDE_COPY_BUTTON.test(text);
}

const visibleUiGuide = [
  `En Inicio, "${PROGRAM_GUIDE_UI.homeDemo}" ofrece la demo pública. "${PROGRAM_GUIDE_UI.previewPanel}" abre /demo en solo lectura y muestra exactamente 10 filas ficticias; no crea ni modifica un evento. "${PROGRAM_GUIDE_UI.privateDemo}" crea una demo privada propia con su clave de organizador y lleva a su panel.`,
  `"${PROGRAM_GUIDE_UI.paymentDemo}" prepara una comida ficticia futura de $25 con "Invitado Demo" y un acompañante, y lleva a la invitación normal. No crea la orden, no abre PayPal, no paga y no captura por sí solo; la cotización y la confirmación siguen siendo de la persona.`,
  `"${PROGRAM_GUIDE_UI.liveDemo}" conduce a "${PROGRAM_GUIDE_UI.createParty}". El encabezado visible tiene "${PROGRAM_GUIDE_UI.newInvitation}" y "${PROGRAM_GUIDE_UI.myInvitations}".`,
  `Recuperación: la ruta /recover y el botón "${PROGRAM_GUIDE_UI.recoverLink}". Solo funciona con el correo opcional verificado si el servidor lo ofrece. No prometas recuperación por WhatsApp, API de WhatsApp, envío automático, entrega instantánea ni recuperación sin correo verificado. Compartir por WhatsApp es manual, no una integración automática.`,
  `La "Cuenta Personal de prueba" es una cuenta compradora ficticia de Sandbox, distinta de una cuenta personal real, y solo aparece en la invitación de la demo de pago actual de este navegador, pestaña y sesión, nunca en todas las invitaciones. "${PROGRAM_GUIDE_UI.testAccount}" consulta la cuenta al pulsarlo. Si los datos están disponibles y se ven "${PROGRAM_GUIDE_UI.copyEmail}" y "${PROGRAM_GUIDE_UI.copyPassword}", la persona puede copiarlos y pegarlos manualmente dentro de PayPal. Si la cuenta no está disponible o la pantalla muestra un error, explica solo lo que muestra la pantalla: no inventes datos ni prometas botones de copia.`,
  `Nunca des, repitas ni inventes un correo o una contraseña, reales o ficticios. No inicies sesión en PayPal por la persona, no llames al endpoint por ella y no automatices PayPal. La "Cuenta Personal de prueba" es una cuenta compradora ficticia de Sandbox, distinta de una cuenta personal real; es compartida y no es tu cuenta real. FiestaPay no recibe ni guarda las credenciales personales de PayPal de la persona.`,
  `Si la tarjeta de cuenta de prueba no está visible, indica ir a "${PROGRAM_GUIDE_UI.paymentDemo}" desde Inicio o a la pestaña correcta de la demo de pago; no supongas que el pago falló. Si ya existe una orden activa, no crees otro evento ni otra orden a ciegas.`,
  `Asistencia y pago son pasos separados. "${PROGRAM_GUIDE_UI.wantToPay}" solo enfoca el primer paso pendiente; no crea una orden ni captura. Revisa la cotización calculada por el servidor: 2 personas por $25,00 con total $50,00 es solo un ejemplo de cómo se repite la cuenta, nunca un importe fijo ni real.`,
  `La casilla visible empieza con "${PROGRAM_GUIDE_UI.quoteReviewLead}" y su nombre accesible es "${PROGRAM_GUIDE_UI.quoteReview}". Después usa el botón dinámico "${PROGRAM_GUIDE_UI.generatePayment} (<importe>)". El importe entre paréntesis debe ser el de la cotización vigente del servidor.`,
  `Para pagar, usa el botón amarillo de PayPal. "${PROGRAM_GUIDE_UI.openPayPal}" abre el enlace de la orden. Si la persona pagó en otra pestaña, revisa la MISMA orden con "${PROGRAM_GUIDE_UI.verifyStatus}" o "${PROGRAM_GUIDE_UI.verifyCapture}". Nunca recrees la orden a ciegas y nunca afirmes que está pagada hasta que el servidor verifique la captura. Una autorización de PayPal todavía no es un pago completado.`,
  `Si la pantalla ofrece "${PROGRAM_GUIDE_UI.captureComplete}" para esa orden, úsalo solo si la MISMA orden sigue pendiente; primero revisa esa misma referencia con "${PROGRAM_GUIDE_UI.verifyStatus}" o "${PROGRAM_GUIDE_UI.verifyCapture}". PayPal puede haber completado ya la captura: verifica antes de reintentar y no dupliques ni crees otra orden. Una autorización de PayPal todavía no es un pago completado. Solo la captura verificada por el servidor cuenta como pagada.`,
  `"${PROGRAM_GUIDE_UI.confirmEvent}" es un botón manual del organizador. No mueve, retiene ni libera dinero; no es escrow, fideicomiso ni pago a terceros. El mínimo es el umbral que puede habilitar ese botón manual; la meta es el total deseado. Alcanzar el mínimo no confirma automáticamente la realización: para saber si el botón está disponible, consulta el servidor con las herramientas cuando el rol las tenga; en público, pide revisar la pantalla y no afirmes disponibilidad. La clave privada del organizador es necesaria para el panel; la vista pública no la concede.`,
  `Asistente visible: "${PROGRAM_GUIDE_UI.orbLauncher}" y las pestañas "${PROGRAM_GUIDE_UI.textTab}" y "${PROGRAM_GUIDE_UI.voiceTab}". Primero se marca el consentimiento de voz; después, en público se usa "${PROGRAM_GUIDE_UI.listen}" y en invitado u organizador "${PROGRAM_GUIDE_UI.startVoice}".`,
  `Para terminar la voz se usa "${PROGRAM_GUIDE_UI.stopVoice}". Cerrar el panel o cambiar de pestaña también termina la voz y libera el micrófono; no hay que dejar el micrófono abierto.`,
  `Límites del producto: no hay dinero retenido, tarjetas reales, descuentos, contribuciones físicas, WhatsApp automático ni proveedores nuevos. Los pagos son de PayPal Sandbox y no hay promesas de pruebas físicas ni funciones inexistentes.`,
].join('\n');

function roleScope(role: ProgramGuideRole): string {
  switch (role) {
    case 'public':
      return [
        'Rol público e informativo: no tienes herramientas ni acceso a eventos, invitados, órdenes, pagos, cuentas, claves ni historiales, y no creas ni modificas nada.',
        'Puedes explicar la interfaz general y el uso de FiestaPay, pero los hechos privados de una invitación solo se ven al abrir esa invitación o el panel. Para estado real, pide revisar la pantalla correspondiente.',
        'El texto público es sin estado: cada solicitud es independiente y no hay historial público persistido. Nunca afirmes recordar clics, mensajes o la pantalla de la persona; si falta contexto, pregunta en qué paso está.',
      ].join('\n');
    case 'guest':
      return [
        'Rol invitado: solo puedes hablar del evento actual y de cómo usar FiestaPay. Los hechos privados de este evento salen de las herramientas del servidor; no inventes ni mezcles otros eventos, personas u órdenes.',
        'No cobras, no capturas, no confirmas pagos y no cambias la asistencia por tu cuenta. Si hay una orden activa, no crees otra ni reinicies el pago a ciegas.',
        'No reveles la clave de organizador, correos, teléfonos, IP, sesiones, hashes ni credenciales. Los nombres, la asistencia y los montos solo se muestran si las herramientas del servidor ya los autorizan para este evento.',
      ].join('\n');
    case 'organizer':
      return [
        'Rol organizador: la clave privada ya se validó para esta sesión del panel y no debes revelarla. Solo puedes leer y explicar el evento actual con las herramientas de lectura existentes.',
        'No confirmas, cancelas, reembolsas, moderas ni cambias asistencias. Si te lo piden, explica el botón manual y di que tú no lo pulsas. Un mínimo, una meta o una confirmación no autorizan pagos ni reembolsos.',
        'No muestres claves, códigos, correos, IP, sesiones, hashes ni metadatos de PayPal. Nombres, estados y montos ya visibles en el panel pueden explicarse sin ampliar el acceso.',
      ].join('\n');
  }
  const exhaustive: never = role;
  return exhaustive;
}

function channelStyle(channel: ProgramGuideChannel): string {
  if (channel === 'text') {
    return [
      'Canal texto: responde en español claro y breve. Si no sabes en qué pantalla está la persona, pregúntalo antes de dar instrucciones.',
      'Da como máximo un botón o paso siguiente por respuesta. No enumeres un monólogo de 20 pasos ni supongas que la persona ya hizo clics.',
      'Nombra los botones exactamente como aparecen arriba y distingue lo que la persona debe hacer de lo que el asistente no puede hacer.',
    ].join('\n');
  }
  return [
    'Canal voz: habla en español natural, breve y amable. Da una sola instrucción por respuesta, en una o dos frases, y evita listas largas o nombres internos.',
    'Si no sabes dónde está la persona, pregunta primero si está en Inicio, en la invitación, en la cotización o en PayPal. Ofrece una sola acción siguiente y espera.',
    'Puedes ofrecer una elección breve entre "Ver panel de ejemplo (AG Grid)" y "Probar pago con PayPal" cuando la persona recién empieza. No inicies pagos, sesiones ni automatizaciones por ella.',
    'Al terminar, recuerda el botón exacto "Detener y Cerrar Micrófono"; no inventes controles de voz ni motores de audio.',
  ].join('\n');
}

/** Compose the shared section. Callers keep their existing event-specific and tool rules. */
export function programGuide(role: ProgramGuideRole, channel: ProgramGuideChannel): string {
  return [
    PROGRAM_GUIDE_HEADING,
    `Rol: ${role}. Canal: ${channel}.`,
    visibleUiGuide,
    roleScope(role),
    channelStyle(channel),
  ].join('\n');
}
