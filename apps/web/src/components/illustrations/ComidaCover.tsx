import React from 'react';

interface CoverProps {
  className?: string;
  height?: number | string;
  accent?: string;
}

export const ComidaCover: React.FC<CoverProps> = ({ className = '', height = '180px', accent }) => {
  return (
    <svg
      viewBox="0 0 500 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ width: '100%', height, display: 'block', objectFit: 'cover' }}
      aria-label="Ilustración de banquete festivo y comida compartida"
      role="img"
    >
      {/* Background with warm terracotta / dark ink depth */}
      <rect width="500" height="200" fill="#12263A" />
      {accent ? <rect width="500" height="14" fill={accent} /> : null}
      <circle cx="250" cy="100" r="140" fill="#FFC85A" fillOpacity="0.12" />
      <circle cx="80" cy="40" r="80" fill="#E85D4A" fillOpacity="0.15" />
      <circle cx="420" cy="160" r="90" fill="#0B8075" fillOpacity="0.15" />

      {/* Wooden cutting board */}
      <rect x="50" y="110" width="130" height="65" rx="10" fill="#D97706" fillOpacity="0.35" stroke="#FFC85A" strokeWidth="1.5" />
      {/* Artisan bread slices */}
      <ellipse cx="90" cy="138" rx="22" ry="14" fill="#FFC85A" />
      <ellipse cx="120" cy="144" rx="20" ry="12" fill="#E2A128" />
      <line x1="82" y1="134" x2="98" y2="134" stroke="#78350F" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="112" y1="140" x2="128" y2="140" stroke="#78350F" strokeWidth="1.5" strokeLinecap="round" />

      {/* Main Paella / Skillet */}
      <ellipse cx="250" cy="120" rx="90" ry="46" fill="#1E293B" />
      <ellipse cx="250" cy="118" rx="84" ry="42" fill="#F59E0B" />
      {/* Saffron rice texture */}
      <ellipse cx="250" cy="118" rx="76" ry="36" fill="#D97706" />
      {/* Skillet handles */}
      <path d="M156 118 Q 140 112 156 122" stroke="#64748B" strokeWidth="6" strokeLinecap="round" />
      <path d="M344 118 Q 360 112 344 122" stroke="#64748B" strokeWidth="6" strokeLinecap="round" />
      {/* Fresh ingredients: peppers, peas, shrimp */}
      <ellipse cx="225" cy="115" rx="8" ry="5" fill="#E85D4A" transform="rotate(-15 225 115)" />
      <ellipse cx="270" cy="112" rx="9" ry="6" fill="#E85D4A" transform="rotate(25 270 112)" />
      <circle cx="210" cy="125" r="4" fill="#0B8075" />
      <circle cx="245" cy="130" r="4.5" fill="#0B8075" />
      <circle cx="285" cy="126" r="4" fill="#0B8075" />
      <ellipse cx="250" cy="105" rx="10" ry="6" fill="#FFC85A" />
      <path d="M246 100 Q 250 96 254 100" stroke="#E85D4A" strokeWidth="2.5" strokeLinecap="round" />

      {/* Wine carafe & glasses on the right */}
      {/* Wine bottle */}
      <path d="M375 145 L 375 90 Q 375 80 382 72 L 382 50 L 392 50 L 392 72 Q 399 80 399 90 L 399 145 Z" fill="#0B8075" />
      <rect x="380" y="44" width="14" height="6" rx="2" fill="#D97706" />
      <rect x="376" y="98" width="22" height="28" rx="3" fill="#F7FAFC" fillOpacity="0.9" />
      <line x1="380" y1="108" x2="394" y2="108" stroke="#E85D4A" strokeWidth="2" strokeLinecap="round" />
      {/* Wine glass with clinking highlight */}
      <path d="M420 100 Q 420 125 432 125 Q 444 125 444 100 Z" fill="#E85D4A" fillOpacity="0.85" />
      <line x1="432" y1="125" x2="432" y2="148" stroke="#CBD5E1" strokeWidth="2.5" />
      <ellipse cx="432" cy="148" rx="10" ry="3" fill="#CBD5E1" />

      {/* Steam curves rising */}
      <path d="M235 80 Q 230 65 237 55" stroke="#FFFFFF" strokeWidth="1.5" strokeOpacity="0.4" strokeLinecap="round" />
      <path d="M255 75 Q 260 60 252 50" stroke="#FFFFFF" strokeWidth="2" strokeOpacity="0.5" strokeLinecap="round" />
      <path d="M272 82 Q 268 68 275 58" stroke="#FFFFFF" strokeWidth="1.5" strokeOpacity="0.4" strokeLinecap="round" />

      {/* Header Badge in the illustration */}
      <rect x="20" y="18" width="112" height="26" rx="13" fill="#12263A" fillOpacity="0.7" stroke="#FFC85A" strokeWidth="1" />
      <text x="32" y="35" fill="#FFC85A" fontFamily="Nunito Sans, sans-serif" fontWeight="800" fontSize="12" letterSpacing="0.05em">COMIDA & ASADO</text>
    </svg>
  );
};
