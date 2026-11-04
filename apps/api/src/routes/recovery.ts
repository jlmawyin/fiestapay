import type { RecoveryConsumeResult, RecoveryContactUpdate, RecoveryStatus } from '@fiestapay/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { badRequest } from '../errors.js';
import { presentedAdminKey } from '../domain/access.js';
import {
  PUBLIC_ACCEPTED,
  consumeRecoveryToken,
  limitsFrom,
  recoveryStatus,
  removeRecoveryContact,
  requestRecoveryLink,
  setRecoveryContact,
} from '../domain/recovery.js';
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

function readSlugField(body: unknown): string {
  if (!body || typeof body !== 'object' || !('slug' in body)) throw badRequest('Enlace invalido');
  const slug = (body as { slug?: unknown }).slug;
  if (typeof slug !== 'string') throw badRequest('Enlace invalido');
  return slug;
}

function readTokenField(body: unknown): string {
  if (!body || typeof body !== 'object' || !('token' in body)) throw badRequest('El enlace no es valido. Solicita uno nuevo.');
  const token = (body as { token?: unknown }).token;
  if (typeof token !== 'string') throw badRequest('El enlace no es valido. Solicita uno nuevo.');
  return token;
}

export async function registerRecoveryRoutes(app: FastifyInstance, deps: RouteDeps): Promise<void> {
  const { pool, config, email } = deps;
  const limits = config.email ? limitsFrom(config.email) : null;
  const origin = config.publicOrigin;

  app.get('/events/:slug/recovery', async (req): Promise<RecoveryStatus> => {
    const slug = typeof (req.params as { slug?: unknown }).slug === 'string' ? (req.params as { slug: string }).slug : '';
    return recoveryStatus(pool, slug, presentedAdminKey(req), email !== null);
  });

  app.put('/events/:slug/recovery/contact', async (req): Promise<RecoveryContactUpdate> => {
    const slug = typeof (req.params as { slug?: unknown }).slug === 'string' ? (req.params as { slug: string }).slug : '';
    return setRecoveryContact(pool, slug, presentedAdminKey(req), readEmailField(req.body), clientIp(req), email, limits, origin);
  });

  app.delete('/events/:slug/recovery/contact', async (req): Promise<RecoveryStatus> => {
    const slug = typeof (req.params as { slug?: unknown }).slug === 'string' ? (req.params as { slug: string }).slug : '';
    return removeRecoveryContact(pool, slug, presentedAdminKey(req), email !== null);
  });

  // Public. The admin key is ignored on purpose: a cookie or header must not change this body.
  app.post('/recovery/request', async (req): Promise<typeof PUBLIC_ACCEPTED> => {
    return requestRecoveryLink(pool, readSlugField(req.body), readEmailField(req.body), clientIp(req), email, limits, origin);
  });

  // POST only. Opening the link is a GET of the web page and must not rotate a key.
  app.post('/recovery/consume', async (req): Promise<RecoveryConsumeResult> => {
    return consumeRecoveryToken(pool, readTokenField(req.body));
  });
}
