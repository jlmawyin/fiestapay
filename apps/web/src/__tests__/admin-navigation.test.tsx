import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import type { Dashboard, FiestaEvent } from '../types';

vi.mock('ag-grid-react', () => ({
  AgGridReact: () => <div data-testid="guest-grid" />,
}));

vi.mock('../components/events/CreateEventForm', () => ({
  CreateEventForm: ({ onSubmit, isLoading }: { onSubmit: (input: unknown) => Promise<void>; isLoading?: boolean }) => (
    <button
      type="button"
      disabled={Boolean(isLoading)}
      onClick={() => void onSubmit({
        title: 'Actividad de prueba',
        template: 'evento',
        meal: 'cena',
        description: 'Prueba de panel',
        startsAt: '2026-12-01T18:00:00.000Z',
        endsAt: '2026-12-01T21:00:00.000Z',
        location: 'Quito',
        includes: ['Acceso'],
        priceCents: 1000,
        capacity: 10,
        goalCents: null,
        minimumCents: null,
        agenda: [],
      })}
    >
      Crear actividad de prueba
    </button>
  ),
}));

const slug = 'actividad-prueba';
const adminKey = 'clave-panel-prueba';

const event: FiestaEvent = {
  id: 'event-panel',
  slug,
  title: 'Actividad de prueba',
  template: 'evento',
  meal: 'cena',
  description: 'Prueba de panel',
  startsAt: '2026-12-01T18:00:00.000Z',
  endsAt: '2026-12-01T21:00:00.000Z',
  location: 'Quito',
  includes: ['Acceso'],
  priceCents: 1000,
  capacity: 10,
  goalCents: null,
  minimumCents: null,
  agenda: [],
  confirmed: false,
  collectedCents: 0,
  confirmedPeople: 0,
  minimumReached: false,
  createdAt: '2026-10-28T00:00:00.000Z',
};

const dashboard: Dashboard = { event, guests: [], audit: [] };

const caps = {
  paypal: false,
  paypalClientId: null,
  chat: false,
  voice: false,
  sandbox: true,
  email: false,
};

type Call = { url: string; method: string; adminKey: string | null };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function installFetch(createKey: string | null, dashboardStatus: 200 | 403 = 200) {
  const calls: Call[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = new Headers(init?.headers);
    calls.push({ url, method, adminKey: headers.get('X-Fiesta-Admin-Key') });

    if (url === '/api/capabilities') return json(caps);
    if (url === '/api/events' && method === 'GET') return json({ events: [] });
    if (url === '/api/events' && method === 'POST') return json({ event, adminKey: createKey });
    if (url === `/api/events/${slug}/dashboard`) {
      if (dashboardStatus === 403) return json({ error: 'No autorizado' }, 403);
      return json(dashboard);
    }
    if (url === `/api/events/${slug}/moderation/guests`) return json({ guests: [] });
    if (url === `/api/events/${slug}/moderation/conversations`) return json({ conversations: [] });
    if (url === `/api/events/${slug}` && method === 'GET') return json({ event, guest: null });
    if (url === `/api/events/${slug}/admin/key`) return json({ error: 'no debe mintear clave' }, 500);
    return json({ error: `sin mock ${method} ${url}` }, 500);
  });
  return calls;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
});

describe('post-create organizer navigation', () => {
  it('opens the stored-key dashboard from Ir al panel and keeps the public invitation public', async () => {
    const calls = installFetch(adminKey);
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: '+ Nueva invitación' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Crear actividad de prueba' }));
    expect(await screen.findByRole('button', { name: 'Ir al panel' })).toBeInTheDocument();
    expect(localStorage.getItem(`fp_admin_${slug}`)).toBe(adminKey);
    expect(window.location.pathname).toBe('/create');
    expect(calls.some((call) => call.url.endsWith('/dashboard'))).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Ir al panel' }));

    expect(await screen.findByText('Panel del Organizador')).toBeInTheDocument();
    expect(window.location.pathname).toBe(`/e/${slug}/admin`);
    expect(window.location.search).toBe('');
    expect(window.location.href).not.toContain(adminKey);
    const dashboardCalls = calls.filter((call) => call.url === `/api/events/${slug}/dashboard`);
    expect(dashboardCalls).toEqual([
      expect.objectContaining({ method: 'GET', adminKey }),
    ]);
    expect(calls.some((call) => call.url.endsWith('/admin/key'))).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /Ver Invitación Pública/i }));
    expect(await screen.findByLabelText(/Alias del invitado/i)).toBeInTheDocument();
    expect(screen.queryByText('Panel del Organizador')).toBeNull();
    expect(window.location.pathname).toBe(`/e/${slug}`);
    expect(window.location.href).not.toContain(adminKey);
    const publicReads = calls.filter((call) => call.url === `/api/events/${slug}` && call.method === 'GET');
    expect(publicReads.length).toBeGreaterThan(0);
    expect(publicReads.every((call) => call.adminKey === null)).toBe(true);
    expect(calls.some((call) => call.url.endsWith('/admin/key'))).toBe(false);
  });

  it('keeps a create without an organizer key on the public invitation', async () => {
    const calls = installFetch(null);
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: '+ Nueva invitación' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Crear actividad de prueba' }));

    expect(await screen.findByLabelText(/Alias del invitado/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ir al panel' })).toBeNull();
    expect(screen.queryByText('Panel del Organizador')).toBeNull();
    expect(window.location.pathname).toBe(`/e/${slug}`);
    expect(localStorage.getItem(`fp_admin_${slug}`)).toBeNull();
    expect(calls.some((call) => call.url.endsWith('/dashboard') || call.url.endsWith('/admin/key'))).toBe(false);
    const publicReads = calls.filter((call) => call.url === `/api/events/${slug}` && call.method === 'GET');
    expect(publicReads.every((call) => call.adminKey === null)).toBe(true);
  });

  it('stays on the public invitation when that route is opened directly', async () => {
    const calls = installFetch(adminKey);
    window.history.replaceState({}, '', `/e/${slug}`);
    render(<App />);

    expect(await screen.findByLabelText(/Alias del invitado/i)).toBeInTheDocument();
    expect(screen.queryByText('Panel del Organizador')).toBeNull();
    expect(window.location.pathname).toBe(`/e/${slug}`);
    expect(calls.some((call) => call.url.endsWith('/dashboard') || call.url.endsWith('/admin/key'))).toBe(false);
    expect(calls.find((call) => call.url === `/api/events/${slug}`)?.adminKey).toBeNull();
  });

  it('shows the dashboard 403 for a wrong stored key and does not mint another key', async () => {
    const calls = installFetch(adminKey, 403);
    localStorage.setItem(`fp_admin_${slug}`, 'clave-incorrecta');
    window.history.replaceState({}, '', `/e/${slug}/admin`);
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Error al acceder al panel' })).toBeInTheDocument();
    expect(screen.queryByText('Panel del Organizador')).toBeNull();
    await waitFor(() => expect(calls.some((call) => call.url === `/api/events/${slug}/dashboard`)).toBe(true));
    expect(calls.find((call) => call.url === `/api/events/${slug}/dashboard`)).toEqual(
      expect.objectContaining({ method: 'GET', adminKey: 'clave-incorrecta' }),
    );
    expect(calls.some((call) => call.url.endsWith('/admin/key'))).toBe(false);
    expect(localStorage.getItem(`fp_admin_${slug}`)).toBe('clave-incorrecta');
    expect(window.location.href).not.toContain('clave-incorrecta');
  });
});
