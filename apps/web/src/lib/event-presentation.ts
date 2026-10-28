import {
  TEMPLATE_INVITE_COPY,
  contrastRatio,
  defaultThemeFor,
  resolveTheme,
  suggestTheme,
  themeContrastPairs,
  usd,
  type FiestaEvent,
  type TemplateKind,
  type ThemeDefinition,
  type ThemeKey,
} from '@fiestapay/shared';

export {
  TEMPLATE_INVITE_COPY,
  contrastRatio,
  defaultThemeFor,
  resolveTheme,
  suggestTheme,
  themeContrastPairs,
  type ThemeDefinition,
  type ThemeKey,
};

const SHARE_TIME_ZONE = 'America/Guayaquil';

/** Official click-to-chat endpoint. One encodeURIComponent pass, no network call. */
export const WHATSAPP_SEND_ENDPOINT = 'https://api.whatsapp.com/send';

const CALENDAR = String.fromCodePoint(0x1f4c5);
const PIN = String.fromCodePoint(0x1f4cd);
const COIN = String.fromCodePoint(0x1f4b5);

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

export function formatInstantInZone(iso: string, timeZone = SHARE_TIME_ZONE): ZonedInstant {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { date: iso, time: '', label: iso };
  const day = new Intl.DateTimeFormat('es-EC', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
  const time = new Intl.DateTimeFormat('es-EC', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
  return { date: day, time, label: `${day}, ${time} (${timeZone})` };
}

/** Uses the end instant. A cross-day range keeps both calendar dates. */
export function formatEventRange(startsAt: string, endsAt?: string | null, timeZone = SHARE_TIME_ZONE): string {
  const start = formatInstantInZone(startsAt, timeZone);
  if (!endsAt) return `Inicio: ${start.label}. Hora de fin no indicada.`;
  const end = formatInstantInZone(endsAt, timeZone);
  if (start.date === end.date) return `Inicio: ${start.label}. Fin: ${end.time} (${timeZone}).`;
  return `Inicio: ${start.label}. Fin: ${end.label}.`;
}

export function eventRangeIsCrossDay(startsAt: string, endsAt?: string | null, timeZone = SHARE_TIME_ZONE): boolean {
  if (!endsAt) return false;
  const start = formatInstantInZone(startsAt, timeZone);
  const end = formatInstantInZone(endsAt, timeZone);
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

export function buildInviteShareText(input: InviteShareInput): string {
  const theme = resolveTheme(input.template, input.theme);
  const copy = TEMPLATE_INVITE_COPY[input.template];
  const who = input.organizerName?.trim();
  const greeting = who ? `${plainShareText(who)} te invita.` : 'Te invitan.';
  const when = formatEventRange(input.startsAt, input.endsAt);
  const lines = [
    theme.phrase,
    greeting,
    plainShareText(input.title),
    `${CALENDAR} ${when}`,
    `${PIN} ${plainShareText(input.location)}`,
    `${COIN} Cuota por persona: ${usd(input.priceCents)}`,
    copy.welcome,
    shareableInviteUrl(input.inviteUrl),
  ];
  return lines.join('\n');
}

export function buildInviteShareUrl(input: InviteShareInput): string {
  return whatsAppShareUrl(buildInviteShareText(input));
}

export function countPhrase(count: number, singular: string, plural: string): string {
  const safe = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
  return `${safe} ${safe === 1 ? singular : plural}`;
}

export function attendanceSummary(options: {
  parties?: number;
  paidPeople?: number;
  capacity?: number | null;
}): string {
  const parts: string[] = [];
  if (typeof options.parties === 'number' && Number.isFinite(options.parties)) {
    parts.push(countPhrase(options.parties, 'invitado', 'invitados'));
  }
  if (typeof options.paidPeople === 'number' && Number.isFinite(options.paidPeople)) {
    parts.push(countPhrase(options.paidPeople, 'persona pagada', 'personas pagadas'));
  } else {
    parts.push('Personas pagadas: por consultar');
  }
  if (typeof options.capacity === 'number' && Number.isFinite(options.capacity)) {
    parts.push(`cupo ${Math.trunc(options.capacity)}`);
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

export function guestPayLabel(paidCents: number, dueCents: number): string {
  if (paidCents > 0 && dueCents === 0) return 'Pagado';
  if (paidCents > 0 && dueCents > 0) return `Abonado ${usd(paidCents)}. Falta ${usd(dueCents)}`;
  if (dueCents > 0) return `Pago pendiente. Falta ${usd(dueCents)}`;
  return 'Pago pendiente';
}

export function guestFundingOutcome(event: Pick<FiestaEvent, 'fundingStatus' | 'refundSummary' | 'confirmed'>): string | null {
  if (event.fundingStatus === 'failed') {
    const pending = (event.refundSummary?.pendingCents ?? 0) > 0 || (event.refundSummary?.needsReviewCents ?? 0) > 0;
    const refunded = (event.refundSummary?.refundedCents ?? 0) > 0;
    if (pending) return 'Mínimo no alcanzado. Devolución en proceso.';
    if (refunded) return 'Mínimo no alcanzado. Devuelto.';
    return 'Mínimo no alcanzado.';
  }
  if (event.fundingStatus === 'funded') {
    return event.confirmed
      ? 'El mínimo se alcanzó y la invitación está confirmada.'
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

export function organizerLine(name: string | null | undefined): string | null {
  const clean = name?.trim();
  if (!clean) return null;
  return `Organiza ${clean}`;
}

export function namedGreeting(name: string | null | undefined): string | null {
  const clean = name?.trim();
  if (!clean) return null;
  return `${clean} te invita.`;
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

export function guestEntryCopy(template?: TemplateKind | null): { welcome: string; join: string } {
  if (template && TEMPLATE_INVITE_COPY[template]) {
    const copy = TEMPLATE_INVITE_COPY[template];
    return { welcome: copy.welcome, join: copy.join };
  }
  return { welcome: NEUTRAL_GUEST_ENTRY.welcome, join: NEUTRAL_GUEST_ENTRY.join };
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

const COVERED_WHEN_PAID: Record<TemplateKind, string> = {
  comida: 'Tu pago de esta comida ya está cubierto. Eso no confirma la comida ni reserva un lugar.',
  casa: 'Tu pago para esta casa ya está cubierto. Eso no confirma la reunión ni reserva un lugar.',
  viaje: 'Tu pago de este viaje ya está cubierto. Eso no confirma el viaje ni reserva un lugar.',
  evento: 'Tu pago de este evento ya está cubierto. Eso no confirma el evento ni reserva un lugar.',
};

const COVERED_NEUTRAL = 'Tu pago ya está cubierto. Eso no confirma el encuentro ni reserva un lugar.';
const NOTHING_DUE = 'No hay saldo pendiente. Eso no confirma el encuentro ni reserva un lugar.';

/** Honest zero-due status. It does not say the gathering is confirmed or reserved. */
export function guestCoveredCopy(template: TemplateKind | null | undefined, paidCents: number): string {
  if (!(paidCents > 0)) return NOTHING_DUE;
  if (template && COVERED_WHEN_PAID[template]) return COVERED_WHEN_PAID[template];
  return COVERED_NEUTRAL;
}

/** Organizer confirmation badge. Reaching the minimum is a different fact. */
export function organizerConfirmedBadge(template?: TemplateKind | null): string {
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
export function fundedIsNotConfirmationNote(template?: TemplateKind | null): string {
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
