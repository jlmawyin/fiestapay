import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SHOW_ON_SCREEN_TOOL, type Locale } from '@fiestapay/shared';
import { App } from '../App';
import { I18nProvider } from '../i18n/I18nContext';
import { setActiveLocale } from '../i18n/locale-store';
import { AssistantOrb } from '../components/assistant/AssistantOrb';
import { VoiceWelcomeCard } from '../components/voice/VoiceWelcomeCard';
import { VoiceInvitationAgent } from '../components/voice/VoiceInvitationAgent';
import { api } from '../api/client';
import { registerGuideNavigator, showOnScreen, validateShowOnScreenArgs } from '../guide/showOnScreen';
import type { Capabilities } from '../types';
import type {
  GeminiLiveCallbacks,
  GeminiLiveSessionHandle,
  GeminiLiveToolResponse,
} from '../voice/gemini-live';

vi.mock('ag-grid-react', () => ({
  AgGridReact: ({ rowData }: { rowData: Array<{ id: string; name: string }> }) => (
    <table data-testid="judge-grid">
      <tbody>
        {rowData.map((row) => (
          <tr key={row.id}>
            <td>{row.name}</td>
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

interface FakeGeminiSession extends GeminiLiveSessionHandle {
  callbacks: GeminiLiveCallbacks;
  toolResponses: GeminiLiveToolResponse[][];
  closeCalls: number;
}

const fakeGeminiSessions: FakeGeminiSession[] = [];

vi.mock('../voice/gemini-live', async (importOriginal) => {
  const original = await importOriginal<typeof import('../voice/gemini-live')>();
  return {
    ...original,
    connectGeminiLive: async (options: { callbacks: GeminiLiveCallbacks }) => {
      let closed = false;
      const session: FakeGeminiSession = {
        callbacks: options.callbacks,
        toolResponses: [],
        closeCalls: 0,
        get closed() {
          return closed;
        },
        sendAudio: () => undefined,
        sendKickoff: () => undefined,
        sendToolResponse: (responses: GeminiLiveToolResponse[]) => {
          session.toolResponses.push(responses);
        },
        close: () => {
          closed = true;
          session.closeCalls += 1;
        },
      };
      fakeGeminiSessions.push(session);
      return session;
    },
  };
});

class MockSource {
  onended: (() => void) | null = null;
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn(() => {
    this.onended?.();
  });
}

class MockAudioContext {
  sampleRate = 48000;
  state = 'running';
  currentTime = 0;
  destination = {};
  close = vi.fn(async () => {
    this.state = 'closed';
  });
  resume = vi.fn(async () => undefined);
  createMediaStreamSource = vi.fn(() => ({ connect: vi.fn() }));
  createScriptProcessor = vi.fn(() => ({ connect: vi.fn(), onaudioprocess: null }));
  createGain = vi.fn(() => ({ connect: vi.fn(), gain: { value: 1 } }));
  createBuffer = vi.fn((_channels: number, length: number) => ({
    getChannelData: () => new Float32Array(length),
  }));
  createBufferSource = vi.fn(() => new MockSource());
}

const voiceCapabilities: Capabilities = {
  voice: true,
  voiceProvider: 'gemini',
  chat: false,
  paypal: false,
  paypalClientId: null,
  sandbox: true,
  email: false,
};

const silentCapabilities: Capabilities = { ...voiceCapabilities, voice: false };

function publicToken() {
  return {
    token: 'auth_tokens/fake-welcome',
    sessionConfig: {
      provider: 'gemini',
      model: 'gemini-3.8-live',
      apiVersion: 'v1beta',
      liveConfig: {
        responseModalities: ['AUDIO'],
        systemInstruction: 'Eres el asistente de voz.',
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        tools: [
          {
            functionDeclarations: [
              {
                name: SHOW_ON_SCREEN_TOOL,
                description: 'Opens one page and highlights one element.',
                parameters: { type: 'OBJECT', properties: {} },
              },
            ],
          },
        ],
      },
      kickoff: 'Saluda con información general.',
      locale: 'es',
    },
    maxSeconds: 60,
    leaseId: 'gemini-lease-welcome',
    audience: 'public',
    provider: 'gemini',
  } as const;
}

const CARD_COPY: Record<Locale, { title: string; lead: string; accept: string; consent: string }> = {
  es: {
    title: 'Conoce a tu anfitrión con IA',
    lead: 'Pulsa una vez y habla:',
    accept: '🎙 Aceptar y hablar',
    consent: 'Gemini Live procesa tu audio solo mientras hablas. El botón final siempre lo pulsas tú.',
  },
  en: {
    title: 'Meet your AI party host',
    lead: 'Tap once and just talk:',
    accept: '🎙 Accept and talk',
    consent: 'Gemini Live processes your audio only while you talk. You always press the final button.',
  },
};

const CARD_EXAMPLES: Record<Locale, string[]> = {
  es: [
    'Arma una parrillada para 10 a $15 cada uno',
    'Llévame a la demo para jueces',
    '¿Cómo funciona el pago con PayPal?',
  ],
  en: [
    'Build a BBQ for 10 at $15 each',
    'Take me to the judges demo',
    'How does the PayPal payment work?',
  ],
};

function stubVoiceTransports(): void {
  const stream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
  vi.stubGlobal('AudioContext', MockAudioContext);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
  });
  vi.spyOn(api, 'getPublicVoiceToken').mockResolvedValue(publicToken() as never);
  vi.spyOn(api, 'markVoiceActivity').mockResolvedValue({ ok: true, active: true });
  vi.spyOn(api, 'releaseVoiceLease').mockResolvedValue({ ok: true, released: true, alreadyReleased: false });
}

function renderApp(locale: Locale, path: string, capabilities: Capabilities): void {
  localStorage.setItem('fp_locale', locale);
  window.history.replaceState({}, '', path);
  vi.spyOn(api, 'getCapabilities').mockResolvedValue(capabilities);
  vi.spyOn(api, 'getOrganizerEvents').mockResolvedValue({ events: [] });
  render(
    <I18nProvider>
      <App />
    </I18nProvider>,
  );
}

beforeEach(() => {
  fakeGeminiSessions.length = 0;
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
  document.documentElement.lang = 'es';
  setActiveLocale('es');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  registerGuideNavigator(null);
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
  document.documentElement.lang = 'es';
  setActiveLocale('es');
});

describe.each(['es', 'en'] as const)('FP-WELCOME-1 tarjeta de bienvenida (%s)', (locale) => {
  const copy = CARD_COPY[locale];

  it('muestra título, ejemplos, botón y consentimiento en portada y demo', async () => {
    renderApp(locale, '/', voiceCapabilities);
    expect(await screen.findByTestId('voice-welcome-card')).toBeInTheDocument();
    expect(screen.getByText(copy.title)).toBeInTheDocument();
    expect(screen.getByText(copy.lead)).toBeInTheDocument();
    for (const example of CARD_EXAMPLES[locale]) {
      expect(screen.getByText(example)).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: copy.accept })).toBeInTheDocument();
    expect(screen.getByText(copy.consent)).toBeInTheDocument();
    cleanup();

    localStorage.setItem('fp_locale', locale);
    window.history.replaceState({}, '', '/demo');
    vi.spyOn(api, 'getCapabilities').mockResolvedValue(voiceCapabilities);
    vi.spyOn(api, 'getOrganizerEvents').mockResolvedValue({ events: [] });
    render(
      <I18nProvider>
        <App />
      </I18nProvider>,
    );
    expect(await screen.findByTestId('voice-welcome-card')).toBeInTheDocument();
    expect(screen.getByText(copy.title)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.accept })).toBeInTheDocument();
  });

  it('no inicia el micrófono ni pide token sin clic', async () => {
    stubVoiceTransports();
    renderApp(locale, '/', voiceCapabilities);
    expect(await screen.findByTestId('voice-welcome-card')).toBeInTheDocument();
    expect(api.getPublicVoiceToken).not.toHaveBeenCalled();
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it('el clic abre la voz con consentimiento y arranca una sola sesión', async () => {
    stubVoiceTransports();
    const onShowToast = vi.fn();
    localStorage.setItem('fp_locale', locale);
    render(
      <I18nProvider>
        <VoiceWelcomeCard />
        <AssistantOrb audience="public" capabilities={voiceCapabilities} onShowToast={onShowToast} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: copy.accept }));

    expect(await screen.findByRole('tabpanel', { name: locale === 'es' ? 'Hablar' : 'Talk' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeChecked();
    await waitFor(() => expect(api.getPublicVoiceToken).toHaveBeenCalledTimes(1));
    expect(api.getPublicVoiceToken).toHaveBeenCalledWith('landing');
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(fakeGeminiSessions).toHaveLength(1));
    await act(async () => {
      fakeGeminiSessions[0]!.callbacks.onOpen?.();
    });
    expect(
      locale === 'es' ? screen.getByText('Escuchando tu voz...') : screen.getByText('Listening to your voice...'),
    ).toBeInTheDocument();
    expect(api.getPublicVoiceToken).toHaveBeenCalledTimes(1);
  });

  it('se oculta con × y recuerda la decisión en la pestaña', async () => {
    renderApp(locale, '/', voiceCapabilities);
    expect(await screen.findByTestId('voice-welcome-card')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: locale === 'es' ? 'Ocultar tarjeta de bienvenida por voz' : 'Dismiss voice welcome card' }));
    expect(screen.queryByTestId('voice-welcome-card')).toBeNull();
    expect(sessionStorage.getItem('fp_voice_welcome_dismissed')).toBe('1');

    cleanup();
    renderApp(locale, '/', voiceCapabilities);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByTestId('voice-welcome-card')).toBeNull();
  });

  it('sin voz disponible muestra el aviso habitual y no reintenta', async () => {
    stubVoiceTransports();
    const onShowToast = vi.fn();
    localStorage.setItem('fp_locale', locale);
    render(
      <I18nProvider>
        <VoiceWelcomeCard />
        <AssistantOrb audience="public" capabilities={silentCapabilities} onShowToast={onShowToast} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: copy.accept }));

    expect(await screen.findByRole('tabpanel', { name: locale === 'es' ? 'Hablar' : 'Talk' })).toBeInTheDocument();
    expect(api.getPublicVoiceToken).not.toHaveBeenCalled();
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    await waitFor(() => expect(onShowToast).toHaveBeenCalled());
    expect(api.getPublicVoiceToken).not.toHaveBeenCalled();
  });

  it('no se muestra en portada ni demo cuando la voz está desactivada', async () => {
    renderApp(locale, '/', silentCapabilities);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByTestId('voice-welcome-card')).toBeNull();
    expect(screen.queryByText(copy.consent)).toBeNull();
  });
});

describe('FP-WELCOME-1 sentence de fillWithAi', () => {
  it('valida sentence solo con fillWithAi y entre 3 y 400 caracteres', () => {
    expect(validateShowOnScreenArgs({ target: 'fillWithAi', sentence: 'Parrillada para 10' })).toEqual({
      ok: true,
      args: { target: 'fillWithAi', sentence: 'Parrillada para 10' },
    });
    expect(validateShowOnScreenArgs({ target: 'fillWithAi' })).toEqual({
      ok: true,
      args: { target: 'fillWithAi' },
    });
    expect(validateShowOnScreenArgs({ target: 'paymentDemo', sentence: 'Parrillada para 10' })).toEqual({ ok: false });
    expect(validateShowOnScreenArgs({ sentence: 'Parrillada para 10' })).toEqual({ ok: false });
    expect(validateShowOnScreenArgs({ target: 'fillWithAi', sentence: '' })).toEqual({ ok: false });
    expect(validateShowOnScreenArgs({ target: 'fillWithAi', sentence: '  ab  ' })).toEqual({ ok: false });
    expect(validateShowOnScreenArgs({ target: 'fillWithAi', sentence: 'x'.repeat(401) })).toEqual({ ok: false });
    expect(validateShowOnScreenArgs({ target: 'fillWithAi', sentence: 42 })).toEqual({ ok: false });
    expect(validateShowOnScreenArgs({ target: 'fillWithAi', sentence: null })).toEqual({ ok: false });
  });

  it('prefill en Crear sin llamar a la IA, resalta y no pulsa', async () => {
    const draftEvent = vi.spyOn(api, 'draftEvent');
    renderApp('es', '/', voiceCapabilities);
    await screen.findByTestId('voice-welcome-card');

    const sentence = 'Arma una parrillada para 10 a $15 cada uno';
    const result = await showOnScreen({ target: 'fillWithAi', sentence });
    expect(result).toEqual({ ok: true, page: 'create', target: 'fillWithAi' });
    expect(window.location.pathname).toBe('/create');

    const input = (await screen.findByLabelText('Describe tu invitación en una frase')) as HTMLInputElement;
    expect(input.value).toBe(sentence);
    expect(draftEvent).not.toHaveBeenCalled();

    const fillButton = screen.getByRole('button', { name: 'Rellenar con IA' });
    expect(fillButton).toHaveAttribute('data-guide', 'fillWithAi');
    expect(await screen.findByTestId('guide-ring')).toBeInTheDocument();
    expect(screen.getByTestId('guide-bubble')).toHaveTextContent('Pulsa aquí para que la IA arme tu fiesta');

    const clicks = vi.fn();
    fillButton.addEventListener('click', clicks);
    expect(clicks).not.toHaveBeenCalled();
  });

  it('sin sentence solo resalta y no escribe nada', async () => {
    renderApp('es', '/', voiceCapabilities);
    await screen.findByTestId('voice-welcome-card');

    const result = await showOnScreen({ target: 'fillWithAi' });
    expect(result).toEqual({ ok: true, page: 'create', target: 'fillWithAi' });
    const input = (await screen.findByLabelText('Describe tu invitación en una frase')) as HTMLInputElement;
    expect(input.value).toBe('');
    expect(await screen.findByTestId('guide-ring')).toBeInTheDocument();
  });

  it('sentence inválida no navega', async () => {
    renderApp('es', '/', voiceCapabilities);
    await screen.findByTestId('voice-welcome-card');

    await expect(showOnScreen({ target: 'paymentDemo', sentence: 'Parrillada para 10' })).resolves.toEqual({
      ok: false,
      reason: 'invalid_args',
    });
    await expect(showOnScreen({ target: 'fillWithAi', sentence: 'no' })).resolves.toEqual({
      ok: false,
      reason: 'invalid_args',
    });
    expect(window.location.pathname).toBe('/');
    expect(screen.queryByTestId('guide-ring')).toBeNull();
  });

  it('ignora el caption del modelo con fillWithAi y usa el fijo (EN)', async () => {
    renderApp('en', '/', voiceCapabilities);
    await screen.findByTestId('voice-welcome-card');

    const result = await showOnScreen({ target: 'fillWithAi', sentence: 'BBQ for 10 at $15 each', caption: 'Filling the party details with AI' });
    expect(result).toEqual({ ok: true, page: 'create', target: 'fillWithAi' });
    const bubble = await screen.findByTestId('guide-bubble');
    expect(bubble).toHaveTextContent('Tap here to let the AI build your party');
    expect(bubble).not.toHaveTextContent('Filling the party details with AI');
  });

  it('ignora el caption del modelo con fillWithAi y usa el fijo (ES)', async () => {
    renderApp('es', '/', voiceCapabilities);
    await screen.findByTestId('voice-welcome-card');

    const result = await showOnScreen({ target: 'fillWithAi', sentence: 'Parrillada para 10 a $15 cada uno', caption: 'Rellenando tu fiesta con IA' });
    expect(result).toEqual({ ok: true, page: 'create', target: 'fillWithAi' });
    const bubble = await screen.findByTestId('guide-bubble');
    expect(bubble).toHaveTextContent('Pulsa aquí para que la IA arme tu fiesta');
    expect(bubble).not.toHaveTextContent('Rellenando tu fiesta con IA');
  });
});

describe('FP-WELCOME-1 la voz sigue viva en Crear', () => {
  it('una navegación demo → Crear no cierra la sesión pública con guía', async () => {
    stubVoiceTransports();
    const view = render(
      <VoiceInvitationAgent
        audience="public"
        context="demo"
        capabilities={voiceCapabilities}
        guest={null}
        onShowToast={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente de voz' }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Escuchar información por voz/ }));
    await waitFor(() => expect(fakeGeminiSessions).toHaveLength(1));
    await act(async () => {
      fakeGeminiSessions[0]!.callbacks.onOpen?.();
    });
    expect(screen.getByText('Escuchando tu voz...')).toBeInTheDocument();

    view.rerender(
      <VoiceInvitationAgent
        audience="public"
        context="landing"
        capabilities={voiceCapabilities}
        guest={null}
        onShowToast={vi.fn()}
      />,
    );

    expect(screen.getByText('Escuchando tu voz...')).toBeInTheDocument();
    expect(fakeGeminiSessions[0]!.closeCalls).toBe(0);
    expect(api.releaseVoiceLease).not.toHaveBeenCalled();
  });
});
