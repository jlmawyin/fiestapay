import React, { useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import type { Guest } from '../../types';
import { usd } from '../../types';

interface GuestGridProps {
  guests: Guest[];
}

export const GuestGrid: React.FC<GuestGridProps> = ({ guests }) => {
  const columnDefs = useMemo<ColDef<Guest>[]>(() => {
    return [
      {
        headerName: 'Invitado',
        field: 'name',
        flex: 1.5,
        minWidth: 140,
        cellRenderer: (params: ICellRendererParams<Guest>) => {
          return <strong>{params.value}</strong>;
        },
      },
      {
        headerName: 'Asistencia',
        field: 'status',
        flex: 1.2,
        minWidth: 120,
        cellRenderer: (params: ICellRendererParams<Guest>) => {
          const status = params.value;
          if (status === 'yes') {
            return <span className="badge badge-teal">✓ Confirmado</span>;
          }
          if (status === 'maybe') {
            return <span className="badge badge-yellow">? Tal vez</span>;
          }
          return <span className="badge badge-coral">✕ No asistirá</span>;
        },
      },
      {
        headerName: 'Acompañantes',
        field: 'companions',
        flex: 1,
        minWidth: 110,
        cellRenderer: (params: ICellRendererParams<Guest>) => {
          const val = params.value || 0;
          return <span>+{val}</span>;
        },
      },
      {
        headerName: 'Total Personas',
        valueGetter: (params) => {
          return 1 + (params.data?.companions || 0);
        },
        flex: 1,
        minWidth: 110,
      },
      {
        headerName: 'Pagado',
        field: 'paidCents',
        flex: 1.1,
        minWidth: 110,
        cellRenderer: (params: ICellRendererParams<Guest>) => {
          const val = params.value || 0;
          return <span style={{ color: 'var(--color-teal)', fontWeight: 700 }}>{usd(val)}</span>;
        },
      },
      {
        headerName: 'Pendiente',
        field: 'dueCents',
        flex: 1.1,
        minWidth: 110,
        cellRenderer: (params: ICellRendererParams<Guest>) => {
          const val = params.value || 0;
          return (
            <span style={{ color: val > 0 ? 'var(--color-coral)' : 'var(--color-ink-muted)', fontWeight: 600 }}>
              {usd(val)}
            </span>
          );
        },
      },
    ];
  }, []);

  const defaultColDef = useMemo<ColDef>(
    () => ({
      sortable: true,
      filter: false,
      resizable: true,
    }),
    []
  );

  return (
    <div
      className="ag-theme-alpine ag-theme-fiestapay"
      style={{
        width: '100%',
        height: '320px',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <AgGridReact<Guest>
        rowData={guests}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        domLayout="normal"
        suppressCellFocus={false}
        pagination={true}
        paginationPageSize={10}
        paginationPageSizeSelector={[10, 20, 50]}
      />
    </div>
  );
};
