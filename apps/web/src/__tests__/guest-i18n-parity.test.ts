import { describe, expect, it } from 'vitest';
import {
  MEAL_LABELS,
  TEMPLATE_INVITE_COPY,
  TEMPLATE_INVITE_COPY_EN,
  TEMPLATE_LABELS_EN,
  mealLabel,
  templateInviteCopy,
  templateLabel,
} from '@fiestapay/shared';
import { ALL_GUEST_CATALOGS } from '../i18n/messages';

describe('guest catalog ES/EN parity', () => {
  it('registers every guest-journey catalog', () => {
    expect(Object.keys(ALL_GUEST_CATALOGS).sort()).toEqual([
      'funding',
      'guestChat',
      'invite',
      'paypal',
      'rsvp',
      'voice',
    ]);
  });

  it('defines the same keys in both languages with matching value kinds', () => {
    for (const [name, catalog] of Object.entries(ALL_GUEST_CATALOGS)) {
      const esKeys = Object.keys(catalog.es).sort();
      const enKeys = Object.keys(catalog.en).sort();
      expect(enKeys, `${name}: en keys`).toEqual(esKeys);
      for (const key of esKeys) {
        expect(typeof catalog.en[key], `${name}.${key}: value kind`).toBe(typeof catalog.es[key]);
      }
    }
  });

  it('has no empty string values in either language', () => {
    for (const [name, catalog] of Object.entries(ALL_GUEST_CATALOGS)) {
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
      const invite = ALL_GUEST_CATALOGS.invite[side] as unknown as Record<string, (...args: any[]) => string>;
      expect(invite.welcomeGuest('Ana').length, `invite.${side}.welcomeGuest`).toBeGreaterThan(0);
      expect(invite.captureStatus('approved').length, `invite.${side}.captureStatus`).toBeGreaterThan(0);
      expect(invite.quotaBadge('$50.00').length, `invite.${side}.quotaBadge`).toBeGreaterThan(0);
      expect(invite.stepQuoteDone('$25.00').length, `invite.${side}.stepQuoteDone`).toBeGreaterThan(0);
      const paypal = ALL_GUEST_CATALOGS.paypal[side] as unknown as Record<string, (...args: any[]) => string>;
      expect(paypal.orderStatusShown('failed').length, `paypal.${side}.orderStatusShown`).toBeGreaterThan(0);
      expect(paypal.paypalIssue('x').length, `paypal.${side}.paypalIssue`).toBeGreaterThan(0);
      const funding = ALL_GUEST_CATALOGS.funding[side] as unknown as Record<string, (...args: any[]) => string>;
      expect(funding.confirmedPeople(2).length, `funding.${side}.confirmedPeople`).toBeGreaterThan(0);
      expect(funding.progressMin(99).length, `funding.${side}.progressMin`).toBeGreaterThan(0);
      const chat = ALL_GUEST_CATALOGS.guestChat[side] as unknown as Record<string, (...args: any[]) => string>;
      expect(chat.quoteLine(2).length, `guestChat.${side}.quoteLine`).toBeGreaterThan(0);
      expect(chat.attend(2, 'x').length, `guestChat.${side}.attend`).toBeGreaterThan(0);
      const voice = ALL_GUEST_CATALOGS.voice[side] as unknown as Record<string, (...args: any[]) => string>;
      expect(voice.cooldownWait(15).length, `voice.${side}.cooldownWait`).toBeGreaterThan(0);
      const rsvp = ALL_GUEST_CATALOGS.rsvp[side] as unknown as Record<string, (...args: any[]) => string>;
      expect(rsvp.fullCapacity(10).length, `rsvp.${side}.fullCapacity`).toBeGreaterThan(0);
    }
  });
});

describe('shared template and meal labels per locale', () => {
  it('keeps the Spanish invite copy untouched and adds English variants', () => {
    expect(TEMPLATE_INVITE_COPY.comida.welcome).toBe('¿Vienes a comer?');
    expect(templateInviteCopy('comida', 'es')).toEqual(TEMPLATE_INVITE_COPY.comida);
    expect(templateInviteCopy('viaje', 'en')).toEqual(TEMPLATE_INVITE_COPY_EN.viaje);
    expect(TEMPLATE_INVITE_COPY_EN.casa.join).toBe('Join at home');
  });

  it('labels every template and meal in both languages', () => {
    expect(templateLabel('casa', 'es')).toBe('Fiesta en casa');
    expect(templateLabel('casa', 'en')).toBe(TEMPLATE_LABELS_EN.casa);
    expect(templateLabel('viaje')).toBe('Viaje conjunto');
    expect(mealLabel('almuerzo', 'es')).toBe('almuerzo');
    expect(mealLabel('almuerzo', 'en')).toBe('lunch');
    expect(mealLabel('cena')).toBe('cena');
    expect(Object.keys(MEAL_LABELS.en).sort()).toEqual(['almuerzo', 'cena', 'desayuno']);
  });
});
