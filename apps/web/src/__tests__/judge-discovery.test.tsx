import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { api } from '../api/client';
import { JudgePreviewView } from '../views/JudgePreviewView';
import { OrganizerHomeView } from '../views/OrganizerHomeView';
import { PublicInviteView } from '../views/PublicInviteView';
import type { Capabilities, CreatedEvent, FiestaEvent, Guest, Quote } from '../types';
import { formatEventRange, privateDemoEventInput } from '../lib/event-presentation';

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

vi.mock('../components/chat/PublicChatAssistant', () => ({
  PublicChatAssistant: () => <div data-testid="public-chat-assistant" />,
}));

const capabilities: Capabilities = {
  paypal: true,
  paypalClientId: 'sb-client',
  chat: false,
  voice: false,
  sandbox: true,
  email: true,
};

function sampleEvent(over: Partial<FiestaEvent> = {}): FiestaEvent {
  return {
    id: 'event-demo',
    slug: 'demo-privada',
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
});

describe('read-only AG Grid discovery preview', () => {
  it('renders fictional rows and never fetches or exposes privileged actions', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<JudgePreviewView onCreateDemo={vi.fn()} onBack={vi.fn()} />);

    expect(screen.getByText(/Datos ficticios de ejemplo — vista de solo lectura/i)).toBeInTheDocument();
    expect(screen.getByText(/no son capturas reales de PayPal/i)).toBeInTheDocument();
    expect(screen.getByText('Ana Ficticia')).toBeInTheDocument();
    expect(screen.queryByText('Fila inventada')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Bloquear|Desbloquear|Eliminar|Retirar|Moderar|WhatsApp/i })).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('guards the two private-demo CTAs with one in-flight submission', async () => {
    const pending = deferred<void>();
    const onCreateDemo = vi.fn(() => pending.promise);
    render(<JudgePreviewView onCreateDemo={onCreateDemo} onBack={vi.fn()} />);

    const create = screen.getByRole('button', { name: 'Crear mi demo privada' });
    const paypal = screen.getByRole('button', { name: 'Probar PayPal Sandbox' });
    fireEvent.click(create);
    fireEvent.click(create);
    fireEvent.click(paypal);

    expect(onCreateDemo).toHaveBeenCalledTimes(1);
    expect(create).toBeDisabled();
    expect(paypal).toBeDisabled();

    await act(async () => {
      pending.resolve();
    });
    expect(create).toBeEnabled();
  });

  it('creates a fresh createEvent demo, stores the key, and opens the owner panel', async () => {
    const createdEvent = sampleEvent({ id: 'fresh-demo', slug: 'almuerzo-demo' });
    const created: CreatedEvent = { event: createdEvent, adminKey: 'clave-demo-fresca' };
    vi.spyOn(api, 'getCapabilities').mockResolvedValue(capabilities);
    vi.spyOn(api, 'getOrganizerEvents').mockResolvedValue({ events: [] });
    const createEvent = vi.spyOn(api, 'createEvent').mockResolvedValue(created);
    const getDashboard = vi.spyOn(api, 'getDashboard').mockResolvedValue({ event: createdEvent, guests: [], audit: [] });
    vi.spyOn(api, 'getModerationGuests').mockResolvedValue({ guests: [] });
    vi.spyOn(api, 'getModerationConversations').mockResolvedValue({ conversations: [] });
    const resetDemo = vi.spyOn(api, 'resetDemo');
    const createDemoEvent = vi.spyOn(api, 'createDemoEvent');

    window.history.replaceState({}, '', '/demo');
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Crear mi demo privada' }));

    await waitFor(() => expect(createEvent).toHaveBeenCalledTimes(1));
    const input = createEvent.mock.calls[0]![0];
    expect(input.title).toBe('Almuerzo de demostración');
    expect(input.template).toBe('comida');
    expect(input.meal).toBe('almuerzo');
    expect(input.priceCents).toBe(2500);
    expect(input.capacity).toBe(8);
    expect(input.minimumCents).toBe(5000);
    expect(input.goalCents).toBe(20000);
    expect(input.location.toLowerCase()).toContain('ficticio');
    expect(Date.parse(input.startsAt)).toBeGreaterThan(Date.now());
    expect(Date.parse(input.endsAt)).toBeGreaterThan(Date.parse(input.startsAt));
    expect(Date.parse(input.fundingDeadlineAt!)).toBeGreaterThan(Date.now());
    expect(Date.parse(input.fundingDeadlineAt!)).toBeLessThanOrEqual(Date.parse(input.startsAt));

    await waitFor(() => expect(window.location.pathname).toBe('/e/almuerzo-demo/admin'));
    expect(localStorage.getItem('fp_admin_almuerzo-demo')).toBe('clave-demo-fresca');
    expect(getDashboard).toHaveBeenCalledWith('almuerzo-demo');
    expect(resetDemo).not.toHaveBeenCalled();
    expect(createDemoEvent).not.toHaveBeenCalled();
  });

  it('keeps the private demo input future-safe and independent of historical dates', () => {
    const now = new Date('2026-11-04T22:01:00.000Z');
    const input = privateDemoEventInput(now);
    expect(input.title).toBe('Almuerzo de demostración');
    expect(input.priceCents).toBe(2500);
    expect(input.capacity).toBe(8);
    expect(input.goalCents).toBe(20000);
    expect(input.minimumCents).toBe(5000);
    expect(Date.parse(input.startsAt)).toBeGreaterThan(now.getTime());
    expect(Date.parse(input.fundingDeadlineAt!)).toBeGreaterThan(now.getTime());
    expect(Date.parse(input.fundingDeadlineAt!)).toBeLessThanOrEqual(Date.parse(input.startsAt));
  });
});

describe('home discovery journey and organizer safety', () => {
  it('shows the five payment journey steps and the sandbox note early', async () => {
    vi.spyOn(api, 'getCapabilities').mockResolvedValue(capabilities);
    vi.spyOn(api, 'getOrganizerEvents').mockResolvedValue({ events: [] });
    render(<App />);

    expect(await screen.findByRole('heading', { name: /Organiza tus invitaciones/i })).toBeInTheDocument();
    expect(screen.getByText(/Crear → Compartir → Unirse → Revisar importe → PayPal/)).toBeInTheDocument();
    const hero = screen.getByRole('region', { name: 'Panel principal del organizador' });
    expect(within(hero).getByRole('button', { name: 'Ver panel de ejemplo (AG Grid)' })).toBeInTheDocument();
    expect(within(hero).getByRole('button', { name: 'Crear mi demo privada' })).toBeInTheDocument();
    expect(within(hero).getByRole('button', { name: 'Recuperar mi enlace' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Crear mi demo privada' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Crear mi demo privada' }).some((button) => hero.contains(button))).toBe(true);
    const emptyHistory = screen.getByText('No tienes ninguna invitación creada aún');
    expect(emptyHistory.closest('details')).not.toHaveAttribute('open');
    expect(screen.getByText('Opciones de demostración')).toBeInTheDocument();
    expect(screen.getByTestId('public-chat-assistant')).toBeInTheDocument();
  });

  it('routes a missing admin key to recovery, not to a misleading dashboard error', async () => {
    const event = sampleEvent({ slug: 'sin-clave' });
    vi.spyOn(api, 'getCapabilities').mockResolvedValue(capabilities);
    vi.spyOn(api, 'getOrganizerEvents').mockResolvedValue({ events: [event] });
    const getDashboard = vi.spyOn(api, 'getDashboard');
    render(<App />);

    fireEvent.click(await screen.findByText('Recuperar enlace'));
    expect(window.location.pathname).toBe('/recover');
    expect(getDashboard).not.toHaveBeenCalled();
  });

  it('keeps personal history and existing event dates without resetting or deleting', () => {
    const event = sampleEvent();
    const onResetDemo = vi.fn(async () => undefined);
    render(
      <OrganizerHomeView
        events={[event]}
        isLoading={false}
        onNavigateCreate={vi.fn()}
        onNavigateInvite={vi.fn()}
        onNavigateDashboard={vi.fn()}
        onCreateDemo={vi.fn(async () => undefined)}
        onResetDemo={onResetDemo}
        isResetting={false}
        onNavigatePreview={vi.fn()}
        onNavigateRecover={vi.fn()}
      />,
    );

    expect(screen.getByText(/Mis invitaciones/)).toBeInTheDocument();
    expect(screen.getByText('Almuerzo de demostración')).toBeInTheDocument();
    expect(screen.getByText(/America\/Guayaquil/)).toBeInTheDocument();
    expect(onResetDemo).not.toHaveBeenCalled();
  });

  it('prints the Ecuador zone once and preserves both cross-day dates and times', () => {
    const crossDay = formatEventRange('2026-12-15T19:00:00.000Z', '2026-12-16T15:00:00.000Z');
    expect(crossDay).toContain('Inicio:');
    expect(crossDay).toContain('Fin:');
    expect(crossDay).toContain('14:00');
    expect(crossDay).toContain('10:00');
    expect(crossDay).toContain('15');
    expect(crossDay).toContain('16');
    expect(crossDay.match(/America\/Guayaquil/g)).toHaveLength(1);

    const sameDay = formatEventRange('2026-12-15T19:00:00.000Z', '2026-12-15T23:00:00.000Z');
    expect(sameDay).toContain('14:00');
    expect(sameDay).toContain('18:00');
    expect(sameDay.match(/America\/Guayaquil/g)).toHaveLength(1);
    expect(sameDay).not.toContain('2026-12-16');
  });
});

describe('invitation PayPal stepper', () => {
  it('focuses the join name first and never creates or captures an order from Quiero pagar', async () => {
    vi.spyOn(api, 'getEventBySlug').mockResolvedValue({ event: sampleEvent(), guest: null });
    const createOrder = vi.spyOn(api, 'createOrder');
    const captureOrder = vi.spyOn(api, 'captureOrder');
    render(
      <PublicInviteView
        slug="demo-privada"
        capabilities={capabilities}
        onShowToast={vi.fn()}
        onNavigateHome={vi.fn()}
      />,
    );

    expect(await screen.findByText('Tu camino al pago')).toBeInTheDocument();
    const alias = screen.getByLabelText(/Alias del invitado/i);
    fireEvent.click(screen.getByRole('button', { name: 'Quiero pagar' }));
    expect(alias).toHaveFocus();
    expect(createOrder).not.toHaveBeenCalled();
    expect(captureOrder).not.toHaveBeenCalled();
  });

  it('moves to the RSVP step for a joined guest who has not chosen attendance', async () => {
    const guest: Guest = { id: 'guest-1', name: 'Invitado Demo', status: 'maybe', companions: 0, paidCents: 0, dueCents: 0 };
    vi.spyOn(api, 'getEventBySlug').mockResolvedValue({ event: sampleEvent(), guest });
    render(
      <PublicInviteView
        slug="demo-privada"
        capabilities={capabilities}
        onShowToast={vi.fn()}
        onNavigateHome={vi.fn()}
      />,
    );

    const radios = await screen.findAllByRole('radio');
    fireEvent.click(screen.getByRole('button', { name: 'Quiero pagar' }));
    expect(radios[0]).toHaveFocus();
  });

  it('shows the server quote and keeps the human confirmation before any order', async () => {
    const guest: Guest = { id: 'guest-1', name: 'Invitado Demo', status: 'yes', companions: 1, paidCents: 0, dueCents: 5000 };
    const quote: Quote = {
      id: 'quote-1',
      guestId: 'guest-1',
      people: 2,
      unitCents: 2500,
      totalCents: 5000,
      paidCents: 0,
      amountCents: 5000,
      summary: '2 personas',
      expiresAt: '2099-01-01T00:00:00.000Z',
    };
    vi.spyOn(api, 'getEventBySlug').mockResolvedValue({ event: sampleEvent(), guest });
    vi.spyOn(api, 'getQuote').mockResolvedValue({ quote });
    const createOrder = vi.spyOn(api, 'createOrder');
    render(
      <PublicInviteView
        slug="demo-privada"
        capabilities={capabilities}
        onShowToast={vi.fn()}
        onNavigateHome={vi.fn()}
      />,
    );

    const checkbox = await screen.findByRole('checkbox', { name: /Confirmar revisión de la cotización/i });
    expect(screen.getAllByText(/\$50,00/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Quiero pagar' }));
    expect(checkbox).toHaveFocus();
    expect(createOrder).not.toHaveBeenCalled();
  });
});
