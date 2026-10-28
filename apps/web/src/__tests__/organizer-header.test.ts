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

  it('el cliente adjunta la clave solo al llamar las rutas nuevas', async () => {
    rememberAdminKey(slug, key);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'ok', messages: [], greeting: 'hola', token: 't', leaseId: '11111111-1111-1111-1111-111111111111', sessionConfig: {}, maxSeconds: 120, response: { ok: true } }),
    } as Response);
    await api.sendOrganizerChat(slug, 'estado');
    await api.getOrganizerChatHistory(slug);
    await api.getOrganizerVoiceToken(slug);
    await api.executeOrganizerVoiceTool(slug, { leaseId: '11111111-1111-1111-1111-111111111111', name: 'get_funding_progress', arguments: {} });
    await api.sendChat(slug, 'hola');
    await api.getChatHistory(slug);
    await api.getVoiceToken(slug);
    await api.executeVoiceTool(slug, { leaseId: '11111111-1111-1111-1111-111111111111', name: 'get_event_details', arguments: {} });

    const calls = fetchSpy.mock.calls.map(([url, init]) => ({
      url: String(url),
      method: ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase(),
      key: headerOf(init as RequestInit | undefined),
      body: String((init as RequestInit | undefined)?.body ?? ''),
    }));
    const keyed = calls.filter((call) => call.key === key).map((call) => `${call.method} ${call.url}`);
    expect(keyed).toEqual([
      `/api/events/${slug}/organizer-chat`,
      `/api/events/${slug}/organizer-chat/history`,
      `/api/events/${slug}/organizer-voice/token`,
      `/api/events/${slug}/organizer-voice/tool`,
    ].map((path, index) => `${['POST', 'GET', 'POST', 'POST'][index]} ${path}`));
    for (const call of calls.filter((item) => item.url.includes('/chat') || item.url.includes('/voice/'))) {
      expect(call.key).toBeNull();
    }
    expect(calls.some((call) => call.body.includes(key) || call.url.includes(key))).toBe(false);
  });
});
