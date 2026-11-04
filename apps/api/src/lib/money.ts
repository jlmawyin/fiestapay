/** Integer cents -> PayPal decimal string ("2500" -> "25.00"). */
export function centsToUsd(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error(`Centavos invalidos: ${cents}`);
  const whole = Math.floor(cents / 100);
  const frac = cents % 100;
  return `${whole}.${String(frac).padStart(2, '0')}`;
}

/**
 * PayPal decimal string -> integer cents, without touching floating point.
 * Returns null when the value is not a well-formed 0-2 decimal amount.
 */
export function usdToCents(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return usdToCents(value.toFixed(2));
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^-?\d{1,12}(\.\d{1,2})?$/.test(trimmed)) return null;
  const negative = trimmed.startsWith('-');
  const [whole, frac = ''] = (negative ? trimmed.slice(1) : trimmed).split('.');
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}
