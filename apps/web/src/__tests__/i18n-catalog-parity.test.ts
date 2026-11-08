import { describe, expect, it } from 'vitest';
import { ALL_CATALOGS } from '../i18n/catalogs';

describe('catalog ES/EN parity', () => {
  it('registers every catalog this package renders', () => {
    expect(Object.keys(ALL_CATALOGS).sort()).toEqual([
      'app',
      'buyer',
      'cards',
      'chat',
      'demo',
      'header',
      'landing',
      'modal',
      'orb',
      'ribbon',
      'toast',
    ]);
  });

  it('defines the same keys in both languages with matching value kinds', () => {
    for (const [name, catalog] of Object.entries(ALL_CATALOGS)) {
      const esKeys = Object.keys(catalog.es).sort();
      const enKeys = Object.keys(catalog.en).sort();
      expect(enKeys, `${name}: en keys`).toEqual(esKeys);
      for (const key of esKeys) {
        expect(typeof catalog.en[key], `${name}.${key}: value kind`).toBe(typeof catalog.es[key]);
      }
    }
  });

  it('has no empty string values in either language', () => {
    for (const [name, catalog] of Object.entries(ALL_CATALOGS)) {
      for (const side of ['es', 'en'] as const) {
        for (const [key, value] of Object.entries(catalog[side])) {
          if (typeof value === 'string') {
            expect(value.trim().length, `${name}.${side}.${key}`).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('renders sample interpolations without empty output', () => {
    for (const side of ['es', 'en'] as const) {
      const a = ALL_CATALOGS.app[side] as unknown as Record<string, (...args: never[]) => string>;
      const anyA = a as unknown as Record<string, (...args: any[]) => string>;
      expect(anyA.demoReady('X').length, `app.${side}.demoReady`).toBeGreaterThan(0);
      expect(anyA.payReady('X').length, `app.${side}.payReady`).toBeGreaterThan(0);
      expect(anyA.payIncompleteSlug('x').length, `app.${side}.payIncompleteSlug`).toBeGreaterThan(0);
      const c = ALL_CATALOGS.cards[side] as unknown as Record<string, (...args: never[]) => string>;
      const anyC = c as unknown as Record<string, (...args: any[]) => string>;
      expect(anyC.quota('$1.00').length, `cards.${side}.quota`).toBeGreaterThan(0);
      expect(anyC.registeredCount(1).length, `cards.${side}.registeredCount`).toBeGreaterThan(0);
      expect(anyC.registeredCount(2).length, `cards.${side}.registeredCount`).toBeGreaterThan(0);
    }
  });
});
