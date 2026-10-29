import React from 'react';

interface CoverProps {
  className?: string;
  height?: number | string;
  accent?: string;
}

export const EventoCover: React.FC<CoverProps> = ({ className = '', height = '180px', accent }) => {
  return (
    <svg
      viewBox="0 0 500 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ width: '100%', height, display: 'block', objectFit: 'cover' }}
      aria-label="Ilustración de gran evento formal y celebración con luces"
      role="img"
    >
      {/* Background night stage */}
      <rect width="500" height="200" fill="#12263A" />
      {accent ? <rect width="500" height="14" fill={accent} /> : null}

      {/* Spotlights cones */}
      <polygon points="60,0 120,200 20,200" fill="#FFC85A" fillOpacity="0.12" />
      <polygon points="440,0 480,200 380,200" fill="#125FE6" fillOpacity="0.18" />
      <polygon points="250,0 320,200 180,200" fill="#E85D4A" fillOpacity="0.1" />

      {/* Celebration Balloons (Left) */}
      <g>
        <ellipse cx="80" cy="95" rx="18" ry="24" fill="#E85D4A" />
        <ellipse cx="85" cy="90" rx="4" ry="8" fill="#FFFFFF" fillOpacity="0.4" />
        <path d="M80 119 L 78 123 L 82 123 Z" fill="#E85D4A" />
        <path d="M80 123 Q 75 145 82 170" stroke="#CBD5E1" strokeWidth="1" />

        <ellipse cx="115" cy="80" rx="19" ry="25" fill="#FFC85A" />
        <ellipse cx="120" cy="74" rx="4" ry="8" fill="#FFFFFF" fillOpacity="0.5" />
        <path d="M115 105 L 113 109 L 117 109 Z" fill="#FFC85A" />
        <path d="M115 109 Q 125 135 118 170" stroke="#CBD5E1" strokeWidth="1" />

        <ellipse cx="50" cy="110" rx="16" ry="22" fill="#0B8075" />
        <ellipse cx="54" cy="105" rx="3.5" ry="7" fill="#FFFFFF" fillOpacity="0.4" />
        <path d="M50 132 L 48 136 L 52 136 Z" fill="#0B8075" />
        <path d="M50 136 Q 45 150 52 170" stroke="#CBD5E1" strokeWidth="1" />
      </g>

      {/* Confetti ribbons & bursts */}
      {/* Ribbons curves */}
      <path d="M170 30 Q 185 60 175 90 Q 165 120 180 150" stroke="#FFC85A" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M330 35 Q 315 70 325 100 Q 340 130 320 160" stroke="#E85D4A" strokeWidth="3" strokeLinecap="round" fill="none" />

      {/* Confetti sparkles */}
      <rect x="220" y="45" width="8" height="5" rx="1" fill="#FFC85A" transform="rotate(35 220 45)" />
      <circle cx="280" cy="65" r="4" fill="#0B8075" />
      <rect x="260" y="105" width="7" height="7" rx="1" fill="#125FE6" transform="rotate(-20 260 105)" />
      <circle cx="370" cy="60" r="3.5" fill="#FFC85A" />
      <rect x="420" y="85" width="8" height="4" rx="1" fill="#E85D4A" transform="rotate(40 420 85)" />
      <circle cx="200" cy="130" r="4" fill="#E85D4A" />

      {/* Celebration Stage & Glasses in Center */}
      <g transform="translate(230, 95)">
        {/* Ice bucket */}
        <polygon points="10,40 38,40 34,70 14,70" fill="#94A3B8" />
        {/* Bottle in bucket */}
        <path d="M20 40 L 22 20 L 26 20 L 28 40 Z" fill="#0B8075" />
        <rect x="23" y="15" width="4" height="6" fill="#FFC85A" />
        {/* Clinking champagne flutes */}
        <path d="M5 25 Q 5 40 12 40 Q 19 40 19 25 Z" fill="#FFC85A" fillOpacity="0.8" />
        <line x1="12" y1="40" x2="12" y2="52" stroke="#CBD5E1" strokeWidth="1.5" />
        <line x1="7" y1="52" x2="17" y2="52" stroke="#CBD5E1" strokeWidth="1.5" />

        <path d="M30 25 Q 30 40 37 40 Q 44 40 44 25 Z" fill="#FFC85A" fillOpacity="0.8" />
        <line x1="37" y1="40" x2="37" y2="52" stroke="#CBD5E1" strokeWidth="1.5" />
        <line x1="32" y1="52" x2="42" y2="52" stroke="#CBD5E1" strokeWidth="1.5" />

        {/* Clink star */}
        <path d="M23 16 L 25 18 L 27 16 L 25 14 Z" fill="#FFFFFF" />
      </g>

      {/* Header Badge */}
      <rect x="20" y="18" width="138" height="26" rx="13" fill="#12263A" fillOpacity="0.7" stroke="#E85D4A" strokeWidth="1" />
      <text x="32" y="35" fill="#F87171" fontFamily="Nunito Sans, sans-serif" fontWeight="800" fontSize="12" letterSpacing="0.05em">EVENTO & CELEBRACIÓN</text>
    </svg>
  );
};
