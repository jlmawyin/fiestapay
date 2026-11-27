import type {
  Capabilities,
  FiestaEvent,
  EventInput,
  Guest,
  RsvpStatus,
  Quote,
  OrderResult,
  Dashboard,
  ModerationActionResult,
  ModerationGuest,
  ModerationConversation,
  ModerationMessagePage,
  CreatedEvent,
  RecoveryStatus,
  RecoveryContactUpdate,
  RecoveryRequestResult,
  RecoveryConsumeResult,
} from '../types';
import type {
  AvatarLang,
  AvatarSessionErrorCode,
  AvatarSessionRequest,
  AvatarSessionResponse,
  DemoKind,
  EventAvatarErrorCode,
  EventAvatarStatusResponse,
  EventAvatarUpload,
} from '@fiestapay/shared';
import {
  LOCALE_HEADER,
  avatarSessionErrorSchema,
  avatarSessionResponseSchema,
  eventAvatarErrorSchema,
  eventAvatarStatusSchema,
  translateServerError,
} from '@fiestapay/shared';
import { getActiveLocale } from '../i18n/locale-store';
import { adminHeaderFor, adminKeyFor } from './admin-key';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Error de `POST /api/avatar-session` (NAP-F3). Conserva el código cerrado del
 * servidor y los segundos de `Retry-After`, que `request()` descartaría.
 */
export class AvatarSessionError extends ApiError {
  code: AvatarSessionErrorCode | 'unknown';
  retryAfterSec?: number;
  constructor(message: string, status: number, code: AvatarSessionErrorCode | 'unknown', retryAfterSec?: number) {
    super(message, status);
    this.name = 'AvatarSessionError';
    this.code = code;
    if (retryAfterSec !== undefined) this.retryAfterSec = retryAfterSec;
  }
}

/**
 * Error de las rutas del avatar con foto (NAP-F6w). Conserva el código
 * cerrado del servidor (`avatar_limit`, `avatar_upstream`) para que la
 * sección elija el mensaje amable sin adivinar por el texto.
 */
export class EventAvatarError extends ApiError {
  code: EventAvatarErrorCode | 'unknown';
  constructor(message: string, status: number, code: EventAvatarErrorCode | 'unknown') {
    super(message, status);
    this.name = 'EventAvatarError';
    this.code = code;
  }
}

/**
 * Cabeceras del avatar con foto (NAP-F6w): la misma clave de organizador
 * del panel viaja en la misma cabecera (localStorage).
 */
function eventAvatarHeaders(slug: string): Headers {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.set(LOCALE_HEADER, getActiveLocale());
  const organizerKey = adminKeyFor(slug);
  if (organizerKey) headers.set('X-Fiesta-Admin-Key', organizerKey);
  return headers;
}

function toEventAvatarError(data: unknown, status: number): EventAvatarError {
  const parsed = eventAvatarErrorSchema.safeParse(data);
  return new EventAvatarError(
    'No se pudo procesar el avatar del evento',
    status,
    parsed.success ? parsed.data.error : 'unknown',
  );
}

/** Lee `Retry-After` como segundos; las fechas HTTP se ignoran. */
function parseRetryAfterHeader(res: Response): number | undefined {
  try {
    const raw = res.headers.get('Retry-After');
    if (raw === null) return undefined;
    const secs = Number.parseInt(raw.trim(), 10);
    return Number.isFinite(secs) && secs >= 0 ? secs : undefined;
  } catch {
    return undefined;
  }
}

/** Fila pública del directorio en la raíz Somos Panas (SP-6). */
export interface PortalListedEvent {
  slug: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  siteSlug: string;
  siteName: string;
  url: string;
  listingKind: 'live' | 'example';
}

/** Contrato congelado de `POST /api/sites` (SP-7); el botón de la portada lo consume cuando exista la ruta. */
export interface CreateSiteResult {
  site: { slug: string; url: string };
  handoff: { code: string; expiresAt: string };
}

export const REQUEST_TIMEOUT_MS = 30_000;

// NAP-F5b: AI_REQUEST_TIMEOUT_MS murió con las rutas de IA propias.

export const REQUEST_TIMEOUT_MESSAGES = {
  read: 'La solicitud tardó más de 30 segundos. Revisa tu conexión e inténtalo de nuevo.',
  mutation:
    'La operación tardó más de 30 segundos. No sabemos si el servidor alcanzó a procesarla; revisa el estado antes de repetirla.',
} as const;

export const REQUEST_TIMEOUT_MESSAGES_EN = {
  read: 'The request took more than 30 seconds. Check your connection and try again.',
  mutation:
    'The operation took more than 30 seconds. We do not know whether the server processed it; check the status before retrying.',
} as const;

function timeoutMessageFor(method: string, budgetMs: number = REQUEST_TIMEOUT_MS): string {
  const verb = method.toUpperCase();
  const table = getActiveLocale() === 'en' ? REQUEST_TIMEOUT_MESSAGES_EN : REQUEST_TIMEOUT_MESSAGES;
  const base = verb === 'GET' || verb === 'HEAD' ? table.read : table.mutation;
  if (budgetMs === REQUEST_TIMEOUT_MS) return base;
  // The message names the real budget; it never claims a fixed 30 seconds.
  const secs = Math.max(1, Math.round(budgetMs / 1000));
  return base.replace('30 segundos', `${secs} segundos`).replace('30 seconds', `${secs} seconds`);
}

export interface RequestOptions extends RequestInit {
  /** Per-request budget in ms. NAP-F5b: sin rutas de IA, todo queda en 30 s. */
  timeoutMs?: number;
}

/**
 * Single request boundary for every API call. The timeout covers both the HTTP response and
 * reading its JSON body. A caller-provided signal keeps its own abort semantics; the internal
 * controller is only an implementation detail and never triggers an automatic retry.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { timeoutMs, ...fetchOptions } = options;
  const budgetMs = timeoutMs ?? REQUEST_TIMEOUT_MS;
  const locale = getActiveLocale();
  const headers = new Headers(fetchOptions.headers || {});
  if (fetchOptions.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const adminKey = adminHeaderFor(path, fetchOptions.method ?? 'GET');
  if (adminKey && !headers.has('X-Fiesta-Admin-Key')) headers.set('X-Fiesta-Admin-Key', adminKey);
  if (!headers.has(LOCALE_HEADER)) headers.set(LOCALE_HEADER, locale);

  const method = fetchOptions.method ?? 'GET';
  const externalSignal = fetchOptions.signal;
  const controller = new AbortController();
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const relayExternalAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) relayExternalAbort();
    else externalSignal.addEventListener('abort', relayExternalAbort, { once: true });
  }

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new ApiError(timeoutMessageFor(method, budgetMs), 408));
    }, budgetMs);
  });

  try {
    let responsePromise: Promise<Response>;
    try {
      responsePromise = fetch(path, {
        credentials: 'same-origin',
        ...fetchOptions,
        headers,
        signal: controller.signal,
      });
    } catch (err) {
      responsePromise = Promise.reject(err);
    }
    const res = await Promise.race([responsePromise, timeout]);

    if (!res.ok) {
      let errorMsg = `Error del servidor (${res.status})`;
      try {
        const data = await Promise.race([res.json(), timeout]);
        if (data && typeof data.error === 'string') {
          errorMsg = data.error;
        }
      } catch (err) {
        if (timedOut) throw err;
        // not JSON
      }
      // The API keeps answering in Spanish; in English the client translates.
      // Spanish behavior and texts are untouched, and the status is preserved.
      throw new ApiError(
        locale === 'en' ? translateServerError(errorMsg, res.status, locale) : errorMsg,
        res.status,
      );
    }

    return (await Promise.race([res.json(), timeout])) as T;
  } catch (err) {
    if (timedOut && !(err instanceof ApiError)) {
      throw new ApiError(timeoutMessageFor(method, budgetMs), 408);
    }
    throw err;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', relayExternalAbort);
  }
}

export const api = {
  async getHealth(): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>('/api/health');
  },

  async getCapabilities(): Promise<Capabilities> {
    return request<Capabilities>('/api/capabilities');
  },

  async createDemoEvent(): Promise<CreatedEvent> {
    return request<CreatedEvent>('/api/demo', {
      method: 'POST',
    });
  },

  /**
   * Judge demo in the requested flavour. Always creates a fresh `is_demo`
   * event in the `x-fiesta-locale` language and answers like createEvent.
   */
  async createDemo(kind: DemoKind): Promise<CreatedEvent> {
    return request<CreatedEvent>('/api/demo', {
      method: 'POST',
      body: JSON.stringify({ kind }),
    });
  },

  async resetDemo(): Promise<CreatedEvent> {
    return request<CreatedEvent>('/api/demo/reset', {
      method: 'POST',
    });
  },

  async getOrganizerEvents(): Promise<{ events: FiestaEvent[] }> {
    return request<{ events: FiestaEvent[] }>('/api/events');
  },

  async createEvent(input: EventInput): Promise<CreatedEvent> {
    return request<CreatedEvent>('/api/events', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async updateEvent(slug: string, input: EventInput): Promise<{ event: FiestaEvent }> {
    return request<{ event: FiestaEvent }>(`/api/events/${encodeURIComponent(slug)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  async closeEvent(slug: string): Promise<{ event: FiestaEvent }> {
    return request<{ event: FiestaEvent }>(`/api/events/${encodeURIComponent(slug)}/close`, {
      method: 'POST',
    });
  },

  async deleteEvent(slug: string): Promise<{ ok: true }> {
    return request<{ ok: true }>(`/api/events/${encodeURIComponent(slug)}`, {
      method: 'DELETE',
    });
  },

  async unlockEvent(slug: string, code: string): Promise<{ ok: true }> {
    return request<{ ok: true }>(`/api/events/${encodeURIComponent(slug)}/unlock`, {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  },

  async bootstrapAdminKey(slug: string): Promise<{ adminKey: string }> {
    return request<{ adminKey: string }>(`/api/events/${encodeURIComponent(slug)}/admin/key`, {
      method: 'POST',
    });
  },

  async getEventBySlug(slug: string): Promise<{ event: FiestaEvent; guest: Guest | null }> {
    return request<{ event: FiestaEvent; guest: Guest | null }>(`/api/events/${encodeURIComponent(slug)}`);
  },

  async joinEvent(slug: string, name: string): Promise<{ guest: Guest }> {
    return request<{ guest: Guest }>(`/api/events/${encodeURIComponent(slug)}/join`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },

  async rsvp(
    slug: string,
    status: RsvpStatus,
    companions: number
  ): Promise<{ guest: Guest; event: FiestaEvent }> {
    return request<{ guest: Guest; event: FiestaEvent }>(`/api/events/${encodeURIComponent(slug)}/rsvp`, {
      method: 'POST',
      body: JSON.stringify({ status, companions }),
    });
  },

  async getQuote(slug: string): Promise<{ quote: Quote }> {
    return request<{ quote: Quote }>(`/api/events/${encodeURIComponent(slug)}/quote`, {
      method: 'POST',
    });
  },

  async createOrder(slug: string, quoteId: string): Promise<OrderResult> {
    return request<OrderResult>(`/api/events/${encodeURIComponent(slug)}/orders`, {
      method: 'POST',
      body: JSON.stringify({ quoteId, confirmed: true }),
    });
  },

  async captureOrder(orderId: string): Promise<{ status: string; guest: Guest }> {
    return request<{ status: string; guest: Guest }>(`/api/orders/${encodeURIComponent(orderId)}/capture`, {
      method: 'POST',
    });
  },

  async getOrder(orderId: string): Promise<{ status: string; guest: Guest }> {
    return request<{ status: string; guest: Guest }>(`/api/orders/${encodeURIComponent(orderId)}`);
  },

  async getDashboard(slug: string): Promise<Dashboard> {
    return request<Dashboard>(`/api/events/${encodeURIComponent(slug)}/dashboard`);
  },

  async getRecoveryStatus(slug: string): Promise<RecoveryStatus> {
    return request<RecoveryStatus>(`/api/events/${encodeURIComponent(slug)}/recovery`);
  },

  async setRecoveryContact(slug: string, email: string): Promise<RecoveryContactUpdate> {
    return request<RecoveryContactUpdate>(`/api/events/${encodeURIComponent(slug)}/recovery/contact`, {
      method: 'PUT',
      body: JSON.stringify({ email }),
    });
  },

  async removeRecoveryContact(slug: string): Promise<RecoveryStatus> {
    return request<RecoveryStatus>(`/api/events/${encodeURIComponent(slug)}/recovery/contact`, {
      method: 'DELETE',
    });
  },

  async requestRecovery(slug: string, email: string): Promise<RecoveryRequestResult> {
    return request<RecoveryRequestResult>('/api/recovery/request', {
      method: 'POST',
      body: JSON.stringify({ slug, email }),
    });
  },

  async consumeRecovery(token: string): Promise<RecoveryConsumeResult> {
    return request<RecoveryConsumeResult>('/api/recovery/consume', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  },

  async confirmEvent(slug: string): Promise<{ event: FiestaEvent }> {
    return request<{ event: FiestaEvent }>(`/api/events/${encodeURIComponent(slug)}/confirm`, {
      method: 'POST',
    });
  },

  // NAP-F5b: la IA propia (/ai/*, /chat, /reminders/draft) se retiró; la única
  // IA del producto es la avatar Napster (createAvatarSession, abajo).
  async getModerationGuests(slug: string): Promise<{ guests: ModerationGuest[] }> {
    return request<{ guests: ModerationGuest[] }>(`/api/events/${encodeURIComponent(slug)}/moderation/guests`);
  },

  async blockGuest(slug: string, guestId: string): Promise<ModerationActionResult> {
    return request<ModerationActionResult>(
      `/api/events/${encodeURIComponent(slug)}/guests/${encodeURIComponent(guestId)}/block`,
      { method: 'POST' },
    );
  },

  async unblockGuest(slug: string, guestId: string): Promise<ModerationActionResult> {
    return request<ModerationActionResult>(
      `/api/events/${encodeURIComponent(slug)}/guests/${encodeURIComponent(guestId)}/unblock`,
      { method: 'POST' },
    );
  },

  async removeGuest(slug: string, guestId: string): Promise<ModerationActionResult> {
    return request<ModerationActionResult>(
      `/api/events/${encodeURIComponent(slug)}/guests/${encodeURIComponent(guestId)}/remove`,
      { method: 'POST' },
    );
  },

  async getModerationConversations(slug: string): Promise<{ conversations: ModerationConversation[] }> {
    return request<{ conversations: ModerationConversation[] }>(
      `/api/events/${encodeURIComponent(slug)}/moderation/conversations`,
    );
  },

  async getModerationMessages(slug: string, conversationId: string): Promise<ModerationMessagePage> {
    const query = new URLSearchParams({ conversationId });
    return request<ModerationMessagePage>(
      `/api/events/${encodeURIComponent(slug)}/moderation/messages?${query.toString()}`,
    );
  },

  async deleteModerationMessage(slug: string, messageId: string): Promise<{ ok: true; id: string; alreadyDeleted: boolean }> {
    return request<{ ok: true; id: string; alreadyDeleted: boolean }>(
      `/api/events/${encodeURIComponent(slug)}/moderation/messages/${encodeURIComponent(messageId)}`,
      { method: 'DELETE' },
    );
  },

  // NAP-F5b: voz y chats propios (/voice/*, /organizer-chat, /organizer-voice)
  // retirados; la única IA del producto es la avatar Napster.
  /** Listado de eventos marcados públicos; solo disponible en host raíz. */
  async getPortalEvents(): Promise<{ events: PortalListedEvent[] }> {
    return request<{ events: PortalListedEvent[] }>('/api/portal/events');
  },

  /** Alta de espacio en la raíz (SP-7). Responde 404 mientras la ruta no esté fusionada. */
  async createSiteSpace(payload: { slug: string; displayName: string }): Promise<CreateSiteResult> {
    return request<CreateSiteResult>('/api/sites', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Sesión de avatar Napster (NAP-F3 video, NAP-F4w texto). Usa `fetch` directo
   * en vez de `request()` para conservar el código de error y `retryAfterSec`
   * en 429. NAP-F5: `mode`/`socketUrl` salen del contrato compartido; la web
   * endurece además el transporte a wss/https (el esquema acepta http).
   */
  async createAvatarSession(payload: {
    lang: AvatarLang;
    intent?: 'create';
    eventSlug?: string;
    mode?: AvatarSessionRequest['mode'];
  }): Promise<AvatarSessionResponse> {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    headers.set(LOCALE_HEADER, getActiveLocale());
    // NAP-F4: con eventSlug, la misma clave de organizador del panel viaja en
    // la misma cabecera que las llamadas del organizador (localStorage).
    const organizerKey = payload.eventSlug ? adminKeyFor(payload.eventSlug) : null;
    if (organizerKey) headers.set('X-Fiesta-Admin-Key', organizerKey);
    const res = await fetch('/api/avatar-session', {
      method: 'POST',
      credentials: 'same-origin',
      headers,
      body: JSON.stringify(payload),
    });
    const headerRetry = parseRetryAfterHeader(res);
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      const parsed = avatarSessionErrorSchema.safeParse(data);
      const code = parsed.success ? parsed.data.error : 'unknown';
      const retryAfterSec = parsed.success ? (parsed.data.retryAfterSec ?? headerRetry) : headerRetry;
      throw new AvatarSessionError(
        `No se pudo abrir la sesión de avatar (${res.status})`,
        res.status,
        code,
        retryAfterSec,
      );
    }
    const parsed = avatarSessionResponseSchema.safeParse(data);
    if (!parsed.success) {
      throw new AvatarSessionError('Respuesta inválida de la sesión de avatar', 502, 'avatar_upstream');
    }
    if (parsed.data.socketUrl !== undefined && !/^(wss|https):\/\//.test(parsed.data.socketUrl)) {
      throw new AvatarSessionError('Respuesta inválida de la sesión de avatar', 502, 'avatar_upstream');
    }
    return parsed.data;
  },

  /** Cierre idempotente por handle; 204 no trae cuerpo. */
  async endAvatarSession(handle: string): Promise<void> {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    headers.set(LOCALE_HEADER, getActiveLocale());
    const res = await fetch('/api/avatar-session/end', {
      method: 'POST',
      credentials: 'same-origin',
      headers,
      body: JSON.stringify({ handle }),
    });
    if (!res.ok) {
      throw new ApiError(`No se pudo cerrar la sesión de avatar (${res.status})`, res.status);
    }
  },

  /**
   * Cierre best-effort al desmontar o en `pagehide` (NAP-F3): `sendBeacon`
   * primero y `fetch` con `keepalive` si no hay beacon o lo rechaza.
   */
  queueAvatarSessionEnd(handle: string): void {
    const payload = JSON.stringify({ handle });
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const blob =
          typeof Blob === 'function'
            ? new Blob([payload], { type: 'application/json' })
            : payload;
        if (navigator.sendBeacon('/api/avatar-session/end', blob)) return;
      }
    } catch {
      // Sin beacon: se intenta el fetch con keepalive.
    }
    try {
      const pending = fetch('/api/avatar-session/end', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      });
      // NAP-F3: el rechazo también se traga; en pagehide nadie lo recogería.
      if (pending && typeof pending.catch === 'function') pending.catch(() => undefined);
    } catch {
      // El cierre nunca rompe la salida de la página.
    }
  },

  /** Estado del avatar con foto del evento (NAP-F6w). Usa `fetch` directo para conservar el código cerrado. */
  async getEventAvatar(slug: string): Promise<EventAvatarStatusResponse> {
    const res = await fetch(`/api/events/${encodeURIComponent(slug)}/avatar`, {
      credentials: 'same-origin',
      headers: eventAvatarHeaders(slug),
    });
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) throw toEventAvatarError(data, res.status);
    const parsed = eventAvatarStatusSchema.safeParse(data);
    if (!parsed.success) {
      throw new EventAvatarError('Respuesta inválida del avatar del evento', 502, 'unknown');
    }
    return parsed.data;
  },

  /** Sube la foto propia y pide generar el avatar (NAP-F6w). */
  async uploadEventAvatar(slug: string, upload: EventAvatarUpload): Promise<EventAvatarStatusResponse> {
    const res = await fetch(`/api/events/${encodeURIComponent(slug)}/avatar`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: eventAvatarHeaders(slug),
      body: JSON.stringify(upload),
    });
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) throw toEventAvatarError(data, res.status);
    const parsed = eventAvatarStatusSchema.safeParse(data);
    if (!parsed.success) {
      throw new EventAvatarError('Respuesta inválida del avatar del evento', 502, 'unknown');
    }
    return parsed.data;
  },

  /** Borra el avatar con foto; los invitados vuelven a la avatar general (NAP-F6w). 204 sin cuerpo. */
  async deleteEventAvatar(slug: string): Promise<void> {
    const res = await fetch(`/api/events/${encodeURIComponent(slug)}/avatar`, {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: eventAvatarHeaders(slug),
    });
    if (!res.ok) {
      let data: unknown;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      throw toEventAvatarError(data, res.status);
    }
  },
};
