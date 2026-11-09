import type { ReminderDraftResult } from '@fiestapay/shared';
import type { FastifyInstance } from 'fastify';
import { draftReminders, type ReminderGuest } from '../ai/reminder-draft.js';
import { publicEventPath } from '../ai/assistant-policy.js';
import { assertAdminKey, presentedAdminKey } from '../domain/access.js';
import { loadGuestBalances } from '../domain/dashboard.js';
import { assertActive } from '../domain/events.js';
import { getEventBySlug } from '../domain/read.js';
import { concealExpired } from '../domain/retention.js';
import { requestLocale } from '../lib/locale.js';
import { parseOr400, reminderDraftSchema, slugParamSchema } from '../lib/schemas.js';
import { ensureSession } from '../lib/session.js';
import type { RouteDeps } from './deps.js';

export async function registerReminderRoutes(app: FastifyInstance, deps: RouteDeps): Promise<void> {
  const { pool, config } = deps;

  /**
   * Organizer-only reminder drafts. Requires the current X-Fiesta-Admin-Key (the route never
   * reads the creator cookie as authority), an active event and confirmed guests with a positive
   * SQL-calculated balance. It composes text only: no WhatsApp, SMTP or other outbound call.
   */
  app.post(
    '/events/:slug/reminders/draft',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req, reply): Promise<ReminderDraftResult> => {
      const { slug } = parseOr400(slugParamSchema, req.params);
      const { tone } = parseOr400(reminderDraftSchema, req.body);
      const event = await getEventBySlug(pool, slug);
      assertAdminKey(event, presentedAdminKey(req));
      await concealExpired(pool, event);
      assertActive(event);

      const locale = requestLocale(req);
      const session = await ensureSession(pool, config, req, reply);
      const balances = await loadGuestBalances(pool, event);

      // Only guests who said yes and still owe something. dueCents is computed by SQL.
      const guests: ReminderGuest[] = balances
        .filter((guest) => guest.status === 'yes' && guest.dueCents > 0)
        .map((guest) => ({ id: guest.id, alias: guest.name, dueCents: guest.dueCents }));

      const origin = config.publicOrigin ?? config.allowedOrigins[0] ?? null;
      const link = publicEventPath(origin, event.slug);

      reply.header('Cache-Control', 'no-store');
      return draftReminders(
        pool,
        config,
        session.id,
        event.id,
        event.title,
        guests,
        tone,
        locale,
        () => link,
        { ...(deps.respond ? { respond: deps.respond } : {}) },
      );
    },
  );
}
