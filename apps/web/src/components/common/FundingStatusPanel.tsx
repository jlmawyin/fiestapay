import React from 'react';
import { EVENT_TIME_ZONE, intlLocale, type Locale } from '@fiestapay/shared';
import type { FiestaEvent } from '../../types';
import { useI18n, useMessages } from '../../i18n/I18nContext';
import { fundingCatalog } from '../../i18n/messages/funding';
import { attendanceSummary, fundedIsNotConfirmationNote, guestFundingOutcome, guestPayLabel, minimumProgressPercent, organizerConfirmedBadge } from '../../lib/event-presentation';

/**
 * Event instant in the event time zone (America/Guayaquil, fixed UTC-05:00),
 * formatted in the locale. Guayaquil has no daylight saving, so the offset
 * suffix is constant.
 */
export function formatEventInstant(iso: string, locale: Locale = 'es'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    const formatted = d.toLocaleString(intlLocale(locale), {
      timeZone: EVENT_TIME_ZONE,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${formatted} (UTC-05:00)`;
  } catch {
    return `${d.toISOString()} (UTC-05:00)`;
  }
}

export function paidPeopleLabel(paidPeople: number | undefined, parties?: number): string {
  return attendanceSummary({ paidPeople, parties });
}

export function newGuestActivityBlocked(event: Pick<FiestaEvent, 'closed' | 'fundingStatus'>): boolean {
  return event.closed === true || event.fundingStatus === 'failed';
}

const STATUS_BADGE: Record<NonNullable<FiestaEvent['fundingStatus']>, string> = {
  legacy: 'badge-ink',
  inactive: 'badge-ink',
  open: 'badge-yellow',
  funded: 'badge-blue',
  failed: 'badge-coral',
};

interface FundingStatusPanelProps {
  event: FiestaEvent;
  /** Guest copy hides fees, nets, and the refund ledger. Admin keeps that ledger. */
  audience?: 'guest' | 'admin';
  /** Invited parties from the server guest list. Omitted when the caller does not have it. */
  parties?: number;
  paidCents?: number;
  dueCents?: number;
}

export const FundingStatusPanel: React.FC<FundingStatusPanelProps> = ({
  event,
  audience = 'admin',
  parties,
  paidCents,
  dueCents,
}) => {
  if (audience === 'guest') {
    return <GuestFundingStatus event={event} paidCents={paidCents} dueCents={dueCents} parties={parties} />;
  }
  return <AdminFundingStatus event={event} parties={parties} />;
};

const AdminFundingStatus: React.FC<{ event: FiestaEvent; parties?: number }> = ({ event, parties }) => {
  const { locale, formatMoney } = useI18n();
  const m = useMessages(fundingCatalog);
  const status = event.fundingStatus;
  const hasDeadline = typeof event.fundingDeadlineAt === 'string' && event.fundingDeadlineAt.length > 0;
  const showDeadline = hasDeadline && status !== 'legacy' && status !== 'inactive';
  const minCents = event.minimumCents;
  const displayPct = minimumProgressPercent(event.collectedCents, minCents, event.minimumReached);
  const refunds = event.refundSummary;
  const paidLabel = attendanceSummary({ paidPeople: event.paidPeople, parties }, locale);
  const statusLabel =
    status === 'legacy'
      ? m.statusLegacy
      : status === 'inactive'
        ? m.statusInactive
        : status === 'open'
          ? m.statusOpen
          : status === 'funded'
            ? m.statusFunded
            : status === 'failed'
              ? m.statusFailed
              : null;

  return (
    <section className="funding-status-panel" aria-label={m.panelLabel}>
      <div className="funding-status-panel__header">
        {status && statusLabel ? (
          <span className={`badge ${STATUS_BADGE[status]}`}>{statusLabel}</span>
        ) : (
          <span className="badge badge-ink">{m.statusUnknown}</span>
        )}
        {event.confirmed ? (
          <span className="badge badge-teal">{organizerConfirmedBadge(event.template, locale)}</span>
        ) : (
          <span className="badge badge-yellow">{m.noOrganizerConfirm}</span>
        )}
        {event.closed ? <span className="badge badge-ink">{m.closedBadge}</span> : null}
      </div>

      {status === 'funded' ? (
        <p className="funding-status-panel__note">
          {fundedIsNotConfirmationNote(event.template, locale)}
        </p>
      ) : null}
      {status === 'failed' ? (
        <p className="funding-stopped-banner" role="status">
          {m.failedBanner}
        </p>
      ) : null}
      {status === 'legacy' || status === 'inactive' ? (
        <p className="funding-status-panel__note">
          {m.noAutoClose}
        </p>
      ) : null}

      <div className="funding-status-panel__metrics">
        <div>
          <div className="funding-status-panel__kicker">{m.kickerRaised}</div>
          <strong>{formatMoney(event.collectedCents)}</strong>
          <p className="funding-status-panel__hint">
            {m.raisedHint}
          </p>
        </div>
        <div>
          <div className="funding-status-panel__kicker">{m.kickerGoal}</div>
          <strong>{event.goalCents ? formatMoney(event.goalCents) : m.noGoal}</strong>
        </div>
        <div>
          <div className="funding-status-panel__kicker">{m.kickerMin}</div>
          <strong>{minCents ? formatMoney(minCents) : m.noMin}</strong>
          {minCents ? (
            <p className="funding-status-panel__hint">
              {event.minimumReached ? m.minReached : m.minPending}
            </p>
          ) : null}
        </div>
        <div>
          <div className="funding-status-panel__kicker">{m.kickerPeople}</div>
          <strong>{m.confirmedPeople(event.confirmedPeople)}</strong>
          <p className="funding-status-panel__hint">{paidLabel}</p>
        </div>
      </div>

      {showDeadline ? (
        <p className="funding-status-panel__deadline">
          {m.deadlineAdmin}
          <strong>{formatEventInstant(event.fundingDeadlineAt as string, locale)}</strong>
        </p>
      ) : null}

      {displayPct !== null ? (
        <div className="funding-progress" aria-hidden="true">
          <div className="funding-progress__bar" style={{ width: `${displayPct}%` }} />
        </div>
      ) : null}
      {displayPct !== null ? (
        <p className="funding-status-panel__hint">{m.progressMin(displayPct)}</p>
      ) : null}

      {refunds ? (
        <div className="funding-refund-summary" aria-label={m.refundAria}>
          <h4>{m.refundTitle}</h4>
          <ul>
            <li>{m.refunded(formatMoney(refunds.refundedCents))}</li>
            <li>
              {m.pendingRefund(formatMoney(refunds.pendingCents))}
              <span className="funding-status-panel__warn">{m.pendingWarn}</span>
            </li>
            <li>
              {m.reviewRefund(formatMoney(refunds.needsReviewCents))}
              <span className="funding-status-panel__warn">{m.reviewWarn}</span>
            </li>
            <li>
              {m.outstanding(formatMoney(refunds.outstandingCents))}
            </li>
          </ul>
          <p className="funding-status-panel__hint">
            {m.refundHint}
          </p>
        </div>
      ) : null}
    </section>
  );
};

const GuestFundingStatus: React.FC<{
  event: FiestaEvent;
  parties?: number;
  paidCents?: number;
  dueCents?: number;
}> = ({ event, parties, paidCents, dueCents }) => {
  const { locale, formatMoney } = useI18n();
  const m = useMessages(fundingCatalog);
  const outcome = guestFundingOutcome(event, locale);
  const progress = minimumProgressPercent(event.collectedCents, event.minimumCents, event.minimumReached);
  const hasDeadline = typeof event.fundingDeadlineAt === 'string' && event.fundingDeadlineAt.length > 0;
  const showDeadline = hasDeadline && event.fundingStatus !== 'legacy' && event.fundingStatus !== 'inactive';
  const personal =
    typeof paidCents === 'number' && typeof dueCents === 'number' ? guestPayLabel(paidCents, dueCents, locale) : null;

  return (
    <section className="funding-status-panel" aria-label={m.guestPanelLabel}>
      <p>
        {m.perPersonLead}<strong>{formatMoney(event.priceCents)}</strong>
      </p>
      {personal ? <p>{personal}</p> : null}
      <p>{attendanceSummary({ parties, paidPeople: event.paidPeople, capacity: event.capacity }, locale)}</p>
      <p>
        {m.minGuest}<strong>{event.minimumCents ? formatMoney(event.minimumCents) : m.noMinGuest}</strong>
        {event.minimumCents ? (event.minimumReached ? m.minReachedShort : m.minPendingShort) : null}
      </p>
      <p>{m.goalGuest}<strong>{event.goalCents ? formatMoney(event.goalCents) : m.noGoalGuest}</strong></p>
      {showDeadline ? (
        <p>
          {m.deadlineGuest}<strong>{formatEventInstant(event.fundingDeadlineAt as string, locale)}</strong>
        </p>
      ) : null}
      {progress !== null ? (
        <div className="funding-progress" aria-hidden="true">
          <div className="funding-progress__bar" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
      {progress !== null ? <p>{m.progressMin(progress)}</p> : null}
      {outcome ? <p role="status">{outcome}</p> : null}
      {event.confirmed ? <p>{m.confirmedInvite}</p> : null}
    </section>
  );
};
