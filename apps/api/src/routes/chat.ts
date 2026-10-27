import type { ChatResult, ChatTranscript } from '@fiestapay/shared';
import type { FastifyInstance } from 'fastify';
import { chatWithAssistant } from '../ai/chat.js';
import { presentedAdminKey } from '../domain/access.js';
import { listOwnTranscript } from '../domain/moderation.js';
import { chatSchema, parseOr400, slugParamSchema, transcriptQuerySchema } from '../lib/schemas.js';
import { ensureSession, readSession } from '../lib/session.js';
import type { RouteDeps } from './deps.js';

export async function registerChatRoutes(app: FastifyInstance, deps: RouteDeps): Promise<void> {
  const { pool, config } = deps;

  // Text assistant. It can read authorized event state and produce a quote card, but the
  // payment boundary stays in the UI: the person confirms, and only then the browser calls the
  // order and capture routes.
  app.post(
    '/events/:slug/chat',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req, reply): Promise<ChatResult> => {
      const { slug } = parseOr400(slugParamSchema, req.params);
      const { message } = parseOr400(chatSchema, req.body);
      const session = await ensureSession(pool, config, req, reply);
      return chatWithAssistant(pool, config, session.id, slug, message, {
        generate: deps.generate,
        respond: deps.respond,
      }, presentedAdminKey(req));
    },
  );

  // Own transcript only. A missing cookie is an empty page, not another guest's history.
  app.get('/events/:slug/chat/history', async (req): Promise<ChatTranscript> => {
    const { slug } = parseOr400(slugParamSchema, req.params);
    const query = parseOr400(transcriptQuerySchema, req.query);
    const session = await readSession(pool, config, req);
    return listOwnTranscript(pool, slug, session?.id ?? null, presentedAdminKey(req), query.limit, query.before);
  });
}
