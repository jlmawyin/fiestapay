import React, { useRef, useState } from 'react';
import { UI_LABELS } from '@fiestapay/shared';
import type { Quote, TemplateKind } from '../../types';
import { useI18n } from '../../i18n/I18nContext';
import {
  guestCoveredCopy,
  guestPaymentCopy,
  peopleWord,
  quoteConfirmSentence,
} from '../../lib/event-presentation';

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
  const { locale, formatMoney } = useI18n();
  const copy = guestPaymentCopy(locale);
  const labels = UI_LABELS[locale];
  const confirmedByUser = quote !== null && confirmedQuoteId === quote.id;
  const preparing = isCreatingOrder || localBusy;

  if (isLoadingQuote && !quote) {
    return (
      <section className="panel" aria-label={copy.heading} style={{ textAlign: 'center', padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1.1rem', color: 'var(--color-ink)', marginBottom: '0.5rem' }}>{copy.heading}</h3>
        <div role="status" style={{ color: 'var(--color-ink-muted)', fontSize: '0.9rem' }}>
          {copy.calculating}
        </div>
      </section>
    );
  }

  if (!quote) {
    return (
      <section className="panel" aria-label={copy.heading} style={{ textAlign: 'center', padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1.1rem', color: 'var(--color-ink)', marginBottom: '0.5rem' }}>{copy.heading}</h3>
        <p style={{ fontSize: '0.9rem', color: 'var(--color-ink-muted)', marginBottom: '0.75rem' }}>
          {copy.empty}
        </p>
        <button onClick={onRefreshQuote} className="btn btn-secondary" style={{ fontSize: '0.85rem' }} disabled={isLoadingQuote}>
          {copy.refresh}
        </button>
      </section>
    );
  }

  const nothingDue = quote.amountCents === 0;
  const peopleWordLocal = peopleWord(quote.people, locale);
  const lines = {
    people: quote.people,
    unit: formatMoney(quote.unitCents),
    total: formatMoney(quote.totalCents),
    paid: formatMoney(quote.paidCents),
    due: formatMoney(quote.amountCents),
  };

  const handleProceed = async () => {
    if (!confirmedByUser || isLoadingQuote || preparing || inFlight.current) {
      if (!confirmedByUser) setError(copy.mustConfirm);
      return;
    }
    inFlight.current = true;
    setLocalBusy(true);
    setError(null);
    try {
      await onCreateOrder(quote.id);
    } catch (err: any) {
      setError(err?.message || copy.orderError);
    } finally {
      inFlight.current = false;
      setLocalBusy(false);
    }
  };

  return (
    <section
      aria-label={copy.heading}
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
      <h3 style={{ fontSize: '1.1rem', color: 'var(--color-ink)', marginBottom: '0.75rem' }}>{copy.heading}</h3>

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
          <span style={{ color: 'var(--color-ink-muted)' }}>{copy.people}:</span>
          <strong style={{ color: 'var(--color-ink)' }}>{quote.people} {peopleWordLocal}</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', padding: '0.35rem 0' }}>
          <span style={{ color: 'var(--color-ink-muted)' }}>{copy.unit}:</span>
          <strong style={{ color: 'var(--color-ink)' }}>{lines.unit}</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', padding: '0.35rem 0', borderTop: '1px solid var(--color-border)' }}>
          <span style={{ color: 'var(--color-ink-muted)' }}>{copy.total}:</span>
          <strong style={{ color: 'var(--color-ink)' }}>{lines.total}</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', padding: '0.35rem 0', color: 'var(--color-teal)' }}>
          <span>{copy.paid}:</span>
          <strong>{lines.paid}</strong>
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
          <span>{copy.due}:</span>
          <span>{lines.due}</span>
        </div>
      </div>

      {nothingDue ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <p role="status" style={{ margin: 0, color: 'var(--color-ink)', fontWeight: 700 }}>
            {guestCoveredCopy(template, quote.paidCents, locale)}
          </p>
          <button
            type="button"
            onClick={onRefreshQuote}
            disabled={isLoadingQuote || preparing}
            className="btn btn-secondary"
            aria-label={copy.update}
          >
            {copy.update}
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
                aria-label={labels.quoteReview}
                data-guide="quoteReview"
                disabled={preparing || isLoadingQuote}
              />
              <span>
                <strong>{labels.quoteReviewLead}</strong>
                {quoteConfirmSentence(lines, locale)}
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
              data-guide="generatePayment"
              style={{ flex: '1 1 12rem', minWidth: 0, padding: '0.75rem' }}
              disabled={!confirmedByUser || preparing || isLoadingQuote}
            >
              {preparing ? copy.preparing : `${labels.generatePayment} (${lines.due})`}
            </button>
            <button
              type="button"
              onClick={onRefreshQuote}
              disabled={isLoadingQuote || preparing}
              className="btn btn-secondary"
              style={{ padding: '0.75rem', flex: '0 0 auto' }}
              aria-label={copy.update}
            >
              {copy.update}
            </button>
          </div>
        </>
      )}
    </section>
  );
};
