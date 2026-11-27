/**
 * NAP-F4w — saludos de invitado y creador: montaje en vistas, eventSlug,
 * degradación 404→público, intent de creación y rellenos sin envío. SDK
 * mockeado; sin red real.
 */
import React, { act } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NapsterCompanionApiSdk,
  type NapsterCompanionApiConfig,
  type NapsterCompanionApiInstance,
} from '@touchcastllc/napster-companion-api';
import { UI_LABELS } from '@fiestapay/shared';
import { I18nProvider } from '../i18n/I18nContext';
import { api } from '../api/client';
import { NapsterAvatar } from '../components/avatar/NapsterAvatar';
import { createAvatarToolRouter } from '../components/avatar/toolRouter';
import { consumeCreateIntent } from '../components/avatar/sessionIntent';
import { PublicInviteView } from '../views/PublicInviteView';
import { OrganizerDashboardView } from '../views/OrganizerDashboardView';
import { CreateWizard } from '../components/events/CreateWizard';
import { ReminderDrafts } from '../components/dashboard/ReminderDrafts';
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
  token: 'tok-visita-1',
  handle: '123e4567-e89b-12d3-a456-426614174000',
  visitor: 'guest',
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

describe('NapsterAvatar invitado y creador (NAP-F4w)', () => {
  const fetchMock = vi.fn();
  const sendBeacon = vi.fn();
  let capturedConfig: NapsterCompanionApiConfig | null = null;
  const fakeInstance = {
    destroy: vi.fn(),
    sendCommand: vi.fn(),
  } as unknown as NapsterCompanionApiInstance;

  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    fetchMock.mockReset();
    sendBeacon.mockReset();
    consumeCreateIntent();
    capturedConfig = null;
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(window.navigator, 'sendBeacon', { value: sendBeacon, configurable: true });
    sendBeacon.mockReturnValue(true);
    Element.prototype.scrollIntoView = vi.fn();
    initMock.mockImplementation(async (getToken, config) => {
      capturedConfig = config ?? null;
      try {
        await getToken();
      } catch (error) {
        config?.onError?.(error as Error);
        throw error;
      }
      return fakeInstance;
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    Object.defineProperty(window.navigator, 'sendBeacon', { value: undefined, configurable: true });
  });

  it('el invitado ve su saludo y la sesión se pide con eventSlug', async () => {
    fetchMock.mockResolvedValue(jsonResponse(SESSION, 200));
    render(
      <I18nProvider>
        <NapsterAvatar eventSlug="asado-pana" eventTitle="Asado pana" />
      </I18nProvider>,
    );
    expect(screen.getByText('Te invitaron a Asado pana')).toBeTruthy();
    fireEvent.click(screen.getByTestId('napster-avatar-start'));
    await waitFor(() => expect(initMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ lang: 'es', eventSlug: 'asado-pana' });
  });

  it('404 event_not_found cae al saludo público sin revelar nada', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: 'event_not_found' }, 404))
      .mockResolvedValueOnce(jsonResponse({ ...SESSION, visitor: 'public' }, 200));
    render(
      <I18nProvider>
        <NapsterAvatar eventSlug="no-existe" eventTitle="Evento viejo" />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByTestId('napster-avatar-start'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [, first] = fetchMock.mock.calls[0] as [string, RequestInit];
    const [, second] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(first.body as string)).toEqual({ lang: 'es', eventSlug: 'no-existe' });
    expect(JSON.parse(second.body as string)).toEqual({ lang: 'es' });
    act(() => {
      capturedConfig?.onAvatarReady?.(true);
    });
    await screen.findByTestId('napster-avatar-end');
    // Al terminar, la bienvenida ya es la pública, sin el nombre del evento.
    fireEvent.click(screen.getByTestId('napster-avatar-end'));
    await screen.findByTestId('napster-avatar-start');
    expect(screen.getByText('Hola, soy tu pana guía de Somos Panas')).toBeTruthy();
    expect(screen.queryByText(/Evento viejo/)).toBeNull();
  });

  it('tras pulsar «Crear un nuevo espacio», la sesión lleva intent:create', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...SESSION, visitor: 'creator' }, 200));
    render(
      <I18nProvider>
        <div>
          <button type="button" data-testid="portal-create-space">
            Crear
          </button>
          <NapsterAvatar />
        </div>
      </I18nProvider>,
    );
    fireEvent.click(screen.getByTestId('portal-create-space'));
    fireEvent.click(screen.getByTestId('napster-avatar-start'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ lang: 'es', intent: 'create' });
  });

  it('la página de evento monta la avatar con el nombre del evento', async () => {
    vi.spyOn(api, 'getEventBySlug').mockResolvedValue({ event: inviteEvent(), guest: null });
    render(
      <I18nProvider>
        <PublicInviteView slug="asado-pana" capabilities={null} onShowToast={vi.fn()} onNavigateHome={vi.fn()} />
      </I18nProvider>,
    );
    expect(await screen.findByTestId('napster-avatar')).toBeTruthy();
    expect(screen.getByText('Te invitaron a Asado pana')).toBeTruthy();
    expect(initMock).not.toHaveBeenCalled();
  });

  it('el panel del organizador monta la avatar del creador', async () => {
    const data: Dashboard = {
      event: {
        ...inviteEvent(),
        goalCents: 10000,
        minimumCents: 5000,
        minimumReached: true,
      },
      guests: [],
      audit: [],
    };
    vi.spyOn(api, 'getDashboard').mockResolvedValue(data);
    render(<OrganizerDashboardView slug="asado-pana" capabilities={null} onNavigateInvite={vi.fn()} onNavigateHome={vi.fn()} onShowToast={vi.fn()} />);
    expect(await screen.findByTestId('napster-avatar')).toBeTruthy();
    expect(initMock).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.map((call) => call[0])).not.toContain('/api/avatar-session');
  });

  it('fill_event_draft rellena el formulario real sin enviarlo ni publicarlo', async () => {
    const createEvent = vi.spyOn(api, 'createEvent');
    const navigateTo = vi.fn();
    const tool = createAvatarToolRouter({ visitor: 'creator', navigateTo });
    const output = await tool.route({
      call_id: 'w1',
      name: 'fill_event_draft',
      arguments: {
        title: 'Asado pana',
        startsAt: '2026-12-01T18:30',
        place: 'Quito',
        description: 'Traigan hambre',
      },
    });
    expect(output).toEqual({ ok: true });
    expect(navigateTo).toHaveBeenCalledWith('/create');
    const onSubmit = vi.fn();
    render(
      <I18nProvider>
        <CreateWizard onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />
      </I18nProvider>,
    );
    // El borrador aterriza en el resumen editable con los cuatro valores.
    expect(screen.getAllByText('Asado pana').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Quito').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Traigan hambre').length).toBeGreaterThan(0);
    // Editar abre el paso con el campo relleno; se avanza sin publicar.
    fireEvent.click(screen.getByRole('button', { name: 'Editar Título' }));
    expect((document.getElementById('event-title') as HTMLInputElement).value).toBe('Asado pana');
    fireEvent.click(screen.getByRole('button', { name: UI_LABELS.es.saveAndContinue }));
    expect((document.querySelector('input[type="date"]') as HTMLInputElement).value).toBe('2026-12-01');
    expect((document.querySelector('input[type="time"]') as HTMLInputElement).value).toBe('18:30');
    fireEvent.click(screen.getByRole('button', { name: UI_LABELS.es.saveAndContinue }));
    expect((document.getElementById('event-location') as HTMLInputElement).value).toBe('Quito');
    expect((document.getElementById('event-desc') as HTMLTextAreaElement).value).toBe('Traigan hambre');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(createEvent).not.toHaveBeenCalled();
  });

  it('draft_reminder rellena el campo general sin enviar nada', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(
      <I18nProvider>
        <ReminderDrafts slug="asado-pana" />
      </I18nProvider>,
    );
    expect(screen.queryByTestId('reminder-avatar-note')).toBeNull();
    const tool = createAvatarToolRouter({ visitor: 'creator', navigateTo: vi.fn() });
    const output = await tool.route({
      call_id: 'w2',
      name: 'draft_reminder',
      arguments: { text: 'Recuerden el asado del sábado' },
    });
    expect(output).toEqual({ ok: true });
    expect(await screen.findByTestId('reminder-avatar-note')).toBeTruthy();
    expect((screen.getByTestId('reminder-avatar-text') as HTMLTextAreaElement).value).toBe(
      'Recuerden el asado del sábado',
    );
    expect(screen.getByTestId('reminder-avatar-copy')).toBeTruthy();
    expect(screen.getByTestId('reminder-avatar-whatsapp')).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('la vista de recordatorios consume el pendiente al montar', async () => {
    const tool = createAvatarToolRouter({ visitor: 'creator', navigateTo: vi.fn() });
    document.body.innerHTML = '<section class="reminder-drafts panel"></section>';
    await tool.route({ call_id: 'w3', name: 'draft_reminder', arguments: { text: 'Aviso previo' } });
    cleanup();
    render(
      <I18nProvider>
        <ReminderDrafts slug="asado-pana" />
      </I18nProvider>,
    );
    expect(await screen.findByTestId('reminder-avatar-note')).toBeTruthy();
    expect((screen.getByTestId('reminder-avatar-text') as HTMLTextAreaElement).value).toBe('Aviso previo');
  });

  it('un invitado no ejecuta fill_event_draft aunque se lo pidan (not_allowed)', async () => {
    const createEvent = vi.spyOn(api, 'createEvent');
    const tool = createAvatarToolRouter({ visitor: 'guest', navigateTo: vi.fn() });
    const output = await tool.route({
      call_id: 'w4',
      name: 'fill_event_draft',
      arguments: { title: 'X', startsAt: '2026-12-01T18:00' },
    });
    expect(output).toEqual({ ok: false, error: 'not_allowed' });
    expect(createEvent).not.toHaveBeenCalled();
  });
});
