import React, { useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import type { Guest } from '../../types';
import { usd } from '../../types';
import {
  buildGuestReminderUrl,
  canSendReminder,
  getGuestPaymentStatus,
} from './reminderHelper';

export interface GuestGridProps {
  guests: Guest[];
  eventTitle: string;
  inviteUrl: string;
}

export const GuestGrid: React.FC<GuestGridProps> = ({
  guests,
  eventTitle,
  inviteUrl,
}) => {
  const columnDefs = useMemo<ColDef<Guest>[]>(() => {
    return [
      {
        headerName: 'Invitado',
        field: 'name',
        flex: 1.5,
        minWidth: 240,
        cellRenderer: (params: ICellRendererParams<Guest>) => {
          const guest = params.data;
          if (!guest) return <strong>{params.value}</strong>;
          return (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                lineHeight: 1.3,
                minHeight: '100%',
              }}
            >
              <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {guest.name}
              </strong>
              <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>
                {getGuestPaymentStatus(guest).label}
              </span>
              {canSendReminder(guest) && (
                <span
                  data-testid={`guest-pending-note-${guest.id}`}
                  style={{
                    fontSize: '0.72rem',
                    color: 'var(--color-coral)',
                    fontWeight: 600,
                  }}
                >
                  Pendiente: {usd(guest.dueCents)}
                </span>
              )}
            </div>
          );
        },
      },
      {
        headerName: 'Asistencia',
        field: 'status',
        flex: 1.3,
        minWidth: 160,
        cellRenderer: (params: ICellRendererParams<Guest>) => {
          const guest = params.data;
          if (!guest) return null;
          return guest.status === 'yes'
            ? <span className="badge badge-teal">✓ Confirmado</span>
            : guest.status === 'maybe'
              ? <span className="badge badge-yellow">? Tal vez</span>
              : <span className="badge badge-coral">✕ No asistirá</span>;
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
      {
        headerName: 'Recordatorio',
        colId: 'reminderAction',
        flex: 1.3,
        minWidth: 150,
        sortable: false,
        cellRenderer: (params: ICellRendererParams<Guest>) => {
          const guest = params.data;
          if (!guest || !canSendReminder(guest)) {
            return <span style={{ color: 'var(--color-ink-light)', fontSize: '0.8rem' }}>—</span>;
          }
          const reminderUrl = buildGuestReminderUrl({
            guestName: guest.name,
            eventTitle,
            dueCents: guest.dueCents,
            inviteUrl,
          });
          return (
            <a
              href={reminderUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
              data-testid={`reminder-link-${guest.id}`}
              title="Prepara el mensaje en WhatsApp para que el organizador lo revise y envíe manualmente"
              aria-label={`Preparar recordatorio en WhatsApp para ${guest.name} (${usd(guest.dueCents)} pendiente)`}
              style={{
                fontSize: '0.75rem',
                padding: '0.2rem 0.55rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                textDecoration: 'none',
                fontWeight: 600,
                color: 'var(--color-ink)',
              }}
            >
              <span>💬 Recordar</span>
            </a>
          );
        },
      },
    ];
  }, [eventTitle, inviteUrl]);

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
        height: '340px',
        borderRadius: 'var(--radius-md)',
        overflowX: 'auto',
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
        paginationPageSizeSelector={false}
        localeText={{ page: 'Página', to: 'a', of: 'de', firstPage: 'Primera página', previousPage: 'Página anterior', nextPage: 'Página siguiente', lastPage: 'Última página' }}
        rowHeight={68}
      />
    </div>
  );
};
