const normalize = (value: string): string => value.trim().replace(/\/+$/, '').toLowerCase();

/** Origin of a Referer URL, or null when it cannot be parsed. */
export function originFromReferer(referer: string | undefined): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).origin.toLowerCase();
  } catch {
    return null;
  }
}

export interface OriginCheckInput {
  origin?: string | undefined;
  referer?: string | undefined;
  allowed: string[];
}

/**
 * Same-origin guard for every mutation (session creation included). There is no CORS here on
 * purpose: the browser must be on an allowed origin, and `null`/missing Origin is rejected.
 */
export function isAllowedOrigin({ origin, referer, allowed }: OriginCheckInput): boolean {
  if (allowed.length === 0) return false;
  const allowedSet = new Set(allowed.map(normalize));
  const candidate = origin && origin !== 'null' ? normalize(origin) : originFromReferer(referer);
  if (!candidate) return false;
  return allowedSet.has(normalize(candidate));
}
