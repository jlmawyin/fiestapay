/** Presentation metadata. Money, deadlines, and access rules do not live here. */

export type PresentationTemplate = 'comida' | 'casa' | 'viaje' | 'evento';

export const TEMPLATE_THEMES = {
  comida: ['mesa', 'huerto', 'brindis', 'fogata'],
  casa: ['patio', 'sala', 'terraza', 'jardin'],
  viaje: ['camino', 'montana', 'costa', 'ciudad'],
  evento: ['escenario', 'galeria', 'taller', 'noche'],
} as const;

export type ThemeKey = (typeof TEMPLATE_THEMES)[PresentationTemplate][number];

export const ORGANIZER_NAME_MAX = 100;

export interface ThemeDefinition {
  key: ThemeKey;
  template: PresentationTemplate;
  label: string;
  /** Plain phrase for the invitation and the WhatsApp draft. No color controls. */
  phrase: string;
  surface: string;
  ink: string;
  muted: string;
  accent: string;
  onAccent: string;
  tint: string;
}

export interface TemplateInviteCopy {
  welcome: string;
  join: string;
  noun: string;
}

export const TEMPLATE_INVITE_COPY: Record<PresentationTemplate, TemplateInviteCopy> = {
  comida: { welcome: '¿Vienes a comer?', join: 'Unirme a comer', noun: 'comida' },
  casa: { welcome: '¿Vienes a casa?', join: 'Unirme en casa', noun: 'casa' },
  viaje: { welcome: '¿Te unes al viaje?', join: 'Unirme al viaje', noun: 'viaje' },
  evento: { welcome: '¿Vienes al evento?', join: 'Unirme al evento', noun: 'evento' },
};

const theme = (
  key: ThemeKey,
  template: PresentationTemplate,
  label: string,
  phrase: string,
  surface: string,
  ink: string,
  muted: string,
  accent: string,
  tint: string,
): ThemeDefinition => ({
  key,
  template,
  label,
  phrase,
  surface,
  ink,
  muted,
  accent,
  onAccent: '#FFFFFF',
  tint,
});

export const THEMES: readonly ThemeDefinition[] = [
  theme('mesa', 'comida', 'Mesa', '¿Vienes a comer?', '#FFF8F1', '#2A2118', '#5C4033', '#9A3412', '#F6E4D4'),
  theme('huerto', 'comida', 'Huerto', 'Hay puesto en el huerto.', '#F7F8F2', '#1C2414', '#3F4A32', '#3F6212', '#E4EDD4'),
  theme('brindis', 'comida', 'Brindis', 'Hay un brindis para ti.', '#FFF7F8', '#2A1218', '#6B3040', '#9F1239', '#F8DDE3'),
  theme('fogata', 'comida', 'Fogata', 'La fogata ya está lista.', '#FFF6EE', '#2B1A12', '#6B4530', '#7C2D12', '#F8E0D0'),
  theme('patio', 'casa', 'Patio', '¿Vienes a casa?', '#F3FAF5', '#14261C', '#3A5648', '#166534', '#DCEFE3'),
  theme('sala', 'casa', 'Sala', 'La sala está lista.', '#F5F7FB', '#172033', '#3E4C66', '#1E3A8A', '#E2E8F5'),
  theme('terraza', 'casa', 'Terraza', 'Te esperamos en la terraza.', '#F3FBFA', '#132826', '#3A5552', '#0F766E', '#D7F0EC'),
  theme('jardin', 'casa', 'Jardín', 'El jardín es la casa.', '#F6F8F2', '#1A2414', '#445338', '#3F6212', '#E5EDD6'),
  theme('camino', 'viaje', 'Camino', '¿Te unes al viaje?', '#F4F7FB', '#152033', '#3E4E66', '#1D4E89', '#E1EAF5'),
  theme('montana', 'viaje', 'Montaña', 'La montaña nos espera.', '#F4F6F8', '#15202B', '#3E4C5C', '#1E3A5F', '#E2E8EF'),
  theme('costa', 'viaje', 'Costa', 'La costa está en el plan.', '#F3F9FB', '#13262C', '#3A545C', '#0F5F73', '#D7EEF3'),
  theme('ciudad', 'viaje', 'Ciudad', 'La ciudad es el encuentro.', '#F6F6FC', '#1C1A33', '#4C4868', '#4338CA', '#E6E6F6'),
  theme('escenario', 'evento', 'Escenario', '¿Vienes al evento?', '#FBF6F8', '#2A1822', '#643848', '#7A1F4B', '#F4E0E8'),
  theme('galeria', 'evento', 'Galería', 'La galería abre sus puertas.', '#F8F6FC', '#231833', '#564868', '#6D28D9', '#EBE4F8'),
  theme('taller', 'evento', 'Taller', 'El taller ya tiene lugar.', '#FFF8F3', '#2A1C14', '#684838', '#9A3412', '#F8E6D8'),
  theme('noche', 'evento', 'Noche', 'La noche es el evento.', '#F6F6FB', '#1A1830', '#484568', '#312E81', '#E4E4F4'),
];

const byKey = new Map<string, ThemeDefinition>(THEMES.map((item) => [item.key, item]));

export function themesForTemplate(template: PresentationTemplate): ThemeDefinition[] {
  const allowed = new Set<string>(TEMPLATE_THEMES[template]);
  return THEMES.filter((item) => allowed.has(item.key));
}

export function defaultThemeFor(template: PresentationTemplate): ThemeDefinition {
  const key = TEMPLATE_THEMES[template][0];
  const found = byKey.get(key);
  if (!found) throw new Error('Tema por defecto ausente');
  return found;
}

export function themeBelongs(template: PresentationTemplate, key: string | null | undefined): key is ThemeKey {
  if (!key) return false;
  return (TEMPLATE_THEMES[template] as readonly string[]).includes(key);
}

export function resolveTheme(template: PresentationTemplate, key: string | null | undefined): ThemeDefinition {
  if (key && themeBelongs(template, key)) {
    const found = byKey.get(key);
    if (found) return found;
  }
  return defaultThemeFor(template);
}

export function normalizeOrganizerName(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, ORGANIZER_NAME_MAX);
}

const fold = (value: string): string =>
  value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const TITLE_HINTS: { template: PresentationTemplate; key: ThemeKey; words: string[] }[] = [
  { template: 'viaje', key: 'montana', words: ['cuenca', 'sierra', 'montana', 'andes', 'volcan'] },
  { template: 'viaje', key: 'costa', words: ['playa', 'costa', 'mar', 'manta', 'salinas'] },
  { template: 'viaje', key: 'ciudad', words: ['quito', 'guayaquil', 'ciudad', 'centro'] },
  { template: 'comida', key: 'huerto', words: ['huerto', 'campo', 'cosecha'] },
  { template: 'comida', key: 'brindis', words: ['brindis', 'vino', 'champagne'] },
  { template: 'comida', key: 'fogata', words: ['fogata', 'asado', 'parrilla'] },
  { template: 'casa', key: 'sala', words: ['sala', 'living'] },
  { template: 'casa', key: 'terraza', words: ['terraza', 'balcon'] },
  { template: 'casa', key: 'jardin', words: ['jardin', 'patio'] },
  { template: 'evento', key: 'galeria', words: ['galeria', 'museo', 'expo'] },
  { template: 'evento', key: 'taller', words: ['taller', 'workshop', 'curso'] },
  { template: 'evento', key: 'noche', words: ['noche', 'gala', 'after'] },
];

/** Local hint only. Callers must not replace a theme the person already chose. */
export function suggestTheme(template: PresentationTemplate, title: string): ThemeDefinition | null {
  const folded = fold(title);
  if (!folded) return null;
  for (const hint of TITLE_HINTS) {
    if (hint.template !== template) continue;
    if (hint.words.some((word) => folded.includes(word))) return resolveTheme(template, hint.key);
  }
  return null;
}

function channel(hex: string, index: number): number {
  const raw = hex.replace('#', '');
  const pair = raw.slice(index * 2, index * 2 + 2);
  const value = Number.parseInt(pair, 16) / 255;
  if (!Number.isFinite(value)) return 0;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance for a #RRGGBB color. */
export function relativeLuminance(hex: string): number {
  const r = channel(hex, 0);
  const g = channel(hex, 1);
  const b = channel(hex, 2);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio, 1 to 21. Order does not matter. */
export function contrastRatio(foreground: string, background: string): number {
  const left = relativeLuminance(foreground);
  const right = relativeLuminance(background);
  const lighter = Math.max(left, right);
  const darker = Math.min(left, right);
  return (lighter + 0.05) / (darker + 0.05);
}

export interface ContrastPair {
  name: string;
  foreground: string;
  background: string;
  minimum: number;
}

/** Known pairs for one theme. Normal text is 4.5. Large text and the focus accent are 3. */
export function themeContrastPairs(item: ThemeDefinition): ContrastPair[] {
  return [
    { name: `${item.key}:ink-on-surface`, foreground: item.ink, background: item.surface, minimum: 4.5 },
    { name: `${item.key}:muted-on-surface`, foreground: item.muted, background: item.surface, minimum: 4.5 },
    { name: `${item.key}:on-accent`, foreground: item.onAccent, background: item.accent, minimum: 4.5 },
    { name: `${item.key}:ink-on-tint`, foreground: item.ink, background: item.tint, minimum: 4.5 },
    { name: `${item.key}:accent-on-surface`, foreground: item.accent, background: item.surface, minimum: 3 },
  ];
}
