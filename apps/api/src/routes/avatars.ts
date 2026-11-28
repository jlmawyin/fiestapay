/**
 * Catálogo público de avatares Napster (NAP-S1).
 * Depende de `napster/catalog.ts`. Sirve raíz, legado y sitios de grupo; nunca expone agentIds.
 */
import type { FastifyInstance } from 'fastify';
import { readyPublicAvatars } from '../napster/catalog.js';
import type { RouteDeps } from './deps.js';

/** NAP-S1: catálogo breve y cacheable; el host ya validó que la ruta sea enrutable. */
export async function registerAvatarsRoutes(app: FastifyInstance, _deps: RouteDeps): Promise<void> {
  app.get('/avatars', async (_req, reply) => {
    reply.header('Cache-Control', 'public, max-age=60');
    return { avatars: readyPublicAvatars() };
  });
}
