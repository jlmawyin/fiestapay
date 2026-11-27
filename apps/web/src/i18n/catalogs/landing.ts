import { defineCatalog } from '../catalog';

/**
 * Product landing. The main/secondary CTAs and the section titles use
 * UI_LABELS literally at the call site. Nothing here implies real money:
 * PayPal always appears as Sandbox.
 */
export const landingCatalog = defineCatalog({
  es: {
    introLabel: 'Somos Panas, tu anfitrión',
    title: 'Tu anfitrión que cobra la parte de cada uno con PayPal',
    story:
      'Arma la fiesta con ayuda de Pana, la avatar; cada persona confirma y paga su parte en PayPal Sandbox.',
    differentiation:
      'SarafuPay reúne los cobros grupales por WhatsApp. Partiful ofrece Chip In y venta de entradas. Somos Panas prepara la fiesta, Pana guía a los invitados y verifica cada aporte en PayPal.',
    chooseTitle: 'Crea tu invitación',
    pathSentence: 'Empezar ahora',
    pathInterview: 'Ayúdame a planearlo',
    pathManual: 'Llenaré el formulario yo mismo',
    statsTitle: 'Medido en nuestras propias pruebas',
    statsDrafts: '10/10 borradores generados',
    statsFields: '43/44 campos correctos',
    statsQuotes: '8/10 cotizaciones exactas',
    statsNote: 'Pruebas del 10 de noviembre de 2026. Tiempo mediano del borrador: 2,0 s.',
    judgePathTitle: 'Recorrido de 60 segundos para jueces',
    judgePathText:
      'Habla con la avatar con un ejemplo listo y abre una invitación ficticia en PayPal Sandbox.',
    judgePathCta: 'Empezar el recorrido de 60 segundos',
    stepsTitle: 'Cómo funciona',
    step1Title: 'Describe tu fiesta, Pana la arma',
    step1Text: 'Cuéntale tu plan a la avatar: propone fecha, lugar y cuota; tú revisas antes de publicar.',
    step2Title: 'Pana guía a tus invitados',
    step2Text: 'Cada uno confirma su asistencia con la avatar, separada del pago.',
    step3Title: 'Cada uno paga su parte',
    step3Text: 'Pana prepara la cotización y pagan con PayPal Sandbox; tú ves quién pagó.',
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
    introLabel: 'Somos Panas, your party host',
    title: "Your party host that collects everyone's share with PayPal",
    story:
      'Build the party with Pana, the avatar; everyone confirms and pays their share in PayPal Sandbox.',
    differentiation:
      'SarafuPay runs group collections through WhatsApp. Partiful offers Chip In and ticketing. Somos Panas drafts the party, Pana guides guests, and verifies each PayPal contribution.',
    chooseTitle: 'Create your invitation',
    pathSentence: 'Start now',
    pathInterview: 'Help me plan it',
    pathManual: "I'll fill the form myself",
    statsTitle: 'Measured in our own tests',
    statsDrafts: '10/10 drafts produced',
    statsFields: '43/44 fields correct',
    statsQuotes: '8/10 exact quotes',
    statsNote: 'Tested November 10, 2026. Median draft time: 2.0 s.',
    judgePathTitle: '60-second path for judges',
    judgePathText:
      'Talk to the avatar with a ready example and open a fictional invitation in PayPal Sandbox.',
    judgePathCta: 'Start the 60-second path',
    stepsTitle: 'How it works',
    step1Title: 'Describe your party, Pana builds it',
    step1Text: 'Tell the avatar your plan: she proposes date, place, and share; you review before publishing.',
    step2Title: 'Pana guides your guests',
    step2Text: 'Everyone confirms attendance with the avatar, separate from payment.',
    step3Title: 'Everyone pays their share',
    step3Text: 'Pana prepares the quote and they pay with PayPal Sandbox; you see who paid.',
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
