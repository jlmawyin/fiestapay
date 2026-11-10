import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JudgePreviewView } from '../views/JudgePreviewView';
import { I18nProvider } from '../i18n/I18nContext';
import { setActiveLocale } from '../i18n/locale-store';
import { SAMPLE_PARTIES, sampleTotals } from '../lib/sample-parties';

const gridState = vi.hoisted(() => ({
  props: null as any,
  api: { exportDataAsCsv: vi.fn(), onFilterChanged: vi.fn() },
}));

/** Same Community-prop harness as the organizer grid test. No network. */
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
      if (typeof col.valueFormatter === 'function') {
        return <td key={key}>{col.valueFormatter({ value, node })}</td>;
      }
      const content =
        typeof col.cellRenderer === 'function'
          ? col.cellRenderer({ data: row, value, node })
          : String(value ?? '');
      return <td key={key}>{content}</td>;
    };
    return (
      <table data-testid="judge-grid">
        <tbody>
          {rows.map((row: any) => (
            <tr key={row.id}>
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

describe('FP-GEM-D1 judges-demo sample grid', () => {
  it('shares the toolbar: search, pending-only, and CSV export', () => {
    render(<JudgePreviewView onCreateDemo={vi.fn()} onBack={vi.fn()} />);
    fireEvent.change(screen.getByTestId('judge-grid-search'), { target: { value: 'elena' } });
    expect(gridState.props.quickFilterText).toBe('elena');
    expect(screen.getByText('Elena Torres')).toBeInTheDocument();
    expect(screen.queryByText('Lucía Fernández')).toBeNull();

    fireEvent.change(screen.getByTestId('judge-grid-search'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('judge-grid-pending-only'));
    expect(gridState.props.isExternalFilterPresent()).toBe(true);
    expect(screen.getByText('Elena Torres')).toBeInTheDocument();
    expect(screen.getByText('Diego Paz')).toBeInTheDocument();
    expect(screen.queryByText('Lucía Fernández')).toBeNull();

    fireEvent.click(screen.getByTestId('judge-grid-export'));
    expect(gridState.api.exportDataAsCsv).toHaveBeenCalledTimes(1);
    const params = gridState.api.exportDataAsCsv.mock.calls[0][0];
    expect(params.fileName).toBe('fiestapay-asado-domingo-conciliacion.csv');
    expect(params.columnKeys).toEqual(['name', 'attendance', 'companions', 'paidCents', 'dueCents']);
    const cell = (colId: string, value: unknown, rowPinned?: 'bottom') =>
      params.processCellCallback({
        column: { getColId: () => colId },
        value,
        node: rowPinned ? { rowPinned } : {},
      });
    expect(cell('paidCents', 4000)).toBe('40.00');
    expect(cell('attendance', 'yes')).toBe('Asistirá');
    expect(cell('attendance', 'maybe', 'bottom')).toBe('');
  });

  it('pins fictional fixture totals and updates them with the party', () => {
    expect(sampleTotals(SAMPLE_PARTIES[0])).toEqual({ people: 8, paidCents: 10000, dueCents: 6000 });
    render(<JudgePreviewView onCreateDemo={vi.fn()} onBack={vi.fn()} />);
    const foot = screen.getByTestId('judge-grid').querySelector('tfoot')!;
    const text = foot.textContent ?? '';
    expect(text).toContain('Totales (ficticio)');
    expect(text).toContain('$100,00');
    expect(text).toContain('$60,00');

    fireEvent.click(screen.getByRole('radio', { name: /Cumpleaños de Sofía/ }));
    expect(sampleTotals(SAMPLE_PARTIES[1])).toEqual({ people: 7, paidCents: 6000, dueCents: 4500 });
    const next = screen.getByTestId('judge-grid').querySelector('tfoot')!.textContent ?? '';
    expect(next).toContain('$60,00');
    expect(next).toContain('$45,00');
  });

  it('keeps the toolbar wrapping instead of overflowing at 375px', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(join(here, '..', 'index.css'), 'utf8');
    const block = /\.fp-grid-toolbar\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(block, '.fp-grid-toolbar rule').toContain('flex-wrap: wrap');
    expect(block, '.fp-grid-toolbar rule').toContain('min-width: 0');
  });
});

describe('FP-GEM-D1 PayPal and AI panel on /demo', () => {
  it('tells judges how FiestaPay uses PayPal and AI, in Spanish', () => {
    render(<JudgePreviewView onCreateDemo={vi.fn()} onBack={vi.fn()} />);
    const panel = screen.getByTestId('paypal-ai-panel');
    expect(within(panel).getByText('Cómo usa FiestaPay PayPal e IA')).toBeInTheDocument();
    expect(within(panel).getByText('PayPal: cobro verificado')).toBeInTheDocument();
    expect(within(panel).getByText(/Orders v2 con intent CAPTURE/)).toBeInTheDocument();
    expect(within(panel).getByText(/libro de pagos idempotente/)).toBeInTheDocument();
    expect(
      within(panel).getByText('Cuota fija por persona a un único receptor sandbox. Sin Payouts, split ni retención de fondos.'),
    ).toBeInTheDocument();
    expect(within(panel).getByText('IA: Gemini explica y prepara, la persona aprueba')).toBeInTheDocument();
    expect(within(panel).getByText(/gemini-3\.8-live/)).toBeInTheDocument();
    expect(within(panel).getByText(/gemini-3\.5-flash/)).toBeInTheDocument();
    expect(within(panel).getByText(/show_on_screen/)).toBeInTheDocument();
    expect(within(panel).getByText(/público sin herramientas/)).toBeInTheDocument();
    expect(within(panel).getAllByText(/prepare_quote/)).toHaveLength(2);
    expect(within(panel).getByText(/PENDIENTE_DE_APROBACION/)).toBeInTheDocument();
    expect(within(panel).getByText(/Aprobar en PayPal/)).toBeInTheDocument();
    const repo = within(panel).getByRole('link', { name: /Código público/ });
    expect(repo).toHaveAttribute('href', 'https://github.com/jlmawyin/fiestapay');
    // Sits after the sample parties, before the guided steps.
    const sampleTitle = screen.getByText('Fiestas de muestra');
    const step1 = screen.getByText(/Mira el panel de ejemplo/);
    const panelTitle = within(panel).getByText('Cómo usa FiestaPay PayPal e IA');
    expect(sampleTitle.compareDocumentPosition(panelTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(panelTitle.compareDocumentPosition(step1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders the panel in English without Spanish copy', () => {
    localStorage.setItem('fp_locale', 'en');
    render(
      <I18nProvider>
        <JudgePreviewView onCreateDemo={vi.fn()} onBack={vi.fn()} />
      </I18nProvider>,
    );
    const panel = screen.getByTestId('paypal-ai-panel');
    expect(within(panel).getByText('How FiestaPay uses PayPal and AI')).toBeInTheDocument();
    expect(within(panel).getByText('PayPal: verified checkout')).toBeInTheDocument();
    expect(within(panel).getByText(/idempotent payment ledger/)).toBeInTheDocument();
    expect(within(panel).getByText(/No Payouts, split, or fund holding/)).toBeInTheDocument();
    expect(within(panel).getByText(/show_on_screen/)).toBeInTheDocument();
    expect(within(panel).getByText(/public with no tools/)).toBeInTheDocument();
    expect(within(panel).getByText(/Approve in PayPal/)).toBeInTheDocument();
    const body = document.body.textContent ?? '';
    for (const witness of [
      'Cómo usa FiestaPay PayPal e IA',
      'PayPal: cobro verificado',
      'Cuota fija por persona',
      'Aprobar en PayPal',
      'Totales (ficticio)',
      'Solo pendientes',
      'Exportar CSV',
      'Fiestas de muestra',
    ]) {
      expect(body, `leaked: ${witness}`).not.toContain(witness);
    }
  });
});
