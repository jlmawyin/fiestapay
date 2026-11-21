/**
 * SP6-D-3 — en host raíz no se monta el tutorial FiestaPay al visitar /tutorial.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nContext';
import { App } from '../App';

vi.mock('../lib/app-host', () => ({
  readAppHostContext: () => ({ kind: 'somospanas-root', isSiteHost: false, slug: null }),
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
    },
  };
});

describe('App en host raíz Somos Panas', () => {
  beforeEach(() => {
    cleanup();
    window.history.pushState({}, '', '/tutorial');
  });

  it('mantiene la portada C2 y no muestra TutorialView de FiestaPay', async () => {
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