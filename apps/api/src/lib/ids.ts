import { createHash, randomBytes, randomUUID } from 'node:crypto';

/** Public slug suffix. Existing shorter slugs stay valid; new ones are at least this long. */
export const SLUG_SUFFIX_LENGTH = 12;

export const newId = (): string => randomUUID();

/** 32 bytes of CSPRNG, base64url. Session cookies and organizer admin keys. */
export const newSessionToken = (): string => randomBytes(32).toString('base64url');

/** Organizer key returned once. 32 CSPRNG bytes. Only its sha256 is stored. */
export const newAdminKey = (): string => randomBytes(32).toString('base64url');

export const sha256 = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest();

const SLUG_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

/** Public invitation slug: template prefix + unguessable suffix. */
export function newSlug(prefix: string): string {
  const base = prefix.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 10) || 'fiesta';
  const bytes = randomBytes(SLUG_SUFFIX_LENGTH);
  let suffix = '';
  for (const b of bytes) suffix += SLUG_ALPHABET[b % SLUG_ALPHABET.length];
  return `${base}-${suffix}`;
}

/** Stable PayPal-Request-Id derived from our own order row id. */
export const requestIdFor = (orderId: string): string => `fp-${orderId}`;
