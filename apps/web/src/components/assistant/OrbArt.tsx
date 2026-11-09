import React from 'react';
import { Cloud, House, Orbit, Plane } from 'lucide-react';
import type { OrbIcon, OrbThemeKey } from './orb-themes';
import { CASA_ICONS, EVENTO_ICONS, MEAL_ICONS, ORB_THEMES } from './orb-themes';
import type { MealKind } from '@fiestapay/shared';

export interface OrbArtProps {
  orb: OrbThemeKey;
  /** Fill color: the invitation theme accent (or the space gradient base). */
  accent: string;
  /** Center icon: the invitation theme icon. */
  icon: OrbIcon;
  meal?: MealKind;
  /** Diameter in px. Defaults to the ~64 px launcher. */
  size?: number;
  /** One-shot "surprise" accent animation (steam burst, confetti, flyby). */
  surprise?: boolean;
  /** Reduced motion: render the scene with no animation. */
  static?: boolean;
}

const CONFETTI_COLORS = ['#FFC85A', '#E85D4A', '#0B8075', '#FFFFFF', '#125FE6'];
const BULB_COLORS = ['#FFC85A', '#E85D4A', '#0B8075', '#125FE6', '#FFFFFF'];

/**
 * Pure-CSS orb scene (transform/opacity animations only, no images).
 * Decorative: callers hide it from assistive tech and name the button
 * with UI_LABELS.orbLauncher instead.
 */
export const OrbArt: React.FC<OrbArtProps> = ({
  orb,
  accent,
  icon,
  meal = 'almuerzo',
  size = 64,
  surprise = false,
  static: isStatic = false,
}) => {
  const gradient = ORB_THEMES[orb].gradient;
  const Icon = icon.icon;
  const iconSize = Math.max(16, Math.round(size * 0.34));

  return (
    <span
      aria-hidden="true"
      data-orb={orb}
      data-accent={accent}
      data-icon={icon.name}
      data-surprise={surprise ? 'true' : 'false'}
      data-static={isStatic ? 'true' : 'false'}
      className={`fp-orb-art fp-orb-art--${orb}${surprise && !isStatic ? ' fp-orb-surprise' : ''}${isStatic ? ' fp-orb-static' : ''}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        background: `radial-gradient(circle at 32% 26%, rgba(255,255,255,0.95) 0 8%, rgba(255,255,255,0.12) 9% 30%, transparent 31%), linear-gradient(150deg, ${accent} 0%, ${gradient.to} 100%)`,
      }}
    >
      {orb === 'espacial' && (
        <>
          <span className="fp-orb-ring" />
          <span className="fp-orb-orbit">
            <span className="fp-orb-sat" />
          </span>
          <span className="fp-orb-star fp-orb-star--1" />
          <span className="fp-orb-star fp-orb-star--2" />
          <span className="fp-orb-star fp-orb-star--3" />
          <span className="fp-orb-core">
            <Orbit size={Math.round(size * 0.3)} strokeWidth={2.2} />
          </span>
        </>
      )}

      {orb === 'comida' && (
        <>
          <span className="fp-orb-steam fp-orb-steam--1" />
          <span className="fp-orb-steam fp-orb-steam--2" />
          <span className="fp-orb-steam fp-orb-steam--3" />
          <span className="fp-orb-plate" />
          <span className="fp-orb-float fp-orb-float--1">
            {React.createElement(MEAL_ICONS[meal][0].icon, { size: Math.round(size * 0.2) })}
          </span>
          <span className="fp-orb-float fp-orb-float--2">
            {React.createElement(MEAL_ICONS[meal][1].icon, { size: Math.round(size * 0.24) })}
          </span>
          <span className="fp-orb-float fp-orb-float--3">
            {React.createElement(MEAL_ICONS[meal][2].icon, { size: Math.round(size * 0.2) })}
          </span>
        </>
      )}

      {orb === 'casa' && (
        <>
          <span className="fp-orb-garland">
            {BULB_COLORS.map((color) => (
              <span key={color} className="fp-orb-bulb" style={{ backgroundColor: color }} />
            ))}
          </span>
          <span className="fp-orb-core">
            <House size={Math.round(size * 0.34)} strokeWidth={2.2} />
          </span>
          <span className="fp-orb-window" />
          <span className="fp-orb-float fp-orb-float--1">
            {React.createElement(CASA_ICONS[0].icon, { size: Math.round(size * 0.16) })}
          </span>
          <span className="fp-orb-float fp-orb-float--3">
            {React.createElement(CASA_ICONS[2].icon, { size: Math.round(size * 0.16) })}
          </span>
        </>
      )}

      {orb === 'viaje' && (
        <>
          <span className="fp-orb-cloud fp-orb-cloud--1">
            <Cloud size={Math.round(size * 0.26)} />
          </span>
          <span className="fp-orb-cloud fp-orb-cloud--2">
            <Cloud size={Math.round(size * 0.2)} />
          </span>
          <span className="fp-orb-orbit fp-orb-orbit--plane">
            <span className="fp-orb-plane">
              <Plane size={Math.round(size * 0.2)} />
            </span>
          </span>
          <span className="fp-orb-meridian fp-orb-meridian--v" />
          <span className="fp-orb-meridian fp-orb-meridian--h" />
        </>
      )}

      {orb === 'evento' && (
        <>
          <span className="fp-orb-beam fp-orb-beam--left" />
          <span className="fp-orb-beam fp-orb-beam--right" />
          <span className="fp-orb-confetti" aria-hidden="true">
            {CONFETTI_COLORS.map((color, index) => (
              <span
                key={`${color}-${index}`}
                className={`fp-orb-chip fp-orb-chip--${index + 1}`}
                style={{ backgroundColor: color }}
              />
            ))}
          </span>
          <span className="fp-orb-float fp-orb-float--2">
            {React.createElement(EVENTO_ICONS[0].icon, { size: Math.round(size * 0.24) })}
          </span>
        </>
      )}

      <span className="fp-orb-badge" data-badge={icon.name}>
        <Icon size={iconSize} strokeWidth={2.4} />
      </span>
    </span>
  );
};
