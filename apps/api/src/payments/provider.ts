/**
 * Capa intercambiable de cobro en línea por sitio (Somos Panas SP-8).
 * Depende de `PayPalAdapter` solo en el legado; `NoneProvider` no abre red.
 */
import type { Capabilities } from '@fiestapay/shared';
import { type PaymentProviderId, isPaymentProviderId, siteAllowsPayPalCheckout } from '@fiestapay/shared';
import type { Config } from '../config.js';
import { notFound, unavailable } from '../errors.js';
import type { Pool, PoolClient } from '../db/pool.js';
import type { HostClassification } from '../lib/host.js';

type TenantLookup = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;
import type {
  CreateOrderInput,
  CreatedOrder,
  PayPalAdapter,
  PayPalOrder,
  PayPalRefund,
  RefundCaptureInput,
  WebhookSignatureInput,
} from '../paypal/types.js';

/** Mensaje 503 honesto para sitios `none` (D2); traducido en `packages/shared/src/server-errors.ts`. */
export const NONE_UNAVAILABLE =
  'El cobro en linea no esta disponible en este sitio; el organizador coordina el pago por fuera de la app';

/** Superficie que el dominio de órdenes y capturas llama, independiente del procesador. */
export interface PaymentProvider {
  readonly id: PaymentProviderId;
  /** True solo cuando este sitio puede crear órdenes y capturas verificadas. */
  readonly chargesOnline: boolean;
  createOrder(input: CreateOrderInput): Promise<CreatedOrder>;
  getOrder(paypalOrderId: string): Promise<PayPalOrder>;
  captureOrder(input: { paypalOrderId: string; requestId: string }): Promise<PayPalOrder>;
  refundCapture(input: RefundCaptureInput): Promise<PayPalRefund>;
  getRefund(refundId: string): Promise<PayPalRefund>;
  verifyWebhookSignature(input: WebhookSignatureInput): Promise<boolean>;
}

/**
 * Envuelve el adaptador PayPal sandbox actual para el sitio legado.
 * Entrada: adaptador inyectado (producción o falso de pruebas).
 * Salida: proveedor con `chargesOnline` true.
 */
export class PayPalSandboxProvider implements PaymentProvider {
  readonly id = 'paypal_sandbox' as const;
  readonly chargesOnline = true;

  constructor(readonly adapter: PayPalAdapter) {}

  createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
    return this.adapter.createOrder(input);
  }

  getOrder(paypalOrderId: string): Promise<PayPalOrder> {
    return this.adapter.getOrder(paypalOrderId);
  }

  captureOrder(input: { paypalOrderId: string; requestId: string }): Promise<PayPalOrder> {
    return this.adapter.captureOrder(input);
  }

  refundCapture(input: RefundCaptureInput): Promise<PayPalRefund> {
    return this.adapter.refundCapture(input);
  }

  getRefund(refundId: string): Promise<PayPalRefund> {
    return this.adapter.getRefund(refundId);
  }

  verifyWebhookSignature(input: WebhookSignatureInput): Promise<boolean> {
    return this.adapter.verifyWebhookSignature(input);
  }
}

/**
 * Sitio sin procesador: rechaza cobros sin cliente HTTP (D2).
 * Las rutas deben cortar antes de insertar en `orders`; este objeto es defensa en profundidad.
 */
export class NoneProvider implements PaymentProvider {
  readonly id = 'none' as const;
  readonly chargesOnline = false;

  private refuse(): never {
    throw unavailable(NONE_UNAVAILABLE);
  }

  createOrder(): Promise<CreatedOrder> {
    return this.refuse();
  }

  getOrder(): Promise<PayPalOrder> {
    return this.refuse();
  }

  captureOrder(): Promise<PayPalOrder> {
    return this.refuse();
  }

  refundCapture(): Promise<PayPalRefund> {
    return this.refuse();
  }

  getRefund(): Promise<PayPalRefund> {
    return this.refuse();
  }

  verifyWebhookSignature(): Promise<boolean> {
    return this.refuse();
  }
}

const sharedNone = new NoneProvider();

/**
 * Construye el proveedor activo para un id de sitio.
 * Entrada: id cerrado y adaptador PayPal (null si no hay config).
 * Salida: sandbox envuelto o singleton `none`.
 */
export function buildPaymentProvider(id: PaymentProviderId, paypal: PayPalAdapter | null): PaymentProvider {
  if (id === 'paypal_sandbox') {
    if (!paypal) throw unavailable('PayPal no esta configurado en este servidor');
    return new PayPalSandboxProvider(paypal);
  }
  return sharedNone;
}

/**
 * Lee `payment_provider` de una fila `tenants`.
 * Entrada: acceso a base y uuid del tenant.
 * Salida: `none` o `paypal_sandbox`.
 */
export async function paymentProviderIdForTenant(db: TenantLookup, tenantId: string): Promise<PaymentProviderId> {
  const { rows } = await db.query<{ payment_provider: string }>(
    `SELECT payment_provider FROM tenants WHERE id = $1 LIMIT 1`,
    [tenantId],
  );
  const raw = rows[0]?.payment_provider;
  if (!rows[0]) throw notFound('Sitio no encontrado');
  if (!isPaymentProviderId(raw)) {
    throw unavailable('PayPal no esta configurado en este servidor');
  }
  return raw;
}

/**
 * Lee el procesador del tenant dueño de un evento por id interno.
 * Entrada: acceso a base y uuid de `events.id`.
 * Salida: `none` o `paypal_sandbox`.
 */
export async function paymentProviderIdForEventId(db: TenantLookup, eventId: string): Promise<PaymentProviderId> {
  const { rows } = await db.query<{ payment_provider: string }>(
    `SELECT t.payment_provider
       FROM events e
       JOIN tenants t ON t.id = e.tenant_id
      WHERE e.id = $1
      LIMIT 1`,
    [eventId],
  );
  const raw = rows[0]?.payment_provider;
  if (!rows[0]) throw notFound('Evento no encontrado');
  if (!isPaymentProviderId(raw)) {
    throw unavailable('PayPal no esta configurado en este servidor');
  }
  return raw;
}

/**
 * Lee el procesador del tenant dueño de un evento por slug de invitación.
 * Entrada: acceso a base y `events.slug` global.
 * Salida: `none` o `paypal_sandbox`.
 */
export async function paymentProviderIdForEventSlug(db: TenantLookup, slug: string): Promise<PaymentProviderId> {
  const { rows } = await db.query<{ payment_provider: string }>(
    `SELECT t.payment_provider
       FROM events e
       JOIN tenants t ON t.id = e.tenant_id
      WHERE e.slug = $1
      LIMIT 1`,
    [slug],
  );
  const raw = rows[0]?.payment_provider;
  if (!rows[0]) throw notFound('Evento no encontrado');
  if (!isPaymentProviderId(raw)) {
    throw unavailable('PayPal no esta configurado en este servidor');
  }
  return raw;
}

/**
 * Capacidades del navegador según host y configuración real (no anuncia PayPal en sitios `none`).
 */
export function capabilitiesForHost(
  classification: HostClassification,
  config: Config,
  emailConfigured: boolean,
): Capabilities {
  const paymentProvider: PaymentProviderId = classification.kind === 'legacy' ? 'paypal_sandbox' : 'none';
  const paypalConfigured = config.paypal !== null;
  return {
    paypal: siteAllowsPayPalCheckout(paymentProvider, paypalConfigured),
    paymentProvider,
    voice: config.voice.enabled,
    paypalClientId: paymentProvider === 'paypal_sandbox' ? config.paypal?.clientId ?? null : null,
    sandbox: true,
    chat: config.textProvider === 'gemini' ? config.gemini !== null : config.openai !== null,
    llmProvider: config.textProvider === 'gemini' ? 'gemini' : 'openai',
    voiceProvider: config.voice.provider,
    email: emailConfigured,
  };
}

/** Deps de dominio para rutas de cobro: proveedor más receptor y origen público. */
export interface OnlinePaymentDeps {
  provider: PaymentProvider;
  merchantId: string;
  origin?: string;
}

/**
 * Exige proveedor que cobre en línea y PayPal configurado en el servidor.
 * Entrada: config, adaptador inyectado e id del tenant del evento.
 * Salida: deps listos para órdenes/capturas o 503 honesto.
 */
export function requireOnlinePayment(
  config: Config,
  paypal: PayPalAdapter | null,
  tenantProviderId: PaymentProviderId,
): OnlinePaymentDeps {
  if (tenantProviderId === 'none') {
    throw unavailable(NONE_UNAVAILABLE);
  }
  const provider = buildPaymentProvider(tenantProviderId, paypal);
  if (!config.paypal) {
    throw unavailable(config.paypalDisabledReason ?? 'PayPal no esta configurado en este servidor');
  }
  const origin = config.publicOrigin ?? config.allowedOrigins[0];
  return {
    provider,
    merchantId: config.paypal.merchantId,
    ...(origin ? { origin } : {}),
  };
}

/** Expone el adaptador subyacente solo cuando el proveedor es sandbox (p. ej. convergeCapture). */
export function paypalAdapterOf(provider: PaymentProvider): PayPalAdapter {
  if (provider instanceof PayPalSandboxProvider) return provider.adapter;
  throw unavailable(NONE_UNAVAILABLE);
}