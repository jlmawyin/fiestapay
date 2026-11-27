/**
 * Rutas del directorio público (solo host raíz) y visibilidad de eventos en sitio (SP-6).
 * Depende de `domain/portal.ts` y clasificación de `Host`.
 */
import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { forbidden, notFound } from '../errors.js';
import { currentAccount } from '../domain/accounts.js';
import { listPortalPublicEvents, updateSiteEventVisibility } from '../domain/portal.js';
import { parseOr400 } from '../lib/schemas.js';
import type { RouteDeps } from './deps.js';

function assertRootHost(req: FastifyRequest): void {
  if (req.hostClassification?.kind !== 'root') throw notFound('Ruta no encontrada');
}

function assertSiteHost(req: FastifyRequest): string {
  const host = req.hostClassification;
  if (host?.kind !== 'site' || !host.slug) throw notFound('Ruta no encontrada');
  return host.slug;
}

const visibilityBodySchema = z.object({
  visibility: z.enum(['private', 'public']),
});

/**
 * Registra `GET /portal/events` en la raíz y `PATCH /site/events/:slug/visibility` en el subdominio.
 */
export async function registerPortalRoutes(app: FastifyInstance, deps: RouteDeps): Promise<void> {
  const { pool, config } = deps;

  app.get('/portal/events', async (req) => {
    assertRootHost(req);
    const events = await listPortalPublicEvents(pool);
    return { events };
  });

  app.patch('/site/events/:slug/visibility', async (req) => {
    const hostSlug = assertSiteHost(req);
    const { user } = await currentAccount(pool, config, req);
    if (!user) throw forbidden('No autorizado');
    const slugParam = (req.params as { slug?: unknown }).slug;
    if (typeof slugParam !== 'string') throw notFound('Evento no encontrado');
    const { visibility } = parseOr400(visibilityBodySchema, req.body);
    const saved = await updateSiteEventVisibility(pool, hostSlug, user.id, slugParam, visibility);
    return { visibility: saved };
  });
}