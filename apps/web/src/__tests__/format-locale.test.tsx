import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { I18nProvider, useI18n } from '../i18n/I18nContext';
import { setActiveLocale } from '../i18n/locale-store';
import {
  formatEventRange,
  formatInstantInZone,
  fundedIsNotConfirmationNote,
  guestCoveredCopy,
  guestPayLabel,
  isDemoEvent,
  namedGreeting,
  organizerConfirmedBadge,
  organizerLine,
} from '../lib/event-presentation';
import type { FiestaEvent } from '../types';

const INSTANT = '2026-12-15T19:00:00.000Z'; // 14:00 in America/Guayaquil (UTC-5, no DST)

function MoneyProbe({ cents }: { cents: number }): React.ReactElement {
  const { formatMoney } = useI18n();
  return <span data-testid="money">{formatMoney(cents)}</span>;
}

function DateProbe({ iso }: { iso: string }): React.ReactElement {
  const { formatDateTime } = useI18n();
  return <span data-testid="date">{formatDateTime(iso, { hour: '2-digit', minute: '2-digit' })}</span>;
}

function renderWithLocale(locale: 'es' | 'en', ui: React.ReactElement): void {
  localStorage.setItem('fp_locale', locale);
  render(<I18nProvider>{ui}</I18nProvider>);
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/');
  document.documentElement.lang = 'es';
  setActiveLocale('es');
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  window.history.replaceState({}, '', '/');
  document.documentElement.lang = 'es';
  setActiveLocale('es');
});

describe('locale formats', () => {
  it('formats USD cents per locale: $50,00 in es and $50.00 in en', () => {
    renderWithLocale('es', <MoneyProbe cents={5000} />);
    expect(screen.getByTestId('money')).toHaveTextContent('$50,00');
    cleanup();

    renderWithLocale('en', <MoneyProbe cents={5000} />);
    expect(screen.getByTestId('money')).toHaveTextContent('$50.00');
  });

  it('always shows the Guayaquil wall time, never the viewer zone', () => {
    // The hook output equals an explicit Guayaquil formatting, whatever the
    // browser zone is, and differs from another-zone formatting in both locales.
    for (const locale of ['es-EC', 'en-US'] as const) {
      const hook = locale === 'es-EC' ? 'es' : 'en';
      renderWithLocale(hook, <DateProbe iso={INSTANT} />);
      const text = screen.getByTestId('date').textContent ?? '';
      const guayaquil = new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Guayaquil',
      }).format(new Date(INSTANT));
      const tokyo = new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Tokyo',
      }).format(new Date(INSTANT));
      expect(text, `${locale} forces Guayaquil`).toBe(guayaquil);
      expect(text, `${locale} ignores the viewer zone`).not.toBe(tokyo);
      cleanup();
    }
  });

  it('keeps event-presentation formatters identical in es by default', () => {
    expect(formatInstantInZone(INSTANT).label).toContain('America/Guayaquil');
    const range = formatEventRange('2026-12-15T19:00:00.000Z', '2026-12-16T15:00:00.000Z');
    expect(range).toContain('Inicio:');
    expect(range).toContain('Fin:');
    expect(range).toContain('14:00');
    expect(range).toContain('10:00');
    expect(range.match(/America\/Guayaquil/g)).toHaveLength(1);
    expect(organizerLine('Ana')).toBe('Organiza Ana');
    expect(namedGreeting('Ana')).toBe('Ana te invita.');
    expect(guestPayLabel(2500, 2500)).toBe('Abonado $25,00. Falta $25,00');
    expect(organizerConfirmedBadge('viaje')).toBe('Viaje confirmado por el organizador');
    expect(fundedIsNotConfirmationNote('viaje')).toContain('no confirma el viaje por sí solo');
    expect(guestCoveredCopy('comida', 2500)).toContain('Tu pago de esta comida ya está cubierto');
  });

  it('translates event-presentation copy with an explicit en locale', () => {
    const range = formatEventRange('2026-12-15T19:00:00.000Z', '2026-12-16T15:00:00.000Z', undefined, 'en');
    expect(range).toContain('Start:');
    expect(range).toContain('End:');
    expect(range).not.toContain('Inicio:');
    expect(range.match(/America\/Guayaquil/g)).toHaveLength(1);
    const openEnded = formatEventRange(INSTANT, null, undefined, 'en');
    expect(openEnded).toContain('No end time given');
    expect(organizerLine('Ana', 'en')).toBe('Organized by Ana');
    expect(namedGreeting('Ana', 'en')).toBe('Ana invites you.');
    expect(guestPayLabel(2500, 0, 'en')).toBe('Paid');
    expect(guestPayLabel(2500, 2500, 'en')).toBe('Paid $25.00. Remaining $25.00');
    expect(organizerConfirmedBadge('viaje', 'en')).toBe('Trip confirmed by the organizer');
    expect(fundedIsNotConfirmationNote('viaje', 'en')).toContain('does not confirm the trip');
    expect(guestCoveredCopy('comida', 2500, 'en')).toContain('Your payment for this meal is already covered');
  });

  it('marks only explicit isDemo:true events as demos', () => {
    const base = { id: 'e', slug: 's' } as FiestaEvent;
    expect(isDemoEvent({ ...base, isDemo: true } as FiestaEvent)).toBe(true);
    expect(isDemoEvent({ ...base, isDemo: false } as FiestaEvent)).toBe(false);
    expect(isDemoEvent(base)).toBe(false);
  });
});
