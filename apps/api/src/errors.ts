/** Error carrying the HTTP status to report. Routes throw these; the app hook renders {error}. */
export class HttpError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}

export const badRequest = (m: string) => new HttpError(400, m);
export const unauthorized = (m = 'Sesion requerida') => new HttpError(401, m);
export const forbidden = (m = 'No autorizado') => new HttpError(403, m);
export const notFound = (m = 'No encontrado') => new HttpError(404, m);
export const conflict = (m: string) => new HttpError(409, m);
export const gone = (m: string) => new HttpError(410, m);
export const unavailable = (m: string) => new HttpError(503, m);
export const badGateway = (m: string) => new HttpError(502, m);
