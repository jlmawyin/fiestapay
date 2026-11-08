import type { Locale } from './i18n.js';

/**
 * The API keeps answering `{ error: "<Spanish text>" }` exactly as before (backward compatible,
 * existing tests assert it). In English the web client translates that text here.
 *
 * SERVER_ERROR_EN maps every fixed Spanish message the API can send to English.
 * SERVER_ERROR_PATTERNS_EN covers messages with variable parts (numbers, field paths).
 * Anything unmapped falls back to a generic English message by HTTP status, never to Spanish.
 * An API test keeps this map in sync with the error literals in apps/api/src.
 */
export const SERVER_ERROR_EN: Readonly<Record<string, string>> = {};

export interface ServerErrorPattern {
  pattern: RegExp;
  to: (match: RegExpMatchArray) => string;
}

export const SERVER_ERROR_PATTERNS_EN: readonly ServerErrorPattern[] = [];

export function genericServerErrorEn(status: number): string {
  if (status === 400) return 'The request is not valid. Please review the data and try again.';
  if (status === 401) return 'Your session is missing or expired. Reload the page and try again.';
  if (status === 403) return 'You are not allowed to do this.';
  if (status === 404) return 'We could not find what you were looking for.';
  if (status === 408) return 'The server took too long to answer. Please try again.';
  if (status === 409) return 'Something changed in the meantime. Reload and try again.';
  if (status === 410) return 'This invitation is no longer available.';
  if (status === 429) return 'Too many requests. Please wait a moment and try again.';
  if (status === 502 || status === 503) return 'The service is temporarily unavailable. Please try again shortly.';
  return 'Something went wrong on the server. Please try again.';
}

/** Spanish is returned untouched. English never shows Spanish server text. */
export function translateServerError(message: string, status: number, locale: Locale): string {
  if (locale === 'es') return message;
  const exact = SERVER_ERROR_EN[message];
  if (exact) return exact;
  for (const { pattern, to } of SERVER_ERROR_PATTERNS_EN) {
    const match = message.match(pattern);
    if (match) return to(match);
  }
  return genericServerErrorEn(status);
}
