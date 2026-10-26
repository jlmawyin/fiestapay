import React from 'react';
import type { FiestaEvent } from '../../types';
import { usd } from '../../types';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Visible timezone offset of the local calendar, not a funding decision. */
export function formatEventInstant(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const tz = `UTC${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
  try {
    const formatted = d.toLocaleString('es-EC', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${formatted} (${tz})`;
  } catch {
    return `${d.toISOString()} (${tz})`;
  }
}

export function paidPeopleLabel(paidPeople: number | undefined): string {
  if (typeof paidPeople !== 'number' || !Number.isFinite(paidPeople)) {
    return 'Pagados: por consultar';
  }
  return `${paidPeople} pagados (cuota verificada)`;
}

export function newGuestActivityBlocked(event: Pick<FiestaEvent, 'closed' | 'fundingStatus'>): boolean {
  return event.closed === true || event.fundingStatus === 'failed';
}

const STATUS_LABEL: Record<NonNullable<FiestaEvent['fundingStatus']>, string> = {
  legacy: 'Evento anterior (sin financiamiento automático)',
  inactive: 'Sin financiamiento automático',
  open: 'Recaudación abierta',
  funded: 'Umbral de financiamiento alcanzado',
  failed: 'Mínimo no alcanzado a tiempo',
};

const STATUS_BADGE: Record<NonNullable<FiestaEvent['fundingStatus']>, string> = {
  legacy: 'badge-ink',
  inactive: 'badge-ink',
  open: 'badge-yellow',
  funded: 'badge-blue',
  failed: 'badge-coral',
};

interface FundingStatusPanelProps {
  event: FiestaEvent;
}

export const FundingStatusPanel: React.FC<FundingStatusPanelProps> = ({ event }) => {
  const status = event.fundingStatus;
  const hasDeadline = typeof event.fundingDeadlineAt === 'string' && event.fundingDeadlineAt.length > 0;
  const showDeadline = hasDeadline && status !== 'legacy' && status !== 'inactive';
  const minCents = event.minimumCents;
  const displayPct =
    typeof minCents === 'number' && minCents > 0
      ? Math.min(100, Math.max(0, Math.round((event.collectedCents / minCents) * 100)))
      : null;
  const refunds = event.refundSummary;
  const paidLabel = paidPeopleLabel(event.paidPeople);

  return (
    <section className="funding-status-panel" aria-label="Estado de financiamiento">
      <div className="funding-status-panel__header">
        {status ? (
          <span className={`badge ${STATUS_BADGE[status]}`}>{STATUS_LABEL[status]}</span>
        ) : (
          <span className="badge badge-ink">Estado de financiamiento: no informado</span>
        )}
        {event.confirmed ? (
          <span className="badge badge-teal">Fiesta confirmada por el organizador</span>
        ) : (
          <span className="badge badge-yellow">Sin confirmación del organizador</span>
        )}
        {event.closed ? <span className="badge badge-ink">Inscripciones cerradas</span> : null}
      </div>

      {status === 'funded' ? (
        <p className="funding-status-panel__note">
          El umbral de financiamiento se cumplió. Eso no confirma la fiesta por sí solo: la
          confirmación del organizador es independiente.
        </p>
      ) : null}
      {status === 'failed' ? (
        <p className="funding-stopped-banner" role="status">
          El plazo venció sin alcanzar el mínimo. Los pagos y las asistencias nuevas están
          detenidos. Un aviso anterior de éxito en esta pantalla no cambia la decisión del servidor.
        </p>
      ) : null}
      {status === 'legacy' || status === 'inactive' ? (
        <p className="funding-status-panel__note">
          Este evento no tiene cierre automático de recaudación.
        </p>
      ) : null}

      <div className="funding-status-panel__metrics">
        <div>
          <div className="funding-status-panel__kicker">Recaudado</div>
          <strong>{usd(event.collectedCents)}</strong>
          <p className="funding-status-panel__hint">
            Capturado menos reembolsos verificados, antes de comisiones. No es el neto liquidado.
          </p>
        </div>
        <div>
          <div className="funding-status-panel__kicker">Meta</div>
          <strong>{event.goalCents ? usd(event.goalCents) : 'Sin meta fijada'}</strong>
        </div>
        <div>
          <div className="funding-status-panel__kicker">Mínimo</div>
          <strong>{minCents ? usd(minCents) : 'Sin mínimo'}</strong>
          {minCents ? (
            <p className="funding-status-panel__hint">
              {event.minimumReached ? 'El servidor marca el mínimo como alcanzado.' : 'El servidor aún no marca el mínimo como alcanzado.'}
            </p>
          ) : null}
        </div>
        <div>
          <div className="funding-status-panel__kicker">Personas</div>
          <strong>{event.confirmedPeople} confirmados (asistencia)</strong>
          <p className="funding-status-panel__hint">{paidLabel}</p>
        </div>
      </div>

      {showDeadline ? (
        <p className="funding-status-panel__deadline">
          Fecha límite de aportes:{' '}
          <strong>{formatEventInstant(event.fundingDeadlineAt as string)}</strong>
        </p>
      ) : null}

      {displayPct !== null ? (
        <div className="funding-progress" aria-hidden="true">
          <div className="funding-progress__bar" style={{ width: `${displayPct}%` }} />
        </div>
      ) : null}
      {displayPct !== null ? (
        <p className="funding-status-panel__hint">Progreso hacia el mínimo: {displayPct}%</p>
      ) : null}

      {refunds ? (
        <div className="funding-refund-summary" aria-label="Resumen de reembolsos del evento">
          <h4>Reembolsos del evento (totales)</h4>
          <ul>
            <li>Devuelto y verificado: {usd(refunds.refundedCents)}</li>
            <li>
              En proceso de reembolso: {usd(refunds.pendingCents)}{' '}
              <span className="funding-status-panel__warn">(aún NO es dinero devuelto)</span>
            </li>
            <li>
              Requiere revisión: {usd(refunds.needsReviewCents)}{' '}
              <span className="funding-status-panel__warn">(aún NO es un reembolso completado)</span>
            </li>
            <li>
              Saldo capturado pendiente: {usd(refunds.outstandingCents)} (bruto, antes de comisiones)
            </li>
          </ul>
          <p className="funding-status-panel__hint">
            Estos totales son del evento. No indican si un invitado concreto ya recibió su reembolso.
          </p>
        </div>
      ) : null}
    </section>
  );
};
