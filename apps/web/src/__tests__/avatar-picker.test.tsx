/**
 * NAP-U3 — fila de avatares: la default ya elegida, «Ver todas» con rejilla
 * completa, `avatarId` en la sesión y nombre en el título; con sesión en
 * curso, cambiar pide confirmación y reinicia. Sin red: fetch y SDK falsos.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NapsterCompanionApiSdk,
  type NapsterCompanionApiInstance,
} from '@touchcastllc/napster-companion-api';
import { I18nProvider } from '../i18n/I18nContext';
import { CreateInterviewView } from '../views/CreateInterviewView';

vi.mock('@touchcastllc/napster-companion-api', () => ({
  NapsterCompanionApiSdk: { init: vi.fn() },
  DataChannelMessageType: { SEND_MESSAGE: 'send_message', FUNCTION_CALL_OUTPUT: 'send_function_output' },
}));

const initMock = vi.mocked(NapsterCompanionApiSdk.init);

const catalog = (count: number) => ({
  avatars: Array.from({ length: count }, (_, i) => ({
    id: i === 0 ? 'elena' : `guia-${i}`,
    firstName: i === 0 ? 'Elena' : `Guía ${i}`,
    displayName: i === 0 ? 'Elena Navarro' : `Guía ${i} Pérez`,
    gender: 'female',
    previewUrl: `https://img/${i}.jpg`,
    loopUrl: null,
    tags: i === 0 ? ['fiesta'] : ['karaoke'],
    default: i === 0,
  })),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const SESSION = {
  token: 'tok-1',
  handle: '123e4567-e89b-12d3-a456-426614174000',
  visitor: 'creator',
  lang: 'es',
  agent: 'default',
  avatar: { id: 'elena', firstName: 'Elena', previewUrl: 'https://img/0.jpg' },
};

describe('fila de avatares (NAP-U3)', () => {
  const fetchMock = vi.fn();
  const bodies: unknown[] = [];

  beforeEach(() => {
    localStorage.setItem('fp_locale', 'es');
    bodies.length = 0;
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/avatars') return json(catalog(2));
      if (url === '/api/avatar-session') {
        bodies.push(JSON.parse(String(init?.body ?? '{}')));
        return json(SESSION);
      }
      return json({ error: 'sin mock' }, 500);
    });
    vi.stubGlobal('fetch', fetchMock);
    Element.prototype.scrollIntoView = vi.fn();
    initMock.mockImplementation(async (getToken) => {
      await getToken();
      return { destroy: vi.fn(), sendCommand: vi.fn() } as unknown as NapsterCompanionApiInstance;
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
        <CreateInterviewView onDone={vi.fn()} onCancel={vi.fn()} onShowToast={vi.fn()} />
      </I18nProvider>,
    );

  it('muestra la default elegida y el nombre en el título en reposo', async () => {
    renderInterview();
    expect(await screen.findByTestId('avatar-pick-elena')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('avatar-pick-guia-1')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Hola, soy Elena, tu guía de Somos Panas')).toBeInTheDocument();
    expect(screen.getByText(/Usar mi foto/)).toBeInTheDocument();
    expect(screen.getByText(/Se activa al publicar/)).toBeInTheDocument();
  });

  it('NAP-U5: la tarjeta pre-inicio trae foto, globo con saludo y botón dorado', async () => {
    renderInterview();
    await screen.findByTestId('avatar-pick-elena');
    expect(screen.getByTestId('napster-avatar-idle-photo')).toHaveAttribute('src', 'https://img/0.jpg');
    expect(screen.getByTestId('napster-avatar-idle-greeting')).toHaveTextContent('Cuéntame de tu reunión');
    expect(screen.getByTestId('napster-avatar-start')).toHaveClass('napster-btn-gold');
  });

  it('«Ver todas» abre la rejilla completa y Escape la cierra', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/avatars') return json(catalog(8));
      if (url === '/api/avatar-session') {
        bodies.push(JSON.parse(String(init?.body ?? '{}')));
        return json(SESSION);
      }
      return json({ error: 'sin mock' }, 500);
    });
    renderInterview();
    fireEvent.click(await screen.findByTestId('avatar-pick-more'));
    expect(screen.getByTestId('avatar-picker-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('avatar-pick-all-guia-7')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByTestId('avatar-picker-dialog'), { key: 'Escape' });
    expect(screen.queryByTestId('avatar-picker-dialog')).toBeNull();
  });

  it('la sesión lleva el avatarId elegido', async () => {
    renderInterview();
    await screen.findByTestId('avatar-pick-elena');
    fireEvent.click(screen.getByTestId('napster-avatar-start'));
    await waitFor(() => expect(bodies.length).toBe(1));
    expect(bodies[0]).toMatchObject({ lang: 'es', intent: 'create', avatarId: 'elena' });
  });

  it('cambiar con sesión en curso confirma y reinicia con el nuevo avatarId', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderInterview();
    await screen.findByTestId('avatar-pick-elena');
    fireEvent.click(screen.getByTestId('napster-avatar-start'));
    await waitFor(() => expect(bodies.length).toBe(1));

    fireEvent.click(screen.getByTestId('avatar-pick-guia-1'));
    expect(confirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(bodies.length).toBe(2));
    expect(bodies[1]).toMatchObject({ avatarId: 'guia-1' });
    expect(screen.getByTestId('avatar-pick-guia-1')).toHaveAttribute('aria-pressed', 'true');
  });

  it('sin confirmación no cambia ni reinicia', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderInterview();
    await screen.findByTestId('avatar-pick-elena');
    fireEvent.click(screen.getByTestId('napster-avatar-start'));
    await waitFor(() => expect(bodies.length).toBe(1));

    fireEvent.click(screen.getByTestId('avatar-pick-guia-1'));
    await waitFor(() => expect(initMock).toHaveBeenCalledTimes(1));
    expect(bodies.length).toBe(1);
    expect(screen.getByTestId('avatar-pick-elena')).toHaveAttribute('aria-pressed', 'true');
  });
});
