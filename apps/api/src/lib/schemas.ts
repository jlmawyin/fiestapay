import { ORGANIZER_NAME_MAX, TEMPLATE_THEMES, themeBelongs } from '@fiestapay/shared';
import { z } from 'zod';
import { badRequest } from '../errors.js';

export const MAX_PRICE_CENTS = 1_000_000; // USD 10,000 per person
export const MAX_GOAL_CENTS = 10_000_000; // USD 100,000 per event
export const MAX_COMPANIONS = 20;
export const MAX_CAPACITY = 1000;

const trimmed = (max: number) => z.string().trim().max(max);
const requiredText = (max: number) => trimmed(max).min(1);
const cents = (max: number) => z.number().int().min(1).max(max);

const isoDate = z
  .string()
  .trim()
  .min(4)
  .max(40)
  .refine((v) => {
    const ms = Date.parse(v);
    if (!Number.isFinite(ms)) return false;
    const year = new Date(ms).getUTCFullYear();
    return year >= 2000 && year <= 2100;
  }, 'Fecha invalida');

export const agendaItemSchema = z.object({
  time: requiredText(20),
  title: requiredText(120),
  speaker: trimmed(80).optional(),
});

const THEME_KEYS = [
  ...TEMPLATE_THEMES.comida,
  ...TEMPLATE_THEMES.casa,
  ...TEMPLATE_THEMES.viaje,
  ...TEMPLATE_THEMES.evento,
] as const;

export const eventInputSchema = z
  .object({
    title: requiredText(120),
    template: z.enum(['comida', 'casa', 'viaje', 'evento']),
    meal: z.enum(['desayuno', 'almuerzo', 'cena']),
    description: trimmed(2000),
    startsAt: isoDate,
    endsAt: isoDate,
    location: requiredText(200),
    includes: z.array(requiredText(120)).max(20),
    priceCents: cents(MAX_PRICE_CENTS),
    capacity: z.number().int().min(1).max(MAX_CAPACITY),
    goalCents: cents(MAX_GOAL_CENTS).nullable(),
    minimumCents: cents(MAX_GOAL_CENTS).nullable(),
    agenda: z.array(agendaItemSchema).max(50),
    organizerName: z.string().trim().max(ORGANIZER_NAME_MAX).nullable().optional(),
    theme: z.string().trim().pipe(z.enum(THEME_KEYS)).optional(),
    accessCode: z.string().trim().min(4).max(64).nullable().optional(),
    fundingDeadlineAt: isoDate.nullable().optional(),
  })
  .refine((v) => v.theme === undefined || themeBelongs(v.template, v.theme), {
    message: 'Tema invalido para esta plantilla',
    path: ['theme'],
  })
  .refine(
    (v) => v.minimumCents === null || v.goalCents === null || v.minimumCents <= v.goalCents,
    { message: 'El minimo no puede superar la meta', path: ['minimumCents'] },
  )
  .refine((v) => Date.parse(v.endsAt) > Date.parse(v.startsAt), {
    message: 'La hora de fin debe ser posterior al inicio',
    path: ['endsAt'],
  })
  .refine(
    (v) => {
      if (v.fundingDeadlineAt === undefined || v.fundingDeadlineAt === null) return true;
      const deadline = Date.parse(v.fundingDeadlineAt);
      return deadline > Date.now() && deadline <= Date.parse(v.startsAt);
    },
    { message: 'La fecha limite debe ser posterior a ahora y no posterior al inicio', path: ['fundingDeadlineAt'] },
  )
  .refine((v) => v.minimumCents !== null || v.fundingDeadlineAt == null, {
    message: 'Sin minimo no hay fecha limite de financiamiento',
    path: ['fundingDeadlineAt'],
  })
  // Equal to now is already past for a start. The previous 60s skew accepted it.
  .refine((v) => Date.parse(v.startsAt) > Date.now(), {
    message: 'El inicio debe ser en el futuro',
    path: ['startsAt'],
  })
  .refine(
    (v) => {
      const ceiling = v.priceCents * v.capacity;
      if (!Number.isSafeInteger(ceiling)) return false;
      if (v.goalCents !== null && ceiling < v.goalCents) return false;
      if (v.minimumCents !== null && ceiling < v.minimumCents) return false;
      return true;
    },
    { message: 'La cuota por el cupo debe cubrir la meta y el minimo', path: ['capacity'] },
  );

export const unlockSchema = z.object({
  code: z.string().trim().min(1).max(64),
});

export const joinSchema = z.object({ name: requiredText(60) });

export const rsvpSchema = z.object({
  status: z.enum(['yes', 'no', 'maybe']),
  companions: z.number().int().min(0).max(MAX_COMPANIONS),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const orderSchema = z.object({
  quoteId: z.string().trim().regex(UUID_RE, 'Identificador de cotizacion invalido'),
  confirmed: z.literal(true),
});

export const chatSchema = z.object({ message: requiredText(1000) });
const MESSAGE_ID_RE = /^[1-9][0-9]{0,18}$/;

export const slugParamSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'Slug invalido'),
});

export const orderIdParamSchema = z.object({
  orderId: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .regex(/^[A-Za-z0-9-]+$/, 'Identificador invalido'),
});

export const guestIdParamSchema = z.object({
  slug: slugParamSchema.shape.slug,
  guestId: z.string().trim().regex(UUID_RE, 'Identificador invalido'),
});

export const conversationIdParamSchema = z.object({
  slug: slugParamSchema.shape.slug,
  conversationId: z.string().trim().regex(UUID_RE, 'Identificador invalido'),
});

export const messageIdParamSchema = z.object({
  slug: slugParamSchema.shape.slug,
  messageId: z.string().trim().regex(MESSAGE_ID_RE, 'Identificador invalido'),
});

export const transcriptQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  before: z.string().trim().regex(MESSAGE_ID_RE, 'Cursor invalido').optional(),
  conversationId: z.string().trim().regex(UUID_RE, 'Identificador invalido').optional(),
});

const CLIENT_MONEY_STATE_KEYS = [
  'funded',
  'paid',
  'refunded',
  'fundingStatus',
  'fundingBasisCents',
  'collectedCents',
  'confirmed',
  'minimumReached',
  'paidPeople',
  'refundSummary',
  'feeEstimate',
] as const;

/** Rejects a body that tries to declare paid, funded or refunded. `allowed` keeps legitimate keys such as order confirmation. */
export function assertNoClientMoneyState(value: unknown, allowed: readonly string[] = []): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const skip = new Set(allowed);
  for (const key of CLIENT_MONEY_STATE_KEYS) {
    if (skip.has(key)) continue;
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      throw badRequest('El cliente no puede fijar el estado de pago o de financiamiento');
    }
  }
}

/** Parses with zod and converts failures into 400 {error}. */
export function parseOr400<T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: z.ZodError } }, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success || result.data === undefined) {
    const issue = result.error?.issues?.[0];
    const where = issue?.path?.length ? `${issue.path.join('.')}: ` : '';
    throw badRequest(`${where}${issue?.message ?? 'Datos invalidos'}`);
  }
  return result.data;
}
