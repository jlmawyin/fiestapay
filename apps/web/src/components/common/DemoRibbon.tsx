import React from 'react';
import type { Capabilities } from '../../types';
import { useMessages } from '../../i18n/I18nContext';
import { ribbonCatalog } from '../../i18n/catalogs/ribbon';

export type DemoRibbonStatus = 'loading' | 'ready' | 'unavailable';

interface DemoRibbonProps {
  capabilities: Capabilities | null;
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
  const chatAvailable = Boolean(capabilities?.chat);
  const m = useMessages(ribbonCatalog);

  return (
    <div className="demo-ribbon" role="region" aria-label={m.regionLabel}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span className="demo-ribbon-badge">{m.badge}</span>
        <span>
          {m.sandboxLine}
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
          <span className="demo-ribbon-sr">{m.checking}</span>
        </div>
      ) : resolvedStatus === 'unavailable' ? (
        <div
          className="demo-ribbon-status"
          role="status"
          aria-live="polite"
          style={statusClusterStyle}
        >
          <span>{m.paypalUnavailable}</span>
          <span>•</span>
          <span>{m.chatUnavailable}</span>
          {onRetry ? (
            <button type="button" className="demo-ribbon-retry" onClick={onRetry}>
              {m.retry}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="demo-ribbon-status" style={statusClusterStyle}>
          <span>{capabilities?.paypal ? m.paypalConfigured : m.paypalMissing}</span>
          <span>•</span>
          <span>{chatAvailable ? m.chatConfigured : m.chatOff}</span>
        </div>
      )}
    </div>
  );
};
