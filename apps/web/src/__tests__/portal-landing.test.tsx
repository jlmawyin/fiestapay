/**
 * SP-6 — portada C2 en la raíz: contenido JSON, navegación de barra y crear espacio.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import portada from '../../../../contenido/portada.json';
import { I18nProvider } from '../i18n/I18nContext';
import { PortalLandingView } from '../views/PortalLandingView';
import { ApiError, api } from '../api/client';

const { portadaState, portadaJsonPath } = vi.hoisted(() => {
  /* vi.hoisted corre antes que los imports ESM; require es el patrón soportado aquí */
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- hoisted pre-import
  const { readFileSync: readJson } = require('node:fs') as typeof import('node:fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- hoisted pre-import
  const { join, dirname } = require('node:path') as typeof import('node:path');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- hoisted pre-import
  const { fileURLToPath } = require('node:url') as typeof import('node:url');
  const path = join(dirname(fileURLToPath(import.meta.url)), '../../../../contenido/portada.json');
  return {
    portadaJsonPath: path,
    portadaState: { data: JSON.parse(readJson(path, 'utf8')) },
  };
});

vi.mock('../../../../contenido/portada.json', () => ({
  get default() {
    return portadaState.data;
  },
}));

vi.mock('../lib/app-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/app-host')>()),
  readAppHostContext: () => ({ kind: 'somospanas-root' as const, isSiteHost: false, slug: null }),
}));

function mount(overrides?: Partial<Parameters<typeof PortalLandingView>[0]>) {
  const onNavigateLogin = overrides?.onNavigateLogin ?? vi.fn();
  const onNavigateRegister = overrides?.onNavigateRegister ?? vi.fn();
  const view = render(
    <I18nProvider>
      <PortalLandingView onNavigateRegister={onNavigateRegister} onNavigateLogin={onNavigateLogin} />
    </I18nProvider>,
  );
  return { ...view, onNavigateLogin, onNavigateRegister };
}

describe('PortalLandingView (SP-6)', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.spyOn(api, 'getPortalEvents').mockResolvedValue({ events: [] });
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('muestra selector de idioma en la barra (SP6-D-1)', () => {
    mount();
    expect(within(screen.getByTestId('portal-bar')).getByTestId('portal-language-selector')).toBeTruthy();
  });

  it('Tutorial guiado en la barra hace scroll a los cuatro pasos (SP6-D-2)', () => {
    mount();
    fireEvent.click(screen.getByTestId('portal-bar-link-tutorial'));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(screen.getByTestId('portal-steps')).toBeTruthy();
  });

  it('Iniciar sesión en la barra llama onNavigateLogin (SP6-D-2)', () => {
    const { onNavigateLogin } = mount();
    fireEvent.click(screen.getByTestId('portal-bar-link-iniciar-sesion'));
    expect(onNavigateLogin).toHaveBeenCalledTimes(1);
  });

  it('el pie repite la navegación: tutorial → pasos e inicio de sesión (SP6-D-2)', () => {
    const { onNavigateLogin } = mount();
    fireEvent.click(screen.getByTestId('portal-footer-link-tutorial'));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('portal-footer-link-iniciar-sesion'));
    expect(onNavigateLogin).toHaveBeenCalledTimes(1);
    expect(within(screen.getByTestId('portal-footer')).getByText(portada.barra.marca.es)).toBeTruthy();
  });

  it('el botón del hero lleva a la sección de pasos, no al tutorial del legado (SP6-D-3)', () => {
    mount();
    fireEvent.click(screen.getByTestId('portal-hero-tutorial'));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(within(screen.getByTestId('portal-steps')).getByText(/Crea tu espacio/i)).toBeTruthy();
  });

  it('lista eventos live y example con badge de ejemplo en plantilla (SP6-D-5)', async () => {
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
          listingKind: 'live',
        },
        {
          slug: 'muestra-feria',
          title: 'Feria de muestra',
          startsAt: '2026-12-05T18:00:00.000Z',
          endsAt: '2026-12-05T22:00:00.000Z',
          location: 'Cuenca',
          siteSlug: 'muestra',
          siteName: 'Plantilla',
          url: 'https://muestra.somospanas.com/e/muestra-feria',
          listingKind: 'example',
        },
      ],
    });
    mount();
    const live = await screen.findByTestId('portal-listed-event-asado-jardin');
    expect(within(live).getByText(/Vecinos del Norte/)).toBeTruthy();
    expect(screen.queryByTestId('portal-listed-badge-example-asado-jardin')).toBeNull();
    const sample = await screen.findByTestId('portal-listed-event-muestra-feria');
    expect(within(sample).getByTestId('portal-listed-badge-example-muestra-feria')).toBeTruthy();
  });

  it('rechaza slug inválido antes del POST (SP6-D-7)', async () => {
    const create = vi.spyOn(api, 'createSiteSpace');
    mount();
    fireEvent.change(screen.getByTestId('portal-slug-input'), { target: { value: 'MAL slug!' } });
    fireEvent.click(screen.getByTestId('portal-create-space'));
    await waitFor(() => expect(screen.getByTestId('portal-slug-error')).toBeTruthy());
    expect(create).not.toHaveBeenCalled();
  });

  it('rechaza `muestra` como reservado antes del POST (NAP-F1b/SP-7)', async () => {
    const create = vi.spyOn(api, 'createSiteSpace');
    mount();
    fireEvent.change(screen.getByTestId('portal-slug-input'), { target: { value: 'muestra' } });
    fireEvent.click(screen.getByTestId('portal-create-space'));
    await waitFor(() => expect(screen.getByTestId('portal-slug-error')).toBeTruthy());
    expect(create).not.toHaveBeenCalled();
  });

  it('el placeholder del compositor usa ink-muted con opacity 1 (SP6-D-4)', () => {
    // jsdom no calcula ::placeholder; se verifica la regla servida y portal-contrast
    // prueba el par ink-muted/cloudwhite (6.45:1) sobre los tokens reales.
    const cssPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'styles', 'portal-landing.css');
    const block = readFileSync(cssPath, 'utf8').match(/\.portal-compositor-row input::placeholder\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(block).toMatch(/color:\s*var\(--sp-color-ink-muted\)/);
    expect(block).toMatch(/opacity:\s*1\s*;/);
  });

  it('POST /api/sites 404 muestra estado no disponible', async () => {
    vi.spyOn(api, 'createSiteSpace').mockRejectedValue(new ApiError('Ruta no encontrada', 404));
    mount();
    fireEvent.change(screen.getByTestId('portal-slug-input'), { target: { value: 'mi-grupo' } });
    fireEvent.click(screen.getByTestId('portal-create-space'));
    await waitFor(() => expect(screen.getByTestId('portal-create-unavailable')).toBeTruthy());
  });

  it('POST /api/sites 401 muestra el error del servidor (SP6-D-7)', async () => {
    vi.spyOn(api, 'createSiteSpace').mockRejectedValue(new ApiError('No autorizado', 401));
    mount();
    fireEvent.change(screen.getByTestId('portal-slug-input'), { target: { value: 'mi-grupo' } });
    fireEvent.click(screen.getByTestId('portal-create-space'));
    await waitFor(() => expect(screen.getByText(/No autorizado/i)).toBeTruthy());
  });

  it('POST /api/sites 409 muestra el conflicto (SP6-D-7)', async () => {
    vi.spyOn(api, 'createSiteSpace').mockRejectedValue(new ApiError('Slug ocupado', 409));
    mount();
    fireEvent.change(screen.getByTestId('portal-slug-input'), { target: { value: 'ocupado' } });
    fireEvent.click(screen.getByTestId('portal-create-space'));
    await waitFor(() => expect(screen.getByText(/Slug ocupado/i)).toBeTruthy());
  });

  it('POST /api/sites 201 con contrato congelado (mock)', async () => {
    vi.spyOn(api, 'createSiteSpace').mockResolvedValue({
      site: { slug: 'tu-grupo', url: 'https://tu-grupo.somospanas.com' },
      handoff: { code: 'codigo-una-vez', expiresAt: '2026-12-01T12:00:00.000Z' },
    });
    mount();
    fireEvent.change(screen.getByTestId('portal-slug-input'), { target: { value: 'tu-grupo' } });
    fireEvent.click(screen.getByTestId('portal-create-space'));
    await waitFor(() => expect(screen.getByTestId('portal-create-success')).toBeTruthy());
  });

  it('refleja un cambio real en portada.json sin editar el componente', async () => {
    const baseline = JSON.parse(readFileSync(portadaJsonPath, 'utf8')) as typeof portada;
    portadaState.data = structuredClone(baseline);
    portadaState.data.hero.titulo.es = 'Título de prueba SP6';
    vi.resetModules();
    const { PortalLandingView: VistaPortada } = await import('../views/PortalLandingView');
    render(
      <I18nProvider>
        <VistaPortada onNavigateRegister={() => undefined} onNavigateLogin={() => undefined} />
      </I18nProvider>,
    );
    expect(within(screen.getByTestId('portal-hero')).getByRole('heading', { level: 1 })).toHaveTextContent(
      'Título de prueba SP6',
    );
    portadaState.data = structuredClone(baseline);
  });
});