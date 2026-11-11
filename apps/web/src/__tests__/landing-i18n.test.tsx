import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UI_LABELS } from '@fiestapay/shared';
import { App } from '../App';
import { api } from '../api/client';
import { I18nProvider } from '../i18n/I18nContext';
import { setActiveLocale } from '../i18n/locale-store';
import type { Capabilities, FiestaEvent } from '../types';

vi.mock('../components/assistant/AssistantOrb', () => ({
  AssistantOrb: ({ audience }: { audience: string }) => (
    <div data-testid="assistant-orb" data-audience={audience} />
  ),
}));

const capabilities: Capabilities = {
  paypal: true,
  paypalClientId: 'sb-client',
  chat: false,
  voice: false,
  sandbox: true,
  email: true,
};

function event(over: Partial<FiestaEvent> = {}, isDemo?: boolean): FiestaEvent {
  const base: FiestaEvent = {
    id: `event-${Math.random().toString(36).slice(2, 8)}`,
    slug: 'cena-propia',
    title: 'Cena propia',
    template: 'comida',
    meal: 'cena',
    description: 'Nuestra cena',
    startsAt: '2026-12-15T19:00:00.000Z',
    endsAt: '2026-12-15T23:00:00.000Z',
    location: 'Quito',
    includes: [],
    agenda: [],
    priceCents: 2500,
    capacity: 8,
    goalCents: 20000,
    minimumCents: 5000,
    confirmed: false,
    collectedCents: 0,
    confirmedPeople: 0,
    minimumReached: false,
    createdAt: '2026-11-01T00:00:00.000Z',
    ...over,
  };
  return (isDemo === undefined ? base : { ...base, isDemo }) as FiestaEvent;
}

/** Phrases that would imply real money anywhere on the landing. */
const REAL_MONEY_WITNESSES = [
  'dinero de verdad',
  'pago real',
  'cobro real',
  'se cobrará',
  'te cobraremos',
  'real payment',
  'real money will',
  'you will be charged',
  'actual charge',
];

function renderLanding(locale: 'es' | 'en', events: FiestaEvent[]) {
  localStorage.setItem('fp_locale', locale);
  vi.spyOn(api, 'getCapabilities').mockResolvedValue(capabilities);
  vi.spyOn(api, 'getOrganizerEvents').mockResolvedValue({ events });
  render(
    <I18nProvider>
      <App />
    </I18nProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
  document.documentElement.lang = 'es';
  setActiveLocale('es');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
  document.documentElement.lang = 'es';
  setActiveLocale('es');
});

describe.each(['es', 'en'] as const)('product landing (%s)', (locale) => {
  const labels = UI_LABELS[locale];

  it('shows one h1, both CTAs, the use cases, and the sandbox badge', async () => {
    renderLanding(locale, []);
    const headings = await screen.findAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: labels.createInvitation }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: labels.judgesDemo }).length).toBeGreaterThan(0);
    expect(screen.getByText(labels.sandboxBadge)).toBeInTheDocument();
    expect(screen.getByTestId('assistant-orb')).toHaveAttribute('data-audience', 'public');

    const body = document.body.textContent ?? '';
    for (const witness of REAL_MONEY_WITNESSES) {
      expect(body).not.toContain(witness);
    }
  });

  it('routes the main CTA and the use cases to /create and the demo CTA to /demo', async () => {
    const { landingCatalog } = await import('../i18n/catalogs/landing');
    renderLanding(locale, []);
    fireEvent.click((await screen.findAllByRole('button', { name: labels.createInvitation }))[0]!);
    expect(window.location.pathname).toBe('/create');

    fireEvent.click(screen.getByRole('button', { name: labels.myInvitations }));
    expect(window.location.pathname).toBe('/');

    fireEvent.click(screen.getByRole('button', { name: landingCatalog[locale].useCaseSchool }));
    expect(window.location.pathname).toBe('/create');

    fireEvent.click(screen.getByRole('button', { name: labels.myInvitations }));
    fireEvent.click((await screen.findAllByRole('button', { name: labels.judgesDemo }))[0]!);
    expect(window.location.pathname).toBe('/demo');
  });

  it('offers the three bounded creation paths and keeps the path in the URL', async () => {
    const { landingCatalog } = await import('../i18n/catalogs/landing');
    const copy = landingCatalog[locale];
    renderLanding(locale, []);
    await screen.findAllByRole('heading', { level: 1 });

    fireEvent.click(screen.getByRole('button', { name: copy.pathSentence }));
    expect(window.location.pathname).toBe('/create');
    expect(window.location.search).toBe('?path=sentence');

    fireEvent.click(screen.getByRole('button', { name: labels.myInvitations }));
    fireEvent.click(screen.getByRole('button', { name: copy.pathInterview }));
    expect(window.location.search).toBe('?path=interview');

    fireEvent.click(screen.getByRole('button', { name: labels.myInvitations }));
    fireEvent.click(screen.getByRole('button', { name: copy.pathManual }));
    expect(window.location.search).toBe('?path=manual');
  });

  it('lists only own invitations and keeps the panel/recovery behavior', async () => {
    const own = event({ id: 'own-1', slug: 'cena-propia', title: 'Cena propia' });
    const legacy = event({ id: 'legacy-1', slug: 'viaje-viejo', title: 'Viaje viejo', template: 'viaje' });
    const demo = event({ id: 'demo-1', slug: 'demo-x', title: 'Demo X' }, true);
    localStorage.setItem('fp_admin_cena-propia', 'clave-propia');
    renderLanding(locale, [own, legacy, demo]);

    const section = await screen.findByRole('region', { name: labels.myInvitations });
    expect(within(section).getByText('Cena propia')).toBeInTheDocument();
    // Rows saved before the flag existed count as own and are not migrated.
    expect(within(section).getByText('Viaje viejo')).toBeInTheDocument();
    expect(within(section).queryByText('Demo X')).toBeNull();
    expect(within(section).getByRole('button', { name: labels.recoverLink })).toBeInTheDocument();

    fireEvent.click(within(section).getByRole('button', { name: labels.recoverLink }));
    expect(window.location.pathname).toBe('/recover');
  });

  it('shows the money in the locale format', async () => {
    renderLanding(locale, [event({ id: 'own-2', slug: 'cena-quito', title: 'Cena Quito' })]);
    const section = await screen.findByRole('region', { name: labels.myInvitations });
    expect(within(section).getByText(locale === 'es' ? 'Cuota $25,00' : 'Share $25.00')).toBeInTheDocument();
  });

  it('offers a visible persistent language selector', async () => {
    renderLanding(locale, []);
    const select = (await screen.findByLabelText(labels.languageSelector)) as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    expect(select.value).toBe(locale);
    const options = Array.from(select.querySelectorAll('option')).map((option) => option.textContent);
    expect(options).toEqual(['Español', 'English']);
  });
});
