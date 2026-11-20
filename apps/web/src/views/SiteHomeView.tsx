/**
 * Portada mínima de un subdominio de grupo (SP-5): muestra textos y módulos del tenant.
 * Textos de UI desde `contenido/sitio.json`; datos del sitio desde `/api/site/profile`.
 */
import React from 'react';
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
    <section style={{ maxWidth: '40rem', margin: '0 auto', padding: '1.5rem' }}>
      <header style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>{settings.displayName}</h1>
        {settings.tagline ? <p style={{ color: 'var(--sp-color-ink-muted, #4A5D73)' }}>{settings.tagline}</p> : null}
        <button type="button" onClick={onNavigateSettings} style={{ marginTop: '0.5rem' }}>
          {pick(copy.irAjustes, lang)}
        </button>
      </header>
      {settings.about ? <p>{settings.about}</p> : null}
      {settings.modulos.recaudacion ? (
        <aside aria-labelledby="site-fundraising-heading" style={{ marginTop: '2rem' }}>
          <h2 id="site-fundraising-heading">{pick(copy.recaudacionTitulo, lang)}</h2>
          <p>{pick(copy.recaudacionTexto, lang)}</p>
        </aside>
      ) : null}
    </section>
  );
};