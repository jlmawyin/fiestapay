import React, { useState } from 'react';
import type { Quote } from '../../types';
import { usd } from '../../types';

interface QuoteReviewCardProps {
  quote: Quote | null;
  isLoadingQuote: boolean;
  onRefreshQuote: () => Promise<void>;
  onCreateOrder: (quoteId: string) => Promise<void>;
  isCreatingOrder: boolean;
}

export const QuoteReviewCard: React.FC<QuoteReviewCardProps> = ({
  quote,
  isLoadingQuote,
  onRefreshQuote,
  onCreateOrder,
  isCreatingOrder,
}) => {
  const [confirmedQuoteId, setConfirmedQuoteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirmedByUser = quote !== null && confirmedQuoteId === quote.id;

  if (isLoadingQuote && !quote) {
    return (
      <div className="panel" style={{ textAlign: 'center', padding: '1.5rem' }}>
        <div style={{ color: 'var(--color-ink-muted)', fontSize: '0.9rem' }}>
          Calculando cotización oficial del servidor...
        </div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="panel" style={{ textAlign: 'center', padding: '1.5rem' }}>
        <p style={{ fontSize: '0.9rem', color: 'var(--color-ink-muted)', marginBottom: '0.75rem' }}>
          No se ha calculado la cotización aún.
        </p>
        <button onClick={onRefreshQuote} className="btn btn-secondary" style={{ fontSize: '0.85rem' }}>
          Obtener cotización
        </button>
      </div>
    );
  }

  const isFullyPaid = quote.amountCents === 0;

  const handleProceed = async () => {
    if (!confirmedByUser || isLoadingQuote || isCreatingOrder) {
      setError('Debes marcar la casilla para confirmar que revisaste el desglose.');
      return;
    }
    setError(null);
    try {
      await onCreateOrder(quote.id);
    } catch (err: any) {
      setError(err.message || 'Error al generar la orden de pago.');
    }
  };

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        border: '2px solid var(--color-blue)',
        borderRadius: 'var(--radius-lg)',
        padding: '1.25rem',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.2rem' }}>🧾</span>
          <h3 style={{ fontSize: '1.1rem', color: 'var(--color-ink)' }}>Desglose de Cuota (Cotización Oficial)</h3>
        </div>
        <span className="badge badge-blue">Servidor Seguro</span>
      </div>

      {isFullyPaid ? (
        <div
          style={{
            backgroundColor: 'var(--color-teal-tint)',
            border: '1px solid var(--color-teal)',
            padding: '1rem',
            borderRadius: 'var(--radius-md)',
            textAlign: 'center',
            color: 'var(--color-teal)',
            fontWeight: 700,
          }}
        >
          🎉 ¡Tu cuota está completamente pagada! Ya tienes tu lugar reservado en la fiesta.
        </div>
      ) : (
        <>
          <p style={{ fontSize: '0.825rem', color: 'var(--color-ink-muted)', marginBottom: '1rem' }}>
            {quote.summary || 'Cotización calculada por el servidor basada en tu asistencia y acompañantes.'}
          </p>

          {/* Breakdown Table */}
          <div
            style={{
              backgroundColor: 'var(--color-surface-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
              fontSize: '0.875rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0' }}>
              <span style={{ color: 'var(--color-ink-muted)' }}>Personas a tu cargo:</span>
              <strong style={{ color: 'var(--color-ink)' }}>{quote.people} {quote.people === 1 ? 'persona' : 'personas'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0' }}>
              <span style={{ color: 'var(--color-ink-muted)' }}>Cuota unitaria:</span>
              <strong style={{ color: 'var(--color-ink)' }}>{usd(quote.unitCents)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderTop: '1px solid var(--color-border)' }}>
              <span style={{ color: 'var(--color-ink-muted)' }}>Total calculado:</span>
              <strong style={{ color: 'var(--color-ink)' }}>{usd(quote.totalCents)}</strong>
            </div>
            {quote.paidCents > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', color: 'var(--color-teal)' }}>
                <span>Abonado previamente:</span>
                <strong>- {usd(quote.paidCents)}</strong>
              </div>
            )}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '0.5rem 0 0.2rem 0',
                borderTop: '2px solid var(--color-border-dark)',
                fontSize: '1.05rem',
                color: 'var(--color-blue)',
                fontWeight: 800,
              }}
            >
              <span>Saldo a Pagar:</span>
              <span>{usd(quote.amountCents)}</span>
            </div>
            {quote.feeEstimate ? (
              <div className="funding-fee-estimate" aria-label="Estimación de comisión de pasarela">
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0' }}>
                  <span>Estimación de comisión PayPal:</span>
                  <strong>{usd(quote.feeEstimate.feeCents)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.2rem 0' }}>
                  <span>Neto estimado para quien organiza:</span>
                  <strong>{usd(quote.feeEstimate.netCents)}</strong>
                </div>
                <p className="funding-status-panel__hint" style={{ marginTop: '0.35rem' }}>
                  Comisión PayPal estimada. La asume quien organiza. Tu pago total es{' '}
                  {usd(quote.amountCents)}. PayPal determina la comisión definitiva.
                </p>
              </div>
            ) : (
              <p className="funding-status-panel__hint" style={{ marginTop: '0.5rem' }}>
                Estimación de comisión no disponible.
              </p>
            )}
          </div>

          {/* Explicit Human Review Confirmation BEFORE Order Creation */}
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
                style={{ marginTop: '0.2rem', width: '18px', height: '18px' }}
                aria-label="Confirmar revisión de la cotización"
              />
              <span>
                <strong>Confirmo que revisé este desglose</strong> de {usd(quote.amountCents)} para {quote.people} {quote.people === 1 ? 'asistente' : 'asistentes'} y deseo generar la orden oficial de pago.
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

          {/* Proceed Button */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={handleProceed}
              className="btn btn-primary"
              style={{ flex: 1, padding: '0.75rem' }}
              disabled={!confirmedByUser || isCreatingOrder || isLoadingQuote}
            >
              {isCreatingOrder ? 'Generando orden oficial...' : `Confirmar y Generar Pago (${usd(quote.amountCents)})`}
            </button>
            <button
              onClick={onRefreshQuote}
              disabled={isLoadingQuote || isCreatingOrder}
              className="btn btn-secondary"
              style={{ padding: '0.75rem' }}
              title="Recalcular cotización con el servidor"
              aria-label="Recalcular cotización"
            >
              🔄
            </button>
          </div>
        </>
      )}
    </div>
  );
};
