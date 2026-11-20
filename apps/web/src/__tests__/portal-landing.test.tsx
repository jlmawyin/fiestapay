/**
 * SP-6 — portada C2 en la raíz: contenido JSON, contrato de crear espacio y listado público.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nContext';
import portada from '../../../../contenido/portada.json';
import { PortalLandingView } from '../views/PortalLandingView';
import { ApiError, api } from '../api/client';

vi.mock('../lib/app-host', () => ({
  readAppHostContext: () => ({ kind: 'somospanas-root', isSiteHost: false, slug: null }),
}));

function mount() {
  return render(
    <I18nProvider>
      <PortalLandingView
        onNavigateTutorial={() => undefined}
        onNavigateRegister={() => undefined}
        onNavigateLogin={() => undefined}
      />
    </I18nProvider>,
  );
}

describe('PortalLandingView (SP-6)', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.spyOn(api, 'getPortalEvents').mockResolvedValue({ events: [] });
  });

  it('muestra textos del hero y los dos eventos de ejemplo con badge de ejemplo', () => {
    mount();
    expect(screen.getByTestId('portal-landing')).toBeTruthy();
    expect(within(screen.getByTestId('portal-hero')).getByRole('heading', { level: 1 })).toHaveTextContent(
      portada.hero.titulo.es,
    );
    expect(screen.getByTestId('portal-sample-event-ejemplo-terraza')).toBeTruthy();
    expect(screen.getByTestId('portal-sample-event-ejemplo-casa')).toBeTruthy();
    const sample = screen.getByTestId('portal-sample-event-ejemplo-terraza');
    expect(within(sample).getByText(portada.eventosPublicos.ejemplos[0]!.badgeEjemplo.es)).toBeTruthy();
  });

  it('muestra las dos recaudaciones de ejemplo con leyenda de barra ficticia', () => {
    mount();
    const donations = screen.getByTestId('portal-donations');
    expect(within(donations).getByTestId('portal-sample-donation-ejemplo-olla')).toBeTruthy();
    const olla = within(donations).getByTestId('portal-sample-donation-ejemplo-olla');
    expect(within(olla).getByText(portada.donaciones.ejemplos[0]!.leyendaBarra.es)).toBeTruthy();
  });

  it('muestra los cuatro pasos del tutorial desde contenido/', () => {
    mount();
    const steps = screen.getByTestId('portal-steps');
    expect(within(steps).getByText('01')).toBeTruthy();
    expect(within(steps).getByText('04')).toBeTruthy();
    expect(within(steps).getByText(/Crea tu espacio/i)).toBeTruthy();
  });

  it('lista eventos reales devueltos por el API sin mezclar con privados en la prueba', async () => {
    vi.spyOn(api, 'getPortalEvents').mockResolvedValue({
      events: [
        {
          slug: 'asado-jardin',
          title: 'Asado en el jardín',
          startsAt: '2026-12-01T18:00:00.000Z',
          endsAt: '2026-12-01T22:00:00.000Z',
          location: 'Quito',
          siteSlug: 'vecinos-norte',
          siteName: 'Vecinos del Norte',
          url: 'https://vecinos-norte.somospanas.com/e/asado-jardin',
        },
      ],
    });
    mount();
    const card = await screen.findByTestId('portal-listed-event-asado-jardin');
    expect(within(card).getByText(/Vecinos del Norte/)).toBeTruthy();
    expect(screen.queryByText(/ExANG/i)).toBeNull();
    expect(screen.queryByText(/ExPica/i)).toBeNull();
  });

  it('POST /api/sites 404 muestra estado no disponible', async () => {
    vi.spyOn(api, 'createSiteSpace').mockRejectedValue(new ApiError('Ruta no encontrada', 404));
    mount();
    fireEvent.change(screen.getByTestId('portal-slug-input'), { target: { value: 'mi-grupo' } });
    fireEvent.change(screen.getByTestId('portal-display-name-input'), { target: { value: 'Mi grupo' } });
    fireEvent.click(screen.getByTestId('portal-create-space'));
    await waitFor(() => expect(screen.getByTestId('portal-create-unavailable')).toBeTruthy());
    expect(screen.getByTestId('portal-create-unavailable').textContent).toMatch(/no está disponible|not available/i);
  });

  it('POST /api/sites 201 muestra el contrato congelado (mock)', async () => {
    vi.spyOn(api, 'createSiteSpace').mockResolvedValue({
      site: { slug: 'tu-grupo', url: 'https://tu-grupo.somospanas.com' },
      handoff: { code: 'codigo-una-vez', expiresAt: '2026-12-01T12:00:00.000Z' },
    });
    mount();
    fireEvent.change(screen.getByTestId('portal-slug-input'), { target: { value: 'tu-grupo' } });
    fireEvent.change(screen.getByTestId('portal-display-name-input'), { target: { value: 'Tu grupo' } });
    fireEvent.click(screen.getByTestId('portal-create-space'));
    await waitFor(() => expect(screen.getByTestId('portal-create-success')).toBeTruthy());
    expect(screen.getByText('https://tu-grupo.somospanas.com')).toBeTruthy();
  });

  it('cambia el título del hero al cambiar portada.json (lectura directa)', () => {
    mount();
    expect(within(screen.getByTestId('portal-hero')).getByRole('heading', { level: 1 })).toHaveTextContent(
      portada.hero.titulo.es,
    );
  });
});