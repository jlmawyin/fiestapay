/**
 * Rutas HTTP de configuración por sitio (SP-5) bajo `/api/site/*` en host de subdominio.
 * Depende de `domain/tenant-settings.ts`, `domain/accounts.ts` y clasificación de `Host`.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { badRequest, forbidden, notFound, unavailable } from '../errors.js';
import { currentAccount } from '../domain/accounts.js';
import {
  parseAndValidateSiteSettings,
  readPublicSiteSettings,
  readTenantSettingsForAdmin,
  siteAssistantModuleEnabled,
  updateTenantSiteSettings,
} from '../domain/tenant-settings.js';
import type { RouteDeps } from './deps.js';

function assertSiteHost(req: FastifyRequest): string {
  const host = req.hostClassification;
  if (host?.kind !== 'site' || !host.slug) throw notFound('Ruta no encontrada');
  return host.slug;
}

/**
 * En rutas de admin del sitio, visitante sin cuenta verificada recibe 403 (criterio SP-5), no 401.
 */
async function requireSiteAdminUser(deps: RouteDeps, req: FastifyRequest): Promise<{ userId: string }> {
  const { user } = await currentAccount(deps.pool, deps.config, req);
  if (!user) throw forbidden('No autorizado');
  return { userId: user.id };
}

/**
 * Registra GET/PUT de configuración, lectura pública de marca y voz pública del sitio.
 */
export async function registerSettingsRoutes(app: FastifyInstance, deps: RouteDeps): Promise<void> {
  const { pool, config } = deps;

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
   * Voz pública del subdominio: 404 si `modulo_asistente` está apagado (prueba distinta del corte de host).
   * Con el módulo encendido exige consentimiento como el endpoint legado.
   */
  app.post('/site/voice/public/token', async (req) => {
    const hostSlug = assertSiteHost(req);
    const enabled = await siteAssistantModuleEnabled(pool, hostSlug);
    if (!enabled) throw notFound('Ruta no encontrada');
    const body = req.body;
    const consent =
      body && typeof body === 'object' && 'consent' in body ? (body as { consent?: unknown }).consent : undefined;
    if (consent !== true) throw badRequest('Se requiere consentimiento');
    if (!config.voice.enabled) {
      throw unavailable('La voz no está habilitada');
    }
    return { ok: true as const, audience: 'public' as const };
  });
}