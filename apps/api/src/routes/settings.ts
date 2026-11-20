/**
 * Rutas HTTP de configuración por sitio (SP-5) bajo `/api/site/*` en host de subdominio.
 * Depende de `domain/tenant-settings.ts`, `domain/accounts.ts` y clasificación de `Host`.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { forbidden, notFound } from '../errors.js';
import { currentAccount } from '../domain/accounts.js';
import {
  assertSiteAssistantVoiceAllowed,
  parseAndValidateSiteSettings,
  readPublicSiteSettings,
  readTenantSettingsForAdmin,
  siteAssistantModuleEnabled,
  updateTenantSiteSettings,
} from '../domain/tenant-settings.js';
import type { RouteDeps } from './deps.js';

/**
 * Exige host clasificado como `site` y devuelve el slug del subdominio.
 * Entrada: request Fastify con `hostClassification`. Salida: slug o HttpError 404.
 */
function assertSiteHost(req: FastifyRequest): string {
  const host = req.hostClassification;
  if (host?.kind !== 'site' || !host.slug) throw notFound('Ruta no encontrada');
  return host.slug;
}

/**
 * Resuelve un usuario verificado para rutas de admin; visitante anónimo recibe 403 (SP-5).
 * Entrada: dependencias y request. Salida: `userId` del admin autenticado o HttpError 403.
 */
async function requireSiteAdminUser(deps: RouteDeps, req: FastifyRequest): Promise<{ userId: string }> {
  const { user } = await currentAccount(deps.pool, deps.config, req);
  if (!user) throw forbidden('No autorizado');
  return { userId: user.id };
}

/**
 * Registra GET/PUT de configuración, lectura pública de marca y stub de voz del sitio (404 hasta SP-10).
 * Entrada: instancia Fastify y `RouteDeps`. Salida: void cuando las rutas quedan montadas.
 */
export async function registerSettingsRoutes(app: FastifyInstance, deps: RouteDeps): Promise<void> {
  const { pool } = deps;

  app.get('/site/profile', async (req) => {
    const hostSlug = assertSiteHost(req);
    const settings = await readPublicSiteSettings(pool, hostSlug);
    return { settings };
  });

  app.get('/site/settings', async (req) => {
    const hostSlug = assertSiteHost(req);
    const { userId } = await requireSiteAdminUser(deps, req);
    const settings = await readTenantSettingsForAdmin(pool, hostSlug, userId);
    return { settings };
  });

  app.put('/site/settings', async (req) => {
    const hostSlug = assertSiteHost(req);
    const { userId } = await requireSiteAdminUser(deps, req);
    const settings = parseAndValidateSiteSettings(req.body);
    const saved = await updateTenantSiteSettings(pool, hostSlug, userId, settings);
    return { settings: saved };
  });

  /**
   * SP5-D-5: sin token efímero real hasta SP-10; la guarda del módulo sigue activa y siempre 404 después.
   */
  app.post('/site/voice/public/token', async (req) => {
    const hostSlug = assertSiteHost(req);
    const enabled = await siteAssistantModuleEnabled(pool, hostSlug);
    assertSiteAssistantVoiceAllowed(enabled);
    throw notFound('Ruta no encontrada');
  });
}