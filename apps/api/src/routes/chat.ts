import { ASSISTANT_CONTEXTS, type ChatResult, type ChatTranscript } from '@fiestapay/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { chatWithAssistant } from '../ai/chat.js';
import { chatPublic } from '../ai/public-chat.js';
import { presentedAdminKey } from '../domain/access.js';
import { listOwnTranscript } from '../domain/moderation.js';
import { requestLocale } from '../lib/locale.js';
import { chatSchema, parseOr400, slugParamSchema, transcriptQuerySchema } from '../lib/schemas.js';
import { ensureSession, readSession } from '../lib/session.js';
import type { RouteDeps } from './deps.js';

/** Public chat accepts the current question and an optional public context: no role, history, event or client flags. */
const publicChatSchema = z.object({
  message: z.string().trim().min(1).max(1200),
  context: z.enum(ASSISTANT_CONTEXTS).optional(),
}).strict();

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
        respond: deps.respond,
      }, presentedAdminKey(req), requestLocale(req));
    },
  );

  // Public informational chat: no event, guest, organizer key, tools or stored transcript.
  // The session cookie identifies the shared per-session budget; the message itself is not saved.
  app.post(
    '/chat/public',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req, reply): Promise<{ text: string }> => {
      const { message, context } = parseOr400(publicChatSchema, req.body);
      const session = await ensureSession(pool, config, req, reply);
      return chatPublic(pool, config, session.id, message, {
        ...(deps.respond ? { respond: deps.respond } : {}),
      }, { locale: requestLocale(req), context: context ?? 'landing' });
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
