import type { PresentationSuggestion } from '@fiestapay/shared';
import type { FastifyInstance } from 'fastify';
import { suggestPresentation } from '../ai/suggest-presentation.js';
import { requestLocale } from '../lib/locale.js';
import { parseOr400, presentationSuggestionSchema } from '../lib/schemas.js';
import { ensureSession } from '../lib/session.js';
import type { RouteDeps } from './deps.js';

export async function registerSuggestRoutes(app: FastifyInstance, deps: RouteDeps): Promise<void> {
  const { pool, config } = deps;

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
