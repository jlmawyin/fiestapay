import { defineCatalog } from '../catalog';

/**
 * Event chat assistant (ChatAssistant). Server history is rendered verbatim;
 * only the surrounding chrome, greeting, quote/action cards, and local errors
 * are translated. FP-UX-2 renames the agent and adds about/thinking/enter keys.
 */
export const guestChatCatalog = defineCatalog({
  es: {
    greeting:
      '¡Hola! Soy tu Agente FiestaPay para esta invitación. Puedes preguntarme sobre la cuota, sugerirme cambios de acompañantes o consultar dudas sobre la organización.',
    aboutTitle: 'Sobre este chat',
    thinking: (secs: number) => `Pensando… ${secs} s`,
    openAssistant: 'Abrir asistente IA',
    closeAssistant: 'Cerrar asistente IA',
    chatShort: 'Chat',
    panelLabel: 'Panel del Agente FiestaPay',
    title: 'Agente FiestaPay',
    subtitle: 'Consulta sobre esta invitación',
    chatOff: 'Chat no disponible',
    closeChat: 'Cerrar chat',
    notice: 'Revisa tu cuota antes de abrir PayPal. Asistencia y pago se confirman por separado.',
    revokedBanner:
      'El organizador revoco el acceso de esta sesion. Puedes leer el historial; el formulario queda cerrado.',
    closedBanner:
      'Esta invitacion esta cerrada. Puedes leer el historial; no se envian mensajes nuevos.',
    disabledBox:
      'El servicio de chat no está habilitado en este servidor. Puedes consultar la conversación previa pero las nuevas consultas están pausadas.',
    quoteTitle: 'Propuesta de Cotización',
    quoteLine: (people: number) => `${people} personas • Saldo: `,
    reviewOnScreen: 'Revisar y Confirmar en Pantalla',
    rsvpTitle: 'Propuesta de Asistencia',
    suggestion: 'Sugerencia: ',
    attend: (total: number, word: string) => `Asistir (${total} ${word})`,
    decline: 'No asistir',
    maybe: 'Tal vez',
    confirmRsvp: 'Confirmar Asistencia',
    confirmedServer: 'Asistencia Confirmada en el Servidor',
    placeholder: 'Escribe un mensaje o pregunta...',
    composerLabel: 'Tu mensaje',
    composerAria: 'Mensaje para el asistente',
    refresh: 'Actualizar',
    send: 'Enviar',
    retry: 'Reintentar',
    notSent: 'No enviado',
    historyError: 'No se pudo leer el historial.',
    error429:
      'Se alcanzó el límite temporal de consultas (429). Tu pregunta no se respondió. Espera un minuto y pulsa «Reintentar».',
    error503:
      'El chat no está disponible en este momento (503). Pulsa Reintentar para volver a enviar tu mensaje.',
    errorTimeout:
      'El agente tardó demasiado. Tu pregunta no se procesó; pulsa «Reintentar».',
    errorGeneric: 'No se pudo obtener respuesta del asistente.',
    orgLoading: 'Cargando el saludo del servidor…',
    orgTitle: 'Agente del organizador',
    orgSubtitle: 'Consulta el panel. No ejecuta cambios.',
    orgNotice: 'Solo lectura: el panel confirma, cierra o elimina. Este chat no lo hace.',
    orgKeyDead: 'La clave de organizador ya no autoriza este asistente. Usa el panel manual.',
    orgKeyInvalid: 'Clave de organizador invalida',
    org503:
      'El asistente no esta disponible (503). Usa el panel: editar, compartir y revisar invitados. Nada se confirmo ni se reembolso.',
    enterSend: 'Enter envía',
    enterButtonOnly: 'Solo con el botón',
    enterHintSend: 'Enter envía · Mayús+Enter = nueva línea',
    enterHintButton: 'Enter hace nueva línea; envía con el botón',
    enterGroupLabel: 'Cómo se envía',
  },
  en: {
    greeting:
      'Hi! I am your FiestaPay agent for this invitation. You can ask me about the share, suggest companion changes, or ask about the organization.',
    aboutTitle: 'About this chat',
    thinking: (secs: number) => `Thinking… ${secs} s`,
    openAssistant: 'Open AI assistant',
    closeAssistant: 'Close AI assistant',
    chatShort: 'Chat',
    panelLabel: 'FiestaPay agent panel',
    title: 'FiestaPay agent',
    subtitle: 'Ask about this invitation',
    chatOff: 'Chat unavailable',
    closeChat: 'Close chat',
    notice: 'Review your share before opening PayPal. Attendance and payment are confirmed separately.',
    revokedBanner:
      'The organizer revoked this session access. You can read the history; the form stays closed.',
    closedBanner:
      'This invitation is closed. You can read the history; no new messages are sent.',
    disabledBox:
      'The chat service is not enabled on this server. You can read the previous conversation but new questions are paused.',
    quoteTitle: 'Quote proposal',
    quoteLine: (people: number) => `${people} ${people === 1 ? 'person' : 'people'} • Balance: `,
    reviewOnScreen: 'Review and Confirm on Screen',
    rsvpTitle: 'Attendance proposal',
    suggestion: 'Suggestion: ',
    attend: (total: number, word: string) => `Attend (${total} ${word})`,
    decline: 'Not attending',
    maybe: 'Maybe',
    confirmRsvp: 'Confirm attendance',
    confirmedServer: 'Attendance confirmed on the server',
    placeholder: 'Write a message or question...',
    composerLabel: 'Your message',
    composerAria: 'Message for the assistant',
    refresh: 'Refresh',
    send: 'Send',
    retry: 'Retry',
    notSent: 'Not sent',
    historyError: 'Could not read the history.',
    error429:
      'The temporary question limit was reached (429). Your question was not answered. Wait a minute and press “Retry”.',
    error503:
      'The chat provider is temporarily unavailable (503). Press Retry to send your message again.',
    errorTimeout:
      'The agent took too long. Your question was not processed; press “Retry”.',
    errorGeneric: 'Could not get an answer from the assistant.',
    orgLoading: 'Loading the server greeting…',
    orgTitle: 'Organizer agent',
    orgSubtitle: 'Ask about the dashboard. It makes no changes.',
    orgNotice: 'Read-only: the dashboard confirms, closes, or deletes. This chat does not.',
    orgKeyDead: 'The organizer key no longer authorizes this assistant. Use the manual dashboard.',
    orgKeyInvalid: 'Invalid organizer key',
    org503:
      'The assistant is not available (503). Use the dashboard: edit, share, and review guests. Nothing was confirmed or refunded.',
    enterSend: 'Enter sends',
    enterButtonOnly: 'Button only',
    enterHintSend: 'Enter sends · Shift+Enter = new line',
    enterHintButton: 'Enter adds a new line; send with the button',
    enterGroupLabel: 'How sending works',
  },
});
