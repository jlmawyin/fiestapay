import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { api, ApiError } from '../api/client';
import type { Capabilities, CreatedEvent, FiestaEvent, Guest, Quote } from '../types';

vi.mock('ag-grid-react', () => ({
  AgGridReact: ({ rowData }: { rowData: Array<{ id: string; name: string }> }) => (
    <table data-testid="judge-grid">
      <tbody>
        {rowData.map((row) => (
          <tr key={row.id}>
            <td>{row.name}</td>
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

vi.mock('../components/assistant/AssistantOrb', () => ({
  AssistantOrb: ({ audience }: { audience: string }) => (
    <div data-testid="assistant-orb" data-audience={audience} />
  ),
}));

const capabilities: Capabilities = {
  paypal: true,
  paypalClientId: 'sb-client',
  chat: false,
  voice: false,
  sandbox: true,
  email: true,
};

function event(over: Partial<FiestaEvent> = {}): FiestaEvent {
  return {
    id: 'event-demo',
    slug: 'demo-pago',
    title: 'Almuerzo de demostración',
    template: 'comida',
    meal: 'almuerzo',
    description: 'Comida ficticia',
    startsAt: '2026-12-15T19:00:00.000Z',
    endsAt: '2026-12-16T15:00:00.000Z',
    location: 'Quito',
    includes: [],
    agenda: [],
    priceCents: 2500,
    capacity: 8,
    goalCents: 20000,
    minimumCents: 5000,
    confirmed: false,
    collectedCents: 0,
    confirmedPeople: 0,
    minimumReached: false,
    createdAt: '2026-11-01T00:00:00.000Z',
    ...over,
  };
}

function guest(over: Partial<Guest> = {}): Guest {
  return {
    id: 'guest-demo',
    name: 'Invitado Demo',
    status: 'yes',
    companions: 1,
    paidCents: 0,
    dueCents: 5000,
    ...over,
  };
}

const quote: Quote = {
  id: 'quote-demo',
  guestId: 'guest-demo',
  people: 2,
  unitCents: 2500,
  totalCents: 5000,
  paidCents: 0,
  amountCents: 5000,
  summary: 'Dos personas',
  expiresAt: '2099-01-01T00:00:00.000Z',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function defaultMocks() {
  vi.spyOn(api, 'getCapabilities').mockResolvedValue(capabilities);
  vi.spyOn(api, 'getOrganizerEvents').mockResolvedValue({ events: [] });
  vi.spyOn(api, 'getQuote').mockResolvedValue({ quote });
}

beforeEach(() => {
  defaultMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
});

describe('product landing', () => {
  it('shows the story, both CTAs, the sandbox note, recovery and the unified orb', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Tu anfitrión con IA que cobra la parte de cada uno con PayPal' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Crear mi invitación' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Demo para jueces' }).length).toBeGreaterThan(0);
    expect(screen.getByText('Sandbox · Sin dinero real')).toBeInTheDocument();
    expect(screen.getByText(/PayPal está en modo SANDBOX/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reunión de excompañeros de colegio' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Comida con excompañeros de trabajo' })).toBeInTheDocument();

    expect(screen.getByRole('region', { name: 'Mis invitaciones' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Recuperar mi enlace' }).length).toBeGreaterThan(0);
    // The demos-only reset lives in /demo, never on the landing.
    expect(screen.queryByRole('button', { name: 'Reiniciar mis demos' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reiniciar Demo' })).toBeNull();
    expect(screen.getByTestId('assistant-orb')).toHaveAttribute('data-audience', 'public');
  });
});

describe('explicit PayPal payment demo', () => {
  it('creates once, persists the organizer key/slug, joins Invitado Demo, sets yes+1, and opens the invite without ordering', async () => {
    const createdEvent = event({ id: 'created-payment-demo', slug: 'almuerzo-pago' });
    const pending = deferred<CreatedEvent>();
    const createDemo = vi.spyOn(api, 'createDemo').mockReturnValue(pending.promise);
    const createEvent = vi.spyOn(api, 'createEvent');
    const joinEvent = vi.spyOn(api, 'joinEvent').mockResolvedValue({ guest: guest() });
    const rsvp = vi.spyOn(api, 'rsvp').mockResolvedValue({ guest: guest(), event: createdEvent });
    vi.spyOn(api, 'getEventBySlug').mockResolvedValue({ event: createdEvent, guest: guest() });
    const createOrder = vi.spyOn(api, 'createOrder');
    const captureOrder = vi.spyOn(api, 'captureOrder');
    const sendChat = vi.spyOn(api, 'sendChat');
    const publicVoice = vi.spyOn(api, 'getPublicVoiceToken');
    const resetDemo = vi.spyOn(api, 'resetDemo');

    window.history.replaceState({}, '', '/demo');
    render(<App />);
    const pay = await screen.findByRole('button', { name: 'Probar pago con PayPal' });
    fireEvent.click(pay);
    fireEvent.click(pay);
    expect(createDemo).toHaveBeenCalledTimes(1);
    expect(createDemo).toHaveBeenCalledWith('payment');
    expect(pay).toBeDisabled();

    await act(async () => {
      pending.resolve({ event: createdEvent, adminKey: 'clave-pago-demo' });
    });

    await waitFor(() => expect(window.location.pathname).toBe('/e/almuerzo-pago'));
    expect(createDemo).toHaveBeenCalledTimes(1);
    expect(createEvent).not.toHaveBeenCalled();

    expect(localStorage.getItem('fp_admin_almuerzo-pago')).toBe('clave-pago-demo');
    expect(sessionStorage.getItem('fp_demo_payment_slug')).toBe('almuerzo-pago');
    expect(joinEvent).toHaveBeenCalledWith('almuerzo-pago', 'Invitado Demo');
    expect(rsvp).toHaveBeenCalledWith('almuerzo-pago', 'yes', 1);
    expect(rsvp.mock.invocationCallOrder[0]).toBeGreaterThan(joinEvent.mock.invocationCallOrder[0]!);
    expect(createOrder).not.toHaveBeenCalled();
    expect(captureOrder).not.toHaveBeenCalled();
    expect(sendChat).not.toHaveBeenCalled();
    expect(publicVoice).not.toHaveBeenCalled();
    expect(resetDemo).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: 'Ver cuenta de prueba' })).toBeInTheDocument();
  });

  it('reuses a known created slug after a failed join instead of creating a second demo', async () => {
    const createdEvent = event({ id: 'partial-demo', slug: 'demo-parcial' });
    const createDemo = vi.spyOn(api, 'createDemo').mockResolvedValue({
      event: createdEvent,
      adminKey: 'clave-parcial',
    });
    const joinEvent = vi
      .spyOn(api, 'joinEvent')
      .mockRejectedValueOnce(new Error('fallo temporal'))
      .mockResolvedValueOnce({ guest: guest() });
    vi.spyOn(api, 'rsvp').mockResolvedValue({ guest: guest(), event: createdEvent });
    vi.spyOn(api, 'getEventBySlug').mockResolvedValue({ event: createdEvent, guest: guest() });

    window.history.replaceState({}, '', '/demo');
    render(<App />);
    const pay = await screen.findByRole('button', { name: 'Probar pago con PayPal' });
    fireEvent.click(pay);

    expect(await screen.findByText(/La demo "demo-parcial" ya está creada/i)).toBeInTheDocument();
    expect(createDemo).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('fp_admin_demo-parcial')).toBe('clave-parcial');
    expect(window.location.pathname).toBe('/demo');

    fireEvent.click(screen.getByRole('button', { name: 'Probar pago con PayPal' }));
    await waitFor(() => expect(window.location.pathname).toBe('/e/demo-parcial'));
    expect(createDemo).toHaveBeenCalledTimes(1);
    expect(joinEvent).toHaveBeenCalledTimes(2);
  });

  it('reports creation-timeout uncertainty and refuses a blind second creation in the same session', async () => {
    const createDemo = vi
      .spyOn(api, 'createDemo')
      .mockRejectedValue(new ApiError('La operación tardó más de 30 segundos.', 408));

    window.history.replaceState({}, '', '/demo');
    render(<App />);
    const pay = await screen.findByRole('button', { name: 'Probar pago con PayPal' });
    fireEvent.click(pay);

    expect(await screen.findByText(/No sabemos si la demo de pago llegó a crearse/i)).toBeInTheDocument();
    expect(window.location.pathname).toBe('/demo');
    expect(createDemo).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Probar pago con PayPal' }));
    await waitFor(() => expect(createDemo).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/No abriremos otra automáticamente/i)).toBeInTheDocument();
  });

  it('keeps the prior demos and resets nothing when creation fails', async () => {
    const existing = { ...event({ id: 'existing', slug: 'demo-previa', title: 'Demo previa' }), isDemo: true } as FiestaEvent;
    vi.spyOn(api, 'getOrganizerEvents').mockResolvedValue({ events: [existing] });
    vi.spyOn(api, 'createDemo').mockRejectedValue(new Error(''));
    const resetDemo = vi.spyOn(api, 'resetDemo');

    window.history.replaceState({}, '', '/demo');
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Probar pago con PayPal' }));

    expect(await screen.findByText(/No se pudo crear la demo de pago/i)).toBeInTheDocument();
    expect(screen.getByText('Demo previa')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Probar pago con PayPal' })).toBeEnabled();
    expect(resetDemo).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/demo');
  });

  it('does not overwrite the RSVP of an explicitly retried completed paid session', async () => {
    const createdEvent = event({ id: 'paid-demo', slug: 'demo-pagada' });
    vi.spyOn(api, 'createDemo').mockResolvedValue({ event: createdEvent, adminKey: 'clave-pagada' });
    vi.spyOn(api, 'joinEvent').mockResolvedValue({ guest: guest({ paidCents: 5000, dueCents: 0 }) });
    const rsvp = vi.spyOn(api, 'rsvp');
    vi.spyOn(api, 'getEventBySlug').mockResolvedValue({
      event: createdEvent,
      guest: guest({ paidCents: 5000, dueCents: 0 }),
    });

    window.history.replaceState({}, '', '/demo');
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Probar pago con PayPal' }));

    await waitFor(() => expect(window.location.pathname).toBe('/e/demo-pagada'));
    expect(rsvp).not.toHaveBeenCalled();
  });

  it('does not create or RSVP on direct reload of a marked invitation', async () => {
    const marked = event({ id: 'marked', slug: 'demo-marcada' });
    sessionStorage.setItem('fp_demo_payment_slug', 'demo-marcada');
    window.history.replaceState({}, '', '/e/demo-marcada');
    vi.spyOn(api, 'getEventBySlug').mockResolvedValue({ event: marked, guest: null });
    const createDemo = vi.spyOn(api, 'createDemo');
    const createEvent = vi.spyOn(api, 'createEvent');
    const joinEvent = vi.spyOn(api, 'joinEvent');
    const rsvp = vi.spyOn(api, 'rsvp');

    render(<App />);

    expect(await screen.findByRole('button', { name: 'Ver cuenta de prueba' })).toBeInTheDocument();
    expect(createDemo).not.toHaveBeenCalled();
    expect(createEvent).not.toHaveBeenCalled();
    expect(joinEvent).not.toHaveBeenCalled();
    expect(rsvp).not.toHaveBeenCalled();
  });
});
