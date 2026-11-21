/**
 * Rutas HTTP de cuentas Somos Panas (SP-4): registro y sesión en la raíz;
 * configuración y eventos privados del sitio en el subdominio correspondiente.
 * Depende de `domain/accounts.ts`, `domain/access.ts` y clasificación de `Host` en la petición.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { badRequest, notFound } from '../errors.js';
import {
  currentAccount,
  loginAccount,
  logoutAccount,
  registerAccount,
  resolveEmailHmacKey,
  requireVerifiedUser,
  verifyAccountEmail,
} from '../domain/accounts.js';
import { readPrivateEventForSiteAdmin } from '../domain/access.js';
import type { RouteDeps } from './deps.js';

function clientIp(req: FastifyRequest): string {
  const ip = req.ip;
  return typeof ip === 'string' && ip.length > 0 && ip.length <= 80 ? ip : 'unknown';
}

function readEmailField(body: unknown): string {
  if (!body || typeof body !== 'object' || !('email' in body)) throw badRequest('Correo invalido');
  const email = (body as { email?: unknown }).email;
  if (typeof email !== 'string') throw badRequest('Correo invalido');
  return email;
}

function readPasswordField(body: unknown): string {
  if (!body || typeof body !== 'object' || !('password' in body)) throw badRequest('Datos invalidos');
  const password = (body as { password?: unknown }).password;
  if (typeof password !== 'string') throw badRequest('Datos invalidos');
  return password;
}

function readTokenField(body: unknown): string {
  if (!body || typeof body !== 'object' || !('token' in body)) throw badRequest('El enlace no es valido. Solicita uno nuevo.');
  const token = (body as { token?: unknown }).token;
  if (typeof token !== 'string') throw badRequest('El enlace no es valido. Solicita uno nuevo.');
  return token;
}

function assertRootHost(req: FastifyRequest): void {
  if (req.hostClassification?.kind !== 'root') throw notFound('Ruta no encontrada');
}

function assertSiteHost(req: FastifyRequest): string {
  const host = req.hostClassification;
  if (host?.kind !== 'site' || !host.slug) throw notFound('Ruta no encontrada');
  return host.slug;
}

/**
 * Registra las rutas bajo el prefijo `/api` que el ensamblador ya aplica.
 * Entrada: instancia Fastify y dependencias compartidas.
 */
export async function registerAccountRoutes(app: FastifyInstance, deps: RouteDeps): Promise<void> {
  const { pool, config, email } = deps;
  const origin = config.publicOrigin;
  const dailyCap = config.email?.dailyCap ?? 100;

  app.post('/accounts/register', async (req, _reply) => {
    assertRootHost(req);
    const hmacKey = resolveEmailHmacKey(process.env);
    return registerAccount(pool, readEmailField(req.body), readPasswordField(req.body), clientIp(req), email, origin, hmacKey, dailyCap);
  });

  app.post('/accounts/login', async (req, reply) => {
    assertRootHost(req);
    const hmacKey = resolveEmailHmacKey(process.env);
    return loginAccount(pool, config, req, reply, readEmailField(req.body), readPasswordField(req.body), clientIp(req), hmacKey);
  });

  app.post('/accounts/verify', async (req) => {
    assertRootHost(req);
    const hmacKey = resolveEmailHmacKey(process.env);
    return verifyAccountEmail(pool, readTokenField(req.body), hmacKey);
  });

  app.post('/accounts/logout', async (req) => logoutAccount(pool, config, req));

  app.get('/accounts/me', async (req) => currentAccount(pool, config, req));

  app.get('/site/events/:slug', async (req, reply) => {
    const hostSlug = assertSiteHost(req);
    const { user } = await requireVerifiedUser(pool, config, req, reply);
    const slugParam = (req.params as { slug?: unknown }).slug;
    if (typeof slugParam !== 'string') throw notFound('Evento no encontrado');
    const event = await readPrivateEventForSiteAdmin(pool, hostSlug, user.id, slugParam);
    return {
      event: {
        id: event.id,
        slug: event.slug,
        title: event.title,
        visibility: event.visibility,
      },
    };
  });
}