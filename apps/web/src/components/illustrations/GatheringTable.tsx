import React from 'react';

interface IllustrationProps {
  className?: string;
  width?: number | string;
  height?: number | string;
}

export const GatheringTable: React.FC<IllustrationProps> = ({
  className = '',
  width = '100%',
  height = 'auto',
}) => {
  return (
    <svg
      viewBox="0 0 600 240"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ width, height, display: 'block' }}
      aria-label="Amigos reunidos alrededor de una mesa festiva compartiendo comida y brindando"
      role="img"
    >
      {/* Background warm festive ambience */}
      <rect width="600" height="240" rx="16" fill="#12263A" />
      <circle cx="120" cy="50" r="70" fill="#FFC85A" fillOpacity="0.08" />
      <circle cx="480" cy="60" r="90" fill="#125FE6" fillOpacity="0.12" />
      <circle cx="300" cy="110" r="110" fill="#0B8075" fillOpacity="0.08" />

      {/* Hanging garland / string lights */}
      <path
        d="M20 30 Q 150 75 300 35 Q 450 75 580 30"
        stroke="#FFC85A"
        strokeWidth="2"
        strokeDasharray="4 4"
        strokeOpacity="0.5"
      />
      {/* Light bulbs */}
      {[
        { cx: 80, cy: 52 },
        { cx: 160, cy: 62 },
        { cx: 230, cy: 50 },
        { cx: 300, cy: 35 },
        { cx: 370, cy: 50 },
        { cx: 440, cy: 62 },
        { cx: 520, cy: 52 },
      ].map((bulb, i) => (
        <g key={i}>
          <circle cx={bulb.cx} cy={bulb.cy} r="6" fill="#FFC85A" />
          <circle cx={bulb.cx} cy={bulb.cy} r="10" fill="#FFC85A" fillOpacity="0.25" />
        </g>
      ))}

      {/* Confetti specks */}
      <circle cx="100" cy="90" r="3" fill="#E85D4A" />
      <rect x="200" y="80" width="6" height="4" rx="1" fill="#FFC85A" transform="rotate(25 200 80)" />
      <circle cx="410" cy="85" r="3.5" fill="#125FE6" />
      <rect x="500" y="95" width="5" height="5" rx="1" fill="#0B8075" transform="rotate(-15 500 95)" />

      {/* Dining Table Surface */}
      <ellipse cx="300" cy="190" rx="260" ry="42" fill="#F7FAFC" />
      <ellipse cx="300" cy="190" rx="250" ry="38" fill="#EDF2F7" />
      <line x1="80" y1="190" x2="520" y2="190" stroke="#CBD5E1" strokeWidth="2" strokeDasharray="6 4" />

      {/* Centerpiece - Savory Paella / Feast Pan */}
      <ellipse cx="300" cy="180" rx="42" ry="16" fill="#12263A" />
      <ellipse cx="300" cy="179" rx="38" ry="14" fill="#FFC85A" />
      <circle cx="290" cy="178" r="4" fill="#E85D4A" />
      <circle cx="310" cy="177" r="4.5" fill="#0B8075" />
      <circle cx="300" cy="183" r="3.5" fill="#E85D4A" />
      {/* Pan handles */}
      <path d="M256 179 C 250 176 250 182 256 180" stroke="#12263A" strokeWidth="3" fill="none" />
      <path d="M344 179 C 350 176 350 182 344 180" stroke="#12263A" strokeWidth="3" fill="none" />

      {/* Plates and servings around the table */}
      {/* Left Plate */}
      <ellipse cx="180" cy="188" rx="24" ry="10" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1.5" />
      <circle cx="180" cy="187" r="5" fill="#E85D4A" />
      {/* Right Plate */}
      <ellipse cx="420" cy="188" rx="24" ry="10" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1.5" />
      <circle cx="420" cy="187" r="5" fill="#0B8075" />
      {/* Small side bowls */}
      <ellipse cx="230" cy="195" rx="14" ry="6" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1.5" />
      <circle cx="230" cy="194" r="3" fill="#FFC85A" />
      <ellipse cx="370" cy="195" rx="14" ry="6" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1.5" />
      <circle cx="370" cy="194" r="3" fill="#FFC85A" />

      {/* Friends figures (stylized warm community silhouettes) */}
      {/* Person 1 (Left) */}
      <g>
        <circle cx="140" cy="125" r="16" fill="#FFC85A" />
        <path d="M115 175 C 115 145 165 145 165 175 Z" fill="#125FE6" />
        {/* Arm raising glass */}
        <path d="M152 148 Q 170 135 178 126" stroke="#FFC85A" strokeWidth="6" strokeLinecap="round" />
        {/* Wine glass */}
        <path d="M176 122 L 184 122 L 180 128 Z" fill="#E85D4A" />
        <line x1="180" y1="128" x2="180" y2="135" stroke="#FFFFFF" strokeWidth="1.5" />
      </g>

      {/* Person 2 (Center Left) */}
      <g>
        <circle cx="235" cy="115" r="17" fill="#F7FAFC" />
        <path d="M210 170 C 210 140 260 140 260 170 Z" fill="#0B8075" />
      </g>

      {/* Person 3 (Center Right) */}
      <g>
        <circle cx="365" cy="115" r="17" fill="#FFC85A" />
        <path d="M340 170 C 340 140 390 140 390 170 Z" fill="#E85D4A" />
      </g>

      {/* Person 4 (Right) */}
      <g>
        <circle cx="460" cy="125" r="16" fill="#F7FAFC" />
        <path d="M435 175 C 435 145 485 145 485 175 Z" fill="#125FE6" />
        {/* Arm raising toast */}
        <path d="M448 148 Q 430 135 422 126" stroke="#F7FAFC" strokeWidth="6" strokeLinecap="round" />
        {/* Toast glass */}
        <path d="M418 122 L 426 122 L 422 128 Z" fill="#FFC85A" />
        <line x1="422" y1="128" x2="422" y2="135" stroke="#FFFFFF" strokeWidth="1.5" />
      </g>

      {/* Clinking toast spark */}
      <path d="M200 115 L 204 119 M 204 115 L 200 119" stroke="#FFC85A" strokeWidth="2" strokeLinecap="round" />
      <path d="M400 115 L 404 119 M 404 115 L 400 119" stroke="#FFC85A" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
};
