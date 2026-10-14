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
} from '../types';

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

  async createDemoEvent(): Promise<{ event: FiestaEvent }> {
    return request<{ event: FiestaEvent }>('/api/demo', {
      method: 'POST',
    });
  },

  async resetDemo(): Promise<{ event: FiestaEvent }> {
    return request<{ event: FiestaEvent }>('/api/demo/reset', {
      method: 'POST',
    });
  },

  async getOrganizerEvents(): Promise<{ events: FiestaEvent[] }> {
    return request<{ events: FiestaEvent[] }>('/api/events');
  },

  async createEvent(input: EventInput): Promise<{ event: FiestaEvent }> {
    return request<{ event: FiestaEvent }>('/api/events', {
      method: 'POST',
      body: JSON.stringify(input),
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

