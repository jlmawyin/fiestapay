import React from 'react';
import type { TemplateKind } from '../../types';

/** NAP-U4: cabecera ilustrada de la invitación según la plantilla del evento. */
export type InviteIllustrationKind = 'comida' | 'cumpleanos' | 'reencuentro' | 'paseo' | 'generico';

export function inviteIllustrationFor(template: TemplateKind): InviteIllustrationKind {
  switch (template) {
    case 'comida':
      return 'comida';
    case 'casa':
      return 'cumpleanos';
    case 'evento':
      return 'reencuentro';
    case 'viaje':
      return 'paseo';
    default:
      return 'generico';
  }
}

const LABELS: Record<InviteIllustrationKind, { es: string; en: string }> = {
  comida: {
    es: 'Ilustración de banquete festivo y comida compartida',
    en: 'Festive banquet and shared meal illustration',
  },
  cumpleanos: { es: 'Ilustración de fiesta acogedora en casa', en: 'Cozy house party illustration' },
  reencuentro: {
    es: 'Ilustración de gran evento formal y celebración con luces',
    en: 'Grand formal event and celebration with lights illustration',
  },
  paseo: {
    es: 'Ilustración de viaje grupal, montañas y furgoneta de aventura',
    en: 'Group trip illustration with mountains and adventure van',
  },
  generico: { es: 'Ilustración de reunión', en: 'Meetup illustration' },
};

interface Props {
  template: TemplateKind;
  locale: 'es' | 'en';
}

export const InviteHeroIllustration: React.FC<Props> = ({ template, locale }) => {
  const kind = inviteIllustrationFor(template);
  return (
    <img
      className="invite-hero-illustration"
      data-illustration={kind}
      src={`/ilustraciones/${kind}.svg`}
      alt={LABELS[kind][locale]}
      width={500}
      height={200}
      loading="eager"
      decoding="async"
    />
  );
};
