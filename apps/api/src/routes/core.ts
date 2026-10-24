import type { Capabilities, Dashboard, FiestaEvent, Guest, Quote } from '@fiestapay/shared';
import type { FastifyInstance } from 'fastify';
import { dashboardFor } from '../domain/dashboard.js';
import { confirmEvent, createEvent, listOwnedEvents, resetDemo, startDemo } from '../domain/events.js';
import { createQuoteForSession } from '../domain/quotes.js';
import { findGuestBySession, getEventBySlug, loadFiestaEvent, loadGuest } from '../domain/read.js';
import { joinEvent, setRsvp } from '../domain/rsvp.js';
import { eventInputSchema, joinSchema, parseOr400, rsvpSchema, slugParamSchema } from '../lib/schemas.js';
import { ensureSession, readSession, requireSession } from '../lib/session.js';
import type { RouteDeps } from './deps.js';

export async function registerCoreRoutes(app: FastifyInstance, deps: RouteDeps): Promise<void> {
  const { pool, config } = deps;

  app.get('/health', async () => ({ ok: true as const }));

  // Capabilities are reported from real server configuration; a provider is never announced as
  // available just because the UI would like it to be.
  app.get('/capabilities', async (): Promise<Capabilities> => ({
    paypal: config.paypal !== null,
    gemini: config.gemini !== null,
    voice: config.voice.enabled,
    paypalClientId: config.paypal?.clientId ?? null,
    sandbox: true,
  }));

  app.post(
    '/demo',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req, reply): Promise<{ event: FiestaEvent }> => {
      const session = await ensureSession(pool, config, req, reply);
      return { event: await startDemo(pool, session.id) };
    },
  );

  app.post(
    '/demo/reset',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req): Promise<{ event: FiestaEvent }> => {
      const session = await requireSession(pool, config, req);
      return { event: await resetDemo(pool, session.id) };
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
    async (req, reply): Promise<{ event: FiestaEvent }> => {
      const session = await ensureSession(pool, config, req, reply);
      const input = parseOr400(eventInputSchema, req.body);
      return { event: await createEvent(pool, session.id, input) };
    },
  );

  // Public invitation: event data plus this session's own guest, never anyone else's and never
  // anything identifying the organizer.
  app.get('/events/:slug', async (req): Promise<{ event: FiestaEvent; guest: Guest | null }> => {
    const { slug } = parseOr400(slugParamSchema, req.params);
    const event = await getEventBySlug(pool, slug);
    const session = await readSession(pool, config, req);
    const guestRow = session ? await findGuestBySession(pool, event.id, session.id) : null;
    return {
      event: await loadFiestaEvent(pool, event),
      guest: guestRow ? await loadGuest(pool, guestRow, event) : null,
    };
  });

  app.post(
    '/events/:slug/join',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req, reply): Promise<{ guest: Guest }> => {
      const { slug } = parseOr400(slugParamSchema, req.params);
      const { name } = parseOr400(joinSchema, req.body);
      const session = await ensureSession(pool, config, req, reply);
      return { guest: await joinEvent(pool, session.id, slug, name) };
    },
  );

  app.post(
    '/events/:slug/rsvp',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (req): Promise<{ guest: Guest; event: FiestaEvent }> => {
      const { slug } = parseOr400(slugParamSchema, req.params);
      const change = parseOr400(rsvpSchema, req.body);
      const session = await requireSession(pool, config, req);
      return setRsvp(pool, session.id, slug, change);
    },
  );

  app.post(
    '/events/:slug/quote',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (req): Promise<{ quote: Quote }> => {
      const { slug } = parseOr400(slugParamSchema, req.params);
      const session = await requireSession(pool, config, req);
      return { quote: await createQuoteForSession(pool, session.id, slug, config.quoteTtlSeconds) };
    },
  );

  app.get('/events/:slug/dashboard', async (req): Promise<Dashboard> => {
    const { slug } = parseOr400(slugParamSchema, req.params);
    const session = await requireSession(pool, config, req);
    return dashboardFor(pool, session.id, slug);
  });

  app.post(
    '/events/:slug/confirm',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req): Promise<{ event: FiestaEvent }> => {
      const { slug } = parseOr400(slugParamSchema, req.params);
      const session = await requireSession(pool, config, req);
      return { event: await confirmEvent(pool, session.id, slug) };
    },
  );
}
