import type { ComponentProps } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantOrb } from '../components/assistant/AssistantOrb';
import { VoiceInvitationAgent } from '../components/voice/VoiceInvitationAgent';
import { api } from '../api/client';
import type { Capabilities } from '../types';

const capabilities: Capabilities = {
  chat: true,
  llmProvider: 'openai',
  paypal: false,
  voice: true,
  paypalClientId: null,
  sandbox: true,
  email: false,
};

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
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

let fetchMock: ReturnType<typeof vi.fn>;
let getUserMedia: ReturnType<typeof vi.fn>;
let stopTrack: ReturnType<typeof vi.fn>;

function openOrb(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Abrir Agente FiestaPay' }));
}

function publicOrb(overrides: Partial<ComponentProps<typeof AssistantOrb>> = {}) {
  return (
    <AssistantOrb
      audience="public"
      capabilities={capabilities}
      onShowToast={vi.fn()}
      {...overrides}
    />
  );
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  stopTrack = vi.fn();
  getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
  MockSocket.instances = [];
  vi.stubGlobal('WebSocket', MockSocket);
  vi.stubGlobal('AudioContext', MockAudioContext);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('unified AssistantOrb', () => {
  it('shows one launcher and opens Text/Voice without external calls or mic permission', () => {
    const tokenSpy = vi.spyOn(api, 'getPublicVoiceToken');
    render(publicOrb());

    expect(screen.getAllByRole('button', { name: 'Abrir Agente FiestaPay' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Abrir asistente de voz' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Abrir asistente IA' })).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Agente FiestaPay' })).toBeNull();

    openOrb();

    expect(screen.getByRole('dialog', { name: 'Agente FiestaPay' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Escribir' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Hablar' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Pregunta para el chat público' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(tokenSpy).not.toHaveBeenCalled();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('switches between text and voice without starting a microphone or voice lease', () => {
    const tokenSpy = vi.spyOn(api, 'getPublicVoiceToken');
    render(publicOrb());
    openOrb();

    fireEvent.click(screen.getByRole('tab', { name: 'Hablar' }));
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Escuchar información por voz/ })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Pregunta para el chat público' })).toBeNull();
    expect(tokenSpy).not.toHaveBeenCalled();
    expect(getUserMedia).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('tab', { name: 'Escribir' }));
    expect(screen.getByRole('textbox', { name: 'Pregunta para el chat público' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(tokenSpy).not.toHaveBeenCalled();
  });

  it('keeps the same text history across mode changes and close/reopen', async () => {
    fetchMock.mockResolvedValue(response({ text: 'Respuesta que debe sobrevivir al cierre.' }));
    render(publicOrb());
    openOrb();

    const input = screen.getByRole('textbox', { name: 'Pregunta para el chat público' });
    fireEvent.change(input, { target: { value: '¿Cómo funciona FiestaPay?' } });
    fireEvent.submit(input.closest('form')!);
    await screen.findByText('Respuesta que debe sobrevivir al cierre.');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('tab', { name: 'Hablar' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Escribir' }));
    expect(screen.getByText('Respuesta que debe sobrevivir al cierre.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar Agente FiestaPay' }));
    expect(screen.queryByText('Respuesta que debe sobrevivir al cierre.')).toBeNull();

    openOrb();
    expect(screen.getByText('Respuesta que debe sobrevivir al cierre.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('forwards guest scope, callbacks and the revoked permission state to the existing text component', async () => {
    const history = vi.spyOn(api, 'getChatHistory').mockResolvedValue({
      messages: [
        { id: 'history-1', role: 'assistant', text: 'Historial de la invitación A', createdAt: '2026-11-04T10:00:00Z' },
      ],
    });
    const onConfirmRsvp = vi.fn();
    render(
      <AssistantOrb
        audience="guest"
        slug="invitacion-a"
        capabilities={capabilities}
        accessRevoked
        onConfirmRsvp={onConfirmRsvp}
        onShowToast={vi.fn()}
      />,
    );
    openOrb();

    await screen.findByText('Historial de la invitación A');
    expect(history).toHaveBeenCalledWith('invitacion-a');
    expect(screen.getByRole('textbox', { name: /Mensaje para el asistente/i })).toBeDisabled();
    expect(screen.getByText(/El organizador revoco el acceso/i)).toBeInTheDocument();
  });

  it('forwards organizer scope to the keyed organizer routes', async () => {
    const guestHistory = vi.spyOn(api, 'getChatHistory');
    const history = vi.spyOn(api, 'getOrganizerChatHistory').mockResolvedValue({
      messages: [],
      greeting: 'Saludo privado del panel.',
    });
    render(
      <AssistantOrb audience="organizer" slug="panel-1" capabilities={capabilities} onShowToast={vi.fn()} />,
    );
    openOrb();

    await screen.findByText('Saludo privado del panel.');
    expect(history).toHaveBeenCalledWith('panel-1');
    expect(screen.getByText(/Agente del organizador/)).toBeInTheDocument();
    expect(guestHistory).not.toHaveBeenCalled();
  });

  it('does not carry a guest history into another slug scope', async () => {
    vi.spyOn(api, 'getChatHistory').mockImplementation(async (slug: string) => ({
      messages: [
        {
          id: `history-${slug}`,
          role: 'assistant',
          text: `Historial de ${slug}`,
          createdAt: '2026-11-04T10:00:00Z',
        },
      ],
    }));
    const view = render(
      <AssistantOrb audience="guest" slug="fiesta-a" capabilities={capabilities} onShowToast={vi.fn()} />,
    );
    openOrb();
    await screen.findByText('Historial de fiesta-a');

    view.rerender(
      <AssistantOrb audience="guest" slug="fiesta-b" capabilities={capabilities} onShowToast={vi.fn()} />,
    );

    await screen.findByText('Historial de fiesta-b');
    expect(screen.queryByText('Historial de fiesta-a')).toBeNull();
  });

  it('closing the orb while voice is active unmounts it through the existing stop/release cleanup', async () => {
    vi.spyOn(api, 'getPublicVoiceToken').mockResolvedValue({
      token: 'token-orb',
      sessionConfig: {},
      maxSeconds: 60,
      leaseId: 'lease-orb',
      audience: 'public',
    });
    vi.spyOn(api, 'releaseVoiceLease').mockResolvedValue({ ok: true, released: true, alreadyReleased: false });

    render(publicOrb());
    openOrb();
    fireEvent.click(screen.getByRole('tab', { name: 'Hablar' }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Escuchar información por voz/ }));

    await waitFor(() => expect(api.getPublicVoiceToken).toHaveBeenCalledOnce());
    await act(async () => { await Promise.resolve(); });

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar Agente FiestaPay' }));

    await waitFor(() =>
      expect(api.releaseVoiceLease).toHaveBeenCalledWith('lease-orb', expect.any(String), expect.any(Boolean)),
    );
    expect(stopTrack).toHaveBeenCalled();
  });

  it('a controlled close without unmount stops voice and releases its lease', async () => {
    vi.spyOn(api, 'getPublicVoiceToken').mockResolvedValue({
      token: 'token-controlled',
      sessionConfig: {},
      maxSeconds: 60,
      leaseId: 'lease-controlled',
      audience: 'public',
    });
    vi.spyOn(api, 'releaseVoiceLease').mockResolvedValue({ ok: true, released: true, alreadyReleased: false });
    const onShowToast = vi.fn();
    const view = render(
      <VoiceInvitationAgent
        audience="public"
        capabilities={capabilities}
        guest={null}
        embedded
        open
        onOpenChange={vi.fn()}
        onShowToast={onShowToast}
      />,
    );

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Escuchar información por voz/ }));
    await waitFor(() => expect(api.getPublicVoiceToken).toHaveBeenCalledOnce());
    await act(async () => { await Promise.resolve(); });

    view.rerender(
      <VoiceInvitationAgent
        audience="public"
        capabilities={capabilities}
        guest={null}
        embedded
        open={false}
        onOpenChange={vi.fn()}
        onShowToast={onShowToast}
      />,
    );

    await waitFor(() => expect(api.releaseVoiceLease).toHaveBeenCalledWith('lease-controlled', 'orb_close', false));
    expect(stopTrack).toHaveBeenCalled();
  });
});
