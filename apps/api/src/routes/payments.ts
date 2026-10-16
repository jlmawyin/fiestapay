import type { Guest, OrderResult } from '@fiestapay/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { badRequest, unavailable } from '../errors.js';
import { audit } from '../domain/audit.js';
import { captureOwnOrder, createOrderForSession, markOrderApproved, readOwnOrder, requirePayPal } from '../domain/orders.js';
import { convergeCapture, convergeRefund, isApplied } from '../domain/payments.js';
import { findOrderByAnyId } from '../domain/read.js';
import { orderIdParamSchema, orderSchema, parseOr400, slugParamSchema } from '../lib/schemas.js';
import { requireSession } from '../lib/session.js';
import type { RouteDeps } from './deps.js';

interface WebhookBody {
  id?: unknown;
  event_type?: unknown;
  resource?: {
    id?: unknown;
    supplementary_data?: { related_ids?: { order_id?: unknown } };
  };
}

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 200 ? value : null;

/**
 * What to do with a signed notification once we tried to apply it.
 *
 * `retry` is the important one: a capture or refund that arrived ahead of the records it needs
 * (the order not stored yet, the capture not recorded yet, PayPal not publishing it yet) must
 * NOT be written to `webhook_events`. Recording it would answer 2xx, PayPal would stop
 * redelivering, and that notification is often the only one we ever get — a refund lost that
 * way leaves the collected total permanently inflated.
 */
type HookOutcome = { kind: 'done'; note?: string } | { kind: 'retry'; reason: string };

const done = (note?: string): HookOutcome => ({ kind: 'done', ...(note ? { note } : {}) });
const retry = (reason: string): HookOutcome => ({ kind: 'retry', reason });

export async function registerPaymentRoutes(app: FastifyInstance, deps: RouteDeps): Promise<void> {
  const { pool, config } = deps;

  app.post(
    '/events/:slug/orders',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req): Promise<OrderResult> => {
      const { slug } = parseOr400(slugParamSchema, req.params);
      // `confirmed: true` is the server-side trace of the human confirmation step in the UI.
      const { quoteId } = parseOr400(orderSchema, req.body);
      const session = await requireSession(pool, config, req);
      const paypal = requirePayPal(config, deps.paypal);
      return createOrderForSession(pool, paypal, session.id, slug, quoteId);
    },
  );

  app.post(
    '/orders/:orderId/capture',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req): Promise<{ status: string; guest: Guest }> => {
      const { orderId } = parseOr400(orderIdParamSchema, req.params);
      const session = await requireSession(pool, config, req);
      const paypal = requirePayPal(config, deps.paypal);
      return captureOwnOrder(pool, paypal, session.id, orderId);
    },
  );

  // Reading an open order reconciles it against PayPal, so this route costs a PayPal call and
  // needs its own budget instead of only the global one.
  app.get(
    '/orders/:orderId',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (req): Promise<{ status: string; guest: Guest }> => {
      const { orderId } = parseOr400(orderIdParamSchema, req.params);
      const session = await requireSession(pool, config, req);
      const paypal = config.paypal && deps.paypal ? requirePayPal(config, deps.paypal) : null;
      return readOwnOrder(pool, paypal, session.id, orderId);
    },
  );

  /**
   * PayPal webhook. The signature is verified against PayPal's API before anything is applied,
   * and the capture/refund then goes through the same convergence path as the browser flow, so
   * a notification can only ever be applied once.
   */
  app.post(
    '/paypal/webhook',
    { config: { rateLimit: { max: 600, timeWindow: '1 minute' } } },
    async (req, reply) => {
      if (!config.paypal || !deps.paypal) {
        throw unavailable(config.paypalDisabledReason ?? 'PayPal no esta configurado en este servidor');
      }
      if (!config.paypal.webhookId) throw unavailable('PAYPAL_WEBHOOK_ID no esta configurado');

      const rawBody = (req as FastifyRequest & { rawBody?: string }).rawBody;
      if (typeof rawBody !== 'string' || rawBody.length === 0) throw badRequest('Cuerpo vacio');

      const verified = await deps.paypal.verifyWebhookSignature({
        authAlgo: asString(req.headers['paypal-auth-algo']) ?? undefined,
        certUrl: asString(req.headers['paypal-cert-url']) ?? undefined,
        transmissionId: asString(req.headers['paypal-transmission-id']) ?? undefined,
        transmissionSig: asString(req.headers['paypal-transmission-sig']) ?? undefined,
        transmissionTime: asString(req.headers['paypal-transmission-time']) ?? undefined,
        rawBody,
      });
      if (!verified) {
        req.log.warn('webhook con firma invalida');
        return reply.code(400).send({ error: 'Firma de webhook invalida' });
      }

      const body = (req.body ?? {}) as WebhookBody;
      const webhookId = asString(body.id);
      const eventType = asString(body.event_type);
      if (!webhookId || !eventType) throw badRequest('Webhook sin id o tipo');

      const seen = await pool.query<{ id: string }>('SELECT id FROM webhook_events WHERE id = $1', [webhookId]);
      if (seen.rows.length > 0) return { ok: true, duplicate: true };

      const resourceId = asString(body.resource?.id);
      const relatedOrderId = asString(body.resource?.supplementary_data?.related_ids?.order_id);
      const merchantId = config.paypal.merchantId;
      const paypal = deps.paypal;

      /**
       * Applies a capture notification by re-reading the authoritative order from PayPal, never
       * by trusting the amounts in the notification body. Used by both the capture event and
       * the order-completed event.
       */
      const applyCapture = async (paypalOrderId: string | null): Promise<HookOutcome> => {
        if (!paypalOrderId) return retry('notificacion de captura sin referencia de orden');
        const order = await findOrderByAnyId(pool, paypalOrderId);
        // Our row may simply not be committed yet (create still settling): ask for redelivery
        // instead of swallowing the notification.
        if (!order) return retry('orden desconocida todavia');

        const outcome = await convergeCapture(pool, paypal, merchantId, order, null);
        if (isApplied(outcome)) return done();
        if (outcome.transient) return retry(outcome.reason);
        await audit(pool, order.event_id, 'payment_webhook_rejected');
        return done(outcome.reason);
      };

      const handle = async (): Promise<HookOutcome> => {
        switch (eventType) {
          case 'CHECKOUT.ORDER.APPROVED': {
            // Approved is not paid: it only records that the payer finished at PayPal.
            if (!resourceId) return done('aprobacion sin identificador de orden');
            const outcome = await markOrderApproved(pool, resourceId);
            return outcome === 'unknown' ? retry('orden desconocida todavia') : done();
          }
          // The order-level completion carries no trustworthy amount, so it is verified with
          // getOrder exactly like the capture event before anything is counted.
          case 'CHECKOUT.ORDER.COMPLETED':
            return applyCapture(resourceId);
          case 'PAYMENT.CAPTURE.COMPLETED':
            return applyCapture(relatedOrderId);
          case 'PAYMENT.CAPTURE.DECLINED': {
            const order = relatedOrderId ? await findOrderByAnyId(pool, relatedOrderId) : null;
            if (!order) return retry('orden desconocida todavia');
            // A decline never marks anything paid. It also says nothing about another attempt
            // on the same order, so the safe reconciliation still runs: it can only ever apply
            // a capture that PayPal itself reports as settled.
            await convergeCapture(pool, paypal, merchantId, order, null).catch(() => undefined);
            await audit(pool, order.event_id, 'payment_capture_declined');
            return done();
          }
          case 'PAYMENT.CAPTURE.REFUNDED': {
            if (!resourceId) return done('reembolso sin identificador');
            const outcome = await convergeRefund(pool, paypal, resourceId);
            if (outcome.applied || outcome.duplicate) return done();
            if (outcome.transient) return retry(outcome.reason ?? 'reembolso aun no aplicable');
            if (outcome.eventId) await audit(pool, outcome.eventId, 'payment_webhook_rejected');
            return done(outcome.reason);
          }
          case 'PAYMENT.CAPTURE.REVERSED': {
            // A reversal resource is not a refund: reading it through getRefund would fetch the
            // wrong object or nothing at all. We do not guess an amount from it; it is recorded
            // for human reconciliation.
            const order = relatedOrderId ? await findOrderByAnyId(pool, relatedOrderId) : null;
            if (order) await audit(pool, order.event_id, 'payment_reversal_manual');
            return done('reverso registrado para conciliacion manual');
          }
          default:
            return done('tipo no manejado');
        }
      };

      const outcome = await handle();
      if (outcome.kind === 'retry') {
        req.log.warn({ eventType, webhookId, reason: outcome.reason }, 'webhook aun no aplicable: se pide reintento');
        // Deliberately not recorded in webhook_events, so PayPal redelivers it.
        return reply
          .code(503)
          .header('retry-after', '60')
          .send({ error: 'Notificacion aun no aplicable; reintenta' });
      }
      if (outcome.note) req.log.warn({ eventType, webhookId, note: outcome.note }, 'webhook no aplicado');

      // Recorded only after processing, so a failure leaves the notification retryable.
      await pool.query('INSERT INTO webhook_events (id, event_type) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [
        webhookId,
        eventType,
      ]);
      return { ok: true };
    },
  );
}
