import { defineCatalog } from '../catalog';

/**
 * Event chat assistant (ChatAssistant). Server history is rendered verbatim;
 * only the surrounding chrome, greeting, quote/action cards, and local errors
 * are translated. Spanish stays byte-identical.
 */
export const guestChatCatalog = defineCatalog({
  es: {
    greeting:
      '¡Hola! Soy tu asistente de FiestaPay para esta invitación. Puedes preguntarme sobre la cuota, sugerirme cambios de acompañantes o consultar dudas sobre la organización.',
    typing: 'El asistente está escribiendo…',
    openAssistant: 'Abrir asistente IA',
    closeAssistant: 'Cerrar asistente IA',
    chatShort: 'Chat',
    panelLabel: 'Panel del Asistente FiestaPay',
    title: 'Asistente FiestaPay',
    subtitle: 'Consulta sobre esta invitación',
    chatOff: 'Chat no disponible',
    closeChat: 'Cerrar chat',
    notice: 'Revisa tu cuota antes de abrir PayPal. Asistencia y pago se confirman por separado.',
    revokedBanner:
      'El organizador revoco el acceso de esta sesion. Puedes leer el historial; el formulario queda cerrado.',
    closedBanner:
      'Esta invitacion esta cerrada. Puedes leer el historial; no se envian mensajes nuevos.',
    disabledBox:
      '⚠️ El servicio de chat no está habilitado en este servidor. Puedes consultar la conversación previa pero las nuevas consultas están pausadas.',
    quoteTitle: '🧾 Propuesta de Cotización',
    quoteLine: (people: number) => `${people} personas • Saldo: `,
    reviewOnScreen: 'Revisar y Confirmar en Pantalla',
    rsvpTitle: '📋 Propuesta de Asistencia',
    suggestion: 'Sugerencia: ',
    attend: (total: number, word: string) => `Asistir (${total} ${word})`,
    decline: 'No asistir',
    maybe: 'Tal vez',
    confirmRsvp: 'Confirmar Asistencia',
    confirmedServer: '✓ Asistencia Confirmada en el Servidor',
    placeholder: 'Escribe un mensaje o pregunta...',
    composerAria: 'Mensaje para el asistente',
    refresh: 'Actualizar',
    send: 'Enviar',
    historyError: 'No se pudo leer el historial.',
    error503:
      'El proveedor de chat no está disponible en este momento (503). Todas las acciones manuales de esta invitación siguen totalmente funcionales.',
    errorGeneric: 'No se pudo obtener respuesta del asistente.',
    orgLoading: 'Cargando el saludo del servidor…',
    orgTitle: 'Asistente del organizador',
    orgSubtitle: 'Consulta el panel. No ejecuta cambios.',
    orgNotice: 'Solo lectura: el panel confirma, cierra o elimina. Este chat no lo hace.',
    orgKeyDead: 'La clave de organizador ya no autoriza este asistente. Usa el panel manual.',
    orgKeyInvalid: 'Clave de organizador invalida',
    org503:
      'El asistente no esta disponible (503). Usa el panel: editar, compartir y revisar invitados. Nada se confirmo ni se reembolso.',
  },
  en: {
    greeting:
      'Hi! I am your FiestaPay assistant for this invitation. You can ask me about the share, suggest companion changes, or ask about the organization.',
    typing: 'The assistant is typing…',
    openAssistant: 'Open AI assistant',
    closeAssistant: 'Close AI assistant',
    chatShort: 'Chat',
    panelLabel: 'FiestaPay assistant panel',
    title: 'FiestaPay assistant',
    subtitle: 'Ask about this invitation',
    chatOff: 'Chat unavailable',
    closeChat: 'Close chat',
    notice: 'Review your share before opening PayPal. Attendance and payment are confirmed separately.',
    revokedBanner:
      'The organizer revoked this session access. You can read the history; the form stays closed.',
    closedBanner:
      'This invitation is closed. You can read the history; no new messages are sent.',
    disabledBox:
      '⚠️ The chat service is not enabled on this server. You can read the previous conversation but new questions are paused.',
    quoteTitle: '🧾 Quote proposal',
    quoteLine: (people: number) => `${people} ${people === 1 ? 'person' : 'people'} • Balance: `,
    reviewOnScreen: 'Review and Confirm on Screen',
    rsvpTitle: '📋 Attendance proposal',
    suggestion: 'Suggestion: ',
    attend: (total: number, word: string) => `Attend (${total} ${word})`,
    decline: 'Not attending',
    maybe: 'Maybe',
    confirmRsvp: 'Confirm attendance',
    confirmedServer: '✓ Attendance confirmed on the server',
    placeholder: 'Write a message or question...',
    composerAria: 'Message for the assistant',
    refresh: 'Refresh',
    send: 'Send',
    historyError: 'Could not read the history.',
    error503:
      'The chat provider is not available right now (503). Every manual action on this invitation keeps working.',
    errorGeneric: 'Could not get an answer from the assistant.',
    orgLoading: 'Loading the server greeting…',
    orgTitle: 'Organizer assistant',
    orgSubtitle: 'Ask about the dashboard. It makes no changes.',
    orgNotice: 'Read-only: the dashboard confirms, closes, or deletes. This chat does not.',
    orgKeyDead: 'The organizer key no longer authorizes this assistant. Use the manual dashboard.',
    orgKeyInvalid: 'Invalid organizer key',
    org503:
      'The assistant is not available (503). Use the dashboard: edit, share, and review guests. Nothing was confirmed or refunded.',
  },
});
