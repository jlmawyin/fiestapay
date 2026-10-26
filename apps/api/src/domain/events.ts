import { timingSafeEqual } from 'node:crypto';
import type { EventInput, FiestaEvent } from '@fiestapay/shared';
import { withTransaction, type Pool, type PoolClient } from '../db/pool.js';
import { conflict, forbidden, gone, notFound } from '../errors.js';
import { newAdminKey, newId, newSlug, sha256 } from '../lib/ids.js';
import { assertAdminKey, digestMatches, rememberUnlock, revokeUnlocks } from './access.js';
import { audit } from './audit.js';
import { decideFundingIfDue, fundingBlocksNewCharge, fundingForNewEvent, fundingNow, nextFundingTerms, type FundingGate } from './funding.js';
import { isPastRetention, tombstoneEvent } from './retention.js';
import { EVENT_COLUMNS, eventTotals, loadFiestaEvent, lockEvent, toFiestaEvent, type EventRow, type Queryable } from './read.js';

const UNIQUE_VIOLATION = '23505';

export const isUniqueViolation = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === UNIQUE_VIOLATION;

export interface MintedEvent {
  event: FiestaEvent;
  /** Returned once. Absent when an existing keyed event is reused. */
  adminKey: string | null;
}

const codeHash = (code: string | null | undefined): Buffer | null => {
  if (code === undefined || code === null || code.trim().length === 0) return null;
  return sha256(code.trim());
};

const sameHash = (left: Buffer | null, right: Buffer | null): boolean => {
  if (!left || !right) return left === right;
  return left.length === right.length && timingSafeEqual(left, right);
};

export async function insertEvent(
  db: Queryable,
  sessionId: string,
  input: EventInput,
  generation: number,
  opts: { isDemo: boolean; adminKeyHash: Buffer; accessCodeHash: Buffer | null },
): Promise<EventRow> {
  // Slugs are random; retry only guards against the astronomically unlikely collision.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = newSlug(input.template);
    try {
      const funding = fundingForNewEvent(input, fundingNow());
      const { rows } = await db.query<EventRow>(
        `INSERT INTO events (id, slug, organizer_session_id, generation, title, template, meal, description,
           starts_at, ends_at, location, includes, agenda, price_cents, capacity, goal_cents, minimum_cents,
           is_demo, admin_key_hash, access_code_hash, funding_deadline_at, funding_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14,$15,$16,$17,$18,$19,$20,$21,$22)
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
          new Date(input.endsAt).toISOString(),
          input.location,
          JSON.stringify(input.includes),
          JSON.stringify(input.agenda),
          input.priceCents,
          input.capacity,
          input.goalCents,
          input.minimumCents,
          opts.isDemo,
          opts.adminKeyHash,
          opts.accessCodeHash,
          funding.deadline ? funding.deadline.toISOString() : null,
          funding.status,
        ],
      );
      return rows[0]!;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw conflict('No se pudo generar un enlace de invitacion unico');
}

async function mintAndInsert(
  client: PoolClient,
  sessionId: string,
  input: EventInput,
  generation: number,
  isDemo: boolean,
): Promise<MintedEvent> {
  const adminKey = newAdminKey();
  const row = await insertEvent(client, sessionId, input, generation, {
    isDemo,
    adminKeyHash: sha256(adminKey),
    accessCodeHash: codeHash(input.accessCode),
  });
  await audit(client, row.id, isDemo ? 'demo_seeded' : 'event_created');
  if (input.accessCode) await audit(client, row.id, 'access_code_set');
  return { event: toFiestaEvent(row, await eventTotals(client, row.id)), adminKey };
}

export async function createEvent(pool: Pool, sessionId: string, input: EventInput): Promise<MintedEvent> {
  return withTransaction(pool, async (client) => {
    const { rows } = await client.query<{ demo_generation: number }>(
      'SELECT demo_generation FROM sessions WHERE id = $1 FOR UPDATE',
      [sessionId],
    );
    const generation = rows[0]?.demo_generation ?? 0;
    return mintAndInsert(client, sessionId, input, generation, false);
  });
}

/** The preloaded demo party: Comida / almuerzo, USD 25 per person, goal USD 100, minimum USD 50. */
export function demoEventInput(now = new Date()): EventInput {
  const startsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  startsAt.setUTCHours(18, 0, 0, 0); // 13:00 in Ecuador (UTC-5)
  const endsAt = new Date(startsAt.getTime() + 4 * 60 * 60 * 1000);
  return {
    title: 'Almuerzo buffet de cumpleanos',
    template: 'comida',
    meal: 'almuerzo',
    description:
      'Demo de FiestaPay con pagos de prueba en el sandbox de PayPal. Cuota fija por persona, asistencia y pago separados.',
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    location: 'Restaurante de demostracion, Guayaquil',
    includes: ['Buffet completo', 'Bebidas', 'Postre', 'Servicio'],
    priceCents: 2500,
    capacity: 20,
    goalCents: 10000,
    minimumCents: 5000,
    agenda: [
      { time: '13:00', title: 'Bienvenida y brindis' },
      { time: '13:30', title: 'Buffet abierto' },
      { time: '15:00', title: 'Pastel y fotos' },
    ],
  };
}

/** Creates (or returns) the organizer demo space for this session. The key is minted only on create. */
export async function startDemo(pool: Pool, sessionId: string): Promise<MintedEvent> {
  return withTransaction(pool, async (client) => {
    const { rows } = await client.query<{ demo_generation: number }>(
      'SELECT demo_generation FROM sessions WHERE id = $1 FOR UPDATE',
      [sessionId],
    );
    const generation = rows[0]?.demo_generation ?? 0;
    const existing = await client.query<EventRow>(
      `SELECT ${EVENT_COLUMNS} FROM events
         WHERE organizer_session_id = $1 AND archived = false AND is_demo = true
           AND generation = $2 AND purged_at IS NULL
         ORDER BY created_at ASC LIMIT 1`,
      [sessionId, generation],
    );
    const row = existing.rows[0];
    if (row) return { event: toFiestaEvent(row, await eventTotals(client, row.id)), adminKey: null };
    return mintAndInsert(client, sessionId, demoEventInput(), generation, true);
  });
}

/**
 * Archives only demo events of this session. Real parties stay active, with their guests,
 * orders and ledger intact. Already archived demos stay archived so late captures still reconcile.
 */
export async function resetDemo(pool: Pool, sessionId: string): Promise<MintedEvent> {
  return withTransaction(pool, async (client) => {
    const { rows } = await client.query<{ demo_generation: number }>(
      'UPDATE sessions SET demo_generation = demo_generation + 1 WHERE id = $1 RETURNING demo_generation',
      [sessionId],
    );
    const generation = rows[0]?.demo_generation;
    if (generation === undefined) throw notFound('Sesion no encontrada');

    const archived = await client.query<{ id: string }>(
      `UPDATE events SET archived = true
         WHERE organizer_session_id = $1 AND archived = false AND is_demo = true AND purged_at IS NULL
         RETURNING id`,
      [sessionId],
    );
    for (const old of archived.rows) await audit(client, old.id, 'demo_reset');

    return mintAndInsert(client, sessionId, demoEventInput(), generation, true);
  });
}

export async function listOwnedEvents(pool: Pool, sessionId: string): Promise<FiestaEvent[]> {
  const { rows } = await pool.query<EventRow>(
    `SELECT ${EVENT_COLUMNS} FROM events
      WHERE organizer_session_id = $1 AND purged_at IS NULL
      ORDER BY created_at DESC LIMIT 100`,
    [sessionId],
  );
  const events: FiestaEvent[] = [];
  for (const row of rows) events.push(await loadFiestaEvent(pool, row));
  return events;
}

/** One-time key for a legacy event that has no digest yet. A keyed event never falls back to the session. */
export async function bootstrapAdminKey(pool: Pool, sessionId: string, slug: string): Promise<string> {
  return withTransaction(pool, async (client) => {
    const event = await lockBySlug(client, slug);
    if (event.purged_at || isPastRetention(event.ends_at)) throw gone('Este evento ya no esta disponible');
    if (event.admin_key_hash) throw forbidden('Este evento ya tiene clave de organizador');
    if (event.organizer_session_id !== sessionId) throw forbidden('Solo quien creo el evento puede emitir la primera clave');
    const adminKey = newAdminKey();
    await client.query('UPDATE events SET admin_key_hash = $2 WHERE id = $1', [event.id, sha256(adminKey)]);
    await audit(client, event.id, 'admin_key_bootstrapped');
    return adminKey;
  });
}

export function assertActive(event: EventRow, now = new Date()): void {
  if (event.purged_at || isPastRetention(event.ends_at, now)) throw gone('Este evento ya no esta disponible');
  if (event.archived) throw gone('Esta invitacion fue archivada por un reinicio de demo');
}

/** Close stops new RSVPs and payments. History stays readable. */
export function assertAcceptingGuests(event: EventRow): void {
  assertActive(event);
  if (event.closed_at) throw conflict('El organizador cerro las nuevas asistencias y pagos');
}

async function lockBySlug(client: PoolClient, slug: string): Promise<EventRow> {
  const found = await client.query<{ id: string }>('SELECT id FROM events WHERE slug = $1', [slug]);
  const eventId = found.rows[0]?.id;
  if (!eventId) throw notFound('Evento no encontrado');
  return lockEvent(client, eventId);
}

async function withAdmin<T>(
  pool: Pool,
  slug: string,
  presentedKey: string | null,
  fn: (client: PoolClient, event: EventRow) => Promise<T>,
): Promise<T> {
  const outcome = await withTransaction(pool, async (client) => {
    const event = await lockBySlug(client, slug);
    assertAdminKey(event, presentedKey);
    if (event.purged_at || isPastRetention(event.ends_at)) {
      // Commit the wipe, then answer 410. Throwing here would roll the tombstone back.
      if (!event.purged_at) await tombstoneEvent(client, event.id, 'retention_purged');
      return { expired: true as const };
    }
    return { expired: false as const, value: await fn(client, event) };
  });
  if (outcome.expired) throw gone('Este evento ya no esta disponible');
  return outcome.value;
}

export async function confirmEvent(pool: Pool, slug: string, presentedKey: string | null): Promise<FiestaEvent> {
  const outcome = await withAdmin<FundingGate<{ event: FiestaEvent }>>(pool, slug, presentedKey, async (client, locked) => {
    const settled = await decideFundingIfDue(client, locked);
    const blocked = fundingBlocksNewCharge(settled.event, settled.at);
    if (blocked) return { blocked };
    const event = settled.event;
    assertActive(event);
    const totals = await eventTotals(client, event.id);
    // A funded decision stays funded if later refunds lower the live balance.
    // Legacy and still-open events keep the live minimum check.
    if (event.funding_status !== 'funded' && event.minimum_cents !== null && totals.collectedCents < event.minimum_cents) {
      throw conflict('Aun no se alcanza el minimo para confirmar el evento');
    }
    if (!event.confirmed) {
      await client.query('UPDATE events SET confirmed = true WHERE id = $1', [event.id]);
      await audit(client, event.id, 'event_confirmed');
    }
    return { event: toFiestaEvent({ ...event, confirmed: true }, totals) };
  });
  if ('blocked' in outcome) throw conflict(outcome.blocked);
  return outcome.event;
}

const sameMoney = (event: EventRow, input: EventInput): boolean =>
  event.price_cents === input.priceCents &&
  event.goal_cents === input.goalCents &&
  event.minimum_cents === input.minimumCents;

export async function updateEvent(
  pool: Pool,
  slug: string,
  presentedKey: string | null,
  input: EventInput,
): Promise<FiestaEvent> {
  return withAdmin(pool, slug, presentedKey, async (client, event) => {
    if (event.archived) throw gone('Esta invitacion fue archivada por un reinicio de demo');
    const totals = await eventTotals(client, event.id);
    if (input.capacity < totals.confirmedPeople) {
      throw conflict('El cupo no puede ser menor que las reservas confirmadas');
    }
    const blockers = await client.query<{ guests: number; orders: number }>(
      `SELECT
         (SELECT COUNT(*)::int FROM guests WHERE event_id = $1) AS guests,
         (SELECT COUNT(*)::int FROM orders WHERE event_id = $1) AS orders`,
      [event.id],
    );
    const usage = blockers.rows[0];
    if (!sameMoney(event, input) && ((usage?.guests ?? 0) > 0 || (usage?.orders ?? 0) > 0)) {
      throw conflict('No se pueden cambiar la cuota, la meta o el minimo cuando ya hay invitados o pagos');
    }
    const terms = nextFundingTerms(event, input, new Date(input.startsAt), usage?.orders ?? 0, fundingNow());

    let accessCodeHash: Buffer | null | undefined;
    if (input.accessCode === undefined) accessCodeHash = undefined;
    else if (input.accessCode === null || input.accessCode.trim().length === 0) accessCodeHash = null;
    else accessCodeHash = sha256(input.accessCode.trim());

    const changeCode = accessCodeHash !== undefined;
    const nextHash: Buffer | null = accessCodeHash === undefined ? event.access_code_hash : accessCodeHash;
    const codeChanged = changeCode && !sameHash(event.access_code_hash, nextHash);
    const { rows } = await client.query<EventRow>(
      `UPDATE events SET
         title = $2, template = $3, meal = $4, description = $5, starts_at = $6, ends_at = $7,
         location = $8, includes = $9::jsonb, agenda = $10::jsonb, price_cents = $11, capacity = $12,
         goal_cents = $13, minimum_cents = $14,
         access_code_hash = CASE WHEN $15::boolean THEN $16::bytea ELSE access_code_hash END,
         funding_deadline_at = $17, funding_status = $18
       WHERE id = $1
       RETURNING ${EVENT_COLUMNS}`,
      [
        event.id,
        input.title,
        input.template,
        input.meal,
        input.description,
        new Date(input.startsAt).toISOString(),
        new Date(input.endsAt).toISOString(),
        input.location,
        JSON.stringify(input.includes),
        JSON.stringify(input.agenda),
        input.priceCents,
        input.capacity,
        input.goalCents,
        input.minimumCents,
        changeCode,
        nextHash,
        terms.deadline ? terms.deadline.toISOString() : null,
        terms.status,
      ],
    );
    const updated = rows[0]!;
    // undefined keeps the hash. null clears it. A different digest replaces it and drops old unlocks.
    if (codeChanged) {
      await revokeUnlocks(client, event.id);
      await audit(client, event.id, nextHash === null ? 'access_code_cleared' : 'access_code_set');
    }
    await audit(client, event.id, 'event_updated');
    return toFiestaEvent(updated, totals);
  });
}

export async function closeEvent(pool: Pool, slug: string, presentedKey: string | null): Promise<FiestaEvent> {
  return withAdmin(pool, slug, presentedKey, async (client, event) => {
    if (event.archived) throw gone('Esta invitacion fue archivada por un reinicio de demo');
    const { rows } = await client.query<EventRow>(
      `UPDATE events SET closed_at = COALESCE(closed_at, now()) WHERE id = $1 RETURNING ${EVENT_COLUMNS}`,
      [event.id],
    );
    if (!event.closed_at) await audit(client, event.id, 'event_closed');
    return toFiestaEvent(rows[0]!, await eventTotals(client, event.id));
  });
}

/** Locks the event, then tombstones. In-flight money waits on the same row lock and then sees purged. */
export async function deleteEvent(pool: Pool, slug: string, presentedKey: string | null): Promise<void> {
  await withAdmin(pool, slug, presentedKey, async (client, event) => {
    // A due minimum is decided before the tombstone commits. The deadline,
    // price and minimum stay on the row so a later pass can still refund.
    const settled = await decideFundingIfDue(client, event);
    await tombstoneEvent(client, settled.event.id, 'event_deleted');
  });
}

export async function unlockEvent(pool: Pool, sessionId: string, slug: string, code: string): Promise<void> {
  await withTransaction(pool, async (client) => {
    const event = await lockBySlug(client, slug);
    if (event.purged_at || isPastRetention(event.ends_at)) throw gone('Este evento ya no esta disponible');
    if (!event.access_code_hash) return;
    if (!digestMatches(event.access_code_hash, code)) throw forbidden('Codigo de acceso requerido');
    await rememberUnlock(client, event.id, sessionId);
  });
}
