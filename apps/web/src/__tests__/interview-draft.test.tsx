/**
 * NAP-U3 — la entrevista reacciona a `fill_event_draft` con step: llena los
 * campos y activa ese paso en dorado; la corrección manual no se pisa. Sin
 * red: fetch y SDK falsos.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nContext';
import { CreateInterviewView } from '../views/CreateInterviewView';
import { GUIDE_DRAFT_EVENT } from '../guide/showOnScreen';

vi.mock('@touchcastllc/napster-companion-api', () => ({
  NapsterCompanionApiSdk: { init: vi.fn() },
  DataChannelMessageType: { SEND_MESSAGE: 'send_message', FUNCTION_CALL_OUTPUT: 'send_function_output' },
}));

const AVATARS = {
  avatars: [
    { id: 'elena', firstName: 'Elena', displayName: 'Elena Navarro', gender: 'female', previewUrl: 'https://img/e.jpg', loopUrl: null, tags: ['fiesta'], default: true },
    { id: 'marco', firstName: 'Marco', displayName: 'Marco Paz', gender: 'male', previewUrl: 'https://img/m.jpg', loopUrl: null, tags: ['karaoke'], default: false },
  ],
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function draft(step: string, extra: Record<string, unknown> = {}) {
  return {
    template: 'evento',
    title: 'Asado del sábado',
    date: '2026-12-12',
    startTime: '18:00',
    includes: [],
    suggested: ['title', 'date', 'startTime'],
    source: 'rules',
    step,
    ...extra,
  };
}

function sendDraft(step: string, extra: Record<string, unknown> = {}) {
  document.dispatchEvent(new CustomEvent(GUIDE_DRAFT_EVENT, { detail: { proposal: draft(step, extra) } }));
}

describe('borrador con step en la entrevista (NAP-U3)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    localStorage.setItem('fp_locale', 'es');
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/avatars') return json(AVATARS);
      return json({ error: 'sin mock' }, 500);
    });
    vi.stubGlobal('fetch', fetchMock);
    Element.prototype.scrollIntoView = vi.fn();
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

  it('step location llena el lugar y activa el paso 4 en dorado', async () => {
    renderInterview();
    await screen.findByTestId('avatar-pick-elena');
    sendDraft('location', { suggested: ['title', 'date', 'startTime', 'location'], location: 'Mi casa' });

    expect(await screen.findByTestId('interview-draft-notice')).toHaveTextContent('Lugar');
    expect(screen.getByTestId('interview-step-4')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('interview-step-4')).toHaveClass('interview-step-active');
    expect(screen.getByTestId('interview-step-1')).not.toHaveClass('interview-step-active');
    expect(screen.getByTestId('interview-location')).toHaveValue('Mi casa');
  });

  it('step perPersonCents llena la cuota y activa el paso 6', async () => {
    renderInterview();
    await screen.findByTestId('avatar-pick-elena');
    sendDraft('perPersonCents', { suggested: ['budgetCents'], perPersonCents: 2500 });

    expect(await screen.findByTestId('interview-draft-notice')).toHaveTextContent('Cuota');
    expect(screen.getByTestId('interview-step-6')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('interview-price')).toHaveValue(25);
  });

  it('la corrección manual no la pisa el borrador', async () => {
    renderInterview();
    await screen.findByTestId('avatar-pick-elena');
    fireEvent.click(screen.getByTestId('interview-step-4'));
    fireEvent.change(screen.getByTestId('interview-location'), { target: { value: 'El parque' } });
    sendDraft('location', { suggested: ['title', 'date', 'startTime', 'location'], location: 'Mi casa' });

    // El paso se activa, pero el valor manual se conserva.
    expect(await screen.findByTestId('interview-draft-notice')).toBeInTheDocument();
    expect(screen.getByTestId('interview-location')).toHaveValue('El parque');
  });

  it('los pasos se recorren a mano con Siguiente y Atrás', async () => {
    renderInterview();
    await screen.findByTestId('avatar-pick-elena');
    fireEvent.change(screen.getByTestId('interview-title'), { target: { value: 'Asado' } });
    fireEvent.click(screen.getByTestId('interview-next'));
    expect(screen.getByTestId('interview-step-2')).toHaveAttribute('aria-current', 'step');
    fireEvent.click(screen.getByTestId('interview-back'));
    expect(screen.getByTestId('interview-step-1')).toHaveAttribute('aria-current', 'step');
  });
});
