export interface PayPalAmount {
  currency_code?: string;
  value?: string;
}

export interface PayPalPayee {
  merchant_id?: string;
  email_address?: string;
}

export interface PayPalCapture {
  id?: string;
  status?: string;
  amount?: PayPalAmount;
  custom_id?: string;
  invoice_id?: string;
}

export interface PayPalLink {
  href?: string;
  rel?: string;
  method?: string;
}

export interface PayPalPurchaseUnit {
  reference_id?: string;
  custom_id?: string;
  invoice_id?: string;
  amount?: PayPalAmount;
  payee?: PayPalPayee;
  payments?: { captures?: PayPalCapture[]; refunds?: PayPalRefund[] };
}

export interface PayPalOrder {
  id?: string;
  status?: string;
  purchase_units?: PayPalPurchaseUnit[];
  links?: PayPalLink[];
}

export interface PayPalRefund {
  id?: string;
  status?: string;
  amount?: PayPalAmount;
  custom_id?: string;
  invoice_id?: string;
  links?: PayPalLink[];
  seller_payable_breakdown?: { total_refunded_amount?: PayPalAmount };
}

export interface CreateOrderInput {
  /** Stable PayPal-Request-Id; retries after a timeout must reuse it. */
  requestId: string;
  amountCents: number;
  currency: 'USD';
  referenceId: string;
  customId: string;
  invoiceId: string;
  description: string;
  returnUrl?: string;
  cancelUrl?: string;
}

export interface CreatedOrder {
  id: string;
  status: string;
  approveUrl?: string;
  raw: PayPalOrder;
}

export interface WebhookSignatureInput {
  authAlgo: string | undefined;
  certUrl: string | undefined;
  transmissionId: string | undefined;
  transmissionSig: string | undefined;
  transmissionTime: string | undefined;
  /** Exact bytes received, so verification happens over what PayPal signed. */
  rawBody: string;
}

/** The surface the domain uses. Tests inject a fake; production injects the sandbox client. */
export interface RefundCaptureInput {
  captureId: string;
  /** Stable PayPal-Request-Id. A timeout retries this same value. */
  requestId: string;
  /** Exact JSON body persisted before the call. `{}` refunds the capture in full. */
  body: string;
}

export interface PayPalAdapter {
  createOrder(input: CreateOrderInput): Promise<CreatedOrder>;
  getOrder(paypalOrderId: string): Promise<PayPalOrder>;
  captureOrder(input: { paypalOrderId: string; requestId: string }): Promise<PayPalOrder>;
  /**
   * POST /v2/payments/captures/{id}/refund. Empty object refunds the full capture.
   * An amount object is a partial refund. The same request id and body are safe to repeat.
   */
  refundCapture(input: RefundCaptureInput): Promise<PayPalRefund>;
  getRefund(refundId: string): Promise<PayPalRefund>;
  verifyWebhookSignature(input: WebhookSignatureInput): Promise<boolean>;
}

export class PayPalError extends Error {
  readonly status: number | null;
  readonly timeout: boolean;
  readonly debugId: string | null;
  constructor(message: string, opts: { status?: number | null; timeout?: boolean; debugId?: string | null } = {}) {
    super(message);
    this.name = 'PayPalError';
    this.status = opts.status ?? null;
    this.timeout = opts.timeout ?? false;
    this.debugId = opts.debugId ?? null;
  }
}
