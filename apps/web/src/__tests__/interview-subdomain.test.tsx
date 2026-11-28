/**
 * NAP-U5 — llegar con ?subdominio=<label> trae la dirección pedida y Revisar
 * muestra «Tu dirección será <label>.somospanas.com» más el aviso de tomada.
 * Una etiqueta inválida se ignora (queda vacío, como antes).
 */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nContext';
import { CreateInterviewView } from '../views/CreateInterviewView';

vi.mock('@touchcastllc/napster-companion-api', () => ({
  NapsterCompanionApiSdk: { init: vi.fn() },
  DataChannelMessageType: { SEND_MESSAGE: 'send_message', FUNCTION_CALL_OUTPUT: 'send_function_output' },
}));

const AVATARS = {
  avatars: [
    { id: 'elena', firstName: 'Elena', displayName: 'Elena Navarro', gender: 'female', previewUrl: 'https://img/e.jpg', loopUrl: null, tags: ['fiesta'], default: true },
  ],
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('dirección pedida desde su subdominio (NAP-U5)', () => {
  beforeEach(() => {
    localStorage.setItem('fp_locale', 'es');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input) === '/api/avatars' ? json(AVATARS) : json({ error: 'sin mock' }, 500),
      ),
    );
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('el label pedido llega al campo y Revisar lo anuncia', async () => {
    window.history.replaceState({}, '', '/create?subdominio=asado-rico');
    render(
      <I18nProvider>
        <CreateInterviewView onDone={vi.fn()} onCancel={vi.fn()} onShowToast={vi.fn()} />
      </I18nProvider>,
    );
    await screen.findByTestId('avatar-pick-elena');
    fireEvent.click(screen.getByTestId('interview-step-7'));
    expect(screen.getByTestId('interview-address')).toHaveValue('asado-rico');
    expect(screen.getByTestId('interview-address-willbe')).toHaveTextContent(
      'Tu dirección será asado-rico.somospanas.com',
    );
    expect(screen.getByTestId('interview-address-willbe')).toHaveTextContent('Si ya está tomada, se le agrega un número.');
  });

  it('sin label o con label inválido el campo queda vacío', async () => {
    window.history.replaceState({}, '', '/create?subdominio=-mal-');
    render(
      <I18nProvider>
        <CreateInterviewView onDone={vi.fn()} onCancel={vi.fn()} onShowToast={vi.fn()} />
      </I18nProvider>,
    );
    await screen.findByTestId('avatar-pick-elena');
    fireEvent.click(screen.getByTestId('interview-step-7'));
    expect(screen.getByTestId('interview-address')).toHaveValue('');
    expect(screen.queryByTestId('interview-address-willbe')).toBeNull();
  });
});
