import {
  TEMPLATE_INVITE_COPY,
  contrastRatio,
  defaultThemeFor,
  formatMoney,
  intlLocale,
  mealLabel,
  resolveTheme,
  suggestTheme,
  templateInviteCopy,
  themeContrastPairs,
  type FiestaEvent,
  type Locale,
  type MealKind,
  type TemplateKind,
  type ThemeDefinition,
  type ThemeKey,
} from '@fiestapay/shared';

export {
  TEMPLATE_INVITE_COPY,
  contrastRatio,
  defaultThemeFor,
  mealLabel,
  resolveTheme,
  suggestTheme,
  templateInviteCopy,
  themeContrastPairs,
  type MealKind,
  type ThemeDefinition,
  type ThemeKey,
};

const SHARE_TIME_ZONE = 'America/Guayaquil';

/**
 * Judge-demo marker. Rows saved before the flag existed omit it and count as
 * own invitations; only an explicit `true` marks a demo. Kept here (not in
 * `@fiestapay/shared`, which this package must not touch) until the shared
 * `FiestaEvent` type carries `isDemo`.
 */
export type EventWithDemoFlag = FiestaEvent & { isDemo?: boolean };

export function isDemoEvent(event: FiestaEvent): boolean {
  return (event as EventWithDemoFlag).isDemo === true;
}

/** Official click-to-chat endpoint. One encodeURIComponent pass, no network call. */
export const WHATSAPP_SEND_ENDPOINT = 'https://api.whatsapp.com/send';

export function stripUnpairedSurrogates(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    const high = code >= 0xd800 && code <= 0xdbff;
    const low = code >= 0xdc00 && code <= 0xdfff;
    if (high) {
      const next = value.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += value[i] + value[i + 1];
        i += 1;
      }
      continue;
    }
    if (low) continue;
    out += value[i];
  }
  return out;
}

function withoutControlChars(value: string): string {
  let out = '';
  for (const char of value) {
    const code = char.charCodeAt(0);
    const forbidden = code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127;
    if (!forbidden) out += char;
  }
  return out;
}

/** Removes tags and control characters. Leaves letters, emoji, and punctuation. */
export function plainShareText(value: string): string {
  return stripUnpairedSurrogates(withoutControlChars(value.replace(/<[^>]*>/g, '')));
}

export function whatsAppShareUrl(text: string): string {
  return `${WHATSAPP_SEND_ENDPOINT}?text=${encodeURIComponent(plainShareText(text))}`;
}

export function textFromWhatsAppUrl(url: string): string {
  return new URL(url).searchParams.get('text') ?? '';
}

/** Public invitation path only. Drops query, hash, and any admin key. */
export function shareableInviteUrl(url: string): string {
  const parsed = new URL(url);
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}

export function publicInviteUrl(origin: string, slug: string): string {
  if (!/^[a-z0-9-]{3,80}$/.test(slug)) throw new Error('Slug invalido');
  const parsed = new URL(origin);
  return `${parsed.origin}/e/${slug}`;
}

export interface ZonedInstant {
  date: string;
  time: string;
  label: string;
}

export function formatInstantInZone(
  iso: string,
  timeZone = SHARE_TIME_ZONE,
  locale: Locale = 'es',
): ZonedInstant {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { date: iso, time: '', label: iso };
  const tag = intlLocale(locale);
  const day = new Intl.DateTimeFormat(tag, {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
  const time = new Intl.DateTimeFormat(tag, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    ...(locale === 'es' ? { hourCycle: 'h23' as const } : {}),
  }).format(date);
  return { date: day, time, label: `${day}, ${time} (${timeZone})` };
}

/**
 * Uses the end instant. A cross-day range keeps both calendar dates. The zone is printed
 * exactly once for the whole range, including a same-day start and end.
 */
export function formatEventRange(
  startsAt: string,
  endsAt?: string | null,
  timeZone = SHARE_TIME_ZONE,
  locale: Locale = 'es',
): string {
  const start = formatInstantInZone(startsAt, timeZone, locale);
  if (!endsAt) {
    return locale === 'en'
      ? `Start: ${start.date}, ${start.time}. No end time given (${timeZone}).`
      : `Inicio: ${start.date}, ${start.time}. Hora de fin no indicada (${timeZone}).`;
  }
  const end = formatInstantInZone(endsAt, timeZone, locale);
  if (start.date === end.date) {
    return locale === 'en'
      ? `Start: ${start.date}, ${start.time}. End: ${end.time} (${timeZone}).`
      : `Inicio: ${start.date}, ${start.time}. Fin: ${end.time} (${timeZone}).`;
  }
  return locale === 'en'
    ? `Start: ${start.date}, ${start.time}. End: ${end.date}, ${end.time} (${timeZone}).`
    : `Inicio: ${start.date}, ${start.time}. Fin: ${end.date}, ${end.time} (${timeZone}).`;
}

export function eventRangeIsCrossDay(
  startsAt: string,
  endsAt?: string | null,
  timeZone = SHARE_TIME_ZONE,
  locale: Locale = 'es',
): boolean {
  if (!endsAt) return false;
  const start = formatInstantInZone(startsAt, timeZone, locale);
  const end = formatInstantInZone(endsAt, timeZone, locale);
  return start.date !== end.date;
}

export interface InviteShareInput {
  template: TemplateKind;
  theme?: string | null;
  title: string;
  location: string;
  startsAt: string;
  endsAt?: string | null;
  priceCents: number;
  inviteUrl: string;
  organizerName?: string | null;
}

export function buildInviteShareText(input: InviteShareInput, locale: Locale = 'es'): string {
  const theme = resolveTheme(input.template, input.theme);
  const copy = TEMPLATE_INVITE_COPY[input.template];
  const who = input.organizerName?.trim();
  const greeting =
    locale === 'en'
      ? who
        ? `${plainShareText(who)} invites you.`
        : 'You are invited.'
      : who
        ? `${plainShareText(who)} te invita.`
        : 'Te invitan.';
  const when = formatEventRange(input.startsAt, input.endsAt, SHARE_TIME_ZONE, locale);
  const lines = [
    theme.phrase,
    greeting,
    plainShareText(input.title),
    locale === 'en' ? `Schedule: ${when}` : `Horario: ${when}`,
    locale === 'en' ? `Place: ${plainShareText(input.location)}` : `Lugar: ${plainShareText(input.location)}`,
    locale === 'en'
      ? `Cost per person: ${formatMoney(input.priceCents, locale)}`
      : `Cuota por persona: ${formatMoney(input.priceCents, locale)}`,
    copy.welcome,
    shareableInviteUrl(input.inviteUrl),
  ];
  return lines.join('\n');
}

export function buildInviteShareUrl(input: InviteShareInput, locale: Locale = 'es'): string {
  return whatsAppShareUrl(buildInviteShareText(input, locale));
}

export function countPhrase(count: number, singular: string, plural: string): string {
  const safe = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
  return `${safe} ${safe === 1 ? singular : plural}`;
}

export function attendanceSummary(
  options: {
    parties?: number;
    paidPeople?: number;
    capacity?: number | null;
  },
  locale: Locale = 'es',
): string {
  const parts: string[] = [];
  if (typeof options.parties === 'number' && Number.isFinite(options.parties)) {
    parts.push(
      locale === 'en'
        ? countPhrase(options.parties, 'guest', 'guests')
        : countPhrase(options.parties, 'invitado', 'invitados'),
    );
  }
  if (typeof options.paidPeople === 'number' && Number.isFinite(options.paidPeople)) {
    parts.push(
      locale === 'en'
        ? countPhrase(options.paidPeople, 'paid person', 'paid people')
        : countPhrase(options.paidPeople, 'persona pagada', 'personas pagadas'),
    );
  } else {
    parts.push(locale === 'en' ? 'Paid people: pending' : 'Personas pagadas: por consultar');
  }
  if (typeof options.capacity === 'number' && Number.isFinite(options.capacity)) {
    parts.push(locale === 'en' ? `capacity ${Math.trunc(options.capacity)}` : `cupo ${Math.trunc(options.capacity)}`);
  }
  return parts.join(' · ');
}

/** Goal bar. Stays under 100 until collected cents reach the goal. Display only. */
export function goalProgressPercent(
  collectedCents: number,
  goalCents: number | null | undefined,
): number | null {
  if (typeof goalCents !== 'number' || goalCents <= 0) return null;
  if (!Number.isSafeInteger(collectedCents) || collectedCents <= 0) return 0;
  if (collectedCents >= goalCents) return 100;
  return Math.min(99, Math.floor((collectedCents * 100) / goalCents));
}

/** Bar percent. Stays under 100 until the server says the minimum was reached. */
export function minimumProgressPercent(
  collectedCents: number,
  minimumCents: number | null | undefined,
  minimumReached: boolean,
): number | null {
  if (typeof minimumCents !== 'number' || minimumCents <= 0) return null;
  if (minimumReached) return 100;
  if (!Number.isSafeInteger(collectedCents) || collectedCents <= 0) return 0;
  return Math.min(99, Math.floor((collectedCents * 100) / minimumCents));
}

export function guestPayLabel(paidCents: number, dueCents: number, locale: Locale = 'es'): string {
  if (paidCents > 0 && dueCents === 0) return locale === 'en' ? 'Paid' : 'Pagado';
  if (paidCents > 0 && dueCents > 0) {
    return locale === 'en'
      ? `Paid ${formatMoney(paidCents, locale)}. Missing ${formatMoney(dueCents, locale)}`
      : `Abonado ${formatMoney(paidCents, locale)}. Falta ${formatMoney(dueCents, locale)}`;
  }
  if (dueCents > 0) {
    return locale === 'en'
      ? `Payment pending. Missing ${formatMoney(dueCents, locale)}`
      : `Pago pendiente. Falta ${formatMoney(dueCents, locale)}`;
  }
  return locale === 'en' ? 'Payment pending' : 'Pago pendiente';
}

export function guestFundingOutcome(
  event: Pick<FiestaEvent, 'fundingStatus' | 'refundSummary' | 'confirmed'>,
  locale: Locale = 'es',
): string | null {
  if (event.fundingStatus === 'failed') {
    const pending = (event.refundSummary?.pendingCents ?? 0) > 0 || (event.refundSummary?.needsReviewCents ?? 0) > 0;
    const refunded = (event.refundSummary?.refundedCents ?? 0) > 0;
    if (pending) return locale === 'en' ? 'Minimum not reached. Refund in progress.' : 'Mínimo no alcanzado. Devolución en proceso.';
    if (refunded) return locale === 'en' ? 'Minimum not reached. Refunded.' : 'Mínimo no alcanzado. Devuelto.';
    return locale === 'en' ? 'Minimum not reached.' : 'Mínimo no alcanzado.';
  }
  if (event.fundingStatus === 'funded') {
    if (event.confirmed) {
      return locale === 'en'
        ? 'The minimum was reached and the invitation is confirmed.'
        : 'El mínimo se alcanzó y la invitación está confirmada.';
    }
    return locale === 'en'
      ? 'The minimum was reached. The organizer confirmation is separate.'
      : 'El mínimo se alcanzó. La confirmación del organizador es aparte.';
  }
  return null;
}

export function themeCssVars(item: ThemeDefinition): Record<string, string> {
  return {
    '--theme-surface': item.surface,
    '--theme-ink': item.ink,
    '--theme-muted': item.muted,
    '--theme-accent': item.accent,
    '--theme-on-accent': item.onAccent,
    '--theme-tint': item.tint,
  };
}

export function organizerLine(name: string | null | undefined, locale: Locale = 'es'): string | null {
  const clean = name?.trim();
  if (!clean) return null;
  return locale === 'en' ? `Organized by ${clean}` : `Organiza ${clean}`;
}

export function namedGreeting(name: string | null | undefined, locale: Locale = 'es'): string | null {
  const clean = name?.trim();
  if (!clean) return null;
  return locale === 'en' ? `${clean} invites you.` : `${clean} te invita.`;
}

/** Back-compat when a caller has no template. Neutral on purpose: not a fiesta. */
export const NEUTRAL_GUEST_ENTRY = {
  welcome: '¿Te unes?',
  join: 'Unirme',
} as const;

export const GUEST_ENTRY_COPY = {
  aliasLabel: 'Alias del invitado',
  aliasPlaceholder: 'Ej. Invitado Demo',
  aliasHelp:
    'Usa un alias ficticio para probar tu asistencia y tu cuota. No necesitas datos personales, contraseña ni registro previo.',
  aliasError: 'Por favor ingresa un alias ficticio.',
  joinError: 'No se pudo completar el ingreso.',
  entering: 'Entrando...',
} as const;

export const GUEST_ENTRY_COPY_EN: Record<keyof typeof GUEST_ENTRY_COPY, string> = {
  aliasLabel: 'Guest alias',
  aliasPlaceholder: 'E.g. Demo Guest',
  aliasHelp:
    'Use a fictional alias to try your attendance and your share. No personal data, password, or prior signup needed.',
  aliasError: 'Please enter a fictional alias.',
  joinError: 'Could not complete the check-in.',
  entering: 'Joining...',
};

export const NEUTRAL_GUEST_ENTRY_EN = {
  welcome: 'Joining us?',
  join: 'Join',
} as const;

export function guestEntryCopy(
  template?: TemplateKind | null,
  locale: Locale = 'es',
): { welcome: string; join: string } {
  if (template && TEMPLATE_INVITE_COPY[template]) {
    const copy = templateInviteCopy(template, locale);
    return { welcome: copy.welcome, join: copy.join };
  }
  return locale === 'en'
    ? { welcome: NEUTRAL_GUEST_ENTRY_EN.welcome, join: NEUTRAL_GUEST_ENTRY_EN.join }
    : { welcome: NEUTRAL_GUEST_ENTRY.welcome, join: NEUTRAL_GUEST_ENTRY.join };
}

/** Alias form copy (label, placeholder, help, errors, busy state) in the locale. */
export function guestEntryFormCopy(locale: Locale = 'es'): Record<keyof typeof GUEST_ENTRY_COPY, string> {
  return locale === 'en' ? GUEST_ENTRY_COPY_EN : { ...GUEST_ENTRY_COPY };
}

/** "persona/personas" or "person/people" for a headcount. */
export function peopleWord(count: number, locale: Locale = 'es'): string {
  if (locale === 'en') return count === 1 ? 'person' : 'people';
  return count === 1 ? 'persona' : 'personas';
}

export const GUEST_PAYMENT_COPY = {
  heading: 'Revisa tu pago',
  calculating: 'Calculando tu pago',
  empty: 'Aún no hay un pago para revisar.',
  refresh: 'Calcular mi pago',
  update: 'Actualizar mi pago',
  people: 'Personas',
  unit: 'Cuota por persona',
  total: 'Total',
  paid: 'Ya abonado',
  due: 'Diferencia a pagar',
  confirmLead: 'Confirmo que revisé',
  /** Visible control kept so the existing human-confirmation tests still find it. */
  proceed: 'Confirmar y Generar Pago',
  preparing: 'Preparando tu pago...',
  mustConfirm: 'Marca la casilla para confirmar que revisaste este pago.',
  orderError: 'No se pudo preparar el pago.',
  /** Accessible name preserved for the readonly invite navigation regression. */
  confirmName: 'Confirmar revisión de la cotización',
} as const;

export const GUEST_PAYMENT_COPY_EN: Record<keyof typeof GUEST_PAYMENT_COPY, string> = {
  heading: 'Review your payment',
  calculating: 'Calculating your payment',
  empty: 'There is no payment to review yet.',
  refresh: 'Calculate my payment',
  update: 'Update my payment',
  people: 'People',
  unit: 'Share per person',
  total: 'Total',
  paid: 'Already paid',
  due: 'Balance to pay',
  confirmLead: 'I confirm I reviewed',
  proceed: 'Confirm and Create Payment',
  preparing: 'Preparing your payment...',
  mustConfirm: 'Check the box to confirm you reviewed this payment.',
  orderError: 'Could not prepare the payment.',
  confirmName: 'Confirm quote review',
};

/**
 * Quote card copy in the locale. The confirmation checkbox name, its lead,
 * and the proceed button intentionally match UI_LABELS quoteReview,
 * quoteReviewLead and generatePayment; call sites render those labels literally.
 */
export function guestPaymentCopy(locale: Locale = 'es'): Record<keyof typeof GUEST_PAYMENT_COPY, string> {
  return locale === 'en' ? GUEST_PAYMENT_COPY_EN : { ...GUEST_PAYMENT_COPY };
}

const COVERED_WHEN_PAID: Record<TemplateKind, string> = {
  comida: 'Tu pago de esta comida ya está cubierto. Eso no confirma la comida ni reserva un lugar.',
  casa: 'Tu pago para esta casa ya está cubierto. Eso no confirma la reunión ni reserva un lugar.',
  viaje: 'Tu pago de este viaje ya está cubierto. Eso no confirma el viaje ni reserva un lugar.',
  evento: 'Tu pago de este evento ya está cubierto. Eso no confirma el evento ni reserva un lugar.',
};

const COVERED_WHEN_PAID_EN: Record<TemplateKind, string> = {
  comida: 'Your payment for this dinner is already covered. That does not confirm the dinner or reserve a seat.',
  casa: 'Your payment for this house gathering is already covered. That does not confirm the gathering or reserve a seat.',
  viaje: 'Your payment for this trip is already covered. That does not confirm the trip or reserve a seat.',
  evento: 'Your payment for this event is already covered. That does not confirm the event or reserve a seat.',
};

const COVERED_NEUTRAL = 'Tu pago ya está cubierto. Eso no confirma el encuentro ni reserva un lugar.';
const COVERED_NEUTRAL_EN = 'Your payment is already covered. That does not confirm the gathering or reserve a seat.';
const NOTHING_DUE = 'No hay saldo pendiente. Eso no confirma el encuentro ni reserva un lugar.';
const NOTHING_DUE_EN = 'No balance due. That does not confirm the gathering or reserve a seat.';

export interface QuoteMoneyLines {
  people: number;
  /** Preformatted with formatMoney in the locale. */
  unit: string;
  total: string;
  paid: string;
  due: string;
}

/**
 * Human-confirmation sentence for the quote checkbox. Spanish output matches
 * the historical inline sentence; the lead ("Confirmo que revisé") is rendered
 * separately from UI_LABELS at the call site.
 */
export function quoteConfirmSentence(lines: QuoteMoneyLines, locale: Locale = 'es'): string {
  const pw = peopleWord(lines.people, locale);
  if (locale === 'en') {
    return ` ${lines.people} ${pw}, the ${lines.unit} per-person share and the ${lines.total} total. I want to prepare the ${lines.due} payment.`;
  }
  return ` ${lines.people} ${pw}, la cuota ${lines.unit} y el total ${lines.total}. Quiero preparar el pago de ${lines.due}.`;
}

/**
 * Client-composed quote summary from server numbers (people x price = total).
 * Used where the stored Spanish quote.summary must not leak into English.
 */
export function quoteClientSummary(
  lines: QuoteMoneyLines,
  dueCents: number,
  locale: Locale = 'es',
): string {
  const pw = peopleWord(lines.people, locale);
  const head = `${lines.people} ${pw} × ${lines.unit} = ${lines.total}`;
  if (!(dueCents > 0)) {
    return locale === 'en' ? `${head}. No balance due.` : `${head}. Sin saldo pendiente.`;
  }
  return locale === 'en'
    ? `${head}. Paid ${lines.paid}. Missing ${lines.due}.`
    : `${head}. Abonado ${lines.paid}. Falta ${lines.due}.`;
}

/** Honest zero-due status. It does not say the gathering is confirmed or reserved. */
export function guestCoveredCopy(
  template: TemplateKind | null | undefined,
  paidCents: number,
  locale: Locale = 'es',
): string {
  if (!(paidCents > 0)) return locale === 'en' ? NOTHING_DUE_EN : NOTHING_DUE;
  if (template && COVERED_WHEN_PAID[template]) {
    return locale === 'en' ? COVERED_WHEN_PAID_EN[template] : COVERED_WHEN_PAID[template];
  }
  return locale === 'en' ? COVERED_NEUTRAL_EN : COVERED_NEUTRAL;
}

/** Organizer confirmation badge. Reaching the minimum is a different fact. */
export function organizerConfirmedBadge(template?: TemplateKind | null, locale: Locale = 'es'): string {
  if (locale === 'en') {
    switch (template) {
      case 'comida':
        return 'Dinner confirmed by the organizer';
      case 'casa':
        return 'House gathering confirmed by the organizer';
      case 'viaje':
        return 'Trip confirmed by the organizer';
      case 'evento':
        return 'Event confirmed by the organizer';
      default:
        return 'Invitation confirmed by the organizer';
    }
  }
  switch (template) {
    case 'comida':
      return 'Comida confirmada por el organizador';
    case 'casa':
      return 'Reunión en casa confirmada por el organizador';
    case 'viaje':
      return 'Viaje confirmado por el organizador';
    case 'evento':
      return 'Evento confirmado por el organizador';
    default:
      return 'Invitación confirmada por el organizador';
  }
}

/**
 * Funded status copy. The subject follows the type.
 * "el viaje" and "el evento" stay masculine. A missing type stays "la invitación".
 */
export function fundedIsNotConfirmationNote(template?: TemplateKind | null, locale: Locale = 'es'): string {
  if (locale === 'en') {
    const subject = (() => {
      switch (template) {
        case 'comida':
          return 'the dinner';
        case 'casa':
          return 'the house gathering';
        case 'viaje':
          return 'the trip';
        case 'evento':
          return 'the event';
        default:
          return 'the invitation';
      }
    })();
    return `The funding threshold was met. That alone does not confirm ${subject}: the organizer confirmation is separate.`;
  }
  const subject = (() => {
    switch (template) {
      case 'comida':
        return 'la comida';
      case 'casa':
        return 'la reunión en casa';
      case 'viaje':
        return 'el viaje';
      case 'evento':
        return 'el evento';
      default:
        return 'la invitación';
    }
  })();
  return `El umbral de financiamiento se cumplió. Eso no confirma ${subject} por sí solo: la confirmación del organizador es independiente.`;
}
