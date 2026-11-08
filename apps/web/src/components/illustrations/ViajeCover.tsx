import React, { useId } from 'react';
import { useI18n, useMessages } from '../../i18n/I18nContext';
import { coversCatalog } from '../../i18n/messages/organizerCovers';

interface CoverProps {
  className?: string;
  height?: number | string;
  accent?: string;
}

/**
 * Modern editorial cover: layered route ridges in the theme accent over
 * a flat surface/tint wash, with a dashed journey line and waypoints.
 * Every tone comes from the theme CSS vars so each theme renders its own
 * palette; the static fallbacks match the default `camino` theme.
 */
export const ViajeCover: React.FC<CoverProps> = ({ className = '', height = '180px', accent }) => {
  const { locale } = useI18n();
  const m = useMessages(coversCatalog);
  const surface = 'var(--theme-surface, #F4F7FB)';
  const ink = 'var(--theme-ink, #152033)';
  const muted = 'var(--theme-muted, #3E4E66)';
  const accentFill = `var(--theme-accent, ${accent ?? '#1D4E89'})`;
  const tint = 'var(--theme-tint, #E1EAF5)';
  const bgId = `fp-viaje-bg-${useId().replace(/:/g, '')}`;
  return (
    <svg
      viewBox="0 0 500 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ width: '100%', height, display: 'block', objectFit: 'cover' }}
      aria-label={
        locale === 'en'
          ? 'Group trip illustration with mountains and adventure van'
          : 'Ilustración de viaje grupal, montañas y furgoneta de aventura'
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
      <circle cx="410" cy="60" r="88" style={{ fill: accentFill }} opacity="0.10" />

      {/* Dot grid, left */}
      {Array.from({ length: 4 }).map((_, row) =>
        Array.from({ length: 4 }).map((_, col) => (
          <circle
            key={`${row}-${col}`}
            cx={36 + col * 14}
            cy={86 + row * 14}
            r="2"
            style={{ fill: accentFill }}
            opacity="0.35"
          />
        )),
      )}

      {/* Layered ridges in the theme accent */}
      <polygon points="60,176 170,84 280,176" style={{ fill: accentFill }} opacity="0.16" />
      <polygon points="200,176 320,66 440,176" style={{ fill: accentFill }} opacity="0.30" />
      <polygon points="200,176 320,66 440,176" style={{ stroke: accentFill }} strokeWidth="3" strokeLinejoin="round" opacity="0.9" />
      <polygon points="300,86 320,66 340,86 330,86 320,76 310,86" style={{ fill: surface }} opacity="0.9" />

      {/* Ridge base + journey line with waypoints */}
      <rect x="0" y="176" width="500" height="24" style={{ fill: ink }} opacity="0.85" />
      <path
        d="M28 188 Q 150 168 250 186 T 472 184"
        style={{ stroke: surface }}
        strokeWidth="2.5"
        strokeDasharray="8 7"
        strokeLinecap="round"
        opacity="0.9"
      />
      <circle cx="120" cy="181" r="6" style={{ fill: accentFill, stroke: surface }} strokeWidth="2.5" />
      <circle cx="250" cy="186" r="6" style={{ fill: accentFill, stroke: surface }} strokeWidth="2.5" />
      <circle cx="380" cy="184" r="6" style={{ fill: surface, stroke: accentFill }} strokeWidth="3" />

      {/* Compass ring */}
      <circle cx="188" cy="46" r="18" style={{ stroke: muted }} strokeWidth="2" opacity="0.8" />
      <polygon points="188,35 192,46 188,44 184,46" style={{ fill: accentFill }} />
      <polygon points="188,57 192,46 188,48 184,46" style={{ fill: muted }} opacity="0.7" />

      {/* Header badge */}
      <rect x="20" y="20" width="132" height="26" rx="13" style={{ fill: surface, stroke: accentFill }} strokeWidth="1.5" />
      <text x="32" y="37" style={{ fill: ink }} fontFamily="Nunito Sans, sans-serif" fontWeight="800" fontSize="12" letterSpacing="0.05em">{m.badgeViaje}</text>
    </svg>
  );
};
