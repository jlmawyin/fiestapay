import { randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CreatedEvent, RecoveryContactUpdate, RecoveryRequestResult, RecoveryStatus } from '@fiestapay/shared';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { createPool, type Pool } from '../src/db/pool.js';
import type { EmailAdapter, EmailSendResult, OutboundEmail } from '../src/email/types.js';
import { sha256 } from '../src/lib/ids.js';
import { announceSkipWithoutDatabase, body, Client, DATABASE_URL, ORIGIN, testConfig } from './harness.js';

announceSkipWithoutDatabase('recovery.test');
const describeDb = DATABASE_URL ? describe : describe.skip;

const MAILBOX = 'fiesta-test@example.test';
const PASS = 'smtp-test-pass';

function mailEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    SMTP_HOST: 'salida.example.test',
    SMTP_PORT: '465',
    SMTP_USER: MAILBOX,
    SMTP_PASS: PASS,
    EMAIL_FROM: MAILBOX,
    EMAIL_DAILY_CAP: '100',
    EMAIL_IP_LIMIT: '40',
    EMAIL_EVENT_LIMIT: '40',
    ...overrides,
  };
}

const futureEvent = (title = 'Fiesta real') => ({
  title,
  template: 'casa' as const,
  meal: 'cena' as const,
  description: 'Encuentro',
  startsAt: '2026-12-20T23:00:00.000Z',
  endsAt: '2026-12-21T03:00:00.000Z',
  location: 'Casa',
  includes: ['Mesa'],
  priceCents: 2500,
  capacity: 8,
  goalCents: 10000,
  minimumCents: 5000,
  agenda: [],
});

class FakeEmail implements EmailAdapter {
  readonly sent: OutboundEmail[] = [];
  next: EmailSendResult | 'throw' = { status: 'accepted' };
  secret = '';

  async send(message: OutboundEmail): Promise<EmailSendResult> {
    this.sent.push({ ...message });
    if (this.next === 'throw') throw new Error(`fallo ${this.secret} ${message.text}`);
    return this.next;
  }
}

function tokenOf(message: OutboundEmail): string {
  const found = message.text.match(/\/recover#t=([A-Za-z0-9_-]{43,128})/);
  if (!found?.[1]) throw new Error('el adaptador de prueba no recibio token');
  return found[1];
}

describeDb('recuperacion opcional del organizador', () => {
  const schema = `fp_test_${randomBytes(5).toString('hex')}`;
  const fake = new FakeEmail();
  let pool: Pool;
  let adminPool: Pool;
  let app: FastifyInstance;
  let off: FastifyInstance;

  beforeAll(async () => {
    pool = createPool({ connectionString: DATABASE_URL!, schema });
    adminPool = createPool({ connectionString: DATABASE_URL!, max: 2 });
    await migrate(pool, { schema });
    app = await buildApp({ pool, config: testConfig(mailEnv()), email: fake, paypal: null, logger: false });
    off = await buildApp({ pool, config: testConfig(), paypal: null, logger: false });
    await app.ready();
    await off.ready();
  });

  afterEach(() => {
    fake.next = { status: 'accepted' };
    fake.secret = '';
  });

  afterAll(async () => {
    await app?.close();
    await off?.close();
    await pool?.end();
    if (adminPool) {
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await adminPool.end();
    }
  });

  async function ownerOf(title = 'Fiesta real'): Promise<{ owner: Client; event: CreatedEvent['event']; key: string }> {
    const owner = new Client(app);
    const res = await owner.post('/api/events', futureEvent(title));
    expect(res.statusCode).toBe(200);
    const created = body<CreatedEvent>(res);
    expect(created.adminKey).toEqual(expect.any(String));
    return { owner, event: created.event, key: created.adminKey! };
  }

  async function consume(token: string, adminKey?: string) {
    return app.inject({
      method: 'POST',
      url: '/api/recovery/consume',
      headers: { origin: ORIGIN, ...(adminKey ? { 'x-fiesta-admin-key': adminKey } : {}) },
      payload: { token },
    });
  }

  async function request(slug: string, email: string, remoteAddress = '127.0.0.1', target: FastifyInstance = app) {
    return target.inject({
      method: 'POST',
      url: '/api/recovery/request',
      remoteAddress,
      headers: { origin: ORIGIN },
      payload: { slug, email },
    });
  }

  it('crea la fiesta sin correo y el proveedor apagado responde 503 igual en ambos caminos', async () => {
    const before = fake.sent.length;
    const { event } = await ownerOf('Sin correo');
    expect(fake.sent.length).toBe(before);
    const caps = body<{ email: boolean }>(await new Client(app).get('/api/capabilities'));
    expect(caps.email).toBe(true);
    const disabledCaps = body<{ email: boolean }>(await new Client(off).get('/api/capabilities'));
    expect(disabledCaps.email).toBe(false);

    const stranger = new Client(off);
    const created = body<CreatedEvent>(await stranger.post('/api/events', futureEvent('Apagado')));
    expect(created.adminKey).toEqual(expect.any(String));
    const put = await stranger.put(`/api/events/${created.event.slug}/recovery/contact`, { email: MAILBOX });
    const asked = await stranger.post('/api/recovery/request', { slug: created.event.slug, email: MAILBOX });
    expect(put.statusCode).toBe(503);
    expect(asked.statusCode).toBe(503);
    expect(put.body).toBe(asked.body);
    expect(put.body).toContain('no esta configurado');
    expect(put.body).not.toContain(PASS);
    expect(put.body).not.toContain(MAILBOX);
    const stored = await pool.query('SELECT 1 FROM organizer_contacts WHERE event_id = $1', [created.event.id]);
    expect(stored.rowCount).toBe(0);
    expect(event.id).toBeTruthy();
  });

  it('exige la clave, no bloquea el alta y solo muestra el correo enmascarado', async () => {
    const { owner, event, key } = await ownerOf('Con correo');
    const stranger = new Client(app);
    expect((await stranger.get(`/api/events/${event.slug}/recovery`)).statusCode).toBe(403);
    expect((await stranger.put(`/api/events/${event.slug}/recovery/contact`, { email: MAILBOX })).statusCode).toBe(403);
    expect((await stranger.delete(`/api/events/${event.slug}/recovery/contact`)).statusCode).toBe(403);
    expect((await pool.query('SELECT 1 FROM organizer_contacts WHERE event_id = $1', [event.id])).rowCount).toBe(0);

    const saved = body<RecoveryContactUpdate>(await owner.put(`/api/events/${event.slug}/recovery/contact`, { email: ` ${MAILBOX.toUpperCase()} ` }));
    expect(saved.delivery).toBe('accepted');
    expect(saved.contact).toEqual({ state: 'pending', masked: 'f***@example.test' });
    const token = tokenOf(fake.sent.at(-1)!);
    expect(JSON.stringify(saved)).not.toContain(token);
    expect(JSON.stringify(saved)).not.toContain(MAILBOX);

    const status = body<RecoveryStatus>(await owner.get(`/api/events/${event.slug}/recovery`));
    expect(status).toEqual({ email: true, contact: { state: 'pending', masked: 'f***@example.test' } });
    const rows = await pool.query<{ token_hash: Buffer; email: string; delivery_status: string }>(
      `SELECT t.token_hash, c.email, t.delivery_status
         FROM recovery_tokens t JOIN organizer_contacts c ON c.event_id = t.event_id
        WHERE t.event_id = $1`,
      [event.id],
    );
    expect(rows.rows[0]!.delivery_status).toBe('accepted');
    expect(rows.rows[0]!.email).toBe(MAILBOX);
    expect(rows.rows[0]!.token_hash.equals(sha256(token))).toBe(true);
    expect(rows.rows[0]!.token_hash.toString('utf8')).not.toContain(token);
    await expect(
      pool.query(
        `INSERT INTO recovery_tokens (id, event_id, purpose, token_hash, email_hash, expires_at, delivery_status)
         VALUES (gen_random_uuid(), $1, 'verify', $2, $2, now() + interval '1 minute', 'delivered')`,
        [event.id, sha256(`otro-${key}`)],
      ),
    ).rejects.toThrow(/check/i);

    const audit = await pool.query<{ action: string }>('SELECT action FROM audit_log WHERE event_id = $1', [event.id]);
    expect(audit.rows.map((row) => row.action)).toContain('recovery_link_sent');
    expect(JSON.stringify(audit.rows)).not.toContain(MAILBOX);
    expect(JSON.stringify(audit.rows)).not.toContain(token);
  });

  it('verifica una vez, recupera con respuesta uniforme y deja la clave anterior en 403', async () => {
    const { owner, event, key } = await ownerOf('Recuperable');
    const before = fake.sent.length;
    await owner.put(`/api/events/${event.slug}/recovery/contact`, { email: MAILBOX });
    const verifyToken = tokenOf(fake.sent.at(-1)!);

    const unknown = await request('no-existe-slug', MAILBOX);
    const wrong = await request(event.slug, 'otra@example.test');
    const unverified = await request(event.slug, MAILBOX);
    expect(unknown.statusCode).toBe(200);
    expect(unknown.body).toBe(wrong.body);
    expect(wrong.body).toBe(unverified.body);
    expect(body<RecoveryRequestResult>(unknown as never)).toEqual({ status: 'accepted' });
    expect(fake.sent.length).toBe(before + 1);
    expect(unverified.body).not.toContain(MAILBOX);
    expect(unverified.body).not.toContain(verifyToken);

    const opened = await app.inject({ method: 'GET', url: `/api/recovery/consume?token=${verifyToken}` });
    expect(opened.statusCode).toBe(404);
    const verified = await consume(verifyToken, 'clave-ajena');
    expect(verified.statusCode).toBe(200);
    expect(verified.body).not.toContain(verifyToken);
    expect(body<{ purpose: string; verified?: boolean; adminKey?: string }>(verified as never)).toEqual({
      purpose: 'verify',
      slug: event.slug,
      verified: true,
    });
    expect((await owner.get(`/api/events/${event.slug}/dashboard`)).statusCode).toBe(200);
    const again = await consume(verifyToken);
    expect(again.statusCode).toBe(400);

    const same = body<RecoveryContactUpdate>(await owner.put(`/api/events/${event.slug}/recovery/contact`, { email: 'Fiesta-Test@Example.Test' }));
    expect(same.delivery).toBe('unchanged');
    expect(fake.sent.length).toBe(before + 1);

    const matched = await request(event.slug, MAILBOX);
    expect(matched.body).toBe(unknown.body);
    const recoverToken = tokenOf(fake.sent.at(-1)!);
    expect(fake.sent.at(-1)!.text).toContain('/recover#t=');
    expect(matched.body).not.toContain(recoverToken);

    const [first, second] = await Promise.all([consume(recoverToken), consume(recoverToken)]);
    const codes = [first.statusCode, second.statusCode].sort();
    expect(codes).toEqual([200, 400]);
    const winner = first.statusCode === 200 ? first : second;
    const recovered = body<{ purpose: string; slug: string; adminKey: string }>(winner as never);
    expect(recovered.purpose).toBe('recover');
    expect(recovered.slug).toBe(event.slug);
    expect(recovered.adminKey).not.toBe(key);
    expect(winner.body).not.toContain(recoverToken);
    expect((await consume(recoverToken)).statusCode).toBe(400);

    expect((await owner.get(`/api/events/${event.slug}/dashboard`)).statusCode).toBe(403);
    const restored = new Client(app);
    restored.authorize(event.slug, recovered.adminKey);
    expect((await restored.get(`/api/events/${event.slug}/dashboard`)).statusCode).toBe(200);
    const hash = await pool.query<{ admin_key_hash: Buffer }>('SELECT admin_key_hash FROM events WHERE id = $1', [event.id]);
    expect(hash.rows[0]!.admin_key_hash.equals(sha256(recovered.adminKey))).toBe(true);
    expect(hash.rows[0]!.admin_key_hash.equals(sha256(key))).toBe(false);
  });

  it('invalida el token al cambiar, quitar, caducar o purgar, y conserva la fila del evento', async () => {
    const { owner, event } = await ownerOf('Caduca');
    await owner.put(`/api/events/${event.slug}/recovery/contact`, { email: MAILBOX });
    const first = tokenOf(fake.sent.at(-1)!);
    await owner.put(`/api/events/${event.slug}/recovery/contact`, { email: 'otro@example.test' });
    expect((await consume(first)).statusCode).toBe(400);
    const second = tokenOf(fake.sent.at(-1)!);
    expect((await owner.delete(`/api/events/${event.slug}/recovery/contact`)).statusCode).toBe(200);
    expect((await consume(second)).statusCode).toBe(400);
    expect(body<RecoveryStatus>(await owner.get(`/api/events/${event.slug}/recovery`)).contact.state).toBe('none');

    await owner.put(`/api/events/${event.slug}/recovery/contact`, { email: MAILBOX });
    const expiring = tokenOf(fake.sent.at(-1)!);
    await pool.query(`UPDATE recovery_tokens SET expires_at = now() - interval '1 minute' WHERE event_id = $1`, [event.id]);
    expect((await consume(expiring)).statusCode).toBe(400);

    await owner.put(`/api/events/${event.slug}/recovery/contact`, { email: MAILBOX });
    const purged = tokenOf(fake.sent.at(-1)!);
    await pool.query(
      `UPDATE events SET starts_at = '2019-01-01T00:00:00.000Z', ends_at = '2020-01-01T00:00:00.000Z' WHERE id = $1`,
      [event.id],
    );
    const gone = await consume(purged);
    expect(gone.statusCode).toBe(410);
    const left = await pool.query<{ purged_at: Date | null }>('SELECT purged_at FROM events WHERE id = $1', [event.id]);
    expect(left.rows[0]!.purged_at).toBeTruthy();
    expect((await pool.query('SELECT 1 FROM organizer_contacts WHERE event_id = $1', [event.id])).rowCount).toBe(0);
    expect((await pool.query('SELECT 1 FROM recovery_tokens WHERE event_id = $1', [event.id])).rowCount).toBe(0);
  });

  it('timeout deja el token usable; rechazo y fallo no, y el error no lleva secreto', async () => {
    const logs: unknown[] = [];
    const spies = ['log', 'info', 'warn', 'error', 'debug'].map((method) =>
      vi.spyOn(console, method as 'log').mockImplementation((...args) => logs.push(args)),
    );
    try {
      const { owner, event } = await ownerOf('Estados');
      fake.next = { status: 'timeout' };
      const timed = await owner.put(`/api/events/${event.slug}/recovery/contact`, { email: MAILBOX });
      expect(timed.statusCode).toBe(502);
      expect(timed.body).not.toContain(PASS);
      const timedToken = tokenOf(fake.sent.at(-1)!);
      expect(timed.body).not.toContain(timedToken);
      expect((await consume(timedToken)).statusCode).toBe(200);

      fake.next = { status: 'rejected' };
      const rejected = await owner.put(`/api/events/${event.slug}/recovery/contact`, { email: 'nueva@example.test' });
      expect(rejected.statusCode).toBe(502);
      expect(rejected.body).toContain('rechazo');
      expect((await consume(tokenOf(fake.sent.at(-1)!))).statusCode).toBe(400);

      fake.next = 'throw';
      fake.secret = PASS;
      const failed = await owner.put(`/api/events/${event.slug}/recovery/contact`, { email: 'falla@example.test' });
      expect(failed.statusCode).toBe(502);
      expect(failed.body).not.toContain(PASS);
      expect(failed.body).not.toContain('recover#t=');
      const failedToken = tokenOf(fake.sent.at(-1)!);
      expect(failed.body).not.toContain(failedToken);
      expect((await consume(failedToken)).statusCode).toBe(400);
      const status = await pool.query<{ delivery_status: string }>(
        `SELECT delivery_status FROM recovery_tokens WHERE token_hash = $1`,
        [sha256(failedToken)],
      );
      expect(status.rows[0]!.delivery_status).toBe('failed');
      expect(JSON.stringify(logs)).not.toContain(PASS);
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  it('el presupuesto y los limites viven en PostgreSQL y una sesion no los salta', async () => {
    await pool.query('DELETE FROM email_attempt_windows');
    await pool.query('DELETE FROM email_daily_budget');
    const budgetMail = new FakeEmail();
    const first = await buildApp({
      pool,
      config: testConfig(mailEnv({ EMAIL_DAILY_CAP: '1', EMAIL_IP_LIMIT: '10', EMAIL_EVENT_LIMIT: '10' })),
      email: budgetMail,
      paypal: null,
      logger: false,
    });
    const second = await buildApp({
      pool,
      config: testConfig(mailEnv({ EMAIL_DAILY_CAP: '1', EMAIL_IP_LIMIT: '10', EMAIL_EVENT_LIMIT: '10' })),
      email: budgetMail,
      paypal: null,
      logger: false,
    });
    try {
      const a = new Client(first);
      const createdA = body<CreatedEvent>(await a.post('/api/events', futureEvent('Tope A')));
      expect((await a.put(`/api/events/${createdA.event.slug}/recovery/contact`, { email: MAILBOX })).statusCode).toBe(200);
      const b = new Client(second);
      const createdB = body<CreatedEvent>(await b.post('/api/events', futureEvent('Tope B')));
      expect((await b.put(`/api/events/${createdB.event.slug}/recovery/contact`, { email: MAILBOX })).statusCode).toBe(429);
    } finally {
      await first.close();
      await second.close();
    }

    await pool.query('DELETE FROM email_attempt_windows');
    await pool.query('DELETE FROM email_daily_budget');
    const ipApp = await buildApp({
      pool,
      config: testConfig(mailEnv({ EMAIL_DAILY_CAP: '20', EMAIL_IP_LIMIT: '1', EMAIL_EVENT_LIMIT: '10' })),
      email: new FakeEmail(),
      paypal: null,
      logger: false,
    });
    try {
      const one = new Client(ipApp);
      const two = new Client(ipApp);
      expect((await one.post('/api/events', futureEvent('IP uno'))).statusCode).toBe(200);
      expect((await two.post('/api/events', futureEvent('IP dos'))).statusCode).toBe(200);
      expect(one.cookie).toBeTruthy();
      expect(two.cookie).toBeTruthy();
      expect(one.cookie).not.toBe(two.cookie);
      expect((await one.post('/api/recovery/request', { slug: 'limite-ip-uno', email: 'mal@example.test' })).statusCode).toBe(200);
      expect((await two.post('/api/recovery/request', { slug: 'limite-ip-dos', email: MAILBOX })).statusCode).toBe(429);
      const otherIp = await request('limite-ip-tres', MAILBOX, '203.0.113.10', ipApp);
      expect(otherIp.statusCode).toBe(200);
    } finally {
      await ipApp.close();
    }

    await pool.query('DELETE FROM email_attempt_windows');
    await pool.query('DELETE FROM email_daily_budget');
    const eventApp = await buildApp({
      pool,
      config: testConfig(mailEnv({ EMAIL_DAILY_CAP: '20', EMAIL_IP_LIMIT: '10', EMAIL_EVENT_LIMIT: '1' })),
      email: new FakeEmail(),
      paypal: null,
      logger: false,
    });
    try {
      expect((await request('mismo-evento', 'mal@example.test', '203.0.113.21', eventApp)).statusCode).toBe(200);
      expect((await request('mismo-evento', MAILBOX, '203.0.113.22', eventApp)).statusCode).toBe(429);
      expect((await request('otro-evento', MAILBOX, '203.0.113.23', eventApp)).statusCode).toBe(200);
    } finally {
      await eventApp.close();
    }
  });
});
