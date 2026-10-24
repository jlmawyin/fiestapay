import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../src/config.js';

export const DATABASE_URL = process.env.DATABASE_URL;
export const ORIGIN = 'http://localhost:5173';
export const MERCHANT = 'MERCHANT-TEST';

/**
 * PostgreSQL-backed tests are skipped — never silently passed — when DATABASE_URL is absent.
 * Callers use `describeDb` so the runner reports them as skipped.
 */
export function announceSkipWithoutDatabase(label: string): void {
  if (!DATABASE_URL) {
    console.warn(`[${label}] DATABASE_URL ausente: pruebas de integracion con PostgreSQL OMITIDAS (no aprobadas).`);
  }
}

export function testConfig(overrides: Record<string, string | undefined> = {}) {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL,
    PUBLIC_ORIGIN: ORIGIN,
    SERVE_WEB: '0',
    // Every test client shares one IP; the limiter has its own dedicated test.
    RATE_LIMIT: '0',
    PAYPAL_CLIENT_ID: 'sandbox-client-id',
    PAYPAL_CLIENT_SECRET: 'sandbox-secret',
    PAYPAL_MERCHANT_ID: MERCHANT,
    PAYPAL_WEBHOOK_ID: 'WH-CONFIG',
    ...overrides,
  } as NodeJS.ProcessEnv);
}

/** Minimal shape we use from a Fastify inject response. */
export interface InjectResponse {
  statusCode: number;
  body: string;
  cookies: { name: string; value: string; httpOnly?: boolean; sameSite?: string }[];
  json: <T = unknown>() => T;
}

/** Browser-like client: keeps its own session cookie and sends an Origin on mutations. */
export class Client {
  cookie: string | undefined;

  constructor(private readonly app: FastifyInstance) {}

  private headers(origin: string | null | undefined): Record<string, string> {
    const headers: Record<string, string> = {};
    if (origin !== null) headers.origin = origin ?? ORIGIN;
    if (this.cookie) headers.cookie = this.cookie;
    return headers;
  }

  private absorb(res: InjectResponse): InjectResponse {
    const set = res.cookies.find((c) => c.name === 'fp_session');
    if (set && typeof set.value === 'string' && set.value.length > 0) this.cookie = `fp_session=${set.value}`;
    return res;
  }

  async post(url: string, payload: Record<string, unknown> = {}, origin?: string | null): Promise<InjectResponse> {
    const res = await this.app.inject({ method: 'POST', url, payload, headers: this.headers(origin) });
    return this.absorb(res as unknown as InjectResponse);
  }

  async get(url: string): Promise<InjectResponse> {
    const res = await this.app.inject({ method: 'GET', url, headers: this.headers(null) });
    return this.absorb(res as unknown as InjectResponse);
  }
}

export const body = <T>(res: InjectResponse): T => res.json<T>();
