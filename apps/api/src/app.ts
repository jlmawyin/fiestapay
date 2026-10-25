import { existsSync } from 'node:fs';
import { join } from 'node:path';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import type { GenerateFn } from './ai/gemini.js';
import type { RespondFn } from './ai/openai.js';
import { loadConfig, type Config } from './config.js';
import { createSmtpEmail } from './email/smtp.js';
import type { EmailAdapter } from './email/types.js';
import type { Pool } from './db/pool.js';
import { HttpError } from './errors.js';
import { isAllowedOrigin } from './lib/origin.js';
import { requestLogger } from './lib/redact.js';
import { PayPalSandboxClient } from './paypal/client.js';
import type { PayPalAdapter } from './paypal/types.js';
import { registerRecoveryRoutes } from './routes/recovery.js';
import { registerChatRoutes } from './routes/chat.js';
import { registerVoiceRoutes } from './routes/voice.js';
import { registerCoreRoutes } from './routes/core.js';
import { registerPaymentRoutes } from './routes/payments.js';
import type { RouteDeps } from './routes/deps.js';

export interface BuildAppOptions {
  pool: Pool;
  config?: Config;
  /**
   * PayPal adapter override. Tests inject a fake here; it is never selectable at runtime, so no
   * browser input can switch the server onto a mock.
   */
  paypal?: PayPalAdapter | null;
  /**
   * Email adapter override. Tests inject a fake here. Nothing in the request can select it,
   * and an unconfigured server stays on null instead of pretending mail was sent.
   */
  email?: EmailAdapter | null;
  /** Scripted models for tests; omitted in production so the selected provider's REST call is used. */
  generate?: GenerateFn;
  respond?: RespondFn;
  logger?: boolean;
}

const WEBHOOK_PATH = '/api/paypal/webhook';

/** HTTP status for a thrown error: ours, Fastify's (validation, rate limit) or 500. */
function statusOf(err: unknown): number {
  if (err instanceof HttpError) return err.statusCode;
  const candidate = (err as { statusCode?: unknown } | null)?.statusCode;
  return typeof candidate === 'number' && candidate >= 400 && candidate <= 599 ? candidate : 500;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();
  const pool = options.pool;
  const paypal =
    options.paypal !== undefined ? options.paypal : config.paypal ? new PayPalSandboxClient(config.paypal) : null;
  const email = options.email !== undefined ? options.email : config.email ? createSmtpEmail(config.email) : null;

  const logging = options.logger === false || (options.logger === undefined && config.env === 'test') ? false : requestLogger;
  const app = Fastify({
    logger: logging,
    bodyLimit: config.bodyLimitBytes,
    trustProxy: config.env === 'production',
  });

  // Keep the exact JSON bytes: PayPal signs the body it sent, so verification must use it
  // verbatim instead of a re-serialization.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    const raw = typeof body === 'string' ? body : body.toString('utf8');
    (req as FastifyRequest & { rawBody?: string }).rawBody = raw;
    if (raw.trim().length === 0) {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(raw));
    } catch {
      done(new HttpError(400, 'JSON invalido'), undefined);
    }
  });

  await app.register(cookie, {});
  if (config.rateLimitEnabled) {
    await app.register(rateLimit, {
      global: true,
      max: config.rateLimitMax,
      timeWindow: '1 minute',
      allowList: [],
      keyGenerator: (req) => req.ip,
    });
  }

  /**
   * Same-origin guard for every mutation, session creation included. There is no CORS layer at
   * all: the browser must be served from an allowed origin. The PayPal webhook is exempt
   * because it is server-to-server and authenticated by its signature instead.
   */
  app.addHook('onRequest', async (req, reply) => {
    reply.header('Referrer-Policy', 'no-referrer');
    const pathOnly = req.url.split('?')[0] ?? req.url;
    if (pathOnly === '/api' || pathOnly.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
    const method = req.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD') return;
    const path = req.url.split('?')[0] ?? req.url;
    if (path === WEBHOOK_PATH) return;
    if (!isAllowedOrigin({ origin: req.headers.origin, referer: req.headers.referer, allowed: config.allowedOrigins })) {
      reply.code(403).send({ error: 'Origen no permitido' });
      return reply; // stops the request lifecycle
    }
    return undefined;
  });

  const webIndex = join(config.webDir, 'index.html');
  const serveWeb = config.serveWeb && existsSync(webIndex);

  // Both handlers are installed before any route is registered: child scopes inherit the
  // handlers present when they are created, and every error must render as {error}.
  app.setErrorHandler(async (err: unknown, req, reply) => {
    const status = statusOf(err);
    if (status >= 500) req.log.error({ err }, 'fallo de solicitud');
    const message =
      err instanceof HttpError
        ? err.message
        : status >= 500
          ? // Internal failures never leak provider or stack detail to the client.
            'Error interno del servidor'
          : (err instanceof Error && err.message) || 'Solicitud invalida';
    return reply.code(status).send({ error: message });
  });

  app.setNotFoundHandler(async (req, reply) => {
    const path = req.url.split('?')[0] ?? req.url;
    if (path === '/api' || path.startsWith('/api/')) {
      return reply.code(404).send({ error: 'Ruta no encontrada' });
    }
    if (serveWeb && (req.method === 'GET' || req.method === 'HEAD')) {
      // SPA fallback for client-side routes such as /e/<slug>.
      return reply.type('text/html').sendFile('index.html');
    }
    return reply.code(404).send({ error: 'Ruta no encontrada' });
  });

  const deps: RouteDeps = {
    pool,
    config,
    paypal,
    email,
    ...(options.generate ? { generate: options.generate } : {}),
    ...(options.respond ? { respond: options.respond } : {}),
  };
  await app.register(
    async (api) => {
      await registerCoreRoutes(api, deps);
      await registerRecoveryRoutes(api, deps);
      await registerPaymentRoutes(api, deps);
      await registerChatRoutes(api, deps);
      await registerVoiceRoutes(api, deps);
    },
    { prefix: '/api' },
  );

  if (serveWeb) {
    const fastifyStatic = (await import('@fastify/static')).default;
    await app.register(fastifyStatic, {
      root: config.webDir,
      prefix: '/',
      index: ['index.html'],
      // SPA routes are resolved by the not-found handler, never by a static wildcard.
      wildcard: false,
    });
  }

  return app;
}
