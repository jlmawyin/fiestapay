import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UI_LABELS } from '@fiestapay/shared';
import { VoiceInvitationAgent } from '../components/voice/VoiceInvitationAgent';
import { api } from '../api/client';
import { I18nProvider, useI18n } from '../i18n/I18nContext';
import { setActiveLocale } from '../i18n/locale-store';
import {
  SpanishSpeechFallback,
  pickEnglishVoice,
  pickVoiceForLocale,
} from '../voice/fallback-speech';
import { friendlyVoiceError } from '../voice/lifecycle';
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
  close = vi.fn(() => { this.readyState = 3; });
  constructor() { MockSocket.instances.push(this); }
}

class MockAudioContext {
  sampleRate = 48000;
  state = 'running';
  currentTime = 0;
  destination = {};
  close = vi.fn(async () => { this.state = 'closed'; });
  resume = vi.fn(async () => undefined);
  createMediaStreamSource = vi.fn(() => ({ connect: vi.fn() }));
  createScriptProcessor = vi.fn(() => ({ connect: vi.fn(), onaudioprocess: null }));
  createGain = vi.fn(() => ({ connect: vi.fn(), gain: { value: 1 } }));
}

const capabilities: Capabilities = { voice: true, chat: false, paypal: false, paypalClientId: null, sandbox: true, email: false };
const guest: Guest = { id: 'guest-locale', name: 'Locale Guest', status: 'yes', companions: 0, paidCents: 0, dueCents: 2500 };
const token = { token: 'locale-token', leaseId: 'locale-lease', sessionConfig: {}, maxSeconds: 60 };

function LocaleSwitch(): React.ReactElement {
  const { setLocale } = useI18n();
  return (
    <button type="button" onClick={() => setLocale('es')}>
      switch-to-es
    </button>
  );
}

beforeEach(() => {
  MockSocket.instances = [];
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
  document.documentElement.lang = 'es';
  setActiveLocale('es');
  const stream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
  vi.stubGlobal('WebSocket', MockSocket);
  vi.stubGlobal('AudioContext', MockAudioContext);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
  vi.spyOn(api, 'getVoiceToken').mockResolvedValue(token);
  vi.spyOn(api, 'markVoiceActivity').mockResolvedValue({ ok: true, active: true });
  vi.spyOn(api, 'releaseVoiceLease').mockResolvedValue({ ok: true, released: true, alreadyReleased: false });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
  document.documentElement.lang = 'es';
  setActiveLocale('es');
});

describe('voice locale switch with an active session', () => {
  it('stops through the Stop path: lease released, mic closed, restart asked in the new language', async () => {
    localStorage.setItem('fp_locale', 'en');
    const onShowToast = vi.fn();
    render(
      <I18nProvider>
        <LocaleSwitch />
        <VoiceInvitationAgent slug="fiesta" capabilities={capabilities} guest={guest} onShowToast={onShowToast} />
      </I18nProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open voice assistant' }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: UI_LABELS.en.startVoice }));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    socket.readyState = MockSocket.OPEN;
    await act(async () => {
      socket.onopen?.();
      await socket.onmessage?.({ data: JSON.stringify({ type: 'session.ready' }) });
    });
    expect(screen.getByText('Listening to your voice...')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'switch-to-es' }));

    await waitFor(() =>
      expect(api.releaseVoiceLease).toHaveBeenCalledWith('locale-lease', 'locale_change', false)
    );
    expect(socket.close).toHaveBeenCalled();
    await waitFor(() =>
      expect(onShowToast).toHaveBeenCalledWith(
        'info',
        'El idioma cambió. La sesión de voz se detuvo; inicia una nueva conversación en el idioma actual.',
        'Sesión de voz'
      )
    );
    // Consent was reset, so starting again requires a new explicit check.
    expect(screen.getByRole('button', { name: UI_LABELS.es.startVoice })).toBeDisabled();
    expect(screen.getByText(/Debes marcar la casilla de consentimiento/)).toBeInTheDocument();
  });

  it('does not release anything when the language changes with no active session', async () => {
    localStorage.setItem('fp_locale', 'en');
    render(
      <I18nProvider>
        <LocaleSwitch />
        <VoiceInvitationAgent slug="fiesta" capabilities={capabilities} guest={guest} onShowToast={vi.fn()} />
      </I18nProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open voice assistant' }));
    fireEvent.click(screen.getByRole('button', { name: 'switch-to-es' }));
    expect(api.releaseVoiceLease).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: UI_LABELS.es.startVoice })).toBeInTheDocument();
  });
});

describe('English browser-voice fallback', () => {
  const voices = [
    { lang: 'es-ES', name: 'Spanish' },
    { lang: 'en-GB', name: 'English UK' },
    { lang: 'en-US', name: 'English US' },
    { lang: 'fr-FR', name: 'French' },
  ] as SpeechSynthesisVoice[];

  it('prefers en-US, then any English voice, and stays silent without one', () => {
    expect(pickEnglishVoice(voices)?.lang).toBe('en-US');
    expect(pickEnglishVoice(voices.filter((v) => v.lang !== 'en-US'))?.lang).toBe('en-GB');
    expect(pickEnglishVoice(voices.filter((v) => !v.lang.startsWith('en')))).toBeNull();
    expect(pickVoiceForLocale(voices, 'en')?.lang).toBe('en-US');
    expect(pickVoiceForLocale(voices, 'es')?.lang).toBe('es-ES');
  });

  it('speaks English with an English voice and never with a Spanish voice', () => {
    const speak = vi.fn();
    const synth = {
      speaking: false,
      cancel: vi.fn(),
      speak,
      getVoices: () => voices,
    };
    const fallback = new SpanishSpeechFallback(synth, (text) => ({ text, lang: '', rate: 1, voice: null }));
    expect(fallback.speak('Hello', 'en')).toBe(true);
    const utterance = speak.mock.calls[0][0] as { lang: string; voice: SpeechSynthesisVoice };
    expect(utterance.voice.lang).toBe('en-US');
    expect(utterance.lang).toBe('en-US');

    const spanishOnly = new SpanishSpeechFallback(
      { ...synth, getVoices: () => voices.filter((v) => v.lang.startsWith('es')) },
      (text) => ({ text, lang: '', rate: 1, voice: null })
    );
    const silent = vi.fn();
    const silentFallback = new SpanishSpeechFallback(
      { speaking: false, cancel: vi.fn(), speak: silent, getVoices: () => voices.filter((v) => v.lang.startsWith('es')) },
      (text) => ({ text, lang: '', rate: 1, voice: null })
    );
    expect(spanishOnly.speak('Hello', 'en')).toBe(false);
    expect(silentFallback.speak('Hello', 'en')).toBe(false);
    expect(silent).not.toHaveBeenCalled();
  });

  it('localizes lifecycle errors and never mixes languages', () => {
    expect(friendlyVoiceError({ status: 429 }, 'en')).toContain('Voice is not available right now');
    expect(friendlyVoiceError({ status: 429 })).toContain('La voz no está disponible por ahora');
    expect(friendlyVoiceError(null, 'en')).toContain('continue by text');
    expect(friendlyVoiceError(null)).toContain('continúa por texto');
    const micDenied = { name: 'NotAllowedError' };
    expect(friendlyVoiceError(micDenied, 'en')).toBe(
      'Microphone permission denied. You can use the form or the written chat.'
    );
  });
});
