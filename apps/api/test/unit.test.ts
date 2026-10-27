import { describe, expect, it, vi } from 'vitest';
import { estimateOrganizerFee, fixedQuote } from '@fiestapay/shared';
import { badRequest } from '../src/errors.js';
import { centsToUsd, usdToCents } from '../src/lib/money.js';
import { isAllowedOrigin, originFromReferer } from '../src/lib/origin.js';
import { redactRequest } from '../src/lib/redact.js';
import { assertNoClientMoneyState, eventInputSchema, orderSchema, rsvpSchema } from '../src/lib/schemas.js';
import { approveUrlOf, captureIdFromRefund, verifyCapturedOrder, verifyRefund } from '../src/paypal/verify.js';
import { quoteSummary } from '../src/domain/quotes.js';
import { paypalReturnUrls } from '../src/domain/orders.js';
import type { PayPalOrder, PayPalRefund } from '../src/paypal/types.js';

describe('dinero en centavos enteros', () => {
  it('convierte centavos a la cadena decimal de PayPal', () => {
    expect(centsToUsd(2500)).toBe('25.00');
    expect(centsToUsd(5)).toBe('0.05');
    expect(centsToUsd(0)).toBe('0.00');
    expect(centsToUsd(123456)).toBe('1234.56');
  });

  it('convierte importes de PayPal a centavos sin coma flotante', () => {
    expect(usdToCents('25.00')).toBe(2500);
    expect(usdToCents('0.07')).toBe(7);
    expect(usdToCents('1234.5')).toBe(123450);
    expect(usdToCents('10')).toBe(1000);
  });

  it('rechaza importes mal formados', () => {
    expect(usdToCents('25.000')).toBeNull();
    expect(usdToCents('veinticinco')).toBeNull();
    expect(usdToCents('')).toBeNull();
    expect(usdToCents(null)).toBeNull();
    expect(usdToCents({})).toBeNull();
  });

  it('mantiene el ciclo centavos -> texto -> centavos', () => {
    for (const cents of [1, 7, 99, 2500, 7500, 999999]) {
      expect(usdToCents(centsToUsd(cents))).toBe(cents);
    }
  });
});

describe('cuota fija compartida', () => {
  it('cobra la tarifa completa al titular y a cada acompanante', () => {
    expect(fixedQuote(2500, 1)).toEqual({ totalCents: 2500, amountCents: 2500 });
    expect(fixedQuote(2500, 2)).toEqual({ totalCents: 5000, amountCents: 5000 });
    expect(fixedQuote(2500, 3)).toEqual({ totalCents: 7500, amountCents: 7500 });
  });

  it('descuenta lo ya pagado y nunca baja de cero', () => {
    expect(fixedQuote(2500, 3, 2500)).toEqual({ totalCents: 7500, amountCents: 5000 });
    expect(fixedQuote(2500, 1, 9000)).toEqual({ totalCents: 2500, amountCents: 0 });
  });

  it('rechaza entradas invalidas', () => {
    expect(() => fixedQuote(0, 1)).toThrow();
    expect(() => fixedQuote(2500, 0)).toThrow();
    expect(() => fixedQuote(2500, 101)).toThrow();
    expect(() => fixedQuote(2500.5, 1)).toThrow();
    expect(() => fixedQuote(2500, 1, -1)).toThrow();
  });

  it('resume la cuenta que el agente debe repetir', () => {
    expect(quoteSummary(2, 2500, 5000, 5000)).toContain('2 personas');
    expect(quoteSummary(2, 2500, 5000, 2500)).toContain('falta');
    expect(quoteSummary(1, 2500, 2500, 0)).toContain('pagado');
  });
});

describe('validacion de origen en mutaciones', () => {
  const allowed = ['https://fiestapay.somospanas.com', 'http://localhost:5173'];

  it('acepta un origen permitido', () => {
    expect(isAllowedOrigin({ origin: 'https://fiestapay.somospanas.com', allowed })).toBe(true);
    expect(isAllowedOrigin({ origin: 'http://localhost:5173/', allowed })).toBe(true);
  });

  it('rechaza otros origenes, el origen opaco y la ausencia de origen', () => {
    expect(isAllowedOrigin({ origin: 'https://atacante.example', allowed })).toBe(false);
    expect(isAllowedOrigin({ origin: 'null', allowed })).toBe(false);
    expect(isAllowedOrigin({ allowed })).toBe(false);
    expect(isAllowedOrigin({ origin: 'https://fiestapay.somospanas.com', allowed: [] })).toBe(false);
  });

  it('usa el referer solo si no hay origen', () => {
    expect(isAllowedOrigin({ referer: 'http://localhost:5173/e/comida-abc', allowed })).toBe(true);
    expect(isAllowedOrigin({ referer: 'https://atacante.example/x', allowed })).toBe(false);
    expect(originFromReferer('no-es-url')).toBeNull();
  });
});

describe('registros sin secretos', () => {
  it('omite la query y no copia encabezados', () => {
    const logged = redactRequest({
      method: 'GET',
      url: '/api/events/comida-abc/admin?k=secreto',
      headers: { 'x-fiesta-admin-key': 'secreto', authorization: 'Bearer x' },
    });
    expect(logged).toEqual({ method: 'GET', url: '/api/events/comida-abc/admin' });
    expect(JSON.stringify(logged)).not.toContain('secreto');
  });
});

describe('validacion de entradas', () => {
  const base = {
    title: 'Almuerzo',
    template: 'comida',
    meal: 'almuerzo',
    description: 'Demo',
    startsAt: '2026-12-01T18:00:00.000Z',
    endsAt: '2026-12-01T22:00:00.000Z',
    location: 'Guayaquil',
    includes: ['Buffet'],
    priceCents: 2500,
    capacity: 20,
    goalCents: 10000,
    minimumCents: 5000,
    agenda: [],
  };

  it('acepta una entrada valida', () => {
    expect(eventInputSchema.safeParse(base).success).toBe(true);
  });

  it('rechaza precio no positivo y no entero', () => {
    expect(eventInputSchema.safeParse({ ...base, priceCents: 0 }).success).toBe(false);
    expect(eventInputSchema.safeParse({ ...base, priceCents: 25.5 }).success).toBe(false);
  });

  it('rechaza un minimo mayor que la meta', () => {
    expect(eventInputSchema.safeParse({ ...base, minimumCents: 20000 }).success).toBe(false);
    expect(eventInputSchema.safeParse({ ...base, goalCents: null, minimumCents: 5000 }).success).toBe(true);
  });

  it('exige fin posterior, inicio futuro, cupo y cobertura de la meta', () => {
    expect(eventInputSchema.safeParse({ ...base, endsAt: '2026-12-01T18:00:00.000Z' }).success).toBe(false);
    expect(eventInputSchema.safeParse({ ...base, startsAt: '2020-01-01T18:00:00.000Z' }).success).toBe(false);
    expect(eventInputSchema.safeParse({ ...base, capacity: null }).success).toBe(false);
    expect(eventInputSchema.safeParse({ ...base, capacity: 2, goalCents: 10000 }).success).toBe(false);
    expect(eventInputSchema.safeParse({ ...base, endsAt: undefined }).success).toBe(false);
  });

  it('rechaza un inicio 30s en el pasado o igual a ahora, y acepta uno futuro', () => {
    vi.useFakeTimers();
    try {
      const frozen = new Date('2026-10-27T15:00:00.000Z');
      vi.setSystemTime(frozen);
      const at = (deltaMs: number) => new Date(frozen.getTime() + deltaMs).toISOString();
      const input = (startsAt: string) => ({
        ...base,
        startsAt,
        endsAt: new Date(Date.parse(startsAt) + 2 * 60 * 60 * 1000).toISOString(),
      });
      expect(eventInputSchema.safeParse(input(at(-30_000))).success).toBe(false);
      expect(eventInputSchema.safeParse(input(at(0))).success).toBe(false);
      expect(eventInputSchema.safeParse(input(at(-59_000))).success).toBe(false);
      expect(eventInputSchema.safeParse(input(at(1_000))).success).toBe(true);
      expect(Date.now()).toBe(frozen.getTime());
    } finally {
      vi.useRealTimers();
    }
  });

  it('acota textos, listas y acompanantes', () => {
    expect(eventInputSchema.safeParse({ ...base, title: 'x'.repeat(200) }).success).toBe(false);
    expect(eventInputSchema.safeParse({ ...base, includes: Array(25).fill('x') }).success).toBe(false);
    expect(rsvpSchema.safeParse({ status: 'yes', companions: 21 }).success).toBe(false);
    expect(rsvpSchema.safeParse({ status: 'quiza', companions: 1 }).success).toBe(false);
    expect(rsvpSchema.safeParse({ status: 'yes', companions: 2 }).success).toBe(true);
  });

  it('exige confirmacion explicita y un identificador de cotizacion valido', () => {
    const quoteId = '11111111-2222-4333-8444-555555555555';
    expect(orderSchema.safeParse({ quoteId, confirmed: true }).success).toBe(true);
    expect(orderSchema.safeParse({ quoteId, confirmed: false }).success).toBe(false);
    expect(orderSchema.safeParse({ quoteId: 'no-uuid', confirmed: true }).success).toBe(false);
  });

  it('acepta una fecha limite entre ahora y el inicio, y la omision', () => {
    expect(eventInputSchema.safeParse(base).success).toBe(true);
    expect(eventInputSchema.safeParse({ ...base, fundingDeadlineAt: '2026-12-01T18:00:00.000Z' }).success).toBe(true);
    expect(eventInputSchema.safeParse({ ...base, fundingDeadlineAt: '2026-12-01T18:00:01.000Z' }).success).toBe(false);
    expect(eventInputSchema.safeParse({ ...base, fundingDeadlineAt: '2020-01-01T00:00:00.000Z' }).success).toBe(false);
    expect(eventInputSchema.safeParse({ ...base, minimumCents: null, fundingDeadlineAt: '2026-12-01T12:00:00.000Z' }).success).toBe(false);
  });
});

describe('estimacion de comision del organizador', () => {
  it('estima 5.40% + USD 0.30 sobre USD 50 y cero cuando no hay cobro', () => {
    const fifty = estimateOrganizerFee(5000);
    expect(fifty.feeCents).toBe(300);
    expect(fifty.netCents).toBe(4700);
    expect(fifty.rateBps).toBe(540);
    expect(fifty.fixedCents).toBe(30);
    expect(fifty.absorber).toBe('organizer');
    expect(fifty.estimate).toBe(true);
    expect(fifty.provenance).toContain('2026-09-28');
    expect(estimateOrganizerFee(0)).toMatchObject({ feeCents: 0, netCents: 0 });
    expect(fixedQuote(2500, 2).amountCents).toBe(5000);
  });

  it('redondea half-up y rechaza un importe que no cabe en un entero seguro', () => {
    // 100 * 540 = 54000; half-up divisor 10000 -> 5, mas 30.
    expect(estimateOrganizerFee(100)).toMatchObject({ feeCents: 35, netCents: 65 });
    // 1 centimo no llega a medio punto basico: solo el fijo, y el neto puede ser negativo.
    expect(estimateOrganizerFee(1)).toMatchObject({ feeCents: 30, netCents: -29 });
    expect(() => estimateOrganizerFee(Number.MAX_SAFE_INTEGER)).toThrow(/rango/);
    expect(() => estimateOrganizerFee(1.5)).toThrow(/invalidos/);
    // floor(MAX_SAFE_INTEGER / 540) keeps the product inside a safe integer, but
    // the half-up offset of 5000 pushes the numerator past it.
    const productOnly = Math.floor(Number.MAX_SAFE_INTEGER / 540);
    expect(Number.isSafeInteger(productOnly * 540)).toBe(true);
    expect(Number.isSafeInteger(productOnly * 540 + 5_000)).toBe(false);
    expect(() => estimateOrganizerFee(productOnly)).toThrow(/rango/);
    const safe = Math.floor((Number.MAX_SAFE_INTEGER - 5_000) / 540);
    expect(Number.isSafeInteger(safe * 540 + 5_000)).toBe(true);
    const bounded = estimateOrganizerFee(safe);
    expect(Number.isSafeInteger(bounded.feeCents)).toBe(true);
    expect(Number.isSafeInteger(bounded.netCents)).toBe(true);
    expect(bounded.feeCents).toBe(Math.floor((safe * 540 + 5_000) / 10_000) + 30);
    expect(bounded.netCents).toBe(safe - bounded.feeCents);
  });

  it('rechaza un cuerpo que declara pagado o financiado', () => {
    expect(() => assertNoClientMoneyState({ title: 'x', funded: true })).toThrow(badRequest('x').constructor);
    try {
      assertNoClientMoneyState({ paid: 1 });
      throw new Error('debio rechazar');
    } catch (err) {
      expect((err as { statusCode?: number }).statusCode).toBe(400);
    }
    expect(() => assertNoClientMoneyState({ quoteId: 'x', confirmed: true }, ['confirmed'])).not.toThrow();
  });
});

const captureExpectation = {
  paypalOrderId: 'ORD-1',
  amountCents: 5000,
  currency: 'USD' as const,
  merchantId: 'MERCHANT-TEST',
  customId: 'order-row-1',
};

const capturedOrder = (overrides: Partial<PayPalOrder> = {}, unit: Record<string, unknown> = {}): PayPalOrder => ({
  id: 'ORD-1',
  status: 'COMPLETED',
  purchase_units: [
    {
      custom_id: 'order-row-1',
      amount: { currency_code: 'USD', value: '50.00' },
      payee: { merchant_id: 'MERCHANT-TEST' },
      payments: {
        captures: [
          { id: 'CAP-1', status: 'COMPLETED', amount: { currency_code: 'USD', value: '50.00' }, custom_id: 'order-row-1' },
        ],
      },
      ...unit,
    },
  ],
  ...overrides,
});

describe('verificacion de captura antes de marcar pagado', () => {
  it('acepta una captura COMPLETED del comercio, importe y orden correctos', () => {
    const result = verifyCapturedOrder(capturedOrder(), captureExpectation);
    expect(result).toEqual({ ok: true, captureId: 'CAP-1', amountCents: 5000 });
  });

  it('rechaza otro receptor', () => {
    const order = capturedOrder({}, { payee: { merchant_id: 'OTRO-COMERCIO' } });
    expect(verifyCapturedOrder(order, captureExpectation)).toMatchObject({ ok: false });
  });

  it('rechaza un importe distinto al de la orden', () => {
    const order = capturedOrder({}, {
      payments: {
        captures: [{ id: 'CAP-1', status: 'COMPLETED', amount: { currency_code: 'USD', value: '0.50' } }],
      },
    });
    expect(verifyCapturedOrder(order, captureExpectation)).toMatchObject({ ok: false });
  });

  it('rechaza otra moneda', () => {
    const order = capturedOrder({}, {
      payments: {
        captures: [{ id: 'CAP-1', status: 'COMPLETED', amount: { currency_code: 'EUR', value: '50.00' } }],
      },
    });
    expect(verifyCapturedOrder(order, captureExpectation)).toMatchObject({ ok: false });
  });

  it('rechaza APPROVED sin captura completada', () => {
    const order = capturedOrder({ status: 'APPROVED' }, { payments: { captures: [] } });
    expect(verifyCapturedOrder(order, captureExpectation)).toMatchObject({ ok: false });
    const pending = capturedOrder({}, {
      payments: { captures: [{ id: 'CAP-1', status: 'PENDING', amount: { currency_code: 'USD', value: '50.00' } }] },
    });
    expect(verifyCapturedOrder(pending, captureExpectation)).toMatchObject({ ok: false });
  });

  it('rechaza otra orden, otra obligacion y respuestas vacias', () => {
    expect(verifyCapturedOrder(capturedOrder({ id: 'ORD-9' }), captureExpectation)).toMatchObject({ ok: false });
    expect(verifyCapturedOrder(capturedOrder({}, { custom_id: 'otra-orden' }), captureExpectation)).toMatchObject({
      ok: false,
    });
    expect(verifyCapturedOrder(null, captureExpectation)).toMatchObject({ ok: false });
    expect(verifyCapturedOrder({ id: 'ORD-1' }, captureExpectation)).toMatchObject({ ok: false });
  });

  it('rechaza varias capturas en una orden en lugar de elegir una', () => {
    const order = capturedOrder({}, {
      payments: {
        captures: [
          { id: 'CAP-1', status: 'COMPLETED', amount: { currency_code: 'USD', value: '50.00' } },
          { id: 'CAP-2', status: 'COMPLETED', amount: { currency_code: 'USD', value: '50.00' } },
        ],
      },
    });
    expect(verifyCapturedOrder(order, captureExpectation)).toMatchObject({ ok: false });
  });

  it('cuenta una captura ya reembolsada por su importe original', () => {
    // After a refund PayPal reports the capture as REFUNDED / PARTIALLY_REFUNDED. Rejecting
    // those would lose a late capture notification whenever the refund arrived first, and the
    // refund would then subtract from a capture that was never recorded.
    for (const status of ['PARTIALLY_REFUNDED', 'REFUNDED']) {
      const order = capturedOrder({}, {
        payments: {
          captures: [
            { id: 'CAP-1', status, amount: { currency_code: 'USD', value: '50.00' }, custom_id: 'order-row-1' },
          ],
        },
      });
      expect(verifyCapturedOrder(order, captureExpectation)).toEqual({ ok: true, captureId: 'CAP-1', amountCents: 5000 });
    }
  });

  it('distingue lo que puede resolverse solo de lo que nunca sera valido', () => {
    // Transient: PayPal has not published a capture yet, so the notification must be retried.
    const sinCaptura = capturedOrder({ status: 'APPROVED' }, { payments: { captures: [] } });
    expect(verifyCapturedOrder(sinCaptura, captureExpectation)).toMatchObject({ ok: false, transient: true });
    expect(verifyCapturedOrder(null, captureExpectation)).toMatchObject({ ok: false, transient: true });

    // Permanent: wrong receiver or wrong amount can never become correct.
    expect(
      verifyCapturedOrder(capturedOrder({}, { payee: { merchant_id: 'OTRO' } }), captureExpectation),
    ).toMatchObject({ ok: false, transient: false });
    expect(verifyCapturedOrder(capturedOrder({ id: 'ORD-9' }), captureExpectation)).toMatchObject({
      ok: false,
      transient: false,
    });
  });
});

describe('retorno del pagador desde PayPal', () => {
  it('vuelve a la invitacion que el front si sirve, con la pista en la query', () => {
    expect(paypalReturnUrls('https://fiestapay.example', 'comida-abc123')).toEqual({
      returnUrl: 'https://fiestapay.example/e/comida-abc123?paypal=approved',
      cancelUrl: 'https://fiestapay.example/e/comida-abc123?paypal=cancelled',
    });
  });

  it('no inventa un retorno cuando no hay origen publico configurado', () => {
    expect(paypalReturnUrls(undefined, 'comida-abc123')).toEqual({});
  });
});

describe('verificacion de reembolsos', () => {
  const refund = (overrides: Partial<PayPalRefund> = {}): PayPalRefund => ({
    id: 'REF-1',
    status: 'COMPLETED',
    amount: { currency_code: 'USD', value: '20.00' },
    links: [{ rel: 'up', href: 'https://api-m.sandbox.paypal.com/v2/payments/captures/CAP-1', method: 'GET' }],
    ...overrides,
  });

  it('acepta un reembolso que coincide con una captura registrada', () => {
    const result = verifyRefund(refund(), { currency: 'USD', knownCaptureIds: ['CAP-1'], maxRefundableCents: 5000 });
    expect(result).toEqual({ ok: true, refundId: 'REF-1', captureId: 'CAP-1', amountCents: 2000 });
  });

  it('rechaza reembolsos sin captura conocida, incompletos o excesivos', () => {
    expect(verifyRefund(refund(), { currency: 'USD', knownCaptureIds: ['CAP-9'], maxRefundableCents: 5000 })).toMatchObject({ ok: false });
    expect(verifyRefund(refund({ status: 'PENDING' }), { currency: 'USD', knownCaptureIds: ['CAP-1'], maxRefundableCents: 5000 })).toMatchObject({ ok: false });
    expect(verifyRefund(refund(), { currency: 'USD', knownCaptureIds: ['CAP-1'], maxRefundableCents: 1000 })).toMatchObject({ ok: false });
    expect(verifyRefund(refund({ links: [] }), { currency: 'USD', knownCaptureIds: ['CAP-1'], maxRefundableCents: 5000 })).toMatchObject({ ok: false });
  });

  it('extrae el id de la captura del enlace up', () => {
    expect(captureIdFromRefund(refund())).toBe('CAP-1');
    expect(captureIdFromRefund({ id: 'REF-2' })).toBeNull();
  });
});

describe('enlace de aprobacion', () => {
  it('solo entrega URLs https de paypal.com', () => {
    expect(
      approveUrlOf({ links: [{ rel: 'payer-action', href: 'https://www.sandbox.paypal.com/checkoutnow?token=1' }] }),
    ).toContain('paypal.com');
    expect(approveUrlOf({ links: [{ rel: 'approve', href: 'https://atacante.example/pagar' }] })).toBeUndefined();
    expect(approveUrlOf({ links: [{ rel: 'approve', href: 'http://www.paypal.com/x' }] })).toBeUndefined();
    expect(approveUrlOf({ links: [{ rel: 'self', href: 'https://www.paypal.com/x' }] })).toBeUndefined();
    expect(approveUrlOf(null)).toBeUndefined();
  });
});
