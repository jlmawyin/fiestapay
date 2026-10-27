import type { ModerationActionResult, ModerationMessagePage } from '@fiestapay/shared';
import type { FastifyInstance } from 'fastify';
import { presentedAdminKey } from '../domain/access.js';
import { badRequest } from '../errors.js';
import {
  blockConversation,
  blockGuest,
  deleteChatMessage,
  listConversations,
  listModerationGuests,
  listModerationMessages,
  removeGuest,
  unblockConversation,
  unblockGuest,
} from '../domain/moderation.js';
import {
  conversationIdParamSchema,
  guestIdParamSchema,
  messageIdParamSchema,
  parseOr400,
  slugParamSchema,
  transcriptQuerySchema,
} from '../lib/schemas.js';
import type { RouteDeps } from './deps.js';

export async function registerModerationRoutes(app: FastifyInstance, deps: RouteDeps): Promise<void> {
  const { pool } = deps;
  const writeLimit = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };
  const readLimit = { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } };

  app.get('/events/:slug/moderation/guests', readLimit, async (req) => {
    const { slug } = parseOr400(slugParamSchema, req.params);
    return listModerationGuests(pool, slug, presentedAdminKey(req));
  });

  app.post('/events/:slug/guests/:guestId/block', writeLimit, async (req): Promise<ModerationActionResult> => {
    const { slug, guestId } = parseOr400(guestIdParamSchema, req.params);
    return blockGuest(pool, slug, guestId, presentedAdminKey(req));
  });

  app.post('/events/:slug/guests/:guestId/unblock', writeLimit, async (req): Promise<ModerationActionResult> => {
    const { slug, guestId } = parseOr400(guestIdParamSchema, req.params);
    return unblockGuest(pool, slug, guestId, presentedAdminKey(req));
  });

  app.post('/events/:slug/guests/:guestId/remove', writeLimit, async (req, reply) => {
    const { slug, guestId } = parseOr400(guestIdParamSchema, req.params);
    const result = await removeGuest(pool, slug, guestId, presentedAdminKey(req));
    if (!result.ok) {
      return reply.code(409).send({
        error: result.message,
        code: result.code,
        blockAvailable: result.blockAvailable,
        guest: result.guest,
      });
    }
    const body: ModerationActionResult = { outcome: result.outcome, guest: result.guest, message: result.message };
    return body;
  });

  app.get('/events/:slug/moderation/conversations', readLimit, async (req) => {
    const { slug } = parseOr400(slugParamSchema, req.params);
    return listConversations(pool, slug, presentedAdminKey(req));
  });

  app.get('/events/:slug/moderation/messages', readLimit, async (req): Promise<ModerationMessagePage> => {
    const { slug } = parseOr400(slugParamSchema, req.params);
    const query = parseOr400(transcriptQuerySchema, req.query);
    if (!query.conversationId) throw badRequest('Conversacion requerida');
    return listModerationMessages(pool, slug, presentedAdminKey(req), query.conversationId, query.limit, query.before);
  });

  app.delete('/events/:slug/moderation/messages/:messageId', writeLimit, async (req) => {
    const { slug, messageId } = parseOr400(messageIdParamSchema, req.params);
    return deleteChatMessage(pool, slug, messageId, presentedAdminKey(req));
  });

  app.post('/events/:slug/moderation/conversations/:conversationId/block', writeLimit, async (req) => {
    const { slug, conversationId } = parseOr400(conversationIdParamSchema, req.params);
    return blockConversation(pool, slug, conversationId, presentedAdminKey(req));
  });

  app.post('/events/:slug/moderation/conversations/:conversationId/unblock', writeLimit, async (req) => {
    const { slug, conversationId } = parseOr400(conversationIdParamSchema, req.params);
    return unblockConversation(pool, slug, conversationId, presentedAdminKey(req));
  });
}
