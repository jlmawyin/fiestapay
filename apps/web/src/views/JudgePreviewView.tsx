import React, { useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { UI_LABELS } from '@fiestapay/shared';
import type { FiestaEvent } from '../types';
import { Modal } from '../components/common/Modal';
import { EventCard } from '../components/demo/EventCard';
import { useI18n, useMessages } from '../i18n/I18nContext';
import { cardsCatalog } from '../i18n/catalogs/cards';
import { demoCatalog } from '../i18n/catalogs/demo';
import { isDemoEvent } from '../lib/event-presentation';

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

type DemoCopy = (typeof demoCatalog)['es'];

function attendanceLabelFor(attendance: PreviewGuest['attendance'], m: DemoCopy): string {
  if (attendance === 'yes') return m.attYes;
  if (attendance === 'maybe') return m.attMaybe;
  return m.attNo;
}

function paymentStateFor(guest: PreviewGuest | undefined, m: DemoCopy): string {
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
  const [isCreating, setIsCreating] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const creatingRef = useRef(false);
  const payingRef = useRef(false);

  const demos = events.filter((event) => isDemoEvent(event));
  const goInvite = onNavigateInvite ?? (() => undefined);
  const goDashboard = onNavigateDashboard ?? (() => undefined);
  const goRecover = onNavigateRecover ?? (() => undefined);

  const columnDefs = useMemo<ColDef<PreviewGuest>[]>(
    () => [
      {
        headerName: m.colGuest,
        field: 'name',
        flex: 1.4,
        minWidth: 190,
        filter: true,
      },
      {
        headerName: m.colAttendance,
        field: 'attendance',
        flex: 1,
        minWidth: 145,
        filter: true,
        cellRenderer: (params: ICellRendererParams<PreviewGuest>) => {
          const guest = params.data;
          if (!guest) return null;
          const className =
            guest.attendance === 'yes' ? 'badge badge-teal' : guest.attendance === 'maybe' ? 'badge badge-yellow' : 'badge badge-coral';
          return <span className={className}>{attendanceLabelFor(guest.attendance, m)}</span>;
        },
        filterValueGetter: (params) => attendanceLabelFor((params.data?.attendance ?? 'no') as PreviewGuest['attendance'], m),
      },
      {
        headerName: m.colCompanions,
        field: 'companions',
        width: 130,
        minWidth: 120,
        filter: true,
        valueFormatter: (params) => `+${params.value ?? 0}`,
      },
      {
        headerName: m.colPaid,
        field: 'paidCents',
        width: 155,
        minWidth: 145,
        filter: 'agNumberColumnFilter',
        cellRenderer: (params: ICellRendererParams<PreviewGuest>) => (
          <span style={{ color: 'var(--color-teal)', fontWeight: 700 }}>{formatMoney(params.value ?? 0)}</span>
        ),
      },
      {
        headerName: m.colDue,
        field: 'dueCents',
        width: 165,
        minWidth: 155,
        filter: 'agNumberColumnFilter',
        cellRenderer: (params: ICellRendererParams<PreviewGuest>) => (
          <span style={{ color: 'var(--color-coral)', fontWeight: 700 }}>{formatMoney(params.value ?? 0)}</span>
        ),
      },
      {
        headerName: m.colState,
        colId: 'paymentState',
        flex: 1.1,
        minWidth: 170,
        filter: true,
        valueGetter: (params) => paymentStateFor(params.data, m),
      },
    ],
    [formatMoney, m],
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
          <button type="button" onClick={onBack} className="btn btn-secondary">
            {m.back}
          </button>
        </div>
        <p style={{ color: 'var(--color-ink-muted)', fontSize: '0.9rem', maxWidth: '720px' }}>
          {m.intro}
        </p>
      </section>

      <ol style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: 0, margin: 0 }}>
        <li
          className="panel"
          aria-label={`1. ${m.step1Title}`}
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

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem' }}>{m.guestsTitle}</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-ink-muted)' }}>
                {m.guestsSub}
              </p>
            </div>
            <label className="form-label" htmlFor="judge-preview-filter" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '220px', maxWidth: '100%' }}>
              {m.filterLabel}
              <input
                id="judge-preview-filter"
                className="form-input"
                value={quickFilter}
                onChange={(event) => setQuickFilter(event.target.value)}
                placeholder={m.filterPlaceholder}
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
            disabled={isCreating}
          >
            {isCreating ? m.privateLoading : labels.privateDemo}
          </button>
        </div>
      </section>

      <section aria-label={labels.myDemos} style={{ minWidth: 0 }}>
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
