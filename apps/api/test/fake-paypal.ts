import { centsToUsd, usdToCents } from '../src/lib/money.js';
import {
  PayPalError,
  type CreateOrderInput,
  type CreatedOrder,
  type PayPalAdapter,
  type PayPalOrder,
  type PayPalRefund,
  type RefundCaptureInput,
  type WebhookSignatureInput,
} from '../src/paypal/types.js';

/**
 * Test-only PayPal adapter. It lives under test/ so no production module can import it, and it
 * is injected explicitly through buildApp({ paypal }) — never selectable from a request.
 */
export interface FakeOrderState {
  id: string;
  requestId: string;
  amountCents: number;
  customId: string;
  invoiceId: string;
  merchantId: string;
  captured: boolean;
  captureId: string | null;
}

export interface FakeTamper {
  amountCents?: number;
  merchantId?: string;
  customId?: string;
  captureStatus?: string;
}

/**
 * A one-shot barrier that holds a simulated PayPal call open, so a test can observe exactly
 * what the rest of the system does *while* the network call is in flight. Races are driven by
 * these instead of timers: no sleeps, nothing to tune, and the same interleaving every run.
 */
export class Gate {
  /** Resolves when a call has reached the barrier and is waiting there. */
  readonly arrived: Promise<void>;
  private announceArrival!: () => void;
  private readonly passage: Promise<void>;
  private release!: () => void;

  constructor() {
    this.arrived = new Promise<void>((resolve) => {
      this.announceArrival = resolve;
    });
    this.passage = new Promise<void>((resolve) => {
      this.release = resolve;
    });
  }

  /** Called from inside the fake: announce arrival, then block until the test opens the gate. */
  async hold(): Promise<void> {
    this.announceArrival();
    await this.passage;
  }

  open(): void {
    this.release();
  }
}

/** Per-call create failures, so one of two racing calls can be rejected like PayPal would. */
export type CreateFailure = 'timeout' | 'reject' | 'duplicate-429' | 'duplicate-422';

export class FakePayPal implements PayPalAdapter {
  readonly merchantId: string;
  readonly orders = new Map<string, FakeOrderState>();
  readonly refunds = new Map<string, PayPalRefund>();
  createCalls: { requestId: string; amountCents: number; returnUrl?: string; cancelUrl?: string }[] = [];
  captureCalls: { paypalOrderId: string; requestId: string }[] = [];
  /** Every refund lookup, so a test can prove a reversal was never read as a refund. */
  refundCalls: string[] = [];
  refundCaptureCalls: { captureId: string; requestId: string; body: string }[] = [];
  /** Same PayPal-Request-Id and body replay the stored refund. A different body is a 422. */
  private readonly refundByRequest = new Map<string, { captureId: string; body: string; refund: PayPalRefund | null }>();
  signatureValid = true;
  /** 'timeout' fails the call after PayPal already created the order, as a real timeout can. */
  failCreate: 'timeout' | 'reject' | null = null;
  failCapture: 'timeout' | 'reject' | 'captured-then-timeout' | null = null;
  /** Consumed one per createOrder call, in arrival order. Takes precedence over failCreate. */
  createFailures: CreateFailure[] = [];
  /** One-shot barriers: the next create / capture / refund call waits there until the test opens it. */
  createGate: Gate | null = null;
  captureGate: Gate | null = null;
  refundGate: Gate | null = null;
  /** First matching call stores the refund, then throws, so the retry must reuse the request id. */
  loseNextRefundResponse = false;
  /** Next refundCapture that is not an idempotent replay. */
  failRefund: 'timeout' | '422' | 'missing-id' | null = null;
  /** Status applied to a newly stored refund. Tests flip the stored object to COMPLETED later. */
  nextRefundStatus: 'COMPLETED' | 'PENDING' | 'FAILED' = 'COMPLETED';
  tamper: FakeTamper = {};
  private sequence = 0;

  constructor(merchantId = 'MERCHANT-TEST') {
    this.merchantId = merchantId;
  }

  private next(prefix: string): string {
    this.sequence += 1;
    return `${prefix}-${this.sequence}`;
  }

  /** Takes the pending barrier (if any) and clears it, so it only ever holds one call. */
  private async takeGate(which: 'createGate' | 'captureGate' | 'refundGate'): Promise<void> {
    const gate = this[which];
    if (!gate) return;
    this[which] = null;
    await gate.hold();
  }

  /** Installs a barrier for the next create call and returns it. */
  gateCreate(): Gate {
    const gate = new Gate();
    this.createGate = gate;
    return gate;
  }

  /** Installs a barrier for the next capture call and returns it. */
  gateCapture(): Gate {
    const gate = new Gate();
    this.captureGate = gate;
    return gate;
  }

  /** Installs a barrier for the next refundCapture call and returns it. */
  gateRefund(): Gate {
    const gate = new Gate();
    this.refundGate = gate;
    return gate;
  }

  /** Marks a provider capture complete without going through captureOrder. */
  forceCaptured(paypalOrderId: string, captureId?: string): string {
    const state = this.orders.get(paypalOrderId);
    if (!state) throw new Error(`orden desconocida ${paypalOrderId}`);
    state.captured = true;
    state.captureId = captureId ?? state.captureId ?? this.next('CAP');
    return state.captureId;
  }

  private representation(state: FakeOrderState): PayPalOrder {
    const amountCents = this.tamper.amountCents ?? state.amountCents;
    const merchantId = this.tamper.merchantId ?? state.merchantId;
    const customId = this.tamper.customId ?? state.customId;
    return {
      id: state.id,
      status: state.captured ? 'COMPLETED' : 'CREATED',
      purchase_units: [
        {
          reference_id: state.customId,
          custom_id: customId,
          invoice_id: state.invoiceId,
          amount: { currency_code: 'USD', value: centsToUsd(state.amountCents) },
          payee: { merchant_id: merchantId },
          ...(state.captured && state.captureId
            ? {
                payments: {
                  captures: [
                    {
                      id: state.captureId,
                      status: this.tamper.captureStatus ?? 'COMPLETED',
                      amount: { currency_code: 'USD', value: centsToUsd(amountCents) },
                      custom_id: customId,
                    },
                  ],
                },
              }
            : {}),
        },
      ],
      links: [{ rel: 'payer-action', href: `https://www.sandbox.paypal.com/checkoutnow?token=${state.id}`, method: 'GET' }],
    };
  }

  async createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
    this.createCalls.push({
      requestId: input.requestId,
      amountCents: input.amountCents,
      ...(input.returnUrl ? { returnUrl: input.returnUrl } : {}),
      ...(input.cancelUrl ? { cancelUrl: input.cancelUrl } : {}),
    });

    // PayPal-Request-Id idempotency: the same request id returns the same order.
    let state = [...this.orders.values()].find((o) => o.requestId === input.requestId);
    if (!state) {
      state = {
        id: this.next('ORD'),
        requestId: input.requestId,
        amountCents: input.amountCents,
        customId: input.customId,
        invoiceId: input.invoiceId,
        merchantId: this.merchantId,
        captured: false,
        captureId: null,
      };
      this.orders.set(state.id, state);
    }

    // The order now exists at PayPal. Holding here reproduces the real window: our row is still
    // `intent` while something else (an RSVP change, a demo reset) can move underneath it.
    await this.takeGate('createGate');

    const forced = this.createFailures.shift() ?? this.failCreate;
    if (forced === 'timeout') {
      throw new PayPalError('timeout simulado al crear', { timeout: true });
    }
    if (forced === 'reject') {
      throw new PayPalError('rechazo simulado al crear', { status: 400 });
    }
    if (forced === 'duplicate-429') {
      throw new PayPalError('RATE_LIMIT_REACHED simulado', { status: 429 });
    }
    if (forced === 'duplicate-422') {
      // What PayPal answers a second call that reuses a request/invoice id already in use.
      throw new PayPalError('DUPLICATE_INVOICE_ID simulado', { status: 422 });
    }

    const raw = this.representation(state);
    return { id: state.id, status: raw.status ?? 'CREATED', approveUrl: raw.links?.[0]?.href, raw };
  }

  async getOrder(paypalOrderId: string): Promise<PayPalOrder> {
    const state = this.orders.get(paypalOrderId);
    if (!state) throw new PayPalError('orden inexistente', { status: 404 });
    return this.representation(state);
  }

  async captureOrder(input: { paypalOrderId: string; requestId: string }): Promise<PayPalOrder> {
    this.captureCalls.push(input);
    const state = this.orders.get(input.paypalOrderId);
    if (!state) throw new PayPalError('orden inexistente', { status: 404 });

    // Held before anything is captured, so a test can act while the capture is in flight and
    // our side has already claimed the order.
    await this.takeGate('captureGate');

    if (this.failCapture === 'reject') throw new PayPalError('rechazo simulado al capturar', { status: 422 });
    if (state.captured) {
      // Mirrors ORDER_ALREADY_CAPTURED from the real API.
      throw new PayPalError('ORDER_ALREADY_CAPTURED', { status: 422 });
    }

    if (this.failCapture === 'timeout') throw new PayPalError('timeout simulado al capturar', { timeout: true });

    state.captured = true;
    state.captureId = this.next('CAP');

    if (this.failCapture === 'captured-then-timeout') {
      throw new PayPalError('timeout simulado despues de capturar', { timeout: true });
    }
    return this.representation(state);
  }

  async refundCapture(input: RefundCaptureInput): Promise<PayPalRefund> {
    this.refundCaptureCalls.push({ captureId: input.captureId, requestId: input.requestId, body: input.body });
    const prior = this.refundByRequest.get(input.requestId);
    if (prior) {
      if (prior.captureId !== input.captureId || prior.body !== input.body) {
        throw new PayPalError('PayPal-Request-Id reutilizado con otro cuerpo', { status: 422 });
      }
      if (!prior.refund?.id) throw new PayPalError('UNPROCESSABLE_ENTITY simulado', { status: 422 });
      return prior.refund;
    }

    await this.takeGate('refundGate');

    const state = [...this.orders.values()].find((order) => order.captureId === input.captureId);
    if (!state || !state.captureId) throw new PayPalError('captura inexistente', { status: 404 });
    if (this.failRefund === '422') {
      this.refundByRequest.set(input.requestId, { captureId: input.captureId, body: input.body, refund: null });
      throw new PayPalError('UNPROCESSABLE_ENTITY simulado', { status: 422 });
    }
    if (this.failRefund === 'timeout') throw new PayPalError('timeout simulado al reembolsar', { timeout: true });

    const parsed = input.body === '{}' ? state.amountCents : usdToCents(JSON.parse(input.body).amount?.value);
    if (parsed === null || parsed < 1) throw new PayPalError('importe de reembolso invalido', { status: 422 });
    const refund = this.addRefund(input.captureId, parsed, this.nextRefundStatus);
    this.refundByRequest.set(input.requestId, { captureId: input.captureId, body: input.body, refund });
    if (this.loseNextRefundResponse) {
      this.loseNextRefundResponse = false;
      throw new PayPalError('timeout despues de completar el reembolso', { timeout: true });
    }
    if (this.failRefund === 'missing-id') {
      const { id: _id, ...rest } = refund;
      return rest;
    }
    return refund;
  }

  async getRefund(refundId: string): Promise<PayPalRefund> {
    this.refundCalls.push(refundId);
    const refund = this.refunds.get(refundId);
    if (!refund) throw new PayPalError('reembolso inexistente', { status: 404 });
    return refund;
  }

  async verifyWebhookSignature(_input: WebhookSignatureInput): Promise<boolean> {
    return this.signatureValid;
  }

  /** Registers a refund as PayPal would expose it, linked to its capture. */
  addRefund(captureId: string, amountCents: number, status = 'COMPLETED'): PayPalRefund {
    const refund: PayPalRefund = {
      id: this.next('REF'),
      status,
      amount: { currency_code: 'USD', value: centsToUsd(amountCents) },
      links: [
        { rel: 'self', href: `https://api-m.sandbox.paypal.com/v2/payments/refunds/REF`, method: 'GET' },
        { rel: 'up', href: `https://api-m.sandbox.paypal.com/v2/payments/captures/${captureId}`, method: 'GET' },
      ],
    };
    this.refunds.set(refund.id!, refund);
    return refund;
  }

  captureIdOf(paypalOrderId: string): string {
    const captureId = this.orders.get(paypalOrderId)?.captureId;
    if (!captureId) throw new Error(`la orden ${paypalOrderId} no tiene captura`);
    return captureId;
  }
}
