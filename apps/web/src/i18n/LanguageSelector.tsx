import React from 'react';
import { UI_LABELS, type Locale } from '@fiestapay/shared';
import { useI18n } from './I18nContext';

/**
 * Visible Español/English switch. A native select keeps it compact on a
 * 360px header and accessible without custom focus or keyboard handling.
 */
export const LanguageSelector: React.FC = () => {
  const { locale, setLocale } = useI18n();
  const labels = UI_LABELS[locale];

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next: Locale = event.target.value === 'en' ? 'en' : 'es';
    if (next !== locale) setLocale(next);
  };

  return (
    <label className="fp-lang" htmlFor="fp-language-select">
      <span aria-hidden="true">🌐</span>
      <span>{labels.languageSelector}</span>
      <select
        id="fp-language-select"
        value={locale}
        onChange={handleChange}
        aria-label={labels.languageSelector}
      >
        <option value="es">Español</option>
        <option value="en">English</option>
      </select>
    </label>
  );
};
