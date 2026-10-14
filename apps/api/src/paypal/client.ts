import type { PayPalConfig } from '../config.js';
import { centsToUsd } from '../lib/money.js';
import {
  PayPalError,
  type CreateOrderInput,
  type CreatedOrder,
  type PayPalAdapter,
  type PayPalOrder,
  type PayPalRefund,
  type WebhookSignatureInput,
} from './types.js';
import { approveUrlOf } from './verify.js';

interface TokenCache {
  token: string;
  expiresAtMs: number;
}

interface RequestOptions {
  method: 'GET' | 'POST';
  path: string;
  body?: string;
  headers?: Record<string, string>;
  /** GETs are safe to retry once; POSTs are only retried when they carry a stable request id. */
  retries?: number;
}

const PAYPAL_CERT_HOST = /(^|\.)paypal\.com$/;

/**
 * Minimal PayPal REST client for the sandbox: OAuth2 client credentials, Orders v2 create/get/
 * capture, refund lookup and webhook signature verification. Every call is time-boxed and
 * mutations carry a caller-provided stable PayPal-Request-Id so a timeout can be resumed
 * without creating or capturing twice.
 */
export class PayPalSandboxClient implements PayPalAdapter {
  private readonly config: PayPalConfig;
  private tokenCache: TokenCache | null = null;
  private tokenInFlight: Promise<string> | null = null;

  constructor(config: PayPalConfig) {
    this.config = config;
  }

  private async request<T>(opts: RequestOptions, authHeader: string): Promise<T> {
    const url = `${this.config.baseUrl}${opts.path}`;
    const attempts = (opts.retries ?? 0) + 1;
    let lastError: PayPalError | null = null;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(url, {
          method: opts.method,
          headers: {
            authorization: authHeader,
            accept: 'application/json',
            ...(opts.body === undefined ? {} : { 'content-type': 'application/json' }),
            ...opts.headers,
          },
          body: opts.body,
          signal: AbortSignal.timeout(this.config.timeoutMs),
        });
      } catch (err) {
        const aborted = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
        lastError = new PayPalError(
          aborted ? `Tiempo de espera agotado en PayPal (${opts.path})` : `Fallo de red hacia PayPal (${opts.path})`,
          { timeout: true },
        );
        continue;
      }

      const text = await response.text();
      const debugId = response.headers.get('paypal-debug-id');
      if (!response.ok) {
        lastError = new PayPalError(`PayPal respondio ${response.status} en ${opts.path}`, {
          status: response.status,
          debugId,
          timeout: false,
        });
        // 5xx may be transient; 4xx will not change on retry.
        if (response.status < 500) throw lastError;
        continue;
      }

      if (text.length === 0) return {} as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new PayPalError(`Respuesta no JSON de PayPal en ${opts.path}`, { status: response.status, debugId });
      }
    }

    throw lastError ?? new PayPalError(`Fallo desconocido de PayPal en ${opts.path}`);
  }

  private async accessToken(): Promise<string> {
    const now = Date.now();
    if (this.tokenCache && this.tokenCache.expiresAtMs > now) return this.tokenCache.token;
    if (this.tokenInFlight) return this.tokenInFlight;

    const basic = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`, 'utf8').toString('base64');
    this.tokenInFlight = (async () => {
      const data = await this.request<{ access_token?: string; expires_in?: number }>(
        {
          method: 'POST',
          path: '/v1/oauth2/token',
          body: 'grant_type=client_credentials',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          retries: 1,
        },
        `Basic ${basic}`,
      );
      if (!data.access_token) throw new PayPalError('PayPal no devolvio access_token');
      const ttlSeconds = typeof data.expires_in === 'number' && data.expires_in > 60 ? data.expires_in : 300;
      this.tokenCache = { token: data.access_token, expiresAtMs: Date.now() + (ttlSeconds - 60) * 1000 };
      return data.access_token;
    })();

    try {
      return await this.tokenInFlight;
    } finally {
      this.tokenInFlight = null;
    }
  }

  private async authed<T>(opts: RequestOptions): Promise<T> {
    const token = await this.accessToken();
    try {
      return await this.request<T>(opts, `Bearer ${token}`);
    } catch (err) {
      // An expired/revoked token looks like a 401; drop the cache and try once more.
      if (err instanceof PayPalError && err.status === 401) {
        this.tokenCache = null;
        const fresh = await this.accessToken();
        return this.request<T>(opts, `Bearer ${fresh}`);
      }
      throw err;
    }
  }

  async createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
    const body = JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: input.referenceId,
          custom_id: input.customId,
          invoice_id: input.invoiceId,
          description: input.description.slice(0, 127),
          amount: { currency_code: input.currency, value: centsToUsd(input.amountCents) },
          // The receiver is fixed server-side; the browser can never choose it.
          payee: { merchant_id: this.config.merchantId },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: this.config.brandName.slice(0, 127),
            shipping_preference: 'NO_SHIPPING',
            user_action: 'PAY_NOW',
            ...(input.returnUrl ? { return_url: input.returnUrl } : {}),
            ...(input.cancelUrl ? { cancel_url: input.cancelUrl } : {}),
          },
        },
      },
    });

    const order = await this.authed<PayPalOrder>({
      method: 'POST',
      path: '/v2/checkout/orders',
      body,
      headers: { 'paypal-request-id': input.requestId, prefer: 'return=representation' },
    });
    if (typeof order.id !== 'string') throw new PayPalError('PayPal no devolvio id de orden');
    return { id: order.id, status: order.status ?? 'CREATED', approveUrl: approveUrlOf(order), raw: order };
  }

  async getOrder(paypalOrderId: string): Promise<PayPalOrder> {
    return this.authed<PayPalOrder>({
      method: 'GET',
      path: `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`,
      retries: 1,
    });
  }

  async captureOrder(input: { paypalOrderId: string; requestId: string }): Promise<PayPalOrder> {
    return this.authed<PayPalOrder>({
      method: 'POST',
      path: `/v2/checkout/orders/${encodeURIComponent(input.paypalOrderId)}/capture`,
      body: '{}',
      headers: { 'paypal-request-id': input.requestId, prefer: 'return=representation' },
    });
  }

  async getRefund(refundId: string): Promise<PayPalRefund> {
    return this.authed<PayPalRefund>({
      method: 'GET',
      path: `/v2/payments/refunds/${encodeURIComponent(refundId)}`,
      retries: 1,
    });
  }

  async verifyWebhookSignature(input: WebhookSignatureInput): Promise<boolean> {
    const webhookId = this.config.webhookId;
    if (!webhookId) throw new PayPalError('PAYPAL_WEBHOOK_ID no configurado');
    if (!input.authAlgo || !input.certUrl || !input.transmissionId || !input.transmissionSig || !input.transmissionTime) {
      return false;
    }
    let certHost: string;
    try {
      const certUrl = new URL(input.certUrl);
      certHost = certUrl.host;
      if (certUrl.protocol !== 'https:' || !PAYPAL_CERT_HOST.test(certHost)) return false;
    } catch {
      return false;
    }

    // The signed payload is the exact body we received, so it is spliced in verbatim rather
    // than re-serialized from the parsed object.
    const body =
      '{' +
      `"auth_algo":${JSON.stringify(input.authAlgo)},` +
      `"cert_url":${JSON.stringify(input.certUrl)},` +
      `"transmission_id":${JSON.stringify(input.transmissionId)},` +
      `"transmission_sig":${JSON.stringify(input.transmissionSig)},` +
      `"transmission_time":${JSON.stringify(input.transmissionTime)},` +
      `"webhook_id":${JSON.stringify(webhookId)},` +
      `"webhook_event":${input.rawBody}` +
      '}';

    const result = await this.authed<{ verification_status?: string }>({
      method: 'POST',
      path: '/v1/notifications/verify-webhook-signature',
      body,
    });
    return result.verification_status === 'SUCCESS';
  }
}
