import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api, ApiError } from '../api/client';

describe('Payment Safety & Order Capture Verification (Docs/API.md)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends order capture request to authorized endpoint with same-origin credentials', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'paid',
        guest: { id: 'g-1', name: 'Carlos', status: 'yes', companions: 0, paidCents: 2500, dueCents: 0 },
      }),
    } as Response);

    const res = await api.captureOrder('ord-12345');

    expect(res.status).toBe('paid');
    expect(res.guest.id).toBe('g-1');
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/orders/ord-12345/capture',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
      })
    );
  });

  it('propagates server rejection on failed capture without faking client success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 402,
      json: async () => ({ error: 'Transacción no autorizada por PayPal' }),
    } as Response);

    await expect(api.captureOrder('ord-failed')).rejects.toThrow(ApiError);
  });

  it('retrieves order state for reconciliation via getOrder', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'paid',
        guest: { id: 'g-1', name: 'Carlos', status: 'yes', companions: 0, paidCents: 2500, dueCents: 0 },
      }),
    } as Response);

    const res = await api.getOrder('ord-12345');
    expect(res.status).toBe('paid');
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/orders/ord-12345',
      expect.objectContaining({
        credentials: 'same-origin',
      })
    );
  });
});
