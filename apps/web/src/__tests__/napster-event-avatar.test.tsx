/**
 * NAP-F6w — «Tu avatar con tu foto»: la sección del panel nunca bloquea (sin
 * avatar listo todos ven a la general), la tool `open_avatar_settings` la
 * resalta y la invitación saluda con el organizador cuando la sesión trae
 * `agent:'custom'`.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NapsterCompanionApiSdk,
  type NapsterCompanionApiConfig,
} from '@touchcastllc/napster-companion-api';
import { I18nProvider } from '../i18n/I18nContext';
import { EventAvatarSection } from '../components/avatar/EventAvatarSection';
import { AVATAR_FLASH_CLASS, createAvatarToolRouter } from '../components/avatar/toolRouter';
import { PublicInviteView } from '../views/PublicInviteView';
import { api } from '../api/client';
import type { Capabilities, FiestaEvent } from '../types';

vi.mock('@touchcastllc/napster-companion-api', () => ({
  NapsterCompanionApiSdk: { init: vi.fn() },
  DataChannelMessageType: { SEND_MESSAGE: 'send_message', FUNCTION_CALL_OUTPUT: 'send_function_output' },
}));

const initMock = vi.mocked(NapsterCompanionApiSdk.init);

const SLUG = 'fiesta-uno';
const ADMIN_KEY = 'clave-panel-123';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  localStorage.setItem('fp_locale', 'es');
  Element.prototype.scrollIntoView = vi.fn();
  initMock.mockImplementation(async (getToken, config) => {
    try {
      await getToken();
    } catch (error) {
      (config as NapsterCompanionApiConfig | undefined)?.onError?.(error as Error);
      throw error;
    }
    return { destroy: vi.fn() } as never;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.clear();
});

function renderSection(slug: string = SLUG): void {
  render(
    <I18nProvider>
      <EventAvatarSection slug={slug} />
    </I18nProvider>,
  );
}

function photoFile(name = 'foto.jpg', type = 'image/jpeg', size = 1024): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe('sección «Tu avatar con tu foto» (NAP-F6w)', () => {
  it('sin marcar la casilla no se puede enviar', async () => {
    vi.spyOn(api, 'getEventAvatar').mockResolvedValue({ status: 'none', firstName: null, ready: false });
    const upload = vi.spyOn(api, 'uploadEventAvatar');
    renderSection();

    const form = await screen.findByTestId('event-avatar-form');
    const submit = within(form).getByTestId('event-avatar-submit');
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(upload).not.toHaveBeenCalled();

    fireEvent.click(within(form).getByRole('checkbox'));
    expect(submit).toBeEnabled();
  });

  it('rechaza en el navegador lo que no es imagen y lo que supera 5 MB', async () => {
    vi.spyOn(api, 'getEventAvatar').mockResolvedValue({ status: 'none', firstName: null, ready: false });
    const upload = vi.spyOn(api, 'uploadEventAvatar');
    renderSection();

    const form = await screen.findByTestId('event-avatar-form');
    const photo = within(form).getByLabelText('Tu foto (JPG o PNG, máx. 5 MB)');

    fireEvent.change(photo, { target: { files: [new File(['hola'], 'nota.txt', { type: 'text/plain' })] } });
    expect(await within(form).findByTestId('event-avatar-field-error')).toHaveTextContent(
      'Solo se aceptan fotos JPG o PNG.',
    );

    fireEvent.change(photo, { target: { files: [photoFile('grande.jpg', 'image/jpeg', 5 * 1024 * 1024 + 1)] } });
    expect(await within(form).findByTestId('event-avatar-field-error')).toHaveTextContent(
      'La foto supera los 5 MB. Elige una más pequeña.',
    );
    expect(upload).not.toHaveBeenCalled();
    expect(screen.queryByTestId('event-avatar-preview')).toBeNull();
  });

  it('el envío manda consent, firstName y dataURL con la clave del panel', async () => {
    localStorage.setItem(`fp_admin_${SLUG}`, ADMIN_KEY);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (init?.method === 'POST') {
        return jsonResponse({ status: 'generating', firstName: 'Ana', ready: false });
      }
      return jsonResponse({ status: 'none', firstName: null, ready: false });
    });
    renderSection();

    const form = await screen.findByTestId('event-avatar-form');
    fireEvent.change(within(form).getByLabelText('Tu nombre'), { target: { value: 'Ana' } });
    fireEvent.change(within(form).getByLabelText('Tu foto (JPG o PNG, máx. 5 MB)'), {
      target: { files: [photoFile()] },
    });
    expect(await within(form).findByTestId('event-avatar-preview')).toBeInTheDocument();
    fireEvent.click(within(form).getByRole('checkbox'));
    fireEvent.click(within(form).getByTestId('event-avatar-submit'));

    expect(await screen.findByText(/Generando tu avatar/)).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(post?.[0]).toBe(`/api/events/${SLUG}/avatar`);
    const headers = post?.[1]?.headers as Headers;
    expect(headers.get('X-Fiesta-Admin-Key')).toBe(ADMIN_KEY);
    const body = JSON.parse(String(post?.[1]?.body)) as { consent: boolean; firstName: string; photo: string };
    expect(body.consent).toBe(true);
    expect(body.firstName).toBe('Ana');
    expect(body.photo.startsWith('data:image/jpeg;base64,')).toBe(true);
  });

  it('consulta cada 10 s y celebra al quedar listo', async () => {
    vi.useFakeTimers();
    const get = vi
      .spyOn(api, 'getEventAvatar')
      .mockResolvedValueOnce({ status: 'generating', firstName: 'Ana', ready: false })
      .mockResolvedValue({ status: 'ready', firstName: 'Ana', ready: true });
    renderSection();

    await vi.advanceTimersByTimeAsync(0);
    expect(screen.getByText(/Generando tu avatar/)).toBeInTheDocument();
    expect(screen.getByText(/mientras tanto tus invitados ven a la avatar general/)).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(screen.getByText('¡Listo! Tus invitados te verán a ti')).toBeInTheDocument();
    expect(screen.getByTestId('event-avatar-back')).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('volver al avatar general pide confirmación y muestra el formulario', async () => {
    vi.spyOn(api, 'getEventAvatar').mockResolvedValue({ status: 'ready', firstName: 'Ana', ready: true });
    const remove = vi.spyOn(api, 'deleteEventAvatar').mockResolvedValue(undefined);
    renderSection();

    expect(await screen.findByText('¡Listo! Tus invitados te verán a ti')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('event-avatar-back'));
    expect(screen.getByText(/Se borrará tu avatar con foto/)).toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('event-avatar-confirm-delete'));
    expect(await screen.findByTestId('event-avatar-form')).toBeInTheDocument();
    expect(screen.getByTestId('event-avatar-notice')).toHaveTextContent(
      'Listo: tus invitados vuelven a ver a la avatar general.',
    );
    expect(remove).toHaveBeenCalledWith(SLUG);
  });

  it('open_avatar_settings resalta la sección del panel', async () => {
    vi.spyOn(api, 'getEventAvatar').mockResolvedValue({ status: 'none', firstName: null, ready: false });
    renderSection();
    await screen.findByTestId('event-avatar-form');

    const tool = createAvatarToolRouter({ visitor: 'creator', navigateTo: vi.fn() });
    const output = await tool.route({ call_id: 'f6w-1', name: 'open_avatar_settings', arguments: {} });

    expect(output).toEqual({ ok: true });
    expect(document.getElementById('event-avatar-section')).toHaveClass(AVATAR_FLASH_CLASS);
  });
});

describe('saludo con avatar personalizado (NAP-F6w)', () => {
  it('la invitación dice «Te recibe…» cuando la sesión trae agent custom', async () => {
    const event = {
      id: 'event-1',
      slug: SLUG,
      title: 'Cumpleaños de Ana',
      template: 'comida',
      meal: 'cena',
      description: 'Fiesta',
      startsAt: '2026-11-01T20:00:00Z',
      location: 'Quito',
      includes: ['Comida'],
      priceCents: 2000,
      capacity: 20,
      goalCents: 40000,
      minimumCents: 20000,
      agenda: [],
      confirmed: false,
      collectedCents: 0,
      confirmedPeople: 1,
      minimumReached: false,
      createdAt: '2026-10-15T00:00:00Z',
      organizerName: 'María',
    } as FiestaEvent;
    const capabilities: Capabilities = {
      paypal: false,
      paypalClientId: null,
      paymentProvider: 'paypal_sandbox',
      sandbox: true,
      email: false,
      avatar: true,
    };
    vi.spyOn(api, 'getEventBySlug').mockResolvedValue({ event, guest: null });
    vi.spyOn(api, 'createAvatarSession').mockResolvedValue({
      token: 'napster-token',
      handle: '123e4567-e89b-12d3-a456-426614174000',
      visitor: 'guest',
      lang: 'es',
      agent: 'custom',
    });
    render(
      <I18nProvider>
        <PublicInviteView
          slug={SLUG}
          capabilities={capabilities}
          onShowToast={vi.fn()}
          onNavigateHome={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(await screen.findByText('María te invita.')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('napster-avatar-start'));
    expect(await screen.findByText('Te recibe María')).toBeInTheDocument();
    expect(screen.queryByText('María te invita.')).toBeNull();
  });
});
