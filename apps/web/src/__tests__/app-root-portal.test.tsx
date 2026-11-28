/**
 * SP6-D-3 — en host raíz no se monta el tutorial del legado al visitar /tutorial.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NapsterCompanionApiSdk,
  type NapsterCompanionApiInstance,
} from '@touchcastllc/napster-companion-api';
import { I18nProvider } from '../i18n/I18nContext';
import { App } from '../App';

vi.mock('../lib/app-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/app-host')>()),
  readAppHostContext: () => ({ kind: 'somospanas-root' as const, isSiteHost: false, slug: null }),
}));

vi.mock('../api/client', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../api/client')>();
  return {
    ...mod,
    api: {
      ...mod.api,
      getPortalEvents: vi.fn().mockResolvedValue({ events: [] }),
      getCapabilities: vi.fn().mockResolvedValue({ email: false, paypal: false }),
      getOrganizerEvents: vi.fn().mockResolvedValue({ events: [] }),
      createAvatarSession: vi.fn().mockResolvedValue({
        token: 'tok-dorado-1',
        handle: '123e4567-e89b-12d3-a456-426614174000',
        visitor: 'public',
        lang: 'es',
        agent: 'default',
      }),
    },
  };
});

vi.mock('@touchcastllc/napster-companion-api', () => ({
  NapsterCompanionApiSdk: { init: vi.fn() },
  DataChannelMessageType: { SEND_MESSAGE: 'send_message', FUNCTION_CALL_OUTPUT: 'send_function_output' },
}));

const initMock = vi.mocked(NapsterCompanionApiSdk.init);

describe('App en host raíz Somos Panas', () => {
  beforeEach(() => {
    cleanup();
    window.history.pushState({}, '', '/tutorial');
  });

  it('mantiene la portada C2 y no muestra TutorialView del legado', async () => {
    render(
      <I18nProvider>
        <App />
      </I18nProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('portal-landing')).toBeTruthy());
    expect(screen.queryByText(/PayPal Sandbox/i)).toBeNull();
    expect(screen.getByTestId('portal-steps')).toBeTruthy();
  });
});

describe('botón dorado de la raíz (NAP-U2)', () => {
  beforeEach(() => {
    cleanup();
    window.history.pushState({}, '', '/');
    localStorage.setItem('fp_locale', 'es');
    Element.prototype.scrollIntoView = vi.fn();
    initMock.mockImplementation(async (getToken) => {
      await getToken();
      return { destroy: vi.fn(), sendCommand: vi.fn() } as unknown as NapsterCompanionApiInstance;
    });
  });

  it('va a /create y arranca la avatar con el mismo clic', async () => {
    render(
      <I18nProvider>
        <App />
      </I18nProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('portal-landing')).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByTestId('portal-hero-create'));
    });
    expect(window.location.pathname).toBe('/create');
    await waitFor(() => expect(initMock).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('napster-avatar-live')).toBeTruthy();
  });
});