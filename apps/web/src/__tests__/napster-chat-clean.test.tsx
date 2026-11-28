/**
 * NAP-U1 — chat limpio: cada mensaje aparece una sola vez y nunca se ve texto
 * interno. Alimenta la sesión con una secuencia realista de eventos del SDK
 * (video) y del WebSocket (texto): deltas, final con texto completo, eco del
 * mensaje del usuario, function_implicitly_called y salida de función. El SDK
 * de Napster se mockea; sin red real.
 */
import React, { act } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NapsterCompanionApiSdk,
  type NapsterCompanionApiConfig,
  type NapsterCompanionApiInstance,
} from '@touchcastllc/napster-companion-api';

type ServerEvent = Parameters<NonNullable<NapsterCompanionApiConfig['onData']>>[0];
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
  token: 'tok-limpio-1',
  handle: '123e4567-e89b-12d3-a456-426614174000',
  visitor: 'public',
  lang: 'es',
  agent: 'default',
};
const SOCKET_URL = 'wss://napster.example.com/s?token=tok-limpio-1';

/** WebSocket falso mínimo: registra URL, envíos y cierre. */
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
}

describe('NapsterAvatar chat limpio (NAP-U1)', () => {
  const fetchMock = vi.fn();
  const sendBeacon = vi.fn();
  const sockets: FakeSocket[] = [];
  let capturedConfig: NapsterCompanionApiConfig | null = null;
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
    capturedConfig = null;
    localStorage.setItem('fp_locale', 'es');
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
      capturedConfig = config ?? null;
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
    localStorage.clear();
    Object.defineProperty(window.navigator, 'sendBeacon', { value: undefined, configurable: true });
  });

  function mount() {
    return render(
      <I18nProvider>
        <NapsterAvatar />
      </I18nProvider>,
    );
  }

  async function startLiveSession(): Promise<void> {
    fetchMock.mockResolvedValue(jsonResponse(SESSION, 200));
    mount();
    fireEvent.click(screen.getByTestId('napster-avatar-start'));
    await waitFor(() => expect(initMock).toHaveBeenCalledTimes(1));
    act(() => {
      capturedConfig?.onAvatarReady?.(true);
    });
    await screen.findByTestId('napster-avatar-end');
  }

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

  it('video: deltas + final completo de la avatar se ven una sola vez', async () => {
    await startLiveSession();
    const onData = capturedConfig?.onData;
    expect(onData).toBeTypeOf('function');
    act(() => {
      onData?.({
        event: 'message_received',
        data: { message: { action: 'delta', content: '¡Hola', role: 'assistant' } },
      } as unknown as ServerEvent);
      onData?.({
        event: 'message_received',
        data: { message: { action: 'delta', content: ', soy tu guía', role: 'assistant' } },
      } as unknown as ServerEvent);
      // El final trae el texto completo, no solo el resto.
      onData?.({
        event: 'message_received',
        data: { message: { action: 'completed', content: '¡Hola, soy tu guía!', role: 'assistant' } },
      } as unknown as ServerEvent);
    });
    expect(screen.getAllByText('¡Hola, soy tu guía!')).toHaveLength(1);
  });

  it('video: el usuario duplicado y el texto interno no se ven dos veces', async () => {
    vi.spyOn(api, 'getPortalEvents').mockResolvedValue({ events: [] });
    await startLiveSession();
    const onData = capturedConfig?.onData;
    expect(onData).toBeTypeOf('function');
    act(() => {
      onData?.({
        event: 'message_received',
        data: { message: { action: 'completed', content: 'Quiero ver eventos', role: 'user' } },
      } as unknown as ServerEvent);
      // El servidor repite el mismo mensaje final.
      onData?.({
        event: 'message_received',
        data: { message: { action: 'completed', content: 'Quiero ver eventos', role: 'user' } },
      } as unknown as ServerEvent);
      // Contexto interno y eco JSON de la salida de función: nunca visibles.
      onData?.({
        event: 'message_received',
        data: { message: { action: 'completed', content: 'El visitante ahora está en la portada.', role: 'system' } },
      } as unknown as ServerEvent);
      onData?.({
        event: 'message_received',
        data: { message: { action: 'completed', content: '{"events": []}', role: 'assistant' } },
      } as unknown as ServerEvent);
      onData?.({
        event: 'function_implicitly_called',
        data: { call_id: 'call-1', name: 'list_open_events', arguments: {} },
      } as unknown as ServerEvent);
    });
    await waitFor(() => expect(fakeInstance.sendCommand).toHaveBeenCalledTimes(1));
    expect(screen.getAllByText('Quiero ver eventos')).toHaveLength(1);
    expect(screen.queryByText(/El visitante ahora está/)).toBeNull();
    expect(screen.queryByText(/\{"events"/)).toBeNull();
    expect(screen.queryByText(/call-1/)).toBeNull();
  });

  it('texto: el eco del usuario y el final completo se ven una sola vez', async () => {
    const socket = await openReadyChat();
    fireEvent.change(screen.getByTestId('napster-avatar-input'), { target: { value: 'Hola' } });
    fireEvent.click(screen.getByTestId('napster-avatar-send'));
    expect(screen.getAllByText('Hola')).toHaveLength(1);
    act(() => {
      // El servidor devuelve el eco del mensaje del usuario.
      socket.simulateMessage({
        event: 'message_received',
        data: { message: { role: 'user', action: 'completed', content: 'Hola' } },
      });
      socket.simulateMessage({
        event: 'message_received',
        data: { message: { role: 'assistant', action: 'delta', content: '¡Hola' } },
      });
      // El final trae el texto completo, no solo el resto.
      socket.simulateMessage({
        event: 'message_received',
        data: { message: { role: 'assistant', action: 'completed', content: '¡Hola! ¿En qué te ayudo?' } },
      });
      // Interno: contexto de sistema, JSON y salida de función nunca visibles.
      socket.simulateMessage({
        event: 'message_received',
        data: { message: { role: 'system', action: 'completed', content: 'El visitante ahora está en la demo.' } },
      });
      socket.simulateMessage({
        event: 'message_received',
        data: { message: { role: 'assistant', action: 'completed', content: '{"events": []}' } },
      });
      socket.simulateMessage({
        event: 'function_implicitly_called',
        data: { call_id: 'call-t1', name: 'unknown_tool', arguments: {} },
      });
    });
    await waitFor(() => expect(socket.sent).toHaveLength(2));
    expect(screen.getAllByText('Hola')).toHaveLength(1);
    expect(screen.getAllByText('¡Hola! ¿En qué te ayudo?')).toHaveLength(1);
    expect(screen.queryByText(/El visitante ahora está/)).toBeNull();
    expect(screen.queryByText(/\{"events"/)).toBeNull();
    expect(screen.queryByText(/call-t1/)).toBeNull();
    expect(screen.queryByText(/not_allowed/)).toBeNull();
  });
});
