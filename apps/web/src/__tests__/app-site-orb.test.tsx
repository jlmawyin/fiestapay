/**
 * SP5-D-7 — el subdominio no reutiliza el orbe FiestaPay; el legado sí lo muestra en home.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hostState = vi.hoisted(() => ({ isSiteHost: true as boolean, slug: 'grupo' as string | null }));

vi.mock('../lib/site-host', () => ({
  readSiteHostContext: () => ({ isSiteHost: hostState.isSiteHost, slug: hostState.slug }),
}));

const siteSettings = {
  displayName: 'Grupo',
  tagline: '',
  about: '',
  colores: {
    cloudwhite: '#F7FAFC',
    ink: '#12263A',
    inkMuted: '#4A5D73',
    blue: '#125FE6',
    teal: '#0B8075',
    yellow: '#FFC85A',
    coral: '#E85D4A',
  },
  modulos: { reuniones: true, eventos: true, recaudacion: true, asistente: false },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('orbe del asistente según host', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('en sitio no renderiza el orbe aunque asistente figure en el perfil', async () => {
    hostState.isSiteHost = true;
    hostState.slug = 'grupo';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ settings: siteSettings }), { status: 200 })),
    );
    const { I18nProvider } = await import('../i18n/I18nContext');
    const { App } = await import('../App');
    render(
      <I18nProvider>
        <App />
      </I18nProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('site-display-name')).toBeTruthy());
    expect(screen.queryByTestId('orb-pill')).toBeNull();
  });

  it('en host legado muestra el orbe en la portada', async () => {
    hostState.isSiteHost = false;
    hostState.slug = null;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            paypal: false,
            chat: false,
            voice: false,
            llmProvider: 'openai',
            sandbox: true,
            email: false,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ events: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { I18nProvider } = await import('../i18n/I18nContext');
    const { App } = await import('../App');
    render(
      <I18nProvider>
        <App />
      </I18nProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('orb-pill')).toBeTruthy());
  });
});