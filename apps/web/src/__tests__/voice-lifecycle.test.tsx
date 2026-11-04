import React, { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceInvitationAgent } from '../components/voice/VoiceInvitationAgent';
import { api, ApiError } from '../api/client';
import type { Capabilities } from '../types';
import { pcm16ToBase64 } from '../voice/pcm';
import { FALLBACK_SPEECH_RATE, SpanishSpeechFallback, pickSpanishVoice } from '../voice/fallback-speech';

const capabilities: Capabilities = {
  voice: true,
  chat: false,
  paypal: false,
  paypalClientId: null,
  sandbox: true,
  email: false,
};
const noNeuralVoice: Capabilities = { ...capabilities, voice: false };
const token = { token: 'public-token', sessionConfig: {}, maxSeconds: 180, leaseId: 'public-lease', audience: 'public' as const };

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

class MockSource {
  buffer: unknown = null;
  onended: (() => void) | null = null;
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn(() => { this.onended?.(); });
}

class MockAudioContext {
  static sources: MockSource[] = [];
  sampleRate = 48000;
  state = 'running';
  currentTime = 0;
  destination = {};
  close = vi.fn(async () => { this.state = 'closed'; });
  resume = vi.fn(async () => undefined);
  createMediaStreamSource = vi.fn(() => ({ connect: vi.fn() }));
  createScriptProcessor = vi.fn(() => ({ connect: vi.fn(), onaudioprocess: null }));
  createGain = vi.fn(() => ({ connect: vi.fn(), gain: { value: 1 } }));
  createBuffer = vi.fn((_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) }));
  createBufferSource = vi.fn(() => {
    const source = new MockSource();
    MockAudioContext.sources.push(source);
    return source;
  });
}

let stopTrack: ReturnType<typeof vi.fn>;
let getUserMedia: ReturnType<typeof vi.fn>;
let stream: MediaStream;

async function flushMicrotasks(times = 20) {
  for (let index = 0; index < times; index += 1) {
    await act(async () => { await Promise.resolve(); });
  }
}

beforeEach(() => {
  MockSocket.instances = [];
  MockAudioContext.sources = [];
  stopTrack = vi.fn();
  stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
  getUserMedia = vi.fn().mockResolvedValue(stream);
  vi.stubGlobal('WebSocket', MockSocket);
  vi.stubGlobal('AudioContext', MockAudioContext);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  vi.spyOn(api, 'getPublicVoiceToken').mockResolvedValue(token);
  vi.spyOn(api, 'markVoiceActivity').mockResolvedValue({ ok: true, active: true });
  vi.spyOn(api, 'releaseVoiceLease').mockResolvedValue({ ok: true, released: true, alreadyReleased: false });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function openPublic(caps: Capabilities = capabilities) {
  const view = render(
    <VoiceInvitationAgent audience="public" capabilities={caps} guest={null} onShowToast={vi.fn()} />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente de voz' }));
  return view;
}

function startPublic() {
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: /Escuchar información por voz/ }));
}

async function readySocket() {
  await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
  const socket = MockSocket.instances[0];
  socket.readyState = MockSocket.OPEN;
  await act(async () => {
    socket.onopen?.();
    // Protocol check: session.update goes out before session.ready.
    expect(JSON.parse(socket.send.mock.calls[0]?.[0] as string).type).toBe('session.update');
    await socket.onmessage?.({ data: JSON.stringify({ type: 'session.ready' }) });
  });
  return socket;
}

describe('public voice is available without an event or guest', () => {
  it('shows the Spanish launcher on a page with no event, no guest and no API call', () => {
    const view = openPublic();
    expect(screen.getByRole('button', { name: /Escuchar información por voz/ })).toBeInTheDocument();
    expect(api.getPublicVoiceToken).not.toHaveBeenCalled();
    expect(api.releaseVoiceLease).not.toHaveBeenCalled();
    expect(getUserMedia).not.toHaveBeenCalled();
    view.unmount();
  });

  it('renders exactly one launcher under React StrictMode', () => {
    render(
      <StrictMode>
        <VoiceInvitationAgent audience="public" capabilities={capabilities} guest={null} onShowToast={vi.fn()} />
      </StrictMode>,
    );
    expect(screen.getAllByRole('button', { name: 'Abrir asistente de voz' })).toHaveLength(1);
    expect(api.getPublicVoiceToken).not.toHaveBeenCalled();
  });
});

describe('voice lifecycle release points', () => {
  it('releases the lease and stops the microphone on Stop', async () => {
    const view = openPublic();
    startPublic();
    await readySocket();
    fireEvent.click(screen.getByRole('button', { name: /Detener y Cerrar/ }));

    expect(api.releaseVoiceLease).toHaveBeenCalledWith('public-lease', 'stop', false);
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(MockSocket.instances[0]?.close).toHaveBeenCalled();
    view.unmount();
  });

  it('releases with keepalive on pagehide and stops the microphone', async () => {
    const view = openPublic();
    startPublic();
    await readySocket();

    await act(async () => { window.dispatchEvent(new Event('pagehide')); });

    expect(api.releaseVoiceLease).toHaveBeenCalledWith('public-lease', 'pagehide', true);
    expect(stopTrack).toHaveBeenCalledOnce();
    view.unmount();
  });

  it('releases on unmount and does not leave a socket or microphone behind', async () => {
    const view = openPublic();
    startPublic();
    await readySocket();

    view.unmount();

    expect(api.releaseVoiceLease).toHaveBeenCalledWith('public-lease', 'unmount', true);
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(MockSocket.instances[0]?.close).toHaveBeenCalled();
  });

  it('releases when the WebSocket disconnects', async () => {
    const view = openPublic();
    startPublic();
    const socket = await readySocket();

    await act(async () => { socket.onclose?.(); });

    expect(api.releaseVoiceLease).toHaveBeenCalledWith('public-lease', 'ws_closed', false);
    expect(stopTrack).toHaveBeenCalledOnce();
    view.unmount();
  });
});

describe('rate limit cooldown', () => {
  it('shows Spanish copy, waits 15s and never retries by itself', async () => {
    vi.useFakeTimers();
    vi.mocked(api.getPublicVoiceToken).mockRejectedValueOnce(new ApiError('Too Many Requests', 429));

    const view = openPublic();
    startPublic();
    await flushMicrotasks();

    expect(api.getPublicVoiceToken).toHaveBeenCalledOnce();
    expect(screen.getByRole('alert')).toHaveTextContent('La voz no está disponible por ahora');
    expect(screen.getByRole('button', { name: /Escuchar información por voz/ })).toBeDisabled();
    expect(screen.getByText(/Espera 15 s antes de reintentar/)).toBeInTheDocument();
    expect(MockSocket.instances).toHaveLength(0);

    await act(async () => { await vi.advanceTimersByTimeAsync(15_500); });

    expect(screen.getByRole('button', { name: /Escuchar información por voz/ })).toBeEnabled();
    expect(api.getPublicVoiceToken).toHaveBeenCalledOnce();
    expect(stopTrack).toHaveBeenCalledOnce();
    view.unmount();
  });
});

describe('real 60 second inactivity', () => {
  it('stops and releases an idle session but never cuts a reply that is still playing', async () => {
    vi.useFakeTimers();
    const view = openPublic();
    startPublic();
    await flushMicrotasks();
    expect(MockSocket.instances).toHaveLength(1);
    const socket = MockSocket.instances[0]!;
    socket.readyState = MockSocket.OPEN;
    await act(async () => {
      socket.onopen?.();
      await socket.onmessage?.({ data: JSON.stringify({ type: 'session.ready' }) });
    });

    const audio = pcm16ToBase64(new Int16Array([100, 200, 300, 400]));
    // Silence alone is not activity: no ping is sent just because timers tick.
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(api.markVoiceActivity).not.toHaveBeenCalled();

    await act(async () => {
      await socket.onmessage?.({ data: JSON.stringify({ type: 'reply.started' }) });
      await socket.onmessage?.({ data: JSON.stringify({ type: 'reply.audio', audio }) });
    });
    expect(screen.getByText('Asistente hablando...')).toBeInTheDocument();
    // Real playback is activity, so the backend lease stays live while it is heard.
    expect(api.markVoiceActivity).toHaveBeenCalled();

    // The agent is still speaking after 61s: the idle rule must not cut it.
    await act(async () => { await vi.advanceTimersByTimeAsync(61_000); });
    expect(api.releaseVoiceLease).not.toHaveBeenCalled();

    // Playback ends. With no new user speech, the next tick ends the idle session.
    const source = MockAudioContext.sources.at(-1)!;
    await act(async () => {
      source.onended?.();
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(api.releaseVoiceLease).toHaveBeenCalledWith('public-lease', 'idle', false);
    expect(stopTrack).toHaveBeenCalledOnce();
    view.unmount();
  });
});

describe('Spanish speech fallback without neural output', () => {
  it('reads the public information with es-ES at 0.95-1.0, queues phrases and calls no voice API', () => {
    const utterances: Array<{ text: string; lang: string; rate: number; voice: { name: string } | null }> = [];
    class MockUtterance {
      text: string;
      lang = '';
      rate = 1;
      voice: { name: string } | null = null;
      constructor(text: string) { this.text = text; utterances.push(this); }
    }
    const synth = {
      speaking: false,
      cancel: vi.fn(() => { synth.speaking = false; }),
      speak: vi.fn(() => { synth.speaking = true; }),
      getVoices: () => [
        { lang: 'es-US', name: 'Voz Estados Unidos' },
        { lang: 'es-ES', name: 'Voz España' },
      ],
    };
    vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance);
    vi.stubGlobal('speechSynthesis', synth);

    const view = openPublic(noNeuralVoice);
    startPublic();
    expect(synth.speak).toHaveBeenCalledOnce();
    expect(utterances[0]?.lang).toBe('es-ES');
    expect(utterances[0]?.voice?.name).toBe('Voz España');
    expect(utterances[0]?.rate).toBeGreaterThanOrEqual(0.95);
    expect(utterances[0]?.rate).toBeLessThanOrEqual(1);

    // A second read must not cut the phrase already playing: the native queue keeps it.
    fireEvent.click(screen.getByRole('button', { name: /Escuchar información por voz/ }));
    expect(synth.speak).toHaveBeenCalledTimes(2);
    expect(synth.cancel).not.toHaveBeenCalled();

    expect(api.getPublicVoiceToken).not.toHaveBeenCalled();
    expect(api.releaseVoiceLease).not.toHaveBeenCalled();
    expect(MockSocket.instances).toHaveLength(0);
    expect(getUserMedia).not.toHaveBeenCalled();
    view.unmount();
    // Stop/unmount is the only path that cancels the current phrase.
    expect(synth.cancel).toHaveBeenCalled();
  });
});

describe('Spanish speech fallback contract', () => {
  it('enqueues phrases without cancelling the one already playing', () => {
    const cancel = vi.fn();
    const speak = vi.fn();
    const synth = {
      speaking: true,
      cancel,
      speak,
      getVoices: () => [{ lang: 'es-ES', name: 'Castellano' } as SpeechSynthesisVoice],
    };
    const fallback = new SpanishSpeechFallback(synth, (text) => ({
      text,
      lang: '',
      rate: 1,
      voice: null,
    }));

    expect(fallback.speak('Primera frase')).toBe(true);
    expect(fallback.speak('Segunda frase')).toBe(true);
    expect(cancel).not.toHaveBeenCalled();
    expect(speak).toHaveBeenCalledTimes(2);

    fallback.cancel();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('returns false and never speaks with a default non-Spanish voice', () => {
    const speak = vi.fn();
    const fallback = new SpanishSpeechFallback(
      { speaking: false, cancel: vi.fn(), speak, getVoices: () => [{ lang: 'en-US' } as SpeechSynthesisVoice] },
      (text) => ({ text, lang: '', rate: 1, voice: null }),
    );

    expect(pickSpanishVoice(fallback.voices)).toBeNull();
    expect(fallback.speak('Hola')).toBe(false);
    expect(speak).not.toHaveBeenCalled();
    expect(FALLBACK_SPEECH_RATE).toBeGreaterThanOrEqual(0.95);
    expect(FALLBACK_SPEECH_RATE).toBeLessThanOrEqual(1);
  });
});

describe('WebSocket rate limit', () => {
  it('shows Spanish copy and starts the 15s cooldown without retrying', async () => {
    const view = openPublic();
    startPublic();
    await flushMicrotasks();
    const socket = MockSocket.instances[0]!;
    socket.readyState = MockSocket.OPEN;

    await act(async () => {
      socket.onopen?.();
      await socket.onmessage?.({ data: JSON.stringify({ type: 'session.ready' }) });
      await socket.onmessage?.({
        data: JSON.stringify({ type: 'session.error', message: 'Rate limit exceeded' }),
      });
    });

    expect(screen.getByRole('alert')).toHaveTextContent('La voz no está disponible por ahora');
    expect(screen.getByRole('button', { name: /Escuchar información por voz/ })).toBeDisabled();
    expect(screen.getByText(/Espera 15 s antes de reintentar/)).toBeInTheDocument();
    expect(api.getPublicVoiceToken).toHaveBeenCalledOnce();
    view.unmount();
  });
});
