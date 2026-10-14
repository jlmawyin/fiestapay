import React from 'react';
import type { TemplateKind } from '../../types';
import { ComidaCover } from './ComidaCover';
import { CasaCover } from './CasaCover';
import { ViajeCover } from './ViajeCover';
import { EventoCover } from './EventoCover';

interface TemplateCoverProps {
  template: TemplateKind;
  className?: string;
  height?: number | string;
}

export const TemplateCover: React.FC<TemplateCoverProps> = ({ template, className, height }) => {
  switch (template) {
    case 'comida':
      return <ComidaCover className={className} height={height} />;
    case 'casa':
      return <CasaCover className={className} height={height} />;
    case 'viaje':
      return <ViajeCover className={className} height={height} />;
    case 'evento':
      return <EventoCover className={className} height={height} />;
    default:
      return <ComidaCover className={className} height={height} />;
  }
};
