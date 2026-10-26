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
    accessCode: z.string().trim().min(4).max(64).nullable().optional(),
  })
  .refine(
    (v) => v.minimumCents === null || v.goalCents === null || v.minimumCents <= v.goalCents,
    { message: 'El minimo no puede superar la meta', path: ['minimumCents'] },
  )
  .refine((v) => Date.parse(v.endsAt) > Date.parse(v.startsAt), {
    message: 'La hora de fin debe ser posterior al inicio',
    path: ['endsAt'],
  })
  .refine((v) => Date.parse(v.startsAt) > Date.now() - 60_000, {
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
