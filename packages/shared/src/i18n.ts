/**
 * Shared language contract for the web app and the API.
 *
 * - Two UI languages. Spanish is the default; English is opt-in.
 * - Money is always USD integer cents computed by the server; only its presentation changes.
 * - Event times are always shown in the event time zone (America/Guayaquil), never the viewer's.
 * - User-written content (titles, descriptions, names, chat text) is never translated.
 */

export type Locale = 'es' | 'en';
export const LOCALES: readonly Locale[] = ['es', 'en'] as const;
export const DEFAULT_LOCALE: Locale = 'es';

/** Request header the web client sends on every API call. Absent or invalid means Spanish. */
export const LOCALE_HEADER = 'x-fiesta-locale';
/** Browser storage key for the viewer's persisted preference. */
export const LOCALE_STORAGE_KEY = 'fp_locale';
/** Query parameter that selects and persists a language, e.g. /demo?lang=en. */
export const LOCALE_QUERY_PARAM = 'lang';

export const EVENT_TIME_ZONE = 'America/Guayaquil';
export const EVENT_CURRENCY = 'USD';

/** Where a public (event-less) assistant conversation happens. Each keeps its own history. */
export type AssistantContext = 'landing' | 'demo';
export const ASSISTANT_CONTEXTS: readonly AssistantContext[] = ['landing', 'demo'] as const;

/** Judge-demo flavours served by POST /api/demo. Both create events with is_demo = true. */
export type DemoKind = 'private' | 'payment';
export const DEMO_KINDS: readonly DemoKind[] = ['private', 'payment'] as const;

/** Name the payment demo uses when it joins its own demo invitation as the fictional guest. */
export const DEMO_GUEST_NAME: Readonly<Record<Locale, string>> = { es: 'Invitado Demo', en: 'Demo Guest' };

/** Accepts 'en', 'EN', 'en-US', 'en_GB'...; anything else is Spanish. */
export function normalizeLocale(value: unknown): Locale {
  if (typeof value !== 'string') return DEFAULT_LOCALE;
  const base = value.trim().toLowerCase().split(/[-_]/)[0];
  return base === 'en' ? 'en' : DEFAULT_LOCALE;
}

/** BCP-47 tag used for Intl formatting. Spanish keeps the historical es-EC format. */
export function intlLocale(locale: Locale): string {
  return locale === 'en' ? 'en-US' : 'es-EC';
}

/** USD from integer cents: es -> "$50,00", en -> "$50.00". Currency never changes. */
export function formatMoney(cents: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale), { style: 'currency', currency: EVENT_CURRENCY }).format(
    cents / 100,
  );
}

/** Formats an instant in the event time zone. Callers may pass date/time parts; timeZone is forced. */
export function formatEventDateTime(
  iso: string | Date,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
): string {
  const date = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(intlLocale(locale), { ...options, timeZone: EVENT_TIME_ZONE }).format(date);
}

/**
 * Visible labels shared by the UI and the assistant's program guide.
 * The web catalogs MUST render these exact strings for these controls, and the API guide
 * quotes them, so the assistant always names the buttons the person actually sees.
 */
export const UI_LABELS = {
  es: {
    languageName: 'Español',
    languageSelector: 'Idioma',
    sandboxBadge: 'Sandbox · Sin dinero real',
    judgesDemo: 'Demo para jueces',
    createInvitation: 'Crear mi invitación',
    newInvitation: '+ Nueva invitación',
    myInvitations: 'Mis invitaciones',
    myDemos: 'Mis demos',
    previewPanel: 'Ver panel de ejemplo (AG Grid)',
    privateDemo: 'Crear mi demo privada',
    paymentDemo: 'Probar pago con PayPal',
    talkToAssistant: 'Hablar con el asistente',
    resetDemos: 'Reiniciar mis demos',
    recoverLink: 'Recuperar mi enlace',
    testAccount: 'Ver cuenta de prueba',
    copyEmail: 'Copiar correo',
    copyPassword: 'Copiar contraseña',
    quoteReview: 'Confirmar revisión de la cotización',
    quoteReviewLead: 'Confirmo que revisé',
    generatePayment: 'Confirmar y Generar Pago',
    paymentPathTitle: 'Tu camino al pago',
    stepJoin: 'Únete con tu nombre',
    stepRsvp: 'Confirma tu asistencia',
    stepQuote: 'Revisa tu importe',
    stepPay: 'Paga en PayPal Sandbox',
    saveAndContinue: 'Guardar y seguir',
    changeStep: 'Cambiar',
    askAboutStep: '¿Dudas con este paso? Pregúntale al asistente',
    createWizardTitle: 'Crea tu invitación paso a paso',
    stepWhat: '¿Qué celebran?',
    stepWhen: '¿Cuándo?',
    stepWhere: '¿Dónde y qué incluye?',
    stepShare: 'Cuota y cupo',
    stepLook: 'Portada y tema',
    advancedOptions: 'Opciones avanzadas',
    suggestWithAi: '✨ Sugerir con IA',
    describeInvitation: 'Describe tu invitación en una frase',
    fillWithAi: 'Rellenar con IA',
    prepareReminders: 'Preparar recordatorios',
    reminderTone: 'Tono',
    reminderToneFriendly: 'Amable',
    reminderToneFun: 'Divertido',
    reminderToneFormal: 'Formal',
    copy: 'Copiar',
    openWhatsapp: 'Abrir WhatsApp',
    searchGuests: 'Buscar invitados',
    searchFictional: 'Buscar en datos ficticios',
    pendingOnly: 'Solo pendientes',
    exportCsv: 'Exportar CSV',
    totals: 'Totales',
    totalsFictional: 'Totales (ficticio)',
    paypalAiPanel: 'Cómo usa FiestaPay PayPal e IA',
    approveInPayPal: 'Aprobar en PayPal',
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
  },
  en: {
    languageName: 'English',
    languageSelector: 'Language',
    sandboxBadge: 'Sandbox · No real money',
    judgesDemo: 'Judges demo',
    createInvitation: 'Create my invitation',
    newInvitation: '+ New invitation',
    myInvitations: 'My invitations',
    myDemos: 'My demos',
    previewPanel: 'View sample dashboard (AG Grid)',
    privateDemo: 'Create my private demo',
    paymentDemo: 'Try a PayPal payment',
    talkToAssistant: 'Talk to the assistant',
    resetDemos: 'Reset my demos',
    recoverLink: 'Recover my link',
    testAccount: 'Show test account',
    copyEmail: 'Copy email',
    copyPassword: 'Copy password',
    quoteReview: 'Confirm quote review',
    quoteReviewLead: 'I confirm I reviewed',
    generatePayment: 'Confirm and Create Payment',
    paymentPathTitle: 'Your path to payment',
    stepJoin: 'Join with your name',
    stepRsvp: 'Confirm your attendance',
    stepQuote: 'Review your amount',
    stepPay: 'Pay in PayPal Sandbox',
    saveAndContinue: 'Save and continue',
    changeStep: 'Change',
    askAboutStep: 'Questions about this step? Ask the assistant',
    createWizardTitle: 'Create your invitation step by step',
    stepWhat: 'What are you celebrating?',
    stepWhen: 'When?',
    stepWhere: 'Where, and what is included?',
    stepShare: 'Share and capacity',
    stepLook: 'Cover and theme',
    advancedOptions: 'Advanced options',
    suggestWithAi: '✨ Suggest with AI',
    describeInvitation: 'Describe your gathering in one sentence',
    fillWithAi: 'Fill with AI',
    prepareReminders: 'Draft reminders',
    reminderTone: 'Tone',
    reminderToneFriendly: 'Friendly',
    reminderToneFun: 'Fun',
    reminderToneFormal: 'Formal',
    copy: 'Copy',
    openWhatsapp: 'Open WhatsApp',
    searchGuests: 'Search guests',
    searchFictional: 'Search the fictional data',
    pendingOnly: 'Only pending',
    exportCsv: 'Export CSV',
    totals: 'Totals',
    totalsFictional: 'Totals (fictional)',
    paypalAiPanel: 'How FiestaPay uses PayPal and AI',
    approveInPayPal: 'Approve in PayPal',
    verifyStatus: 'Check Status',
    verifyCapture: 'Check / Continue Capture',
    captureComplete: 'Confirm and Complete Payment Capture',
    openPayPal: 'Open PayPal ↗',
    confirmEvent: '✓ Confirm Event',
    orbLauncher: 'Open FiestaPay assistant',
    textTab: 'Type',
    voiceTab: 'Talk',
    listen: 'Listen to voice info',
    startVoice: 'Start Voice Conversation',
    stopVoice: 'Stop and Close Microphone',
  },
} as const satisfies Record<Locale, Record<string, string>>;

export type UiLabelKey = keyof (typeof UI_LABELS)['es'];
// Compile-time parity: both languages define exactly the same label keys.
export const UI_LABEL_KEYS = Object.keys(UI_LABELS.es) as UiLabelKey[];
const _labelParity: Record<UiLabelKey, string> = UI_LABELS.en;
void _labelParity;
