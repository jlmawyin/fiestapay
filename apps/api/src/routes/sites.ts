/**
 * Rutas HTTP de alta de espacios (SP-7): `POST /api/sites` en la raíz y canje en el subdominio.
 * Depende de `domain/sites.ts`, sesión verificada SP-4 y clasificación de host SP-2.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { badRequest, notFound } from '../errors.js';
import { createGroupSite, redeemSiteHandoff } from '../domain/sites.js';
import type { RouteDeps } from './deps.js';

function clientIp(req: FastifyRequest): string {
  const ip = req.ip;
  return typeof ip === 'string' && ip.length > 0 && ip.length <= 80 ? ip : 'unknown';
}

function assertRootHost(req: FastifyRequest): void {
  if (req.hostClassification?.kind !== 'root') throw notFound('Ruta no encontrada');
}

function assertSiteHost(req: FastifyRequest): string {
  const host = req.hostClassification;
  if (host?.kind !== 'site' || !host.slug) throw notFound('Ruta no encontrada');
  return host.slug;
}

function readSlugField(body: unknown): string {
  if (!body || typeof body !== 'object' || !('slug' in body)) throw badRequest('Slug invalido o reservado');
  const slug = (body as { slug?: unknown }).slug;
  if (typeof slug !== 'string') throw badRequest('Slug invalido o reservado');
  return slug;
}

function readDisplayNameField(body: unknown): string {
  if (!body || typeof body !== 'object' || !('displayName' in body)) {
    throw badRequest('Datos invalidos');
  }
  const name = (body as { displayName?: unknown }).displayName;
  if (typeof name !== 'string') throw badRequest('Datos invalidos');
  return name;
}

function readCodeField(body: unknown): string {
  if (!body || typeof body !== 'object' || !('code' in body)) throw badRequest('Codigo invalido o vencido');
  const code = (body as { code?: unknown }).code;
  if (typeof code !== 'string') throw badRequest('Codigo invalido o vencido');
  return code;
}

/**
 * Monta las rutas de creación y handoff bajo el prefijo `/api`.
 * Entrada: app Fastify y dependencias compartidas.
 */
export async function registerSiteRoutes(app: FastifyInstance, deps: RouteDeps): Promise<void> {
  const { pool, config } = deps;

  app.post('/sites', async (req, reply) => {
    assertRootHost(req);
    reply.code(201);
    return createGroupSite(
      pool,
      config,
      req,
      reply,
      readSlugField(req.body),
      readDisplayNameField(req.body),
      clientIp(req),
    );
  });

  app.post('/sites/handoff', async (req, reply) => {
    const hostSlug = assertSiteHost(req);
    return redeemSiteHandoff(pool, config, req, reply, hostSlug, readCodeField(req.body));
  });
}