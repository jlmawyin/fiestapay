import type { DraftEventProposal, PresentationSuggestion } from '@fiestapay/shared';
import type { FastifyInstance } from 'fastify';
import { draftEvent } from '../ai/draft-event.js';
import { suggestPresentation } from '../ai/suggest-presentation.js';
import { requestLocale } from '../lib/locale.js';
import { draftEventSchema, parseOr400, presentationSuggestionSchema } from '../lib/schemas.js';
import { ensureSession } from '../lib/session.js';
import type { RouteDeps } from './deps.js';

export async function registerSuggestRoutes(app: FastifyInstance, deps: RouteDeps): Promise<void> {
  const { pool, config } = deps;

  // "Describe your party in one sentence". It only pre-fills the creation form: no event,
  // guest or payment row is written. The shared AI budget is the single reservation.
  app.post(
    '/ai/draft-event',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req, reply): Promise<DraftEventProposal> => {
      const { text } = parseOr400(draftEventSchema, req.body);
      const session = await ensureSession(pool, config, req, reply);
      reply.header('Cache-Control', 'no-store');
      return draftEvent(pool, config, session.id, text, requestLocale(req), {
        ...(deps.respond ? { respond: deps.respond } : {}),
      });
    },
  );

  // Optional help at the end of the creation assistant. It reads and writes no event: the body
  // only describes the gathering and the answer is a theme plus a short invitation line.
  app.post(
    '/ai/suggest-presentation',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req, reply): Promise<PresentationSuggestion> => {
      const input = parseOr400(presentationSuggestionSchema, req.body);
      const session = await ensureSession(pool, config, req, reply);
      return suggestPresentation(pool, config, session.id, input, requestLocale(req), {
        ...(deps.respond ? { respond: deps.respond } : {}),
      });
    },
  );
}
