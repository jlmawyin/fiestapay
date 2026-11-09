import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceInvitationAgent } from '../components/voice/VoiceInvitationAgent';
import { PublicChatAssistant } from '../components/chat/PublicChatAssistant';
import { api } from '../api/client';
import { I18nProvider } from '../i18n/I18nContext';
import { setActiveLocale } from '../i18n/locale-store';
import type { Capabilities, Guest } from '../types';

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
}

const capsGeminiVoice: Capabilities = {
  voice: true,
  voiceProvider: 'gemini',
  chat: false,
  paypal: false,
  paypalClientId: null,
  sandbox: true,
  email: false,
};
const capsLegacyVoice: Capabilities = {
  voice: true,
  chat: false,
  paypal: false,
  paypalClientId: null,
  sandbox: true,
  email: false,
};
const guest: Guest = {
  id: 'guest-consent',
  name: 'Invitado demo',
  status: 'yes',
  companions: 0,
  paidCents: 0,
  dueCents: 2500,
};

function resetLocale() {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
  document.documentElement.lang = 'es';
  setActiveLocale('es');
}

beforeEach(() => {
  MockSocket.instances = [];
  resetLocale();
  const stream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
  vi.stubGlobal('WebSocket', MockSocket);
  vi.stubGlobal('AudioContext', MockAudioContext);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
  });
  vi.spyOn(api, 'getVoiceToken').mockResolvedValue({
    token: 'assembly-token',
    sessionConfig: {},
    maxSeconds: 60,
    leaseId: 'assembly-lease',
  } as never);
  vi.spyOn(api, 'markVoiceActivity').mockResolvedValue({ ok: true, active: true });
  vi.spyOn(api, 'releaseVoiceLease').mockResolvedValue({ ok: true, released: true, alreadyReleased: false });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetLocale();
});

function openGuestVoiceEs(caps: Capabilities) {
  render(
    <VoiceInvitationAgent slug="fiesta" capabilities={caps} guest={guest} onShowToast={vi.fn()} />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente de voz' }));
}

function openGuestVoiceEn(caps: Capabilities) {
  localStorage.setItem('fp_locale', 'en');
  render(
    <I18nProvider>
      <VoiceInvitationAgent slug="fiesta" capabilities={caps} guest={guest} onShowToast={vi.fn()} />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Open voice assistant' }));
}

describe('voice pre-start consent names the real provider', () => {
  it('ES guest with voiceProvider gemini consents to Gemini Live before any token', () => {
    openGuestVoiceEs(capsGeminiVoice);

    expect(screen.getByText('Acepto procesar mi audio con Gemini Live')).toBeInTheDocument();
    expect(screen.getByText('Gemini Live')).toBeInTheDocument();
    expect(screen.getByText('Agente de voz Gemini Live')).toBeInTheDocument();
    expect(screen.queryByText(/AssemblyAI/)).not.toBeInTheDocument();
    expect(api.getVoiceToken).not.toHaveBeenCalled();
  });

  it('ES guest with absent voiceProvider keeps the AssemblyAI consent', () => {
    openGuestVoiceEs(capsLegacyVoice);

    expect(screen.getByText('Acepto procesar mi audio con AssemblyAI')).toBeInTheDocument();
    expect(screen.queryByText(/Gemini/)).not.toBeInTheDocument();
    expect(api.getVoiceToken).not.toHaveBeenCalled();
  });

  it('EN guest with voiceProvider gemini consents to Gemini Live before any token', () => {
    openGuestVoiceEn(capsGeminiVoice);

    expect(screen.getByText('I consent to processing my audio with Gemini Live')).toBeInTheDocument();
    expect(screen.queryByText(/AssemblyAI/)).not.toBeInTheDocument();
    expect(api.getVoiceToken).not.toHaveBeenCalled();
  });

  it('EN guest with absent voiceProvider keeps the AssemblyAI consent', () => {
    openGuestVoiceEn(capsLegacyVoice);

    expect(screen.getByText('I consent to processing my audio with AssemblyAI')).toBeInTheDocument();
    expect(screen.queryByText(/Gemini/)).not.toBeInTheDocument();
    expect(api.getVoiceToken).not.toHaveBeenCalled();
  });

  it('ES public with voiceProvider gemini names Gemini Live before starting', () => {
    render(<VoiceInvitationAgent audience="public" capabilities={capsGeminiVoice} guest={null} onShowToast={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente de voz' }));

    expect(screen.getByText(/se procesa en tiempo real mediante Gemini Live/)).toBeInTheDocument();
    expect(screen.getByText('Acepto procesar mi audio con Gemini Live')).toBeInTheDocument();
    expect(screen.queryByText(/AssemblyAI/)).not.toBeInTheDocument();
  });

  it('ES organizer with voiceProvider gemini names Gemini Live before starting', () => {
    render(
      <VoiceInvitationAgent
        slug="fiesta"
        audience="organizer"
        capabilities={capsGeminiVoice}
        guest={null}
        onShowToast={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente de voz' }));

    expect(screen.getByText('Acepto procesar mi audio con Gemini Live')).toBeInTheDocument();
    expect(screen.getByText('Gemini Live')).toBeInTheDocument();
    expect(screen.queryByText(/AssemblyAI/)).not.toBeInTheDocument();
  });

  it('the token provider wins after start: gemini consent falls back to AssemblyAI audio', async () => {
    openGuestVoiceEs(capsGeminiVoice);
    expect(screen.getByText('Acepto procesar mi audio con Gemini Live')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Iniciar Conversación/ }));

    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0]!;
    socket.readyState = MockSocket.OPEN;
    await act(async () => {
      socket.onopen?.();
      await socket.onmessage?.({ data: JSON.stringify({ type: 'session.ready' }) });
    });

    expect(screen.getByText('Acepto procesar mi audio con AssemblyAI')).toBeInTheDocument();
    expect(screen.getByText('AssemblyAI Real-Time Voice Agent')).toBeInTheDocument();
    expect(screen.queryByText(/Gemini/)).not.toBeInTheDocument();
  });
});

describe('public chat privacy names the configured text provider', () => {
  it('names Gemini when llmProvider is gemini', () => {
    render(
      <PublicChatAssistant
        capabilities={{ ...capsLegacyVoice, chat: true, llmProvider: 'gemini' }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Abrir chat de FiestaPay' }));

    expect(screen.getByText(/Gemini procesa tus consultas para responder/)).toBeInTheDocument();
    expect(screen.queryByText(/OpenAI/)).not.toBeInTheDocument();
  });

  it('keeps OpenAI when llmProvider is openai', () => {
    render(
      <PublicChatAssistant
        capabilities={{ ...capsLegacyVoice, chat: true, llmProvider: 'openai' }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Abrir chat de FiestaPay' }));

    expect(screen.getByText(/OpenAI procesa tus consultas para responder/)).toBeInTheDocument();
    expect(screen.queryByText(/Gemini/)).not.toBeInTheDocument();
  });
});
