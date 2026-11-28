/**
 * Logo único de Somos Panas (NAP-U2): el boleto que ya usan la cabecera del
 * legado y el favicon, con la marca en texto. La portada y el pie lo montan;
 * no se crea ninguna otra marca gráfica.
 */
import React from 'react';

interface SiteLogoProps {
  /** Tamaño del recuadro (barra o pie). */
  size?: 'md' | 'sm';
}

export const SiteLogo: React.FC<SiteLogoProps> = ({ size = 'md' }) => {
  const box = size === 'md' ? 38 : 30;
  const icon = size === 'md' ? 22 : 17;
  return (
    <span
      data-testid="site-logo"
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.65rem', textAlign: 'left' }}
    >
      <span
        aria-hidden="true"
        style={{
          width: `${box}px`,
          height: `${box}px`,
          borderRadius: '10px',
          backgroundColor: 'var(--sp-color-blue)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <svg width={icon} height={icon} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="4" width="20" height="16" rx="4" fill="#FFFFFF" fillOpacity="0.15" />
          <rect x="2" y="4" width="20" height="16" rx="4" stroke="#FFFFFF" strokeWidth="2" />
          <circle cx="2" cy="12" r="2.5" fill="#125FE6" stroke="#FFFFFF" strokeWidth="1.5" />
          <circle cx="22" cy="12" r="2.5" fill="#125FE6" stroke="#FFFFFF" strokeWidth="1.5" />
          <line x1="7" y1="12" x2="17" y2="12" stroke="#FFC85A" strokeWidth="2" strokeDasharray="2 2" />
        </svg>
      </span>
      <span
        style={{
          fontFamily: 'var(--sp-font-display)',
          fontSize: size === 'md' ? '1.25rem' : '1rem',
          fontWeight: 900,
          color: 'var(--sp-color-ink)',
          lineHeight: 1.1,
        }}
      >
        Somos Panas
      </span>
    </span>
  );
};
