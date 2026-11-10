import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UI_LABELS } from '@fiestapay/shared';
import { App } from '../App';
import { api } from '../api/client';
import { I18nProvider } from '../i18n/I18nContext';
import { setActiveLocale } from '../i18n/locale-store';
import type { Capabilities, FiestaEvent, Guest } from '../types';

vi.mock('ag-grid-react', () => ({
  AgGridReact: ({ rowData }: { rowData: Array<{ id: string; name: string }> }) => (
    <table data-testid="judge-grid">
      <tbody>
        {rowData.map((row) => (
          <tr key={row.id}>
            <td>{row.name}</td>
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

const labels = UI_LABELS.en;

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
    slug: 'demo-slug',
    title: 'Demo dinner',
    template: 'comida',
    meal: 'almuerzo',
    description: 'Fictional',
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

function guest(over: Partial<Guest> = {}): Guest {
  return {
    id: 'guest-demo',
    name: 'Demo Guest',
    status: 'yes',
    companions: 1,
    paidCents: 0,
    dueCents: 5000,
    ...over,
  };
}

/** Spanish control copy that must never leak into the English tour. */
const SPANISH_WITNESSES = [
  'Crear mi demo privada',
  'Probar pago con PayPal',
  'Hablar con el asistente',
  'Reiniciar mis demos',
  'Datos ficticios',
  'Volver al inicio',
  'Buscar en datos ficticios',
  'Invitados de ejemplo',
  'Mis demos',
  'Mis invitaciones',
  'Recuperar mi enlace',
  'Acompañantes',
  'Estado de pago',
  'Demostración reiniciada',
  '¿Reiniciar',
  'Ver panel de ejemplo',
  'Vista de solo lectura',
  'Cargando tus demos',
  'PayPal: No configurado',
  'Reintentar Conexión',
];

function renderDemo(events: FiestaEvent[]) {
  localStorage.setItem('fp_locale', 'en');
  window.history.replaceState({}, '', '/demo');
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

describe('judges demo in English', () => {
  it('shows the banner, the numbered steps, and no Spanish control copy', async () => {
    renderDemo([]);
    expect(await screen.findByRole('heading', { name: labels.judgesDemo })).toBeInTheDocument();
    expect(screen.getByText('Fictional data · Sandbox · No real money')).toBeInTheDocument();
    expect(screen.getByText(/Look at the sample dashboard/)).toBeInTheDocument();
    expect(screen.getByText(/Try a PayPal Sandbox payment/)).toBeInTheDocument();
    // Step 3 reuses the assistant button label as its own title.
    expect(screen.getAllByText(/Talk to the assistant/)).toHaveLength(2);
    expect(screen.getByRole('button', { name: labels.paymentDemo })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: labels.privateDemo })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: labels.talkToAssistant })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: labels.resetDemos })).toBeInTheDocument();
    // Sample grid rows render without any privileged action.
    expect(screen.getByTestId('judge-grid')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Block|Unblock|Remove|Moderate|WhatsApp/i })).toBeNull();

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);

    const body = document.body.textContent ?? '';
    for (const witness of SPANISH_WITNESSES) {
      expect(body, `leaked: ${witness}`).not.toContain(witness);
    }
  });

  it('runs the payment tour: payment demo, Demo Guest join, yes+1 RSVP, invite', async () => {
    const created = event({ id: 'pay-demo', slug: 'demo-payment', title: 'Demo dinner' }, true);
    const createDemo = vi.spyOn(api, 'createDemo').mockResolvedValue({ event: created, adminKey: 'key-pay' });
    const joinEvent = vi.spyOn(api, 'joinEvent').mockResolvedValue({ guest: guest() });
    const rsvp = vi.spyOn(api, 'rsvp').mockResolvedValue({ guest: guest(), event: created });
    vi.spyOn(api, 'getEventBySlug').mockResolvedValue({ event: created, guest: guest() });
    vi.spyOn(api, 'getQuote').mockResolvedValue({
      quote: {
        id: 'q', guestId: 'guest-demo', people: 2, unitCents: 2500, totalCents: 5000,
        paidCents: 0, amountCents: 5000, summary: '2', expiresAt: '2099-01-01T00:00:00.000Z',
      },
    });
    const createOrder = vi.spyOn(api, 'createOrder');
    renderDemo([]);

    fireEvent.click(await screen.findByRole('button', { name: labels.paymentDemo }));

    await waitFor(() => expect(window.location.pathname).toBe('/e/demo-payment'));
    expect(createDemo).toHaveBeenCalledTimes(1);
    expect(createDemo).toHaveBeenCalledWith('payment');
    expect(localStorage.getItem('fp_admin_demo-payment')).toBe('key-pay');
    expect(sessionStorage.getItem('fp_demo_payment_slug')).toBe('demo-payment');
    expect(joinEvent).toHaveBeenCalledWith('demo-payment', 'Demo Guest');
    expect(rsvp).toHaveBeenCalledWith('demo-payment', 'yes', 1);
    expect(createOrder).not.toHaveBeenCalled();
    // The payment entry opens the invitation, never the owner panel.
    expect(window.location.pathname).not.toContain('/admin');
    expect(await screen.findByRole('button', { name: labels.testAccount })).toBeInTheDocument();
  });

  it('creates the private demo and opens the owner panel', async () => {
    const created = event({ id: 'priv-demo', slug: 'demo-private', title: 'Demo dinner' }, true);
    const createDemo = vi.spyOn(api, 'createDemo').mockResolvedValue({ event: created, adminKey: 'key-priv' });
    vi.spyOn(api, 'getDashboard').mockResolvedValue({ event: created, guests: [], audit: [] });
    vi.spyOn(api, 'getModerationGuests').mockResolvedValue({ guests: [] });
    vi.spyOn(api, 'getModerationConversations').mockResolvedValue({ conversations: [] });
    const createEvent = vi.spyOn(api, 'createEvent');
    renderDemo([]);

    fireEvent.click(await screen.findByRole('button', { name: labels.privateDemo }));

    await waitFor(() => expect(window.location.pathname).toBe('/e/demo-private/admin'));
    expect(createDemo).toHaveBeenCalledTimes(1);
    expect(createDemo).toHaveBeenCalledWith('private');
    expect(createEvent).not.toHaveBeenCalled();
    expect(localStorage.getItem('fp_admin_demo-private')).toBe('key-priv');
  });

  it('opens the assistant orb in the demo context', async () => {
    renderDemo([]);
    fireEvent.click(await screen.findByRole('button', { name: labels.talkToAssistant }));
    expect(await screen.findByRole('dialog', { name: 'FiestaPay agent' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: labels.textTab })).toHaveAttribute('aria-selected', 'true');
  });

  it('lists only isDemo:true rows under My demos', async () => {
    const own = event({ id: 'own-1', slug: 'own-dinner', title: 'Own dinner' });
    const demo = event({ id: 'demo-1', slug: 'demo-row', title: 'Demo row' }, true);
    renderDemo([own, demo]);

    const section = await screen.findByRole('region', { name: labels.myDemos });
    expect(within(section).getByText('Demo row')).toBeInTheDocument();
    expect(within(section).queryByText('Own dinner')).toBeNull();
  });

  it('resets only from /demo behind a confirmation that spares own invitations', async () => {
    const resetDemo = vi.spyOn(api, 'resetDemo').mockResolvedValue({ event: event({}, true), adminKey: null });
    renderDemo([]);
    await screen.findByRole('heading', { name: labels.judgesDemo });

    fireEvent.click(screen.getByRole('button', { name: labels.resetDemos }));
    expect(screen.getByText('Reset my demos?')).toBeInTheDocument();
    expect(screen.getByText(/Your own invitations stay active/)).toBeInTheDocument();
    expect(resetDemo).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Yes, reset my demos' }));
    await waitFor(() => expect(resetDemo).toHaveBeenCalledTimes(1));
    expect(window.location.pathname).toBe('/demo');
    expect(await screen.findByText('Demo reset. Your real invitations stay active.')).toBeInTheDocument();
  });

  it('has no reset entry on the landing', async () => {
    localStorage.setItem('fp_locale', 'en');
    vi.spyOn(api, 'getCapabilities').mockResolvedValue(capabilities);
    vi.spyOn(api, 'getOrganizerEvents').mockResolvedValue({ events: [] });
    render(
      <I18nProvider>
        <App />
      </I18nProvider>
    );
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: labels.resetDemos })).toBeNull();
    expect(screen.queryByRole('button', { name: UI_LABELS.es.resetDemos })).toBeNull();
  });
});
