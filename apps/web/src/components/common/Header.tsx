import React from 'react';
import { UI_LABELS } from '@fiestapay/shared';
import { useI18n, useMessages } from '../../i18n/I18nContext';
import { LanguageSelector } from '../../i18n/LanguageSelector';
import { headerCatalog } from '../../i18n/catalogs/header';

interface HeaderProps {
  onNavigateHome: () => void;
  onNavigateCreate: () => void;
  onNavigateDemo?: () => void;
  hasActiveEvent?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onNavigateHome,
  onNavigateCreate,
  onNavigateDemo,
}) => {
  const { locale } = useI18n();
  const m = useMessages(headerCatalog);
  const labels = UI_LABELS[locale];
  return (
    <header
      style={{
        backgroundColor: '#FFFFFF',
        borderBottom: '1px solid var(--color-border)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      <div className="fp-header-inner">
        {/* Brand Logo & Name */}
        <button
          onClick={onNavigateHome}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            textAlign: 'left',
            padding: 0,
          }}
          aria-label={m.logoLabel}
        >
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              backgroundColor: 'var(--color-blue)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 5px rgba(18, 95, 230, 0.3)',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="2" y="4" width="20" height="16" rx="4" fill="#FFFFFF" fillOpacity="0.15" />
              <rect x="2" y="4" width="20" height="16" rx="4" stroke="#FFFFFF" strokeWidth="2" />
              <circle cx="2" cy="12" r="2.5" fill="#125FE6" stroke="#FFFFFF" strokeWidth="1.5" />
              <circle cx="22" cy="12" r="2.5" fill="#125FE6" stroke="#FFFFFF" strokeWidth="1.5" />
              <line x1="7" y1="12" x2="17" y2="12" stroke="#FFC85A" strokeWidth="2" strokeDasharray="2 2" />
            </svg>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 900, color: 'var(--color-ink)', lineHeight: 1.1 }}>
              FiestaPay
            </div>
            <div style={{ fontSize: '0.725rem', color: 'var(--color-teal)', fontWeight: 700, letterSpacing: '0.02em' }}>
              {m.tagline}
            </div>
          </div>
        </button>

        {/* Navigation Actions */}
        <nav className="fp-header-nav" aria-label={m.tagline}>
          <button
            onClick={onNavigateHome}
            className="btn btn-secondary fp-header-btn"
          >
            {labels.myInvitations}
          </button>
          {onNavigateDemo ? (
            <button
              onClick={onNavigateDemo}
              className="btn btn-secondary fp-header-btn"
            >
              {labels.judgesDemo}
            </button>
          ) : null}
          <button
            onClick={onNavigateCreate}
            className="btn btn-primary fp-header-btn"
          >
            {labels.newInvitation}
          </button>
          <LanguageSelector />
        </nav>
      </div>
    </header>
  );
};
