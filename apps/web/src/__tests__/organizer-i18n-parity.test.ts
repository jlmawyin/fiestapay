import { describe, expect, it } from 'vitest';
import { THEMES, THEME_LABELS_EN, THEME_PHRASES_EN, themeLabel, themePhrase } from '@fiestapay/shared';
import { ALL_ORGANIZER_CATALOGS } from '../i18n/messages';

describe('organizer catalog ES/EN parity', () => {
  it('registers every organizer-journey catalog', () => {
    expect(Object.keys(ALL_ORGANIZER_CATALOGS).sort()).toEqual([
      'covers',
      'createEvent',
      'dashboard',
      'grid',
      'moderation',
      'organizerLink',
      'qrShare',
      'recovery',
      'recoveryEmail',
    ]);
  });

  it('defines the same keys in both languages with matching value kinds', () => {
    for (const [name, catalog] of Object.entries(ALL_ORGANIZER_CATALOGS)) {
      const esKeys = Object.keys(catalog.es).sort();
      const enKeys = Object.keys(catalog.en).sort();
      expect(enKeys, `${name}: en keys`).toEqual(esKeys);
      for (const key of esKeys) {
        expect(typeof catalog.en[key], `${name}.${key}: value kind`).toBe(typeof catalog.es[key]);
      }
    }
  });

  it('has no empty string values in either language', () => {
    for (const [name, catalog] of Object.entries(ALL_ORGANIZER_CATALOGS)) {
      for (const side of ['es', 'en'] as const) {
        for (const [key, value] of Object.entries(catalog[side])) {
          if (typeof value === 'string') {
            expect(value.trim().length, `${name}.${side}.${key}`).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('renders every interpolation without empty output', () => {
    const args: Array<string | number> = ['X', 'Y', 3, 7];
    for (const [name, catalog] of Object.entries(ALL_ORGANIZER_CATALOGS)) {
      for (const side of ['es', 'en'] as const) {
        for (const [key, value] of Object.entries(catalog[side])) {
          if (typeof value === 'function') {
            const out = (value as (...a: Array<string | number>) => string)(...args.slice(0, value.length));
            expect(out.trim().length, `${name}.${side}.${key}`).toBeGreaterThan(0);
          }
        }
      }
    }
  });
});

describe('shared theme labels and phrases per locale', () => {
  it('keeps the Spanish theme entries untouched and adds English variants', () => {
    expect(THEMES).toHaveLength(16);
    for (const theme of THEMES) {
      expect(themeLabel(theme.key, 'es')).toBe(theme.label);
      expect(themePhrase(theme.key, 'es')).toBe(theme.phrase);
      expect(themeLabel(theme.key, 'en')).toBe(THEME_LABELS_EN[theme.key]);
      expect(themePhrase(theme.key, 'en')).toBe(THEME_PHRASES_EN[theme.key]);
      expect(themeLabel(theme.key)).toBe(theme.label);
      expect(themePhrase(theme.key)).toBe(theme.phrase);
    }
    expect(themeLabel('montana', 'en')).toBe('Mountain');
    expect(themePhrase('montana', 'en')).toBe('The mountains are waiting.');
  });
});
