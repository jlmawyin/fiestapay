/**
 * Portada mínima de un subdominio de grupo (SP-5): muestra textos y módulos del tenant.
 * Textos de UI desde `contenido/sitio.json`; datos del sitio desde `/api/site/profile`.
 * SP5-D-1: importa `estilos/tokens.css` y pinta con `var(--sp-color-*)`.
 */
import React from 'react';
import '../../../../estilos/tokens.css';
import '../styles/site-shell.css';
import sitio from '../../../../contenido/sitio.json';
import { useI18n } from '../i18n/I18nContext';
import type { TenantSiteSettings } from '../lib/site-types';

type LocaleKey = 'es' | 'en';

function pick<T extends Record<LocaleKey, string>>(block: T, locale: LocaleKey): string {
  return block[locale] ?? block.es;
}

export interface SiteHomeViewProps {
  settings: TenantSiteSettings;
  onNavigateSettings: () => void;
}

export const SiteHomeView: React.FC<SiteHomeViewProps> = ({ settings, onNavigateSettings }) => {
  const { locale } = useI18n();
  const lang = (locale === 'en' ? 'en' : 'es') as LocaleKey;
  const copy = sitio.inicio;

  return (
    <section className="site-shell" style={{ maxWidth: '40rem', margin: '0 auto', padding: '1.5rem' }}>
      <header style={{ marginBottom: '1.5rem' }}>
        <h1 data-testid="site-display-name" style={{ margin: 0, color: 'var(--sp-color-ink)' }}>
          {settings.displayName}
        </h1>
        {settings.tagline ? (
          <p className="site-muted" data-testid="site-tagline">
            {settings.tagline}
          </p>
        ) : null}
        <button type="button" className="site-btn" onClick={onNavigateSettings} style={{ marginTop: '0.5rem' }}>
          {pick(copy.irAjustes, lang)}
        </button>
      </header>
      {settings.about ? <p style={{ color: 'var(--sp-color-ink)' }}>{settings.about}</p> : null}
      {settings.modulos.recaudacion ? (
        <aside
          data-testid="site-fundraising-block"
          aria-labelledby="site-fundraising-heading"
          style={{ marginTop: '2rem' }}
        >
          <h2 id="site-fundraising-heading" style={{ color: 'var(--sp-color-ink)' }}>
            {pick(copy.recaudacionTitulo, lang)}
          </h2>
          <p className="site-muted">{pick(copy.recaudacionTexto, lang)}</p>
        </aside>
      ) : null}
    </section>
  );
};