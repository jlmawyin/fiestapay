/**
 * NAP-F4w — modo texto Napster por WebSocket: apertura con la URL del servidor,
 * envío y recepción según la doc oficial, tools por el mismo router y respaldo
 * al recorrido fijo si el chat también falla. SDK y socket mockeados.
 */
import React, { act } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NapsterCompanionApiSdk,
  type NapsterCompanionApiConfig,
  type NapsterCompanionApiInstance,
} from '@touchcastllc/napster-companion-api';
import { I18nProvider } from '../i18n/I18nContext';
import { api } from '../api/client';
import { NapsterAvatar } from '../components/avatar/NapsterAvatar';

vi.mock('@touchcastllc/napster-companion-api', () => ({
  NapsterCompanionApiSdk: { init: vi.fn() },
  DataChannelMessageType: { SEND_MESSAGE: 'send_message', FUNCTION_CALL_OUTPUT: 'send_function_output' },
}));

const initMock = vi.mocked(NapsterCompanionApiSdk.init);

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const SESSION = {
  token: 'tok-texto-1',
  handle: '123e4567-e89b-12d3-a456-426614174000',
  visitor: 'public',
  lang: 'es',
  agent: 'default',
};
const SOCKET_URL = 'wss://napster.example.com/s?token=tok-texto-1';

/** WebSocket falso con simulación de apertura, mensajes, error y cierre. */
class FakeSocket {
  static OPEN = 1;
  url: string;
  readyState = 0;
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(url: string) {
    this.url = url;
  }
  send(payload: string): void {
    this.sent.push(payload);
  }
  close(): void {
    this.closed = true;
    this.readyState = 3;
  }
  simulateOpen(): void {
    this.readyState = 1;
    this.onopen?.();
  }
  simulateMessage(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
  simulateError(): void {
    this.onerror?.();
  }
  simulateClose(): void {
    this.readyState = 3;
    this.onclose?.();
  }
}

describe('NapsterAvatar modo texto (NAP-F4w)', () => {
  const fetchMock = vi.fn();
  const sendBeacon = vi.fn();
  const sockets: FakeSocket[] = [];
  const fakeInstance = {
    destroy: vi.fn(),
    sendCommand: vi.fn(),
  } as unknown as NapsterCompanionApiInstance;

  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    fetchMock.mockReset();
    sendBeacon.mockReset();
    sockets.length = 0;
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal(
      'WebSocket',
      class extends FakeSocket {
        constructor(url: string) {
          super(url);
          sockets.push(this);
        }
      },
    );
    Object.defineProperty(window.navigator, 'sendBeacon', { value: sendBeacon, configurable: true });
    sendBeacon.mockReturnValue(true);
    Element.prototype.scrollIntoView = vi.fn();
    initMock.mockImplementation(async (getToken, config) => {
      try {
        await getToken();
      } catch (error) {
        (config as NapsterCompanionApiConfig | undefined)?.onError?.(error as Error);
        throw error;
      }
      return fakeInstance;
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    Object.defineProperty(window.navigator, 'sendBeacon', { value: undefined, configurable: true });
  });

  function mount(node: React.ReactNode = <NapsterAvatar />) {
    return render(<I18nProvider>{node}</I18nProvider>);
  }

  /** Abre el chat por «Prefiero leer» y lo deja listo. */
  async function openReadyChat(): Promise<FakeSocket> {
    fetchMock.mockResolvedValue(jsonResponse({ ...SESSION, socketUrl: SOCKET_URL }, 200));
    mount();
    fireEvent.click(screen.getByTestId('napster-avatar-read'));
    await screen.findByTestId('napster-avatar-text');
    const socket = sockets[0];
    act(() => {
      socket.simulateOpen();
    });
    await waitFor(() => expect(screen.getByTestId('napster-avatar-input')).toBeEnabled());
    return socket;
  }

  it('abre el socket con la URL que dio el servidor', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...SESSION, socketUrl: SOCKET_URL }, 200));
    mount();
    fireEvent.click(screen.getByTestId('napster-avatar-read'));
    await screen.findByTestId('napster-avatar-text');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sockets).toHaveLength(1);
    expect(sockets[0].url).toBe(SOCKET_URL);
    expect(screen.getByText('Conectando el chat…')).toBeTruthy();
  });

  it('envía send_message de usuario y muestra ambas voces', async () => {
    const socket = await openReadyChat();
    fireEvent.change(screen.getByTestId('napster-avatar-input'), { target: { value: 'Hola, pana' } });
    fireEvent.click(screen.getByTestId('napster-avatar-send'));
    expect(socket.sent).toHaveLength(1);
    expect(JSON.parse(socket.sent[0])).toEqual({
      type: 'send_message',
      data: { role: 'user', text: 'Hola, pana', trigger_response: true },
    });
    expect(screen.getByText('Hola, pana')).toBeTruthy();
    act(() => {
      socket.simulateMessage({
        event: 'message_received',
        data: { message: { role: 'assistant', action: 'delta', content: '¡Hola' } },
      });
      socket.simulateMessage({
        event: 'message_received',
        data: { message: { role: 'assistant', action: 'completed', content: ' por aquí!' } },
      });
    });
    expect(screen.getByText('¡Hola por aquí!')).toBeTruthy();
    expect(screen.getByTestId('napster-avatar-messages').getAttribute('aria-live')).toBe('polite');
  });

  it('enruta una tool del público y responde send_function_output', async () => {
    vi.spyOn(api, 'getPortalEvents').mockResolvedValue({
      events: [
        {
          slug: 'asado',
          title: 'Asado pana',
          startsAt: '2026-12-01T18:00:00.000Z',
          endsAt: '2026-12-01T22:00:00.000Z',
          location: 'Quito',
          siteSlug: 'vecinos',
          siteName: 'Vecinos',
          url: 'https://vecinos.somospanas.com/e/asado',
          listingKind: 'live',
        },
      ],
    });
    const socket = await openReadyChat();
    act(() => {
      socket.simulateMessage({
        event: 'function_implicitly_called',
        data: { call_id: 'call-t1', name: 'list_open_events', arguments: {} },
      });
    });
    await waitFor(() => expect(socket.sent).toHaveLength(1));
    expect(JSON.parse(socket.sent[0])).toEqual({
      type: 'send_function_output',
      data: {
        call_id: 'call-t1',
        output: {
          events: [
            { ref: 1, title: 'Asado pana', startsAt: '2026-12-01T18:00:00.000Z', place: 'Quito', siteName: 'Vecinos' },
          ],
        },
      },
    });
  });

  it('si el socket falla antes de abrir, aparece el recorrido fijo', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...SESSION, socketUrl: SOCKET_URL }, 200));
    mount();
    fireEvent.click(screen.getByTestId('napster-avatar-read'));
    await screen.findByTestId('napster-avatar-text');
    act(() => {
      sockets[0].simulateError();
    });
    await screen.findByTestId('napster-avatar-fallback');
    expect(screen.getByTestId('napster-avatar-tutorial').querySelectorAll('li')).toHaveLength(4);
  });

  it('sin socketUrl no hay chat: recorrido fijo y handle cerrado', async () => {
    fetchMock.mockResolvedValue(jsonResponse(SESSION, 200));
    mount();
    fireEvent.click(screen.getByTestId('napster-avatar-read'));
    await screen.findByTestId('napster-avatar-fallback');
    expect(sockets).toHaveLength(0);
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon.mock.calls[0][0]).toBe('/api/avatar-session/end');
  });

  it('el video 409 abre el chat; si el chat falla, recorrido fijo', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: 'avatar_busy' }, 409))
      .mockResolvedValueOnce(jsonResponse({ ...SESSION, socketUrl: SOCKET_URL }, 200));
    mount();
    fireEvent.click(screen.getByTestId('napster-avatar-start'));
    await screen.findByTestId('napster-avatar-text');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    act(() => {
      sockets[0].simulateError();
    });
    await screen.findByTestId('napster-avatar-fallback');
    expect(screen.getByTestId('napster-avatar-tutorial').querySelectorAll('li')).toHaveLength(4);
  });

  it('503 de video va directo al recorrido fijo sin intentar el chat', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'avatar_no_credits' }, 503));
    mount();
    fireEvent.click(screen.getByTestId('napster-avatar-start'));
    await screen.findByTestId('napster-avatar-fallback');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sockets).toHaveLength(0);
  });

  it('«Terminar» en el chat cierra el socket, avisa y vuelve', async () => {
    const socket = await openReadyChat();
    fireEvent.click(screen.getByTestId('napster-avatar-end'));
    await screen.findByTestId('napster-avatar-start');
    expect(socket.closed).toBe(true);
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon.mock.calls[0][0]).toBe('/api/avatar-session/end');
  });
});
