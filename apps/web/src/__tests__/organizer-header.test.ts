import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import { adminHeaderFor, rememberAdminKey } from '../api/admin-key';

const slug = 'comida-abc';
const key = 'clave-organizador';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function headerOf(init: RequestInit | undefined): string | null {
  return new Headers(init?.headers).get('X-Fiesta-Admin-Key');
}

describe('clave de admin solo en las rutas del organizador', () => {
  it('conserva las rutas viejas y suma exactamente las cuatro nuevas', () => {
    rememberAdminKey(slug, key);
    const allowed: Array<[string, string]> = [
      [`/api/events/${slug}/dashboard`, 'GET'],
      [`/api/events/${slug}/confirm`, 'POST'],
      [`/api/events/${slug}/close`, 'POST'],
      [`/api/events/${slug}`, 'PUT'],
      [`/api/events/${slug}`, 'DELETE'],
      [`/api/events/${slug}/recovery`, 'GET'],
      [`/api/events/${slug}/recovery/contact`, 'PUT'],
      [`/api/events/${slug}/recovery/contact`, 'DELETE'],
      [`/api/events/${slug}/moderation/guests`, 'GET'],
      [`/api/events/${slug}/moderation/conversations`, 'GET'],
      [`/api/events/${slug}/moderation/messages`, 'GET'],
      [`/api/events/${slug}/moderation/messages/m1`, 'DELETE'],
      [`/api/events/${slug}/guests/g1/block`, 'POST'],
      [`/api/events/${slug}/guests/g1/unblock`, 'POST'],
      [`/api/events/${slug}/guests/g1/remove`, 'POST'],
      [`/api/events/${slug}/moderation/conversations/c1/block`, 'POST'],
      [`/api/events/${slug}/moderation/conversations/c1/unblock`, 'POST'],
      [`/api/events/${slug}/organizer-chat`, 'POST'],
      [`/api/events/${slug}/organizer-chat/history`, 'GET'],
      [`/api/events/${slug}/organizer-voice/token`, 'POST'],
      [`/api/events/${slug}/organizer-voice/tool`, 'POST'],
    ];
    for (const [path, method] of allowed) {
      expect(adminHeaderFor(path, method), `${method} ${path}`).toBe(key);
    }
    const publicRoutes: Array<[string, string]> = [
      [`/api/events/${slug}/chat`, 'POST'],
      [`/api/events/${slug}/chat/history`, 'GET'],
      [`/api/events/${slug}/voice/token`, 'POST'],
      [`/api/events/${slug}/voice/tool`, 'POST'],
      [`/api/events/${slug}/join`, 'POST'],
      [`/api/events/${slug}`, 'GET'],
      [`/api/events/${slug}/organizer-chat`, 'GET'],
      [`/api/events/${slug}/organizer-chat/history`, 'POST'],
      [`/api/events/${slug}/organizer-voice/token`, 'GET'],
      [`/api/events/otra-fiesta/organizer-chat`, 'POST'],
    ];
    for (const [path, method] of publicRoutes) {
      expect(adminHeaderFor(path, method), `${method} ${path}`).toBeNull();
    }
  });

  it('el cliente adjunta la clave a avatar-session solo con eventSlug guardado', async () => {
    rememberAdminKey(slug, key);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ token: 't', handle: '123e4567-e89b-12d3-a456-426614174000', visitor: 'creator', lang: 'es', agent: 'default' }),
    } as Response);
    await api.createAvatarSession({ lang: 'es', eventSlug: slug });
    await api.createAvatarSession({ lang: 'es' });
    await api.getEventBySlug(slug);

    const calls = fetchSpy.mock.calls.map(([url, init]) => ({
      url: String(url),
      key: headerOf(init as RequestInit | undefined),
      body: String((init as RequestInit | undefined)?.body ?? ''),
    }));
    expect(calls).toHaveLength(3);
    expect(calls[0]?.url).toBe('/api/avatar-session');
    expect(calls[0]?.key).toBe(key);
    expect(calls[1]?.url).toBe('/api/avatar-session');
    expect(calls[1]?.key).toBeNull();
    expect(calls[2]?.url).toBe(`/api/events/${slug}`);
    expect(calls[2]?.key).toBeNull();
    expect(calls.some((call) => call.body.includes(key) || call.url.includes(key))).toBe(false);
  });
});
