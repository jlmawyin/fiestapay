import type { Locale } from '@fiestapay/shared';
import { HttpError, gatewayTimeout } from '../errors.js';

/**
 * One text round trip to Gemini/OpenAI is capped at 25 s even if the deployment raises its
 * provider timeout. One complete assistant request (public, guest or organizer, including every
 * tool round) shares a single 40 s deadline. The API therefore always answers before the 45 s
 * the web client is willing to wait.
 */
export const TEXT_CALL_TIMEOUT_MS = 25_000;
export const ASSISTANT_TOTAL_TIMEOUT_MS = 40_000;
export const ASSISTANT_SERVER_TIMEOUT_MS = 45_000;

const ASSISTANT_TIMEOUT_ES =
  'El agente tardó demasiado en responder. Tu pregunta no se procesó; puedes reintentar.';
const ASSISTANT_TIMEOUT_EN =
  'The agent took too long to respond. Your question was not processed; you can try again.';

export function assistantTimeoutMessage(locale: Locale): string {
  return locale === 'en' ? ASSISTANT_TIMEOUT_EN : ASSISTANT_TIMEOUT_ES;
}

export function assistantTimeoutError(locale: Locale, elapsedMs: number): HttpError {
  return gatewayTimeout(assistantTimeoutMessage(locale), { logCause: 'timeout', elapsedMs });
}

/** A bounded total deadline for one request. Tests may inject a shorter one. */
export function assistantDeadline(totalMs = ASSISTANT_TOTAL_TIMEOUT_MS): AbortSignal {
  return AbortSignal.timeout(Math.max(1, totalMs));
}

/**
 * Provider call signal: the caller's shared deadline plus the per-call 25 s cap. AbortSignal.any
 * keeps both, so one slow round cannot outlive the request and no round gets a fresh budget.
 */
export function textCallSignal(configTimeoutMs: number, parent?: AbortSignal): AbortSignal {
  const call = AbortSignal.timeout(Math.max(1, Math.min(configTimeoutMs, TEXT_CALL_TIMEOUT_MS)));
  return parent ? AbortSignal.any([parent, call]) : call;
}

export function isAbortLike(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  const candidate = err as { name?: unknown; logCause?: unknown } | null;
  return candidate?.name === 'AbortError' || candidate?.name === 'TimeoutError' || candidate?.logCause === 'timeout';
}

/**
 * Races one provider/database promise against the shared deadline. The underlying promise keeps
 * whatever handlers it needs, so a late provider rejection is never unhandled; the caller gets a
 * localized 504 as soon as the deadline fires.
 */
export async function withinDeadline<T>(
  signal: AbortSignal,
  work: Promise<T>,
  locale: Locale,
  startedAt: number,
): Promise<T> {
  if (signal.aborted) throw assistantTimeoutError(locale, Date.now() - startedAt);
  let onAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(assistantTimeoutError(locale, Date.now() - startedAt));
        signal.addEventListener('abort', onAbort, { once: true });
      }),
    ]);
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort);
  }
}

/** Bounded reason text for logs: provider finish reasons are never echoed verbatim. */
export function safeReason(value: unknown): string {
  return typeof value === 'string' && /^[A-Za-z0-9_.-]{1,40}$/.test(value) ? value : 'unknown';
}
