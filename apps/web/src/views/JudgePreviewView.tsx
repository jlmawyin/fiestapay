import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
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
import { UI_LABELS } from '@fiestapay/shared';
import { startGuidedTour } from '../guide/showOnScreen';
import type { FiestaEvent } from '../types';
import { Modal } from '../components/common/Modal';
import { GridToolbar } from '../components/common/GridToolbar';
import { EventCard } from '../components/demo/EventCard';
import { PayPalAiPanel } from '../components/demo/PayPalAiPanel';
import { SamplePartyCards } from '../components/demo/SamplePartyCards';
import { useI18n, useMessages } from '../i18n/I18nContext';
import { cardsCatalog } from '../i18n/catalogs/cards';
import { demoCatalog } from '../i18n/catalogs/demo';
import { isDemoEvent } from '../lib/event-presentation';
import { centsToDecimalText, reconciliationCsvFileName } from '../lib/grid-export';
import { SAMPLE_PARTIES, samplePartyById, sampleTotals, type SampleGuest } from '../lib/sample-parties';

export interface JudgePreviewViewProps {
  /** Session events; only `isDemo === true` rows are listed here. */
  events?: FiestaEvent[];
  isLoading?: boolean;
  eventsError?: string | null;
  onRetryEvents?: () => void;
  /** Private demo: POST /api/demo { kind: 'private' }. */
  onCreateDemo: () => Promise<void>;
  /** Payment tour: POST /api/demo { kind: 'payment' }, join, RSVP, open invite. */
  onStartPaymentDemo?: () => Promise<void>;
  /** Opens the assistant orb in the demo context. */
  onTalkToAssistant?: () => void;
  /** Archives only this browser's demos. */
  onResetDemo?: () => Promise<void>;
  isResetting?: boolean;
  onNavigateInvite?: (slug: string) => void;
  onNavigateDashboard?: (slug: string) => void;
  onNavigateRecover?: () => void;
  onBack: () => void;
}

type DemoCopy = (typeof demoCatalog)['es'];

function attendanceLabelFor(attendance: SampleGuest['attendance'], m: DemoCopy): string {
  if (attendance === 'yes') return m.attYes;
  if (attendance === 'maybe') return m.attMaybe;
  return m.attNo;
}

function paymentStateFor(guest: SampleGuest | undefined, m: DemoCopy): string {
  if (!guest) return m.payNone;
  if (guest.dueCents === 0 && guest.paidCents > 0) return m.payFull;
  if (guest.paidCents > 0 && guest.dueCents > 0) return m.payPartial;
  if (guest.dueCents > 0) return m.payPending;
  return m.payZero;
}

const GRID_LOCALE_TEXT_ES = {
  page: 'Página',
  to: 'a',
  of: 'de',
  firstPage: 'Primera página',
  previousPage: 'Página anterior',
  nextPage: 'Página siguiente',
  lastPage: 'Última página',
  noRowsToShow: 'No hay filas ficticias para este filtro',
};

/**
 * Judges demo: a fictional banner, a 3-step guided tour (read-only AG Grid
 * sample, guided Sandbox payment, assistant), the private demo, this
 * browser's demos, and the demos-only reset. No fetch happens here; every
 * demo action is an explicit button handled by the caller.
 */
export const JudgePreviewView: React.FC<JudgePreviewViewProps> = ({
  events = [],
  isLoading = false,
  eventsError = null,
  onRetryEvents,
  onCreateDemo,
  onStartPaymentDemo,
  onTalkToAssistant,
  onResetDemo,
  isResetting = false,
  onNavigateInvite,
  onNavigateDashboard,
  onNavigateRecover,
  onBack,
}) => {
  const { locale, formatMoney } = useI18n();
  const m = useMessages(demoCatalog);
  const cards = useMessages(cardsCatalog);
  const labels = UI_LABELS[locale];
  const [quickFilter, setQuickFilter] = useState('');
  const [pendingOnly, setPendingOnly] = useState(false);
  const [selectedPartyId, setSelectedPartyId] = useState(SAMPLE_PARTIES[0].id);
  const selectedParty = samplePartyById(selectedPartyId);
  const gridApiRef = useRef<GridApi<SampleGuest> | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const creatingRef = useRef(false);
  const payingRef = useRef(false);

  const demos = events.filter((event) => isDemoEvent(event));
  const goInvite = onNavigateInvite ?? (() => undefined);
  const goDashboard = onNavigateDashboard ?? (() => undefined);
  const goRecover = onNavigateRecover ?? (() => undefined);

  const onGridReady = useCallback((event: GridReadyEvent<SampleGuest>) => {
    gridApiRef.current = event.api;
  }, []);

  /** Community external filter: pending-only means fictional dueCents > 0. */
  const isExternalFilterPresent = useCallback(() => pendingOnly, [pendingOnly]);
  const doesExternalFilterPass = useCallback(
    (node: IRowNode<SampleGuest>) => (node.data?.dueCents ?? 0) > 0,
    [],
  );

  useEffect(() => {
    gridApiRef.current?.onFilterChanged();
  }, [pendingOnly]);

  /** Fictional pinned totals, computed with fixture functions like sampleCollectedCents. */
  const pinnedBottomRowData = useMemo<SampleGuest[]>(() => {
    const totals = sampleTotals(selectedParty);
    return [
      {
        id: '__totals__',
        name: m.totals,
        attendance: 'yes',
        companions: 0,
        paidCents: totals.paidCents,
        dueCents: totals.dueCents,
      },
    ];
  }, [selectedParty, m]);

  const handleExport = useCallback(() => {
    const api = gridApiRef.current;
    if (!api) return;
    void api.exportDataAsCsv({
      fileName: reconciliationCsvFileName(selectedParty.id, locale),
      columnKeys: ['name', 'attendance', 'companions', 'paidCents', 'dueCents'],
      processCellCallback: (params: ProcessCellForExportParams<SampleGuest>) => {
        const colId = params.column?.getColId();
        if (params.node?.rowPinned && (colId === 'attendance' || colId === 'companions')) return '';
        if (colId === 'paidCents' || colId === 'dueCents') {
          return centsToDecimalText(Number(params.value) || 0);
        }
        if (colId === 'attendance') {
          return attendanceLabelFor((params.value ?? 'no') as SampleGuest['attendance'], m);
        }
        return String(params.value ?? '');
      },
    });
  }, [locale, m, selectedParty.id]);

  const rowClassRules = useMemo<Record<string, (params: RowClassParams<SampleGuest>) => boolean>>(
    () => ({
      'fp-grid-row-pending': (params) => !params.node?.rowPinned && (params.data?.dueCents ?? 0) > 0,
    }),
    [],
  );

  const columnDefs = useMemo<ColDef<SampleGuest>[]>(
    () => [
      {
        headerName: m.colGuest,
        field: 'name',
        flex: 1.4,
        minWidth: 190,
        filter: true,
        cellRenderer: (params: ICellRendererParams<SampleGuest>) => {
          if (params.node?.rowPinned) return <strong>{m.totals}</strong>;
          return <span>{params.value}</span>;
        },
      },
      {
        headerName: m.colAttendance,
        field: 'attendance',
        flex: 1,
        minWidth: 145,
        filter: true,
        cellRenderer: (params: ICellRendererParams<SampleGuest>) => {
          if (params.node?.rowPinned) return null;
          const guest = params.data;
          if (!guest) return null;
          const className =
            guest.attendance === 'yes' ? 'badge badge-teal' : guest.attendance === 'maybe' ? 'badge badge-yellow' : 'badge badge-coral';
          return (
            <span className={className}>
              {guest.attendance === 'yes' ? (
                <Check size={12} aria-hidden="true" />
              ) : guest.attendance === 'no' ? (
                <X size={12} aria-hidden="true" />
              ) : null}
              <span>{attendanceLabelFor(guest.attendance, m)}</span>
            </span>
          );
        },
        filterValueGetter: (params) => attendanceLabelFor((params.data?.attendance ?? 'no') as SampleGuest['attendance'], m),
      },
      {
        headerName: m.colCompanions,
        field: 'companions',
        width: 130,
        minWidth: 120,
        filter: true,
        valueFormatter: (params) => (params.node?.rowPinned ? '' : `+${params.value ?? 0}`),
      },
      {
        headerName: m.colPaid,
        field: 'paidCents',
        width: 155,
        minWidth: 145,
        filter: 'agNumberColumnFilter',
        cellRenderer: (params: ICellRendererParams<SampleGuest>) => (
          <span style={{ color: 'var(--color-teal)', fontWeight: 700 }}>{formatMoney(params.value ?? 0)}</span>
        ),
      },
      {
        headerName: m.colDue,
        field: 'dueCents',
        width: 165,
        minWidth: 155,
        filter: 'agNumberColumnFilter',
        cellRenderer: (params: ICellRendererParams<SampleGuest>) => (
          <span style={{ color: 'var(--color-coral)', fontWeight: 700 }}>{formatMoney(params.value ?? 0)}</span>
        ),
      },
      {
        headerName: m.colState,
        colId: 'paymentState',
        flex: 1.1,
        minWidth: 170,
        filter: true,
        valueGetter: (params) => (params.node?.rowPinned ? '' : paymentStateFor(params.data, m)),
      },
    ],
    [formatMoney, m],
  );

  const defaultColDef = useMemo<ColDef<SampleGuest>>(
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

  const handlePaymentDemo = async () => {
    if (payingRef.current || !onStartPaymentDemo) return;
    payingRef.current = true;
    setIsPaying(true);
    try {
      await onStartPaymentDemo();
    } finally {
      payingRef.current = false;
      setIsPaying(false);
    }
  };

  const handleConfirmReset = async () => {
    try {
      await onResetDemo?.();
      setShowResetModal(false);
    } catch {
      // handled by the caller's toast
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0, maxWidth: '100%' }}>
      <div
        role="note"
        aria-label={m.banner}
        style={{
          backgroundColor: 'var(--color-yellow-tint)',
          border: '1.5px solid var(--color-yellow)',
          borderRadius: 'var(--radius-md)',
          padding: '0.85rem 1rem',
          color: 'var(--color-ink)',
          fontSize: '0.875rem',
          fontWeight: 700,
          textAlign: 'center',
        }}
      >
        {m.banner}
      </div>

      <section aria-label={labels.judgesDemo} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: '1.65rem' }}>{labels.judgesDemo}</h1>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => startGuidedTour()} className="btn btn-teal" data-guide="guidedTour">
              {labels.guidedTour}
            </button>
            <button type="button" onClick={onBack} className="btn btn-secondary">
              {m.back}
            </button>
          </div>
        </div>
        <p style={{ color: 'var(--color-ink-muted)', fontSize: '0.9rem', maxWidth: '720px' }}>
          {m.intro}
        </p>
      </section>

      <section aria-label={m.sampleTitle} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: 0 }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>{m.sampleTitle}</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-ink-muted)', maxWidth: '720px' }}>
            {m.sampleLead}
          </p>
        </div>
        <SamplePartyCards parties={SAMPLE_PARTIES} selectedId={selectedPartyId} onSelect={setSelectedPartyId} />
      </section>

      <PayPalAiPanel />

      <ol style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: 0, margin: 0 }}>
        <li
          className="panel"
          aria-label={`1. ${m.step1Title}`}
          data-guide="previewPanel"
          style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', minWidth: 0 }}
        >
          <div style={{ minWidth: 0 }}>
            <span className="badge badge-yellow" style={{ marginBottom: '0.45rem' }}>
              {m.readonlyBadge}
            </span>
            <h2 style={{ fontSize: '1.3rem', marginBottom: '0.25rem' }}>
              <span aria-hidden="true">1. </span>{m.step1Title} · {labels.previewPanel}
            </h2>
            <p style={{ color: 'var(--color-ink-muted)', fontSize: '0.9rem', maxWidth: '720px' }}>
              {m.step1Text}
            </p>
          </div>

          <div
            role="note"
            aria-label={m.fictionNoteTitle}
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
            <strong>{m.fictionNoteTitle}</strong> {m.fictionNoteText}
          </div>

          <div>
            <h3 style={{ fontSize: '1.1rem' }}>{m.gridOf(selectedParty.title)}</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-ink-muted)' }}>
              {m.guestsSub}
            </p>
          </div>

          <GridToolbar
            searchId="judge-preview-filter"
            searchLabel={m.filterLabel}
            searchPlaceholder={m.filterPlaceholder}
            searchValue={quickFilter}
            onSearchChange={setQuickFilter}
            pendingOnly={pendingOnly}
            onPendingOnlyChange={setPendingOnly}
            pendingOnlyLabel={m.pendingOnly}
            onExport={handleExport}
            exportLabel={m.exportCsv}
            searchTestId="judge-grid-search"
            pendingTestId="judge-grid-pending-only"
            exportTestId="judge-grid-export"
          />

          {/* The scroll belongs to this wrapper, never to the page body. */}
          <div style={{ width: '100%', maxWidth: '100%', minWidth: 0, overflowX: 'auto' }}>
            <div
              className="ag-theme-alpine ag-theme-fiestapay judge-preview-grid"
              style={{ height: '430px', minWidth: '880px', width: '100%' }}
            >
              <AgGridReact<SampleGuest>
                rowData={selectedParty.guests}
                columnDefs={columnDefs}
                defaultColDef={defaultColDef}
                quickFilterText={quickFilter}
                isExternalFilterPresent={isExternalFilterPresent}
                doesExternalFilterPass={doesExternalFilterPass}
                pinnedBottomRowData={pinnedBottomRowData}
                rowClassRules={rowClassRules}
                onGridReady={onGridReady}
                domLayout="normal"
                pagination={true}
                paginationPageSize={10}
                paginationPageSizeSelector={false}
                rowHeight={52}
                localeText={locale === 'es' ? GRID_LOCALE_TEXT_ES : undefined}
              />
            </div>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--color-ink-light)' }}>
            {m.gridFoot}
          </p>
        </li>

        <li
          className="panel"
          aria-label={`2. ${m.step2Title}`}
          style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', minWidth: 0 }}
        >
          <h2 style={{ fontSize: '1.3rem' }}>
            <span aria-hidden="true">2. </span>{m.step2Title}
          </h2>
          <p style={{ color: 'var(--color-ink-muted)', fontSize: '0.9rem', maxWidth: '720px' }}>
            {m.step2Text}
          </p>
          <div>
            <button
              type="button"
              onClick={() => void handlePaymentDemo()}
              className="btn btn-primary"
              data-guide="paymentDemo"
              disabled={isPaying || !onStartPaymentDemo}
            >
              {isPaying ? m.paymentLoading : labels.paymentDemo}
            </button>
          </div>
        </li>

        <li
          className="panel"
          aria-label={`3. ${m.step3Title}`}
          style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', minWidth: 0 }}
        >
          <h2 style={{ fontSize: '1.3rem' }}>
            <span aria-hidden="true">3. </span>{m.step3Title}
          </h2>
          <p style={{ color: 'var(--color-ink-muted)', fontSize: '0.9rem', maxWidth: '720px' }}>
            {m.step3Text}
          </p>
          <div>
            <button
              type="button"
              onClick={() => onTalkToAssistant?.()}
              className="btn btn-teal"
              disabled={!onTalkToAssistant}
            >
              {labels.talkToAssistant}
            </button>
          </div>
        </li>
      </ol>

      <section
        className="panel"
        aria-label={labels.privateDemo}
        style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', minWidth: 0 }}
      >
        <h2 style={{ fontSize: '1.25rem' }}>{m.privateTitle}</h2>
        <p style={{ color: 'var(--color-ink-muted)', fontSize: '0.9rem', maxWidth: '720px' }}>
          {m.privateText}
        </p>
        <div>
          <button
            type="button"
            onClick={() => void handleCreateDemo()}
            className="btn btn-teal"
            data-guide="privateDemo"
            disabled={isCreating}
          >
            {isCreating ? m.privateLoading : labels.privateDemo}
          </button>
        </div>
      </section>

      <section aria-label={labels.myDemos} data-guide="myDemos" style={{ minWidth: 0 }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>
          {labels.myDemos}
          <span style={{ marginLeft: '0.6rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-ink-muted)' }}>
            {cards.registeredCount(demos.length)}
          </span>
        </h2>
        <p style={{ fontSize: '0.8rem', color: 'var(--color-ink-muted)', marginBottom: '0.75rem' }}>
          {m.myDemosSub}
        </p>
        {isLoading ? (
          <div className="panel" style={{ textAlign: 'center', padding: '2rem' }}>
            <div style={{ color: 'var(--color-ink-muted)' }}>{m.demosLoading}</div>
          </div>
        ) : demos.length === 0 ? (
          <div className="panel" style={{ textAlign: 'center', padding: '2rem 1.5rem' }}>
            <p style={{ color: 'var(--color-ink-muted)', fontSize: '0.9rem' }}>{m.demosEmpty}</p>
          </div>
        ) : (
          <div className="event-home-grid">
            {demos.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onNavigateInvite={goInvite}
                onNavigateDashboard={goDashboard}
                onNavigateRecover={goRecover}
              />
            ))}
          </div>
        )}
        {!isLoading && eventsError && demos.length > 0 ? (
          <p role="alert" style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--color-coral)' }}>
            {eventsError}{' '}
            <button type="button" onClick={() => onRetryEvents?.()} className="btn btn-secondary" style={{ padding: '0.2rem 0.55rem', fontSize: '0.75rem' }}>
              {cards.retry}
            </button>
          </p>
        ) : null}
        {!isLoading && eventsError && demos.length === 0 ? (
          <p role="alert" style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--color-coral)' }}>
            {m.demosLoadError}{' '}
            <button type="button" onClick={() => onRetryEvents?.()} className="btn btn-secondary" style={{ padding: '0.2rem 0.55rem', fontSize: '0.75rem' }}>
              {cards.retry}
            </button>
          </p>
        ) : null}
      </section>

      <section
        aria-label={labels.resetDemos}
        style={{
          backgroundColor: 'var(--color-surface-subtle)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          padding: '0.85rem 1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          minWidth: 0,
        }}
      >
        <p style={{ color: 'var(--color-ink-muted)', fontSize: '0.85rem' }}>
          {m.resetNote}
        </p>
        <div>
          <button
            type="button"
            onClick={() => setShowResetModal(true)}
            className="btn btn-secondary"
            data-guide="resetDemos"
            style={{ color: 'var(--color-coral)' }}
            disabled={!onResetDemo}
          >
            {labels.resetDemos}
          </button>
        </div>
      </section>

      <Modal
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
        title={m.resetTitle}
        description={m.resetDesc}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-ink-muted)', lineHeight: 1.5 }}>
            {m.resetBody}
          </p>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setShowResetModal(false)}
              className="btn btn-secondary"
              disabled={isResetting}
            >
              {m.cancel}
            </button>
            <button
              type="button"
              onClick={() => void handleConfirmReset()}
              className="btn btn-coral"
              disabled={isResetting}
            >
              {isResetting ? m.resetting : m.confirmReset}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
