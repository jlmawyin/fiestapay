import { defineCatalog } from '../catalog';

/** Public chat assistant. FP-UX-2 shortens the welcome and adds about/thinking/enter keys. */
export const chatCatalog = defineCatalog({
  es: {
    welcome: 'Hola, soy el Agente FiestaPay. Pregúntame cómo funciona FiestaPay.',
    quickHelp1: '¿Cómo funciona FiestaPay?',
    quickHelp2: '¿Qué significa pagar en PayPal Sandbox?',
    quickHelp3: '¿Cómo recupera el organizador su acceso?',
    privacy:
      'La conversación vive solo en esta pestaña abierta: al recargar o en una ventana nueva empieza vacía y aquí no se guarda historial. El servidor conserva metadatos de consumo, no el contenido de tus mensajes públicos. OpenAI procesa tus consultas para responder; no afirmamos que su retención sea cero.',
    privacyGemini:
      'La conversación vive solo en esta pestaña abierta: al recargar o en una ventana nueva empieza vacía y aquí no se guarda historial. El servidor conserva metadatos de consumo, no el contenido de tus mensajes públicos. Gemini procesa tus consultas para responder; no afirmamos que su retención sea cero.',
    openLabel: 'Abrir chat de FiestaPay',
    closeLabel: 'Cerrar chat de FiestaPay',
    chatShort: 'Chat',
    panelLabel: 'Chat público de FiestaPay',
    headerBadge: 'NUEVO · PÚBLICO',
    headerTitle: 'Chat general de FiestaPay',
    headerSub: 'Información general, no sobre un evento concreto',
    headerClose: 'Cerrar chat público',
    infoStrip:
      'Este chat es general y separado de tu evento o del panel del organizador. No crea eventos ni modifica asistencias o pagos.',
    aboutTitle: 'Sobre este chat',
    showSuggestions: 'Preguntas sugeridas',
    thinking: (secs: number) => `Pensando… ${secs} s`,
    checkingAvailability:
      'Comprobando la disponibilidad del chat público. Mientras tanto puedes usar los formularios y el panel manualmente.',
    unavailable:
      'El chat público no está habilitado en este servidor. Puedes crear tu invitación y usar los formularios y el panel manualmente; la recuperación del organizador sigue disponible si el correo está configurado.',
    error429:
      'Se alcanzó el límite temporal de consultas (429). Tu pregunta no se respondió. Espera un minuto y pulsa «Reintentar» cuando quieras; los formularios y el panel siguen disponibles.',
    error503:
      'El chat público no está disponible ahora (503). Tu pregunta no obtuvo respuesta. Pulsa «Reintentar» manualmente o continúa con los formularios y el panel; la recuperación del organizador sigue disponible si el correo está configurado. Nada se creó, pagó ni reembolsó.',
    errorTimeout:
      'El agente tardó demasiado. Tu pregunta no se procesó; pulsa «Reintentar».',
    errorGeneric:
      'No se pudo enviar la consulta al chat público. Tu pregunta no obtuvo respuesta. Pulsa «Reintentar» manualmente; los formularios y el panel siguen disponibles.',
    retry: 'Reintentar',
    quickLead: 'Ayuda rápida (solo rellena la pregunta; no se envía sola):',
    composerLabel: 'Tu pregunta',
    placeholder: 'Escribe una pregunta general…',
    composerAria: 'Pregunta para el chat público',
    send: 'Enviar',
    enterSend: 'Enter envía',
    enterButtonOnly: 'Solo con el botón',
    enterHintSend: 'Enter envía · Mayús+Enter = nueva línea',
    enterHintButton: 'Enter hace nueva línea; envía con el botón',
    enterGroupLabel: 'Cómo se envía',
  },
  en: {
    welcome: "Hi, I'm the FiestaPay agent. Ask me how FiestaPay works.",
    quickHelp1: 'How does FiestaPay work?',
    quickHelp2: 'What does paying in PayPal Sandbox mean?',
    quickHelp3: 'How does the organizer recover access?',
    privacy:
      'This conversation lives only in this open tab: reloading or opening a new window starts it empty, and no history is stored here. The server keeps usage metadata, not the content of your public messages. OpenAI processes your questions to answer them; we do not claim its retention is zero.',
    privacyGemini:
      'This conversation lives only in this open tab: reloading or opening a new window starts it empty, and no history is stored here. The server keeps usage metadata, not the content of your public messages. Gemini processes your questions to answer them; we do not claim its retention is zero.',
    openLabel: 'Open the FiestaPay chat',
    closeLabel: 'Close the FiestaPay chat',
    chatShort: 'Chat',
    panelLabel: 'FiestaPay public chat',
    headerBadge: 'NEW · PUBLIC',
    headerTitle: 'FiestaPay general chat',
    headerSub: 'General information, not about a specific event',
    headerClose: 'Close public chat',
    infoStrip:
      'This chat is general and separate from your event or the organizer dashboard. It creates no events and changes no attendance or payments.',
    aboutTitle: 'About this chat',
    showSuggestions: 'Suggested questions',
    thinking: (secs: number) => `Thinking… ${secs} s`,
    checkingAvailability:
      'Checking whether the public chat is available. Meanwhile you can use the forms and the dashboard manually.',
    unavailable:
      'The public chat is not enabled on this server. You can create your invitation and use the forms and the dashboard manually; organizer recovery is still available if email is configured.',
    error429:
      'The temporary question limit was reached (429). Your question was not answered. Wait a minute and press “Retry” whenever you want; the forms and the dashboard stay available.',
    error503:
      'The public chat is not available right now (503). Your question was not answered. Press “Retry” manually or continue with the forms and the dashboard; organizer recovery is still available if email is configured. Nothing was created, paid, or refunded.',
    errorTimeout:
      'The agent took too long. Your question was not processed; press “Retry”.',
    errorGeneric:
      'Your question could not be sent to the public chat. Your question was not answered. Press “Retry” manually; the forms and the dashboard stay available.',
    retry: 'Retry',
    quickLead: 'Quick help (only fills in the question; it is never sent on its own):',
    composerLabel: 'Your question',
    placeholder: 'Write a general question…',
    composerAria: 'Question for the public chat',
    send: 'Send',
    enterSend: 'Enter sends',
    enterButtonOnly: 'Button only',
    enterHintSend: 'Enter sends · Shift+Enter = new line',
    enterHintButton: 'Enter adds a new line; send with the button',
    enterGroupLabel: 'How sending works',
  },
});
