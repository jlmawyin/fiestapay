import {
  Building2,
  CakeSlice,
  Car,
  Coffee,
  CookingPot,
  Croissant,
  EggFried,
  Flame,
  Flower2,
  Hammer,
  Lamp,
  Mic,
  Moon,
  Mountain,
  Music,
  Palette,
  PartyPopper,
  Palmtree,
  Salad,
  Sofa,
  Soup,
  Sprout,
  Sun,
  Ticket,
  UtensilsCrossed,
  Wine,
  type LucideIcon,
} from 'lucide-react';
import { resolveTheme, type Locale, type MealKind, type ThemeKey } from '@fiestapay/shared';
import type { TemplateKind } from '../../types';

/**
 * Document event the creation wizard dispatches when the person picks an
 * invitation type, so the public orb can transform into that theme (the
 * surprise). Detail `{ template }`; `null` on unmount or when going back.
 */
export const ASSISTANT_THEME_EVENT = 'fiestapay:assistant-theme' as const;

export interface AssistantThemeDetail {
  template: TemplateKind | null;
}

/** The five orb looks: deep-space plus one per invitation type. */
export type OrbThemeKey = 'espacial' | TemplateKind;

export const ORB_THEMES_KEYS: readonly OrbThemeKey[] = [
  'espacial',
  'comida',
  'casa',
  'viaje',
  'evento',
] as const;

export interface LocalizedText {
  es: string;
  en: string;
}

export function localize(text: LocalizedText, locale: Locale): string {
  return locale === 'en' ? text.en : text.es;
}

/** Motto shown on the launcher pill, alternating with the agent name. */
export const ORB_SLOGANS: Record<OrbThemeKey, LocalizedText> = {
  espacial: { es: '¿En qué te ayudo?', en: 'How can I help?' },
  comida: { es: '¿Te ayudo con la comida?', en: 'Need help with the meal?' },
  casa: { es: 'Te ayudo con la reunión', en: "I'll help with the get-together" },
  viaje: { es: '¿Listo para el viaje?', en: 'Ready for the trip?' },
  evento: { es: '¡Que empiece el evento!', en: 'Let the event begin!' },
};

/** Eye-catching scene data per theme, typed and bilingual. */
export interface OrbThemeData {
  key: OrbThemeKey;
  slogan: LocalizedText;
  /** What the CSS scene stages (planet, dish, house, globe, stage). */
  scene: LocalizedText;
  /** Orb body gradient when no invitation accent applies. */
  gradient: { from: string; to: string };
}

export const ORB_THEMES: Record<OrbThemeKey, OrbThemeData> = {
  espacial: {
    key: 'espacial',
    slogan: ORB_SLOGANS.espacial,
    scene: {
      es: 'Planeta con anillo inclinado, estrellas que titilan y un satélite en órbita.',
      en: 'Planet with a tilted ring, twinkling stars and an orbiting satellite.',
    },
    gradient: { from: '#1D4E89', to: '#0B2545' },
  },
  comida: {
    key: 'comida',
    slogan: ORB_SLOGANS.comida,
    scene: {
      es: 'Plato con vapor que sube y alimentos que flotan según la comida del evento.',
      en: 'Dish with rising steam and food floating by the event meal.',
    },
    gradient: { from: '#9A3412', to: '#7C2D12' },
  },
  casa: {
    key: 'casa',
    slogan: ORB_SLOGANS.casa,
    scene: {
      es: 'Casa con ventana iluminada y guirnalda de bombillas de colores.',
      en: 'House with a lit window and a swaying string of colored bulbs.',
    },
    gradient: { from: '#166534', to: '#14532D' },
  },
  viaje: {
    key: 'viaje',
    slogan: ORB_SLOGANS.viaje,
    scene: {
      es: 'Globo terráqueo con avión en órbita y nubes que pasan.',
      en: 'Globe with an orbiting plane and drifting clouds.',
    },
    gradient: { from: '#0F5F73', to: '#134E4A' },
  },
  evento: {
    key: 'evento',
    slogan: ORB_SLOGANS.evento,
    scene: {
      es: 'Escenario con focos que barren y estallido de confeti.',
      en: 'Stage with sweeping spotlights and a confetti burst.',
    },
    gradient: { from: '#7A1F4B', to: '#4A154B' },
  },
};

export function orbThemeFor(template: TemplateKind | null | undefined): OrbThemeKey {
  return template ?? 'espacial';
}

export interface OrbIcon {
  icon: LucideIcon;
  /** Stable lucide name, also rendered as data-icon for tests. */
  name: string;
}

const named = (icon: LucideIcon, name: string): OrbIcon => ({ icon, name });

/** Floating food per event meal (comida orb). */
export const MEAL_ICONS: Record<MealKind, readonly [OrbIcon, OrbIcon, OrbIcon]> = {
  desayuno: [named(Coffee, 'Coffee'), named(Croissant, 'Croissant'), named(EggFried, 'EggFried')],
  almuerzo: [named(Soup, 'Soup'), named(Salad, 'Salad'), named(CookingPot, 'CookingPot')],
  cena: [named(Wine, 'Wine'), named(UtensilsCrossed, 'UtensilsCrossed'), named(CakeSlice, 'CakeSlice')],
};

/** Casa orb props: lamp glow, sofa comfort, music. */
export const CASA_ICONS: readonly [OrbIcon, OrbIcon, OrbIcon] = [
  named(Lamp, 'Lamp'),
  named(Sofa, 'Sofa'),
  named(Music, 'Music'),
];

/** Evento orb props: popper, mic, ticket. */
export const EVENTO_ICONS: readonly [OrbIcon, OrbIcon, OrbIcon] = [
  named(PartyPopper, 'PartyPopper'),
  named(Mic, 'Mic'),
  named(Ticket, 'Ticket'),
];

/** One own icon per invitation theme (all exist in the installed lucide-react). */
export const THEME_KEY_ICONS: Record<ThemeKey, OrbIcon> = {
  mesa: named(UtensilsCrossed, 'UtensilsCrossed'),
  huerto: named(Sprout, 'Sprout'),
  brindis: named(Wine, 'Wine'),
  fogata: named(Flame, 'Flame'),
  patio: named(Sun, 'Sun'),
  sala: named(Sofa, 'Sofa'),
  terraza: named(Lamp, 'Lamp'),
  jardin: named(Flower2, 'Flower2'),
  camino: named(Car, 'Car'),
  montana: named(Mountain, 'Mountain'),
  costa: named(Palmtree, 'Palmtree'),
  ciudad: named(Building2, 'Building2'),
  escenario: named(Mic, 'Mic'),
  galeria: named(Palette, 'Palette'),
  taller: named(Hammer, 'Hammer'),
  noche: named(Moon, 'Moon'),
};

/** Fill color: the invitation theme accent, or the template default accent. */
export function orbAccentFor(template: TemplateKind, themeKey?: ThemeKey | null): string {
  return resolveTheme(template, themeKey ?? undefined).accent;
}

/** Theme icon: the saved theme icon, or the template default theme icon. */
export function orbIconFor(template: TemplateKind, themeKey?: ThemeKey | null): OrbIcon {
  return THEME_KEY_ICONS[resolveTheme(template, themeKey ?? undefined).key];
}

/** Accent used by the deep-space orb (no invitation). */
export const ESPACIAL_ACCENT = ORB_THEMES.espacial.gradient.from;
