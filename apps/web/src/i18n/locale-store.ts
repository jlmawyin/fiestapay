import { DEFAULT_LOCALE, type Locale } from '@fiestapay/shared';

/**
 * Framework-free view of the active UI locale.
 *
 * The React provider keeps this in sync so plain modules (the API client)
 * can send the `x-fiesta-locale` header and translate errors without hooks.
 * Spanish is the default, also when no provider is mounted.
 */
let activeLocale: Locale = DEFAULT_LOCALE;

export function getActiveLocale(): Locale {
  return activeLocale;
}

export function setActiveLocale(locale: Locale): void {
  activeLocale = locale;
}
