import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceInvitationAgent } from '../components/voice/VoiceInvitationAgent';
import { api } from '../api/client';
import type { Capabilities, Guest } from '../types';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
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

const capabilities: Capabilities = { voice: true, gemini: false, paypal: false, paypalClientId: null, sandbox: true };
const guest: Guest = { id: 'guest-one', name: 'Invitado demo', status: 'yes', companions: 0, paidCents: 0, dueCents: 2500 };
const token = { token: 'test-token', leaseId: 'test-lease', sessionConfig: {}, maxSeconds: 60 };
let stopTrack: ReturnType<typeof vi.fn>;
let stream: MediaStream;
let getUserMedia: ReturnType<typeof vi.fn>;

beforeEach(() => {
  MockSocket.instances = [];
  stopTrack = vi.fn();
  stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
  getUserMedia = vi.fn().mockResolvedValue(stream);
  vi.stubGlobal('WebSocket', MockSocket);
  vi.stubGlobal('AudioContext', MockAudioContext);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  vi.spyOn(api, 'getVoiceToken').mockResolvedValue(token);
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function startVoice(onApplyQuote = vi.fn()) {
  const view = render(<VoiceInvitationAgent slug="fiesta" capabilities={capabilities} guest={guest} onShowToast={vi.fn()} onApplyQuote={onApplyQuote} />);
  fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente de voz' }));
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: /Iniciar Conversación/ }));
  return view;
}

async function readySocket() {
  await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
  const socket = MockSocket.instances[0];
  socket.readyState = MockSocket.OPEN;
  await act(async () => { socket.onopen?.(); await socket.onmessage?.({ data: JSON.stringify({ type: 'session.ready' }) }); });
  return socket;
}

describe('Voice session cancellation and isolation', () => {
  it('stops a microphone granted after Stop without requesting a token', async () => {
    const permission = deferred<MediaStream>();
    getUserMedia.mockReturnValueOnce(permission.promise);
    startVoice();
    fireEvent.click(screen.getByRole('button', { name: /Detener y Cerrar/ }));
    await act(async () => { permission.resolve(stream); });
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(api.getVoiceToken).not.toHaveBeenCalled();
    expect(MockSocket.instances).toHaveLength(0);
  });

  it('does not connect after unmount while its token request is pending', async () => {
    const pendingToken = deferred<typeof token>();
    vi.mocked(api.getVoiceToken).mockReturnValueOnce(pendingToken.promise);
    const view = startVoice();
    await waitFor(() => expect(api.getVoiceToken).toHaveBeenCalledOnce());
    view.unmount();
    await act(async () => { pendingToken.resolve(token); });
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(MockSocket.instances).toHaveLength(0);
  });

  it('ignores delayed close callbacks from a previous socket after restarting', async () => {
    startVoice();
    const oldSocket = await readySocket();
    const delayedClose = oldSocket.onclose;
    fireEvent.click(screen.getByRole('button', { name: /Detener y Cerrar/ }));
    fireEvent.click(screen.getByRole('button', { name: /Iniciar Conversación/ }));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(2));
    const newSocket = MockSocket.instances[1];
    await act(async () => { delayedClose?.(); });
    expect(newSocket.close).not.toHaveBeenCalled();
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it('waits for reply.done and discards tool results that arrive after interruption', async () => {
    const pendingTool = deferred<Awaited<ReturnType<typeof api.executeVoiceTool>>>();
    const execute = vi.spyOn(api, 'executeVoiceTool').mockReturnValueOnce(pendingTool.promise);
    const onApplyQuote = vi.fn();
    startVoice(onApplyQuote);
    const socket = await readySocket();
    await act(async () => { await socket.onmessage?.({ data: JSON.stringify({ type: 'tool.call', call_id: 'call-one', name: 'calculate_quote', arguments: {} }) }); });
    expect(execute).not.toHaveBeenCalled();
    await act(async () => { await socket.onmessage?.({ data: JSON.stringify({ type: 'reply.done' }) }); });
    expect(execute).toHaveBeenCalledOnce();
    await act(async () => { await socket.onmessage?.({ data: JSON.stringify({ type: 'input.speech.started' }) }); });
    await act(async () => {
      pendingTool.resolve({ response: { ok: true }, quote: { id: 'old-quote', guestId: guest.id, people: 1, unitCents: 2500, totalCents: 2500, paidCents: 0, amountCents: 2500, summary: 'Cotización antigua', expiresAt: '2099-01-01T00:00:00Z' } });
    });
    expect(onApplyQuote).not.toHaveBeenCalled();
    expect(socket.send.mock.calls.map(([message]) => JSON.parse(message).type)).not.toContain('tool.result');
  });

  it('falls back to form/chat on NotAllowedError with zero tokens or sockets and retries cleanly to session.ready', async () => {
    const notAllowedError = new Error('Permission denied');
    notAllowedError.name = 'NotAllowedError';
    getUserMedia.mockRejectedValueOnce(notAllowedError);

    startVoice();

    await waitFor(() => {
      expect(
        screen.getByText('Permiso de micrófono denegado. Puedes usar el formulario o chat escrito.')
      ).toBeInTheDocument();
    });
    expect(api.getVoiceToken).not.toHaveBeenCalled();
    expect(MockSocket.instances).toHaveLength(0);

    const retryButton = screen.getByRole('button', { name: /Iniciar Conversación/ });
    expect(retryButton).toBeEnabled();
    fireEvent.click(retryButton);

    const socket = await readySocket();
    expect(socket.readyState).toBe(MockSocket.OPEN);
    expect(screen.getByText('Escuchando tu voz...')).toBeInTheDocument();
    expect(screen.queryByText('Conectando con AssemblyAI...')).not.toBeInTheDocument();
    expect(MockSocket.instances).toHaveLength(1);
    expect(api.getVoiceToken).toHaveBeenCalledOnce();
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: /Detener y Cerrar/ })).toBeInTheDocument();
    expect(screen.queryByText('Permiso de micrófono denegado. Puedes usar el formulario o chat escrito.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Detener y Cerrar/ }));
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it('stops microphone track on getVoiceToken rejection with visible message and retries with a new track to session.ready', async () => {
    const firstStop = vi.fn();
    const firstStream = { getTracks: () => [{ stop: firstStop }] } as unknown as MediaStream;
    const secondStop = vi.fn();
    const secondStream = { getTracks: () => [{ stop: secondStop }] } as unknown as MediaStream;

    getUserMedia.mockResolvedValueOnce(firstStream).mockResolvedValueOnce(secondStream);
    vi.mocked(api.getVoiceToken).mockRejectedValueOnce(new Error('Token generation failed'));

    startVoice();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Token generation failed');
    });
    expect(firstStop).toHaveBeenCalledOnce();
    expect(MockSocket.instances).toHaveLength(0);
    expect(api.getVoiceToken).toHaveBeenCalledOnce();

    const retryButton = screen.getByRole('button', { name: /Iniciar Conversación/ });
    expect(retryButton).toBeEnabled();
    fireEvent.click(retryButton);

    const socket = await readySocket();
    expect(socket.readyState).toBe(MockSocket.OPEN);
    expect(screen.getByText('Escuchando tu voz...')).toBeInTheDocument();
    expect(screen.queryByText('Conectando con AssemblyAI...')).not.toBeInTheDocument();
    expect(MockSocket.instances).toHaveLength(1);
    expect(api.getVoiceToken).toHaveBeenCalledTimes(2);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(firstStop).toHaveBeenCalledOnce();
    expect(secondStop).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Detener y Cerrar/ })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Detener y Cerrar/ }));
    expect(secondStop).toHaveBeenCalledOnce();
    expect(firstStop).toHaveBeenCalledOnce();
  });
});
