import React, { useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import type { PaymentActivityItem, PayPalNotificationItem } from '@fiestapay/shared';
import { useI18n, useMessages } from '../../i18n/I18nContext';
import { dashboardCatalog } from '../../i18n/messages/organizerDashboard';

const GRID_LOCALE_TEXT_ES = {
  page: 'Página',
  to: 'a',
  of: 'de',
  firstPage: 'Primera página',
  previousPage: 'Página anterior',
  nextPage: 'Página siguiente',
  lastPage: 'Última página',
  noRowsToShow: 'Aún no hay movimientos',
};

interface PaymentActivityPanelProps {
  /** Server-provided verified ledger rows for this event only. */
  activity: PaymentActivityItem[];
  /** Closed notification types correlated to this event. No payload or webhook id. */
  notifications: PayPalNotificationItem[];
  loading?: boolean;
  example?: boolean;
}

const notificationLabel = (type: PayPalNotificationItem['type'], m: typeof dashboardCatalog.es): string => {
  switch (type) {
    case 'CHECKOUT.ORDER.COMPLETED':
      return m.notificationOrderCompleted;
    case 'PAYMENT.CAPTURE.COMPLETED':
      return m.notificationCaptureCompleted;
    case 'PAYMENT.CAPTURE.REFUNDED':
      return m.notificationRefunded;
  }
};

/**
 * Organizer-only payment evidence. The AG Grid Community rows are the event's verified ledger
 * entries (captures and refunds), and the notification list is the closed set of signed PayPal
 * receipts recorded for this event. The component never recomputes money or invents a status.
 */
export const PaymentActivityPanel: React.FC<PaymentActivityPanelProps> = ({
  activity,
  notifications,
  loading = false,
  example = false,
}) => {
  const { locale, formatMoney, formatDateTime } = useI18n();
  const m = useMessages(dashboardCatalog);

  const columnDefs = useMemo<ColDef<PaymentActivityItem>[]>(
    () => [
      {
        headerName: m.activityColGuest,
        field: 'guestName',
        flex: 1.4,
        minWidth: 150,
        cellRenderer: (params: ICellRendererParams<PaymentActivityItem>) => {
          const row = params.data;
          if (!row) return null;
          return <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.guestName}</strong>;
        },
      },
      {
        headerName: m.activityColKind,
        field: 'kind',
        flex: 0.8,
        minWidth: 110,
        cellRenderer: (params: ICellRendererParams<PaymentActivityItem>) => {
          const row = params.data;
          if (!row) return null;
          return row.kind === 'capture'
            ? <span className="badge badge-teal">{m.activityKindCapture}</span>
            : <span className="badge badge-coral">{m.activityKindRefund}</span>;
        },
      },
      {
        headerName: m.activityColAmount,
        field: 'amountCents',
        flex: 1,
        minWidth: 120,
        cellRenderer: (params: ICellRendererParams<PaymentActivityItem>) => {
          const row = params.data;
          if (!row) return null;
          return (
            <span
              style={{
                color: row.kind === 'capture' ? 'var(--color-teal)' : 'var(--color-coral)',
                fontWeight: 700,
              }}
            >
              {formatMoney(row.amountCents)}
            </span>
          );
        },
      },
      {
        headerName: m.activityColCapture,
        field: 'captureId',
        flex: 1.6,
        minWidth: 190,
        cellRenderer: (params: ICellRendererParams<PaymentActivityItem>) => {
          const row = params.data;
          if (!row) return null;
          return (
            <code
              title={row.captureId}
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                fontSize: '0.75rem',
                color: 'var(--color-ink-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                display: 'block',
              }}
            >
              {row.captureId}
            </code>
          );
        },
      },
      {
        headerName: m.activityColTime,
        field: 'createdAt',
        flex: 1.2,
        minWidth: 160,
        cellRenderer: (params: ICellRendererParams<PaymentActivityItem>) => {
          const row = params.data;
          if (!row) return null;
          return (
            <time dateTime={row.createdAt} style={{ color: 'var(--color-ink-muted)', fontSize: '0.8rem' }}>
              {formatDateTime(row.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
            </time>
          );
        },
      },
    ],
    [m, formatMoney, formatDateTime],
  );

  const defaultColDef = useMemo<ColDef>(
    () => ({ sortable: true, filter: false, resizable: true }),
    [],
  );

  return (
    <section className="panel" aria-label={m.activityAria} style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', marginBottom: '0.25rem' }}>{m.activityTitle}</h2>
          <p style={{ color: 'var(--color-ink-muted)', fontSize: '0.85rem' }}>{example ? m.activityExample : m.activitySub}</p>
        </div>
        {!loading ? (
          <span style={{ color: 'var(--color-ink-muted)', fontSize: '0.8rem' }}>
            {m.activityCount(activity.length)}
          </span>
        ) : null}
      </div>

      {loading ? (
        <p role="status" style={{ color: 'var(--color-ink-muted)', fontSize: '0.875rem' }}>
          {m.activityLoading}
        </p>
      ) : activity.length === 0 ? (
        <p role="status" style={{ color: 'var(--color-ink-muted)', fontSize: '0.875rem', marginTop: '0.75rem' }}>
          {m.activityEmpty}
        </p>
      ) : (
        <div
          role="region"
          aria-label={m.activityAria}
          data-testid="payment-activity-grid"
          className="ag-theme-alpine ag-theme-fiestapay"
          style={{
            width: '100%',
            height: '300px',
            marginTop: '0.75rem',
            borderRadius: 'var(--radius-md)',
            overflowX: 'auto',
          }}
        >
          <AgGridReact<PaymentActivityItem>
            rowData={activity}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            getRowId={(params) => params.data.id}
            domLayout="normal"
            suppressCellFocus={false}
            ensureDomOrder={true}
            pagination={true}
            paginationPageSize={10}
            paginationPageSizeSelector={false}
            localeText={locale === 'es' ? GRID_LOCALE_TEXT_ES : undefined}
            rowHeight={52}
          />
        </div>
      )}

      {!example ? (
        <>
          <p style={{ color: 'var(--color-ink-light)', fontSize: '0.75rem', marginTop: '0.65rem' }}>
            {m.activityNote}
          </p>

          <div
            aria-label={m.notificationsAria}
            style={{
              marginTop: '1rem',
              paddingTop: '0.85rem',
              borderTop: '1px solid var(--color-border)',
            }}
          >
            <h3 style={{ fontSize: '0.95rem', marginBottom: '0.2rem' }}>{m.notificationsTitle}</h3>
            <p style={{ color: 'var(--color-ink-muted)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
              {m.notificationsSub}
            </p>
            {notifications.length === 0 ? (
              <p role="status" style={{ color: 'var(--color-ink-muted)', fontSize: '0.85rem' }}>
                {m.notificationsEmpty}
              </p>
            ) : (
              <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem' }}>
                {notifications.map((notification, index) => (
                  <li
                    key={`${notification.type}-${notification.receivedAt}-${index}`}
                    style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}
                  >
                    <span style={{ minWidth: 0 }}>
                        {notificationLabel(notification.type, m)}{' '}
                        <code style={{ overflowWrap: 'anywhere' }}>{notification.type}</code>
                      </span>
                    <time dateTime={notification.receivedAt} style={{ color: 'var(--color-ink-muted)', fontSize: '0.775rem' }}>
                      {formatDateTime(notification.receivedAt, { dateStyle: 'medium', timeStyle: 'short' })}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
};
