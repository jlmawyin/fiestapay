/**
 * Pantalla de ajustes del sitio (SP-5) para admins del subdominio.
 * Etiquetas en `contenido/sitio.json`; guardado vía PUT `/api/site/settings`.
 */
import React, { useMemo, useState } from 'react';
import sitio from '../../../../contenido/sitio.json';
import { useI18n } from '../i18n/I18nContext';
import type { TenantSiteSettings } from '../lib/site-types';
import { DEFAULT_SITE_COLORS } from './site-settings-defaults';

type LocaleKey = 'es' | 'en';

function pick<T extends Record<LocaleKey, string>>(block: T, locale: LocaleKey): string {
  return block[locale] ?? block.es;
}

export interface SiteSettingsViewProps {
  initial: TenantSiteSettings;
  onSaved: (settings: TenantSiteSettings) => void;
  onBack: () => void;
}

export const SiteSettingsView: React.FC<SiteSettingsViewProps> = ({ initial, onSaved, onBack }) => {
  const { locale } = useI18n();
  const lang = (locale === 'en' ? 'en' : 'es') as LocaleKey;
  const copy = useMemo(() => sitio.ajustes, []);
  const [form, setForm] = useState<TenantSiteSettings>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setColor = (key: keyof TenantSiteSettings['colores'], value: string) => {
    setForm((prev) => ({ ...prev, colores: { ...prev.colores, [key]: value } }));
  };

  const setModule = (key: keyof TenantSiteSettings['modulos'], value: boolean) => {
    setForm((prev) => ({ ...prev, modulos: { ...prev.modulos, [key]: value } }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/site/settings', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Origin: window.location.origin },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as { error?: string; settings?: TenantSiteSettings };
      if (!res.ok) {
        setError(data.error ?? 'No se pudo guardar');
        return;
      }
      if (data.settings) onSaved(data.settings);
    } catch {
      setError(pick({ es: 'Error de red.', en: 'Network error.' }, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={{ maxWidth: '36rem', margin: '0 auto', padding: '1.5rem' }}>
      <h1>{pick(copy.titulo, lang)}</h1>
      <form onSubmit={submit}>
        <label style={{ display: 'block', marginBottom: '0.75rem' }}>
          {pick(copy.nombre, lang)}
          <input
            value={form.displayName}
            onChange={(e) => setForm((p) => ({ ...p, displayName: e.target.value }))}
            required
            maxLength={120}
            style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
          />
        </label>
        <label style={{ display: 'block', marginBottom: '0.75rem' }}>
          {pick(copy.frase, lang)}
          <input
            value={form.tagline}
            onChange={(e) => setForm((p) => ({ ...p, tagline: e.target.value }))}
            maxLength={200}
            style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
          />
        </label>
        <label style={{ display: 'block', marginBottom: '0.75rem' }}>
          {pick(copy.acerca, lang)}
          <textarea
            value={form.about}
            onChange={(e) => setForm((p) => ({ ...p, about: e.target.value }))}
            maxLength={4000}
            rows={4}
            style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
          />
        </label>
        <fieldset style={{ marginBottom: '1rem' }}>
          <legend>{pick(copy.colores, lang)}</legend>
          {(Object.keys(DEFAULT_SITE_COLORS) as (keyof typeof DEFAULT_SITE_COLORS)[]).map((key) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
              <span style={{ width: '6rem' }}>{key}</span>
              <input
                type="color"
                value={form.colores[key]}
                onChange={(e) => setColor(key, e.target.value)}
                aria-label={key}
              />
              <input
                value={form.colores[key]}
                onChange={(e) => setColor(key, e.target.value)}
                pattern="^#[0-9A-Fa-f]{6}$"
                style={{ width: '7rem' }}
              />
            </label>
          ))}
        </fieldset>
        <fieldset style={{ marginBottom: '1rem' }}>
          <legend>{pick(copy.modulos, lang)}</legend>
          <label style={{ display: 'block' }}>
            <input
              type="checkbox"
              checked={form.modulos.reuniones}
              onChange={(e) => setModule('reuniones', e.target.checked)}
            />{' '}
            {pick(copy.moduloReuniones, lang)}
          </label>
          <label style={{ display: 'block' }}>
            <input
              type="checkbox"
              checked={form.modulos.eventos}
              onChange={(e) => setModule('eventos', e.target.checked)}
            />{' '}
            {pick(copy.moduloEventos, lang)}
          </label>
          <label style={{ display: 'block' }}>
            <input
              type="checkbox"
              checked={form.modulos.recaudacion}
              onChange={(e) => setModule('recaudacion', e.target.checked)}
            />{' '}
            {pick(copy.moduloRecaudacion, lang)}
          </label>
          <label style={{ display: 'block' }}>
            <input
              type="checkbox"
              checked={form.modulos.asistente}
              onChange={(e) => setModule('asistente', e.target.checked)}
            />{' '}
            {pick(copy.moduloAsistente, lang)}
          </label>
        </fieldset>
        {error ? <p role="alert">{error}</p> : null}
        <button type="submit" disabled={busy}>
          {pick(copy.guardar, lang)}
        </button>
        <button type="button" onClick={onBack} style={{ marginLeft: '0.5rem' }}>
          {pick(copy.volver, lang)}
        </button>
      </form>
    </section>
  );
};