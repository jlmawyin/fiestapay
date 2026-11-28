import type { Capabilities, CreatedEvent, Dashboard, FiestaEvent, Guest, HostInfo, Quote } from '@fiestapay/shared';
import type { FastifyInstance } from 'fastify';
import { notFound } from '../errors.js';
import { assertPrivateAccess, presentedAdminKey, resolveEventPortalGate } from '../domain/access.js';
import { dashboardFor } from '../domain/dashboard.js';
import {
  assertActive,
  bootstrapAdminKey,
  closeEvent,
  confirmEvent,
  createDemoEvent,
  createEvent,
  deleteEvent,
  listOwnedEvents,
  resetDemo,
  setEventAvatarChoice,
  startDemo,
  unlockEvent,
  updateEvent,
} from '../domain/events.js';
import { createQuoteForSession } from '../domain/quotes.js';
import { findGuestBySession, getEventBySlug, loadFiestaEvent, loadGuest, type FiestaEventWithDemo } from '../domain/read.js';
import { concealExpired } from '../domain/retention.js';
import { joinEvent, setRsvp } from '../domain/rsvp.js';
import {
  assertNoClientMoneyState,
  avatarChoiceSchema,
  demoBodySchema,
  eventInputSchema,
  joinSchema,
  parseOr400,
  rsvpSchema,
  slugParamSchema,
  unlockSchema,
} from '../lib/schemas.js';
import { requestLocale } from '../lib/locale.js';
import { ensureSession, readSession, requireSession } from '../lib/session.js';
import { avatarIsReady, findAvatarById } from '../napster/catalog.js';
import type { RouteDeps } from './deps.js';

const DEMO_BUYER_SANDBOX_HOSTS = new Set(['api-m.sandbox.paypal.com', 'api.sandbox.paypal.com']);

type DemoBuyerResponse =
  | { available: false; sandbox: true }
  | { available: true; sandbox: true; email: string; password: string };

/** Fail closed unless PayPal itself is configured on the exact HTTPS sandbox origin. */
function isSandboxPayPalBaseUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' && DEMO_BUYER_SANDBOX_HOSTS.has(parsed.host);
  } catch {
    return false;
  }
}

export async function registerCoreRoutes(app: FastifyInstance, deps: RouteDeps): Promise<void> {
  const { pool, config } = deps;

  app.get('/health', async () => ({ ok: true as const }));

  /** NAP-S2: identidad pública del host; la SPA no recibe ids internos ni datos privados. */
  app.get('/host-info', async (req): Promise<HostInfo> => {
    const host = req.hostClassification;
    if (host?.kind === 'root') return { kind: 'root' };
    if (host?.kind === 'legacy') return { kind: 'legacy' };
    if (host?.kind === 'site' && host.slug) return { kind: 'site', slug: host.slug };
    if (host?.kind === 'event' && host.slug && host.subdomain) {
      return { kind: 'event', slug: host.slug, subdomain: host.subdomain };
    }
    if (host?.kind === 'free' && host.label) return { kind: 'free', label: host.label };
    if (host?.kind === 'reserved' && host.label) return { kind: 'reserved', label: host.label };
    throw notFound('Ruta no encontrada');
  });

  // Capabilities are reported from real server configuration; a provider is never announced as
  // available just because the UI would like it to be.
  app.get('/capabilities', async (): Promise<Capabilities> => ({
    paypal: config.paypal !== null,
    avatar: config.napster !== null && Boolean(config.napster.agentIdEs) && Boolean(config.napster.agentIdEn),
    paypalClientId: config.paypal?.clientId ?? null,
    sandbox: true,
    email: deps.email !== null,
  }));

  /**
   * Intentional public disclosure for a NEW dedicated, fictitious Personal sandbox buyer.
   * No merchant credential, query, body, or fallback source can select what is returned.
   */
  app.get(
    '/demo/buyer',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (_req, reply): Promise<DemoBuyerResponse> => {
      reply.header('Cache-Control', 'no-store');
      const buyer = config.demoBuyer;
      if (!buyer || !config.paypal || !isSandboxPayPalBaseUrl(config.paypal.baseUrl)) {
        return { available: false, sandbox: true };
      }
      return { available: true, sandbox: true, email: buyer.email, password: buyer.password };
    },
  );

  app.post(
    '/demo',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req, reply): Promise<CreatedEvent> => {
      const session = await ensureSession(pool, config, req, reply);
      // No body (or an empty object) keeps the historical reuse behaviour untouched.
      const { kind } = parseOr400(demoBodySchema, req.body ?? {});
      if (!kind) return startDemo(pool, session.id);
      return createDemoEvent(pool, session.id, requestLocale(req));
    },
  );

  app.post(
    '/demo/reset',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req): Promise<CreatedEvent> => {
      const session = await requireSession(pool, config, req);
      return resetDemo(pool, session.id, requestLocale(req));
    },
  );

  app.get('/events', async (req): Promise<{ events: FiestaEventWithDemo[] }> => {
    const session = await readSession(pool, config, req);
    if (!session) return { events: [] };
    const gate = await resolveEventPortalGate(pool, req, session.id);
    return { events: await listOwnedEvents(pool, session.id, gate) };
  });

  app.post(
    '/events',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req, reply): Promise<CreatedEvent> => {
      const session = await ensureSession(pool, config, req, reply);
      assertNoClientMoneyState(req.body);
      const input = parseOr400(eventInputSchema, req.body);
      // NAP-S3: el avatarId debe existir en el catálogo y tener sus dos agentes listos.
      if (input.avatarId !== undefined && input.avatarId !== null) {
        const avatar = findAvatarById(input.avatarId);
        if (!avatar || !avatarIsReady(avatar)) {
          return reply.code(400).send({ error: 'avatar_unknown' }) as unknown as CreatedEvent;
        }
      }
      // NAP-S2: solo el legado conserva PayPal; raíz y host de evento nacen con `none`.
      const tenantMode = req.hostClassification?.kind === 'legacy' ? 'legacy' : 'none';
      return createEvent(pool, session.id, input, tenantMode);
    },
  );

  /** NAP-S3: el organizador elige quién recibe a sus invitados; `null` vuelve a la default. */
  app.put(
    '/events/:slug/avatar-choice',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req, reply): Promise<{ event: FiestaEvent }> => {
      const { slug } = parseOr400(slugParamSchema, req.params);
      const { avatarId } = parseOr400(avatarChoiceSchema, req.body);
      if (avatarId !== null) {
        const avatar = findAvatarById(avatarId);
        if (!avatar || !avatarIsReady(avatar)) {
          return reply.code(400).send({ error: 'avatar_unknown' }) as unknown as { event: FiestaEvent };
        }
      }
      const session = await readSession(pool, config, req);
      const gate = await resolveEventPortalGate(pool, req, session?.id ?? null);
      return { event: await setEventAvatarChoice(pool, slug, presentedAdminKey(req), avatarId, gate) };
    },
  );

  // Public invitation. A private code or a past-retention event yields no body.
  app.get('/events/:slug', async (req): Promise<{ event: FiestaEvent; guest: Guest | null }> => {
    const { slug } = parseOr400(slugParamSchema, req.params);
    const session = await readSession(pool, config, req);
    const gate = await resolveEventPortalGate(pool, req, session?.id ?? null);
    const event = await getEventBySlug(pool, slug, gate);
    await concealExpired(pool, event);
    assertActive(event);
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
      const gate = await resolveEventPortalGate(pool, req, session.id);
      await unlockEvent(pool, session.id, slug, code, gate);
      return { ok: true };
    },
  );

  app.post(
    '/events/:slug/admin/key',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req): Promise<{ adminKey: string }> => {
      const { slug } = parseOr400(slugParamSchema, req.params);
      const session = await requireSession(pool, config, req);
      const gate = await resolveEventPortalGate(pool, req, session.id);
      return { adminKey: await bootstrapAdminKey(pool, session.id, slug, gate) };
    },
  );

  app.put(
    '/events/:slug',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req): Promise<{ event: FiestaEvent }> => {
      const { slug } = parseOr400(slugParamSchema, req.params);
      assertNoClientMoneyState(req.body);
      const input = parseOr400(eventInputSchema, req.body);
      const session = await readSession(pool, config, req);
      const gate = await resolveEventPortalGate(pool, req, session?.id ?? null);
      return { event: await updateEvent(pool, slug, presentedAdminKey(req), input, gate) };
    },
  );

  app.post(
    '/events/:slug/close',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req): Promise<{ event: FiestaEvent }> => {
      const { slug } = parseOr400(slugParamSchema, req.params);
      const session = await readSession(pool, config, req);
      const gate = await resolveEventPortalGate(pool, req, session?.id ?? null);
      return { event: await closeEvent(pool, slug, presentedAdminKey(req), gate) };
    },
  );

  app.delete(
    '/events/:slug',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req): Promise<{ ok: true }> => {
      const { slug } = parseOr400(slugParamSchema, req.params);
      const session = await readSession(pool, config, req);
      const gate = await resolveEventPortalGate(pool, req, session?.id ?? null);
      await deleteEvent(pool, slug, presentedAdminKey(req), gate);
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
      const gate = await resolveEventPortalGate(pool, req, session.id);
      return { guest: await joinEvent(pool, session.id, slug, name, presentedAdminKey(req), gate) };
    },
  );

  app.post(
    '/events/:slug/rsvp',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (req): Promise<{ guest: Guest; event: FiestaEvent }> => {
      const { slug } = parseOr400(slugParamSchema, req.params);
      const change = parseOr400(rsvpSchema, req.body);
      const session = await requireSession(pool, config, req);
      const gate = await resolveEventPortalGate(pool, req, session.id);
      return setRsvp(pool, session.id, slug, change, presentedAdminKey(req), gate);
    },
  );

  app.post(
    '/events/:slug/quote',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (req): Promise<{ quote: Quote }> => {
      const { slug } = parseOr400(slugParamSchema, req.params);
      const session = await requireSession(pool, config, req);
      const gate = await resolveEventPortalGate(pool, req, session.id);
      return {
        quote: await createQuoteForSession(
          pool,
          session.id,
          slug,
          config.quoteTtlSeconds,
          presentedAdminKey(req),
          requestLocale(req),
          gate,
        ),
      };
    },
  );

  app.get('/events/:slug/dashboard', async (req): Promise<Dashboard> => {
    const { slug } = parseOr400(slugParamSchema, req.params);
    const session = await readSession(pool, config, req);
    const gate = await resolveEventPortalGate(pool, req, session?.id ?? null);
    return dashboardFor(pool, slug, presentedAdminKey(req), gate);
  });

  app.post(
    '/events/:slug/confirm',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req): Promise<{ event: FiestaEvent }> => {
      const { slug } = parseOr400(slugParamSchema, req.params);
      const session = await readSession(pool, config, req);
      const gate = await resolveEventPortalGate(pool, req, session?.id ?? null);
      return { event: await confirmEvent(pool, slug, presentedAdminKey(req), gate) };
    },
  );
}
