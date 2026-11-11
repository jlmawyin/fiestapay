import type { ComponentType } from 'react';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOCALE_STORAGE_KEY, type Dashboard, type PaymentActivityItem, type PayPalNotificationItem } from '@fiestapay/shared';
import { PaymentActivityPanel } from '../components/dashboard/PaymentActivityPanel';
import { api } from '../api/client';
import { I18nProvider } from '../i18n/I18nContext';
import { OrganizerDashboardView } from '../views/OrganizerDashboardView';

vi.mock('ag-grid-react', () => ({
  AgGridReact: ({ rowData, columnDefs }: { rowData: PaymentActivityItem[]; columnDefs: ColDef<PaymentActivityItem>[] }) => (
    <table data-testid="activity-grid">
      <tbody>
        {rowData.map((row) => (
          <tr key={row.id}>
            {columnDefs.map((col, index) => {
              const value = col.field ? row[col.field as keyof PaymentActivityItem] : undefined;
              const Cell = col.cellRenderer as ComponentType<Pick<ICellRendererParams<PaymentActivityItem>, 'data' | 'value'>> | undefined;
              return <td key={index}>{Cell ? <Cell data={row} value={value} /> : String(value ?? '')}</td>;
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
  window.localStorage.clear();
});

const activity: PaymentActivityItem[] = [
  {
    id: 'ledger-refund',
    kind: 'refund',
    guestName: 'Ana Histórica',
    amountCents: 1200,
    captureId: 'CAP-HISTORICA-1',
    createdAt: '2024-02-03T04:05:06.000Z',
  },
  {
    id: 'ledger-capture',
    kind: 'capture',
    guestName: 'Ana Histórica',
    amountCents: 5000,
    captureId: 'CAP-HISTORICA-1',
    createdAt: '2024-01-02T03:04:05.000Z',
  },
];

const notifications: PayPalNotificationItem[] = [
  { type: 'CHECKOUT.ORDER.COMPLETED', receivedAt: '2024-01-01T00:00:01.000Z' },
  { type: 'PAYMENT.CAPTURE.COMPLETED', receivedAt: '2024-01-01T00:00:02.000Z' },
  { type: 'PAYMENT.CAPTURE.REFUNDED', receivedAt: '2024-02-01T00:00:03.000Z' },
];

describe('organizer verified payment activity panel', () => {
  it('renders real ledger rows with guest, kind, amount, capture reference and time', () => {
    render(<PaymentActivityPanel activity={activity} notifications={notifications} />);

    expect(screen.getByRole('heading', { name: 'Actividad de pagos' })).toBeInTheDocument();
    expect(screen.getByText('2 movimientos')).toBeInTheDocument();
    const grid = within(screen.getByTestId('activity-grid'));
    expect(grid.getAllByText('Ana Histórica')).toHaveLength(2);
    expect(grid.getByText('Captura')).toBeInTheDocument();
    expect(grid.getByText('Reembolso')).toBeInTheDocument();
    expect(grid.getByText('$50,00')).toBeInTheDocument();
    expect(grid.getByText('$12,00')).toBeInTheDocument();
    expect(grid.getAllByText('CAP-HISTORICA-1')).toHaveLength(2);
    expect(screen.getAllByText('Captura completada')).toHaveLength(1);
    expect(screen.getByText('Pago completado en PayPal')).toBeInTheDocument();
    expect(screen.getByText('Reembolso completado')).toBeInTheDocument();
  });

  it('shows localized empty states without inventing money', () => {
    render(<PaymentActivityPanel activity={[]} notifications={[]} />);

    expect(screen.getByText('Aún no hay capturas ni reembolsos verificados.')).toBeInTheDocument();
    expect(screen.getByText('Aún no hay avisos firmados para este evento.')).toBeInTheDocument();
    expect(screen.queryByTestId('activity-grid')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Avisos de PayPal' })).toBeInTheDocument();
  });

  it('switches the section and status labels to English', () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    render(
      <I18nProvider>
        <PaymentActivityPanel activity={activity} notifications={notifications} />
      </I18nProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Payment activity' })).toBeInTheDocument();
    expect(screen.getByText('2 movements')).toBeInTheDocument();
    expect(within(screen.getByTestId('activity-grid')).getByText('Capture')).toBeInTheDocument();
    expect(screen.getByText('PayPal notifications')).toBeInTheDocument();
  });

  it('appears on the keyed organizer dashboard with the server-provided event rows', async () => {
    const dashboard: Dashboard = {
      event: {
        id: 'event-a',
        slug: 'a',
        title: 'Fiesta A',
        template: 'comida',
        meal: 'almuerzo',
        description: 'Demo',
        startsAt: '2026-10-31T18:00:00Z',
        location: 'Lugar demo',
        includes: [],
        agenda: [],
        priceCents: 2500,
        capacity: null,
        goalCents: 10000,
        minimumCents: 5000,
        minimumReached: true,
        confirmed: false,
        collectedCents: 3800,
        confirmedPeople: 2,
        createdAt: '2026-10-24T09:00:00Z',
      },
      guests: [],
      guestTotals: { people: 2, paidCents: 3800, dueCents: 1200 },
      payments: [],
      paymentActivity: activity,
      paypalNotifications: notifications,
      audit: [],
    };
    vi.spyOn(api, 'getDashboard').mockResolvedValue(dashboard);

    render(
      <OrganizerDashboardView
        slug="a"
        capabilities={null}
        onNavigateInvite={vi.fn()}
        onNavigateHome={vi.fn()}
        onShowToast={vi.fn()}
      />,
    );

    expect(await screen.findByRole('heading', { name: 'Actividad de pagos' })).toBeInTheDocument();
    expect(screen.getAllByText('Ana Histórica').length).toBeGreaterThanOrEqual(2);
    expect(within(screen.getByTestId('payment-activity-grid')).getByText('$50,00')).toBeInTheDocument();
    expect(screen.getByText('Reembolso completado')).toBeInTheDocument();
  });
});
