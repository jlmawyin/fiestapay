import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_LOCALE,
  LOCALE_QUERY_PARAM,
  LOCALE_STORAGE_KEY,
  formatEventDateTime as sharedFormatDateTime,
  formatMoney as sharedFormatMoney,
  normalizeLocale,
  type Locale,
} from '@fiestapay/shared';
import { setActiveLocale } from './locale-store';
import type { LocaleCatalog, Messages } from './catalog';

export interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  formatMoney: (cents: number) => string;
  formatDateTime: (iso: string | Date, options?: Intl.DateTimeFormatOptions) => string;
}

function defaultValue(): I18nValue {
  return {
    locale: DEFAULT_LOCALE,
    setLocale: () => undefined,
    formatMoney: (cents) => sharedFormatMoney(cents, DEFAULT_LOCALE),
    formatDateTime: (iso, options) => sharedFormatDateTime(iso, DEFAULT_LOCALE, options),
  };
}

const I18nContext = createContext<I18nValue>(defaultValue());

function persistLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Private mode or a throwing storage: the app keeps working in memory.
  }
}

function applyLocaleSideEffects(locale: Locale): void {
  setActiveLocale(locale);
  try {
    document.documentElement.lang = locale;
  } catch {
    // Non-DOM renderers never reach here in practice.
  }
}

/**
 * Browser language: the first `navigator.languages` entry, or
 * `navigator.language` when the list is empty. A base of `en`
 * (case-insensitive, `en-US` counts) selects English; anything else is Spanish.
 */
function resolveBrowserLocale(): Locale {
  try {
    const nav = window.navigator;
    const first =
      Array.isArray(nav.languages) && nav.languages.length > 0 ? nav.languages[0] : nav.language;
    if (typeof first === 'string' && first.trim().toLowerCase().split(/[-_]/)[0] === 'en') {
      return 'en';
    }
  } catch {
    // A missing navigator falls through to the default.
  }
  return DEFAULT_LOCALE;
}

/**
 * Initial locale. `?lang=en|es` wins over storage, storage wins over the
 * browser language, and Spanish is the final default. A `?lang` win persists
 * and is removed from the address bar while every other parameter and the
 * hash stay intact.
 */
function resolveInitialLocale(): Locale {
  try {
    const url = new URL(window.location.href);
    const raw = url.searchParams.get(LOCALE_QUERY_PARAM);
    if (raw !== null) {
      const base = raw.trim().toLowerCase().split(/[-_]/)[0];
      if (base === 'es' || base === 'en') {
        const locale: Locale = base;
        persistLocale(locale);
        url.searchParams.delete(LOCALE_QUERY_PARAM);
        window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
        return locale;
      }
    }
  } catch {
    // A malformed URL never blocks rendering; storage is tried next.
  }
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored !== null) return normalizeLocale(stored);
  } catch {
    // A throwing storage falls through to the browser language.
  }
  return resolveBrowserLocale();
}

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const initial = resolveInitialLocale();
    // Sync eagerly (not only in an effect) so API calls fired by child mount
    // effects already carry the right `x-fiesta-locale` header. Idempotent.
    applyLocaleSideEffects(initial);
    return initial;
  });

  useEffect(() => {
    applyLocaleSideEffects(locale);
  }, [locale]);

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      setLocale: (next) => {
        persistLocale(next);
        applyLocaleSideEffects(next);
        setLocaleState(next);
      },
      formatMoney: (cents) => sharedFormatMoney(cents, locale),
      formatDateTime: (iso, options) => sharedFormatDateTime(iso, locale, options),
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

/** Spanish by default, even when no provider is mounted. */
export function useI18n(): I18nValue {
  return useContext(I18nContext);
}

/** Picks the active side of a `{ es, en }` catalog. Defaults to Spanish. */
export function useMessages<M extends Messages>(catalog: LocaleCatalog<M>): M {
  const { locale } = useContext(I18nContext);
  return catalog[locale] ?? catalog.es;
}
