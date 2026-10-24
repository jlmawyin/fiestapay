import { usd, type Quote } from '@fiestapay/shared';
import { z } from 'zod';
import type { Pool } from '../db/pool.js';
import { MAX_COMPANIONS } from '../lib/schemas.js';
import { createQuoteForSession } from '../domain/quotes.js';
import { eventTotals, guestPaidCents, obligationCents, type EventRow, type GuestRow } from '../domain/read.js';

/** JSON-schema-ish declaration the Gemini API expects for native function calling. */
export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters?: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolContext {
  pool: Pool;
  sessionId: string;
  event: EventRow;
  guest: GuestRow | null;
  quoteTtlSeconds: number;
}

export interface ToolOutcome {
  /** Payload handed back to the model as a functionResponse. */
  response: Record<string, unknown>;
  /** Quote card to render in the UI; the human still has to confirm it. */
  quote?: Quote;
  /** Reviewable UI action proposals, e.g. "rsvp:yes:1". Never executed by the model. */
  actions?: string[];
}

/**
 * Every tool is either a read of authorized server state or a server-computed quote. None of
 * them moves money and none of them writes attendance: an RSVP coming from the model is only a
 * proposal that the person must confirm in the interface.
 */
export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'get_event_details',
    description:
      'Datos del evento guardados por el organizador: titulo, plantilla, momento, descripcion, fecha, lugar, que incluye, agenda, precio por persona y cupo.',
  },
  {
    name: 'get_my_status',
    description:
      'Asistencia y pago de la persona con la que conversas: estado de RSVP, acompanantes, pagado verificado y saldo pendiente.',
  },
  {
    name: 'get_collection_progress',
    description: 'Progreso de recaudacion del evento: recaudado bruto verificado, meta, minimo y personas confirmadas.',
  },
  {
    name: 'prepare_quote',
    description:
      'Calcula en el servidor la cuota que le toca pagar a esta persona segun su RSVP confirmado y lo ya pagado. Devuelve una cotizacion con vencimiento para que la persona la revise y confirme en la interfaz. No cobra ni aprueba nada.',
  },
  {
    name: 'propose_rsvp',
    description:
      'Propone un cambio de asistencia para que la persona lo revise y confirme en la interfaz. No cambia nada por si mismo.',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['yes', 'no', 'maybe'],
          description: 'yes = asiste, no = no asiste, maybe = quiza',
        },
        companions: {
          type: 'integer',
          description: 'Acompanantes ademas de la persona titular (0 o mas).',
        },
      },
      required: ['status', 'companions'],
    },
  },
];

export const TOOL_NAMES = new Set(TOOL_DECLARATIONS.map((d) => d.name));

const rsvpProposalSchema = z.object({
  status: z.enum(['yes', 'no', 'maybe']),
  companions: z.number().int().min(0).max(MAX_COMPANIONS),
});

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

function eventDetails(event: EventRow, totals: { collectedCents: number; confirmedPeople: number }) {
  return {
    titulo: event.title,
    plantilla: event.template,
    momento: event.meal,
    descripcion: event.description,
    empieza: event.starts_at.toISOString(),
    lugar: event.location,
    incluye: Array.isArray(event.includes) ? event.includes : [],
    agenda: Array.isArray(event.agenda) ? event.agenda : [],
    precio_por_persona: usd(event.price_cents),
    precio_por_persona_centavos: event.price_cents,
    cupo_maximo: event.capacity,
    personas_confirmadas: totals.confirmedPeople,
    evento_confirmado: event.confirmed,
  };
}

export async function runTool(ctx: ToolContext, name: string, rawArgs: unknown): Promise<ToolOutcome> {
  const args = asRecord(rawArgs);

  switch (name) {
    case 'get_event_details': {
      const totals = await eventTotals(ctx.pool, ctx.event.id);
      return { response: eventDetails(ctx.event, totals) };
    }

    case 'get_my_status': {
      if (!ctx.guest) {
        return { response: { unido: false, nota: 'Esta persona todavia no se unio a la invitacion.' } };
      }
      const paid = await guestPaidCents(ctx.pool, ctx.guest.id);
      const due = Math.max(0, obligationCents(ctx.event, ctx.guest) - paid);
      return {
        response: {
          unido: true,
          nombre: ctx.guest.name,
          asistencia: ctx.guest.status,
          acompanantes: ctx.guest.companions,
          pagado: usd(paid),
          pagado_centavos: paid,
          pendiente: usd(due),
          pendiente_centavos: due,
          estado_legible:
            ctx.guest.status !== 'yes'
              ? 'Asistencia sin confirmar'
              : due === 0 && paid > 0
                ? 'Confirmado, pagado'
                : 'Confirmado, sin pagar',
        },
      };
    }

    case 'get_collection_progress': {
      const totals = await eventTotals(ctx.pool, ctx.event.id);
      const minimum = ctx.event.minimum_cents;
      return {
        response: {
          recaudado_bruto: usd(totals.collectedCents),
          recaudado_bruto_centavos: totals.collectedCents,
          meta: ctx.event.goal_cents === null ? null : usd(ctx.event.goal_cents),
          minimo: minimum === null ? null : usd(minimum),
          minimo_alcanzado: minimum !== null && totals.collectedCents >= minimum,
          personas_confirmadas: totals.confirmedPeople,
          nota: 'Son capturas verificadas menos reembolsos, antes de comisiones.',
        },
      };
    }

    case 'prepare_quote': {
      if (!ctx.guest) {
        return {
          response: {
            ok: false,
            motivo: 'La persona debe unirse a la invitacion desde la interfaz antes de cotizar.',
          },
        };
      }
      if (ctx.guest.status !== 'yes') {
        return {
          response: {
            ok: false,
            motivo: 'Para cotizar hace falta confirmar la asistencia primero desde la interfaz.',
          },
          actions: [`rsvp:yes:${ctx.guest.companions}`],
        };
      }
      // Amounts come only from the event price, the confirmed RSVP and verified payments.
      const quote = await createQuoteForSession(ctx.pool, ctx.sessionId, ctx.event.slug, ctx.quoteTtlSeconds);
      return {
        response: {
          ok: true,
          resumen: quote.summary,
          personas: quote.people,
          total: usd(quote.totalCents),
          a_pagar: usd(quote.amountCents),
          a_pagar_centavos: quote.amountCents,
          vence: quote.expiresAt,
          nota: 'Repite el resumen y pide confirmacion; el pago solo ocurre si la persona lo aprueba en la interfaz y en PayPal.',
        },
        quote,
        actions: quote.amountCents > 0 ? ['pay'] : [],
      };
    }

    case 'propose_rsvp': {
      const parsed = rsvpProposalSchema.safeParse({
        status: args.status,
        companions: typeof args.companions === 'number' ? args.companions : Number(args.companions ?? 0),
      });
      if (!parsed.success) {
        return { response: { ok: false, motivo: 'Datos de asistencia invalidos; pide los datos otra vez.' } };
      }
      const { status, companions } = parsed.data;
      // Deliberately no write: the interface must present this change for human confirmation.
      return {
        response: {
          ok: true,
          propuesta: { asistencia: status, acompanantes: companions },
          requiere_confirmacion_humana: true,
          nota: 'La propuesta se muestra en la interfaz; la persona la confirma ahi. No afirmes que ya quedo registrada.',
        },
        actions: [`rsvp:${status}:${companions}`],
      };
    }

    default:
      return { response: { ok: false, motivo: `Herramienta desconocida: ${name}` } };
  }
}
