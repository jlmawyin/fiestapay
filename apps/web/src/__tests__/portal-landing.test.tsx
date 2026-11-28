/**
 * NAP-U2 — portada de somospanas.com: primera pantalla con avatar, lema y un
 * solo botón dorado, sin menús ni tarjetas de tipo; pasos, muestra con QR,
 * eventos solo si hay y pie mínimo. Sin red real: API mockeada.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import portada from '../../../../contenido/portada.json';
import { I18nProvider } from '../i18n/I18nContext';
import { PortalLandingView } from '../views/PortalLandingView';
import { loopUrlForDefault } from '../components/portal/AvatarSpotlight';
import { api } from '../api/client';

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
  const onNavigateCreate = overrides?.onNavigateCreate ?? vi.fn();
  const view = render(
    <I18nProvider>
      <PortalLandingView
        onNavigateRegister={onNavigateRegister}
        onNavigateLogin={onNavigateLogin}
        onNavigateCreate={onNavigateCreate}
      />
    </I18nProvider>,
  );
  return { ...view, onNavigateLogin, onNavigateRegister, onNavigateCreate };
}

describe('PortalLandingView (NAP-U2)', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
    localStorage.setItem('fp_locale', 'es');
    vi.spyOn(api, 'getPortalEvents').mockResolvedValue({ events: [] });
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('primera pantalla: lema, botón dorado y enlace de idioma, sin menús', () => {
    mount();
    const hero = screen.getByTestId('portal-hero');
    expect(within(hero).getByRole('heading', { level: 1 })).toHaveTextContent(
      'Organiza como panas: un agente te guía de principio a fin',
    );
    expect(within(hero).getByTestId('portal-hero-create')).toHaveTextContent('Conversa como pana');
    expect(within(hero).getByTestId('portal-language-link')).toHaveTextContent('Prefer English?');
    expect(within(hero).queryByRole('navigation')).toBeNull();
    expect(screen.queryByTestId('portal-bar-link-tutorial')).toBeNull();
  });

  it('el botón dorado delega la navegación con arranque de avatar', () => {
    const { onNavigateCreate } = mount();
    fireEvent.click(screen.getByTestId('portal-hero-create'));
    expect(onNavigateCreate).toHaveBeenCalledTimes(1);
  });

  it('el enlace de idioma cambia a inglés con nota pana', () => {
    mount();
    fireEvent.click(screen.getByTestId('portal-language-link'));
    expect(screen.getByTestId('portal-hero-create')).toHaveTextContent('Talk like a pana');
    expect(screen.getByTestId('portal-language-link')).toHaveTextContent('¿Prefieres español?');
    expect(screen.getByText('pana = friend in Ecuador')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Plan it like friends do, like a pana');
  });

  it('en inglés se ve lema, nota, botón dorado y enlace a español', () => {
    localStorage.setItem('fp_locale', 'en');
    mount();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Plan it like friends do, like a pana');
    expect(screen.getByText('pana = friend in Ecuador')).toBeTruthy();
    expect(screen.getByTestId('portal-hero-create')).toHaveTextContent('Talk like a pana');
    expect(screen.getByTestId('portal-language-link')).toHaveTextContent('¿Prefieres español?');
    // NAP-U2: sin español mezclado en la primera pantalla inglesa.
    for (const testigo of ['Organiza como panas', 'Conversa como pana', 'En tres pasos', 'Lo que obtienes']) {
      expect(screen.queryByText(testigo)).toBeNull();
    }
  });

  it('la avatar saluda con subtítulo, foto y sello Napster', () => {
    mount();
    expect(screen.getByTestId('portal-avatar-greeting')).toHaveTextContent('¡Hola! Soy tu guía de Somos Panas.');
    const photo = screen.getByTestId('portal-avatar-photo') as HTMLImageElement;
    expect(photo.getAttribute('src')).toContain('http');
    expect(photo.getAttribute('alt')).toBe('Foto de tu guía de Somos Panas');
    expect(screen.getByTestId('portal-powered')).toHaveTextContent('Powered by Napster');
  });

  it('los tres pasos se activan al tocarlos', () => {
    mount();
    const steps = screen.getByTestId('portal-steps');
    expect(within(steps).getByTestId('portal-step-0')).toHaveTextContent('Conversa');
    expect(within(steps).getByTestId('portal-step-1')).toHaveTextContent('Revisa');
    expect(within(steps).getByTestId('portal-step-2')).toHaveTextContent('Comparte');
    expect(screen.getByTestId('portal-step-0').getAttribute('aria-current')).toBe('step');
    fireEvent.click(screen.getByTestId('portal-step-2'));
    expect(screen.getByTestId('portal-step-2').getAttribute('aria-current')).toBe('step');
    expect(screen.getByTestId('portal-step-0').getAttribute('aria-current')).toBeNull();
  });

  it('la muestra trae invitación terminada con QR real', () => {
    mount();
    const sample = screen.getByTestId('portal-sample-invite');
    expect(within(sample).getByText('Cumple de María')).toBeTruthy();
    expect(within(sample).getByText('cumpledemaria.somospanas.com')).toBeTruthy();
    const qr = screen.getByTestId('portal-sample-qr').querySelector('svg');
    expect(qr).toBeTruthy();
    expect(qr?.querySelectorAll('path,rect').length).toBeGreaterThan(0);
  });

  it('sin eventos no hay sección de eventos ni avisos de muestra', () => {
    mount();
    expect(screen.queryByTestId('portal-events')).toBeNull();
    expect(screen.queryByText(/fotos de muestra/i)).toBeNull();
    expect(screen.queryByText(/tarjetas.*muestra/i)).toBeNull();
  });

  it('con eventos, cada tarjeta abre su enlace', async () => {
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
      ],
    });
    mount();
    const card = await screen.findByTestId('portal-listed-event-asado-jardin');
    expect(within(card).getByText(/Vecinos del Norte/)).toBeTruthy();
    expect(within(card).getByRole('link').getAttribute('href')).toBe(
      'https://vecinos-norte.somospanas.com/e/asado-jardin',
    );
  });

  it('el pie trae logo, accesos de cuenta y reunión', () => {
    const { onNavigateLogin, onNavigateRegister } = mount();
    const footer = screen.getByTestId('portal-footer');
    expect(within(footer).getByTestId('site-logo')).toBeTruthy();
    fireEvent.click(within(footer).getByText('Registrarse'));
    expect(onNavigateRegister).toHaveBeenCalledTimes(1);
    fireEvent.click(within(footer).getByText('Iniciar sesión'));
    expect(onNavigateLogin).toHaveBeenCalledTimes(1);
    expect(within(footer).getByTestId('portal-organize-meeting')).toHaveTextContent('Organizar una reunión');
  });

  it('tiñe el body solo mientras está montada', () => {
    const { unmount } = mount();
    expect(document.body.classList.contains('portal-body')).toBe(true);
    unmount();
    expect(document.body.classList.contains('portal-body')).toBe(false);
  });

  it('la barra mínima trae logo y tema, sin menús', () => {
    mount();
    const bar = screen.getByTestId('portal-bar');
    expect(within(bar).getByTestId('site-logo')).toBeTruthy();
    expect(within(bar).getByTestId('theme-toggle')).toBeTruthy();
    expect(within(bar).queryByRole('navigation')).toBeNull();
  });

  it('refleja un cambio real en portada.json sin editar el componente', async () => {
    const baseline = JSON.parse(readFileSync(portadaJsonPath, 'utf8')) as typeof portada;
    portadaState.data = structuredClone(baseline);
    portadaState.data.hero.titulo.es = 'Título de prueba U2';
    vi.resetModules();
    const { PortalLandingView: VistaPortada } = await import('../views/PortalLandingView');
    render(
      <I18nProvider>
        <VistaPortada onNavigateRegister={() => undefined} onNavigateLogin={() => undefined} />
      </I18nProvider>,
    );
    expect(within(screen.getByTestId('portal-hero')).getByRole('heading', { level: 1 })).toHaveTextContent(
      'Título de prueba U2',
    );
    portadaState.data = structuredClone(baseline);
  });

  it('sin portada.json nuevo no hay botones huérfanos', () => {
    // Las claves NAP-U2 son opcionales en el render: un JSON viejo no rompe.
    const baseline = JSON.parse(readFileSync(portadaJsonPath, 'utf8')) as typeof portada;
    portadaState.data = structuredClone(baseline);
    const hero = portadaState.data.hero as Record<string, unknown>;
    delete hero.botonConversar;
    delete hero.enlaceIdioma;
    delete hero.pasos;
    delete hero.muestra;
    mount();
    expect(screen.queryByTestId('portal-hero-create')).toBeNull();
    expect(screen.queryByTestId('portal-language-link')).toBeNull();
    expect(screen.queryByTestId('portal-sample-invite')).toBeNull();
    portadaState.data = structuredClone(baseline);
  });
});

describe('loopUrl de la avatar default (NAP-U2)', () => {
  it('acepta las envolturas previstas y videoLoopUrl como alias', () => {
    expect(loopUrlForDefault({ loopUrl: 'https://v.test/a.mp4' })).toBe('https://v.test/a.mp4');
    expect(loopUrlForDefault({ videoLoopUrl: 'https://v.test/b.mp4' })).toBe('https://v.test/b.mp4');
    expect(loopUrlForDefault({ default: { loopUrl: 'https://v.test/c.mp4' } })).toBe('https://v.test/c.mp4');
    expect(
      loopUrlForDefault({ avatars: [{ id: 'otro' }, { id: 'default', loopUrl: 'https://v.test/d.mp4' }] }),
    ).toBe('https://v.test/d.mp4');
  });

  it('devuelve null sin contrato, sin default o sin formas válidas', () => {
    expect(loopUrlForDefault(null)).toBeNull();
    expect(loopUrlForDefault({})).toBeNull();
    expect(loopUrlForDefault({ avatars: [{ id: 'default' }] })).toBeNull();
    expect(loopUrlForDefault({ loopUrl: 42 })).toBeNull();
  });

  it('usa el loop si /api/avatars lo trae y vuelve a la foto si falla', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ avatars: [{ id: 'default', loopUrl: 'https://v.test/loop.mp4' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      localStorage.setItem('fp_locale', 'es');
      vi.spyOn(api, 'getPortalEvents').mockResolvedValue({ events: [] });
      render(
        <I18nProvider>
          <PortalLandingView onNavigateRegister={vi.fn()} onNavigateLogin={vi.fn()} />
        </I18nProvider>,
      );
      const video = (await screen.findByTestId('portal-avatar-loop')) as HTMLVideoElement;
      expect(video.getAttribute('src')).toBe('https://v.test/loop.mp4');
      expect(video.muted).toBe(true);
      expect(video.loop).toBe(true);
      expect(video.autoplay).toBe(true);
      expect(video.playsInline).toBe(true);
      fireEvent.error(video);
      expect(await screen.findByTestId('portal-avatar-photo')).toBeTruthy();
      const cssPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'styles', 'portal-landing.css');
      expect(readFileSync(cssPath, 'utf8')).toContain('.portal-spotlight-media');
    } finally {
      vi.unstubAllGlobals();
      cleanup();
      localStorage.clear();
    }
  });
});
