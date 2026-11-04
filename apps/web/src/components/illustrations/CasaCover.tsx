import React from 'react';

interface CoverProps {
  className?: string;
  height?: number | string;
  accent?: string;
}

export const CasaCover: React.FC<CoverProps> = ({ className = '', height = '180px', accent }) => {
  return (
    <svg
      viewBox="0 0 500 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ width: '100%', height, display: 'block', objectFit: 'cover' }}
      aria-label="Ilustración de fiesta acogedora en casa"
      role="img"
    >
      {/* Background warm home evening atmosphere */}
      <rect width="500" height="200" fill="#12263A" />
      {accent ? <rect width="500" height="14" fill={accent} /> : null}
      <circle cx="150" cy="90" r="120" fill="#125FE6" fillOpacity="0.15" />
      <circle cx="380" cy="110" r="110" fill="#FFC85A" fillOpacity="0.12" />

      {/* Hanging festoon banner bunting */}
      <path d="M20 30 Q 150 65 280 35 Q 400 65 480 30" stroke="#E2E8F0" strokeWidth="1.5" strokeOpacity="0.6" />
      {/* Triangle flags */}
      {[
        { x: 50, y: 38, fill: '#E85D4A' },
        { x: 100, y: 48, fill: '#FFC85A' },
        { x: 160, y: 52, fill: '#0B8075' },
        { x: 220, y: 46, fill: '#125FE6' },
        { x: 300, y: 42, fill: '#FFC85A' },
        { x: 360, y: 50, fill: '#E85D4A' },
        { x: 420, y: 46, fill: '#0B8075' },
      ].map((flag, i) => (
        <polygon key={i} points={`${flag.x},${flag.y} ${flag.x + 18},${flag.y} ${flag.x + 9},${flag.y + 16}`} fill={flag.fill} />
      ))}

      {/* Cozy Lounge Sofa (Left side) */}
      <path d="M50 160 C 50 120 70 120 110 120 L 190 120 C 230 120 250 120 250 160 Z" fill="#0B8075" />
      <rect x="58" y="140" width="184" height="28" rx="8" fill="#08665E" />
      {/* Throw Pillows */}
      <rect x="80" y="125" width="28" height="26" rx="6" fill="#FFC85A" transform="rotate(-10 80 125)" />
      <rect x="180" y="125" width="28" height="26" rx="6" fill="#E85D4A" transform="rotate(12 180 125)" />

      {/* House Plant Monstera */}
      <ellipse cx="280" cy="165" rx="14" ry="10" fill="#E85D4A" />
      <path d="M280 155 Q 265 125 250 115 Q 275 120 280 155" fill="#0B8075" />
      <path d="M280 155 Q 295 120 310 110 Q 295 125 280 155" fill="#0B8075" />
      <path d="M280 155 Q 280 115 280 98 Q 285 115 280 155" fill="#0B8075" />

      {/* Vinyl Turntable Station (Right side) */}
      <rect x="330" y="130" width="130" height="42" rx="6" fill="#334155" stroke="#475569" strokeWidth="1.5" />
      {/* Vinyl record spinning */}
      <circle cx="370" cy="148" r="22" fill="#0F172A" stroke="#1E293B" strokeWidth="2" />
      <circle cx="370" cy="148" r="8" fill="#FFC85A" />
      <circle cx="370" cy="148" r="2" fill="#0F172A" />
      {/* Turntable needle arm */}
      <line x1="400" y1="135" x2="380" y2="148" stroke="#CBD5E1" strokeWidth="2.5" strokeLinecap="round" />
      {/* Cocktail shaker */}
      <path d="M425 156 L 430 135 L 438 135 L 443 156 Z" fill="#E2E8F0" />
      <rect x="431" y="128" width="6" height="7" rx="1" fill="#CBD5E1" />

      {/* Music notes floating */}
      <path d="M375 105 L 375 88 L 392 82 L 392 98 M 375 92 L 392 86" stroke="#FFC85A" strokeWidth="2" strokeLinecap="round" />
      <circle cx="372" cy="105" r="3.5" fill="#FFC85A" />
      <circle cx="389" cy="98" r="3.5" fill="#FFC85A" />

      {/* Header Badge */}
      <rect x="20" y="18" width="132" height="26" rx="13" fill="#12263A" fillOpacity="0.7" stroke="#0B8075" strokeWidth="1" />
      <text x="32" y="35" fill="#0B8075" fontFamily="Nunito Sans, sans-serif" fontWeight="800" fontSize="12" letterSpacing="0.05em">FIESTA EN CASA</text>
    </svg>
  );
};
