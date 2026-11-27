/**
 * NAP-F3 — avatar en la portada: consentimiento antes de init, idioma de la
 * página en getToken, 409/503/429, router integrado, subtítulos, StrictMode y
 * cierre con destroy + beacon. El SDK de Napster se mockea; sin red real.
 */
import React, { StrictMode, act } from 'react';
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
import { retryDelayMs } from '../components/avatar/useNapsterSession';

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
  token: 'tok-pana-1',
  handle: '123e4567-e89b-12d3-a456-426614174000',
  visitor: 'public',
  lang: 'es',
  agent: 'default',
};

interface Captured {
  getToken: (() => Promise<string>) | null;
  config: NapsterCompanionApiConfig | null;
}

describe('NapsterAvatar (NAP-F3)', () => {
  const fetchMock = vi.fn();
  const sendBeacon = vi.fn();
  const captured: Captured = { getToken: null, config: null };
  const fakeInstance = {
    destroy: vi.fn(),
    sendCommand: vi.fn(),
  } as unknown as NapsterCompanionApiInstance;

  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    fetchMock.mockReset();
    sendBeacon.mockReset();
    captured.getToken = null;
    captured.config = null;
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(window.navigator, 'sendBeacon', { value: sendBeacon, configurable: true });
    sendBeacon.mockReturnValue(true);
    Element.prototype.scrollIntoView = vi.fn();
    // Imita al SDK real: getToken dentro de init; si falla, onError y rechazo.
    initMock.mockImplementation(async (getToken, config) => {
      captured.getToken = getToken;
      captured.config = config ?? null;
      try {
        await getToken();
      } catch (error) {
        config?.onError?.(error as Error);
        throw error;
      }
      return fakeInstance;
    });
  });

  afterEach(() => {
    // NAP-F3: desmontar antes de des-stubbear (los afterEach corren en orden
    // inverso al registro), así el cierre usa sendBeacon/fetch mockeados.
    cleanup();
    vi.unstubAllGlobals();
    Object.defineProperty(window.navigator, 'sendBeacon', { value: undefined, configurable: true });
  });

  function mount(node: React.ReactNode = <NapsterAvatar />) {
    return render(<I18nProvider>{node}</I18nProvider>);
  }

  async function startLiveSession(): Promise<void> {
    fetchMock.mockResolvedValue(jsonResponse(SESSION, 200));
    mount();
    fireEvent.click(screen.getByTestId('napster-avatar-start'));
    await waitFor(() => expect(initMock).toHaveBeenCalledTimes(1));
    act(() => {
      captured.config?.onAvatarReady?.(true);
    });
    await screen.findByTestId('napster-avatar-end');
  }

  it('sin clic no hay init, micrófono ni red', () => {
    const getUserMedia = vi.fn();
    Object.defineProperty(window.navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    });
    mount();
    expect(screen.getByTestId('napster-avatar-start')).toBeTruthy();
    expect(initMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('tras el clic, getToken llama al endpoint con el idioma de la página', async () => {
    fetchMock.mockResolvedValue(jsonResponse(SESSION, 200));
    mount();
    fireEvent.click(screen.getByTestId('napster-avatar-start'));
    await waitFor(() => expect(initMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/avatar-session');
    expect(JSON.parse(init.body as string)).toEqual({ lang: 'es', intent: 'create' });
    const [, config] = initMock.mock.calls[0] as [unknown, NapsterCompanionApiConfig];
    expect(config.layout?.type).toBe('inline');
    expect(config.layout?.mountContainer).toBe(screen.getByTestId('napster-avatar-video'));
  });

  it('getToken usa inglés cuando la página está en inglés', async () => {
    Object.defineProperty(window.navigator, 'language', { value: 'en-US', configurable: true });
    Object.defineProperty(window.navigator, 'languages', { value: ['en-US'], configurable: true });
    fetchMock.mockResolvedValue(jsonResponse({ ...SESSION, lang: 'en' }, 200));
    mount();
    fireEvent.click(screen.getByTestId('napster-avatar-start'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ lang: 'en', intent: 'create' });
  });

  it('409 muestra el respaldo con los cuatro pasos y el mensaje amable', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'avatar_busy' }, 409));
    mount();
    fireEvent.click(screen.getByTestId('napster-avatar-start'));
    await screen.findByTestId('napster-avatar-fallback');
    expect(screen.getByText('Las salas de video están llenas ahora mismo')).toBeTruthy();
    expect(screen.getByTestId('napster-avatar-tutorial').querySelectorAll('li')).toHaveLength(4);
    expect(screen.getByText('Crea tu espacio')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('503 muestra el respaldo genérico con los cuatro pasos', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'avatar_no_credits' }, 503));
    mount();
    fireEvent.click(screen.getByTestId('napster-avatar-start'));
    await screen.findByTestId('napster-avatar-fallback');
    expect(screen.getByText('El video no está disponible ahora mismo')).toBeTruthy();
    expect(screen.getByTestId('napster-avatar-tutorial').querySelectorAll('li')).toHaveLength(4);
  });

  it('429 espera Retry-After y reintenta una sola vez', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: 'avatar_rate_limited', retryAfterSec: 1 }, 429))
      .mockResolvedValueOnce(jsonResponse(SESSION, 200));
    mount();
    fireEvent.click(screen.getByTestId('napster-avatar-start'));
    // El reintento completa antes de marcar la sesión lista.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2), { timeout: 5000 });
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      lang: 'es',
      intent: 'create',
    });
    await waitFor(() => expect(initMock).toHaveBeenCalledTimes(1));
    act(() => {
      captured.config?.onAvatarReady?.(true);
    });
    await screen.findByTestId('napster-avatar-end', undefined, { timeout: 5000 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 10000);

  it('retryDelayMs aplica el tope de 5 s', () => {
    expect(retryDelayMs(2)).toBe(2000);
    expect(retryDelayMs(600)).toBe(5000);
    expect(retryDelayMs(undefined)).toBe(1000);
  });

  it('«Prefiero leer» muestra el recorrido sin red ni SDK', () => {
    mount();
    fireEvent.click(screen.getByTestId('napster-avatar-read'));
    expect(screen.getByTestId('napster-avatar-fallback')).toBeTruthy();
    expect(screen.getByTestId('napster-avatar-tutorial').querySelectorAll('li')).toHaveLength(4);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(initMock).not.toHaveBeenCalled();
  });

  it('los subtítulos anuncian lo que dice cada lado (aria-live)', async () => {
    await startLiveSession();
    const onData = captured.config?.onData;
    expect(onData).toBeTypeOf('function');
    act(() => {
      onData?.({
        event: 'message_received',
        data: { message: { action: 'completed', content: 'Bienvenido a Somos Panas', role: 'assistant' } },
      } as unknown as ServerEvent);
      onData?.({
        event: 'message_received',
        data: { message: { action: 'completed', content: 'Quiero ver eventos', role: 'user' } },
      } as unknown as ServerEvent);
    });
    const captions = screen.getByTestId('napster-avatar-captions');
    expect(captions.getAttribute('aria-live')).toBe('polite');
    expect(screen.getByText('Bienvenido a Somos Panas')).toBeTruthy();
    expect(screen.getByText('Quiero ver eventos')).toBeTruthy();
    expect(screen.getByText(/Tu pana guía:/)).toBeTruthy();
    expect(screen.getByText(/Tú:/)).toBeTruthy();
  });

  it('una tool del público se ejecuta y responde por send_function_output sin URLs', async () => {
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
    await startLiveSession();
    act(() => {
      captured.config?.onData?.({
        event: 'function_implicitly_called',
        data: { call_id: 'call-1', name: 'list_open_events', arguments: {} },
      } as unknown as ServerEvent);
    });
    await waitFor(() => expect(fakeInstance.sendCommand).toHaveBeenCalledTimes(1));
    const [command] = (fakeInstance.sendCommand as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      { type: string; data: { call_id: string; output: unknown } },
    ];
    expect(command.type).toBe('send_function_output');
    expect(command.data.call_id).toBe('call-1');
    expect(command.data.output).toEqual({
      events: [{ ref: 1, title: 'Asado pana', startsAt: '2026-12-01T18:00:00.000Z', place: 'Quito', siteName: 'Vecinos' }],
    });
  });

  it('«Terminar» destruye, avisa el cierre y vuelve a la bienvenida', async () => {
    await startLiveSession();
    fireEvent.click(screen.getByTestId('napster-avatar-end'));
    await screen.findByTestId('napster-avatar-start');
    expect(fakeInstance.destroy).toHaveBeenCalled();
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon.mock.calls[0][0]).toBe('/api/avatar-session/end');
  });

  it('destroy + beacon al desmontar con sesión viva', async () => {
    await startLiveSession();
    const view = screen.getByTestId('napster-avatar-live');
    expect(view).toBeTruthy();
    cleanup();
    expect(fakeInstance.destroy).toHaveBeenCalled();
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon.mock.calls[0][0]).toBe('/api/avatar-session/end');
  });

  it('doble montaje de StrictMode no crea dos sesiones', async () => {
    fetchMock.mockResolvedValue(jsonResponse(SESSION, 200));
    const view = mount(
      <StrictMode>
        <NapsterAvatar />
      </StrictMode>,
    );
    fireEvent.click(screen.getByTestId('napster-avatar-start'));
    await waitFor(() => expect(initMock).toHaveBeenCalledTimes(1));
    act(() => {
      captured.config?.onAvatarReady?.(true);
    });
    await screen.findByTestId('napster-avatar-end');
    expect(initMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(fakeInstance.destroy).toHaveBeenCalledTimes(1);
  });

  it('pagehide destruye y avisa el cierre', async () => {
    await startLiveSession();
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(fakeInstance.destroy).toHaveBeenCalled();
    expect(sendBeacon).toHaveBeenCalledTimes(1);
  });

  it('el cambio de sección avisa al agente con mensaje de sistema sin respuesta', async () => {
    let observerCallback: IntersectionObserverCallback | null = null;
    class FakeObserver {
      constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback;
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    try {
      const section = document.createElement('div');
      section.id = 'portal-section-eventos-publicos';
      document.body.appendChild(section);
      await startLiveSession();
      expect(observerCallback).toBeTypeOf('function');
      (fakeInstance.sendCommand as unknown as ReturnType<typeof vi.fn>).mockClear();
      act(() => {
        observerCallback?.(
          [{ isIntersecting: true, target: section } as unknown as IntersectionObserverEntry],
          {} as IntersectionObserver,
        );
      });
      expect(fakeInstance.sendCommand).toHaveBeenCalledTimes(1);
      const [command] = (fakeInstance.sendCommand as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
        { type: string; data: { role: string; text: string; trigger_response: boolean } },
      ];
      expect(command.type).toBe('send_message');
      expect(command.data.role).toBe('system');
      expect(command.data.trigger_response).toBe(false);
      expect(command.data.text).toContain('los eventos públicos');
      section.remove();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
