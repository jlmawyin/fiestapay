import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatMoney } from '@fiestapay/shared';
import { VoiceInvitationAgent } from '../components/voice/VoiceInvitationAgent';
import { api } from '../api/client';
import { I18nProvider } from '../i18n/I18nContext';
import { setActiveLocale } from '../i18n/locale-store';
import { pcm16ToBase64 } from '../voice/pcm';
import type {
  GeminiLiveCallbacks,
  GeminiLiveConnector,
  GeminiLiveSessionHandle,
  GeminiLiveToolResponse,
} from '../voice/gemini-live';
import type { Capabilities, Guest, Quote } from '../types';

interface FakeGeminiSession extends GeminiLiveSessionHandle {
  callbacks: GeminiLiveCallbacks;
  model: string;
  apiVersion: string;
  liveConfig: unknown;
  kickoffs: string[];
  audios: string[];
  toolResponses: GeminiLiveToolResponse[][];
  closeCalls: number;
}

function createFakeGemini() {
  const sessions: FakeGeminiSession[] = [];
  let nextFailure: unknown = null;
  const calls: Array<{ token: string; model: string; apiVersion: string }> = [];
  const connector: GeminiLiveConnector = async (options) => {
    calls.push({ token: options.token, model: options.model, apiVersion: options.apiVersion });
    if (nextFailure) {
      const failure = nextFailure;
      nextFailure = null;
      throw failure;
    }
    let closed = false;
    const session: FakeGeminiSession = {
      callbacks: options.callbacks,
      model: options.model,
      apiVersion: options.apiVersion,
      liveConfig: options.liveConfig,
      kickoffs: [],
      audios: [],
      toolResponses: [],
      closeCalls: 0,
      get closed() {
        return closed;
      },
      sendAudio: (base64: string) => {
        session.audios.push(base64);
      },
      sendKickoff: (text: string) => {
        session.kickoffs.push(text);
      },
      sendToolResponse: (responses: GeminiLiveToolResponse[]) => {
        session.toolResponses.push(responses);
      },
      close: () => {
        closed = true;
        session.closeCalls += 1;
      },
    };
    sessions.push(session);
    return session;
  };
  return {
    connector,
    sessions,
    calls,
    failNextConnect: (error: unknown) => {
      nextFailure = error;
    },
  };
}

class MockSocket {
  static OPEN = 1;
  static instances: MockSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => Promise<void>) | null = null;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = 3;
  });
  constructor() {
    MockSocket.instances.push(this);
  }
}

class MockSource {
  buffer: unknown = null;
  onended: (() => void) | null = null;
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn(() => {
    this.onended?.();
  });
}

class MockAudioContext {
  static sources: MockSource[] = [];
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
  createBufferSource = vi.fn(() => {
    const source = new MockSource();
    MockAudioContext.sources.push(source);
    return source;
  });
}

const capabilities: Capabilities = {
  voice: true,
  voiceProvider: 'gemini',
  chat: false,
  paypal: false,
  paypalClientId: null,
  sandbox: true,
  email: false,
};
const guest: Guest = {
  id: 'guest-gemini',
  name: 'Invitado demo',
  status: 'yes',
  companions: 0,
  paidCents: 0,
  dueCents: 2500,
};

const KICKOFF = 'Saluda al invitado en español.';
const GEMINI_LIVE_CONFIG = {
  responseModalities: ['AUDIO'],
  systemInstruction: 'Eres el asistente de voz.',
  speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
  inputAudioTranscription: {},
  outputAudioTranscription: {},
  tools: [{ functionDeclarations: [{ name: 'prepare_quote', description: 'Prepara una cotización' }] }],
};
const geminiGuestToken = {
  token: 'auth_tokens/fake-guest',
  sessionConfig: {
    provider: 'gemini',
    model: 'gemini-3.8-live',
    apiVersion: 'v1beta',
    liveConfig: GEMINI_LIVE_CONFIG,
    kickoff: KICKOFF,
    locale: 'es',
  },
  maxSeconds: 60,
  leaseId: 'gemini-lease-guest',
  audience: 'guest',
  provider: 'gemini',
} as const;
const geminiPublicToken = {
  token: 'auth_tokens/fake-public',
  sessionConfig: {
    provider: 'gemini',
    model: 'gemini-3.8-live',
    apiVersion: 'v1beta',
    liveConfig: { ...GEMINI_LIVE_CONFIG, tools: [] },
    kickoff: 'Saluda con información general.',
    locale: 'es',
  },
  maxSeconds: 60,
  leaseId: 'gemini-lease-public',
  audience: 'public',
  provider: 'gemini',
} as const;

const serverQuote: Quote = {
  id: 'quote-server-1',
  guestId: guest.id,
  people: 2,
  unitCents: 2500,
  totalCents: 5000,
  paidCents: 0,
  amountCents: 5000,
  summary: 'Cotización del servidor',
  expiresAt: '2099-01-01T00:00:00Z',
};

let stopTrack: ReturnType<typeof vi.fn>;
let getUserMedia: ReturnType<typeof vi.fn>;

async function flushMicrotasks(times = 30) {
  for (let index = 0; index < times; index += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

beforeEach(() => {
  MockSocket.instances = [];
  MockAudioContext.sources = [];
  localStorage.clear();
  setActiveLocale('es');
  stopTrack = vi.fn();
  const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
  getUserMedia = vi.fn().mockResolvedValue(stream);
  vi.stubGlobal('WebSocket', MockSocket);
  vi.stubGlobal('AudioContext', MockAudioContext);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  vi.spyOn(api, 'getVoiceToken').mockResolvedValue(geminiGuestToken as never);
  vi.spyOn(api, 'getPublicVoiceToken').mockResolvedValue(geminiPublicToken as never);
  vi.spyOn(api, 'getOrganizerVoiceToken').mockResolvedValue(geminiGuestToken as never);
  vi.spyOn(api, 'markVoiceActivity').mockResolvedValue({ ok: true, active: true });
  vi.spyOn(api, 'releaseVoiceLease').mockResolvedValue({ ok: true, released: true, alreadyReleased: false });
  vi.spyOn(api, 'executeVoiceTool').mockResolvedValue({ response: { ok: true } });
  vi.spyOn(api, 'executeOrganizerVoiceTool').mockResolvedValue({ response: { ok: true } });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  setActiveLocale('es');
});

function startGuestVoice(fake: ReturnType<typeof createFakeGemini>, onApplyQuote = vi.fn()) {
  render(
    <VoiceInvitationAgent
      slug="fiesta"
      capabilities={capabilities}
      guest={guest}
      onShowToast={vi.fn()}
      onApplyQuote={onApplyQuote}
      geminiLiveConnector={fake.connector}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente de voz' }));
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: /Iniciar Conversación/ }));
}

function startPublicVoice(fake: ReturnType<typeof createFakeGemini>) {
  render(
    <VoiceInvitationAgent
      audience="public"
      capabilities={capabilities}
      guest={null}
      onShowToast={vi.fn()}
      geminiLiveConnector={fake.connector}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente de voz' }));
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: /Escuchar información por voz/ }));
}

async function openGemini(fake: ReturnType<typeof createFakeGemini>): Promise<FakeGeminiSession> {
  await waitFor(() => expect(fake.sessions).toHaveLength(1));
  const session = fake.sessions[0]!;
  await act(async () => {
    session.callbacks.onOpen?.();
  });
  return session;
}

describe('Gemini Live voice transport', () => {
  it('sends the locked kickoff and shows the greeting transcript', async () => {
    const fake = createFakeGemini();
    startGuestVoice(fake);
    const session = await openGemini(fake);

    expect(fake.calls[0]).toMatchObject({ token: 'auth_tokens/fake-guest', model: 'gemini-3.8-live', apiVersion: 'v1beta' });
    expect(session.liveConfig).toEqual(GEMINI_LIVE_CONFIG);
    expect(session.kickoffs).toEqual([KICKOFF]);
    expect(screen.getByText('Escuchando tu voz...')).toBeInTheDocument();

    await act(async () => {
      session.callbacks.onOutputTranscript?.('Hola, soy tu asistente.');
    });
    expect(screen.getByText('Hola, soy tu asistente.')).toBeInTheDocument();
    expect(screen.getByText('Asistente (Gemini):')).toBeInTheDocument();
  });

  it('plays 24 kHz model audio and reports real playback activity', async () => {
    const fake = createFakeGemini();
    startGuestVoice(fake);
    const session = await openGemini(fake);

    const audio = pcm16ToBase64(new Int16Array([100, 200, 300, 400]));
    await act(async () => {
      session.callbacks.onAudio?.(audio, 'audio/pcm;rate=24000');
    });

    expect(MockAudioContext.sources.length).toBeGreaterThan(0);
    expect(screen.getByText('Asistente hablando...')).toBeInTheDocument();
    expect(api.markVoiceActivity).toHaveBeenCalledWith('gemini-lease-guest');
  });

  it('cuts the queue on barge-in without releasing the lease', async () => {
    const fake = createFakeGemini();
    startGuestVoice(fake);
    const session = await openGemini(fake);

    const audio = pcm16ToBase64(new Int16Array([100, 200, 300, 400]));
    await act(async () => {
      session.callbacks.onAudio?.(audio, 'audio/pcm;rate=24000');
    });
    expect(screen.getByText('Asistente hablando...')).toBeInTheDocument();
    const source = MockAudioContext.sources.at(-1)!;

    await act(async () => {
      session.callbacks.onInterrupted?.();
    });

    expect(source.stop).toHaveBeenCalled();
    expect(screen.getByText('Escuchando tu voz...')).toBeInTheDocument();
    expect(api.releaseVoiceLease).not.toHaveBeenCalled();
  });

  it('forwards each functionCall to the role endpoint and answers with the same id', async () => {
    const fake = createFakeGemini();
    vi.mocked(api.executeVoiceTool).mockResolvedValueOnce({
      response: { estado: 'PENDIENTE_DE_APROBACION', siguiente_paso: 'Aprueba en PayPal.' },
      quote: serverQuote,
      actions: ['rsvp:yes:1'],
    });
    const onApplyQuote = vi.fn();
    startGuestVoice(fake, onApplyQuote);
    const session = await openGemini(fake);

    await act(async () => {
      session.callbacks.onToolCalls?.([{ id: 'call-42', name: 'prepare_quote', args: { people: 2 } }]);
    });

    await waitFor(() =>
      expect(api.executeVoiceTool).toHaveBeenCalledWith('fiesta', {
        leaseId: 'gemini-lease-guest',
        name: 'prepare_quote',
        arguments: { people: 2 },
      }),
    );
    await waitFor(() => expect(session.toolResponses).toHaveLength(1));
    expect(session.toolResponses[0]).toEqual([
      {
        id: 'call-42',
        name: 'prepare_quote',
        response: { estado: 'PENDIENTE_DE_APROBACION', siguiente_paso: 'Aprueba en PayPal.' },
      },
    ]);
    expect(onApplyQuote).toHaveBeenCalledWith(serverQuote);
    expect(screen.getByText('Cotización Calculada')).toBeInTheDocument();
    expect(screen.getByText('Propuesta de Asistencia (Voz)')).toBeInTheDocument();
  });

  it('executes organizer tools without applying quotes or attendance', async () => {
    const fake = createFakeGemini();
    vi.mocked(api.executeOrganizerVoiceTool).mockResolvedValueOnce({ response: { summary: 'ok' } });
    const onApplyQuote = vi.fn();
    render(
      <VoiceInvitationAgent
        slug="fiesta"
        capabilities={capabilities}
        guest={null}
        audience="organizer"
        onShowToast={vi.fn()}
        onApplyQuote={onApplyQuote}
        onConfirmRsvp={vi.fn()}
        geminiLiveConnector={fake.connector}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente de voz' }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Iniciar Conversación/ }));
    const session = await openGemini(fake);
    await act(async () => {
      session.callbacks.onToolCalls?.([{ id: 'call-org', name: 'summarize', args: { scope: 'today' } }]);
    });

    await waitFor(() =>
      expect(api.executeOrganizerVoiceTool).toHaveBeenCalledWith('fiesta', {
        leaseId: 'gemini-lease-guest',
        name: 'summarize',
        arguments: { scope: 'today' },
      }),
    );
    await waitFor(() => expect(session.toolResponses).toHaveLength(1));
    expect(session.toolResponses[0]).toEqual([{ id: 'call-org', name: 'summarize', response: { summary: 'ok' } }]);
    expect(onApplyQuote).not.toHaveBeenCalled();
    expect(screen.queryByText('Cotización Calculada')).not.toBeInTheDocument();
    expect(screen.queryByText('Propuesta de Asistencia (Voz)')).not.toBeInTheDocument();
  });

  it('never executes tools for the public audience', async () => {
    const fake = createFakeGemini();
    startPublicVoice(fake);
    const session = await openGemini(fake);

    await act(async () => {
      session.callbacks.onToolCalls?.([{ id: 'call-public', name: 'prepare_quote', args: {} }]);
    });
    await flushMicrotasks(5);

    expect(api.executeVoiceTool).not.toHaveBeenCalled();
    expect(api.executeOrganizerVoiceTool).not.toHaveBeenCalled();
    expect(session.toolResponses).toHaveLength(0);
  });

  it('shows the PayPal approval card with the server amount and pending copy', async () => {
    const fake = createFakeGemini();
    vi.mocked(api.executeVoiceTool).mockResolvedValueOnce({
      response: { estado: 'PENDIENTE_DE_APROBACION' },
      quote: serverQuote,
    });
    const onApplyQuote = vi.fn();
    const anchor = document.createElement('div');
    anchor.setAttribute('data-testid', 'paypal-stepper');
    anchor.scrollIntoView = vi.fn();
    document.body.appendChild(anchor);
    try {
      startGuestVoice(fake, onApplyQuote);
      const session = await openGemini(fake);
      await act(async () => {
        session.callbacks.onToolCalls?.([{ id: 'call-pay', name: 'prepare_quote', args: {} }]);
      });

      const amount = formatMoney(serverQuote.amountCents, 'es');
      const approve = await screen.findByRole('button', { name: `Aprobar en PayPal ${amount}` });
      expect(approve).toBeInTheDocument();
      expect(
        screen.getByText('El pago queda pendiente hasta que lo apruebes en PayPal y el servidor verifique la captura.'),
      ).toBeInTheDocument();
      expect(document.body.textContent).not.toContain('pagado');

      fireEvent.click(approve);
      expect(onApplyQuote).toHaveBeenCalledWith(serverQuote);
      expect(anchor.scrollIntoView).toHaveBeenCalled();
    } finally {
      anchor.remove();
    }
  });

  it('shows the English PayPal approval card', async () => {
    localStorage.setItem('fp_locale', 'en');
    const fake = createFakeGemini();
    vi.mocked(api.executeVoiceTool).mockResolvedValueOnce({
      response: { estado: 'PENDIENTE_DE_APROBACION' },
      quote: serverQuote,
    });
    render(
      <I18nProvider>
        <VoiceInvitationAgent
          slug="fiesta"
          capabilities={capabilities}
          guest={guest}
          onShowToast={vi.fn()}
          geminiLiveConnector={fake.connector}
        />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open voice assistant' }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Start Voice Conversation/ }));
    const session = await openGemini(fake);
    await act(async () => {
      session.callbacks.onToolCalls?.([{ id: 'call-pay-en', name: 'prepare_quote', args: {} }]);
    });

    const amount = formatMoney(serverQuote.amountCents, 'en');
    expect(await screen.findByRole('button', { name: `Approve in PayPal ${amount}` })).toBeInTheDocument();
    expect(
      screen.getByText('Payment stays pending until you approve it in PayPal and the server verifies the capture.'),
    ).toBeInTheDocument();
  });

  it('closes on maxSeconds and releases the lease', async () => {
    vi.useFakeTimers();
    vi.mocked(api.getVoiceToken).mockResolvedValueOnce({ ...geminiGuestToken, maxSeconds: 3 } as never);
    const fake = createFakeGemini();
    startGuestVoice(fake);
    await flushMicrotasks(50);
    expect(fake.sessions).toHaveLength(1);
    const session = fake.sessions[0]!;
    await act(async () => {
      session.callbacks.onOpen?.();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_500);
    });

    expect(api.releaseVoiceLease).toHaveBeenCalledWith('gemini-lease-guest', 'limit', false);
    expect(stopTrack).toHaveBeenCalled();
    expect(session.closeCalls).toBeGreaterThan(0);
  });

  it('offers the text path when Live fails to connect', async () => {
    const fake = createFakeGemini();
    fake.failNextConnect(new Error('Live unreachable'));
    startGuestVoice(fake);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('continúa por texto');
    });
    expect(api.releaseVoiceLease).toHaveBeenCalledWith('gemini-lease-guest', 'start_failed', false);
    expect(MockSocket.instances).toHaveLength(0);
    expect(screen.getByRole('button', { name: /Iniciar Conversación/ })).toBeEnabled();
  });

  it('keeps AssemblyAI working when the token has no provider', async () => {
    vi.mocked(api.getVoiceToken).mockResolvedValueOnce({
      token: 'assembly-token',
      sessionConfig: {},
      maxSeconds: 60,
      leaseId: 'assembly-lease',
    } as never);
    const fake = createFakeGemini();
    startGuestVoice(fake);

    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    expect(fake.sessions).toHaveLength(0);
    const socket = MockSocket.instances[0]!;
    socket.readyState = MockSocket.OPEN;
    await act(async () => {
      socket.onopen?.();
      await socket.onmessage?.({ data: JSON.stringify({ type: 'session.ready' }) });
    });
    expect(screen.getByText('Escuchando tu voz...')).toBeInTheDocument();
    expect(JSON.parse(socket.send.mock.calls[0]?.[0] as string).type).toBe('session.update');
  });
});
