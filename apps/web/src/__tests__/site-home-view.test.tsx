/**
 * SP5-D-1 / SP5-D-7 — portada del sitio: colores visibles y módulo recaudación.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '../i18n/I18nContext';
import { siteThemeStyle } from '../lib/site-theme';
import type { TenantSiteSettings } from '../lib/site-types';
import { SiteHomeView } from '../views/SiteHomeView';

const baseSettings: TenantSiteSettings = {
  displayName: 'Grupo prueba',
  tagline: 'Juntos',
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
  modulos: { reuniones: true, eventos: true, recaudacion: true, asistente: true },
};

describe('SiteHomeView', () => {
  it('oculta el bloque de recaudación cuando el módulo está apagado', () => {
    render(
      <I18nProvider>
        <SiteHomeView
          settings={{ ...baseSettings, modulos: { ...baseSettings.modulos, recaudacion: false } }}
          onNavigateSettings={() => undefined}
        />
      </I18nProvider>,
    );
    expect(screen.queryByTestId('site-fundraising-block')).toBeNull();
  });

  it('aplica el color ink guardado al título visible', () => {
    const settings = {
      ...baseSettings,
      colores: { ...baseSettings.colores, ink: '#FF0000' },
    };
    const { container } = render(
      <div style={siteThemeStyle(settings)}>
        <I18nProvider>
          <SiteHomeView settings={settings} onNavigateSettings={() => undefined} />
        </I18nProvider>
      </div>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.getPropertyValue('--sp-color-ink')).toBe('#FF0000');
    const title = within(wrapper).getByTestId('site-display-name');
    expect(title.style.color).toBe('var(--sp-color-ink)');
    expect(wrapper.querySelector('.site-shell')).toBeTruthy();
  });
});