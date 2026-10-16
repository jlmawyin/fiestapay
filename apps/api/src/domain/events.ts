import type { EventInput, FiestaEvent } from '@fiestapay/shared';
import { withTransaction, type Pool, type PoolClient } from '../db/pool.js';
import { conflict, forbidden, gone, notFound } from '../errors.js';
import { newId, newSlug } from '../lib/ids.js';
import { audit } from './audit.js';
import { EVENT_COLUMNS, eventTotals, loadFiestaEvent, lockEvent, toFiestaEvent, type EventRow, type Queryable } from './read.js';

const UNIQUE_VIOLATION = '23505';

export const isUniqueViolation = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === UNIQUE_VIOLATION;

export async function insertEvent(
  db: Queryable,
  sessionId: string,
  input: EventInput,
  generation: number,
): Promise<EventRow> {
  // Slugs are random; retry only guards against the astronomically unlikely collision.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = newSlug(input.template);
    try {
      const { rows } = await db.query<EventRow>(
        `INSERT INTO events (id, slug, organizer_session_id, generation, title, template, meal, description,
           starts_at, location, includes, agenda, price_cents, capacity, goal_cents, minimum_cents)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14,$15,$16)
         RETURNING ${EVENT_COLUMNS}`,
        [
          newId(),
          slug,
          sessionId,
          generation,
          input.title,
          input.template,
          input.meal,
          input.description,
          new Date(input.startsAt).toISOString(),
          input.location,
          JSON.stringify(input.includes),
          JSON.stringify(input.agenda),
          input.priceCents,
          input.capacity,
          input.goalCents,
          input.minimumCents,
        ],
      );
      return rows[0]!;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw conflict('No se pudo generar un enlace de invitacion unico');
}

export async function createEvent(pool: Pool, sessionId: string, input: EventInput): Promise<FiestaEvent> {
  return withTransaction(pool, async (client) => {
    const { rows } = await client.query<{ demo_generation: number }>(
      'SELECT demo_generation FROM sessions WHERE id = $1 FOR UPDATE',
      [sessionId],
    );
    const generation = rows[0]?.demo_generation ?? 0;
    const row = await insertEvent(client, sessionId, input, generation);
    await audit(client, row.id, 'event_created');
    return toFiestaEvent(row, await eventTotals(client, row.id));
  });
}

/** The preloaded demo party: Comida / almuerzo, USD 25 per person, goal USD 100, minimum USD 50. */
export function demoEventInput(now = new Date()): EventInput {
  const startsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  startsAt.setUTCHours(18, 0, 0, 0); // 13:00 in Ecuador (UTC-5)
  return {
    title: 'Almuerzo buffet de cumpleanos',
    template: 'comida',
    meal: 'almuerzo',
    description:
      'Demo de FiestaPay con pagos de prueba en el sandbox de PayPal. Cuota fija por persona, asistencia y pago separados.',
    startsAt: startsAt.toISOString(),
    location: 'Restaurante de demostracion, Guayaquil',
    includes: ['Buffet completo', 'Bebidas', 'Postre', 'Servicio'],
    priceCents: 2500,
    capacity: null,
    goalCents: 10000,
    minimumCents: 5000,
    agenda: [
      { time: '13:00', title: 'Bienvenida y brindis' },
      { time: '13:30', title: 'Buffet abierto' },
      { time: '15:00', title: 'Pastel y fotos' },
    ],
  };
}

async function seedDemoEvent(client: PoolClient, sessionId: string, generation: number): Promise<EventRow> {
  const row = await insertEvent(client, sessionId, demoEventInput(), generation);
  await audit(client, row.id, 'demo_seeded');
  return row;
}

/** Creates (or returns) the organizer demo space for this session. */
export async function startDemo(pool: Pool, sessionId: string): Promise<FiestaEvent> {
  return withTransaction(pool, async (client) => {
    const { rows } = await client.query<{ demo_generation: number }>(
      'SELECT demo_generation FROM sessions WHERE id = $1 FOR UPDATE',
      [sessionId],
    );
    const generation = rows[0]?.demo_generation ?? 0;
    const existing = await client.query<EventRow>(
      `SELECT ${EVENT_COLUMNS} FROM events
         WHERE organizer_session_id = $1 AND archived = false AND generation = $2
         ORDER BY created_at ASC LIMIT 1`,
      [sessionId, generation],
    );
    const row = existing.rows[0] ?? (await seedDemoEvent(client, sessionId, generation));
    return toFiestaEvent(row, await eventTotals(client, row.id));
  });
}

/**
 * Starts a new generation for this organizer only. Old events stay in the database with their
 * guests, orders and ledger intact so late captures still reconcile against them, but they are
 * archived and can no longer open new payments.
 */
export async function resetDemo(pool: Pool, sessionId: string): Promise<FiestaEvent> {
  return withTransaction(pool, async (client) => {
    const { rows } = await client.query<{ demo_generation: number }>(
      'UPDATE sessions SET demo_generation = demo_generation + 1 WHERE id = $1 RETURNING demo_generation',
      [sessionId],
    );
    const generation = rows[0]?.demo_generation;
    if (generation === undefined) throw notFound('Sesion no encontrada');

    const archived = await client.query<{ id: string }>(
      'UPDATE events SET archived = true WHERE organizer_session_id = $1 AND archived = false RETURNING id',
      [sessionId],
    );
    for (const old of archived.rows) await audit(client, old.id, 'demo_reset');

    const row = await seedDemoEvent(client, sessionId, generation);
    return toFiestaEvent(row, await eventTotals(client, row.id));
  });
}

export async function listOwnedEvents(pool: Pool, sessionId: string): Promise<FiestaEvent[]> {
  const { rows } = await pool.query<EventRow>(
    `SELECT ${EVENT_COLUMNS} FROM events WHERE organizer_session_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [sessionId],
  );
  const events: FiestaEvent[] = [];
  for (const row of rows) events.push(await loadFiestaEvent(pool, row));
  return events;
}

export function assertOrganizer(event: EventRow, sessionId: string): void {
  // Knowing the public slug never grants organizer authority.
  if (event.organizer_session_id !== sessionId) throw forbidden('Solo el organizador puede hacer esto');
}

export function assertActive(event: EventRow): void {
  if (event.archived) throw gone('Esta invitacion fue archivada por un reinicio de demo');
}

export async function confirmEvent(pool: Pool, sessionId: string, slug: string): Promise<FiestaEvent> {
  return withTransaction(pool, async (client) => {
    const found = await client.query<{ id: string }>('SELECT id FROM events WHERE slug = $1', [slug]);
    const eventId = found.rows[0]?.id;
    if (!eventId) throw notFound('Evento no encontrado');
    const event = await lockEvent(client, eventId);
    assertOrganizer(event, sessionId);
    assertActive(event);

    const totals = await eventTotals(client, event.id);
    if (event.minimum_cents !== null && totals.collectedCents < event.minimum_cents) {
      throw conflict('Aun no se alcanza el minimo para confirmar el evento');
    }
    if (!event.confirmed) {
      await client.query('UPDATE events SET confirmed = true WHERE id = $1', [event.id]);
      await audit(client, event.id, 'event_confirmed');
    }
    return toFiestaEvent({ ...event, confirmed: true }, totals);
  });
}
