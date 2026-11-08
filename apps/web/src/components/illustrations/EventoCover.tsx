import React, { useId } from 'react';
import { useI18n, useMessages } from '../../i18n/I18nContext';
import { coversCatalog } from '../../i18n/messages/organizerCovers';

interface CoverProps {
  className?: string;
  height?: number | string;
  accent?: string;
}

/**
 * Modern editorial cover: stage light beams over a flat surface/tint
 * wash, with a geometric ticket stub and confetti in theme tones.
 * Every tone comes from the theme CSS vars so each theme renders its own
 * palette; the static fallbacks match the default `escenario` theme.
 */
export const EventoCover: React.FC<CoverProps> = ({ className = '', height = '180px', accent }) => {
  const { locale } = useI18n();
  const m = useMessages(coversCatalog);
  const surface = 'var(--theme-surface, #FBF6F8)';
  const ink = 'var(--theme-ink, #2A1822)';
  const muted = 'var(--theme-muted, #643848)';
  const accentFill = `var(--theme-accent, ${accent ?? '#7A1F4B'})`;
  const tint = 'var(--theme-tint, #F4E0E8)';
  const bgId = `fp-evento-bg-${useId().replace(/:/g, '')}`;
  return (
    <svg
      viewBox="0 0 500 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ width: '100%', height, display: 'block', objectFit: 'cover' }}
      aria-label={
        locale === 'en'
          ? 'Grand formal event and celebration with lights illustration'
          : 'Ilustración de gran evento formal y celebración con luces'
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

      {/* Stage light beams */}
      <polygon points="90,8 150,200 60,200" style={{ fill: accentFill }} opacity="0.10" />
      <polygon points="410,8 470,200 380,200" style={{ fill: accentFill }} opacity="0.14" />
      <polygon points="250,8 300,200 200,200" style={{ fill: ink }} opacity="0.06" />

      {/* Geometric confetti in theme tones */}
      <circle cx="70" cy="80" r="6" style={{ fill: accentFill }} opacity="0.85" />
      <rect x="140" y="52" width="11" height="11" rx="2" style={{ fill: ink }} opacity="0.7" transform="rotate(18 140 52)" />
      <circle cx="215" cy="70" r="4" style={{ fill: muted }} opacity="0.8" />
      <rect x="300" y="48" width="10" height="10" rx="2" style={{ fill: accentFill }} opacity="0.8" transform="rotate(-14 300 48)" />
      <circle cx="368" cy="76" r="5" style={{ fill: ink }} opacity="0.6" />
      <rect x="425" y="100" width="12" height="12" rx="2" style={{ fill: accentFill }} opacity="0.7" transform="rotate(24 425 100)" />
      <circle cx="180" cy="120" r="4" style={{ fill: accentFill }} opacity="0.6" />
      <circle cx="330" cy="118" r="6" style={{ fill: muted }} opacity="0.6" />

      {/* Ticket stub: outline, perforation, accent seal */}
      <rect x="150" y="118" width="200" height="58" rx="10" style={{ fill: surface, stroke: accentFill }} strokeWidth="3" />
      <line x1="238" y1="122" x2="238" y2="172" style={{ stroke: accentFill }} strokeWidth="2" strokeDasharray="5 5" opacity="0.7" />
      <circle cx="238" cy="118" r="6" style={{ fill: tint, stroke: accentFill }} strokeWidth="2" />
      <circle cx="238" cy="176" r="6" style={{ fill: tint, stroke: accentFill }} strokeWidth="2" />
      <circle cx="196" cy="147" r="12" style={{ fill: accentFill }} />
      <rect x="262" y="134" width="62" height="8" rx="4" style={{ fill: ink }} opacity="0.75" />
      <rect x="262" y="148" width="44" height="8" rx="4" style={{ fill: muted }} opacity="0.6" />

      {/* Stage floor line */}
      <rect x="40" y="186" width="420" height="5" rx="2.5" style={{ fill: ink }} opacity="0.75" />

      {/* Header badge */}
      <rect x="20" y="20" width="172" height="26" rx="13" style={{ fill: surface, stroke: accentFill }} strokeWidth="1.5" />
      <text x="32" y="37" style={{ fill: ink }} fontFamily="Nunito Sans, sans-serif" fontWeight="800" fontSize="12" letterSpacing="0.05em">{m.badgeEvento}</text>
    </svg>
  );
};
