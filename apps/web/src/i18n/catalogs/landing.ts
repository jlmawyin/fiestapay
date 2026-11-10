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
