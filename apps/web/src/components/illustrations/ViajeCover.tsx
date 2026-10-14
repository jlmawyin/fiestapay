import React from 'react';

interface CoverProps {
  className?: string;
  height?: number | string;
}

export const ViajeCover: React.FC<CoverProps> = ({ className = '', height = '180px' }) => {
  return (
    <svg
      viewBox="0 0 500 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ width: '100%', height, display: 'block', objectFit: 'cover' }}
      aria-label="Ilustración de viaje grupal, montañas y furgoneta de aventura"
      role="img"
    >
      {/* Sky and sunrise */}
      <rect width="500" height="200" fill="#12263A" />
      <circle cx="250" cy="85" r="48" fill="#FFC85A" fillOpacity="0.85" />
      <circle cx="250" cy="85" r="75" fill="#FFC85A" fillOpacity="0.2" />

      {/* Mountain silhouettes */}
      {/* Distant peaks */}
      <polygon points="50,150 140,80 230,150" fill="#1E3A5F" />
      <polygon points="120,95 140,80 160,95 150,95 140,88 130,95" fill="#F7FAFC" fillOpacity="0.8" />
      
      <polygon points="180,150 280,65 380,150" fill="#1B4D7E" />
      <polygon points="260,82 280,65 300,82 290,82 280,73 270,82" fill="#F7FAFC" stroke="#F7FAFC" strokeWidth="1" />

      <polygon points="320,150 420,85 490,150" fill="#1E3A5F" />
      <polygon points="405,98 420,85 435,98 428,98 420,91 412,98" fill="#F7FAFC" fillOpacity="0.8" />

      {/* Pine trees ridge */}
      {[70, 95, 120, 360, 390, 415, 440].map((x, i) => (
        <polygon key={i} points={`${x},148 ${x + 10},125 ${x + 20},148`} fill="#0B8075" />
      ))}

      {/* Road curve */}
      <path d="M0 190 Q 200 170 300 170 Q 420 170 500 195" stroke="#334155" strokeWidth="26" />
      <path d="M0 190 Q 200 170 300 170 Q 420 170 500 195" stroke="#FFC85A" strokeWidth="2" strokeDasharray="10 8" />

      {/* Camper Van on Road */}
      <g transform="translate(180, 130)">
        {/* Roof rack & luggage */}
        <line x1="16" y1="5" x2="84" y2="5" stroke="#475569" strokeWidth="3" strokeLinecap="round" />
        {/* Surfboard / Duffel */}
        <rect x="22" y="-2" width="34" height="6" rx="3" fill="#E85D4A" />
        <rect x="58" y="-4" width="22" height="8" rx="2" fill="#0B8075" />

        {/* Van Body */}
        <rect x="10" y="8" width="84" height="34" rx="6" fill="#125FE6" />
        <path d="M72 8 L 94 20 L 94 42 L 72 42 Z" fill="#125FE6" />
        {/* Windows */}
        <rect x="20" y="14" width="22" height="12" rx="2" fill="#F7FAFC" fillOpacity="0.9" />
        <rect x="48" y="14" width="22" height="12" rx="2" fill="#F7FAFC" fillOpacity="0.9" />
        <path d="M74 14 L 88 22 L 74 22 Z" fill="#F7FAFC" fillOpacity="0.9" />
        {/* Headlight beam */}
        <polygon points="94,32 135,26 135,42 94,36" fill="#FFC85A" fillOpacity="0.3" />
        <circle cx="92" cy="34" r="3" fill="#FFC85A" />
        {/* Wheels */}
        <circle cx="28" cy="42" r="8" fill="#0F172A" />
        <circle cx="28" cy="42" r="3" fill="#94A3B8" />
        <circle cx="78" cy="42" r="8" fill="#0F172A" />
        <circle cx="78" cy="42" r="3" fill="#94A3B8" />
      </g>

      {/* Compass emblem top right */}
      <circle cx="445" cy="42" r="20" fill="#12263A" fillOpacity="0.8" stroke="#125FE6" strokeWidth="1.5" />
      <polygon points="445,28 449,42 445,39 441,42" fill="#E85D4A" />
      <polygon points="445,56 449,42 445,45 441,42" fill="#CBD5E1" />

      {/* Header Badge */}
      <rect x="20" y="18" width="142" height="26" rx="13" fill="#12263A" fillOpacity="0.7" stroke="#125FE6" strokeWidth="1" />
      <text x="32" y="35" fill="#60A5FA" fontFamily="Nunito Sans, sans-serif" fontWeight="800" fontSize="12" letterSpacing="0.05em">VIAJE EN GRUPO</text>
    </svg>
  );
};
