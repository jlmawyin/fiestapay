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
  accent?: string;
}

export const TemplateCover: React.FC<TemplateCoverProps> = ({ template, className, height, accent }) => {
  switch (template) {
    case 'comida':
      return <ComidaCover className={className} height={height} accent={accent} />;
    case 'casa':
      return <CasaCover className={className} height={height} accent={accent} />;
    case 'viaje':
      return <ViajeCover className={className} height={height} accent={accent} />;
    case 'evento':
      return <EventoCover className={className} height={height} accent={accent} />;
    default:
      return <ComidaCover className={className} height={height} accent={accent} />;
  }
};
