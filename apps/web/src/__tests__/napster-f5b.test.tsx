/**
 * NAP-F5b — la avatar Napster como único asistente: la tarjeta respeta
 * `capabilities.avatar` (con `false` muestra el recorrido fijo sin tocar la
 * red) y el aviso AVATAR_OPEN_EVENT arranca la sesión montada.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NapsterCompanionApiSdk,
  type NapsterCompanionApiConfig,
} from '@touchcastllc/napster-companion-api';
import { I18nProvider } from '../i18n/I18nContext';
import { NapsterAvatar } from '../components/avatar/NapsterAvatar';
import { AVATAR_OPEN_EVENT } from '../components/avatar/avatar-open';
import { ReminderDrafts } from '../components/dashboard/ReminderDrafts';
import { AvatarSessionError, api } from '../api/client';

vi.mock('@touchcastllc/napster-companion-api', () => ({
  NapsterCompanionApiSdk: { init: vi.fn() },
  DataChannelMessageType: { SEND_MESSAGE: 'send_message', FUNCTION_CALL_OUTPUT: 'send_function_output' },
}));

const initMock = vi.mocked(NapsterCompanionApiSdk.init);

beforeEach(() => {
  localStorage.setItem('fp_locale', 'es');
  Element.prototype.scrollIntoView = vi.fn();
  // Imita al SDK real: getToken dentro de init; si falla, onError y rechazo.
  initMock.mockImplementation(async (getToken, config) => {
    try {
      await getToken();
    } catch (error) {
      (config as NapsterCompanionApiConfig | undefined)?.onError?.(error as Error);
      throw error;
    }
    return { destroy: vi.fn() } as never;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('avatar gating por capabilities.avatar (NAP-F5b)', () => {
  it('con avatarEnabled=false muestra el recorrido fijo sin fetch ni botón de video', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(
      <I18nProvider>
        <NapsterAvatar avatarEnabled={false} />
      </I18nProvider>,
    );

    expect(screen.getByTestId('napster-avatar-fallback')).toBeInTheDocument();
    expect(screen.getByTestId('napster-avatar-tutorial')).toBeInTheDocument();
    expect(screen.queryByTestId('napster-avatar-start')).toBeNull();
    expect(screen.queryByTestId('napster-avatar-retry')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sin dato de capabilities ofrece la bienvenida con video', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(
      <I18nProvider>
        <NapsterAvatar />
      </I18nProvider>,
    );

    expect(screen.getByTestId('napster-avatar')).toBeInTheDocument();
    expect(screen.getByText('Hola, soy tu guía de Somos Panas')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('el aviso AVATAR_OPEN_EVENT arranca la sesión de la tarjeta montada', async () => {
    const session = vi
      .spyOn(api, 'createAvatarSession')
      .mockRejectedValue(new AvatarSessionError('caído', 503, 'avatar_upstream'));
    render(
      <I18nProvider>
        <NapsterAvatar />
      </I18nProvider>,
    );

    document.dispatchEvent(new CustomEvent(AVATAR_OPEN_EVENT));
    expect(await screen.findByTestId('napster-avatar-fallback')).toBeInTheDocument();
    expect(session).toHaveBeenCalledTimes(1);
  });

  it('el panel de recordatorios abre la avatar sin llamar a la red', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const session = vi
      .spyOn(api, 'createAvatarSession')
      .mockRejectedValue(new AvatarSessionError('caído', 503, 'avatar_upstream'));
    render(
      <I18nProvider>
        <NapsterAvatar />
        <ReminderDrafts />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Preparar recordatorios' }));
    expect(await screen.findByTestId('napster-avatar-fallback')).toBeInTheDocument();
    expect(session).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
