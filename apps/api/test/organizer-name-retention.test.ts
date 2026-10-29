import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { createPool, type Pool } from '../src/db/pool.js';
import { purgeExpiredEvents } from '../src/domain/retention.js';
import { sha256 } from '../src/lib/ids.js';
import { completed, message } from './openai-script.js';
import { FakePayPal } from './fake-paypal.js';
import { announceSkipWithoutDatabase, body, Client, DATABASE_URL, MERCHANT, testConfig } from './harness.js';

announceSkipWithoutDatabase('organizer-name-retention.test');
const describeDb = DATABASE_URL ? describe : describe.skip;

const PERSONAL_NAME = 'Ana Panel';
const SECRET_REPLY = 'RESPUESTA-TARDIA-QUE-NO-DEBE-QUEDAR';

const viaje = {
  title: 'Viaje con nombre',
  template: 'viaje',
  meal: 'almuerzo',
  description: 'Nota personal del viaje',
  startsAt: '2026-12-15T19:00:00.000Z',
  endsAt: '2026-12-16T15:00:00.000Z',
  location: 'Cuenca privada',
  includes: ['Bus'],
  priceCents: 6500,
  capacity: 8,
  goalCents: 20000,
  minimumCents: 10000,
  agenda: [{ time: '09:00', title: 'Salida' }],
  organizerName: PERSONAL_NAME,
  theme: 'montana',
  fundingDeadlineAt: '2026-12-01T12:00:00.000Z',
};

interface KeptMoney {
  eventId: string;
  guestId: string;
  orderId: string;
  ledgerId: string;
  paypalOrderId: string;
  captureId: string;
}

describeDb('el nombre publico del organizador se borra con la retencion', () => {
  const schema = `fp_name_${randomBytes(5).toString('hex')}`;
  let pool: Pool;
  let adminPool: Pool;
  let app: FastifyInstance;
  let fake: FakePayPal;

  beforeAll(async () => {
    pool = createPool({ connectionString: DATABASE_URL!, schema });
    adminPool = createPool({ connectionString: DATABASE_URL!, max: 2 });
    await migrate(pool, { schema });
    fake = new FakePayPal(MERCHANT);
    app = await buildApp({ pool, config: testConfig(), paypal: fake, logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    if (adminPool) {
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await adminPool.end();
    }
  });

  async function count(sql: string, params: unknown[] = []): Promise<number> {
    const { rows } = await pool.query<{ n: number }>(sql, params);
    return rows[0]!.n;
  }

  async function eventIdOf(slug: string): Promise<string> {
    const { rows } = await pool.query<{ id: string }>('SELECT id FROM events WHERE slug = $1', [slug]);
    return rows[0]!.id;
  }

  async function organizerName(slug: string): Promise<string | null> {
    const { rows } = await pool.query<{ organizer_name: string | null }>(
      'SELECT organizer_name FROM events WHERE slug = $1',
      [slug],
    );
    return rows[0]?.organizer_name ?? null;
  }

  /** Local ledger rows only. No PayPal call and no capture. */
  async function seedPrivate(slug: string, guestId: string): Promise<KeptMoney> {
    const eventId = await eventIdOf(slug);
    const orderId = randomUUID();
    const quoteId = randomUUID();
    const ledgerId = randomUUID();
    const paypalOrderId = `ORD-LOCAL-${randomBytes(4).toString('hex')}`;
    const captureId = `CAP-LOCAL-${randomBytes(4).toString('hex')}`;
    await pool.query(
      `INSERT INTO quotes (
         id, event_id, guest_id, obligation_version, people, unit_cents, total_cents,
         paid_cents, amount_cents, summary, expires_at
       ) VALUES ($1, $2, $3, 1, 1, 6500, 6500, 0, 6500, 'cuota local de prueba', now() + interval '1 day')`,
      [quoteId, eventId, guestId],
    );
    await pool.query(
      `INSERT INTO orders (
         id, event_id, guest_id, quote_id, obligation_version, request_id, paypal_order_id,
         amount_cents, payee_merchant_id, status, capture_id
       ) VALUES ($1, $2, $3, $4, 1, $5, $6, 6500, $7, 'paid', $8)`,
      [orderId, eventId, guestId, quoteId, `fp-name-${orderId}`, paypalOrderId, MERCHANT, captureId],
    );
    await pool.query(
      `INSERT INTO payment_ledger (
         id, event_id, guest_id, order_id, kind, amount_cents, external_id, capture_id
       ) VALUES ($1, $2, $3, $4, 'capture', 6500, $5, $5)`,
      [ledgerId, eventId, guestId, orderId, captureId],
    );
    await pool.query(
      'INSERT INTO organizer_contacts (event_id, email, email_hash) VALUES ($1, $2, $3)',
      [eventId, 'ana.panel@example.com', sha256(`contact-${eventId}`)],
    );
    await pool.query(
      `INSERT INTO recovery_tokens (
         id, event_id, purpose, token_hash, email_hash, expires_at, delivery_status
       ) VALUES ($1, $2, 'recover', $3, $4, now() + interval '1 day', 'pending')`,
      [randomUUID(), eventId, sha256(`token-${eventId}`), sha256(`mail-${eventId}`)],
    );
    await pool.query(
      `INSERT INTO chat_messages (event_id, session_id, role, parts)
       SELECT g.event_id, g.session_id, 'user', $2::jsonb FROM guests g WHERE g.id = $1`,
      [guestId, JSON.stringify([{ text: 'nombre secreto del invitado' }])],
    );
    await pool.query(
      `INSERT INTO organizer_chat_messages (event_id, session_id, role, parts)
       SELECT id, organizer_session_id, 'user', $2::jsonb FROM events WHERE id = $1`,
      [eventId, JSON.stringify([{ text: 'historial privado Ana Panel' }])],
    );
    return { eventId, guestId, orderId, ledgerId, paypalOrderId, captureId };
  }

  async function shiftEnd(slug: string, hoursAgo: number): Promise<void> {
    await pool.query(
      `UPDATE events SET
         starts_at = now() - interval '80 hours',
         ends_at = now() - make_interval(hours => $2::int),
         funding_deadline_at = CASE
           WHEN funding_deadline_at IS NULL THEN NULL
           ELSE LEAST(funding_deadline_at, now() - interval '80 hours')
         END
       WHERE slug = $1`,
      [slug, hoursAgo],
    );
  }

  async function expectKept(money: KeptMoney, slug: string): Promise<void> {
    const event = await pool.query<{
      id: string;
      slug: string;
      title: string;
      description: string;
      location: string;
      organizer_name: string | null;
      theme: string | null;
      price_cents: number;
      minimum_cents: number | null;
      purged_at: Date | null;
    }>(
      `SELECT id, slug, title, description, location, organizer_name, theme, price_cents, minimum_cents, purged_at
         FROM events WHERE id = $1`,
      [money.eventId],
    );
    expect(event.rows).toHaveLength(1);
    expect(event.rows[0]).toMatchObject({
      id: money.eventId,
      slug,
      title: 'Eliminado',
      description: '',
      location: '',
      organizer_name: null,
      theme: 'montana',
      price_cents: 6500,
      minimum_cents: 10000,
    });
    expect(event.rows[0]!.purged_at).toBeTruthy();

    const order = await pool.query<{ paypal_order_id: string; capture_id: string; amount_cents: number }>(
      'SELECT paypal_order_id, capture_id, amount_cents FROM orders WHERE id = $1',
      [money.orderId],
    );
    expect(order.rows[0]).toEqual({
      paypal_order_id: money.paypalOrderId,
      capture_id: money.captureId,
      amount_cents: 6500,
    });
    const ledger = await pool.query<{ id: string; capture_id: string; amount_cents: number }>(
      'SELECT id, capture_id, amount_cents FROM payment_ledger WHERE id = $1',
      [money.ledgerId],
    );
    expect(ledger.rows[0]).toEqual({ id: money.ledgerId, capture_id: money.captureId, amount_cents: 6500 });

    const guest = await pool.query<{ id: string; name: string }>(
      'SELECT id, name FROM guests WHERE id = $1',
      [money.guestId],
    );
    expect(guest.rows[0]).toEqual({ id: money.guestId, name: '' });
    expect(await count('SELECT COUNT(*)::int AS n FROM chat_messages WHERE event_id = $1', [money.eventId])).toBe(0);
    expect(await count('SELECT COUNT(*)::int AS n FROM organizer_chat_messages WHERE event_id = $1', [money.eventId])).toBe(0);
    expect(await count('SELECT COUNT(*)::int AS n FROM organizer_contacts WHERE event_id = $1', [money.eventId])).toBe(0);
    expect(await count('SELECT COUNT(*)::int AS n FROM recovery_tokens WHERE event_id = $1', [money.eventId])).toBe(0);
    const leaked = await pool.query<{ blob: string }>(
      `SELECT COALESCE(string_agg(src, ''), '') AS blob FROM (
         SELECT organizer_name AS src FROM events WHERE id = $1
         UNION ALL
         SELECT parts::text FROM organizer_chat_messages WHERE event_id = $1
         UNION ALL
         SELECT parts::text FROM chat_messages WHERE event_id = $1
         UNION ALL
         SELECT email FROM organizer_contacts WHERE event_id = $1
       ) texts`,
      [money.eventId],
    );
    expect(leaked.rows[0]!.blob).not.toContain(PERSONAL_NAME);
    expect(leaked.rows[0]!.blob).not.toContain('nombre secreto');
    expect(leaked.rows[0]!.blob).not.toContain('ana.panel@example.com');
    expect(leaked.rows[0]!.blob).not.toContain(SECRET_REPLY);
  }

  async function mint(owner: Client, title: string): Promise<{ slug: string; guestId: string }> {
    const created = body<{ event: { slug: string } }>(await owner.post('/api/events', { ...viaje, title }));
    const slug = created.event.slug;
    const guest = new Client(app);
    const joined = body<{ guest: { id: string } }>(await guest.post(`/api/events/${slug}/join`, { name: 'Pagador Secreto' }));
    expect(await organizerName(slug)).toBe(PERSONAL_NAME);
    return { slug, guestId: joined.guest.id };
  }

  it('un DELETE sin clave no borra el nombre, y el DELETE del organizador lo deja en NULL', async () => {
    const owner = new Client(app);
    const { slug, guestId } = await mint(owner, 'Borrado manual');
    const money = await seedPrivate(slug, guestId);
    expect(await count('SELECT COUNT(*)::int AS n FROM organizer_chat_messages WHERE event_id = $1', [money.eventId])).toBe(1);

    const stranger = new Client(app);
    expect((await stranger.delete(`/api/events/${slug}`)).statusCode).toBe(403);
    const wrong = new Client(app);
    wrong.authorize(slug, 'clave-que-no-sirve');
    expect((await wrong.delete(`/api/events/${slug}`)).statusCode).toBe(403);
    expect(await organizerName(slug)).toBe(PERSONAL_NAME);
    expect(await count('SELECT COUNT(*)::int AS n FROM orders WHERE id = $1', [money.orderId])).toBe(1);

    const removed = await owner.delete(`/api/events/${slug}`);
    expect(removed.statusCode).toBe(200);
    await expectKept(money, slug);
    expect(await count(
      'SELECT COUNT(*)::int AS n FROM audit_log WHERE event_id = $1 AND action = $2',
      [money.eventId, 'event_deleted'],
    )).toBe(1);

    const again = await owner.delete(`/api/events/${slug}`);
    expect(again.statusCode).toBe(410);
    expect(again.body).not.toContain(PERSONAL_NAME);
    await expectKept(money, slug);
    expect(await count(
      'SELECT COUNT(*)::int AS n FROM audit_log WHERE event_id = $1 AND action = $2',
      [money.eventId, 'event_deleted'],
    )).toBe(1);

    const pub = await new Client(app).get(`/api/events/${slug}`);
    expect(pub.statusCode).toBe(410);
    expect(pub.body).not.toContain(PERSONAL_NAME);
    expect((await owner.get(`/api/events/${slug}/dashboard`)).statusCode).toBe(410);
  });

  it('el barrido a las 72 horas borra el nombre y no toca una invitacion vigente ni el dinero', async () => {
    const owner = new Client(app);
    const due = await mint(owner, 'Por vencer');
    const stay = await mint(owner, 'Sigue vigente');
    const money = await seedPrivate(due.slug, due.guestId);

    await shiftEnd(due.slug, 71);
    expect((await purgeExpiredEvents(pool)).purged).toBe(0);
    expect(await organizerName(due.slug)).toBe(PERSONAL_NAME);
    expect((await new Client(app).get(`/api/events/${due.slug}`)).statusCode).toBe(200);

    await shiftEnd(due.slug, 73);
    expect((await purgeExpiredEvents(pool)).purged).toBe(1);
    await expectKept(money, due.slug);
    expect(await organizerName(stay.slug)).toBe(PERSONAL_NAME);
    const sibling = await pool.query<{ purged_at: Date | null; title: string }>(
      'SELECT purged_at, title FROM events WHERE slug = $1',
      [stay.slug],
    );
    expect(sibling.rows[0]).toMatchObject({ purged_at: null, title: 'Sigue vigente' });
    expect(await count(
      'SELECT COUNT(*)::int AS n FROM audit_log WHERE event_id = $1 AND action = $2',
      [money.eventId, 'retention_purged'],
    )).toBe(1);

    expect((await purgeExpiredEvents(pool)).purged).toBe(0);
    await expectKept(money, due.slug);
    expect(await count(
      'SELECT COUNT(*)::int AS n FROM audit_log WHERE event_id = $1 AND action = $2',
      [money.eventId, 'retention_purged'],
    )).toBe(1);
    expect((await new Client(app).get(`/api/events/${due.slug}`)).statusCode).toBe(410);
  });

  it('una respuesta de IA que llega despues del vencimiento no restaura el nombre ni el historial', async () => {
    let activeSlug = '';
    let calls = 0;
    const lateApp = await buildApp({
      pool,
      config: testConfig({ LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'clave-de-prueba' }),
      paypal: fake,
      respond: async () => {
        calls += 1;
        await shiftEnd(activeSlug, 73);
        return completed(message(SECRET_REPLY));
      },
      logger: false,
    });
    await lateApp.ready();
    try {
      const owner = new Client(lateApp);
      const created = body<{ event: { slug: string } }>(await owner.post('/api/events', { ...viaje, title: 'Respuesta tardia' }));
      activeSlug = created.event.slug;
      const guest = new Client(lateApp);
      const joined = body<{ guest: { id: string } }>(
        await guest.post(`/api/events/${activeSlug}/join`, { name: 'Pagador Secreto' }),
      );
      const money = await seedPrivate(activeSlug, joined.guest.id);
      const late = await owner.post(`/api/events/${activeSlug}/organizer-chat`, { message: 'Resume el estado' });
      expect(calls).toBe(1);
      expect(late.statusCode).toBe(410);
      expect(late.body).not.toContain(SECRET_REPLY);
      expect(late.body).not.toContain(PERSONAL_NAME);
      await expectKept(money, activeSlug);
      expect(await count(
        'SELECT COUNT(*)::int AS n FROM audit_log WHERE event_id = $1 AND action = $2',
        [money.eventId, 'retention_purged'],
      )).toBe(1);

      const again = await owner.post(`/api/events/${activeSlug}/organizer-chat`, { message: 'Resume el estado otra vez' });
      expect(again.statusCode).toBe(410);
      expect(again.body).not.toContain(SECRET_REPLY);
      expect(calls).toBe(1);
      await expectKept(money, activeSlug);
      expect(await count('SELECT COUNT(*)::int AS n FROM organizer_chat_messages WHERE event_id = $1', [money.eventId])).toBe(0);
      expect(await count(
        'SELECT COUNT(*)::int AS n FROM audit_log WHERE event_id = $1 AND action = $2',
        [money.eventId, 'retention_purged'],
      )).toBe(1);
    } finally {
      await lateApp.close();
    }
  });
});
