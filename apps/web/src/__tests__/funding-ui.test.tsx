import type { ComponentType } from 'react';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreateEventForm } from '../components/events/CreateEventForm';
import { QuoteReviewCard } from '../components/invite/QuoteReviewCard';
import { FundingStatusPanel } from '../components/common/FundingStatusPanel';
import { PublicInviteView } from '../views/PublicInviteView';
import { OrganizerDashboardView } from '../views/OrganizerDashboardView';
import { api } from '../api/client';
import type { EventInput, FiestaEvent, Guest, Quote } from '../types';

vi.mock('ag-grid-react', () => ({
  AgGridReact: ({ rowData, columnDefs }: { rowData: Guest[]; columnDefs: ColDef<Guest>[] }) => (
    <table>
      <tbody>
        {rowData.map((guest) => (
          <tr key={guest.id}>
            {columnDefs.map((col, i) => {
              const value = col.field ? guest[col.field as keyof Guest] : undefined;
              const Cell = col.cellRenderer as ComponentType<Pick<ICellRendererParams<Guest>, 'data' | 'value'>> | undefined;
              return <td key={i}>{Cell ? <Cell data={guest} value={value} /> : String(value ?? '')}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  sessionStorage.clear();
});

const pad = (n: number): string => String(n).padStart(2, '0');

function localStamp(daysFromNow: number, hour = 10): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, 0, 0, 0);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isoStamp(daysFromNow: number, hour = 14): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function fillBasics(price = '50.00', capacity = '10') {
  fireEvent.change(screen.getByLabelText(/Título del Evento/i), { target: { value: 'Fiesta de prueba' } });
  fireEvent.change(screen.getByLabelText(/Lugar o Dirección/i), { target: { value: 'Parque' } });
  fireEvent.change(screen.getByLabelText(/Cuota por persona/i), { target: { value: price } });
  fireEvent.change(screen.getByLabelText(/Capacidad máxima/i), { target: { value: capacity } });
}

const feeEstimate: NonNullable<Quote['feeEstimate']> = {
  estimate: true,
  feeCents: 300,
  netCents: 4700,
  rateBps: 540,
  fixedCents: 30,
  currency: 'USD',
  absorber: 'organizer',
  provenance: 'paypal-ec-business-fees-2026-09-28-domestic-standard',
};

const quote50: Quote = {
  id: 'quote-50',
  guestId: 'guest-one',
  people: 1,
  unitCents: 5000,
  totalCents: 5000,
  paidCents: 0,
  amountCents: 5000,
  summary: 'Una persona',
  expiresAt: '2099-01-01T00:00:00Z',
};

function eventFixture(over: Partial<FiestaEvent> = {}): FiestaEvent {
  return {
    id: 'evt-1',
    slug: 'fiesta-test',
    title: 'Fiesta de prueba',
    template: 'comida',
    meal: 'almuerzo',
    description: 'Demo',
    startsAt: isoStamp(8, 14),
    endsAt: isoStamp(8, 18),
    location: 'Parque',
    includes: [],
    agenda: [],
    priceCents: 5000,
    capacity: 10,
    goalCents: 20000,
    minimumCents: 10000,
    confirmed: false,
    collectedCents: 5000,
    confirmedPeople: 2,
    minimumReached: false,
    createdAt: '2026-10-20T00:00:00.000Z',
    ...over,
  };
}

describe('CreateEventForm funding deadline', () => {
  it('omits fundingDeadlineAt when creating with a minimum and no deadline', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CreateEventForm onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    fillBasics();
    fireEvent.change(screen.getByLabelText(/Mínimo requerido/i), { target: { value: '100.00' } });
    fireEvent.click(screen.getByRole('button', { name: /Crear y Obtener Enlace de Invitación/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0] as EventInput;
    expect(payload.minimumCents).toBe(10000);
    expect(Object.prototype.hasOwnProperty.call(payload, 'fundingDeadlineAt')).toBe(false);
    expect(payload.fundingDeadlineAt).toBeUndefined();
  });

  it('sends a custom deadline on create when the organizer supplies one', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CreateEventForm onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    fillBasics();
    fireEvent.change(screen.getByLabelText(/Mínimo requerido/i), { target: { value: '100.00' } });
    const deadline = localStamp(3, 11);
    fireEvent.change(screen.getByLabelText(/Fecha límite de aportes/i), { target: { value: deadline } });
    fireEvent.click(screen.getByRole('button', { name: /Crear y Obtener Enlace de Invitación/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0] as EventInput;
    expect(payload.fundingDeadlineAt).toBe(new Date(deadline).toISOString());
  });

  it('blocks a deadline after the start and a deadline in the past', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CreateEventForm onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    fillBasics();
    fireEvent.change(screen.getByLabelText(/Mínimo requerido/i), { target: { value: '100.00' } });
    fireEvent.change(screen.getByLabelText(/Fecha límite de aportes/i), { target: { value: localStamp(20, 10) } });
    fireEvent.click(screen.getByRole('button', { name: /Crear y Obtener Enlace de Invitación/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La fecha limite debe ser posterior a ahora y no posterior al inicio.',
    );
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Fecha límite de aportes/i), { target: { value: localStamp(-2, 10) } });
    fireEvent.click(screen.getByRole('button', { name: /Crear y Obtener Enlace de Invitación/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La fecha limite debe ser posterior a ahora y no posterior al inicio.',
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('omits fundingDeadlineAt on an untouched legacy update', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const initial = eventFixture({
      fundingStatus: 'legacy',
      fundingDeadlineAt: null,
      minimumCents: 10000,
    });
    render(
      <CreateEventForm
        initial={initial}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        isLoading={false}
        submitLabel="Guardar cambios"
      />,
    );
    expect(screen.getByText(/conserva su exención/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Título del Evento/i), { target: { value: 'Titulo nuevo' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0] as EventInput;
    expect(payload.title).toBe('Titulo nuevo');
    expect(Object.prototype.hasOwnProperty.call(payload, 'fundingDeadlineAt')).toBe(false);
  });

  it('does not silently default a cleared deadline while a minimum remains', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const deadlineIso = isoStamp(4, 12);
    render(
      <CreateEventForm
        initial={eventFixture({ fundingStatus: 'open', fundingDeadlineAt: deadlineIso })}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        isLoading={false}
        submitLabel="Guardar cambios"
      />,
    );
    fireEvent.change(screen.getByLabelText(/Fecha límite de aportes/i), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Un minimo requiere fecha limite. Vaciar el campo al editar no usa la hora de inicio por defecto.',
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('surfaces the server rejection when an order already exists', async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      new Error('No se pueden cambiar el minimo ni la fecha limite cuando ya hay una orden'),
    );
    render(
      <CreateEventForm
        initial={eventFixture({ fundingStatus: 'open', fundingDeadlineAt: isoStamp(4, 12) })}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        isLoading={false}
        submitLabel="Guardar cambios"
      />,
    );
    fireEvent.change(screen.getByLabelText(/Mínimo requerido/i), { target: { value: '120.00' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'No se pueden cambiar el minimo ni la fecha limite cuando ya hay una orden',
      );
    });
  });
});

describe('QuoteReviewCard fee estimate', () => {
  it('shows the server fee estimate and keeps the guest charge at USD 50', () => {
    render(
      <QuoteReviewCard
        quote={{ ...quote50, feeEstimate }}
        isLoadingQuote={false}
        onRefreshQuote={vi.fn(async () => undefined)}
        onCreateOrder={vi.fn(async () => undefined)}
        isCreatingOrder={false}
      />,
    );
    expect(screen.getByText('Saldo a Pagar:').parentElement).toHaveTextContent('$50,00');
    expect(screen.getByLabelText(/Estimación de comisión de pasarela/i)).toHaveTextContent('$3,00');
    expect(screen.getByLabelText(/Estimación de comisión de pasarela/i)).toHaveTextContent('$47,00');
    expect(screen.getByText(/La asume quien organiza/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Confirmar y Generar Pago \(\$50,00\)/ })).toBeInTheDocument();
    expect(screen.queryByText(/\$53,00/)).not.toBeInTheDocument();
  });

  it('does not fabricate a zero fee when the quote has no estimate', () => {
    render(
      <QuoteReviewCard
        quote={quote50}
        isLoadingQuote={false}
        onRefreshQuote={vi.fn(async () => undefined)}
        onCreateOrder={vi.fn(async () => undefined)}
        isCreatingOrder={false}
      />,
    );
    expect(screen.getByText('Estimación de comisión no disponible.')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Estimación de comisión de pasarela/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Confirmar y Generar Pago \(\$50,00\)/ })).toBeInTheDocument();
    const breakdown = screen.getByText('Saldo a Pagar:').closest('div')?.parentElement;
    expect(breakdown?.textContent).not.toMatch(/comisión PayPal:\s*\$0,00/i);
  });
});

describe('Funding status display', () => {
  it('does not fabricate a paid count of zero when paidPeople is absent', () => {
    render(<FundingStatusPanel event={eventFixture()} />);
    expect(screen.getByText('Pagados: por consultar')).toBeInTheDocument();
    expect(screen.queryByText(/^0 pagados/)).not.toBeInTheDocument();
    expect(screen.getByText(/2 confirmados \(asistencia\)/)).toBeInTheDocument();
  });

  it('shows an explicit zero paidPeople value from the server', () => {
    render(<FundingStatusPanel event={eventFixture({ paidPeople: 0 })} />);
    expect(screen.getByText('0 pagados (cuota verificada)')).toBeInTheDocument();
    expect(screen.queryByText('Pagados: por consultar')).not.toBeInTheDocument();
  });

  it('does not label pending or needsReview totals as money already returned', () => {
    render(
      <FundingStatusPanel
        event={eventFixture({
          fundingStatus: 'failed',
          closed: true,
          refundSummary: {
            refundedCents: 0,
            pendingCents: 2000,
            needsReviewCents: 1500,
            outstandingCents: 5000,
          },
        })}
      />,
    );
    const box = screen.getByLabelText(/Resumen de reembolsos del evento/i);
    expect(within(box).getByText(/En proceso de reembolso: \$20,00/)).toBeInTheDocument();
    expect(within(box).getByText(/aún NO es dinero devuelto/)).toBeInTheDocument();
    expect(within(box).getByText(/Requiere revisión: \$15,00/)).toBeInTheDocument();
    expect(within(box).getByText(/aún NO es un reembolso completado/)).toBeInTheDocument();
    expect(within(box).getByText(/Devuelto y verificado: \$0,00/)).toBeInTheDocument();
    expect(screen.queryByText(/tu aporte fue reembolsado/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Mínimo no alcanzado a tiempo/)).toBeInTheDocument();
  });

  it('keeps funded separate from organizer confirmation', () => {
    render(<FundingStatusPanel event={eventFixture({ fundingStatus: 'funded', confirmed: false })} />);
    expect(screen.getByText('Umbral de financiamiento alcanzado')).toBeInTheDocument();
    expect(screen.getByText('Sin confirmación del organizador')).toBeInTheDocument();
    expect(screen.queryByText('Fiesta confirmada por el organizador')).not.toBeInTheDocument();
  });
});

describe('Public invite failed and closed states', () => {
  it('hides join, RSVP and new quotes when funding failed, without calling getQuote', async () => {
    const failed = eventFixture({
      slug: 'fiesta-fallida',
      fundingStatus: 'failed',
      closed: true,
      fundingDeadlineAt: isoStamp(1, 12),
      refundSummary: {
        refundedCents: 0,
        pendingCents: 4000,
        needsReviewCents: 1000,
        outstandingCents: 5000,
      },
    });
    const quote = vi.spyOn(api, 'getQuote');
    vi.spyOn(api, 'getEventBySlug').mockResolvedValue({ event: failed, guest: null });
    render(
      <PublicInviteView slug="fiesta-fallida" capabilities={null} onShowToast={vi.fn()} onNavigateHome={vi.fn()} />,
    );
    await screen.findByText('Fiesta de prueba');
    expect(screen.getByText(/No se admiten nuevas asistencias ni pagos/i)).toBeInTheDocument();
    expect(screen.queryByText(/¿Vienes a la fiesta/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Desglose de Cuota/i)).not.toBeInTheDocument();
    expect(screen.getAllByText('Pagados: por consultar').length).toBeGreaterThan(0);
    expect(screen.getByText(/aún NO es un reembolso completado/)).toBeInTheDocument();
    expect(quote).not.toHaveBeenCalled();
  });

  it('hides RSVP and new payment UI for a joined guest on a failed event', async () => {
    const failed = eventFixture({
      slug: 'fiesta-fallida',
      fundingStatus: 'failed',
      closed: true,
      paidPeople: 1,
    });
    vi.spyOn(api, 'getQuote');
    vi.spyOn(api, 'getEventBySlug').mockResolvedValue({
      event: failed,
      guest: { id: 'g1', name: 'Ana', status: 'yes', companions: 0, paidCents: 5000, dueCents: 0 },
    });
    render(
      <PublicInviteView slug="fiesta-fallida" capabilities={null} onShowToast={vi.fn()} onNavigateHome={vi.fn()} />,
    );
    await screen.findByText('Ana');
    expect(screen.queryByRole('radio', { name: /¡Sí, voy!/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Desglose de Cuota/i)).not.toBeInTheDocument();
    expect(screen.getAllByText('1 pagados (cuota verificada)').length).toBeGreaterThan(0);
    expect(api.getQuote).not.toHaveBeenCalled();
  });

  it('still offers checkout reconciliation after a failed funding decision', async () => {
    const failed = eventFixture({ slug: 'fiesta-fallida', fundingStatus: 'failed', closed: true });
    const guest = { id: 'g1', name: 'Ana', status: 'yes' as const, companions: 0, paidCents: 0, dueCents: 5000 };
    window.history.replaceState({}, '', '/e/fiesta-fallida?paypal=approved&token=ORD-KEEP-1');
    vi.spyOn(api, 'getOrder').mockResolvedValue({ status: 'approved', guest });
    vi.spyOn(api, 'getEventBySlug').mockResolvedValue({ event: failed, guest });
    vi.spyOn(api, 'getQuote');
    render(
      <PublicInviteView slug="fiesta-fallida" capabilities={null} onShowToast={vi.fn()} onNavigateHome={vi.fn()} />,
    );
    expect(await screen.findByRole('button', { name: /Verificar Estado/i })).toBeInTheDocument();
    expect(screen.queryByText(/Desglose de Cuota/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/¿Vienes a la fiesta/i)).not.toBeInTheDocument();
  });
});

describe('Organizer dashboard funding labels', () => {
  it('shows RSVP vs paid, failed refund honesty, and no guessed fee total', async () => {
    vi.spyOn(api, 'getDashboard').mockResolvedValue({
      event: eventFixture({
        slug: 'dash-failed',
        fundingStatus: 'failed',
        closed: true,
        paidPeople: 3,
        refundSummary: {
          refundedCents: 0,
          pendingCents: 2500,
          needsReviewCents: 800,
          outstandingCents: 5000,
        },
      }),
      guests: [],
      audit: [],
      payments: [{ orderId: 'ord-1', guestName: 'Ana', amountCents: 5000, status: 'paid', createdAt: '2026-10-21T00:00:00Z' }],
    });
    render(
      <OrganizerDashboardView
        slug="dash-failed"
        capabilities={null}
        onNavigateInvite={vi.fn()}
        onNavigateHome={vi.fn()}
        onShowToast={vi.fn()}
      />,
    );
    await screen.findByRole('heading', { name: 'Fiesta de prueba' });
    expect(screen.getAllByText('3 pagados (cuota verificada)').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/2 confirmados \(asistencia\)/).length).toBeGreaterThan(0);
    expect(screen.getByText(/aún NO es dinero devuelto/)).toBeInTheDocument();
    expect(screen.getByText(/aún NO es un reembolso completado/)).toBeInTheDocument();
    expect(screen.queryByText(/Comisión estimada pasarela/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '✓ Confirmar Realización' })).not.toBeInTheDocument();
    expect(screen.getByText(/Ana · \$50,00 · paid/)).toBeInTheDocument();
  });

  it('does not invent a paid count when the dashboard omits paidPeople', async () => {
    vi.spyOn(api, 'getDashboard').mockResolvedValue({
      event: eventFixture({ slug: 'dash-open', fundingStatus: 'open' }),
      guests: [],
      audit: [],
    });
    render(
      <OrganizerDashboardView
        slug="dash-open"
        capabilities={null}
        onNavigateInvite={vi.fn()}
        onNavigateHome={vi.fn()}
        onShowToast={vi.fn()}
      />,
    );
    await screen.findByRole('heading', { name: 'Fiesta de prueba' });
    expect(screen.getAllByText('Pagados: por consultar').length).toBeGreaterThan(0);
    expect(screen.queryByText(/^0 pagados/)).not.toBeInTheDocument();
  });
});
