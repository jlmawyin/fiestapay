import { usdToCents } from '../lib/money.js';
import type { PayPalCapture, PayPalOrder, PayPalRefund } from './types.js';

export interface CaptureExpectation {
  paypalOrderId: string;
  amountCents: number;
  currency: 'USD';
  merchantId: string;
  customId: string;
}

/**
 * A rejection is `transient` when it may still resolve by itself, because PayPal has not
 * published the capture (or the refund) yet. Those must be retried, never swallowed. Every
 * other rejection is a permanent mismatch — receiver, amount, currency, wrong order — and is
 * surfaced for human reconciliation instead of being retried forever.
 */
export interface VerifyFailure {
  ok: false;
  reason: string;
  transient: boolean;
}

export type VerifyResult<T> = ({ ok: true } & T) | VerifyFailure;

const permanent = (reason: string): VerifyFailure => ({ ok: false, reason, transient: false });
const pending = (reason: string): VerifyFailure => ({ ok: false, reason, transient: true });

/**
 * A capture that has since been refunded still proves the original money moved, and the refund
 * is recorded as its own ledger entry. Accepting only COMPLETED would silently drop a late
 * capture notification whenever the refund reached PayPal first, leaving the ledger short by
 * the entire capture while the refund subtracted nothing.
 */
const CAPTURED_STATUSES = new Set(['COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED']);

/**
 * Decides whether a PayPal order really represents money captured for our merchant, for this
 * order, amount and currency. Nothing marks a guest as paid without passing through here. The
 * amount compared is the capture's own original amount, never a value net of refunds.
 */
export function verifyCapturedOrder(
  order: PayPalOrder | null | undefined,
  expect: CaptureExpectation,
): VerifyResult<{ captureId: string; amountCents: number }> {
  // No readable order: a response we cannot parse may simply be a transport hiccup, so retry.
  if (!order || typeof order.id !== 'string') return pending('Respuesta de PayPal sin orden');
  if (order.id !== expect.paypalOrderId) return permanent('La orden de PayPal no coincide');

  const units = Array.isArray(order.purchase_units) ? order.purchase_units : [];
  if (units.length !== 1) return permanent('La orden no tiene exactamente una unidad de compra');
  const unit = units[0]!;

  const payeeId = unit.payee?.merchant_id;
  if (!payeeId) return permanent('La orden no identifica al receptor');
  if (payeeId !== expect.merchantId) return permanent('El receptor de la orden no es el comercio configurado');

  if (typeof unit.custom_id === 'string' && unit.custom_id !== expect.customId) {
    return permanent('La orden no corresponde a esta obligacion');
  }

  const captures = Array.isArray(unit.payments?.captures) ? unit.payments!.captures! : [];
  const settled = captures.filter((c) => CAPTURED_STATUSES.has(c.status ?? '') && typeof c.id === 'string');
  // An order still waiting for its payer has no capture at all: that is transient, not a fault.
  if (settled.length === 0) return pending('La orden todavia no tiene una captura verificable');
  if (settled.length > 1) return permanent('La orden tiene varias capturas; requiere conciliacion manual');
  const capture = settled[0] as PayPalCapture & { id: string };

  if (typeof capture.custom_id === 'string' && capture.custom_id !== expect.customId) {
    return permanent('La captura no corresponde a esta obligacion');
  }
  if (capture.amount?.currency_code !== expect.currency) return permanent('Moneda de la captura incorrecta');
  const amountCents = usdToCents(capture.amount?.value);
  if (amountCents === null) return permanent('Importe de la captura invalido');
  if (amountCents !== expect.amountCents) return permanent('El importe capturado no coincide con la orden');

  return { ok: true, captureId: capture.id, amountCents };
}

const CAPTURE_HREF = /\/payments\/captures\/([A-Za-z0-9_-]+)\/?$/;

/** PayPal links a refund back to its capture with a rel=up link. */
export function captureIdFromRefund(refund: PayPalRefund | null | undefined): string | null {
  const links = Array.isArray(refund?.links) ? refund!.links! : [];
  for (const link of links) {
    if (link.rel !== 'up' || typeof link.href !== 'string') continue;
    const match = CAPTURE_HREF.exec(link.href);
    if (match) return match[1]!;
  }
  return null;
}

export interface RefundExpectation {
  currency: 'USD';
  /** Captures already recorded in our ledger for the order being refunded. */
  knownCaptureIds: string[];
  /** Net amount still refundable for that capture. */
  maxRefundableCents: number;
}

export function verifyRefund(
  refund: PayPalRefund | null | undefined,
  expect: RefundExpectation,
): VerifyResult<{ refundId: string; captureId: string; amountCents: number }> {
  if (!refund || typeof refund.id !== 'string') return permanent('Reembolso sin identificador');
  // A refund PayPal still reports as PENDING may complete later: keep the notification alive.
  if (refund.status !== 'COMPLETED') return pending('El reembolso aun no esta COMPLETED');
  if (refund.amount?.currency_code !== expect.currency) return permanent('Moneda del reembolso incorrecta');
  const amountCents = usdToCents(refund.amount?.value);
  if (amountCents === null || amountCents < 1) return permanent('Importe del reembolso invalido');

  const captureId = captureIdFromRefund(refund);
  if (!captureId) return permanent('El reembolso no referencia una captura');
  // The capture may just not be recorded here yet (refund notification arrived first).
  if (!expect.knownCaptureIds.includes(captureId)) {
    return pending('El reembolso no coincide con una captura registrada');
  }
  if (amountCents > expect.maxRefundableCents) return permanent('El reembolso supera lo capturado');

  return { ok: true, refundId: refund.id, captureId, amountCents };
}

const PAYPAL_HOST = /(^|\.)paypal\.com$/;

/** Approval link handed to the browser; only ever a paypal.com URL. */
export function approveUrlOf(order: PayPalOrder | null | undefined): string | undefined {
  const links = Array.isArray(order?.links) ? order!.links! : [];
  const match = links.find((l) => l.rel === 'payer-action') ?? links.find((l) => l.rel === 'approve');
  const href = match?.href;
  if (typeof href !== 'string') return undefined;
  try {
    const url = new URL(href);
    if (url.protocol !== 'https:' || !PAYPAL_HOST.test(url.host)) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}
