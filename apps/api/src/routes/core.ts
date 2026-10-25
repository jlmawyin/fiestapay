import type { Capabilities, CreatedEvent, Dashboard, FiestaEvent, Guest, Quote } from '@fiestapay/shared';
import type { FastifyInstance } from 'fastify';
import { assertPrivateAccess, presentedAdminKey } from '../domain/access.js';
import { dashboardFor } from '../domain/dashboard.js';
import {
  assertActive,
  bootstrapAdminKey,
  closeEvent,
  confirmEvent,
  createEvent,
  deleteEvent,
  listOwnedEvents,
  resetDemo,
  startDemo,
  unlockEvent,
  updateEvent,
} from '../domain/events.js';
import { createQuoteForSession } from '../domain/quotes.js';
import { findGuestBySession, getEventBySlug, loadFiestaEvent, loadGuest } from '../domain/read.js';
import { concealExpired } from '../domain/retention.js';
import { joinEvent, setRsvp } from '../domain/rsvp.js';
import { eventInputSchema, joinSchema, parseOr400, rsvpSchema, slugParamSchema, unlockSchema } from '../lib/schemas.js';
import { ensureSession, readSession, requireSession } from '../lib/session.js';
import type { RouteDeps } from './deps.js';

export async function registerCoreRoutes(app: FastifyInstance, deps: RouteDeps): Promise<void> {
  const { pool, config } = deps;

  app.get('/health', async () => ({ ok: true as const }));

  // Capabilities are reported from real server configuration; a provider is never announced as
  // available just because the UI would like it to be.
  app.get('/capabilities', async (): Promise<Capabilities> => ({
    paypal: config.paypal !== null,
    // Only the selected provider is ever configured, so `gemini` is false whenever OpenAI is chosen.
    gemini: config.llmProvider === 'gemini' && config.gemini !== null,
    chat: config.llmProvider === 'openai' ? config.openai !== null : config.gemini !== null,
    llmProvider: config.llmProvider,
    voice: config.voice.enabled,
    paypalClientId: config.paypal?.clientId ?? null,
    sandbox: true,
  }));

  app.post(
    '/demo',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req, reply): Promise<CreatedEvent> => {
      const session = await ensureSession(pool, config, req, reply);
      return startDemo(pool, session.id);
    },
  );

  app.post(
    '/demo/reset',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req): Promise<CreatedEvent> => {
      const session = await requireSession(pool, config, req);
      return resetDemo(pool, session.id);
    },
  );

  app.get('/events', async (req): Promise<{ events: FiestaEvent[] }> => {
    const session = await readSession(pool, config, req);
    if (!session) return { events: [] };
    return { events: await listOwnedEvents(pool, session.id) };
  });

  app.post(
    '/events',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req, reply): Promise<CreatedEvent> => {
      const session = await ensureSession(pool, config, req, reply);
      const input = parseOr400(eventInputSchema, req.body);
      return createEvent(pool, session.id, input);
    },
  );

  // Public invitation. A private code or a past-retention event yields no body.
  app.get('/events/:slug', async (req): Promise<{ event: FiestaEvent; guest: Guest | null }> => {
    const { slug } = parseOr400(slugParamSchema, req.params);
    const event = await getEventBySlug(pool, slug);
    await concealExpired(pool, event);
    assertActive(event);
    const session = await readSession(pool, config, req);
    await assertPrivateAccess(pool, event, session?.id ?? null, presentedAdminKey(req));
    const guestRow = session ? await findGuestBySession(pool, event.id, session.id) : null;
    return {
      event: await loadFiestaEvent(pool, event),
      guest: guestRow ? await loadGuest(pool, guestRow, event) : null,
    };
  });

  app.post(
    '/events/:slug/unlock',
    { config: { rateLimit: { max: 8, timeWindow: '1 minute' } } },
    async (req, reply): Promise<{ ok: true }> => {
      const { slug } = parseOr400(slugParamSchema, req.params);
      const { code } = parseOr400(unlockSchema, req.body);
      const session = await ensureSession(pool, config, req, reply);
      await unlockEvent(pool, session.id, slug, code);
      return { ok: true };
    },
  );

  app.post(
    '/events/:slug/admin/key',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req): Promise<{ adminKey: string }> => {
      const { slug } = parseOr400(slugParamSchema, req.params);
      const session = await requireSession(pool, config, req);
      return { adminKey: await bootstrapAdminKey(pool, session.id, slug) };
    },
  );

  app.put(
    '/events/:slug',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req): Promise<{ event: FiestaEvent }> => {
      const { slug } = parseOr400(slugParamSchema, req.params);
      const input = parseOr400(eventInputSchema, req.body);
      return { event: await updateEvent(pool, slug, presentedAdminKey(req), input) };
    },
  );

  app.post(
    '/events/:slug/close',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req): Promise<{ event: FiestaEvent }> => {
      const { slug } = parseOr400(slugParamSchema, req.params);
      return { event: await closeEvent(pool, slug, presentedAdminKey(req)) };
    },
  );

  app.delete(
    '/events/:slug',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req): Promise<{ ok: true }> => {
      const { slug } = parseOr400(slugParamSchema, req.params);
      await deleteEvent(pool, slug, presentedAdminKey(req));
      return { ok: true };
    },
  );

  app.post(
    '/events/:slug/join',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req, reply): Promise<{ guest: Guest }> => {
      const { slug } = parseOr400(slugParamSchema, req.params);
      const { name } = parseOr400(joinSchema, req.body);
      const session = await ensureSession(pool, config, req, reply);
      return { guest: await joinEvent(pool, session.id, slug, name, presentedAdminKey(req)) };
    },
  );

  app.post(
    '/events/:slug/rsvp',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (req): Promise<{ guest: Guest; event: FiestaEvent }> => {
      const { slug } = parseOr400(slugParamSchema, req.params);
      const change = parseOr400(rsvpSchema, req.body);
      const session = await requireSession(pool, config, req);
      return setRsvp(pool, session.id, slug, change, presentedAdminKey(req));
    },
  );

  app.post(
    '/events/:slug/quote',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (req): Promise<{ quote: Quote }> => {
      const { slug } = parseOr400(slugParamSchema, req.params);
      const session = await requireSession(pool, config, req);
      return { quote: await createQuoteForSession(pool, session.id, slug, config.quoteTtlSeconds, presentedAdminKey(req)) };
    },
  );

  app.get('/events/:slug/dashboard', async (req): Promise<Dashboard> => {
    const { slug } = parseOr400(slugParamSchema, req.params);
    return dashboardFor(pool, slug, presentedAdminKey(req));
  });

  app.post(
    '/events/:slug/confirm',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req): Promise<{ event: FiestaEvent }> => {
      const { slug } = parseOr400(slugParamSchema, req.params);
      return { event: await confirmEvent(pool, slug, presentedAdminKey(req)) };
    },
  );
}
