import { timingSafeEqual } from 'node:crypto';
import { defaultThemeFor, normalizeOrganizerName, themeBelongs, type EventInput, type FiestaEvent, type Locale } from '@fiestapay/shared';
import { withTransaction, type Pool, type PoolClient } from '../db/pool.js';
import { badRequest, conflict, forbidden, gone, notFound } from '../errors.js';
import { newAdminKey, newId, newSlug, sha256 } from '../lib/ids.js';
import {
  assertAdminKey,
  assertGroupPrivateEventOnPortalHost,
  digestMatches,
  groupPrivateEventHiddenOnPortal,
  rememberUnlock,
  revokeUnlocks,
  type EventPortalGate,
} from './access.js';
import { audit } from './audit.js';
import { decideFundingIfDue, fundingBlocksNewCharge, fundingForNewEvent, fundingNow, nextFundingTerms, type FundingGate } from './funding.js';
import { legacyTenantId } from '../lib/host.js';
import { paymentProviderIdForEventId, paymentProviderIdForTenant } from '../payments/provider.js';
import { isPastRetention, tombstoneEvent } from './retention.js';
import { chooseEventSubdomain, ROOT_EVENTS_TENANT_SLUG } from './subdomains.js';
import {
  EVENT_COLUMNS,
  eventForClient,
  eventTotals,
  loadFiestaEvent,
  lockEvent,
  type EventRow,
  type FiestaEventWithDemo,
  type Queryable,
} from './read.js';

const UNIQUE_VIOLATION = '23505';
export type EventTenantMode = 'legacy' | 'none';

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

const presentationOf = (input: EventInput): { organizerName: string | null; theme: string } => {
  if (input.theme !== undefined && !themeBelongs(input.template, input.theme)) {
    throw badRequest('theme: Tema invalido para esta plantilla');
  }
  return {
    organizerName: normalizeOrganizerName(input.organizerName),
    theme: input.theme ?? defaultThemeFor(input.template).key,
  };
};

export async function insertEvent(
  db: Queryable,
  sessionId: string,
  input: EventInput,
  generation: number,
  opts: {
    isDemo: boolean;
    adminKeyHash: Buffer;
    accessCodeHash: Buffer | null;
    /** NAP-S2: las reuniones nuevas de raíz/evento no cobran por PayPal. */
    tenantMode?: EventTenantMode;
  },
): Promise<EventRow> {
  // NAP-S2: reintenta si otro request ganó el mismo subdominio o el slug aleatorio.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = newSlug(input.template);
    try {
      const presentation = presentationOf(input);
      const subdomain = await chooseEventSubdomain(db, input.title, input.preferredSubdomain);
      const tenantId = opts.tenantMode === 'none' ? await rootEventsTenantId(db) : await legacyTenantId(db);
      const paymentProvider = await paymentProviderIdForTenant(db, tenantId);
      const funding = fundingForNewEvent(input, fundingNow(), paymentProvider);
      const { rows } = await db.query<EventRow>(
        `INSERT INTO events (id, slug, tenant_id, organizer_session_id, generation, title, template, meal, description,
           starts_at, ends_at, location, includes, agenda, price_cents, capacity, goal_cents, minimum_cents,
           is_demo, admin_key_hash, access_code_hash, funding_deadline_at, funding_status,
           organizer_name, theme, subdomain, avatar_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
         RETURNING ${EVENT_COLUMNS}`,
        [
          newId(),
          slug,
          tenantId,
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
          presentation.organizerName,
          presentation.theme,
          subdomain,
          input.avatarId ?? null,
        ],
      );
      return rows[0]!;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw conflict('No se pudo generar un enlace de invitacion unico');
}

/**
 * NAP-S2: tenant interno para reuniones sin sitio; lo crea la migración 0017, no una transacción
 * de alta. Su slug no es una etiqueta DNS válida.
 */
async function rootEventsTenantId(db: Queryable): Promise<string> {
  const { rows } = await db.query<{ id: string }>('SELECT id FROM tenants WHERE slug = $1 LIMIT 1', [
    ROOT_EVENTS_TENANT_SLUG,
  ]);
  if (!rows[0]) throw new Error('tenant interno de reuniones no disponible');
  return rows[0].id;
}

async function mintAndInsert(
  client: PoolClient,
  sessionId: string,
  input: EventInput,
  generation: number,
  isDemo: boolean,
  tenantMode: EventTenantMode = 'legacy',
): Promise<MintedEvent> {
  const adminKey = newAdminKey();
  const row = await insertEvent(client, sessionId, input, generation, {
    isDemo,
    adminKeyHash: sha256(adminKey),
    accessCodeHash: codeHash(input.accessCode),
    tenantMode,
  });
  await audit(client, row.id, isDemo ? 'demo_seeded' : 'event_created');
  if (input.accessCode) await audit(client, row.id, 'access_code_set');
  return {
    event: await eventForClient(client, row, await eventTotals(client, row.id)),
    adminKey,
  };
}

export async function createEvent(
  pool: Pool,
  sessionId: string,
  input: EventInput,
  tenantMode: EventTenantMode = 'legacy',
): Promise<MintedEvent> {
  return withTransaction(pool, async (client) => {
    const { rows } = await client.query<{ demo_generation: number }>(
      'SELECT demo_generation FROM sessions WHERE id = $1 FOR UPDATE',
      [sessionId],
    );
    const generation = rows[0]?.demo_generation ?? 0;
    return mintAndInsert(client, sessionId, input, generation, false, tenantMode);
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
      'Demo de Somos Panas con pagos de prueba en el sandbox de PayPal. Cuota fija por persona, asistencia y pago separados.',
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
    if (row) {
      return {
        event: await eventForClient(client, row, await eventTotals(client, row.id)),
        adminKey: null,
      };
    }
    return mintAndInsert(client, sessionId, demoEventInput(), generation, true);
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Judge-demo content in the request language. Spanish reproduces the web's
 * `privateDemoEventInput()` values exactly; English is a natural translation of the same
 * fictional party. Dates are relative to `now` and never copied from an older demo.
 */
export function demoEventInputForLocale(locale: Locale, now = new Date()): EventInput {
  const startsAt = new Date(now.getTime() + 7 * DAY_MS);
  startsAt.setUTCHours(18, 0, 0, 0); // 13:00 in America/Guayaquil
  const endsAt = new Date(startsAt.getTime() + 4 * 60 * 60 * 1000); // 17:00
  const deadline = new Date(startsAt.getTime() - DAY_MS);
  deadline.setUTCHours(1, 0, 0, 0); // 20:00 the day before, still in the future

  const shared = {
    template: 'comida' as const,
    meal: 'almuerzo' as const,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    priceCents: 2500,
    capacity: 8,
    goalCents: 20000,
    minimumCents: 5000,
    fundingDeadlineAt: deadline.toISOString(),
  };

  if (locale === 'en') {
    return {
      ...shared,
      title: 'Demo lunch',
      description:
        'Fictional demo meal to try the organizer dashboard and PayPal Sandbox. No amount is a real charge.',
      location: 'Mirador de los Andes Hall, Quito (fictional place)',
      includes: ['Trial lunch', 'Fictional drink', 'Sample dessert'],
      agenda: [
        { time: '13:00', title: 'Demo welcome' },
        { time: '14:00', title: 'Fictional lunch' },
        { time: '16:00', title: 'Closing and PayPal Sandbox test' },
      ],
      organizerName: 'Somos Panas team (demo)',
    };
  }

  return {
    ...shared,
    title: 'Almuerzo de demostración',
    description:
      'Comida ficticia de demostración para probar el panel del organizador y PayPal Sandbox. Ningún importe es un cobro real.',
    location: 'Salón Mirador de los Andes, Quito (lugar ficticio)',
    includes: ['Almuerzo de prueba', 'Bebida ficticia', 'Postre de ejemplo'],
    agenda: [
      { time: '13:00', title: 'Bienvenida de demostración' },
      { time: '14:00', title: 'Almuerzo ficticio' },
      { time: '16:00', title: 'Cierre y prueba de PayPal Sandbox' },
    ],
    organizerName: 'Equipo Somos Panas (demo)',
  };
}

/**
 * Mints a NEW demo every time a `kind` is requested. It deliberately does not reuse the
 * generation's existing demo: the judge flow needs a fresh invitation per click.
 */
export async function createDemoEvent(pool: Pool, sessionId: string, locale: Locale): Promise<MintedEvent> {
  return withTransaction(pool, async (client) => {
    const { rows } = await client.query<{ demo_generation: number }>(
      'SELECT demo_generation FROM sessions WHERE id = $1 FOR UPDATE',
      [sessionId],
    );
    const generation = rows[0]?.demo_generation ?? 0;
    return mintAndInsert(client, sessionId, demoEventInputForLocale(locale), generation, true);
  });
}

/**
 * Archives only demo events of this session. Real parties stay active, with their guests,
 * orders and ledger intact. Already archived demos stay archived so late captures still reconcile.
 */
export async function resetDemo(pool: Pool, sessionId: string, locale: Locale = 'es'): Promise<MintedEvent> {
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

    return mintAndInsert(client, sessionId, demoEventInputForLocale(locale), generation, true);
  });
}

export async function listOwnedEvents(
  pool: Pool,
  sessionId: string,
  gate?: EventPortalGate,
): Promise<FiestaEventWithDemo[]> {
  const { rows } = await pool.query<EventRow & { tenant_slug: string }>(
    `SELECT ${EVENT_COLUMNS},
            (SELECT t.slug FROM tenants t WHERE t.id = events.tenant_id) AS tenant_slug
       FROM events
      WHERE organizer_session_id = $1 AND purged_at IS NULL
      ORDER BY created_at DESC LIMIT 100`,
    [sessionId],
  );
  const events: FiestaEventWithDemo[] = [];
  for (const row of rows) {
    // NAP-S2: las reuniones de raíz viven en el tenant interno y no son privadas de un grupo.
    if (row.tenant_slug !== ROOT_EVENTS_TENANT_SLUG) {
      if (
        gate &&
        (await groupPrivateEventHiddenOnPortal(pool, row.slug, gate.hostKind, gate.accountUserId))
      ) {
        continue;
      }
    }
    events.push(await loadFiestaEvent(pool, row));
  }
  return events;
}

/** One-time key for a legacy event that has no digest yet. A keyed event never falls back to the session. */
export async function bootstrapAdminKey(
  pool: Pool,
  sessionId: string,
  slug: string,
  gate?: EventPortalGate,
): Promise<string> {
  await portalGate(pool, slug, gate);
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

/** SP7-D-1: cerrojo de portal antes de tocar el evento por slug (rutas HTTP pasan `gate`). */
async function portalGate(pool: Pool, slug: string, gate?: EventPortalGate): Promise<void> {
  if (!gate) return;
  await assertGroupPrivateEventOnPortalHost(pool, slug, gate.hostKind, gate.accountUserId);
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

export async function confirmEvent(
  pool: Pool,
  slug: string,
  presentedKey: string | null,
  gate?: EventPortalGate,
): Promise<FiestaEvent> {
  await portalGate(pool, slug, gate);
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
    return { event: await eventForClient(client, { ...event, confirmed: true }, totals) };
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
  gate?: EventPortalGate,
): Promise<FiestaEvent> {
  await portalGate(pool, slug, gate);
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
    const paymentProvider = await paymentProviderIdForEventId(client, event.id);
    const terms = nextFundingTerms(
      event,
      input,
      new Date(input.startsAt),
      usage?.orders ?? 0,
      fundingNow(),
      paymentProvider,
    );

    // SP6-D-6: el CHECK de 0013 rechaza access_code en eventos public; avisamos antes del UPDATE.
    if (input.accessCode !== undefined && input.accessCode !== null && input.accessCode.trim().length > 0) {
      const { rows: visRows } = await client.query<{ visibility: string }>(
        'SELECT visibility FROM events WHERE id = $1 LIMIT 1',
        [event.id],
      );
      if (visRows[0]?.visibility === 'public') {
        throw badRequest(
          'Un evento publico no puede tener codigo de acceso. Marcalo privado antes de anadir el codigo.',
        );
      }
    }

    let accessCodeHash: Buffer | null | undefined;
    if (input.accessCode === undefined) accessCodeHash = undefined;
    else if (input.accessCode === null || input.accessCode.trim().length === 0) accessCodeHash = null;
    else accessCodeHash = sha256(input.accessCode.trim());

    const changeCode = accessCodeHash !== undefined;
    const nextHash: Buffer | null = accessCodeHash === undefined ? event.access_code_hash : accessCodeHash;
    const codeChanged = changeCode && !sameHash(event.access_code_hash, nextHash);
    const nextName = input.organizerName === undefined ? normalizeOrganizerName(event.organizer_name) : normalizeOrganizerName(input.organizerName);
    const requestedTheme = input.theme ?? (themeBelongs(input.template, event.theme) ? event.theme : undefined);
    if (input.theme !== undefined && !themeBelongs(input.template, input.theme)) {
      throw badRequest('theme: Tema invalido para esta plantilla');
    }
    const nextTheme = requestedTheme && themeBelongs(input.template, requestedTheme)
      ? requestedTheme
      : defaultThemeFor(input.template).key;
    const { rows } = await client.query<EventRow>(
      `UPDATE events SET
         title = $2, template = $3, meal = $4, description = $5, starts_at = $6, ends_at = $7,
         location = $8, includes = $9::jsonb, agenda = $10::jsonb, price_cents = $11, capacity = $12,
         goal_cents = $13, minimum_cents = $14,
         access_code_hash = CASE WHEN $15::boolean THEN $16::bytea ELSE access_code_hash END,
         funding_deadline_at = $17, funding_status = $18,
         organizer_name = $19, theme = $20
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
        nextName,
        nextTheme,
      ],
    );
    const updated = rows[0]!;
    // undefined keeps the hash. null clears it. A different digest replaces it and drops old unlocks.
    if (codeChanged) {
      await revokeUnlocks(client, event.id);
      await audit(client, event.id, nextHash === null ? 'access_code_cleared' : 'access_code_set');
    }
    await audit(client, event.id, 'event_updated');
    return await eventForClient(client, updated, totals);
  });
}

/**
 * NAP-S3: el organizador cambia la avatar que recibe a sus invitados. `null` vuelve a la default.
 * La ruta valida el catálogo antes; aquí solo se persiste bajo la clave de organizador.
 */
export async function setEventAvatarChoice(
  pool: Pool,
  slug: string,
  presentedKey: string | null,
  avatarId: string | null,
  gate?: EventPortalGate,
): Promise<FiestaEvent> {
  await portalGate(pool, slug, gate);
  return withAdmin(pool, slug, presentedKey, async (client, event) => {
    if (event.archived) throw gone('Esta invitacion fue archivada por un reinicio de demo');
    const { rows } = await client.query<EventRow>(
      `UPDATE events SET avatar_id = $2 WHERE id = $1 RETURNING ${EVENT_COLUMNS}`,
      [event.id, avatarId],
    );
    await audit(client, event.id, 'avatar_choice_set');
    return eventForClient(client, rows[0]!, await eventTotals(client, event.id));
  });
}

export async function closeEvent(
  pool: Pool,
  slug: string,
  presentedKey: string | null,
  gate?: EventPortalGate,
): Promise<FiestaEvent> {
  await portalGate(pool, slug, gate);
  return withAdmin(pool, slug, presentedKey, async (client, event) => {
    if (event.archived) throw gone('Esta invitacion fue archivada por un reinicio de demo');
    const { rows } = await client.query<EventRow>(
      `UPDATE events SET closed_at = COALESCE(closed_at, now()) WHERE id = $1 RETURNING ${EVENT_COLUMNS}`,
      [event.id],
    );
    if (!event.closed_at) await audit(client, event.id, 'event_closed');
    return await eventForClient(client, rows[0]!, await eventTotals(client, event.id));
  });
}

/** Locks the event, then tombstones. In-flight money waits on the same row lock and then sees purged. */
export async function deleteEvent(
  pool: Pool,
  slug: string,
  presentedKey: string | null,
  gate?: EventPortalGate,
): Promise<void> {
  await portalGate(pool, slug, gate);
  await withAdmin(pool, slug, presentedKey, async (client, event) => {
    // A due minimum is decided before the tombstone commits. The deadline,
    // price and minimum stay on the row so a later pass can still refund.
    const settled = await decideFundingIfDue(client, event);
    await tombstoneEvent(client, settled.event.id, 'event_deleted');
  });
}

export async function unlockEvent(
  pool: Pool,
  sessionId: string,
  slug: string,
  code: string,
  gate?: EventPortalGate,
): Promise<void> {
  await portalGate(pool, slug, gate);
  await withTransaction(pool, async (client) => {
    const event = await lockBySlug(client, slug);
    if (event.purged_at || isPastRetention(event.ends_at)) throw gone('Este evento ya no esta disponible');
    if (!event.access_code_hash) return;
    if (!digestMatches(event.access_code_hash, code)) throw forbidden('Codigo de acceso requerido');
    await rememberUnlock(client, event.id, sessionId);
  });
}
