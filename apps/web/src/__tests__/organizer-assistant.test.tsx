import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../api/client';
import { ChatAssistant } from '../components/chat/ChatAssistant';
import { OrganizerAssistant } from '../components/chat/OrganizerAssistant';
import { VoiceInvitationAgent } from '../components/voice/VoiceInvitationAgent';
import type { Capabilities, Quote } from '../types';

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

const capabilities: Capabilities = {
  chat: true,
  llmProvider: 'openai',
  paypal: false,
  voice: true,
  paypalClientId: null,
  sandbox: true,
  email: false,
};

const quote: Quote = {
  id: 'quote-1',
  guestId: 'guest-1',
  people: 2,
  unitCents: 2500,
  totalCents: 5000,
  paidCents: 0,
  amountCents: 5000,
  summary: '2 personas',
  expiresAt: '2099-01-01T00:00:00Z',
};

let stopTrack: ReturnType<typeof vi.fn>;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('asistente del organizador en texto y voz', () => {
  it('muestra el saludo del servidor, escribe de inmediato y no aplica cotizacion ni RSVP', async () => {
    vi.spyOn(api, 'getOrganizerChatHistory').mockResolvedValue({
      messages: [],
      greeting: 'Saludo del servidor para el panel.',
    });
    const pending = deferred<{ text: string; quote?: Quote; actions?: string[] }>();
    vi.spyOn(api, 'sendOrganizerChat').mockReturnValue(pending.promise);
    const onApplyQuote = vi.fn();
    render(<OrganizerAssistant slug="panel" capabilities={capabilities} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente IA' }));
    expect(screen.getByText('Asistente del organizador')).toBeInTheDocument();
    await screen.findByText('Saludo del servidor para el panel.');
    const input = screen.getByRole('textbox', { name: /Mensaje para el asistente/i });
    fireEvent.change(input, { target: { value: 'Quien falta por pagar?' } });
    fireEvent.submit(input.closest('form')!);
    expect(screen.getByText('Asistente del organizador está escribiendo…')).toBeInTheDocument();
    expect(api.sendOrganizerChat).toHaveBeenCalledWith('panel', 'Quien falta por pagar?');
    await act(async () => {
      pending.resolve({ text: 'Revisa el panel.', quote, actions: ['rsvp:yes:1'] });
    });
    await screen.findByText('Revisa el panel.');
    expect(screen.queryByText('Propuesta de Cotización')).toBeNull();
    expect(screen.queryByText('Propuesta de Asistencia')).toBeNull();
    expect(onApplyQuote).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente de voz' }));
    expect(screen.queryByText('Únete primero')).toBeNull();
    expect(screen.getByText('Voz del organizador')).toBeInTheDocument();
  });

  it('al 403 olvida el texto privado y al 503 deja el panel manual', async () => {
    vi.spyOn(api, 'getOrganizerChatHistory').mockResolvedValue({ messages: [], greeting: 'Saludo.' });
    vi.spyOn(api, 'sendOrganizerChat').mockRejectedValueOnce(new ApiError('Clave de organizador invalida', 403));
    render(<ChatAssistant slug="panel" capabilities={capabilities} audience="organizer" />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente IA' }));
    const input = screen.getByRole('textbox', { name: /Mensaje para el asistente/i });
    fireEvent.change(input, { target: { value: 'SECRETO-PANEL-UI' } });
    fireEvent.submit(input.closest('form')!);
    await screen.findByText('La clave de organizador ya no autoriza este asistente. Usa el panel manual.');
    expect(screen.queryByText('SECRETO-PANEL-UI')).toBeNull();

    cleanup();
    vi.spyOn(api, 'getOrganizerChatHistory').mockResolvedValue({ messages: [], greeting: 'Saludo.' });
    vi.spyOn(api, 'sendOrganizerChat').mockRejectedValueOnce(new ApiError('no disponible', 503));
    render(<ChatAssistant slug="panel" capabilities={capabilities} audience="organizer" />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente IA' }));
    const again = screen.getByRole('textbox', { name: /Mensaje para el asistente/i });
    fireEvent.change(again, { target: { value: 'Hola panel' } });
    fireEvent.submit(again.closest('form')!);
    await screen.findByText(/Usa el panel: editar, compartir y revisar invitados/);
  });

  it('la voz del organizador no exige invitado, se detiene y limpia un 403 viejo', async () => {
    stopTrack = vi.fn();
    const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
    MockSocket.instances = [];
    vi.stubGlobal('WebSocket', MockSocket);
    vi.stubGlobal('AudioContext', MockAudioContext);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });
    vi.spyOn(api, 'getVoiceToken');
    vi.spyOn(api, 'getOrganizerVoiceToken').mockResolvedValue({
      token: 'token-organizador',
      leaseId: 'lease-organizador',
      sessionConfig: {},
      maxSeconds: 60,
    });
    vi.spyOn(api, 'executeOrganizerVoiceTool').mockRejectedValue(new ApiError('Clave de organizador invalida', 403));
    const toast = vi.fn();
    render(
      <VoiceInvitationAgent
        slug="panel"
        capabilities={capabilities}
        guest={null}
        audience="organizer"
        onShowToast={toast}
      />,
    );
    expect(screen.queryByText('Únete primero')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente de voz' }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Iniciar Conversación/ }));
    await waitFor(() => expect(api.getOrganizerVoiceToken).toHaveBeenCalledOnce());
    expect(api.getVoiceToken).not.toHaveBeenCalled();
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0]!;
    socket.readyState = MockSocket.OPEN;
    await act(async () => { socket.onopen?.(); });
    fireEvent.click(screen.getByRole('button', { name: /Detener y Cerrar/ }));
    expect(stopTrack).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Iniciar Conversación/ }));
    await waitFor(() => expect(MockSocket.instances.length).toBeGreaterThan(1));
    const next = MockSocket.instances[MockSocket.instances.length - 1]!;
    next.readyState = MockSocket.OPEN;
    await act(async () => {
      next.onopen?.();
      await next.onmessage?.({ data: JSON.stringify({ type: 'session.ready' }) });
      await next.onmessage?.({ data: JSON.stringify({ type: 'tool.call', call_id: 'c1', name: 'get_funding_progress', arguments: {} }) });
      await next.onmessage?.({ data: JSON.stringify({ type: 'reply.done' }) });
    });
    await screen.findByText(/La voz se detuvo: la clave o la sesion ya no autoriza/);
    expect(stopTrack.mock.calls.length).toBeGreaterThan(1);
    expect(toast).toHaveBeenCalledWith('error', expect.stringMatching(/panel o en el formulario/), 'Voz detenida');
  });
});
