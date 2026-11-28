/**
 * NAP-U1 — pulido de producto: foto fija mientras se conecta, subtítulo en
 * curso siempre visible, estados del micrófono, sello «Powered by Napster»,
 * título con nombre opcional y un solo aviso con dos tarjetas montadas. El SDK
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
import type { AvatarSessionResponse } from '@fiestapay/shared';
import { I18nProvider } from '../i18n/I18nContext';
import { avatarCatalog } from '../i18n/messages/avatar';
import { api } from '../api/client';
import { DEFAULT_AVATAR_PREVIEW_URL, NapsterAvatar } from '../components/avatar/NapsterAvatar';
import { AVATAR_OPEN_EVENT } from '../components/avatar/avatar-open';

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
  token: 'tok-pulido-1',
  handle: '123e4567-e89b-12d3-a456-426614174000',
  visitor: 'public',
  lang: 'es',
  agent: 'default',
};
const SOCKET_URL = 'wss://napster.example.com/s?token=tok-pulido-1';

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
}

describe('NapsterAvatar pulido (NAP-U1)', () => {
  const fetchMock = vi.fn();
  const sendBeacon = vi.fn();
  const sockets: FakeSocket[] = [];
  let capturedConfig: NapsterCompanionApiConfig | null = null;
  const fakeInstance = {
    destroy: vi.fn(),
    sendCommand: vi.fn(),
    muteMic: vi.fn(),
    unmuteMic: vi.fn(),
    isUserTalking: false,
    isAvatarSpeaking: false,
  } as unknown as NapsterCompanionApiInstance & { isUserTalking: boolean; isAvatarSpeaking: boolean };

  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    fetchMock.mockReset();
    sendBeacon.mockReset();
    sockets.length = 0;
    capturedConfig = null;
    fakeInstance.isUserTalking = false;
    fakeInstance.isAvatarSpeaking = false;
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

  function mount(node: React.ReactNode = <NapsterAvatar />) {
    return render(<I18nProvider>{node}</I18nProvider>);
  }

  async function startConnecting(): Promise<void> {
    // Respuesta fresca por llamada: un mismo Response solo se lee una vez.
    fetchMock.mockImplementation(async () => jsonResponse(SESSION, 200));
    mount();
    fireEvent.click(screen.getByTestId('napster-avatar-start'));
    await waitFor(() => expect(initMock).toHaveBeenCalledTimes(1));
    await screen.findByTestId('napster-avatar-video');
  }

  async function startLiveSession(): Promise<void> {
    await startConnecting();
    act(() => {
      capturedConfig?.onAvatarReady?.(true);
    });
    await screen.findByTestId('napster-avatar-end');
  }

  it('mientras se conecta se ve la foto general, nunca un cuadro vacío', async () => {
    await startConnecting();
    const preview = screen.getByTestId('napster-avatar-preview') as HTMLImageElement;
    expect(preview.getAttribute('src')).toBe(DEFAULT_AVATAR_PREVIEW_URL);
    expect(preview.getAttribute('alt')).toBe('Foto de tu guía de Somos Panas');
    act(() => {
      capturedConfig?.onAvatarReady?.(true);
    });
    await screen.findByTestId('napster-avatar-end');
    expect(screen.queryByTestId('napster-avatar-preview')).toBeNull();
  });

  it('previewUrl del catálogo sustituye a la foto general', async () => {
    fetchMock.mockResolvedValue(jsonResponse(SESSION, 200));
    mount(<NapsterAvatar previewUrl="https://ejemplo.test/foto.jpg" />);
    fireEvent.click(screen.getByTestId('napster-avatar-start'));
    await screen.findByTestId('napster-avatar-preview');
    expect((screen.getByTestId('napster-avatar-preview') as HTMLImageElement).getAttribute('src')).toBe(
      'https://ejemplo.test/foto.jpg',
    );
  });

  it('el sello «Powered by Napster» acompaña al video y al chat', async () => {
    await startLiveSession();
    expect(screen.getByTestId('napster-powered')).toHaveTextContent('Powered by Napster');
    fireEvent.click(screen.getByTestId('napster-avatar-end'));
    await screen.findByTestId('napster-avatar-start');
    fetchMock.mockResolvedValue(jsonResponse({ ...SESSION, socketUrl: SOCKET_URL }, 200));
    fireEvent.click(screen.getByTestId('napster-avatar-read'));
    await screen.findByTestId('napster-avatar-text');
    expect(screen.getByTestId('napster-powered')).toHaveTextContent('Powered by Napster');
  });

  it('el subtítulo en curso se ve de inmediato con aria-live polite', async () => {
    await startLiveSession();
    act(() => {
      capturedConfig?.onData?.({
        event: 'message_received',
        data: { message: { action: 'delta', content: 'Bienvenido', role: 'assistant' } },
      } as unknown as ServerEvent);
    });
    expect(screen.getByTestId('napster-avatar-captions').getAttribute('aria-live')).toBe('polite');
    expect(screen.getByText('Bienvenido')).toBeTruthy();
  });

  it('el micrófono pasa de listo a procesando y vuelve a listo', async () => {
    await startLiveSession();
    expect(screen.getByTestId('napster-mic')).toHaveTextContent('Micrófono listo');
    act(() => {
      capturedConfig?.onData?.({
        event: 'message_received',
        data: { message: { action: 'delta', content: 'Un momento', role: 'assistant' } },
      } as unknown as ServerEvent);
    });
    expect(screen.getByTestId('napster-mic')).toHaveTextContent('Procesando…');
    act(() => {
      capturedConfig?.onData?.({
        event: 'message_received',
        data: { message: { action: 'completed', content: 'Un momento, ya te digo.' } },
      } as unknown as ServerEvent);
    });
    expect(screen.getByTestId('napster-mic')).toHaveTextContent('Micrófono listo');
  });

  it('el micrófono marca escuchando cuando la persona habla', async () => {
    await startLiveSession();
    act(() => {
      fakeInstance.isUserTalking = true;
    });
    await waitFor(() => expect(screen.getByTestId('napster-mic')).toHaveTextContent('Escuchando…'), {
      timeout: 3000,
    });
    act(() => {
      fakeInstance.isUserTalking = false;
    });
    await waitFor(() => expect(screen.getByTestId('napster-mic')).toHaveTextContent('Micrófono listo'), {
      timeout: 3000,
    });
  });

  it('el botón del micrófono silencia y reactiva en vivo', async () => {
    await startLiveSession();
    const mic = screen.getByTestId('napster-mic');
    expect(mic.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(mic);
    expect(fakeInstance.muteMic).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('napster-mic').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('napster-mic'));
    expect(fakeInstance.unmuteMic).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('napster-mic').getAttribute('aria-pressed')).toBe('false');
  });

  it('sin permiso muestra ayuda, reintento y «Prefiero leer»', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(SESSION, 200))
      .mockResolvedValueOnce(jsonResponse({ ...SESSION, socketUrl: SOCKET_URL }, 200));
    mount();
    fireEvent.click(screen.getByTestId('napster-avatar-start'));
    await waitFor(() => expect(initMock).toHaveBeenCalledTimes(1));
    act(() => {
      capturedConfig?.onSessionStatusChange?.('permissionBlocked');
    });
    expect(screen.getByTestId('napster-mic')).toHaveTextContent('Sin permiso de micrófono');
    expect(screen.getByText(/Activa el micrófono en el candado/)).toBeTruthy();
    expect(screen.getByTestId('napster-mic-retry')).toHaveTextContent('Reintentar');
    // «Prefiero leer» sigue abriendo el chat de texto.
    fireEvent.click(screen.getByTestId('napster-avatar-read-instead'));
    await screen.findByTestId('napster-avatar-text');
    expect(sockets).toHaveLength(1);
  });

  it('el reintento tras denegado abre otra sesión de video', async () => {
    await startConnecting();
    act(() => {
      capturedConfig?.onSessionStatusChange?.('permissionBlocked');
    });
    expect(screen.getByTestId('napster-mic')).toHaveTextContent('Sin permiso de micrófono');
    fireEvent.click(screen.getByTestId('napster-mic-retry'));
    await waitFor(() => expect(initMock).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('napster-mic')).toHaveTextContent('Micrófono listo');
    expect(screen.getByTestId('napster-avatar-preview')).toBeTruthy();
    act(() => {
      capturedConfig?.onAvatarReady?.(true);
    });
    await screen.findByTestId('napster-avatar-end');
  });

  it('un error con la sesión viva muestra error con reintento sin navegar', async () => {
    await startLiveSession();
    act(() => {
      capturedConfig?.onError?.(new Error('mic roto'));
    });
    expect(screen.getByTestId('napster-avatar-live')).toBeTruthy();
    expect(screen.getByTestId('napster-mic')).toHaveTextContent('Problemas con el micrófono');
    fireEvent.click(screen.getByTestId('napster-mic-retry'));
    await waitFor(() => expect(initMock).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('napster-mic')).toHaveTextContent('Micrófono listo');
  });

  it('el título usa el nombre de la sesión cuando lo trae', async () => {
    vi.spyOn(api, 'createAvatarSession').mockResolvedValue({
      ...SESSION,
      avatar: { firstName: 'Elena' },
    } as unknown as AvatarSessionResponse);
    mount();
    expect(screen.getByText('Hola, soy tu guía de Somos Panas')).toBeTruthy();
    fireEvent.click(screen.getByTestId('napster-avatar-start'));
    await waitFor(() => expect(initMock).toHaveBeenCalledTimes(1));
    act(() => {
      capturedConfig?.onAvatarReady?.(true);
    });
    await screen.findByTestId('napster-avatar-end');
    fireEvent.click(screen.getByTestId('napster-avatar-end'));
    await screen.findByTestId('napster-avatar-start');
    expect(screen.getByText('Hola, soy Elena, tu guía de Somos Panas')).toBeTruthy();
  });

  it('el título existe en inglés con y sin nombre', () => {
    expect(avatarCatalog.en.welcomeTitle(undefined)).toBe('Hi, I am your Somos Panas guide');
    expect(avatarCatalog.en.welcomeTitle('Elena')).toBe('Hi, I am Elena, your Somos Panas guide');
    expect(avatarCatalog.es.welcomeTitle(undefined)).toBe('Hola, soy tu guía de Somos Panas');
  });

  it('en inglés se ve el título, el sello y el micrófono denegado', async () => {
    localStorage.setItem('fp_locale', 'en');
    fetchMock.mockResolvedValue(jsonResponse({ ...SESSION, lang: 'en' }, 200));
    mount();
    expect(screen.getByText('Hi, I am your Somos Panas guide')).toBeTruthy();
    fireEvent.click(screen.getByTestId('napster-avatar-start'));
    await waitFor(() => expect(initMock).toHaveBeenCalledTimes(1));
    act(() => {
      capturedConfig?.onSessionStatusChange?.('permissionBlocked');
    });
    expect(screen.getByTestId('napster-mic')).toHaveTextContent('No microphone permission');
    expect(screen.getByText(/Turn the microphone on in the lock icon/)).toBeTruthy();
    expect(screen.getByTestId('napster-mic-retry')).toHaveTextContent('Retry');
    act(() => {
      capturedConfig?.onAvatarReady?.(true);
    });
    await screen.findByTestId('napster-avatar-end');
    expect(screen.getByTestId('napster-powered')).toHaveTextContent('Powered by Napster');
  });

  it('un solo aviso con dos tarjetas abre una sola sesión', async () => {
    const session = vi.spyOn(api, 'createAvatarSession').mockResolvedValue(SESSION as AvatarSessionResponse);
    mount(
      <>
        <NapsterAvatar />
        <NapsterAvatar />
      </>,
    );
    expect(screen.getAllByTestId('napster-avatar')).toHaveLength(2);
    document.dispatchEvent(new CustomEvent(AVATAR_OPEN_EVENT));
    await waitFor(() => expect(session).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getAllByTestId('napster-avatar')).toHaveLength(1));
    expect(initMock).toHaveBeenCalledTimes(1);
  });
});
