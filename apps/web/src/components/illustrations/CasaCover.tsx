import React, { useId } from 'react';
import { useI18n, useMessages } from '../../i18n/I18nContext';
import { coversCatalog } from '../../i18n/messages/organizerCovers';

interface CoverProps {
  className?: string;
  height?: number | string;
  accent?: string;
}

/**
 * Modern editorial cover: a tall home arch in the theme accent over a
 * flat surface/tint wash, with patio floor lines and a quiet dot grid.
 * Every tone comes from the theme CSS vars so each theme renders its own
 * palette; the static fallbacks match the default `patio` theme.
 */
export const CasaCover: React.FC<CoverProps> = ({ className = '', height = '180px', accent }) => {
  const { locale } = useI18n();
  const m = useMessages(coversCatalog);
  const surface = 'var(--theme-surface, #F3FAF5)';
  const ink = 'var(--theme-ink, #14261C)';
  const muted = 'var(--theme-muted, #3A5648)';
  const accentFill = `var(--theme-accent, ${accent ?? '#166534'})`;
  const tint = 'var(--theme-tint, #DCEFE3)';
  const bgId = `fp-casa-bg-${useId().replace(/:/g, '')}`;
  return (
    <svg
      viewBox="0 0 500 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ width: '100%', height, display: 'block', objectFit: 'cover' }}
      aria-label={
        locale === 'en' ? 'Cozy house party illustration' : 'Ilustración de fiesta acogedora en casa'
      }
      role="img"
    >
      <defs>
        <linearGradient id={bgId} x1="0" y1="0" x2="500" y2="200" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: surface }} />
          <stop offset="1" style={{ stopColor: tint }} />
        </linearGradient>
      </defs>

      {/* Flat editorial wash */}
      <rect width="500" height="200" fill={`url(#${bgId})`} />
      <rect width="500" height="8" style={{ fill: accentFill }} />

      {/* Depth: oversized translucent disc */}
      <circle cx="80" cy="150" r="92" style={{ fill: accentFill }} opacity="0.10" />

      {/* Dot grid, top right */}
      {Array.from({ length: 4 }).map((_, row) =>
        Array.from({ length: 6 }).map((_, col) => (
          <circle
            key={`${row}-${col}`}
            cx={380 + col * 14}
            cy={34 + row * 14}
            r="2"
            style={{ fill: accentFill }}
            opacity="0.35"
          />
        )),
      )}

      {/* Home arch: solid presence in the theme accent */}
      <path d="M176 176 L176 96 A54 54 0 0 1 284 96 L284 176 Z" style={{ fill: accentFill }} opacity="0.16" />
      <path d="M196 176 L196 104 A34 34 0 0 1 264 104 L264 176 Z" style={{ fill: surface, stroke: accentFill }} strokeWidth="4" />
      <circle cx="230" cy="140" r="7" style={{ fill: accentFill }} />

      {/* Roof line + sun mark */}
      <path d="M150 78 L230 34 L310 78" style={{ stroke: ink }} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
      <circle cx="336" cy="128" r="16" style={{ fill: accentFill }} />
      <circle cx="336" cy="128" r="24" style={{ stroke: accentFill }} strokeWidth="1.5" opacity="0.5" />

      {/* Patio floor lines */}
      <rect x="40" y="176" width="420" height="5" rx="2.5" style={{ fill: ink }} opacity="0.75" />
      <rect x="90" y="188" width="320" height="4" rx="2" style={{ fill: muted }} opacity="0.5" />
      <rect x="330" y="60" width="10" height="56" rx="5" style={{ fill: ink }} opacity="0.35" />

      {/* Header badge */}
      <rect x="20" y="20" width="124" height="26" rx="13" style={{ fill: surface, stroke: accentFill }} strokeWidth="1.5" />
      <text x="32" y="37" style={{ fill: ink }} fontFamily="Nunito Sans, sans-serif" fontWeight="800" fontSize="12" letterSpacing="0.05em">{m.badgeCasa}</text>
    </svg>
  );
};
