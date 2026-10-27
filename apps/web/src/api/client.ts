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
import { adminHeaderFor } from './admin-key';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const adminKey = adminHeaderFor(path, options.method ?? 'GET');
  if (adminKey && !headers.has('X-Fiesta-Admin-Key')) headers.set('X-Fiesta-Admin-Key', adminKey);

  const res = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers,
  });

  if (!res.ok) {
    let errorMsg = `Error del servidor (${res.status})`;
    try {
      const data = await res.json();
      if (data && typeof data.error === 'string') {
        errorMsg = data.error;
      }
    } catch {
      // not JSON
    }
    throw new ApiError(errorMsg, res.status);
  }

  return (await res.json()) as T;
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

  async sendChat(slug: string, message: string): Promise<ChatResult> {
    return request<ChatResult>(`/api/events/${encodeURIComponent(slug)}/chat`, {
      method: 'POST',
      body: JSON.stringify({ message }),
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
  ): Promise<{ token: string; sessionConfig: Record<string, unknown>; maxSeconds: number; leaseId: string }> {
    return request<{ token: string; sessionConfig: Record<string, unknown>; maxSeconds: number; leaseId: string }>(
      `/api/events/${encodeURIComponent(slug)}/voice/token`,
      {
        method: 'POST',
        body: JSON.stringify({ consent: true }),
      }
    );
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
};
