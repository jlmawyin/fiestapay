import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api, ApiError } from '../api/client';
import { adminHeaderFor, adminKeyFor, captureAdminKeyFromLocation, rememberAdminKey } from '../api/admin-key';

describe('API Client Specification Compliance (docs/API.md)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends credentials same-origin and receives capabilities', async () => {
    const mockCaps = {
      paypal: true,
      chat: false,
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

  it('stores the admin key and removes it from the address bar', () => {
    window.history.replaceState({}, '', '/e/comida-abc/admin?k=sekreto&paypal=approved');
    captureAdminKeyFromLocation();
    expect(adminKeyFor('comida-abc')).toBe('sekreto');
    expect(window.location.pathname).toBe('/e/comida-abc/admin');
    expect(window.location.search).not.toContain('k=');
    expect(window.location.search).toContain('paypal=approved');
  });

  it('sends the admin key only on organizer calls for that slug', async () => {
    localStorage.clear();
    rememberAdminKey('comida-abc', 'clave-organizador');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ event: { slug: 'comida-abc' }, guests: [], audit: [] }),
    } as Response);

    await api.getDashboard('comida-abc');
    await api.getEventBySlug('comida-abc');
    await api.joinEvent('comida-abc', 'Ana');

    const dashboardHeaders = new Headers((fetchSpy.mock.calls[0]?.[1] as RequestInit).headers);
    const publicHeaders = new Headers((fetchSpy.mock.calls[1]?.[1] as RequestInit).headers);
    const joinHeaders = new Headers((fetchSpy.mock.calls[2]?.[1] as RequestInit).headers);
    expect(dashboardHeaders.get('X-Fiesta-Admin-Key')).toBe('clave-organizador');
    expect(publicHeaders.get('X-Fiesta-Admin-Key')).toBeNull();
    expect(joinHeaders.get('X-Fiesta-Admin-Key')).toBeNull();
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

function headerOf(init: RequestInit | undefined): string | null {
  return new Headers(init?.headers).get('X-Fiesta-Admin-Key');
}

function callInit(spy: { mock: { calls: unknown[][] } }, url: string): RequestInit {
  const found = spy.mock.calls.find((call) => call[0] === url);
  expect(found, url).toBeTruthy();
  return (found?.[1] ?? {}) as RequestInit;
}

describe('moderation admin header allowlist', () => {
  const slug = 'comida-abc';
  const key = 'clave-organizador';
  const otherKey = 'clave-otra';

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('sends the saved key on the client moderation calls with method and query', async () => {
    rememberAdminKey(slug, key);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ guests: [], conversations: [], messages: [], outcome: 'blocked', ok: true, id: 'm1', alreadyDeleted: false }),
    } as Response);

    await api.getModerationGuests(slug);
    await api.getModerationConversations(slug);
    await api.getModerationMessages(slug, 'conv/1');
    await api.deleteModerationMessage(slug, 'msg/1');
    await api.blockGuest(slug, 'guest/1');
    await api.unblockGuest(slug, 'guest/1');
    await api.removeGuest(slug, 'guest/1');

    const expected: Array<[string, string]> = [
      ['/api/events/comida-abc/moderation/guests', 'GET'],
      ['/api/events/comida-abc/moderation/conversations', 'GET'],
      ['/api/events/comida-abc/moderation/messages?conversationId=conv%2F1', 'GET'],
      ['/api/events/comida-abc/moderation/messages/msg%2F1', 'DELETE'],
      ['/api/events/comida-abc/guests/guest%2F1/block', 'POST'],
      ['/api/events/comida-abc/guests/guest%2F1/unblock', 'POST'],
      ['/api/events/comida-abc/guests/guest%2F1/remove', 'POST'],
    ];

    for (const [url, method] of expected) {
      const init = callInit(fetchSpy, url);
      expect((init.method ?? 'GET').toUpperCase()).toBe(method);
      expect(headerOf(init)).toBe(key);
      expect(String(url)).not.toContain(key);
      expect(String(init.body ?? '')).not.toContain(key);
    }

    const messagesUrl = '/api/events/comida-abc/moderation/messages?conversationId=conv-9&limit=20&before=41';
    expect(adminHeaderFor(messagesUrl, 'GET')).toBe(key);
    expect(adminHeaderFor('/api/events/comida-abc/moderation/conversations/conv%2F9/block', 'post')).toBe(key);
    expect(adminHeaderFor('/api/events/comida-abc/moderation/conversations/conv%2F9/unblock', 'POST')).toBe(key);
  });

  it('uses the decoded slug key and keeps encoded ids on one segment', async () => {
    rememberAdminKey('casa/uno', 'clave-decodificada');
    rememberAdminKey('casa%2Funo', 'clave-codificada');
    rememberAdminKey('casa', 'clave-casa');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ outcome: 'blocked' }),
    } as Response);

    await api.blockGuest('casa/uno', 'id/a');
    await api.deleteModerationMessage('casa/uno', 'm/2');

    const block = callInit(fetchSpy, '/api/events/casa%2Funo/guests/id%2Fa/block');
    const deleted = callInit(fetchSpy, '/api/events/casa%2Funo/moderation/messages/m%2F2');
    expect(block.method).toBe('POST');
    expect(headerOf(block)).toBe('clave-decodificada');
    expect(deleted.method).toBe('DELETE');
    expect(headerOf(deleted)).toBe('clave-decodificada');
    expect(adminHeaderFor('/api/events/casa%2Funo/moderation/conversations/a%2Fb/unblock', 'POST')).toBe('clave-decodificada');
    expect(adminHeaderFor('/api/events/casa/uno/moderation/guests', 'GET')).toBeNull();
  });

  it('does not borrow another event key and omits the header when the local key is missing', async () => {
    rememberAdminKey(slug, key);
    rememberAdminKey('otra-fiesta', otherKey);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ guests: [] }),
    } as Response);

    await api.getModerationGuests('otra-fiesta');
    await api.blockGuest(slug, 'g1');
    expect(headerOf(callInit(fetchSpy, '/api/events/otra-fiesta/moderation/guests'))).toBe(otherKey);
    expect(headerOf(callInit(fetchSpy, '/api/events/comida-abc/guests/g1/block'))).toBe(key);

    localStorage.clear();
    await api.getModerationGuests(slug);
    await api.removeGuest('sin-clave', 'g1');
    expect(headerOf(callInit(fetchSpy, '/api/events/comida-abc/moderation/guests'))).toBeNull();
    expect(headerOf(callInit(fetchSpy, '/api/events/sin-clave/guests/g1/remove'))).toBeNull();
    expect(adminHeaderFor('/api/events/comida-abc/moderation/conversations/c1/block', 'POST')).toBeNull();
    expect(adminHeaderFor('/api/events/comida-abc/moderation/messages/m1', 'DELETE')).toBeNull();
  });

  it('rejects neighbor paths, empty segments, and wrong verbs', () => {
    rememberAdminKey(slug, key);
    const denied: Array<[string, string]> = [
      ['/api/events/comida-abc/moderation', 'GET'],
      ['/api/events/comida-abc/moderation/guests/export', 'GET'],
      ['/api/events/comida-abc/moderation/settings', 'GET'],
      ['/api/events/comida-abc/moderation/guests', 'POST'],
      ['/api/events/comida-abc/moderation/guests', 'DELETE'],
      ['/api/events/comida-abc/moderation/conversations', 'POST'],
      ['/api/events/comida-abc/moderation/conversations/conv-1', 'GET'],
      ['/api/events/comida-abc/moderation/conversations/conv-1/messages', 'GET'],
      ['/api/events/comida-abc/moderation/conversations/block', 'POST'],
      ['/api/events/comida-abc/moderation/conversations/a/b/block', 'POST'],
      ['/api/events/comida-abc/moderation/conversations//block', 'POST'],
      ['/api/events/comida-abc/moderation/conversations/./block', 'POST'],
      ['/api/events/comida-abc/moderation/conversations/../block', 'POST'],
      ['/api/events/comida-abc/moderation/conversations/%2E%2E/unblock', 'POST'],
      ['/api/events/comida-abc/moderation/conversations/conv-1/block/extra', 'POST'],
      ['/api/events/comida-abc/moderation/conversations/conv-1/remove', 'POST'],
      ['/api/events/comida-abc/moderation/conversations/conv-1/block', 'GET'],
      ['/api/events/comida-abc/moderation/messages/msg-1', 'GET'],
      ['/api/events/comida-abc/moderation/messages/msg-1', 'POST'],
      ['/api/events/comida-abc/moderation/messages', 'DELETE'],
      ['/api/events/comida-abc/moderation/messages/', 'DELETE'],
      ['/api/events/comida-abc/moderation/messages/..', 'DELETE'],
      ['/api/events/comida-abc/moderation/messages/.', 'DELETE'],
      ['/api/events/comida-abc/moderation/messages/%2E%2E', 'DELETE'],
      ['/api/events/comida-abc/moderation/messages/msg-1/extra', 'DELETE'],
      ['/api/events/comida-abc/moderation/messages/%ZZ', 'DELETE'],
      ['/api/events/comida-abc/guests/guest-1/block', 'GET'],
      ['/api/events/comida-abc/guests/guest-1/block', 'DELETE'],
      ['/api/events/comida-abc/guests/guest-1/blocked', 'POST'],
      ['/api/events/comida-abc/guests/guest-1/block/extra', 'POST'],
      ['/api/events/comida-abc/guests/guest-1/remove-all', 'POST'],
      ['/api/events/comida-abc/guests//block', 'POST'],
      ['/api/events/comida-abc/guests/../block', 'POST'],
      ['/api/events/comida-abc/guests/%2E%2E/remove', 'POST'],
      ['/api/events/comida-abc/guests/%ZZ/block', 'POST'],
      ['/api/events/comida-abc/guests/a/b/block', 'POST'],
      ['/api/events/comida-abc/block', 'POST'],
      ['/api/events/comida-abc/chat/block', 'POST'],
      ['/api/events/comida-abc/moderation/blocklist', 'GET'],
      ['/api/events/comida-abc/moderation/guests/', 'GET'],
      ['/api/events/comida-abc/unlock', 'POST'],
      ['/api/events/comida-abc/admin/key', 'POST'],
      ['/api/other/comida-abc/moderation/guests', 'GET'],
      ['https://example.test/api/events/comida-abc/moderation/guests', 'GET'],
      ['http://127.0.0.1/api/events/comida-abc/guests/guest-1/block', 'POST'],
      ['/api/events/comida-abc/moderation/guests?block=1', 'POST'],
      ['/api/events/comida-abc/guests/guest-1/block?x=1', 'GET'],
    ];

    for (const [path, method] of denied) {
      expect(adminHeaderFor(path, method), `${method} ${path}`).toBeNull();
    }

    expect(adminHeaderFor('/api/events/comida-abc/moderation/guests?block=1', 'GET')).toBe(key);
    expect(adminHeaderFor('/api/events/comida-abc/guests/guest%2F1/block?x=1', 'POST')).toBe(key);
    expect(adminHeaderFor('/api/events/comida-abc/moderation/messages/msg-1?before=4', 'Delete')).toBe(key);
  });

  it('keeps public get, join, rsvp, quote, orders, capture, receipt, chat, history, and voice free of the key', async () => {
    rememberAdminKey(slug, key);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    await api.getEventBySlug(slug);
    await api.joinEvent(slug, 'Ana');
    await api.rsvp(slug, 'yes', 0);
    await api.getQuote(slug);
    await api.createOrder(slug, 'quote-1');
    await api.captureOrder('ord-1');
    await api.getOrder('ord-1');
    await api.sendChat(slug, 'hola');
    await api.getChatHistory(slug);
    await api.getVoiceToken(slug);
    await api.executeVoiceTool(slug, { leaseId: 'lease-1', name: 'set_rsvp', arguments: {} });
    await api.unlockEvent(slug, 'codigo');
    await api.getHealth();

    const urls = [
      '/api/events/comida-abc',
      '/api/events/comida-abc/join',
      '/api/events/comida-abc/rsvp',
      '/api/events/comida-abc/quote',
      '/api/events/comida-abc/orders',
      '/api/orders/ord-1/capture',
      '/api/orders/ord-1',
      '/api/events/comida-abc/chat',
      '/api/events/comida-abc/chat/history',
      '/api/events/comida-abc/voice/token',
      '/api/events/comida-abc/voice/tool',
      '/api/events/comida-abc/unlock',
      '/api/health',
    ];
    for (const url of urls) {
      const init = callInit(fetchSpy, url);
      expect(headerOf(init), url).toBeNull();
      expect(String(url)).not.toContain(key);
    }

    expect(adminHeaderFor('/api/events/comida-abc/receipt', 'GET')).toBeNull();
    expect(adminHeaderFor('/api/events/comida-abc/orders/ord-1/receipt', 'GET')).toBeNull();
    expect(adminHeaderFor('/api/orders/ord-1', 'GET')).toBeNull();
    expect(adminHeaderFor('https://pay.example/api/events/comida-abc/moderation/guests', 'GET')).toBeNull();
  });

  it('still attaches the key only to the older organizer routes', () => {
    rememberAdminKey(slug, key);
    expect(adminHeaderFor('/api/events/comida-abc/dashboard', 'GET')).toBe(key);
    expect(adminHeaderFor('/api/events/comida-abc/dashboard?x=1', 'GET')).toBe(key);
    expect(adminHeaderFor('/api/events/comida-abc/confirm', 'POST')).toBe(key);
    expect(adminHeaderFor('/api/events/comida-abc/close', 'POST')).toBe(key);
    expect(adminHeaderFor('/api/events/comida-abc', 'PUT')).toBe(key);
    expect(adminHeaderFor('/api/events/comida-abc', 'DELETE')).toBe(key);
    expect(adminHeaderFor('/api/events/comida-abc/recovery', 'GET')).toBe(key);
    expect(adminHeaderFor('/api/events/comida-abc/recovery/contact', 'PUT')).toBe(key);
    expect(adminHeaderFor('/api/events/comida-abc/recovery/contact', 'DELETE')).toBe(key);
    expect(adminHeaderFor('/api/events/comida-abc/dashboard', 'POST')).toBeNull();
    expect(adminHeaderFor('/api/events/comida-abc/confirm', 'GET')).toBeNull();
    expect(adminHeaderFor('/api/events/comida-abc/close', 'GET')).toBeNull();
    expect(adminHeaderFor('/api/events/comida-abc', 'POST')).toBeNull();
    expect(adminHeaderFor('/api/events/comida-abc/recovery', 'POST')).toBeNull();
    expect(adminHeaderFor('/api/events/comida-abc/recovery/contact', 'GET')).toBeNull();
    expect(adminHeaderFor('/api/events/otra-fiesta/dashboard', 'GET')).toBeNull();
  });
});
