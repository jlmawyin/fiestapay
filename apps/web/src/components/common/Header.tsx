import React from 'react';

interface HeaderProps {
  onNavigateHome: () => void;
  onNavigateCreate: () => void;
  hasActiveEvent?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onNavigateHome,
  onNavigateCreate,
}) => {
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
      <div
        style={{
          maxWidth: '1120px',
          margin: '0 auto',
          padding: '0.85rem 1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
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
          aria-label="Ir a la página principal de FiestaPay"
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
              Fiestas organizadas, pagos claros
            </div>
          </div>
        </button>

        {/* Navigation Actions */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={onNavigateHome}
            className="btn btn-secondary"
            style={{ padding: '0.45rem 0.85rem', fontSize: '0.875rem' }}
          >
            Mis Fiestas
          </button>
          <button
            onClick={onNavigateCreate}
            className="btn btn-primary"
            style={{ padding: '0.45rem 1rem', fontSize: '0.875rem' }}
          >
            + Nueva Fiesta
          </button>
        </nav>
      </div>
    </header>
  );
};
