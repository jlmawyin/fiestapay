/**
 * Safe failure metadata for the server log. `logCause` is a bounded machine code (for example
 * `timeout`, `http_502`, `incomplete_MAX_TOKENS`); it never carries prompt text, provider bodies,
 * headers or credentials. `elapsedMs` is the provider/deadline duration.
 */
export interface HttpErrorDetails {
  logCause?: string;
  elapsedMs?: number;
}

/** Error carrying the HTTP status to report. Routes throw these; the app hook renders {error}. */
export class HttpError extends Error {
  readonly statusCode: number;
  logCause?: string;
  elapsedMs?: number;
  constructor(statusCode: number, message: string, details: HttpErrorDetails = {}) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.logCause = details.logCause;
    this.elapsedMs = details.elapsedMs;
  }
}

export const badRequest = (m: string, details?: HttpErrorDetails) => new HttpError(400, m, details);
export const unauthorized = (m = 'Sesion requerida', details?: HttpErrorDetails) => new HttpError(401, m, details);
export const forbidden = (m = 'No autorizado', details?: HttpErrorDetails) => new HttpError(403, m, details);
export const notFound = (m = 'No encontrado', details?: HttpErrorDetails) => new HttpError(404, m, details);
export const conflict = (m: string, details?: HttpErrorDetails) => new HttpError(409, m, details);
export const gone = (m: string, details?: HttpErrorDetails) => new HttpError(410, m, details);
export const unavailable = (m: string, details?: HttpErrorDetails) => new HttpError(503, m, details);
export const gatewayTimeout = (m: string, details?: HttpErrorDetails) => new HttpError(504, m, details);
export const badGateway = (m: string, details?: HttpErrorDetails) => new HttpError(502, m, details);

/** Adds timing/cause to an existing HttpError without replacing its safe client message. */
export function annotateHttpError(err: unknown, details: HttpErrorDetails): unknown {
  if (err instanceof HttpError) {
    err.logCause ??= details.logCause;
    err.elapsedMs ??= details.elapsedMs;
  }
  return err;
}
