/**
 * NAP-U4 — enrutado por host-info, dirección libre y aviso reservado.
 * App real con el cliente host-info mockeado; sin red.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HostInfo } from '@fiestapay/shared';
import { I18nProvider } from '../i18n/I18nContext';
import { App } from '../App';
import { api } from '../api/client';

const { fetchHostInfoMock } = vi.hoisted(() => ({ fetchHostInfoMock: vi.fn() }));

vi.mock('../lib/app-host', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/app-host')>();
  return {
    ...actual,
    readAppHostContext: () => ({ kind: 'somospanas-root' as const, isSiteHost: false, slug: null }),
  };
});

vi.mock('../api/client', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../api/client')>();
  return {
    ...mod,
    api: {
      ...mod.api,
      getCapabilities: vi.fn().mockResolvedValue({
        paypal: false,
        paypalClientId: null,
        paymentProvider: 'none',
        sandbox: true,
        email: false,
        avatar: false,
      }),
      getOrganizerEvents: vi.fn().mockResolvedValue({ events: [] }),
      getEventBySlug: vi.fn().mockResolvedValue({
        event: {
          id: 'evt-u4',
          slug: 'cumple-host',
          title: 'Cumple de María',
          template: 'casa',
          meal: 'cena',
          description: 'Una reunión para celebrar.',
          startsAt: '2026-12-15T19:00:00.000Z',
          endsAt: '2026-12-15T23:00:00.000Z',
          location: 'Quito',
          includes: [],
          agenda: [],
          priceCents: 1500,
          capacity: 12,
          goalCents: null,
          minimumCents: null,
          confirmed: false,
          collectedCents: 0,
          confirmedPeople: 0,
          minimumReached: false,
          createdAt: '2026-10-20T00:00:00Z',
          paymentProvider: 'none',
        },
        guest: null,
      }),
    },
  };
});

vi.mock('../api/host-info', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/host-info')>();
  return {
    ...actual,
    shouldReadHostInfo: () => true,
    fetchHostInfo: fetchHostInfoMock,
  };
});

function renderApp() {
  return render(
    <I18nProvider>
      <App />
    </I18nProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('fp_locale', 'es');
  window.history.replaceState({}, '', '/');
  fetchHostInfoMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('host-info en la SPA (NAP-U4)', () => {
  it('un host de evento muestra su invitación en «/»', async () => {
    fetchHostInfoMock.mockResolvedValue({ kind: 'event', slug: 'cumple-host', subdomain: 'cumple' } satisfies HostInfo);
    renderApp();
    expect(await screen.findByText('Cumple de María')).toBeInTheDocument();
    expect(api.getEventBySlug).toHaveBeenCalledWith('cumple-host');
  });

  it('una dirección libre muestra la vista y el enlace codificado', async () => {
    fetchHostInfoMock.mockResolvedValue({ kind: 'free', label: 'cumple de maría' } satisfies HostInfo);
    renderApp();
    expect(await screen.findByText('Esta dirección está libre')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Créala conversando/i });
    expect(link).toHaveAttribute(
      'href',
      'https://somospanas.com/create?subdominio=cumple%20de%20mar%C3%ADa',
    );
  });

  it('una dirección reservada muestra la 404 de U2', async () => {
    fetchHostInfoMock.mockResolvedValue({ kind: 'reserved', label: 'admin' } satisfies HostInfo);
    renderApp();
    expect(await screen.findByTestId('not-found')).toBeInTheDocument();
  });
});
