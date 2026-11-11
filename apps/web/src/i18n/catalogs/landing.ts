import { defineCatalog } from '../catalog';

/**
 * Product landing. The main/secondary CTAs and the section titles use
 * UI_LABELS literally at the call site. Nothing here implies real money:
 * PayPal always appears as Sandbox.
 */
export const landingCatalog = defineCatalog({
  es: {
    introLabel: 'FiestaPay: tu anfitrión con IA',
    title: 'Tu anfitrión con IA que cobra la parte de cada uno con PayPal',
    story:
      'Describe la fiesta en una frase y la IA la arma, el agente te guía por voz o texto y cada persona paga su parte en PayPal Sandbox.',
    differentiation:
      'SarafuPay reúne los cobros grupales por WhatsApp. Partiful ofrece Chip In y venta de entradas. FiestaPay prepara la fiesta, guía a los invitados por voz y verifica cada aporte en PayPal.',
    chooseTitle: '¿Ya tienes una idea o quieres sugerencias?',
    pathSentence: 'Ya tengo una idea',
    pathInterview: 'Ayúdame a planearlo',
    pathManual: 'Llenaré el formulario yo mismo',
    statsTitle: 'Medido en nuestras propias pruebas',
    statsDrafts: '10/10 borradores de IA generados',
    statsFields: '43/44 campos correctos',
    statsQuotes: '8/10 cotizaciones exactas',
    statsNote: 'Pruebas del 10 de noviembre de 2026. Tiempo mediano del borrador: 2,0 s.',
    judgePathTitle: 'Recorrido de 60 segundos para jueces',
    judgePathText:
      'Abre el chat con un ejemplo listo para enviar y el acceso a una invitación ficticia en PayPal Sandbox.',
    judgePathCta: 'Empezar el recorrido de 60 segundos',
    stepsTitle: 'Cómo funciona',
    step1Title: 'Describe tu fiesta, la IA la arma',
    step1Text: 'Escribe una frase y la IA propone fecha, lugar y cuota; tú revisas antes de publicar.',
    step2Title: 'El agente guía a tus invitados',
    step2Text: 'Cada uno confirma su asistencia por voz o texto, separada del pago.',
    step3Title: 'Cada uno paga su parte',
    step3Text: 'La IA prepara la cotización y pagan con PayPal Sandbox; tú ves quién pagó.',
    sandboxNote:
      'La aplicación es real; PayPal está en modo SANDBOX: no se mueve dinero real.',
    useCasesTitle: 'Empieza por tu caso',
    useCaseSchool: 'Reunión de excompañeros de colegio',
    useCaseWork: 'Comida con excompañeros de trabajo',
    emptyTitle: 'No tienes ninguna invitación creada aún',
    emptyText: 'Crea la tuya con una cuota fija por persona, o explora primero la demo para jueces.',
    recoverTitle: '¿Ya creaste una invitación?',
    recoverText: 'Recupera tu enlace de organizador con el correo verificado.',
  },
  en: {
    introLabel: 'FiestaPay: your AI host',
    title: "Your AI party host that collects everyone's share with PayPal",
    story:
      'Describe the party in one sentence and the AI builds it, the agent guides you by voice or text, and everyone pays their share in PayPal Sandbox.',
    differentiation:
      'SarafuPay runs group collections through WhatsApp. Partiful offers Chip In and ticketing. FiestaPay drafts the party, guides guests by voice, and verifies each PayPal contribution.',
    chooseTitle: 'Already have an idea, or want suggestions?',
    pathSentence: 'I already have an idea',
    pathInterview: 'Help me plan it',
    pathManual: "I'll fill the form myself",
    statsTitle: 'Measured in our own tests',
    statsDrafts: '10/10 AI drafts produced',
    statsFields: '43/44 fields correct',
    statsQuotes: '8/10 exact quotes',
    statsNote: 'Tested November 10, 2026. Median draft time: 2.0 s.',
    judgePathTitle: '60-second path for judges',
    judgePathText:
      'Opens the chat with an example ready to send and a fictional invitation to try PayPal Sandbox.',
    judgePathCta: 'Start the 60-second path',
    stepsTitle: 'How it works',
    step1Title: 'Describe your party, the AI builds it',
    step1Text: 'Write one sentence and the AI proposes date, place, and share; you review before publishing.',
    step2Title: 'The agent guides your guests',
    step2Text: 'Everyone confirms attendance by voice or text, separate from payment.',
    step3Title: 'Everyone pays their share',
    step3Text: 'The AI prepares the quote and they pay with PayPal Sandbox; you see who paid.',
    sandboxNote: 'The app is real; PayPal runs in SANDBOX mode: no real money moves.',
    useCasesTitle: 'Start with your case',
    useCaseSchool: 'Schoolmates reunion',
    useCaseWork: 'Meal with former coworkers',
    emptyTitle: 'You have not created any invitation yet',
    emptyText: 'Create yours with a fixed share per person, or explore the judges demo first.',
    recoverTitle: 'Already created an invitation?',
    recoverText: 'Recover your organizer link with your verified email.',
  },
});
