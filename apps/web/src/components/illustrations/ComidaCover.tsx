import React, { useId } from 'react';
import { useI18n, useMessages } from '../../i18n/I18nContext';
import { coversCatalog } from '../../i18n/messages/organizerCovers';

interface CoverProps {
  className?: string;
  height?: number | string;
  accent?: string;
}

/**
 * Modern editorial cover: flat diagonal wash in the theme surface/tint,
 * one oversized plate ring in the theme accent, and a quiet dot grid.
 * Every tone comes from the theme CSS vars so each theme renders its own
 * palette; the static fallbacks match the default `mesa` theme.
 */
export const ComidaCover: React.FC<CoverProps> = ({ className = '', height = '180px', accent }) => {
  const { locale } = useI18n();
  const m = useMessages(coversCatalog);
  const surface = 'var(--theme-surface, #FFF8F1)';
  const ink = 'var(--theme-ink, #2A2118)';
  const muted = 'var(--theme-muted, #5C4033)';
  const accentFill = `var(--theme-accent, ${accent ?? '#9A3412'})`;
  const tint = 'var(--theme-tint, #F6E4D4)';
  const bgId = `fp-comida-bg-${useId().replace(/:/g, '')}`;
  return (
    <svg
      viewBox="0 0 500 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ width: '100%', height, display: 'block', objectFit: 'cover' }}
      aria-label={
        locale === 'en'
          ? 'Festive banquet and shared meal illustration'
          : 'Ilustración de banquete festivo y comida compartida'
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

      {/* Depth: oversized translucent disc + thin orbit ring */}
      <circle cx="428" cy="118" r="104" style={{ fill: accentFill }} opacity="0.10" />
      <circle cx="150" cy="112" r="96" style={{ stroke: ink }} strokeWidth="1.5" opacity="0.14" />

      {/* Dot grid, top right */}
      {Array.from({ length: 4 }).map((_, row) =>
        Array.from({ length: 8 }).map((_, col) => (
          <circle
            key={`${row}-${col}`}
            cx={318 + col * 14}
            cy={34 + row * 14}
            r="2"
            style={{ fill: accentFill }}
            opacity="0.35"
          />
        )),
      )}

      {/* Shared plate: ring, inner setting, serving dots */}
      <circle cx="150" cy="112" r="58" style={{ fill: surface, stroke: accentFill }} strokeWidth="4" />
      <circle cx="150" cy="112" r="40" style={{ stroke: accentFill }} strokeWidth="1.5" opacity="0.55" />
      <circle cx="150" cy="112" r="10" style={{ fill: accentFill }} />
      <circle cx="128" cy="96" r="5" style={{ fill: accentFill }} opacity="0.75" />
      <circle cx="172" cy="96" r="5" style={{ fill: muted }} opacity="0.8" />
      <circle cx="128" cy="128" r="5" style={{ fill: muted }} opacity="0.8" />
      <circle cx="172" cy="128" r="5" style={{ fill: accentFill }} opacity="0.75" />

      {/* Cutlery bars, flat and minimal */}
      <rect x="248" y="66" width="8" height="92" rx="4" style={{ fill: ink }} opacity="0.85" />
      <rect x="264" y="66" width="8" height="92" rx="4" style={{ fill: ink }} opacity="0.45" />

      {/* Serving cloche accent */}
      <path d="M352 148 a26 26 0 0 1 52 0 Z" style={{ fill: accentFill }} />
      <rect x="344" y="148" width="68" height="6" rx="3" style={{ fill: ink }} opacity="0.8" />
      <circle cx="378" cy="118" r="3" style={{ fill: accentFill }} />

      {/* Header badge */}
      <rect x="20" y="20" width="124" height="26" rx="13" style={{ fill: surface, stroke: accentFill }} strokeWidth="1.5" />
      <text x="32" y="37" style={{ fill: ink }} fontFamily="Nunito Sans, sans-serif" fontWeight="800" fontSize="12" letterSpacing="0.05em">{m.badgeComida}</text>
    </svg>
  );
};
