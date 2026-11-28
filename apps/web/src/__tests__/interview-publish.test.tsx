/**
 * NAP-U3 — publicar desde la entrevista: la sesión recibe el sistema
 * «published» con respuesta, y la pantalla final muestra la invitación, la
 * dirección propia, los dos QR (el de administrador distinto con su aviso),
 * el correo opcional contra la ruta de recuperación y cómo compartirla. La
 * cuota es colecta entre panas: ni un «PayPal». Sin red: fetch y SDK falsos.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NapsterCompanionApiSdk,
  type NapsterCompanionApiConfig,
  type NapsterCompanionApiInstance,
} from '@touchcastllc/napster-companion-api';
import { I18nProvider } from '../i18n/I18nContext';
import { CreateInterviewView } from '../views/CreateInterviewView';

vi.mock('@touchcastllc/napster-companion-api', () => ({
  NapsterCompanionApiSdk: { init: vi.fn() },
  DataChannelMessageType: { SEND_MESSAGE: 'send_message', FUNCTION_CALL_OUTPUT: 'send_function_output' },
}));

const initMock = vi.mocked(NapsterCompanionApiSdk.init);

const AVATARS = {
  avatars: [
    { id: 'elena', firstName: 'Elena', gender: 'female', previewUrl: 'https://img/e.jpg', loopUrl: null, default: true },
  ],
};

const SESSION = {
  token: 'tok-1',
  handle: '123e4567-e89b-12d3-a456-426614174000',
  visitor: 'creator',
  lang: 'es',
  agent: 'default',
  avatar: { id: 'elena', firstName: 'Elena', previewUrl: 'https://img/e.jpg' },
};

const EVENT = {
  id: 'evt-1',
  slug: 'asado-sabado',
  title: 'Asado del sábado',
  template: 'comida',
  meal: 'cena',
  description: '',
  startsAt: '2026-12-12T18:00:00.000Z',
  endsAt: '2026-12-12T21:00:00.000Z',
  location: 'Mi casa',
  includes: [],
  agenda: [],
  priceCents: 2500,
  capacity: 10,
  goalCents: null,
  minimumCents: null,
  confirmed: false,
  collectedCents: 0,
  confirmedPeople: 0,
  minimumReached: false,
  createdAt: '2026-11-28T00:00:00.000Z',
  subdomain: 'asado-sabado',
  publicUrl: 'https://asado-sabado.somospanas.com',
  paymentProvider: 'none',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('publicar desde la entrevista (NAP-U3)', () => {
  const fetchMock = vi.fn();
  const posts: Array<{ url: string; body: unknown }> = [];
  const sendCommand = vi.fn();
  let config: NapsterCompanionApiConfig | null = null;

  beforeEach(() => {
    localStorage.setItem('fp_locale', 'es');
    posts.length = 0;
    sendCommand.mockReset();
    config = null;
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url === '/api/avatars') return json(AVATARS);
      if (url === '/api/avatar-session') return json(SESSION);
      if (url === '/api/events' && method === 'POST') {
        posts.push({ url, body: JSON.parse(String(init?.body ?? '{}')) });
        return json({ event: EVENT, adminKey: 'clave-1' });
      }
      if (url === `/api/events/${EVENT.slug}/recovery/contact` && method === 'PUT') {
        posts.push({ url, body: JSON.parse(String(init?.body ?? '{}')) });
        return json({ contact: { state: 'pending', masked: 'y***@x.com' }, delivery: 'sent' });
      }
      if (url === `/api/events/${EVENT.slug}/recovery`) {
        return json({ contact: { state: 'none', masked: null } });
      }
      if (url === `/api/events/${EVENT.slug}/avatar`) {
        return json({ status: 'none', firstName: null, ready: false });
      }
      return json({ error: 'sin mock' }, 500);
    });
    vi.stubGlobal('fetch', fetchMock);
    Element.prototype.scrollIntoView = vi.fn();
    initMock.mockImplementation(async (getToken, sessionConfig) => {
      config = sessionConfig ?? null;
      await getToken();
      return { destroy: vi.fn(), sendCommand } as unknown as NapsterCompanionApiInstance;
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  const renderInterview = () =>
    render(
      <I18nProvider>
        <CreateInterviewView onDone={vi.fn()} onCancel={vi.fn()} onShowToast={vi.fn()} recoveryAvailable />
      </I18nProvider>,
    );

  async function fillAndStart(): Promise<void> {
    renderInterview();
    await screen.findByTestId('avatar-pick-elena');
    fireEvent.click(screen.getByTestId('napster-avatar-start'));
    await screen.findByTestId('napster-avatar-live');
    // La avatar lista: el aviso de publicación tiene a quién llegar.
    config?.onData?.({ event: 'avatar_state_changed', data: { state: 'ready' } } as never);
    fireEvent.change(screen.getByTestId('interview-title'), { target: { value: 'Asado del sábado' } });
    fireEvent.click(screen.getByTestId('interview-step-4'));
    fireEvent.change(screen.getByTestId('interview-location'), { target: { value: 'Mi casa' } });
    fireEvent.click(screen.getByTestId('interview-step-5'));
    fireEvent.change(screen.getByTestId('interview-capacity'), { target: { value: '10' } });
    fireEvent.click(screen.getByTestId('interview-step-6'));
    fireEvent.change(screen.getByTestId('interview-price'), { target: { value: '25' } });
    fireEvent.click(screen.getByTestId('interview-step-7'));
  }

  it('publicar envía «published» a la sesión y muestra la pantalla final', async () => {
    await fillAndStart();
    fireEvent.change(screen.getByTestId('interview-address'), { target: { value: 'asado-sabado' } });
    fireEvent.click(screen.getByTestId('interview-publish'));

    expect(await screen.findByTestId('interview-final')).toBeInTheDocument();
    // El sistema «published» con respuesta para que la avatar hable.
    await waitFor(() => expect(sendCommand).toHaveBeenCalled());
    expect(sendCommand).toHaveBeenCalledWith({
      type: 'send_message',
      data: { role: 'system', text: 'published', trigger_response: true },
    });
    // La dirección pedida viajó al servidor.
    expect(posts.find((post) => post.url === '/api/events')?.body).toMatchObject({
      preferredSubdomain: 'asado-sabado',
    });
    // Vista previa, dirección propia y QR de invitados.
    expect(screen.getByTestId('interview-final-preview')).toBeInTheDocument();
    expect(screen.getByTestId('interview-public-url')).toHaveTextContent('https://asado-sabado.somospanas.com');
    expect(screen.getByTestId('share-guest-qr').querySelector('svg')).toBeTruthy();
    // QR de administrador distinto, con su aviso.
    expect(screen.getByTestId('share-admin-qr').querySelector('svg')).toBeTruthy();
    expect(screen.getByTestId('share-admin-warning')).toHaveTextContent(
      'No compartas este QR: abre tu panel de organizador',
    );
    // Foto propia y correo opcional presentes.
    expect(screen.getByTestId('interview-final-photo')).toBeInTheDocument();
    expect(screen.getByTestId('interview-final-email')).toBeInTheDocument();
    // Colecta entre panas, nunca PayPal.
    expect(document.body.textContent).not.toMatch(/PayPal/);
  });

  it('el correo opcional usa la ruta de recuperación existente', async () => {
    await fillAndStart();
    fireEvent.click(screen.getByTestId('interview-publish'));
    await screen.findByTestId('interview-final');

    const input = screen.getByLabelText(/Correo/i, { selector: 'input' });
    fireEvent.change(input, { target: { value: 'yo@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar|Save/ }));
    await waitFor(() =>
      expect(posts.some((post) => post.url === `/api/events/${EVENT.slug}/recovery/contact`)).toBe(true),
    );
    const saved = posts.find((post) => post.url === `/api/events/${EVENT.slug}/recovery/contact`);
    expect(JSON.stringify(saved?.body)).toContain('yo@example.com');
  });
});
