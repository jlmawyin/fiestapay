import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, MessageCircle, X } from 'lucide-react';
import { AgGridReact } from 'ag-grid-react';
import type {
  ColDef,
  GridApi,
  GridReadyEvent,
  ICellRendererParams,
  IRowNode,
  ProcessCellForExportParams,
  RowClassParams,
} from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import type { GuestTotals } from '@fiestapay/shared';
import type { Guest } from '../../types';
import { useI18n, useMessages } from '../../i18n/I18nContext';
import { gridCatalog } from '../../i18n/messages/organizerGrid';
import { GridToolbar } from '../common/GridToolbar';
import {
  centsToDecimalText,
  reconciliationCsvFileName,
  slugFromInviteUrl,
} from '../../lib/grid-export';
import {
  buildGuestReminderUrl,
  canSendReminder,
  getGuestPaymentStatus,
} from './reminderHelper';

export interface GuestModerationActions {
  onBlock: (guestId: string) => void;
  onUnblock: (guestId: string) => void;
  onRemove: (guestId: string) => void;
  busyId?: string | null;
}

export interface GuestGridProps {
  guests: Guest[];
  eventTitle: string;
  inviteUrl: string;
  /** Organizer only. Omitted on any surface that is not the keyed dashboard. */
  moderation?: GuestModerationActions;
  /** Server-computed totals. When absent there is no pinned totals row. */
  guestTotals?: GuestTotals;
}

const GRID_LOCALE_TEXT_ES = {
  page: 'Página',
  to: 'a',
  of: 'de',
  firstPage: 'Primera página',
  previousPage: 'Página anterior',
  nextPage: 'Página siguiente',
  lastPage: 'Última página',
  noRowsToShow: 'Aún no hay aportes',
};

/** Data columns exported to CSV. Action columns stay out. */
const CSV_COLUMN_KEYS = ['name', 'status', 'companions', 'totalPeople', 'paidCents', 'dueCents'];

function attendanceLabel(status: unknown, m: { attYes: string; attMaybe: string; attNo: string }): string {
  if (status === 'yes') return m.attYes;
  if (status === 'maybe') return m.attMaybe;
  return m.attNo;
}

export const GuestGrid: React.FC<GuestGridProps> = ({
  guests,
  eventTitle,
  inviteUrl,
  moderation,
  guestTotals,
}) => {
  const { locale, formatMoney } = useI18n();
  const m = useMessages(gridCatalog);
  const [quickFilter, setQuickFilter] = useState('');
  const [pendingOnly, setPendingOnly] = useState(false);
  const apiRef = useRef<GridApi<Guest> | null>(null);

  const onGridReady = useCallback((event: GridReadyEvent<Guest>) => {
    apiRef.current = event.api;
  }, []);

  /** Community external filter: pending-only means server dueCents > 0. */
  const isExternalFilterPresent = useCallback(() => pendingOnly, [pendingOnly]);
  const doesExternalFilterPass = useCallback(
    (node: IRowNode<Guest>) => (node.data?.dueCents ?? 0) > 0,
    [],
  );

  useEffect(() => {
    apiRef.current?.onFilterChanged();
  }, [pendingOnly]);

  /** Pinned totals row, taken as-is from the server. No web-side money math. */
  const pinnedBottomRowData = useMemo<Guest[] | undefined>(() => {
    if (!guestTotals) return undefined;
    return [
      {
        id: '__totals__',
        name: m.totals,
        status: 'yes',
        companions: 0,
        paidCents: guestTotals.paidCents,
        dueCents: guestTotals.dueCents,
      },
    ];
  }, [guestTotals, m.totals]);

  const handleExport = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const slug = slugFromInviteUrl(inviteUrl) ?? m.csvSlugFallback;
    void api.exportDataAsCsv({
      fileName: reconciliationCsvFileName(slug, locale),
      columnKeys: CSV_COLUMN_KEYS,
      processCellCallback: (params: ProcessCellForExportParams<Guest>) => {
        const colId = params.column?.getColId();
        if (params.node?.rowPinned && (colId === 'status' || colId === 'companions')) return '';
        if (colId === 'paidCents' || colId === 'dueCents') {
          return centsToDecimalText(Number(params.value) || 0);
        }
        if (colId === 'status') return attendanceLabel(params.value, m);
        return String(params.value ?? '');
      },
    });
  }, [inviteUrl, locale, m]);

  const columnDefs = useMemo<ColDef<Guest>[]>(() => {
    return [
      {
        headerName: m.colGuest,
        field: 'name',
        flex: 1.5,
        minWidth: 240,
        cellRenderer: (params: ICellRendererParams<Guest>) => {
          if (params.node?.rowPinned) return <strong>{m.totals}</strong>;
          const guest = params.data;
          if (!guest) return <strong>{params.value}</strong>;
          const payment = getGuestPaymentStatus(guest, locale);
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
              <span style={{ fontSize: '0.72rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                {payment.badgeClass === 'badge-teal' ? (
                  <Check size={12} aria-hidden="true" />
                ) : payment.badgeClass === 'badge-coral' ? (
                  <X size={12} aria-hidden="true" />
                ) : null}
                <span>{payment.label}</span>
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
                  {m.pendingNote(formatMoney(guest.dueCents))}
                </span>
              )}
            </div>
          );
        },
      },
      {
        headerName: m.colAttendance,
        field: 'status',
        flex: 1.3,
        minWidth: 160,
        cellRenderer: (params: ICellRendererParams<Guest>) => {
          if (params.node?.rowPinned) return null;
          const guest = params.data;
          if (!guest) return null;
          return guest.status === 'yes'
            ? (
              <span className="badge badge-teal">
                <Check size={12} aria-hidden="true" />
                <span>{m.attYes}</span>
              </span>
            )
            : guest.status === 'maybe'
              ? <span className="badge badge-yellow">{m.attMaybe}</span>
              : (
                <span className="badge badge-coral">
                  <X size={12} aria-hidden="true" />
                  <span>{m.attNo}</span>
                </span>
              );
        },
      },
      {
        headerName: m.colCompanions,
        field: 'companions',
        flex: 1,
        minWidth: 110,
        cellRenderer: (params: ICellRendererParams<Guest>) => {
          if (params.node?.rowPinned) return null;
          const val = params.value || 0;
          return <span>+{val}</span>;
        },
      },
      {
        headerName: m.colTotal,
        colId: 'totalPeople',
        valueGetter: (params) => {
          if (params.node?.rowPinned) return guestTotals?.people ?? '';
          return 1 + (params.data?.companions || 0);
        },
        flex: 1,
        minWidth: 110,
      },
      {
        headerName: m.colPaid,
        field: 'paidCents',
        flex: 1.1,
        minWidth: 110,
        cellRenderer: (params: ICellRendererParams<Guest>) => {
          const val = params.value || 0;
          return <span style={{ color: 'var(--color-teal)', fontWeight: 700 }}>{formatMoney(val)}</span>;
        },
      },
      {
        headerName: m.colDue,
        field: 'dueCents',
        flex: 1.1,
        minWidth: 110,
        cellRenderer: (params: ICellRendererParams<Guest>) => {
          const val = params.value || 0;
          return (
            <span style={{ color: val > 0 ? 'var(--color-coral)' : 'var(--color-ink-muted)', fontWeight: 600 }}>
              {formatMoney(val)}
            </span>
          );
        },
      },
      {
        headerName: m.colReminder,
        colId: 'reminderAction',
        flex: 1.3,
        minWidth: 150,
        sortable: false,
        cellRenderer: (params: ICellRendererParams<Guest>) => {
          if (params.node?.rowPinned) return null;
          const guest = params.data;
          if (!guest || !canSendReminder(guest)) {
            return <span style={{ color: 'var(--color-ink-light)', fontSize: '0.8rem' }}>—</span>;
          }
          const reminderUrl = buildGuestReminderUrl({
            guestName: guest.name,
            eventTitle,
            dueCents: guest.dueCents,
            inviteUrl,
          }, locale);
          return (
            <a
              href={reminderUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
              data-testid={`reminder-link-${guest.id}`}
              title={m.reminderTitle}
              aria-label={m.reminderAria(guest.name, formatMoney(guest.dueCents))}
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
              <MessageCircle size={14} aria-hidden="true" />
              <span>{m.remindBtn}</span>
            </a>
          );
        },
      },
      ...(moderation
        ? [
            {
              headerName: m.colModeration,
              colId: 'moderation',
              flex: 1.4,
              minWidth: 180,
              sortable: false,
              cellRenderer: (params: ICellRendererParams<Guest>) => {
                if (params.node?.rowPinned) return null;
                const guest = params.data;
                if (!guest) return null;
                const busy = moderation.busyId === guest.id;
                const label = guest.removedAt
                  ? m.modRemoved
                  : guest.blockedAt
                    ? m.modBlocked
                    : guest.paymentPending
                      ? m.modPending
                      : m.modActive;
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>{label}</span>
                    <span style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        data-testid={`moderation-block-${guest.id}`}
                        disabled={busy || Boolean(guest.blockedAt || guest.removedAt)}
                        onClick={() => moderation.onBlock(guest.id)}
                      >
                        {m.modBlock}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        data-testid={`moderation-unblock-${guest.id}`}
                        disabled={busy || !guest.blockedAt || Boolean(guest.removedAt)}
                        onClick={() => moderation.onUnblock(guest.id)}
                      >
                        {m.modUnblock}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        data-testid={`moderation-remove-${guest.id}`}
                        disabled={busy || Boolean(guest.removedAt)}
                        onClick={() => moderation.onRemove(guest.id)}
                      >
                        {m.modRemove}
                      </button>
                    </span>
                  </div>
                );
              },
            } satisfies ColDef<Guest>,
          ]
        : []),
    ];
  }, [eventTitle, inviteUrl, moderation, m, locale, formatMoney, guestTotals]);

  const defaultColDef = useMemo<ColDef>(
    () => ({
      sortable: true,
      filter: false,
      resizable: true,
    }),
    []
  );

  const rowClassRules = useMemo<Record<string, (params: RowClassParams<Guest>) => boolean>>(
    () => ({
      'fp-grid-row-pending': (params) => !params.node?.rowPinned && (params.data?.dueCents ?? 0) > 0,
      'fp-grid-row-muted': (params) =>
        !params.node?.rowPinned && Boolean(params.data?.blockedAt ?? params.data?.removedAt),
    }),
    []
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', minWidth: 0 }}>
      <GridToolbar
        searchId="guest-grid-search"
        searchLabel={m.searchLabel}
        searchPlaceholder={m.searchPlaceholder}
        searchValue={quickFilter}
        onSearchChange={setQuickFilter}
        pendingOnly={pendingOnly}
        onPendingOnlyChange={setPendingOnly}
        pendingOnlyLabel={m.pendingOnly}
        onExport={handleExport}
        exportLabel={m.exportCsv}
        searchTestId="guest-grid-search"
        pendingTestId="guest-grid-pending-only"
        exportTestId="guest-grid-export"
      />
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
          localeText={locale === 'es' ? GRID_LOCALE_TEXT_ES : undefined}
          rowHeight={68}
          quickFilterText={quickFilter}
          isExternalFilterPresent={isExternalFilterPresent}
          doesExternalFilterPass={doesExternalFilterPass}
          pinnedBottomRowData={pinnedBottomRowData}
          rowClassRules={rowClassRules}
          onGridReady={onGridReady}
        />
      </div>
    </div>
  );
};
