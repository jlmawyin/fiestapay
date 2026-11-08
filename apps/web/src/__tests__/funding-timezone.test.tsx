import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FundingStatusPanel, formatEventInstant } from '../components/common/FundingStatusPanel';
import { I18nProvider } from '../i18n/I18nContext';
import { setActiveLocale } from '../i18n/locale-store';
import type { FiestaEvent } from '../types';

const DEADLINE = '2026-12-15T19:00:00.000Z'; // 14:00 in America/Guayaquil.
const PREVIOUS_TZ = process.env.TZ;

function eventFixture(over: Partial<FiestaEvent> = {}): FiestaEvent {
  return {
    id: 'evt-tz',
    slug: 'tz-fiesta',
    title: 'TZ fiesta',
    template: 'comida',
    meal: 'almuerzo',
    description: 'TZ',
    startsAt: '2026-12-15T19:00:00.000Z',
    endsAt: '2026-12-15T23:00:00.000Z',
    location: 'Quito',
    includes: [],
    agenda: [],
    priceCents: 2500,
    capacity: 8,
    goalCents: 20000,
    minimumCents: 10000,
    confirmed: false,
    collectedCents: 5000,
    confirmedPeople: 2,
    minimumReached: false,
    createdAt: '2026-10-20T00:00:00.000Z',
    fundingStatus: 'open',
    fundingDeadlineAt: DEADLINE,
    ...over,
  };
}

beforeEach(() => {
  process.env.TZ = 'Pacific/Kiritimati'; // UTC+14: a browser day away from Guayaquil.
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.lang = 'es';
  setActiveLocale('es');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (PREVIOUS_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = PREVIOUS_TZ;
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.lang = 'es';
  setActiveLocale('es');
});

describe('event times ignore the browser time zone', () => {
  it('requires the Kiritimati browser zone for this file', () => {
    expect(new Date(DEADLINE).getTimezoneOffset()).toBe(-840);
  });

  it('formats the deadline in America/Guayaquil in both locales', () => {
    expect(formatEventInstant(DEADLINE, 'es')).toContain('(UTC-05:00)');
    expect(formatEventInstant(DEADLINE, 'es')).toMatch(/02:00.*p\.\s?m\./);
    expect(formatEventInstant(DEADLINE, 'en')).toContain('(UTC-05:00)');
    expect(formatEventInstant(DEADLINE, 'en')).toMatch(/02:00\s?PM/);
    // Kiritimati wall time (Dec 16, 09:00) never leaks in.
    expect(formatEventInstant(DEADLINE, 'es')).not.toContain('16');
    expect(formatEventInstant(DEADLINE, 'en')).not.toContain('Dec 16');
    // Invalid input still passes through.
    expect(formatEventInstant('not-a-date')).toBe('not-a-date');
  });

  it('shows the Guayaquil deadline to guests in English', () => {
    localStorage.setItem('fp_locale', 'en');
    render(
      <I18nProvider>
        <FundingStatusPanel event={eventFixture()} audience="guest" paidCents={2000} dueCents={3000} />
      </I18nProvider>
    );
    const panel = screen.getByRole('region', { name: 'Share status' });
    expect(panel.textContent).toContain('$25.00');
    expect(screen.getByText('Paid $20.00. Missing $30.00')).toBeInTheDocument();
    expect(panel.textContent).toMatch(/02:00\s?PM \(UTC-05:00\)/);
    expect(panel.textContent).not.toContain('Dec 16');
    expect(screen.getByText('Progress toward the minimum: 50%')).toBeInTheDocument();
  });

  it('shows the Guayaquil deadline to guests in Spanish', () => {
    render(<FundingStatusPanel event={eventFixture()} audience="guest" paidCents={2000} dueCents={3000} />);
    const panel = screen.getByRole('region', { name: 'Estado de la cuota' });
    expect(screen.getByText('Abonado $20,00. Falta $30,00')).toBeInTheDocument();
    expect(panel.textContent).toMatch(/02:00.*p\.\s?m\. \(UTC-05:00\)/);
    expect(panel.textContent).not.toContain('16 dic');
  });
});
