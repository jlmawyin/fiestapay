import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { api } from '../api/client';
import type { FiestaEvent, Guest, Quote, OrderResult, Capabilities } from '../types';

function createDeferred<T>() {
  let resolve!: (val: T) => void;
  let reject!: (err: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const mockCapabilities: Capabilities = {
  paypal: false,
  paypalClientId: null,
  gemini: false,
  voice: false,
  sandbox: true,
  email: false,
};

const mockEvent1: FiestaEvent = {
  id: 'event-1',
  slug: 'fiesta-uno',
  title: 'Cumpleaños de Ana',
  template: 'comida',
  meal: 'cena',
  description: 'Fiesta 1',
  startsAt: '2026-11-01T20:00:00Z',
  location: 'Quito',
  includes: ['Comida', 'Torta'],
  priceCents: 2000,
  capacity: 20,
  goalCents: 40000,
  minimumCents: 20000,
  agenda: [],
  confirmed: false,
  collectedCents: 0,
  confirmedPeople: 1,
  minimumReached: false,
  createdAt: '2026-10-15T00:00:00Z',
};

const mockGuest1: Guest = {
  id: 'guest-1',
  name: 'AnaInvitada',
  status: 'yes',
  companions: 0,
  paidCents: 0,
  dueCents: 2000,
};

const mockEvent2: FiestaEvent = {
  id: 'event-2',
  slug: 'fiesta-dos',
  title: 'Graduación de Bruno',
  template: 'evento',
  meal: 'cena',
  description: 'Fiesta 2',
  startsAt: '2026-11-05T19:00:00Z',
  location: 'Guayaquil',
  includes: ['Bebidas'],
  priceCents: 3000,
  capacity: 15,
  goalCents: 45000,
  minimumCents: 15000,
  agenda: [],
  confirmed: false,
  collectedCents: 0,
  confirmedPeople: 0,
  minimumReached: false,
  createdAt: '2026-10-16T00:00:00Z',
};

const mockGuest2: Guest = {
  id: 'guest-2',
  name: 'BrunoInvitado',
  status: 'maybe',
  companions: 1,
  paidCents: 0,
  dueCents: 6000,
};

const mockQuote1: Quote = {
  id: 'quote-1',
  guestId: 'guest-1',
  people: 1,
  unitCents: 2000,
  totalCents: 2000,
  paidCents: 0,
  amountCents: 2000,
  summary: '1 persona ($20.00)',
  expiresAt: '2099-01-01T00:00:00Z',
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
});

describe('Navigation between invitations with in-flight mutations (Join/RSVP/CreateOrder)', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getCapabilities').mockResolvedValue(mockCapabilities);
    vi.spyOn(api, 'getOrganizerEvents').mockResolvedValue({ events: [] });
  });

  it('resets local child input state when navigating between invitations via popstate', async () => {
    window.history.replaceState({}, '', '/e/fiesta-uno');
    vi.spyOn(api, 'getEventBySlug').mockImplementation(async (slug) => {
      if (slug === 'fiesta-uno') return { event: mockEvent1, guest: null };
      if (slug === 'fiesta-dos') return { event: mockEvent2, guest: null };
      throw new Error('Not found');
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Cumpleaños de Ana')).toBeInTheDocument();
    });

    const input = screen.getByLabelText(/Alias del invitado/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'AliasPendiente' } });
    expect(input.value).toBe('AliasPendiente');

    // Navigate to second fiesta via real popstate
    await act(async () => {
      window.history.pushState({}, '', '/e/fiesta-dos');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    await waitFor(() => {
      expect(screen.getByText('Graduación de Bruno')).toBeInTheDocument();
    });

    // The alias from the previous invitation must not leak into the new invitation
    const newInput = screen.getByLabelText(/Alias del invitado/i) as HTMLInputElement;
    expect(newInput.value).toBe('');
  });

  it('discards late join resolution after navigating to another fiesta', async () => {
    window.history.replaceState({}, '', '/e/fiesta-uno');
    const joinDeferred = createDeferred<{ guest: Guest }>();

    vi.spyOn(api, 'getEventBySlug').mockImplementation(async (slug) => {
      if (slug === 'fiesta-uno') return { event: mockEvent1, guest: null };
      if (slug === 'fiesta-dos') return { event: mockEvent2, guest: null };
      throw new Error('Not found');
    });
    vi.spyOn(api, 'joinEvent').mockReturnValue(joinDeferred.promise);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Cumpleaños de Ana')).toBeInTheDocument();
    });

    const input = screen.getByLabelText(/Alias del invitado/i);
    fireEvent.change(input, { target: { value: 'Carlos' } });
    const joinBtn = screen.getByRole('button', { name: /Entrar a la fiesta/i });
    fireEvent.click(joinBtn);

    expect(api.joinEvent).toHaveBeenCalledWith('fiesta-uno', 'Carlos');

    // Navigate to fiesta-dos while join is in-flight
    await act(async () => {
      window.history.pushState({}, '', '/e/fiesta-dos');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    await waitFor(() => {
      expect(screen.getByText('Graduación de Bruno')).toBeInTheDocument();
    });

    // Resolve late join from fiesta-uno
    await act(async () => {
      joinDeferred.resolve({ guest: { ...mockGuest1, name: 'Carlos' } });
    });

    // fiesta-dos must NOT adopt the guest session or show welcome toast for Carlos
    expect(screen.queryByText(/Tu sesión está lista/i)).toBeNull();
    expect(screen.queryByText('Sesión activa:')).toBeNull();
    // Controls on the new fiesta must not be blocked (not in loading state)
    const inputDos = screen.getByLabelText(/Alias del invitado/i) as HTMLInputElement;
    expect(inputDos).not.toBeDisabled();
    const joinBtnDos = screen.getByRole('button', { name: /Entrar a la fiesta/i });
    expect(joinBtnDos).toHaveTextContent('Entrar a la fiesta');
    fireEvent.change(inputDos, { target: { value: 'NuevoAlias' } });
    expect(joinBtnDos).not.toBeDisabled();
  });

  it('discards late join rejection after navigating to another fiesta without false toast or stuck controls', async () => {
    window.history.replaceState({}, '', '/e/fiesta-uno');
    const joinDeferred = createDeferred<{ guest: Guest }>();

    vi.spyOn(api, 'getEventBySlug').mockImplementation(async (slug) => {
      if (slug === 'fiesta-uno') return { event: mockEvent1, guest: null };
      if (slug === 'fiesta-dos') return { event: mockEvent2, guest: null };
      throw new Error('Not found');
    });
    vi.spyOn(api, 'joinEvent').mockReturnValue(joinDeferred.promise);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Cumpleaños de Ana')).toBeInTheDocument();
    });

    const input = screen.getByLabelText(/Alias del invitado/i);
    fireEvent.change(input, { target: { value: 'Daniel' } });
    const joinBtn = screen.getByRole('button', { name: /Entrar a la fiesta/i });
    fireEvent.click(joinBtn);

    // Navigate to fiesta-dos
    await act(async () => {
      window.history.pushState({}, '', '/e/fiesta-dos');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    await waitFor(() => {
      expect(screen.getByText('Graduación de Bruno')).toBeInTheDocument();
    });

    // Reject late join from fiesta-uno
    await act(async () => {
      joinDeferred.reject(new Error('Fallo de red en fiesta-uno'));
    });

    // Must not show error toast on fiesta-dos
    expect(screen.queryByText('Fallo de red en fiesta-uno')).toBeNull();
    // Controls in fiesta-dos must be interactive
    const inputDos = screen.getByLabelText(/Alias del invitado/i) as HTMLInputElement;
    expect(inputDos).not.toBeDisabled();
    const joinBtnDos = screen.getByRole('button', { name: /Entrar a la fiesta/i });
    expect(joinBtnDos).toHaveTextContent('Entrar a la fiesta');
    fireEvent.change(inputDos, { target: { value: 'DanielDos' } });
    expect(joinBtnDos).not.toBeDisabled();
  });

  it('discards late RSVP resolution after navigating to another fiesta without overwriting event or guest', async () => {
    window.history.replaceState({}, '', '/e/fiesta-uno');
    const rsvpDeferred = createDeferred<{ guest: Guest; event: FiestaEvent }>();

    vi.spyOn(api, 'getEventBySlug').mockImplementation(async (slug) => {
      if (slug === 'fiesta-uno') return { event: mockEvent1, guest: mockGuest1 };
      if (slug === 'fiesta-dos') return { event: mockEvent2, guest: mockGuest2 };
      throw new Error('Not found');
    });
    vi.spyOn(api, 'getQuote').mockResolvedValue({ quote: mockQuote1 });
    vi.spyOn(api, 'rsvp').mockReturnValue(rsvpDeferred.promise);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Cumpleaños de Ana')).toBeInTheDocument();
      expect(screen.getAllByText('AnaInvitada').length).toBeGreaterThan(0);
    });

    const saveRsvpBtn = screen.getByRole('button', { name: /Actualizar mi Asistencia/i });
    fireEvent.click(saveRsvpBtn);

    expect(api.rsvp).toHaveBeenCalledWith('fiesta-uno', 'yes', 0);

    // Navigate to fiesta-dos while RSVP is in flight
    await act(async () => {
      window.history.pushState({}, '', '/e/fiesta-dos');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    await waitFor(() => {
      expect(screen.getByText('Graduación de Bruno')).toBeInTheDocument();
      expect(screen.getAllByText('BrunoInvitado').length).toBeGreaterThan(0);
    });

    // Late resolve RSVP from fiesta-uno
    await act(async () => {
      rsvpDeferred.resolve({
        guest: { ...mockGuest1, status: 'maybe' },
        event: { ...mockEvent1, title: 'TITULO_VIEJO_LEAK' },
      });
    });

    // Must not overwrite fiesta-dos with fiesta-uno data or show toast
    expect(screen.queryByText('TITULO_VIEJO_LEAK')).toBeNull();
    expect(screen.getByText('Graduación de Bruno')).toBeInTheDocument();
    expect(screen.getAllByText('BrunoInvitado').length).toBeGreaterThan(0);
    expect(screen.queryByText('Tu respuesta de asistencia fue actualizada en el servidor.')).toBeNull();
  });

  it('discards late RSVP rejection after navigating to another fiesta without false toast or error propagation', async () => {
    window.history.replaceState({}, '', '/e/fiesta-uno');
    const rsvpDeferred = createDeferred<{ guest: Guest; event: FiestaEvent }>();

    vi.spyOn(api, 'getEventBySlug').mockImplementation(async (slug) => {
      if (slug === 'fiesta-uno') return { event: mockEvent1, guest: mockGuest1 };
      if (slug === 'fiesta-dos') return { event: mockEvent2, guest: mockGuest2 };
      throw new Error('Not found');
    });
    vi.spyOn(api, 'getQuote').mockResolvedValue({ quote: mockQuote1 });
    vi.spyOn(api, 'rsvp').mockReturnValue(rsvpDeferred.promise);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Cumpleaños de Ana')).toBeInTheDocument();
      expect(screen.getAllByText('AnaInvitada').length).toBeGreaterThan(0);
    });

    const saveRsvpBtn = screen.getByRole('button', { name: /Actualizar mi Asistencia/i });
    fireEvent.click(saveRsvpBtn);

    // Navigate to fiesta-dos
    await act(async () => {
      window.history.pushState({}, '', '/e/fiesta-dos');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    await waitFor(() => {
      expect(screen.getByText('Graduación de Bruno')).toBeInTheDocument();
      expect(screen.getAllByText('BrunoInvitado').length).toBeGreaterThan(0);
    });

    // Late reject RSVP from fiesta-uno
    await act(async () => {
      rsvpDeferred.reject(new Error('Capacidad agotada en fiesta previa'));
    });

    // Must not show error toast on fiesta-dos
    expect(screen.queryByText('Capacidad agotada en fiesta previa')).toBeNull();
    // Controls on fiesta-dos must remain interactive
    const rsvpBtnDos = screen.getByRole('button', { name: /Actualizar mi Asistencia/i });
    expect(rsvpBtnDos).not.toBeDisabled();
  });

  it('preserves RSVP error propagation in vigente context', async () => {
    window.history.replaceState({}, '', '/e/fiesta-uno');
    vi.spyOn(api, 'getEventBySlug').mockResolvedValue({ event: mockEvent1, guest: mockGuest1 });
    vi.spyOn(api, 'getQuote').mockResolvedValue({ quote: mockQuote1 });
    vi.spyOn(api, 'rsvp').mockRejectedValue(new Error('Capacidad máxima superada'));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Cumpleaños de Ana')).toBeInTheDocument();
    });

    const saveRsvpBtn = screen.getByRole('button', { name: /Actualizar mi Asistencia/i });
    fireEvent.click(saveRsvpBtn);

    // Assert the form error separately: a global toast alone cannot prove propagation.
    await waitFor(() => {
      expect(within(saveRsvpBtn.closest('form')!).getByRole('alert')).toHaveTextContent('Capacidad máxima superada');
    });
    expect(within(screen.getByRole('region', { name: 'Notificaciones del sistema' })).getByText('Capacidad máxima superada')).toBeInTheDocument();
    // Controls must not remain permanently locked
    expect(screen.getByRole('button', { name: /Actualizar mi Asistencia/i })).not.toBeDisabled();
  });

  it('discards late createOrder resolution after navigating to another fiesta', async () => {
    window.history.replaceState({}, '', '/e/fiesta-uno');
    const orderDeferred = createDeferred<OrderResult>();

    vi.spyOn(api, 'getEventBySlug').mockImplementation(async (slug) => {
      if (slug === 'fiesta-uno') return { event: mockEvent1, guest: mockGuest1 };
      if (slug === 'fiesta-dos') return { event: mockEvent2, guest: null };
      throw new Error('Not found');
    });
    vi.spyOn(api, 'getQuote').mockResolvedValue({ quote: mockQuote1 });
    vi.spyOn(api, 'createOrder').mockReturnValue(orderDeferred.promise);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Cumpleaños de Ana')).toBeInTheDocument();
    });

    // Check confirmation checkbox
    const checkbox = await screen.findByRole('checkbox', { name: /Confirmar revisión de la cotización/i });
    fireEvent.click(checkbox);

    const createOrderBtn = await screen.findByRole('button', { name: /Confirmar y Generar Pago/i });
    fireEvent.click(createOrderBtn);

    expect(api.createOrder).toHaveBeenCalledWith('fiesta-uno', 'quote-1');

    // Navigate to fiesta-dos
    await act(async () => {
      window.history.pushState({}, '', '/e/fiesta-dos');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    await waitFor(() => {
      expect(screen.getByText('Graduación de Bruno')).toBeInTheDocument();
    });

    // Late resolve order from fiesta-uno
    await act(async () => {
      orderDeferred.resolve({
        orderId: 'ORD-OLD-SCOPE-999',
        status: 'created',
        approveUrl: 'https://sandbox.paypal.com/checkout?token=ORD-OLD-SCOPE-999',
      });
    });

    // Must not show toast or attach order to fiesta-dos
    expect(screen.queryByText(/Orden de pago generada/i)).toBeNull();
    expect(screen.queryByText(/ORD-OLD-SCOPE-999/i)).toBeNull();
    expect(sessionStorage.getItem('fiestapay_order_fiesta-dos')).toBeNull();
  });

  it('discards late createOrder rejection after navigating to another fiesta without false toast or stuck controls', async () => {
    window.history.replaceState({}, '', '/e/fiesta-uno');
    const orderDeferred = createDeferred<OrderResult>();

    vi.spyOn(api, 'getEventBySlug').mockImplementation(async (slug) => {
      if (slug === 'fiesta-uno') return { event: mockEvent1, guest: mockGuest1 };
      if (slug === 'fiesta-dos') return { event: mockEvent2, guest: null };
      throw new Error('Not found');
    });
    vi.spyOn(api, 'getQuote').mockResolvedValue({ quote: mockQuote1 });
    vi.spyOn(api, 'createOrder').mockReturnValue(orderDeferred.promise);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Cumpleaños de Ana')).toBeInTheDocument();
    });

    const checkbox = await screen.findByRole('checkbox', { name: /Confirmar revisión de la cotización/i });
    fireEvent.click(checkbox);

    const createOrderBtn = await screen.findByRole('button', { name: /Confirmar y Generar Pago/i });
    fireEvent.click(createOrderBtn);

    // Navigate to fiesta-dos
    await act(async () => {
      window.history.pushState({}, '', '/e/fiesta-dos');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    await waitFor(() => {
      expect(screen.getByText('Graduación de Bruno')).toBeInTheDocument();
    });

    // Late reject order from fiesta-uno
    await act(async () => {
      orderDeferred.reject(new Error('Fallo de orden en fiesta anterior'));
    });

    // Must not show error toast on fiesta-dos
    expect(screen.queryByText('Fallo de orden en fiesta anterior')).toBeNull();
  });
});
