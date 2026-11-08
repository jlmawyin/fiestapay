import type { Locale, ThemeKey } from '@fiestapay/shared';
import type { AgendaItem, EventInput, TemplateKind } from '../../types';

export function capitalLabel(value: string, locale: Locale): string {
  if (value.length === 0) return value;
  return value.charAt(0).toLocaleUpperCase(locale === 'en' ? 'en-US' : 'es-EC') + value.slice(1);
}

export const pad = (n: number): string => String(n).padStart(2, '0');

export const toLocalInput = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

export const defaultStart = (): string => {
  const d = new Date();
  d.setDate(d.getDate() + 5);
  d.setHours(14, 0, 0, 0);
  return toLocalInput(d);
};

export const plusHours = (local: string, hours: number): string => {
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return '';
  d.setHours(d.getHours() + hours);
  return toLocalInput(d);
};

export const mealForHour = (hour: number): 'desayuno' | 'almuerzo' | 'cena' => {
  if (hour < 11) return 'desayuno';
  if (hour < 17) return 'almuerzo';
  return 'cena';
};

export const dollars = (cents: number | null): string => (cents === null ? '' : (cents / 100).toFixed(2));

// Detection always covers both languages: a legacy Spanish example still
// warns in English and an English placeholder still warns in Spanish.
// Display labels and placeholders come from the catalog.
export const EXAMPLE_FIELDS = [
  {
    field: 'title',
    labelKey: 'exampleLabelTitle',
    examples: [
      'Nombre de la fiesta',
      'Nombre de la invitación',
      'Party name',
      'Invitation name',
      'Comida con excompañeros',
      'Cumpleaños en casa',
      'Viaje a la playa',
      'Charla de emprendimiento',
      'Meal with old classmates',
      'Birthday at home',
      'Beach trip with friends',
      'Startup talk',
    ],
    inputId: 'event-title',
  },
  {
    field: 'location',
    labelKey: 'exampleLabelLocation',
    examples: ['Lugar o direccion', 'Place or address'],
    inputId: 'event-location',
  },
  {
    field: 'description',
    labelKey: 'exampleLabelDescription',
    examples: ['Que van a hacer', 'What you will do'],
    inputId: 'event-desc',
  },
  {
    field: 'includes',
    labelKey: 'exampleLabelIncludes',
    examples: ['Separa con comas', 'Separate with commas'],
    inputId: 'event-includes',
  },
] as const;

export type ExampleFieldKey = (typeof EXAMPLE_FIELDS)[number]['field'];

export type ExampleLabelKey = (typeof EXAMPLE_FIELDS)[number]['labelKey'];

export type ExampleHit = {
  field: ExampleFieldKey;
  label: string;
  raw: string;
  inputId: string;
};

export type ExampleReview = {
  signature: string;
  hits: ExampleHit[];
};

export type Submission = { ok: false; message: string } | { ok: true; payload: EventInput };

export type PublishReview = {
  signature: string;
  payload: EventInput;
  hits: ExampleHit[];
  datesSuggested: boolean;
};

// Whole-field match only. Folding trim, case, and accents must not treat a
// longer sentence that merely discusses an example as the placeholder.
export const foldExampleText = (value: string): string =>
  value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export const matchesKnownExample = (value: string, example: string): boolean => {
  const folded = foldExampleText(value);
  return folded.length > 0 && folded === foldExampleText(example);
};

export function collectExampleHits(
  values: Record<ExampleFieldKey, string>,
  labelForKey: (key: ExampleLabelKey) => string,
): ExampleHit[] {
  return EXAMPLE_FIELDS.filter((item) =>
    item.examples.some((phrase) => matchesKnownExample(values[item.field], phrase)),
  ).map((item) => ({
    field: item.field,
    label: labelForKey(item.labelKey),
    raw: values[item.field],
    inputId: item.inputId,
  }));
}

/** Local "YYYY-MM-DDTHH:mm" values plus money strings, exactly as the form holds them. */
export interface EventFormFields {
  template: TemplateKind;
  title: string;
  description: string;
  organizerName: string;
  theme: ThemeKey;
  meal: 'desayuno' | 'almuerzo' | 'cena';
  startsAt: string;
  endsAt: string;
  location: string;
  includes: string[];
  priceDollars: string;
  capacity: string;
  goalDollars: string;
  minimumDollars: string;
  agenda: AgendaItem[];
  accessCode: string;
  accessTouched: boolean;
  deadlineLocal: string;
  deadlineTouched: boolean;
}

export interface EventFormContext {
  isEdit: boolean;
  isLegacy: boolean;
}

export interface EventFormValidationMessages {
  errTitle: string;
  errLocation: string;
  errStartFuture: string;
  errEndAfterStart: string;
  errPrice: string;
  errCapacity: string;
  errGoal: string;
  errMinimum: string;
  errMinOverGoal: string;
  errCeiling: string;
  errDeadlineInvalid: string;
  errDeadlineRange: string;
  errDeadlineNoMin: string;
  errDeadlineLegacy: string;
  errDeadlineCleared: string;
}

/**
 * Client validation plus the EventInput payload. The long form and the
 * creation wizard share this so the same input always sends the same
 * cents, dates, and optional fields in both languages.
 */
export function buildEventInput(
  fields: EventFormFields,
  ctx: EventFormContext,
  msg: EventFormValidationMessages,
): Submission {
  if (!fields.title.trim()) {
    return { ok: false, message: msg.errTitle };
  }
  if (!fields.location.trim()) {
    return { ok: false, message: msg.errLocation };
  }
  const startMs = new Date(fields.startsAt).getTime();
  const endMs = new Date(fields.endsAt).getTime();
  if (!Number.isFinite(startMs) || startMs <= Date.now()) {
    return { ok: false, message: msg.errStartFuture };
  }
  if (!Number.isFinite(endMs) || endMs <= startMs) {
    return { ok: false, message: msg.errEndAfterStart };
  }
  const priceNum = parseFloat(fields.priceDollars);
  if (!Number.isFinite(priceNum) || priceNum <= 0) {
    return { ok: false, message: msg.errPrice };
  }
  const priceCents = Math.round(priceNum * 100);
  const parsedCapacity = Number.parseInt(fields.capacity, 10);
  if (!Number.isInteger(parsedCapacity) || parsedCapacity < 1) {
    return { ok: false, message: msg.errCapacity };
  }

  let goalCents: number | null = null;
  if (fields.goalDollars.trim()) {
    const g = parseFloat(fields.goalDollars);
    if (!Number.isFinite(g) || g <= 0) {
      return { ok: false, message: msg.errGoal };
    }
    goalCents = Math.round(g * 100);
  }

  let minimumCents: number | null = null;
  if (fields.minimumDollars.trim()) {
    const mm = parseFloat(fields.minimumDollars);
    if (!Number.isFinite(mm) || mm <= 0) {
      return { ok: false, message: msg.errMinimum };
    }
    minimumCents = Math.round(mm * 100);
  }
  if (minimumCents !== null && goalCents !== null && minimumCents > goalCents) {
    return { ok: false, message: msg.errMinOverGoal };
  }
  const ceiling = priceCents * parsedCapacity;
  if ((goalCents !== null && ceiling < goalCents) || (minimumCents !== null && ceiling < minimumCents)) {
    return { ok: false, message: msg.errCeiling };
  }

  const deadlineFilled = fields.deadlineLocal.trim().length > 0;
  if (deadlineFilled) {
    const deadlineMs = new Date(fields.deadlineLocal).getTime();
    if (!Number.isFinite(deadlineMs)) {
      return { ok: false, message: msg.errDeadlineInvalid };
    }
    if (deadlineMs <= Date.now()) {
      return { ok: false, message: msg.errDeadlineRange };
    }
    if (deadlineMs > startMs) {
      return { ok: false, message: msg.errDeadlineRange };
    }
    if (minimumCents === null) {
      return { ok: false, message: msg.errDeadlineNoMin };
    }
    if (ctx.isLegacy) {
      return { ok: false, message: msg.errDeadlineLegacy };
    }
  } else if (ctx.isEdit && fields.deadlineTouched && minimumCents !== null) {
    return {
      ok: false,
      message: msg.errDeadlineCleared,
    };
  }

  const payload: EventInput = {
    title: fields.title.trim(),
    template: fields.template,
    meal: fields.meal,
    organizerName: fields.organizerName.trim() ? fields.organizerName.trim() : null,
    theme: fields.theme,
    description: fields.description.trim(),
    startsAt: new Date(fields.startsAt).toISOString(),
    endsAt: new Date(fields.endsAt).toISOString(),
    location: fields.location.trim(),
    includes: fields.includes,
    priceCents,
    capacity: parsedCapacity,
    goalCents,
    minimumCents,
    agenda: fields.agenda
      .filter((a) => a.title.trim() && a.time.trim())
      .map((a) => {
        const item: AgendaItem = {
          time: a.time.trim(),
          title: a.title.trim(),
        };
        if (a.speaker && a.speaker.trim()) {
          item.speaker = a.speaker.trim().slice(0, 80);
        }
        return item;
      }),
  };
  if (fields.accessTouched) payload.accessCode = fields.accessCode.trim() ? fields.accessCode.trim() : null;
  if (ctx.isEdit) {
    if (fields.deadlineTouched) {
      payload.fundingDeadlineAt = deadlineFilled ? new Date(fields.deadlineLocal).toISOString() : null;
    }
  } else if (deadlineFilled) {
    payload.fundingDeadlineAt = new Date(fields.deadlineLocal).toISOString();
  }

  return { ok: true, payload };
}

/** Review staleness key. Any edit after a review invalidates that review. */
export function reviewSignatureOf(state: Record<string, unknown>): string {
  return JSON.stringify(state);
}
