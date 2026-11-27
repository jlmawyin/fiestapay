/**
 * NAP-F3 — cliente de `POST /api/avatar-session`: conserva el código de error y
 * `retryAfterSec`, y cierra con beacon. Sin red real: `fetch` se stubbea.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, AvatarSessionError, api } from '../api/client';

function jsonResponse(body: unknown, status: number, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...(headers ?? {}) },
  });
}

const SESSION = {
  token: 'tok-1',
  handle: '123e4567-e89b-12d3-a456-426614174000',
  visitor: 'public',
  lang: 'es',
  agent: 'default',
};

describe('api avatar-session (NAP-F3)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('createAvatarSession envía el idioma y valida la respuesta', async () => {
    fetchMock.mockResolvedValue(jsonResponse(SESSION, 200));
    const session = await api.createAvatarSession({ lang: 'es', intent: 'create' });
    expect(session).toEqual(SESSION);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/avatar-session');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ lang: 'es', intent: 'create' });
  });

  it('409 conserva el código avatar_busy', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'avatar_busy' }, 409));
    const error = await api.createAvatarSession({ lang: 'es' }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(AvatarSessionError);
    expect((error as AvatarSessionError).code).toBe('avatar_busy');
    expect((error as AvatarSessionError).status).toBe(409);
  });

  it('429 conserva retryAfterSec del cuerpo, o de la cabecera', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'avatar_rate_limited', retryAfterSec: 2 }, 429));
    const fromBody = await api.createAvatarSession({ lang: 'en' }).catch((err: unknown) => err);
    expect((fromBody as AvatarSessionError).retryAfterSec).toBe(2);

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'avatar_rate_limited' }, 429, { 'Retry-After': '7' }));
    const fromHeader = await api.createAvatarSession({ lang: 'en' }).catch((err: unknown) => err);
    expect((fromHeader as AvatarSessionError).retryAfterSec).toBe(7);
  });

  it('una respuesta 200 inválida se rechaza como avatar_upstream', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ token: '' }, 200));
    const error = await api.createAvatarSession({ lang: 'es' }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(AvatarSessionError);
    expect((error as AvatarSessionError).code).toBe('avatar_upstream');
  });

  it('endAvatarSession acepta el 204 sin cuerpo', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(api.endAvatarSession(SESSION.handle)).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/avatar-session/end');
    expect(JSON.parse(init.body as string)).toEqual({ handle: SESSION.handle });
  });

  it('endAvatarSession lanza ApiError si el servidor falla', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'x' }, 500));
    const error = await api.endAvatarSession(SESSION.handle).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(500);
  });

  it('queueAvatarSessionEnd usa sendBeacon con el handle en JSON', async () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    Object.defineProperty(window.navigator, 'sendBeacon', { value: sendBeacon, configurable: true });
    try {
      api.queueAvatarSessionEnd(SESSION.handle);
      expect(sendBeacon).toHaveBeenCalledTimes(1);
      const [url, payload] = sendBeacon.mock.calls[0] as [string, Blob];
      expect(url).toBe('/api/avatar-session/end');
      // El Blob de jsdom no trae .text(); se lee con FileReader.
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(payload);
      });
      expect(JSON.parse(text)).toEqual({ handle: SESSION.handle });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      // jsdom no trae sendBeacon; se deja como estaba.
      Object.defineProperty(window.navigator, 'sendBeacon', { value: undefined, configurable: true });
    }
  });

  it('queueAvatarSessionEnd usa fetch con keepalive sin beacon', () => {
    Object.defineProperty(window.navigator, 'sendBeacon', { value: undefined, configurable: true });
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    api.queueAvatarSessionEnd(SESSION.handle);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { keepalive?: boolean }];
    expect(url).toBe('/api/avatar-session/end');
    expect(init.keepalive).toBe(true);
  });
});
