/**
 * NAP-F4w — cliente de sesión de texto: `mode:'text'` y `socketUrl` local
 * (el contrato lo integra el director desde la rama DSH). Sin red real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AvatarSessionError, api } from '../api/client';

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const SESSION = {
  token: 'tok-1',
  handle: '123e4567-e89b-12d3-a456-426614174000',
  visitor: 'public',
  lang: 'es',
  agent: 'default',
};

describe('api avatar-session texto (NAP-F4w)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('envía mode:text y devuelve socketUrl', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ...SESSION, socketUrl: 'wss://napster.example.com/s?token=t' }, 200),
    );
    const session = await api.createAvatarSession({ lang: 'es', mode: 'text' });
    expect(session.socketUrl).toBe('wss://napster.example.com/s?token=t');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ lang: 'es', mode: 'text' });
  });

  it('acepta socketUrl https (el navegador la mejora a socket)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ...SESSION, socketUrl: 'https://napster.example.com/s?token=t' }, 200),
    );
    const session = await api.createAvatarSession({ lang: 'es', mode: 'text' });
    expect(session.socketUrl).toBe('https://napster.example.com/s?token=t');
  });

  it('rechaza socketUrl inválida como avatar_upstream', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...SESSION, socketUrl: 'http://claro.example.com/x' }, 200));
    const error = await api.createAvatarSession({ lang: 'es', mode: 'text' }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(AvatarSessionError);
    expect((error as AvatarSessionError).code).toBe('avatar_upstream');
  });

  it('sin socketUrl devuelve la sesión base (modo video)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(SESSION, 200));
    const session = await api.createAvatarSession({ lang: 'es' });
    expect(session.socketUrl).toBeUndefined();
    expect(session.token).toBe('tok-1');
  });
});
