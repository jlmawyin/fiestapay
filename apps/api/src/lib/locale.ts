import { LOCALE_HEADER, normalizeLocale, type Locale } from '@fiestapay/shared';
import type { FastifyRequest } from 'fastify';

/**
 * Request language from `x-fiesta-locale`. Absent, repeated or invalid means Spanish, so every
 * route that does not call this helper keeps answering exactly as before.
 */
export function requestLocale(req: FastifyRequest): Locale {
  const raw = req.headers[LOCALE_HEADER];
  return normalizeLocale(Array.isArray(raw) ? raw[0] : raw);
}
