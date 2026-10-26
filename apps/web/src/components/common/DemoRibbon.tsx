import React from 'react';
import type { Capabilities } from '../../types';

export type DemoRibbonStatus = 'loading' | 'ready' | 'unavailable';

interface DemoRibbonProps {
  capabilities: (Capabilities & { chat?: boolean; llmProvider?: 'openai' | 'gemini' }) | null;
  status?: DemoRibbonStatus;
  onRetry?: () => void;
}

const statusClusterStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  fontSize: '0.775rem',
  opacity: 0.9,
  flexWrap: 'wrap',
};

export const DemoRibbon: React.FC<DemoRibbonProps> = ({ capabilities, status, onRetry }) => {
  const resolvedStatus: DemoRibbonStatus = status ?? 'ready';
  const chatAvailable = Boolean(capabilities?.chat ?? capabilities?.gemini);

  return (
    <div className="demo-ribbon" role="region" aria-label="Aviso de modo sandbox y pagos de prueba">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span className="demo-ribbon-badge">PAGO DE PRUEBA</span>
        <span>
          PayPal sandbox · Sin dinero real
        </span>
      </div>
      {resolvedStatus === 'loading' ? (
        <div
          className="demo-ribbon-status"
          role="status"
          aria-live="polite"
          aria-busy="true"
          style={statusClusterStyle}
        >
          <span className="demo-ribbon-skel" aria-hidden="true" />
          <span className="demo-ribbon-skel demo-ribbon-skel-short" aria-hidden="true" />
          <span className="demo-ribbon-sr">Comprobando PayPal y chat</span>
        </div>
      ) : resolvedStatus === 'unavailable' ? (
        <div
          className="demo-ribbon-status"
          role="status"
          aria-live="polite"
          style={statusClusterStyle}
        >
          <span>PayPal: No disponible</span>
          <span>•</span>
          <span>Chat: No disponible</span>
          {onRetry ? (
            <button type="button" className="demo-ribbon-retry" onClick={onRetry}>
              Reintentar
            </button>
          ) : null}
        </div>
      ) : (
        <div className="demo-ribbon-status" style={statusClusterStyle}>
          <span>PayPal: {capabilities?.paypal ? 'Configurado' : 'No configurado'}</span>
          <span>•</span>
          <span>Chat: {chatAvailable ? 'Configurado' : 'Desactivado'}</span>
        </div>
      )}
    </div>
  );
};
