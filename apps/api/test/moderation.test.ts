import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FiestaEvent, Guest, ModerationGuest, OrderResult, Quote } from '@fiestapay/shared';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { createPool, type Pool } from '../src/db/pool.js';
import { INTERRUPTED_MESSAGE, REVOKED_MESSAGE, appendChatTurn } from '../src/domain/moderation.js';
import { FakePayPal } from './fake-paypal.js';
import { announceSkipWithoutDatabase, body, Client, DATABASE_URL, MERCHANT, testConfig } from './harness.js';

announceSkipWithoutDatabase('moderation.test');
const describeDb = DATABASE_URL ? describe : describe.skip;

describeDb('moderacion de sesion, cupo y chat', () => {
  const schema = `fp_mod_${randomBytes(5).toString('hex')}`;
  let pool: Pool;
  let adminPool: Pool;
  let app: FastifyInstance;
  let fake: FakePayPal;
  let webhookSeq = 0;

  const nextWebhookId = (): string => `WH-MOD-${++webhookSeq}-${randomBytes(3).toString('hex')}`;

  async function count(sql: string, params: unknown[] = []): Promise<number> {
    const { rows } = await pool.query<{ n: number }>(sql, params);
    return rows[0]?.n ?? 0;
  }

  async function organizer(): Promise<{ client: Client; event: FiestaEvent; adminKey: string }> {
    const client = new Client(app);
    const res = await client.post('/api/demo');
    expect(res.statusCode).toBe(200);
    const parsed = body<{ event: FiestaEvent; adminKey: string }>(res);
    return { client, event: parsed.event, adminKey: parsed.adminKey };
  }

  function cookieOnly(source: Client): Client {
    const next = new Client(app);
    next.cookie = source.cookie;
    return next;
  }

  async function join(slug: string, name: string, companions = 0): Promise<{ client: Client; guest: Guest }> {
    const client = new Client(app);
    const joined = await client.post(`/api/events/${slug}/join`, { name });
    expect(joined.statusCode).toBe(200);
    const rsvp = await client.post(`/api/events/${slug}/rsvp`, { status: 'yes', companions });
    expect(rsvp.statusCode).toBe(200);
    return { client, guest: body<{ guest: Guest }>(rsvp).guest };
  }

  async function quoteAndOrder(client: Client, slug: string): Promise<OrderResult> {
    const quoteRes = await client.post(`/api/events/${slug}/quote`);
    expect(quoteRes.statusCode).toBe(200);
    const { quote } = body<{ quote: Quote }>(quoteRes);
    const orderRes = await client.post(`/api/events/${slug}/orders`, { quoteId: quote.id, confirmed: true });
    expect(orderRes.statusCode).toBe(200);
    return body<OrderResult>(orderRes);
  }

  async function guestRow(slug: string, name: string) {
    const { rows } = await pool.query<{
      id: string;
      event_id: string;
      session_id: string;
      status: string;
      companions: number;
      obligation_version: number;
      blocked_at: Date | null;
      removed_at: Date | null;
    }>(
      `SELECT g.id, g.event_id, g.session_id, g.status, g.companions, g.obligation_version, g.blocked_at, g.removed_at
         FROM guests g
         JOIN events e ON e.id = g.event_id
        WHERE e.slug = $1 AND g.name = $2`,
      [slug, name],
    );
    const row = rows[0];
    if (!row) throw new Error(`invitado ausente ${name}`);
    return row;
  }

  async function orderRow(paypalOrderId: string) {
    const { rows } = await pool.query<{ id: string; status: string; guest_id: string; event_id: string }>(
      'SELECT id, status, guest_id, event_id FROM orders WHERE paypal_order_id = $1',
      [paypalOrderId],
    );
    const row = rows[0];
    if (!row) throw new Error(`orden ausente ${paypalOrderId}`);
    return row;
  }

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

  it('exige la clave de organizador en lecturas y escrituras, y no cruza eventos', async () => {
    const a = await organizer();
    const b = await organizer();
    const ana = await join(a.event.slug, 'Ana Clave');
    const foreignGuest = '11111111-2222-4333-8444-555555555555';
    const foreignConversation = '22222222-3333-4444-8555-666666666666';

    const session = cookieOnly(a.client);
    const paths = [
      () => session.get(`/api/events/${a.event.slug}/moderation/guests`),
      () => session.get(`/api/events/${a.event.slug}/moderation/conversations`),
      () => session.get(`/api/events/${a.event.slug}/moderation/messages?conversationId=${foreignConversation}`),
      () => session.post(`/api/events/${a.event.slug}/guests/${ana.guest.id}/block`),
      () => session.post(`/api/events/${a.event.slug}/guests/${ana.guest.id}/remove`),
      () => session.delete(`/api/events/${a.event.slug}/moderation/messages/1`),
    ];
    for (const call of paths) {
      const res = await call();
      expect(res.statusCode).toBe(403);
      expect(JSON.stringify(body(res))).not.toContain(ana.guest.id);
      expect(JSON.stringify(body(res))).not.toContain('Ana Clave');
    }

    const crossed = new Client(app);
    crossed.authorize(b.event.slug, a.adminKey);
    const denied = await crossed.get(`/api/events/${b.event.slug}/moderation/guests`);
    expect(denied.statusCode).toBe(403);
    expect(JSON.stringify(body(denied))).not.toContain('Ana Clave');

    const wrongGuest = await a.client.post(`/api/events/${a.event.slug}/guests/${foreignGuest}/block`);
    expect(wrongGuest.statusCode).toBe(404);

    const listed = body<{ guests: ModerationGuest[] }>(await a.client.get(`/api/events/${a.event.slug}/moderation/guests`));
    expect(listed.guests.map((guest) => guest.name)).toContain('Ana Clave');
    expect(JSON.stringify(listed)).not.toContain(a.adminKey);
    const anaRow = await guestRow(a.event.slug, 'Ana Clave');
    expect(JSON.stringify(listed)).not.toContain(anaRow.session_id);
  });

  it('bloquear no cambia asistencia, cupo ni orden, y corta acciones nuevas antes de costo de proveedor', async () => {
    const { client: org, event } = await organizer();
    const { client, guest } = await join(event.slug, 'Beto Bloqueo', 2);
    const order = await quoteAndOrder(client, event.slug);
    const before = await guestRow(event.slug, 'Beto Bloqueo');
    const quotesBefore = await count('SELECT COUNT(*)::int AS n FROM quotes WHERE guest_id = $1', [before.id]);
    const capturesBefore = fake.captureCalls.length;
    const createsBefore = fake.createCalls.length;

    const blocked = await org.post(`/api/events/${event.slug}/guests/${guest.id}/block`);
    expect(blocked.statusCode).toBe(200);
    const after = await guestRow(event.slug, 'Beto Bloqueo');
    expect(after.status).toBe('yes');
    expect(after.companions).toBe(2);
    expect(after.obligation_version).toBe(before.obligation_version);
    expect(after.blocked_at).toBeTruthy();
    expect(after.removed_at).toBeNull();
    expect((await orderRow(order.orderId)).status).toBe('created');
    expect(await count('SELECT COUNT(*)::int AS n FROM quotes WHERE guest_id = $1 AND invalidated_at IS NULL', [before.id])).toBe(quotesBefore);

    expect((await client.post(`/api/events/${event.slug}/join`, { name: 'Otro alias' })).statusCode).toBe(403);
    expect((await client.post(`/api/events/${event.slug}/rsvp`, { status: 'no', companions: 0 })).statusCode).toBe(403);
    expect((await client.post(`/api/events/${event.slug}/quote`)).statusCode).toBe(403);
    expect((await client.post(`/api/events/${event.slug}/orders`, { quoteId: randomUUID(), confirmed: true })).statusCode).toBe(403);
    const chat = await client.post(`/api/events/${event.slug}/chat`, { message: 'hola' });
    expect(chat.statusCode).toBe(403);
    expect(body<{ error: string }>(chat).error).toBe(REVOKED_MESSAGE);
    const voice = await client.post(`/api/events/${event.slug}/voice/token`, { consent: true });
    expect(voice.statusCode).toBe(403);
    expect(body<{ error: string }>(voice).error).toBe(REVOKED_MESSAGE);
    expect(await count('SELECT COUNT(*)::int AS n FROM ai_requests WHERE event_id = $1', [before.event_id])).toBe(0);
    expect(await count('SELECT COUNT(*)::int AS n FROM voice_leases WHERE event_id = $1', [before.event_id])).toBe(0);
    expect(fake.captureCalls.length).toBe(capturesBefore);
    expect(fake.createCalls.length).toBe(createsBefore);

    const other = await join(event.slug, 'Nuevo navegador');
    expect(other.guest.name).toBe('Nuevo navegador');
    expect(other.guest.blockedAt ?? null).toBeNull();

    const restored = await org.post(`/api/events/${event.slug}/guests/${guest.id}/unblock`);
    expect(restored.statusCode).toBe(200);
    const open = await guestRow(event.slug, 'Beto Bloqueo');
    expect(open.blocked_at).toBeNull();
    expect(open.status).toBe('yes');
    expect((await client.post(`/api/events/${event.slug}/rsvp`, { status: 'yes', companions: 2 })).statusCode).toBe(200);
  });

  it('no libera el cupo con pago en intent, capturing o arriendo de reembolso, aunque paidCents sea 0', async () => {
    const { client: org, event } = await organizer();

    const uncertain: Array<'intent' | 'capturing'> = ['intent', 'capturing'];
    for (const status of uncertain) {
      const { client, guest } = await join(event.slug, `Pago ${status}`, 1);
      const order = await quoteAndOrder(client, event.slug);
      await pool.query('UPDATE orders SET status = $2 WHERE paypal_order_id = $1', [order.orderId, status]);
      const res = await org.post(`/api/events/${event.slug}/guests/${guest.id}/remove`);
      expect(res.statusCode).toBe(409);
      const payload = body<{ code: string; blockAvailable: boolean; guest: ModerationGuest }>(res);
      expect(payload.code).toBe('payment_pending');
      expect(payload.blockAvailable).toBe(true);
      expect(payload.guest.paidCents).toBe(0);
      expect(payload.guest.status).toBe('yes');
      expect(payload.guest.companions).toBe(1);
      expect(payload.guest.removedAt).toBeNull();
      const row = await guestRow(event.slug, `Pago ${status}`);
      expect(row.removed_at).toBeNull();
      expect(row.blocked_at).toBeNull();
      expect((await orderRow(order.orderId)).status).toBe(status);
      expect(await count('SELECT COUNT(*)::int AS n FROM guests WHERE id = $1', [guest.id])).toBe(1);
    }

    for (const lease of ['leased', 'pending_provider'] as const) {
      const { client, guest } = await join(event.slug, `Arriendo ${lease}`);
      const order = await quoteAndOrder(client, event.slug);
      const stored = await orderRow(order.orderId);
      await pool.query(
        `INSERT INTO funding_refund_tasks
           (id, event_id, order_id, guest_id, capture_id, amount_cents, request_id, request_body, status)
         VALUES ($1, $2, $3, $4, $5, 2500, $6, '{}', $7)`,
        [randomUUID(), stored.event_id, stored.id, stored.guest_id, `CAP-${lease}-${randomBytes(3).toString('hex')}`, `req-${lease}-${randomUUID()}`, lease],
      );
      const res = await org.post(`/api/events/${event.slug}/guests/${guest.id}/remove`);
      expect(res.statusCode).toBe(409);
      expect(body<{ code: string; guest: ModerationGuest }>(res).guest.paidCents).toBe(0);
      expect((await orderRow(order.orderId)).status).toBe('created');
      expect((await guestRow(event.slug, `Arriendo ${lease}`)).removed_at).toBeNull();
    }

    const held = await guestRow(event.slug, 'Pago intent');
    const blocked = await org.post(`/api/events/${event.slug}/guests/${held.id}/block`);
    expect(blocked.statusCode).toBe(200);
    const stillHeld = await guestRow(event.slug, 'Pago intent');
    expect(stillHeld.status).toBe('yes');
    expect(stillHeld.blocked_at).toBeTruthy();
    expect(stillHeld.removed_at).toBeNull();
    const heldOrder = await pool.query<{ status: string }>('SELECT status FROM orders WHERE guest_id = $1', [held.id]);
    expect(heldOrder.rows[0]?.status).toBe('intent');
  });

  it('retira en logica, conserva fila, cupo acompanante y libro, y el desbloqueo no deshace la retirada', async () => {
    const { client: org, event } = await organizer();
    const { client, guest } = await join(event.slug, 'Clara Retiro', 2);
    const order = await quoteAndOrder(client, event.slug);
    const before = await guestRow(event.slug, 'Clara Retiro');
    const guestsBefore = await count('SELECT COUNT(*)::int AS n FROM guests WHERE event_id = $1', [before.event_id]);
    const ledgerBefore = await count('SELECT COUNT(*)::int AS n FROM payment_ledger WHERE event_id = $1', [before.event_id]);

    const removed = await org.post(`/api/events/${event.slug}/guests/${guest.id}/remove`);
    expect(removed.statusCode).toBe(200);
    const payload = body<{ outcome: string; guest: ModerationGuest }>(removed);
    expect(payload.outcome).toBe('removed');
    expect(payload.guest.status).toBe('no');
    expect(payload.guest.companions).toBe(2);
    expect(payload.guest.removedAt).toBeTruthy();
    expect(payload.guest.blockedAt).toBeTruthy();

    const after = await guestRow(event.slug, 'Clara Retiro');
    expect(after.removed_at).toBeTruthy();
    expect(after.status).toBe('no');
    expect(after.companions).toBe(2);
    expect(after.obligation_version).toBe(before.obligation_version + 1);
    expect(await count('SELECT COUNT(*)::int AS n FROM guests WHERE event_id = $1', [before.event_id])).toBe(guestsBefore);
    expect(await count('SELECT COUNT(*)::int AS n FROM payment_ledger WHERE event_id = $1', [before.event_id])).toBe(ledgerBefore);
    expect((await orderRow(order.orderId)).status).toBe('superseded');
    expect(await count('SELECT COUNT(*)::int AS n FROM quotes WHERE guest_id = $1 AND invalidated_at IS NULL', [guest.id])).toBe(0);

    const again = await org.post(`/api/events/${event.slug}/guests/${guest.id}/remove`);
    expect(again.statusCode).toBe(200);
    expect((await guestRow(event.slug, 'Clara Retiro')).obligation_version).toBe(after.obligation_version);

    const undo = await org.post(`/api/events/${event.slug}/guests/${guest.id}/unblock`);
    expect(undo.statusCode).toBe(409);
    expect((await guestRow(event.slug, 'Clara Retiro')).removed_at).toBeTruthy();
    expect((await client.post(`/api/events/${event.slug}/rsvp`, { status: 'yes', companions: 2 })).statusCode).toBe(403);

    const visible = body<{ guests: ModerationGuest[] }>(await org.get(`/api/events/${event.slug}/moderation/guests`));
    expect(visible.guests.find((item) => item.id === guest.id)?.removedAt).toBeTruthy();
  });

  it('una captura ya despachada, el webhook y la lectura siguen conciliando; una captura nueva no', async () => {
    const { client: org, event } = await organizer();
    const capturesAtStart = fake.captureCalls.length;

    const fresh = await join(event.slug, 'Captura nueva');
    const freshOrder = await quoteAndOrder(fresh.client, event.slug);
    expect((await org.post(`/api/events/${event.slug}/guests/${fresh.guest.id}/block`)).statusCode).toBe(200);
    const refused = await fresh.client.post(`/api/orders/${freshOrder.orderId}/capture`);
    expect(refused.statusCode).toBe(409);
    expect(body<{ error: string }>(refused).error).toBe(REVOKED_MESSAGE);
    expect(fake.captureCalls.length).toBe(capturesAtStart);
    expect((await orderRow(freshOrder.orderId)).status).toBe('created');

    const reading = await join(event.slug, 'Lectura');
    const readOrder = await quoteAndOrder(reading.client, event.slug);
    expect((await org.post(`/api/events/${event.slug}/guests/${reading.guest.id}/block`)).statusCode).toBe(200);
    const captureId = fake.forceCaptured(readOrder.orderId, `CAP-READ-${randomBytes(2).toString('hex')}`);
    const got = await reading.client.get(`/api/orders/${readOrder.orderId}`);
    expect(got.statusCode).toBe(200);
    expect(body<{ status: string; guest: Guest }>(got).status).toBe('paid');
    expect(body<{ guest: Guest }>(got).guest.paidCents).toBe(2500);
    expect(body<{ guest: Guest }>(got).guest.blockedAt).toBeTruthy();
    expect(fake.captureCalls.length).toBe(capturesAtStart);
    expect(await count(
      `SELECT COUNT(*)::int AS n FROM payment_ledger WHERE kind = 'capture' AND external_id = $1`,
      [captureId],
    )).toBe(1);

    const hooked = await join(event.slug, 'Webhook');
    const hookOrder = await quoteAndOrder(hooked.client, event.slug);
    expect((await org.post(`/api/events/${event.slug}/guests/${hooked.guest.id}/block`)).statusCode).toBe(200);
    const hookCapture = `CAP-HOOK-${randomBytes(2).toString('hex')}`;
    fake.forceCaptured(hookOrder.orderId, hookCapture);
    const hook = await hooked.client.post('/api/paypal/webhook', {
      id: nextWebhookId(),
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: {
        id: hookCapture,
        amount: { currency_code: 'USD', value: '25.00' },
        supplementary_data: { related_ids: { order_id: hookOrder.orderId } },
      },
    });
    expect(hook.statusCode).toBe(200);
    expect(await count(
      `SELECT COUNT(*)::int AS n FROM payment_ledger WHERE kind = 'capture' AND external_id = $1`,
      [hookCapture],
    )).toBe(1);
    expect((await guestRow(event.slug, 'Webhook')).blocked_at).toBeTruthy();
    expect(fake.captureCalls.length).toBe(capturesAtStart);

    const inflight = await join(event.slug, 'Captura en curso');
    const inflightOrder = await quoteAndOrder(inflight.client, event.slug);
    await pool.query(`UPDATE orders SET status = 'capturing' WHERE paypal_order_id = $1`, [inflightOrder.orderId]);
    expect((await org.post(`/api/events/${event.slug}/guests/${inflight.guest.id}/block`)).statusCode).toBe(200);
    const continued = await inflight.client.post(`/api/orders/${inflightOrder.orderId}/capture`);
    expect(continued.statusCode).toBe(200);
    expect(body<{ status: string; guest: Guest }>(continued).status).toBe('paid');
    expect(fake.captureCalls.length).toBe(capturesAtStart + 1);
    expect(fake.captureCalls.at(-1)?.paypalOrderId).toBe(inflightOrder.orderId);
    const inflightRow = await guestRow(event.slug, 'Captura en curso');
    expect(inflightRow.status).toBe('yes');
    expect(inflightRow.blocked_at).toBeTruthy();
  });

  it('guarda ids del servidor, pagina, borra sin perder la fila y descarta un turno si la revision cambio', async () => {
    const { client: org, event } = await organizer();
    const { client } = await join(event.slug, 'Dina Chat');
    const guest = await guestRow(event.slug, 'Dina Chat');
    const secret = 'tool-secret-set_rsvp';
    const user = await appendChatTurn(pool, guest.event_id, guest.session_id, 'user', [
      { text: '<script>alert(1)</script>' },
    ]);
    const model = await appendChatTurn(pool, guest.event_id, guest.session_id, 'model', [
      { text: 'Respuesta visible' },
      { functionCall: { name: 'set_rsvp', args: { status: 'yes', secret } } },
      {
        openai: {
          type: 'function_call',
          call_id: 'call_moderation',
          name: 'set_rsvp',
          arguments: `{"secret":"${secret}"}`,
        },
      },
    ], user.revision);
    await appendChatTurn(pool, guest.event_id, guest.session_id, 'function', [
      { functionResponse: { name: 'set_rsvp', response: { secret } } },
    ], user.revision);
    for (const text of ['uno', 'dos', 'tres']) {
      await appendChatTurn(pool, guest.event_id, guest.session_id, 'user', [{ text }], user.revision);
    }

    const conversations = body<{ conversations: { id: string; guestName: string | null }[] }>(
      await org.get(`/api/events/${event.slug}/moderation/conversations`),
    );
    const conversation = conversations.conversations.find((item) => item.guestName === 'Dina Chat');
    expect(conversation?.id).toBeTruthy();
    const packed = JSON.stringify(conversations);
    expect(packed).not.toContain(guest.session_id);
    expect(packed).not.toContain(secret);

    const page = body<{ messages: { id: string; role: string; text: string; conversationId: string }[]; nextBefore?: string }>(
      await org.get(`/api/events/${event.slug}/moderation/messages?conversationId=${conversation!.id}&limit=50`),
    );
    const rendered = JSON.stringify(page);
    expect(rendered).toContain('<script>alert(1)</script>');
    expect(rendered).toContain('Respuesta visible');
    expect(rendered).not.toContain(secret);
    expect(rendered).not.toContain('set_rsvp');
    expect(rendered).not.toContain('function_call');
    expect(rendered).not.toContain(guest.session_id);
    expect(page.messages.map((message) => message.id)).toEqual(
      expect.arrayContaining([user.id, model.id]),
    );
    for (const message of page.messages) {
      expect(message.id).toMatch(/^[1-9][0-9]{0,18}$/);
      expect(message.role === 'user' || message.role === 'assistant').toBe(true);
      expect(message.conversationId).toBe(conversation!.id);
    }
    expect(page.messages.some((message) => message.role === 'assistant' && message.text === 'Respuesta visible')).toBe(true);

    const firstPage = body<{ messages: { id: string; text: string }[]; nextBefore?: string }>(
      await org.get(`/api/events/${event.slug}/moderation/messages?conversationId=${conversation!.id}&limit=1`),
    );
    expect(firstPage.messages).toHaveLength(1);
    expect(firstPage.nextBefore).toBeTruthy();
    const older = body<{ messages: { id: string }[] }>(
      await org.get(
        `/api/events/${event.slug}/moderation/messages?conversationId=${conversation!.id}&limit=1&before=${firstPage.nextBefore}`,
      ),
    );
    expect(older.messages[0]?.id).not.toBe(firstPage.messages[0]?.id);

    const own = body<{ messages: { id: string; text: string }[] }>(await client.get(`/api/events/${event.slug}/chat/history?limit=50`));
    expect(own.messages.some((message) => message.text === '<script>alert(1)</script>')).toBe(true);
    expect(JSON.stringify(own)).not.toContain(secret);

    const deleted = await org.delete(`/api/events/${event.slug}/moderation/messages/${user.id}`);
    expect(deleted.statusCode).toBe(200);
    expect(body<{ alreadyDeleted: boolean; id: string }>(deleted)).toEqual({ ok: true, id: user.id, alreadyDeleted: false });
    const again = await org.delete(`/api/events/${event.slug}/moderation/messages/${user.id}`);
    expect(body<{ alreadyDeleted: boolean }>(again).alreadyDeleted).toBe(true);
    const reloaded = body<{ messages: { id: string }[] }>(
      await org.get(`/api/events/${event.slug}/moderation/messages?conversationId=${conversation!.id}&limit=50`),
    );
    expect(reloaded.messages.map((message) => message.id)).not.toContain(user.id);
    const ownAfter = body<{ messages: { id: string }[] }>(await client.get(`/api/events/${event.slug}/chat/history?limit=50`));
    expect(ownAfter.messages.map((message) => message.id)).not.toContain(user.id);
    expect(await count('SELECT COUNT(*)::int AS n FROM chat_messages WHERE id = $1::bigint AND deleted_at IS NOT NULL', [user.id])).toBe(1);

    await expect(
      appendChatTurn(pool, guest.event_id, guest.session_id, 'model', [{ text: 'no debe guardarse' }], user.revision),
    ).rejects.toMatchObject({ statusCode: 403, message: INTERRUPTED_MESSAGE });
    expect(await count(
      `SELECT COUNT(*)::int AS n FROM chat_messages WHERE event_id = $1 AND session_id = $2 AND parts::text LIKE '%no debe guardarse%'`,
      [guest.event_id, guest.session_id],
    )).toBe(0);

    const strangerSession = randomUUID();
    await pool.query('INSERT INTO sessions (id, token_hash) VALUES ($1, $2)', [strangerSession, randomBytes(32)]);
    await appendChatTurn(pool, guest.event_id, strangerSession, 'user', [{ text: 'antes de unirme' }]);
    const scopes = await pool.query<{ public_id: string; session_id: string }>(
      'SELECT public_id, session_id FROM chat_scopes WHERE event_id = $1 AND session_id = $2',
      [guest.event_id, strangerSession],
    );
    const publicId = scopes.rows[0]?.public_id;
    expect(publicId).toBeTruthy();
    const listed = body<{ conversations: { id: string; guestId: string | null; guestName: string | null }[] }>(
      await org.get(`/api/events/${event.slug}/moderation/conversations`),
    );
    const prejoin = listed.conversations.find((item) => item.id === publicId);
    expect(prejoin).toEqual({ id: publicId, guestId: null, guestName: null });
    expect(JSON.stringify(listed)).not.toContain(strangerSession);

    const other = await organizer();
    other.client.authorize(event.slug, other.adminKey);
    expect((await other.client.get(`/api/events/${event.slug}/moderation/messages?conversationId=${publicId}`)).statusCode).toBe(403);

    const blocked = await org.post(`/api/events/${event.slug}/moderation/conversations/${publicId}/block`);
    expect(blocked.statusCode).toBe(200);
    await expect(
      appendChatTurn(pool, guest.event_id, strangerSession, 'model', [{ text: 'respuesta tardia' }]),
    ).rejects.toMatchObject({ statusCode: 403, message: REVOKED_MESSAGE });
  });
});
