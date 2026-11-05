import React, { useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { usd } from '../types';

export interface JudgePreviewViewProps {
  onCreateDemo: () => Promise<void>;
  onBack: () => void;
}

interface PreviewGuest {
  id: string;
  name: string;
  attendance: 'yes' | 'maybe' | 'no';
  companions: number;
  paidCents: number;
  dueCents: number;
}

const SAMPLE_GUESTS: PreviewGuest[] = [
  { id: 'preview-1', name: 'Ana Ficticia', attendance: 'yes', companions: 1, paidCents: 5000, dueCents: 0 },
  { id: 'preview-2', name: 'Bruno Ejemplo', attendance: 'yes', companions: 0, paidCents: 2500, dueCents: 0 },
  { id: 'preview-3', name: 'Carla Muestra', attendance: 'yes', companions: 2, paidCents: 2500, dueCents: 5000 },
  { id: 'preview-4', name: 'Diego Simulado', attendance: 'yes', companions: 0, paidCents: 0, dueCents: 2500 },
  { id: 'preview-5', name: 'Elena Demo', attendance: 'maybe', companions: 1, paidCents: 0, dueCents: 0 },
  { id: 'preview-6', name: 'Fabián Prueba', attendance: 'no', companions: 0, paidCents: 0, dueCents: 0 },
  { id: 'preview-7', name: 'Gabriela Ficticia', attendance: 'yes', companions: 0, paidCents: 2500, dueCents: 0 },
  { id: 'preview-8', name: 'Hugo Ejemplo', attendance: 'maybe', companions: 0, paidCents: 0, dueCents: 0 },
  { id: 'preview-9', name: 'Irene Muestra', attendance: 'yes', companions: 1, paidCents: 7500, dueCents: 0 },
  { id: 'preview-10', name: 'Julián Simulado', attendance: 'no', companions: 0, paidCents: 0, dueCents: 0 },
];

const attendanceLabel: Record<PreviewGuest['attendance'], string> = {
  yes: '✓ Asistirá',
  maybe: '? Tal vez',
  no: '✕ No asistirá',
};

function attendanceCell(params: ICellRendererParams<PreviewGuest>) {
  const guest = params.data;
  if (!guest) return null;
  const className = guest.attendance === 'yes' ? 'badge badge-teal' : guest.attendance === 'maybe' ? 'badge badge-yellow' : 'badge badge-coral';
  return <span className={className}>{attendanceLabel[guest.attendance]}</span>;
}

function moneyCell(color: string) {
  return (params: ICellRendererParams<PreviewGuest>) => (
    <span style={{ color, fontWeight: 700 }}>{usd(params.value ?? 0)}</span>
  );
}

function paymentState(guest: PreviewGuest | undefined): string {
  if (!guest) return 'Sin datos';
  if (guest.dueCents === 0 && guest.paidCents > 0) return 'Pagado (ficticio)';
  if (guest.paidCents > 0 && guest.dueCents > 0) return 'Pago parcial (ficticio)';
  if (guest.dueCents > 0) return 'Pendiente (ficticio)';
  return 'Sin saldo (ficticio)';
}

export const JudgePreviewView: React.FC<JudgePreviewViewProps> = ({ onCreateDemo, onBack }) => {
  const [quickFilter, setQuickFilter] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const creatingRef = useRef(false);

  const columnDefs = useMemo<ColDef<PreviewGuest>[]>(
    () => [
      {
        headerName: 'Invitado ficticio',
        field: 'name',
        flex: 1.4,
        minWidth: 190,
        filter: true,
      },
      {
        headerName: 'Asistencia',
        field: 'attendance',
        flex: 1,
        minWidth: 145,
        filter: true,
        cellRenderer: attendanceCell,
        filterValueGetter: (params) => attendanceLabel[(params.data?.attendance ?? 'no') as PreviewGuest['attendance']],
      },
      {
        headerName: 'Acompañantes',
        field: 'companions',
        width: 130,
        minWidth: 120,
        filter: true,
        valueFormatter: (params) => `+${params.value ?? 0}`,
      },
      {
        headerName: 'Pagado (ficticio)',
        field: 'paidCents',
        width: 155,
        minWidth: 145,
        filter: 'agNumberColumnFilter',
        cellRenderer: moneyCell('var(--color-teal)'),
      },
      {
        headerName: 'Pendiente (ficticio)',
        field: 'dueCents',
        width: 165,
        minWidth: 155,
        filter: 'agNumberColumnFilter',
        cellRenderer: moneyCell('var(--color-coral)'),
      },
      {
        headerName: 'Estado de pago',
        colId: 'paymentState',
        flex: 1.1,
        minWidth: 170,
        filter: true,
        valueGetter: (params) => paymentState(params.data),
      },
    ],
    [],
  );

  const defaultColDef = useMemo<ColDef<PreviewGuest>>(
    () => ({
      sortable: true,
      filter: true,
      resizable: true,
    }),
    [],
  );

  const handleCreateDemo = async () => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setIsCreating(true);
    try {
      await onCreateDemo();
    } finally {
      creatingRef.current = false;
      setIsCreating(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', minWidth: 0, maxWidth: '100%' }}>
      <section
        className="panel"
        aria-label="Vista de ejemplo del panel del organizador"
        style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', minWidth: 0 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <span className="badge badge-yellow" style={{ marginBottom: '0.45rem' }}>
              Vista de solo lectura
            </span>
            <h1 style={{ fontSize: '1.65rem', marginBottom: '0.25rem' }}>Panel de ejemplo con AG Grid</h1>
            <p style={{ color: 'var(--color-ink-muted)', fontSize: '0.9rem', maxWidth: '720px' }}>
              Así se ve la lista de invitados y pagos. Puedes ordenar, filtrar y buscar sin modificar ningún evento real.
            </p>
          </div>
          <button type="button" onClick={onBack} className="btn btn-secondary">
            Volver al inicio
          </button>
        </div>

        <div
          role="note"
          aria-label="Aviso de datos ficticios"
          style={{
            backgroundColor: 'var(--color-yellow-tint)',
            border: '1.5px solid var(--color-yellow)',
            borderRadius: 'var(--radius-md)',
            padding: '0.85rem 1rem',
            color: 'var(--color-ink)',
            fontSize: '0.875rem',
            lineHeight: 1.5,
          }}
        >
          <strong>Datos ficticios de ejemplo — vista de solo lectura.</strong>{' '}
          Los nombres, asistencias e importes son inventados. Los números de “Pagado” no son capturas reales de PayPal ni un libro de pagos.
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => void handleCreateDemo()}
            className="btn btn-primary"
            disabled={isCreating}
          >
            {isCreating ? 'Creando tu demo privada...' : 'Crear mi demo privada'}
          </button>
          <button
            type="button"
            onClick={() => void handleCreateDemo()}
            className="btn btn-teal"
            disabled={isCreating}
          >
            {isCreating ? 'Preparando PayPal Sandbox...' : 'Probar PayPal Sandbox'}
          </button>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-ink-muted)', flex: '1 1 260px' }}>
            Ambos botones crean una comida ficticia propia con clave de organizador y abren tu panel real. El pago se prueba en PayPal Sandbox; no hay cobros reales.
          </span>
        </div>
      </section>

      <section
        className="panel"
        aria-label="Tabla de invitados ficticios"
        style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', minWidth: 0, maxWidth: '100%', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: '1.2rem' }}>Invitados de ejemplo</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-ink-muted)' }}>
              10 filas ficticias con asistencia y pagos variados. La tabla filtra y ordena localmente.
            </p>
          </div>
          <label className="form-label" htmlFor="judge-preview-filter" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '220px', maxWidth: '100%' }}>
            Buscar en datos ficticios
            <input
              id="judge-preview-filter"
              className="form-input"
              value={quickFilter}
              onChange={(event) => setQuickFilter(event.target.value)}
              placeholder="Nombre, estado o importe"
              autoComplete="off"
            />
          </label>
        </div>

        {/* The scroll belongs to this wrapper, never to the page body. */}
        <div style={{ width: '100%', maxWidth: '100%', minWidth: 0, overflowX: 'auto' }}>
          <div
            className="ag-theme-alpine ag-theme-fiestapay judge-preview-grid"
            style={{ height: '430px', minWidth: '880px', width: '100%' }}
          >
            <AgGridReact<PreviewGuest>
              rowData={SAMPLE_GUESTS}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              quickFilterText={quickFilter}
              domLayout="normal"
              pagination={true}
              paginationPageSize={10}
              paginationPageSizeSelector={false}
              rowHeight={52}
              localeText={{
                page: 'Página',
                to: 'a',
                of: 'de',
                firstPage: 'Primera página',
                previousPage: 'Página anterior',
                nextPage: 'Página siguiente',
                lastPage: 'Última página',
                noRowsToShow: 'No hay filas ficticias para este filtro',
              }}
            />
          </div>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--color-ink-light)' }}>
          Tabla de demostración. No hay botones para escribir, moderar, enviar WhatsApp ni cobrar.
        </p>
      </section>
    </div>
  );
};
