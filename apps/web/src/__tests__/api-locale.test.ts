import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { genericServerErrorEn } from '@fiestapay/shared';
import {
  api,
  ApiError,
  REQUEST_TIMEOUT_MESSAGES,
  REQUEST_TIMEOUT_MESSAGES_EN,
  REQUEST_TIMEOUT_MS,
  request,
} from '../api/client';
import { setActiveLocale } from '../i18n/locale-store';

function abortableHangingFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      const fail = () => reject(new DOMException('Aborted', 'AbortError'));
      if (signal?.aborted) {
        fail();
        return;
      }
      signal?.addEventListener('abort', fail, { once: true });
    });
  });
}

beforeEach(() => {
  localStorage.clear();
  setActiveLocale('es');
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
  setActiveLocale('es');
});

describe('API locale header and errors', () => {
  it('sends x-fiesta-locale: es by default and en when active', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    } as Response);

    await api.getHealth();
    expect(new Headers(fetchSpy.mock.calls[0]?.[1]?.headers).get('x-fiesta-locale')).toBe('es');

    setActiveLocale('en');
    await api.getHealth();
    expect(new Headers(fetchSpy.mock.calls[1]?.[1]?.headers).get('x-fiesta-locale')).toBe('en');
  });

  it('creates demos with POST /api/demo { kind }', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ event: { slug: 'demo-x' }, adminKey: 'k' }),
    } as Response);

    await api.createDemo('payment');
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/demo',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ kind: 'payment' }) })
    );

    await api.createDemo('private');
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/demo',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ kind: 'private' }) })
    );
  });

  it('keeps the Spanish server message byte-identical in es', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: 'Credenciales de PayPal ausentes en el servidor' }),
    } as Response);

    const error = await api.getHealth().catch((caught) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(503);
    expect(error.message).toBe('Credenciales de PayPal ausentes en el servidor');
  });

  it('never shows Spanish server text in en and preserves the status', async () => {
    setActiveLocale('en');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: 'Credenciales de PayPal ausentes en el servidor' }),
    } as Response);

    const error = await api.getHealth().catch((caught) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(503);
    expect(error.message).toBe(genericServerErrorEn(503));
    expect(error.message).not.toContain('Credenciales');
  });

  it('translates the client fallback error in en instead of leaking Spanish', async () => {
    setActiveLocale('en');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);

    const error = await api.getHealth().catch((caught) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(500);
    expect(error.message).toBe(genericServerErrorEn(500));
    expect(error.message).not.toMatch(/Error del servidor/);
  });

  it('keeps the Spanish timeout text in es and translates it in en', async () => {
    vi.useFakeTimers();
    abortableHangingFetch();

    const esPending = request('/api/events', { method: 'POST', body: '{}' });
    const esAssertion = expect(esPending).rejects.toMatchObject({
      name: 'ApiError',
      status: 408,
      message: REQUEST_TIMEOUT_MESSAGES.mutation,
    });
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    await esAssertion;

    setActiveLocale('en');
    const enPending = request('/api/events', { method: 'POST', body: '{}' });
    const enAssertion = expect(enPending).rejects.toMatchObject({
      name: 'ApiError',
      status: 408,
      message: REQUEST_TIMEOUT_MESSAGES_EN.mutation,
    });
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    await enAssertion;
  });
});
