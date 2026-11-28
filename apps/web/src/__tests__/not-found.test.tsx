/**
 * NAP-U2 — página de no encontrado: rutas desconocidas en ES y EN, con botón
 * a la portada. App real con host mockeado; sin red.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nContext';
import { App } from '../App';

vi.mock('../lib/app-host', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/app-host')>();
  return {
    ...actual,
    readAppHostContext: () => ({ kind: 'somospanas-root' as const, isSiteHost: false, slug: null }),
  };
});

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

describe('NotFound (NAP-U2)', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('fp_locale', 'es');
  });

  it('una ruta desconocida muestra el 404 en español', async () => {
    window.history.pushState({}, '', '/ruta-que-no-existe');
    render(
      <I18nProvider>
        <App />
      </I18nProvider>,
    );
    expect(await screen.findByTestId('not-found')).toBeTruthy();
    expect(screen.getByText('Aquí no hay nada, pana')).toBeTruthy();
    expect(screen.getByTestId('not-found-home')).toHaveTextContent('Volver a la portada');
  });

  it('el botón vuelve a la portada', async () => {
    window.history.pushState({}, '', '/ruta-que-no-existe');
    render(
      <I18nProvider>
        <App />
      </I18nProvider>,
    );
    fireEvent.click(await screen.findByTestId('not-found-home'));
    await waitFor(() => expect(screen.getByTestId('portal-landing')).toBeTruthy());
    expect(window.location.pathname).toBe('/');
  });

  it('el 404 sale en inglés con la página en inglés', async () => {
    localStorage.setItem('fp_locale', 'en');
    window.history.pushState({}, '', '/some-missing-route');
    render(
      <I18nProvider>
        <App />
      </I18nProvider>,
    );
    expect(await screen.findByTestId('not-found')).toBeTruthy();
    expect(screen.getByText('Nothing here, friend')).toBeTruthy();
    expect(screen.getByTestId('not-found-home')).toHaveTextContent('Back to home');
  });
});
