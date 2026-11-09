import type { Locale } from '@fiestapay/shared';

/**
 * Decimal text derived from a server integer-cent amount, e.g. 2500
 * becomes "25.00". Used for CSV export so spreadsheet software reads the
 * exact server value instead of a localized money string.
 */
export function centsToDecimalText(cents: number): string {
  const safe = Number.isSafeInteger(cents) ? cents : 0;
  return (safe / 100).toFixed(2);
}

/** Slug from a public invite URL (`.../e/<slug>`). Null when unparseable. */
export function slugFromInviteUrl(inviteUrl: string): string | null {
  const match = /\/e\/([^/?#]+)/.exec(inviteUrl);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/**
 * Reconciliation CSV file name, e.g. `fiestapay-asado-conciliacion.csv`
 * in Spanish or `fiestapay-asado-reconciliation.csv` in English.
 */
export function reconciliationCsvFileName(slug: string, locale: Locale): string {
  const suffix = locale === 'en' ? 'reconciliation' : 'conciliacion';
  return `fiestapay-${slug}-${suffix}.csv`;
}
