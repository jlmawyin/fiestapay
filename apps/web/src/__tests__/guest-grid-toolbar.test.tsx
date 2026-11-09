import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GuestGrid } from '../components/dashboard/GuestGrid';
import { I18nProvider } from '../i18n/I18nContext';
import { setActiveLocale } from '../i18n/locale-store';
import type { Guest } from '../types';

const gridState = vi.hoisted(() => ({
  props: null as any,
  api: { exportDataAsCsv: vi.fn(), onFilterChanged: vi.fn() },
}));

/**
 * Deterministic grid harness: it honors the Community props our component
 * passes (quickFilterText, isExternalFilterPresent, doesExternalFilterPass,
 * pinnedBottomRowData, rowClassRules) with plain DOM rows. No network.
 */
vi.mock('ag-grid-react', () => ({
  AgGridReact: (props: any) => {
    gridState.props = props;
    props.onGridReady?.({ api: gridState.api });
    const {
      rowData = [],
      columnDefs = [],
      quickFilterText = '',
      isExternalFilterPresent,
      doesExternalFilterPass,
      pinnedBottomRowData = [],
      rowClassRules = {},
    } = props;
    let rows = [...rowData];
    if (typeof isExternalFilterPresent === 'function' && isExternalFilterPresent()) {
      rows = rows.filter(
        (data: any) => doesExternalFilterPass({ data, node: { data } }) !== false,
      );
    }
    const q = String(quickFilterText ?? '').trim().toLowerCase();
    if (q) rows = rows.filter((data: any) => JSON.stringify(data).toLowerCase().includes(q));
    const renderCell = (row: any, col: any, pinned: 'bottom' | undefined, key: number) => {
      const node = { data: row, rowPinned: pinned };
      let value = col.field ? row[col.field] : undefined;
      if (typeof col.valueGetter === 'function') value = col.valueGetter({ data: row, node });
      const colId = col.colId ?? col.field ?? String(key);
      const content =
        typeof col.cellRenderer === 'function'
          ? col.cellRenderer({ data: row, value, node })
          : String(value ?? '');
      return (
        <td key={key} data-col={colId}>
          {content}
        </td>
      );
    };
    const rowClass = (row: any) =>
      Object.entries(rowClassRules)
        .filter(([, rule]: any) => (rule as (p: any) => boolean)({ data: row, node: { data: row } }))
        .map(([cls]) => cls)
        .join(' ');
    return (
      <table data-testid="guest-grid-harness">
        <tbody>
          {rows.map((row: any) => (
            <tr key={row.id} className={rowClass(row)}>
              {columnDefs.map((col: any, i: number) => renderCell(row, col, undefined, i))}
            </tr>
          ))}
        </tbody>
        {pinnedBottomRowData.length > 0 ? (
          <tfoot>
            {pinnedBottomRowData.map((row: any, r: number) => (
              <tr key={`pinned-${r}`}>
                {columnDefs.map((col: any, i: number) => renderCell(row, col, 'bottom', i))}
              </tr>
            ))}
          </tfoot>
        ) : null}
      </table>
    );
  },
}));

const GUESTS: Guest[] = [
  { id: 'unpaid', name: 'José Demo', status: 'yes', companions: 1, paidCents: 0, dueCents: 5000 },
  { id: 'partial', name: 'Inés Demo', status: 'yes', companions: 0, paidCents: 2500, dueCents: 2500 },
  { id: 'paid', name: 'Carlos Demo', status: 'yes', companions: 0, paidCents: 2500, dueCents: 0 },
  { id: 'blocked', name: 'Bruno Demo', status: 'yes', companions: 0, paidCents: 0, dueCents: 0, blockedAt: '2026-11-01T00:00:00Z' },
  { id: 'removed', name: 'Rosa Demo', status: 'no', companions: 0, paidCents: 0, dueCents: 0, removedAt: '2026-11-01T00:00:00Z' },
];

const INVITE = 'https://fiestapay.somospanas.com/e/fiesta-demo';

function renderGrid(over: Partial<Parameters<typeof GuestGrid>[0]> = {}) {
  return render(
    <GuestGrid guests={GUESTS} eventTitle="Fiesta Demo" inviteUrl={INVITE} {...over} />,
  );
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.lang = 'es';
  setActiveLocale('es');
  gridState.props = null;
  gridState.api.exportDataAsCsv.mockClear();
  gridState.api.onFilterChanged.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.lang = 'es';
  setActiveLocale('es');
});

describe('FP-GEM-D1 organizer grid toolbar', () => {
  it('searches with quickFilterText', () => {
    renderGrid();
    expect(screen.getByLabelText('Buscar invitados')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('guest-grid-search'), { target: { value: 'inés' } });
    expect(gridState.props.quickFilterText).toBe('inés');
    const body = within(screen.getByTestId('guest-grid-harness')).getAllByRole('row');
    expect(body).toHaveLength(1);
    expect(screen.getByText('Inés Demo')).toBeInTheDocument();
    expect(screen.queryByText('José Demo')).toBeNull();
  });

  it('pending-only keeps only rows with server dueCents > 0', () => {
    renderGrid();
    const toggle = screen.getByTestId('guest-grid-pending-only');
    expect(screen.getByText('Solo pendientes')).toBeInTheDocument();
    expect(gridState.props.isExternalFilterPresent()).toBe(false);
    fireEvent.click(toggle);
    expect(gridState.props.isExternalFilterPresent()).toBe(true);
    expect(gridState.props.doesExternalFilterPass({ data: { dueCents: 0 } })).toBe(false);
    expect(gridState.props.doesExternalFilterPass({ data: { dueCents: 1 } })).toBe(true);
    expect(screen.getByText('José Demo')).toBeInTheDocument();
    expect(screen.getByText('Inés Demo')).toBeInTheDocument();
    expect(screen.queryByText('Carlos Demo')).toBeNull();
    fireEvent.click(toggle);
    expect(gridState.props.isExternalFilterPresent()).toBe(false);
    expect(screen.getByText('Carlos Demo')).toBeInTheDocument();
  });

  it('exports CSV with data columns and decimal amounts', () => {
    renderGrid();
    fireEvent.click(screen.getByTestId('guest-grid-export'));
    expect(gridState.api.exportDataAsCsv).toHaveBeenCalledTimes(1);
    const params = gridState.api.exportDataAsCsv.mock.calls[0][0];
    expect(params.fileName).toBe('fiestapay-fiesta-demo-conciliacion.csv');
    expect(params.columnKeys).toEqual(['name', 'status', 'companions', 'totalPeople', 'paidCents', 'dueCents']);
    const cell = (colId: string, value: unknown, rowPinned?: 'bottom') =>
      params.processCellCallback({
        column: { getColId: () => colId },
        value,
        node: rowPinned ? { rowPinned } : {},
      });
    expect(cell('paidCents', 2500)).toBe('25.00');
    expect(cell('dueCents', 5)).toBe('0.05');
    expect(cell('status', 'yes')).toBe('Confirmado');
    expect(cell('status', 'maybe')).toBe('? Tal vez');
    expect(cell('status', 'yes', 'bottom')).toBe('');
    expect(cell('companions', 0, 'bottom')).toBe('');
    expect(cell('name', 'Totales', 'bottom')).toBe('Totales');
  });

  it('shows the pinned totals row with the exact server cents', () => {
    renderGrid({ guestTotals: { people: 7, paidCents: 5000, dueCents: 2500 } });
    expect(gridState.props.pinnedBottomRowData).toHaveLength(1);
    const foot = screen.getByTestId('guest-grid-harness').querySelector('tfoot')!;
    expect(foot).not.toBeNull();
    const text = foot.textContent ?? '';
    expect(text).toContain('Totales');
    expect(text).toContain('7');
    expect(text).toContain('$50,00');
    expect(text).toContain('$25,00');
    // Plain totals: no badges, reminder links, or moderation buttons.
    expect(within(foot as HTMLElement).queryByRole('link')).toBeNull();
    expect(within(foot as HTMLElement).queryByRole('button')).toBeNull();
    expect(text).not.toContain('Confirmado (pagado)');
  });

  it('renders no pinned row when guestTotals is missing', () => {
    renderGrid();
    expect(gridState.props.pinnedBottomRowData).toBeUndefined();
    expect(screen.getByTestId('guest-grid-harness').querySelector('tfoot')).toBeNull();
  });

  it('marks pending rows and dims blocked or withdrawn rows', () => {
    renderGrid();
    const table = screen.getByTestId('guest-grid-harness');
    const rowOf = (name: string) => screen.getByText(name).closest('tr')!;
    expect(rowOf('José Demo').className).toContain('fp-grid-row-pending');
    expect(rowOf('Carlos Demo').className).not.toContain('fp-grid-row-pending');
    expect(rowOf('Bruno Demo').className).toContain('fp-grid-row-muted');
    expect(rowOf('Rosa Demo').className).toContain('fp-grid-row-muted');
    expect(table.querySelector('tfoot')).toBeNull();
  });

  it('uses English labels and the reconciliation file name in English', () => {
    localStorage.setItem('fp_locale', 'en');
    render(
      <I18nProvider>
        <GuestGrid guests={GUESTS} eventTitle="Demo party" inviteUrl={INVITE} />
      </I18nProvider>,
    );
    expect(screen.getByText('Only pending')).toBeInTheDocument();
    expect(screen.getByText('Export CSV')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('guest-grid-export'));
    const params = gridState.api.exportDataAsCsv.mock.calls[0][0];
    expect(params.fileName).toBe('fiestapay-fiesta-demo-reconciliation.csv');
    expect(
      params.processCellCallback({ column: { getColId: () => 'status' }, value: 'yes', node: {} }),
    ).toBe('Confirmed');
  });
});
