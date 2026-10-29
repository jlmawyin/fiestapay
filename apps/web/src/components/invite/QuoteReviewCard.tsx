import React, { useRef, useState } from 'react';
import type { Quote, TemplateKind } from '../../types';
import { usd } from '../../types';
import { GUEST_PAYMENT_COPY, guestCoveredCopy } from '../../lib/event-presentation';

interface QuoteReviewCardProps {
  quote: Quote | null;
  isLoadingQuote: boolean;
  onRefreshQuote: () => Promise<void>;
  onCreateOrder: (quoteId: string) => Promise<void>;
  isCreatingOrder: boolean;
  /** Selects zero-due wording. Money lines always come from the server quote. */
  template?: TemplateKind | null;
}

export const QuoteReviewCard: React.FC<QuoteReviewCardProps> = ({
  quote,
  isLoadingQuote,
  onRefreshQuote,
  onCreateOrder,
  isCreatingOrder,
  template = null,
}) => {
  const [confirmedQuoteId, setConfirmedQuoteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const inFlight = useRef(false);
  const confirmedByUser = quote !== null && confirmedQuoteId === quote.id;
  const preparing = isCreatingOrder || localBusy;

  if (isLoadingQuote && !quote) {
    return (
      <section className="panel" aria-label={GUEST_PAYMENT_COPY.heading} style={{ textAlign: 'center', padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1.1rem', color: 'var(--color-ink)', marginBottom: '0.5rem' }}>{GUEST_PAYMENT_COPY.heading}</h3>
        <div role="status" style={{ color: 'var(--color-ink-muted)', fontSize: '0.9rem' }}>
          {GUEST_PAYMENT_COPY.calculating}
        </div>
      </section>
    );
  }

  if (!quote) {
    return (
      <section className="panel" aria-label={GUEST_PAYMENT_COPY.heading} style={{ textAlign: 'center', padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1.1rem', color: 'var(--color-ink)', marginBottom: '0.5rem' }}>{GUEST_PAYMENT_COPY.heading}</h3>
        <p style={{ fontSize: '0.9rem', color: 'var(--color-ink-muted)', marginBottom: '0.75rem' }}>
          {GUEST_PAYMENT_COPY.empty}
        </p>
        <button onClick={onRefreshQuote} className="btn btn-secondary" style={{ fontSize: '0.85rem' }} disabled={isLoadingQuote}>
          {GUEST_PAYMENT_COPY.refresh}
        </button>
      </section>
    );
  }

  const nothingDue = quote.amountCents === 0;
  const peopleWord = quote.people === 1 ? 'persona' : 'personas';

  const handleProceed = async () => {
    if (!confirmedByUser || isLoadingQuote || preparing || inFlight.current) {
      if (!confirmedByUser) setError(GUEST_PAYMENT_COPY.mustConfirm);
      return;
    }
    inFlight.current = true;
    setLocalBusy(true);
    setError(null);
    try {
      await onCreateOrder(quote.id);
    } catch (err: any) {
      setError(err?.message || GUEST_PAYMENT_COPY.orderError);
    } finally {
      inFlight.current = false;
      setLocalBusy(false);
    }
  };

  return (
    <section
      aria-label={GUEST_PAYMENT_COPY.heading}
      style={{
        backgroundColor: '#FFFFFF',
        border: '2px solid var(--color-blue)',
        borderRadius: 'var(--radius-lg)',
        padding: '1.25rem',
        boxShadow: 'var(--shadow-md)',
        maxWidth: '100%',
        boxSizing: 'border-box',
      }}
    >
      <h3 style={{ fontSize: '1.1rem', color: 'var(--color-ink)', marginBottom: '0.75rem' }}>{GUEST_PAYMENT_COPY.heading}</h3>

      {/* feeEstimate stays on the quote for the organizer. This guest card does not render it. */}
      <div
        style={{
          backgroundColor: 'var(--color-surface-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          fontSize: '0.875rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', padding: '0.35rem 0' }}>
          <span style={{ color: 'var(--color-ink-muted)' }}>{GUEST_PAYMENT_COPY.people}:</span>
          <strong style={{ color: 'var(--color-ink)' }}>{quote.people} {peopleWord}</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', padding: '0.35rem 0' }}>
          <span style={{ color: 'var(--color-ink-muted)' }}>{GUEST_PAYMENT_COPY.unit}:</span>
          <strong style={{ color: 'var(--color-ink)' }}>{usd(quote.unitCents)}</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', padding: '0.35rem 0', borderTop: '1px solid var(--color-border)' }}>
          <span style={{ color: 'var(--color-ink-muted)' }}>{GUEST_PAYMENT_COPY.total}:</span>
          <strong style={{ color: 'var(--color-ink)' }}>{usd(quote.totalCents)}</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', padding: '0.35rem 0', color: 'var(--color-teal)' }}>
          <span>{GUEST_PAYMENT_COPY.paid}:</span>
          <strong>{usd(quote.paidCents)}</strong>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '0.75rem',
            padding: '0.5rem 0 0.2rem 0',
            borderTop: '2px solid var(--color-border-dark)',
            fontSize: '1.05rem',
            color: 'var(--color-blue)',
            fontWeight: 800,
          }}
        >
          <span>{GUEST_PAYMENT_COPY.due}:</span>
          <span>{usd(quote.amountCents)}</span>
        </div>
      </div>

      {nothingDue ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <p role="status" style={{ margin: 0, color: 'var(--color-ink)', fontWeight: 700 }}>
            {guestCoveredCopy(template, quote.paidCents)}
          </p>
          <button
            type="button"
            onClick={onRefreshQuote}
            disabled={isLoadingQuote || preparing}
            className="btn btn-secondary"
            aria-label={GUEST_PAYMENT_COPY.update}
          >
            {GUEST_PAYMENT_COPY.update}
          </button>
        </div>
      ) : (
        <>
          <div
            style={{
              backgroundColor: 'var(--color-yellow-tint)',
              border: '1px solid var(--color-yellow)',
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem',
              marginBottom: '1rem',
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.65rem',
                cursor: 'pointer',
                fontSize: '0.825rem',
                color: 'var(--color-ink)',
                lineHeight: 1.4,
              }}
            >
              <input
                type="checkbox"
                checked={confirmedByUser}
                onChange={(e) => {
                  setConfirmedQuoteId(e.target.checked ? quote.id : null);
                  if (e.target.checked) setError(null);
                }}
                style={{ marginTop: '0.2rem', width: '18px', height: '18px', flex: '0 0 auto' }}
                aria-label={GUEST_PAYMENT_COPY.confirmName}
                disabled={preparing || isLoadingQuote}
              />
              <span>
                <strong>{GUEST_PAYMENT_COPY.confirmLead}</strong>
                {` ${quote.people} ${peopleWord}, la cuota ${usd(quote.unitCents)} y el total ${usd(quote.totalCents)}. Quiero preparar el pago de ${usd(quote.amountCents)}.`}
              </span>
            </label>
          </div>

          {error && (
            <div
              style={{
                backgroundColor: 'var(--color-coral-tint)',
                color: 'var(--color-coral)',
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.825rem',
                marginBottom: '0.75rem',
              }}
              role="alert"
            >
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleProceed}
              className="btn btn-primary"
              style={{ flex: '1 1 12rem', minWidth: 0, padding: '0.75rem' }}
              disabled={!confirmedByUser || preparing || isLoadingQuote}
            >
              {preparing ? GUEST_PAYMENT_COPY.preparing : `${GUEST_PAYMENT_COPY.proceed} (${usd(quote.amountCents)})`}
            </button>
            <button
              type="button"
              onClick={onRefreshQuote}
              disabled={isLoadingQuote || preparing}
              className="btn btn-secondary"
              style={{ padding: '0.75rem', flex: '0 0 auto' }}
              aria-label={GUEST_PAYMENT_COPY.update}
            >
              {GUEST_PAYMENT_COPY.update}
            </button>
          </div>
        </>
      )}
    </section>
  );
};
