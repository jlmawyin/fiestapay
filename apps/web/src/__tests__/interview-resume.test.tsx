/**
 * NAP-U5 — cambiar de avatar con sesión en curso conserva el borrador y la
 * nueva sesión recibe un system con el resumen breve de lo ya llenado, para
 * continuar donde iba la anterior. Sin red: fetch y SDK falsos.
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
    { id: 'elena', firstName: 'Elena', displayName: 'Elena Navarro', gender: 'female', previewUrl: 'https://img/e.jpg', loopUrl: null, tags: ['fiesta'], default: true },
    { id: 'marco', firstName: 'Marco', displayName: 'Marco Paz', gender: 'male', previewUrl: 'https://img/m.jpg', loopUrl: null, tags: ['karaoke'], default: false },
  ],
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const SESSION = {
  token: 'tok-1',
  handle: '123e4567-e89b-12d3-a456-426614174000',
  visitor: 'creator',
  lang: 'es',
  agent: 'default',
  avatar: { id: 'elena', firstName: 'Elena', previewUrl: 'https://img/e.jpg' },
};

describe('reinicio con resumen (NAP-U5)', () => {
  const sendCommand = vi.fn();
  const configs: NapsterCompanionApiConfig[] = [];

  beforeEach(() => {
    localStorage.setItem('fp_locale', 'es');
    sendCommand.mockReset();
    configs.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === '/api/avatars') return json(AVATARS);
        if (String(input) === '/api/avatar-session') return json(SESSION);
        return json({ error: 'sin mock' }, 500);
      }),
    );
    Element.prototype.scrollIntoView = vi.fn();
    initMock.mockImplementation(async (getToken, config) => {
      if (config) configs.push(config);
      await getToken();
      return { destroy: vi.fn(), sendCommand } as unknown as NapsterCompanionApiInstance;
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('conserva el borrador y la nueva avatar recibe el resumen', async () => {
    render(
      <I18nProvider>
        <CreateInterviewView onDone={vi.fn()} onCancel={vi.fn()} onShowToast={vi.fn()} />
      </I18nProvider>,
    );
    await screen.findByTestId('avatar-pick-elena');
    fireEvent.click(screen.getByTestId('napster-avatar-start'));
    await screen.findByTestId('napster-avatar-live');

    fireEvent.change(screen.getByTestId('interview-title'), { target: { value: 'Asado del sábado' } });
    fireEvent.click(screen.getByTestId('interview-step-4'));
    fireEvent.change(screen.getByTestId('interview-location'), { target: { value: 'Mi casa' } });

    fireEvent.click(screen.getByTestId('avatar-pick-marco'));
    // La nueva sesión lista: la segunda config marca ready.
    await waitFor(() => expect(configs.length).toBe(2));
    configs[1]!.onData?.({ event: 'avatar_state_changed', data: { state: 'ready' } } as never);

    // El borrador intacto y el resumen viajó como system a la nueva.
    await waitFor(() => expect(sendCommand).toHaveBeenCalled());
    expect(screen.getByTestId('interview-location')).toHaveValue('Mi casa');
    fireEvent.click(screen.getByTestId('interview-step-1'));
    expect(screen.getByTestId('interview-title')).toHaveValue('Asado del sábado');
    const summary = sendCommand.mock.calls.find((call) => String(call[0]?.data?.text).startsWith('Borrador hasta ahora'));
    expect(summary?.[0]).toMatchObject({
      type: 'send_message',
      data: { role: 'system', trigger_response: false },
    });
    expect(String(summary?.[0]?.data?.text)).toContain('Asado del sábado');
    expect(String(summary?.[0]?.data?.text)).toContain('Mi casa');
  });
});
