import React from 'react';
import { Caravan, House, PartyPopper, UtensilsCrossed } from 'lucide-react';
import type { TemplateKind } from '../../types';

interface TemplateIconProps {
  template: TemplateKind;
  size?: number;
}

/** Shared template glyph for the creation pickers. Decorative; labels carry the meaning. */
export const TemplateIcon: React.FC<TemplateIconProps> = ({ template, size = 18 }) => {
  switch (template) {
    case 'comida':
      return <UtensilsCrossed size={size} aria-hidden="true" />;
    case 'casa':
      return <House size={size} aria-hidden="true" />;
    case 'viaje':
      return <Caravan size={size} aria-hidden="true" />;
    case 'evento':
      return <PartyPopper size={size} aria-hidden="true" />;
    default:
      return <UtensilsCrossed size={size} aria-hidden="true" />;
  }
};
