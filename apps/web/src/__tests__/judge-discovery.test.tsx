import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { api } from '../api/client';
import { JudgePreviewView } from '../views/JudgePreviewView';
import { OrganizerHomeView } from '../views/OrganizerHomeView';
import { PublicInviteView } from '../views/PublicInviteView';
import type { Capabilities, CreatedEvent, FiestaEvent, Guest, Quote } from '../types';
import { formatEventRange } from '../lib/event-presentation';

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
  AssistantOrb: () => <div data-testid="assistant-orb" />,
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

    expect(screen.getByText('Datos ficticios · Sandbox · Sin dinero real')).toBeInTheDocument();
    expect(screen.getByText(/Datos ficticios de ejemplo — vista de solo lectura/i)).toBeInTheDocument();
    expect(screen.getByText(/no son capturas reales de PayPal/i)).toBeInTheDocument();
    expect(screen.getByText('Asado del Domingo')).toBeInTheDocument();
    expect(screen.getByText('Cumpleaños de Sofía')).toBeInTheDocument();
    expect(screen.getByText('Escapada a la Playa')).toBeInTheDocument();
    expect(screen.getByText('Lucía Fernández')).toBeInTheDocument();
    expect(screen.queryByText('Fila inventada')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Bloquear|Desbloquear|Eliminar|Retirar|Moderar|WhatsApp/i })).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('guards each demo CTA with its own in-flight submission', async () => {
    const pendingPrivate = deferred<void>();
    const pendingPayment = deferred<void>();
    const onCreateDemo = vi.fn(() => pendingPrivate.promise);
    const onStartPaymentDemo = vi.fn(() => pendingPayment.promise);
    render(<JudgePreviewView onCreateDemo={onCreateDemo} onStartPaymentDemo={onStartPaymentDemo} onBack={vi.fn()} />);

    const create = screen.getByRole('button', { name: 'Crear mi demo privada' });
    const pay = screen.getByRole('button', { name: 'Probar pago con PayPal' });
    fireEvent.click(create);
    fireEvent.click(create);
    fireEvent.click(pay);
    fireEvent.click(pay);

    // Each tour calls its own handler once: the payment entry never opens the panel.
    expect(onCreateDemo).toHaveBeenCalledTimes(1);
    expect(onStartPaymentDemo).toHaveBeenCalledTimes(1);
    expect(create).toBeDisabled();
    expect(pay).toBeDisabled();

    await act(async () => {
      pendingPrivate.resolve();
      pendingPayment.resolve();
    });
    expect(create).toBeEnabled();
    expect(pay).toBeEnabled();
  });

  it('creates a fresh server demo, stores the key, and opens the owner panel', async () => {
    const createdEvent = sampleEvent({ id: 'fresh-demo', slug: 'almuerzo-demo' });
    const created: CreatedEvent = { event: createdEvent, adminKey: 'clave-demo-fresca' };
    vi.spyOn(api, 'getCapabilities').mockResolvedValue(capabilities);
    vi.spyOn(api, 'getOrganizerEvents').mockResolvedValue({ events: [] });
    const createDemo = vi.spyOn(api, 'createDemo').mockResolvedValue(created);
    const createEvent = vi.spyOn(api, 'createEvent');
    const getDashboard = vi.spyOn(api, 'getDashboard').mockResolvedValue({ event: createdEvent, guests: [], audit: [] });
    vi.spyOn(api, 'getModerationGuests').mockResolvedValue({ guests: [] });
    vi.spyOn(api, 'getModerationConversations').mockResolvedValue({ conversations: [] });
    const resetDemo = vi.spyOn(api, 'resetDemo');
    const createDemoEvent = vi.spyOn(api, 'createDemoEvent');

    window.history.replaceState({}, '', '/demo');
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Crear mi demo privada' }));

    await waitFor(() => expect(createDemo).toHaveBeenCalledTimes(1));
    expect(createDemo).toHaveBeenCalledWith('private');

    await waitFor(() => expect(window.location.pathname).toBe('/e/almuerzo-demo/admin'));
    expect(localStorage.getItem('fp_admin_almuerzo-demo')).toBe('clave-demo-fresca');
    expect(getDashboard).toHaveBeenCalledWith('almuerzo-demo');
    expect(createEvent).not.toHaveBeenCalled();
    expect(resetDemo).not.toHaveBeenCalled();
    expect(createDemoEvent).not.toHaveBeenCalled();
  });
});

describe('landing journey and organizer safety', () => {
  it('shows the product landing, both CTAs, recovery and the sandbox note', async () => {
    vi.spyOn(api, 'getCapabilities').mockResolvedValue(capabilities);
    vi.spyOn(api, 'getOrganizerEvents').mockResolvedValue({ events: [] });
    render(<App />);

    expect(await screen.findByRole('heading', { name: /Crea tu invitación y aclara los pagos/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Crear mi invitación' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Demo para jueces' }).length).toBeGreaterThan(0);
    expect(screen.getByText('Sandbox · Sin dinero real')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reunión de excompañeros de colegio' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Comida con excompañeros de trabajo' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Mis invitaciones' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Recuperar mi enlace' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Reiniciar mis demos' })).toBeNull();
    expect(screen.getByTestId('assistant-orb')).toBeInTheDocument();
  });

  it('routes a missing admin key to recovery, not to a misleading dashboard error', async () => {
    const event = sampleEvent({ slug: 'sin-clave' });
    vi.spyOn(api, 'getCapabilities').mockResolvedValue(capabilities);
    vi.spyOn(api, 'getOrganizerEvents').mockResolvedValue({ events: [event] });
    const getDashboard = vi.spyOn(api, 'getDashboard');
    render(<App />);

    const section = await screen.findByRole('region', { name: 'Mis invitaciones' });
    fireEvent.click(within(section).getByRole('button', { name: 'Recuperar mi enlace' }));
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

describe('invitation payment wizard', () => {
  function stepItem(title: string): HTMLElement {
    const item = screen.getByText(title, { selector: '.payment-wizard__step-title' }).closest('li');
    expect(item).not.toBeNull();
    return item as HTMLElement;
  }

  it('opens only the join step for a visitor and never creates or captures an order', async () => {
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
    expect(screen.getByLabelText(/Alias del invitado/i)).toBeInTheDocument();
    expect(stepItem('Únete con tu nombre')).toHaveAttribute('aria-current', 'step');
    expect(stepItem('Confirma tu asistencia')).toHaveAttribute('aria-disabled', 'true');
    expect(stepItem('Revisa tu importe')).toHaveAttribute('aria-disabled', 'true');
    expect(stepItem('Paga en PayPal Sandbox')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryByRole('checkbox', { name: /Confirmar revisión de la cotización/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Quiero pagar' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Quiero pagar/)).not.toBeInTheDocument();
    expect(createOrder).not.toHaveBeenCalled();
    expect(captureOrder).not.toHaveBeenCalled();
  });

  it('opens the RSVP step for a joined guest who has not chosen attendance', async () => {
    const guest: Guest = { id: 'guest-1', name: 'Invitado Demo', status: 'maybe', companions: 0, paidCents: 0, dueCents: 0 };
    vi.spyOn(api, 'getEventBySlug').mockResolvedValue({ event: sampleEvent(), guest });
    const getQuote = vi.spyOn(api, 'getQuote');
    render(
      <PublicInviteView
        slug="demo-privada"
        capabilities={capabilities}
        onShowToast={vi.fn()}
        onNavigateHome={vi.fn()}
      />,
    );

    const radios = await screen.findAllByRole('radio');
    expect(radios.length).toBeGreaterThan(0);
    expect(stepItem('Confirma tu asistencia')).toHaveAttribute('aria-current', 'step');
    expect(within(stepItem('Únete con tu nombre')).getByText('Invitado Demo')).toBeInTheDocument();
    expect(stepItem('Revisa tu importe')).toHaveAttribute('aria-disabled', 'true');
    expect(stepItem('Paga en PayPal Sandbox')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('button', { name: 'Quiero pagar' })).not.toBeInTheDocument();
    expect(getQuote).not.toHaveBeenCalled();
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

    await screen.findByRole('checkbox', { name: /Confirmar revisión de la cotización/i });
    expect(screen.getAllByText(/\$50,00/).length).toBeGreaterThan(0);
    expect(stepItem('Revisa tu importe')).toHaveAttribute('aria-current', 'step');
    const proceed = screen.getByRole('button', { name: /Confirmar y Generar Pago/ });
    expect(proceed).toBeDisabled();
    fireEvent.click(proceed);
    expect(createOrder).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Quiero pagar' })).not.toBeInTheDocument();
  });
});
