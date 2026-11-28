/**
 * Página de «no encontrado» (NAP-U2) para rutas desconocidas, en ES y EN, con
 * botón a la portada. Estilos propios con tokens SP para que pinte bien en
 * cualquier host sin depender de la CSS de la portada.
 */
import React from 'react';
import { useMessages } from '../../i18n/I18nContext';
import { appCatalog } from '../../i18n/catalogs/app';

interface NotFoundViewProps {
  onNavigateHome: () => void;
}

export const NotFoundView: React.FC<NotFoundViewProps> = ({ onNavigateHome }) => {
  const m = useMessages(appCatalog);
  return (
    <section
      data-testid="not-found"
      aria-labelledby="not-found-title"
      style={{
        maxWidth: '36rem',
        margin: '3rem auto',
        padding: '2rem 1.5rem',
        textAlign: 'center',
        backgroundColor: 'var(--sp-color-surface, #FFFFFF)',
        color: 'var(--sp-color-ink, #12263A)',
        border: '1px solid var(--sp-color-border, #E2E8F0)',
        borderRadius: '16px',
        fontFamily: 'var(--sp-font-body)',
        fontSize: '1rem',
        lineHeight: 1.5,
      }}
    >
      <h1
        id="not-found-title"
        style={{ fontFamily: 'var(--sp-font-display)', fontSize: '1.75rem', margin: '0 0 0.75rem' }}
      >
        {m.notFoundTitle}
      </h1>
      <p style={{ margin: '0 0 1.5rem', color: 'var(--sp-color-ink-muted, #4A5D73)' }}>{m.notFoundBody}</p>
      <button
        type="button"
        data-testid="not-found-home"
        onClick={onNavigateHome}
        style={{
          minHeight: '44px',
          padding: '0.75rem 1.5rem',
          fontSize: '1rem',
          fontWeight: 700,
          fontFamily: 'var(--sp-font-body)',
          borderRadius: '10px',
          border: 'none',
          cursor: 'pointer',
          backgroundColor: 'var(--sp-color-yellow, #FFC85A)',
          color: '#12263A',
        }}
      >
        {m.notFoundHome}
      </button>
    </section>
  );
};
