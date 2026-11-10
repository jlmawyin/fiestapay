import type {
  Capabilities,
  FiestaEvent,
  EventInput,
  Guest,
  RsvpStatus,
  Quote,
  OrderResult,
  Dashboard,
  ChatResult,
  ChatTranscript,
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
  AssistantContext,
  DemoKind,
  DraftEventProposal,
  PresentationSuggestion,
  PresentationSuggestionInput,
  ReminderDraftResult,
  ReminderTone,
  VoiceAudience,
  VoiceLeaseActivityResult,
  VoiceLeaseReleaseResult,
  VoiceProvider,
} from '@fiestapay/shared';
import { LOCALE_HEADER, translateServerError } from '@fiestapay/shared';
import { getActiveLocale } from '../i18n/locale-store';
import { adminHeaderFor } from './admin-key';

export interface OrganizerChatTranscript extends ChatTranscript {
  greeting: string;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export const REQUEST_TIMEOUT_MS = 30_000;

/** AI routes wait longer: the model answers before 45 s and the client gives it 55 s. */
export const AI_REQUEST_TIMEOUT_MS = 55_000;

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
  /** Per-request budget in ms. AI routes pass AI_REQUEST_TIMEOUT_MS; the rest keep 30 s. */
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

  /**
   * Optional AI help at the end of the creation assistant. The caller sends
   * no personal data (no organizer name, no access code); on any failure it
   * keeps the rule-based suggestion and never blocks publishing.
   */
  async suggestPresentation(input: PresentationSuggestionInput): Promise<PresentationSuggestion> {
    return request<PresentationSuggestion>('/api/ai/suggest-presentation', {
      method: 'POST',
      body: JSON.stringify(input),
      timeoutMs: AI_REQUEST_TIMEOUT_MS,
    });
  },

  /**
   * "Describe your gathering in one sentence" (step 1 of the creation assistant).
   * The server never creates an event from it: the proposal only pre-fills the
   * wizard and the organizer reviews every step before creating.
   */
  async draftEvent(text: string): Promise<DraftEventProposal> {
    return request<DraftEventProposal>('/api/ai/draft-event', {
      method: 'POST',
      body: JSON.stringify({ text }),
      timeoutMs: AI_REQUEST_TIMEOUT_MS,
    });
  },

  /**
   * Organizer-only drafted payment reminders. The drafts are returned for
   * manual review (copy or open WhatsApp); nothing is ever sent automatically.
   * The organizer key travels in the same header as the other organizer calls.
   */
  async draftReminders(slug: string, tone: ReminderTone): Promise<ReminderDraftResult> {
    return request<ReminderDraftResult>(`/api/events/${encodeURIComponent(slug)}/reminders/draft`, {
      method: 'POST',
      body: JSON.stringify({ tone }),
      timeoutMs: AI_REQUEST_TIMEOUT_MS,
    });
  },

  async sendChat(slug: string, message: string): Promise<ChatResult> {
    return request<ChatResult>(`/api/events/${encodeURIComponent(slug)}/chat`, {
      method: 'POST',
      body: JSON.stringify({ message }),
      timeoutMs: AI_REQUEST_TIMEOUT_MS,
    });
  },

  async getChatHistory(slug: string): Promise<ChatTranscript> {
    return request<ChatTranscript>(`/api/events/${encodeURIComponent(slug)}/chat/history`);
  },

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

  async getVoiceToken(
    slug: string
  ): Promise<{ token: string; sessionConfig: Record<string, unknown>; maxSeconds: number; leaseId: string; audience?: VoiceAudience; provider?: VoiceProvider }> {
    return request<{ token: string; sessionConfig: Record<string, unknown>; maxSeconds: number; leaseId: string; audience?: VoiceAudience; provider?: VoiceProvider }>(
      `/api/events/${encodeURIComponent(slug)}/voice/token`,
      {
        method: 'POST',
        body: JSON.stringify({ consent: true }),
      }
    );
  },

  /**
   * Public informational voice. No event and no guest are created; only the session
   * cookie, the shared daily budget and the per-session lease are used.
   */
  async getPublicVoiceToken(context: AssistantContext = 'landing'): Promise<{
    token: string;
    sessionConfig: Record<string, unknown>;
    maxSeconds: number;
    leaseId: string;
    audience?: VoiceAudience;
    provider?: VoiceProvider;
  }> {
    return request('/api/voice/public/token', {
      method: 'POST',
      body: JSON.stringify({ consent: true, context }),
    });
  },

  /**
   * Idempotent release, safe from pagehide with keepalive. The server ignores ids owned by
   * another session. A network failure is the caller's to ignore; budget is not restored.
   */
  async releaseVoiceLease(
    leaseId: string,
    reason?: string,
    keepalive = false,
  ): Promise<VoiceLeaseReleaseResult> {
    return request<VoiceLeaseReleaseResult>('/api/voice/lease/release', {
      method: 'POST',
      body: JSON.stringify({ leaseId, ...(reason ? { reason } : {}) }),
      ...(keepalive ? { keepalive: true } : {}),
    });
  },

  /** Real-interaction signal. `active:false` means the client must stop resources. */
  async markVoiceActivity(leaseId: string): Promise<VoiceLeaseActivityResult> {
    return request<VoiceLeaseActivityResult>('/api/voice/lease/activity', {
      method: 'POST',
      body: JSON.stringify({ leaseId }),
    });
  },

  async executeVoiceTool(
    slug: string,
    payload: { leaseId: string; name: string; arguments: Record<string, unknown> }
  ): Promise<{ response: unknown; quote?: Quote; actions?: string[] }> {
    return request<{ response: unknown; quote?: Quote; actions?: string[] }>(
      `/api/events/${encodeURIComponent(slug)}/voice/tool`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  async sendOrganizerChat(slug: string, message: string): Promise<ChatResult> {
    return request<ChatResult>(`/api/events/${encodeURIComponent(slug)}/organizer-chat`, {
      method: 'POST',
      body: JSON.stringify({ message }),
      timeoutMs: AI_REQUEST_TIMEOUT_MS,
    });
  },

  async getOrganizerChatHistory(slug: string): Promise<OrganizerChatTranscript> {
    return request<OrganizerChatTranscript>(`/api/events/${encodeURIComponent(slug)}/organizer-chat/history`);
  },

  async getOrganizerVoiceToken(
    slug: string,
  ): Promise<{ token: string; sessionConfig: Record<string, unknown>; maxSeconds: number; leaseId: string; provider?: VoiceProvider }> {
    return request(`/api/events/${encodeURIComponent(slug)}/organizer-voice/token`, {
      method: 'POST',
      body: JSON.stringify({ consent: true }),
    });
  },

  async executeOrganizerVoiceTool(
    slug: string,
    payload: { leaseId: string; name: string; arguments: Record<string, unknown> },
  ): Promise<{ response: unknown }> {
    return request(`/api/events/${encodeURIComponent(slug)}/organizer-voice/tool`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
