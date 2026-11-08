import { defineCatalog } from '../catalog';

/**
 * Product landing. The main/secondary CTAs and the section titles use
 * UI_LABELS literally at the call site. Nothing here implies real money:
 * PayPal always appears as Sandbox.
 */
export const landingCatalog = defineCatalog({
  es: {
    introLabel: 'FiestaPay: crea tu invitación',
    title: 'Crea tu invitación y aclara los pagos desde el inicio',
    story:
      'FiestaPay nació de una comida de diciembre con excompañeros de colegio y otra con excompañeros de la empresa: juntar a todos fue fácil, aclarar quién pagaba qué, no.',
    stepsTitle: 'Cómo funciona',
    step1Title: 'Crea tu invitación',
    step1Text: 'Ponle fecha, lugar y una cuota fija por persona.',
    step2Title: 'Tus invitados confirman',
    step2Text: 'Cada uno confirma su asistencia, separada del pago.',
    step3Title: 'Cada uno paga su parte',
    step3Text: 'Pagan con PayPal Sandbox y tú ves quién pagó.',
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
    introLabel: 'FiestaPay: create your invitation',
    title: 'Create your invitation and settle payments from the start',
    story:
      'FiestaPay was born from a December dinner with former schoolmates and another with former coworkers: getting everyone together was easy, settling who paid for what was not.',
    stepsTitle: 'How it works',
    step1Title: 'Create your invitation',
    step1Text: 'Set a date, a place, and a fixed share per person.',
    step2Title: 'Your guests confirm',
    step2Text: 'Each guest confirms attendance, separate from payment.',
    step3Title: 'Everyone pays their share',
    step3Text: 'They pay with PayPal Sandbox and you see who paid.',
    sandboxNote: 'The app is real; PayPal runs in SANDBOX mode: no real money moves.',
    useCasesTitle: 'Start with your case',
    useCaseSchool: 'Schoolmates reunion dinner',
    useCaseWork: 'Lunch with former coworkers',
    emptyTitle: 'You have not created any invitation yet',
    emptyText: 'Create yours with a fixed share per person, or explore the judges demo first.',
    recoverTitle: 'Already created an invitation?',
    recoverText: 'Recover your organizer link with your verified email.',
  },
});
