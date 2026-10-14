import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api, ApiError } from '../api/client';

describe('API Client Specification Compliance (docs/API.md)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends credentials same-origin and receives capabilities', async () => {
    const mockCaps = {
      paypal: true,
      gemini: false,
      voice: false,
      paypalClientId: 'sb-client-id-123',
      sandbox: true as const,
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockCaps,
    } as Response);

    const caps = await api.getCapabilities();
    expect(caps.paypal).toBe(true);
    expect(caps.paypalClientId).toBe('sb-client-id-123');

    expect(fetchSpy).toHaveBeenCalledWith('/api/capabilities', expect.objectContaining({
      credentials: 'same-origin',
    }));
  });

  it('sends confirmed: true when creating an order', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ orderId: 'ord_xyz', status: 'CREATED', approveUrl: 'https://paypal.com/checkout' }),
    } as Response);

    const result = await api.createOrder('asado-amigos', 'quote_123');
    expect(result.orderId).toBe('ord_xyz');

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/events/asado-amigos/orders',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ quoteId: 'quote_123', confirmed: true }),
      })
    );
  });

  it('throws typed ApiError with status and message when server returns an error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: 'PayPal credentials missing in server config' }),
    } as Response);

    await expect(api.createOrder('slug', 'quote_id')).rejects.toThrow(ApiError);

    try {
      await api.createOrder('slug', 'quote_id');
    } catch (e: any) {
      expect(e.status).toBe(503);
      expect(e.message).toBe('PayPal credentials missing in server config');
    }
  });

  it('encodes special characters in slugs and orderIds safely', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ event: { slug: 'fiesta/123' }, guest: null }),
    } as Response);

    await api.getEventBySlug('fiesta/123');
    expect(fetchSpy).toHaveBeenCalledWith('/api/events/fiesta%2F123', expect.anything());
  });

  it('requests voice token with consent: true contract', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        token: 'tok-abc',
        sessionConfig: { sample_rate: 24000 },
        maxSeconds: 180,
        leaseId: 'lease-123',
      }),
    } as Response);

    const tokenRes = await api.getVoiceToken('fiesta-slug');
    expect(tokenRes.token).toBe('tok-abc');
    expect(tokenRes.leaseId).toBe('lease-123');
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/events/fiesta-slug/voice/token',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ consent: true }),
      })
    );
  });

  it('executes voice tool with leaseId and arguments', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        response: { success: true },
        actions: ['rsvp:yes:1'],
      }),
    } as Response);

    const toolRes = await api.executeVoiceTool('fiesta-slug', {
      leaseId: 'lease-123',
      name: 'set_rsvp',
      arguments: { status: 'yes', companions: 1 },
    });

    expect(toolRes.actions).toEqual(['rsvp:yes:1']);
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/events/fiesta-slug/voice/tool',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          leaseId: 'lease-123',
          name: 'set_rsvp',
          arguments: { status: 'yes', companions: 1 },
        }),
      })
    );
  });
});

