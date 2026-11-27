/**
 * NAP-F4 — creador en el legado: avatar con intent create en /create y en la
 * portada del legado, eventSlug y clave en el panel, y botón «Organizar una
 * reunión» en la raíz. SDK mockeado; sin red real.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NapsterCompanionApiSdk } from '@touchcastllc/napster-companion-api';
import { I18nProvider } from '../i18n/I18nContext';
import { api } from '../api/client';
import { legacyCreateUrl } from '../lib/app-host';
import { CreateWizard } from '../components/events/CreateWizard';
import { LandingView } from '../views/LandingView';
import { OrganizerDashboardView } from '../views/OrganizerDashboardView';
import { PortalLandingView } from '../views/PortalLandingView';
import type { Dashboard, FiestaEvent } from '../types';

vi.mock('@touchcastllc/napster-companion-api', () => ({
  NapsterCompanionApiSdk: { init: vi.fn() },
  DataChannelMessageType: { SEND_MESSAGE: 'send_message', FUNCTION_CALL_OUTPUT: 'send_function_output' },
}));

const initMock = vi.mocked(NapsterCompanionApiSdk.init);

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const SESSION = {
  token: 'tok-legado-1',
  handle: '123e4567-e89b-12d3-a456-426614174000',
  visitor: 'creator',
  lang: 'es',
  agent: 'default',
};

function inviteEvent(): FiestaEvent {
  return {
    id: 'evt-asado',
    slug: 'asado-pana',
    title: 'Asado pana',
    template: 'comida',
    meal: 'almuerzo',
    description: 'Asado de prueba',
    startsAt: '2026-12-15T19:00:00.000Z',
    endsAt: '2026-12-15T23:00:00.000Z',
    location: 'Quito',
    includes: [],
    agenda: [],
    priceCents: 2500,
    capacity: 8,
    goalCents: 20000,
    minimumCents: null,
    confirmed: false,
    collectedCents: 0,
    confirmedPeople: 0,
    minimumReached: false,
    createdAt: '2026-10-20T00:00:00.000Z',
    fundingStatus: 'open',
    paymentProvider: 'paypal_sandbox',
  };
}

describe('NapsterAvatar creador en el legado (NAP-F4)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    fetchMock.mockReset();
    localStorage.clear();
    vi.stubGlobal('fetch', fetchMock);
    Element.prototype.scrollIntoView = vi.fn();
    initMock.mockImplementation(async (getToken, config) => {
      try {
        await getToken();
      } catch (error) {
        config?.onError?.(error as Error);
        throw error;
      }
      return { destroy: vi.fn(), sendCommand: vi.fn() } as never;
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('/create pide la sesión con intent create', async () => {
    fetchMock.mockResolvedValue(jsonResponse(SESSION, 200));
    render(
      <I18nProvider>
        <CreateWizard onSubmit={vi.fn()} onCancel={vi.fn()} isLoading={false} />
      </I18nProvider>,
    );
    expect(screen.getByTestId('napster-avatar')).toBeTruthy();
    fireEvent.click(screen.getByTestId('napster-avatar-start'));
    await waitFor(() => expect(initMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ lang: 'es', intent: 'create' });
  });

  it('la portada del legado pide la sesión con intent create', async () => {
    fetchMock.mockResolvedValue(jsonResponse(SESSION, 200));
    render(
      <I18nProvider>
        <LandingView
          events={[]}
          isLoading={false}
          onNavigateCreate={vi.fn()}
          onNavigateInvite={vi.fn()}
          onNavigateDashboard={vi.fn()}
          onNavigateDemo={vi.fn()}
          onNavigateRecover={vi.fn()}
        />
      </I18nProvider>,
    );
    expect(screen.getByTestId('napster-avatar')).toBeTruthy();
    fireEvent.click(screen.getByTestId('napster-avatar-start'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ lang: 'es', intent: 'create' });
  });

  it('el panel manda eventSlug y la clave de organizador en la cabecera', async () => {
    localStorage.setItem('fp_admin_asado-pana', 'clave-panel-1');
    const data: Dashboard = { event: { ...inviteEvent(), goalCents: 10000, minimumCents: 5000, minimumReached: true }, guests: [], audit: [] };
    vi.spyOn(api, 'getDashboard').mockResolvedValue(data);
    fetchMock.mockResolvedValue(jsonResponse({ ...SESSION, visitor: 'creator' }, 200));
    render(
      <OrganizerDashboardView
        slug="asado-pana"
        capabilities={null}
        onNavigateInvite={vi.fn()}
        onNavigateHome={vi.fn()}
        onShowToast={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByTestId('napster-avatar-start'));
    await waitFor(() =>
      expect(fetchMock.mock.calls.map((call) => call[0])).toContain('/api/avatar-session'),
    );
    const sessionCall = fetchMock.mock.calls.find((call) => call[0] === '/api/avatar-session');
    expect(sessionCall).toBeTruthy();
    const [, init] = sessionCall as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ lang: 'es', eventSlug: 'asado-pana' });
    expect((init.headers as Headers).get('X-Fiesta-Admin-Key')).toBe('clave-panel-1');
  });

  it('sin clave guardada la sesión sale sin cabecera de organizador', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(SESSION, 200));
    await api.createAvatarSession({ lang: 'es', eventSlug: 'asado-pana' });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Headers).get('X-Fiesta-Admin-Key')).toBeNull();
    localStorage.setItem('fp_admin_asado-pana', 'clave-panel-1');
    await api.createAvatarSession({ lang: 'es', eventSlug: 'asado-pana' });
    const [, withKey] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect((withKey.headers as Headers).get('X-Fiesta-Admin-Key')).toBe('clave-panel-1');
  });

  it('legacyCreateUrl apunta al legado en producción y al mismo origen en desarrollo', () => {
    expect(legacyCreateUrl('somospanas.com')).toBe('https://fiestapay.somospanas.com/create');
    expect(legacyCreateUrl('www.somospanas.com')).toBe('https://fiestapay.somospanas.com/create');
    expect(legacyCreateUrl('fiestapay.somospanas.com')).toBe('https://fiestapay.somospanas.com/create');
    expect(legacyCreateUrl('grupo.somospanas.com')).toBe('https://fiestapay.somospanas.com/create');
    expect(legacyCreateUrl('localhost')).toBe('/create');
    expect(legacyCreateUrl('127.0.0.1')).toBe('/create');
  });

  it('la portada raíz enlaza «Organizar una reunión» al /create legado', async () => {
    vi.spyOn(api, 'getPortalEvents').mockResolvedValue({ events: [] });
    render(
      <I18nProvider>
        <PortalLandingView onNavigateLogin={vi.fn()} onNavigateRegister={vi.fn()} />
      </I18nProvider>,
    );
    const link = await screen.findByTestId('portal-organize-meeting');
    expect(link.textContent).toContain('Organizar una reunión');
    // jsdom corre en localhost: mismo origen en desarrollo.
    expect(link.getAttribute('href')).toBe('/create');
  });
});
