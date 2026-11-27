/**
 * Cliente servidor-servidor de la API Napster (NAP-F2).
 * Depende de `fetch`/AbortController de Node 24. La clave y el token nunca se registran ni se devuelven
 * al navegador desde aquí; los errores se traducen a un tipo cerrado para la ruta de sesión.
 */

export type NapsterErrorKind = 'busy' | 'rate_limited' | 'no_credits' | 'unauthorized' | 'upstream';

export class NapsterError extends Error {
  readonly kind: NapsterErrorKind;
  readonly retryAfterMs?: number;

  constructor(kind: NapsterErrorKind, retryAfterMs?: number) {
    super(`Napster ${kind}`);
    this.name = 'NapsterError';
    this.kind = kind;
    this.retryAfterMs = retryAfterMs;
  }
}

export interface NapsterClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface NapsterConnection {
  token: string;
  connectionId: string;
}

export interface StockCompanionPage {
  pageIndex?: number;
  pageSize?: number;
  total?: number;
  items?: unknown[];
  [key: string]: unknown;
}

export interface NapsterCompanion {
  id: string;
  status?: string;
  [key: string]: unknown;
}

export interface NapsterAgent {
  id: string;
  [key: string]: unknown;
}

export interface NapsterClient {
  createConnection(agentId: string, body: Record<string, unknown>): Promise<NapsterConnection>;
  deleteConnection(id: string): Promise<void>;
  listStockCompanions(query?: { pageSize?: number; pageIndex?: number; search?: string }): Promise<StockCompanionPage>;
  createCompanion(body: Record<string, unknown>): Promise<NapsterCompanion>;
  getCompanion(id: string): Promise<NapsterCompanion>;
  getAgent(id: string): Promise<NapsterAgent>;
  createAgent(body: Record<string, unknown>): Promise<NapsterAgent>;
  deleteAgent(id: string): Promise<void>;
  putWebrtcChannel(agentId: string, body: Record<string, unknown>): Promise<void>;
}

const TIMEOUT_MS = 8_000;
const RATE_LIMIT_WAIT_CAP_MS = 3_000;
const SPACING_MS = 1_000;
// NAP-F2-D4: los temporizadores de Windows/Linux pueden despertar ~1 ms antes; el margen
// y Math.ceil garantizan que dos inicios reales nunca queden por debajo de 1000 ms.
const SPACING_MARGIN_MS = 5;

// NAP-F2: la API limita las conexiones a 1/s por clave; la cola es del proceso, no de una petición.
let ultimaCreacion = 0;
let colaCreacion: Promise<unknown> = Promise.resolve();

const dormir = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function retryAfterMs(headers: Headers): number {
  const raw = headers.get('retry-after');
  if (!raw) return 1_000;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(RATE_LIMIT_WAIT_CAP_MS, seconds * 1_000);
  const date = Date.parse(raw);
  if (!Number.isNaN(date)) return Math.min(RATE_LIMIT_WAIT_CAP_MS, Math.max(0, date - Date.now()));
  return 1_000;
}

function serializar<T>(fn: () => Promise<T>, sleep: (ms: number) => Promise<void>, now: () => number): Promise<T> {
  const turno = colaCreacion.then(async () => {
    const objetivo = ultimaCreacion + SPACING_MS + SPACING_MARGIN_MS;
    const espera = Math.max(0, Math.ceil(objetivo - now()));
    if (espera > 0) await sleep(espera);
    ultimaCreacion = now();
    return fn();
  });
  colaCreacion = turno.then(
    () => undefined,
    () => undefined,
  );
  return turno;
}

export function createNapsterClient(options: NapsterClientOptions): NapsterClient {
  const apiKey = options.apiKey.trim();
  const baseUrl = (options.baseUrl ?? 'https://napster-api.napster.com').replace(/\/+$/, '');
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? dormir;
  const now = options.now ?? Date.now;

  async function pedir(path: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    timer.unref?.();
    try {
      return await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        headers: {
          'X-Api-Key': apiKey,
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
        },
        signal: controller.signal,
      });
    } catch {
      throw new NapsterError('upstream');
    } finally {
      clearTimeout(timer);
    }
  }

  async function leerJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      throw new NapsterError('upstream');
    }
  }

  async function crear(agentId: string, body: Record<string, unknown>): Promise<NapsterConnection> {    let response = await pedir(`/public/agents/${encodeURIComponent(agentId)}/connections`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (response.status === 429) {
      const wait = Math.min(RATE_LIMIT_WAIT_CAP_MS, retryAfterMs(response.headers));
      await sleep(wait);
      response = await pedir(`/public/agents/${encodeURIComponent(agentId)}/connections`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    }
    if (response.status === 409) throw new NapsterError('busy');
    if (response.status === 429) throw new NapsterError('rate_limited', retryAfterMs(response.headers));
    if (response.status === 403) throw new NapsterError('no_credits');
    if (response.status === 401) throw new NapsterError('unauthorized');
    if (!response.ok) throw new NapsterError('upstream');

    const json = await leerJson(response);
    const token = (json as { token?: unknown } | null)?.token;
    const connectionId = (json as { connection?: { id?: unknown } } | null)?.connection?.id;
    if (typeof token !== 'string' || token.length === 0 || typeof connectionId !== 'string' || connectionId.length === 0) {
      throw new NapsterError('upstream');
    }
    return { token, connectionId };
  }

  function lanzarPorStatus(status: number, headers: Headers): never {
    if (status === 409) throw new NapsterError('busy');
    if (status === 429) throw new NapsterError('rate_limited', retryAfterMs(headers));
    if (status === 403) throw new NapsterError('no_credits');
    if (status === 401) throw new NapsterError('unauthorized');
    throw new NapsterError('upstream');
  }

  /** GET/POST/PUT/DELETE con la misma traducción de errores; devuelve JSON o null. */
  async function pedirJson(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await pedir(path, init);
    if (!response.ok) lanzarPorStatus(response.status, response.headers);
    if (response.status === 204) return null;
    const text = await response.text();
    if (text.trim().length === 0) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new NapsterError('upstream');
    }
  }

  function exigirId(value: unknown): string {
    const id = (value as { id?: unknown } | null)?.id;
    if (typeof id !== 'string' || id.length === 0) throw new NapsterError('upstream');
    return id;
  }

  return {
    async createConnection(agentId, body) {
      return serializar(() => crear(agentId, body), sleep, now);
    },

    async createCompanion(body) {
      const json = await pedirJson('/public/companions', { method: 'POST', body: JSON.stringify(body) });
      return { ...(json as Record<string, unknown>), id: exigirId(json) } as NapsterCompanion;
    },

    async getCompanion(id) {
      const json = await pedirJson(`/public/companions/${encodeURIComponent(id)}`, { method: 'GET' });
      return { ...(json as Record<string, unknown>), id } as NapsterCompanion;
    },

    async getAgent(id) {
      const json = await pedirJson(`/public/agents/${encodeURIComponent(id)}`, { method: 'GET' });
      return { ...(json as Record<string, unknown>), id } as NapsterAgent;
    },

    async createAgent(body) {
      const json = await pedirJson('/public/agents', { method: 'POST', body: JSON.stringify(body) });
      return { ...(json as Record<string, unknown>), id: exigirId(json) } as NapsterAgent;
    },

    async deleteAgent(id) {
      const response = await pedir(`/public/agents/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok && response.status !== 404) lanzarPorStatus(response.status, response.headers);
    },

    async putWebrtcChannel(agentId, body) {
      const response = await pedir(`/public/agents/${encodeURIComponent(agentId)}/channels/webrtc`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      if (!response.ok) lanzarPorStatus(response.status, response.headers);
    },



    async deleteConnection(id) {
      const response = await pedir(`/public/connections/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok && response.status !== 404) throw new NapsterError('upstream');
    },

    async listStockCompanions(query = {}) {
      const params = new URLSearchParams();
      if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize));
      if (query.pageIndex !== undefined) params.set('pageIndex', String(query.pageIndex));
      if (query.search) params.set('search', query.search);
      const suffix = params.size > 0 ? `?${params.toString()}` : '';
      const response = await pedir(`/public/companions/napster-stock${suffix}`, { method: 'GET' });
      if (!response.ok) throw new NapsterError(response.status === 401 ? 'unauthorized' : 'upstream');
      return (await leerJson(response)) as StockCompanionPage;
    },
  };
}
