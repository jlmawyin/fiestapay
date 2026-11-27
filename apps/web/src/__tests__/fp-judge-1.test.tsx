import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UI_LABELS } from '@fiestapay/shared';
import { App } from '../App';
import { api } from '../api/client';
import { I18nProvider, useI18n } from '../i18n/I18nContext';
import { setActiveLocale } from '../i18n/locale-store';
import { CreateEventView } from '../views/CreateEventView';
import { OrganizerDashboardView } from '../views/OrganizerDashboardView';
import { PublicInviteView } from '../views/PublicInviteView';
import { orderStatusLabel } from '../lib/order-status';
import type { Capabilities, Dashboard, FiestaEvent, Guest } from '../types';

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

// NAP-F5b: sin orbe; la avatar Napster real monta en reposo sin red.

const capabilities: Capabilities = {
  paypal: true,
  paypalClientId: 'sb-client',
  chat: false,
  voice: false,
  sandbox: true,
  email: true,
  avatar: true,
};

function setBrowser(language: string, languages: string[]): void {
  Object.defineProperty(window.navigator, 'language', {
    value: language,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(window.navigator, 'languages', {
    value: languages,
    configurable: true,
    writable: true,
  });
}

function LocaleProbe(): React.ReactElement {
  const { locale } = useI18n();
  return <span data-testid="locale">{locale}</span>;
}

function eventFixture(over: Partial<FiestaEvent> = {}): FiestaEvent {
  return {
    id: 'evt-judge-1',
    slug: 'sunday-lunch',
    title: 'Sunday lunch',
    template: 'comida',
    meal: 'almuerzo',
    description: 'A relaxed test lunch',
    startsAt: '2026-12-15T19:00:00.000Z',
    endsAt: '2026-12-15T23:00:00.000Z',
    location: 'Main hall',
    includes: ['Starter', 'Main course'],
    agenda: [],
    priceCents: 1500,
    capacity: 10,
    goalCents: 15000,
    minimumCents: null,
    confirmed: false,
    collectedCents: 0,
    confirmedPeople: 0,
    minimumReached: false,
    createdAt: '2026-11-01T00:00:00.000Z',
    ...over,
  };
}

function guestFixture(over: Partial<Guest> = {}): Guest {
  return {
    id: 'guest-judge-1',
    name: 'TestGuest',
    status: 'maybe',
    companions: 0,
    paidCents: 0,
    dueCents: 0,
    ...over,
  };
}

function dashboardFixture(): Dashboard {
  return {
    event: eventFixture(),
    guests: [guestFixture({ status: 'yes', companions: 1, paidCents: 1500, dueCents: 1500 })],
    payments: [
      { orderId: 'ORD-1', guestName: 'TestGuest', amountCents: 1500, status: 'captured', createdAt: '2026-10-25T10:00:00Z' },
    ],
    audit: [],
  };
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

describe('FP-JUDGE-1 language detection', () => {
  it('uses the browser language when no preference is stored', () => {
    setBrowser('en-US', ['en-US', 'en']);
    render(
      <I18nProvider>
        <LocaleProbe />
      </I18nProvider>
    );
    expect(screen.getByTestId('locale')).toHaveTextContent('en');
    cleanup();

    setBrowser('es-ES', ['es-ES', 'es']);
    render(
      <I18nProvider>
        <LocaleProbe />
      </I18nProvider>
    );
    expect(screen.getByTestId('locale')).toHaveTextContent('es');
  });

  it('prefers the stored choice over the browser language', () => {
    localStorage.setItem('fp_locale', 'es');
    setBrowser('en-US', ['en-US']);
    render(
      <I18nProvider>
        <LocaleProbe />
      </I18nProvider>
    );
    expect(screen.getByTestId('locale')).toHaveTextContent('es');
    cleanup();

    localStorage.setItem('fp_locale', 'en');
    setBrowser('es-ES', ['es-ES']);
    render(
      <I18nProvider>
        <LocaleProbe />
      </I18nProvider>
    );
    expect(screen.getByTestId('locale')).toHaveTextContent('en');
  });

  it('prefers ?lang over the stored choice and the browser', () => {
    localStorage.setItem('fp_locale', 'es');
    setBrowser('es-ES', ['es-ES']);
    window.history.replaceState({}, '', '/?lang=en');
    render(
      <I18nProvider>
        <LocaleProbe />
      </I18nProvider>
    );
    expect(screen.getByTestId('locale')).toHaveTextContent('en');
    expect(localStorage.getItem('fp_locale')).toBe('en');
    cleanup();

    localStorage.setItem('fp_locale', 'en');
    setBrowser('en-US', ['en-US']);
    window.history.replaceState({}, '', '/?lang=es');
    render(
      <I18nProvider>
        <LocaleProbe />
      </I18nProvider>
    );
    expect(screen.getByTestId('locale')).toHaveTextContent('es');
    expect(localStorage.getItem('fp_locale')).toBe('es');
  });
});

describe.each(['es', 'en'] as const)('FP-JUDGE-1 judge landing (%s)', (locale) => {
  const labels = UI_LABELS[locale];

  function renderLanding(): void {
    localStorage.setItem('fp_locale', locale);
    vi.spyOn(api, 'getCapabilities').mockResolvedValue(capabilities);
    vi.spyOn(api, 'getOrganizerEvents').mockResolvedValue({ events: [] });
    render(
      <I18nProvider>
        <App />
      </I18nProvider>
    );
  }

  it('centers the headline and story on Pana and keeps the judges demo visible', async () => {
    renderLanding();
    const h1 = (await screen.findAllByRole('heading', { level: 1 }))[0]!;
    expect(h1).toHaveTextContent(
      locale === 'es'
        ? 'Tu anfitrión que cobra la parte de cada uno con PayPal'
        : "Your party host that collects everyone's share with PayPal"
    );
    expect(screen.getByText(
      locale === 'es'
        ? 'Arma la fiesta con ayuda de Pana, la avatar; cada persona confirma y paga su parte en PayPal Sandbox.'
        : 'Build the party with Pana, the avatar; everyone confirms and pays their share in PayPal Sandbox.'
    )).toBeInTheDocument();
    expect(screen.getByText(locale === 'es' ? 'Cómo funciona' : 'How it works')).toBeInTheDocument();
    for (const step of locale === 'es'
      ? ['Describe tu fiesta, Pana la arma', 'Pana guía a tus invitados', 'Cada uno paga su parte']
      : ['Describe your party, Pana builds it', 'Pana guides your guests', 'Everyone pays their share']) {
      expect(screen.getByText(step)).toBeInTheDocument();
    }
    expect(screen.getAllByRole('button', { name: labels.judgesDemo }).length).toBeGreaterThan(0);
  });
});

describe.each(['es', 'en'] as const)('FP-JUDGE-1 demo build step (%s)', (locale) => {
  const labels = UI_LABELS[locale];

  function renderDemo(): void {
    localStorage.setItem('fp_locale', locale);
    window.history.replaceState({}, '', '/demo');
    vi.spyOn(api, 'getCapabilities').mockResolvedValue(capabilities);
    vi.spyOn(api, 'getOrganizerEvents').mockResolvedValue({ events: [] });
    render(
      <I18nProvider>
        <App />
      </I18nProvider>
    );
  }

  it('is the first step with the guide button into the manual form', async () => {
    renderDemo();
    await screen.findByRole('heading', { name: labels.judgesDemo });
    const step = screen.getByRole('listitem', {
      name: locale === 'es' ? /Crea tu fiesta con ayuda de la avatar/ : /Create your party with the avatar/,
    });
    expect(step).toHaveAttribute('aria-label', `1. ${locale === 'es' ? 'Crea tu fiesta con ayuda de la avatar' : 'Create your party with the avatar'}`);
    const button = within(step).getByRole('button', { name: labels.createInvitation });
    expect(button).toHaveAttribute('data-guide', 'aiBuildParty');
    expect(button).toBeEnabled();
    // The former first step is now step 2.
    expect(screen.getByRole('listitem', { name: /Mira el panel de ejemplo|Look at the sample dashboard/ })).toHaveAttribute(
      'aria-label',
      expect.stringMatching(/^2\. /)
    );
  });
});

describe('FP-JUDGE-1 build step into /create', () => {
  function renderDemoEs(): void {
    localStorage.setItem('fp_locale', 'es');
    window.history.replaceState({}, '', '/demo');
    vi.spyOn(api, 'getCapabilities').mockResolvedValue(capabilities);
    vi.spyOn(api, 'getOrganizerEvents').mockResolvedValue({ events: [] });
    render(
      <I18nProvider>
        <App />
      </I18nProvider>
    );
  }

  it('opens the manual form with no network call on the demo click', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderDemoEs();
    fireEvent.click(await screen.findByRole('button', { name: 'Crear mi invitación' }));

    expect(window.location.pathname).toBe('/create');
    // Wizard manual: el título empieza vacío y nada se pidió a la red.
    const input = (await screen.findByLabelText(/Título del Evento/i)) as HTMLInputElement;
    expect(input.value).toBe('');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('FP-JUDGE-1 translated statuses', () => {
  it('labels order and payment enums per locale and passes unknown values through', () => {
    expect(orderStatusLabel('PENDIENTE_DE_APROBACION', 'es')).toBe('Pendiente de aprobación');
    expect(orderStatusLabel('PENDIENTE_DE_APROBACION', 'en')).toBe('Pending approval');
    expect(orderStatusLabel('approved', 'es')).toBe('Aprobada en PayPal');
    expect(orderStatusLabel('approved', 'en')).toBe('Approved in PayPal');
    expect(orderStatusLabel('captured', 'es')).toBe('Capturada');
    expect(orderStatusLabel('captured', 'en')).toBe('Captured');
    expect(orderStatusLabel('paid', 'en')).toBe('Paid');
    expect(orderStatusLabel('mystery-status', 'en')).toBe('mystery-status');
  });

  it('shows the dashboard payments with translated statuses', async () => {
    vi.spyOn(api, 'getDashboard').mockResolvedValue(dashboardFixture());
    vi.spyOn(api, 'getModerationGuests').mockResolvedValue({ guests: [] });
    vi.spyOn(api, 'getModerationConversations').mockResolvedValue({ conversations: [] });
    localStorage.setItem('fp_locale', 'en');
    render(
      <I18nProvider>
        <OrganizerDashboardView slug="sunday-lunch" capabilities={null} onNavigateInvite={vi.fn()} onNavigateHome={vi.fn()} onShowToast={vi.fn()} />
      </I18nProvider>
    );

    const payments = await screen.findByRole('region', { name: 'Payments' });
    expect(within(payments).getByText(/Captured/)).toBeInTheDocument();
    expect(within(payments).queryByText(/Capturada/)).toBeNull();
    expect(within(payments).queryByText('captured')).toBeNull();
  });

  // NAP-F5b: el panel PayPal+IA murió; el pago de prueba sigue en el paso 3.
});

describe('FP-JUDGE-1 English sampling without fixed Spanish', () => {
  /** Fixed UI copy (never person-written content) that must not leak into English. */
  const SPANISH_WITNESSES = [
    'Tu anfitrión que cobra',
    'Arma la fiesta con ayuda de Pana',
    'Crea tu fiesta con ayuda de la avatar',
    'Cómo funciona',
    'Crear mi invitación',
    'Asado del Domingo',
    'Cumpleaños de Sofía',
    'Escapada a la Playa',
    'PENDIENTE_DE_APROBACION',
    'Aprobada en PayPal',
    'Capturada',
    'Mira el panel de ejemplo',
    'Ver panel de ejemplo',
    'Prueba un pago con PayPal',
    'Crea tu próxima invitación',
    'Revisar invitación',
    'Publicar invitación',
    'Cuota por persona',
    'Lugar o Dirección',
    'Título del Evento',
    'Fiestas de muestra',
    'Datos ficticios',
    'Mis invitaciones',
    'Recuperar mi enlace',
    'Tu camino al pago',
    'Únete con tu nombre',
    'Confirma tu asistencia',
    'Revisa tu importe',
    'Paga en PayPal Sandbox',
    'Completar Pago Seguro',
    'Confirmar y Generar Pago',
    'Confirmo que revisé',
    'Verificar Estado',
    'Confirmar y Completar Captura',
    'Cargando la invitación',
    'Panel del Organizador',
    'Lista de Invitados y Pagos',
    'Sin pagos registrados',
    'pendiente de aprobación',
  ];

  function expectNoSpanish(container: HTMLElement = document.body): void {
    const body = container.textContent ?? '';
    for (const witness of SPANISH_WITNESSES) {
      expect(body, `leaked: ${witness}`).not.toContain(witness);
    }
  }

  it('walks landing, demo, create, invite, and dashboard in English', async () => {
    // Landing.
    localStorage.setItem('fp_locale', 'en');
    vi.spyOn(api, 'getCapabilities').mockResolvedValue(capabilities);
    vi.spyOn(api, 'getOrganizerEvents').mockResolvedValue({ events: [] });
    render(
      <I18nProvider>
        <App />
      </I18nProvider>
    );
    await screen.findByRole('heading', { name: "Your party host that collects everyone's share with PayPal" });
    expectNoSpanish();
    cleanup();
    vi.restoreAllMocks();

    // Demo.
    localStorage.setItem('fp_locale', 'en');
    window.history.replaceState({}, '', '/demo');
    vi.spyOn(api, 'getCapabilities').mockResolvedValue(capabilities);
    vi.spyOn(api, 'getOrganizerEvents').mockResolvedValue({ events: [] });
    render(
      <I18nProvider>
        <App />
      </I18nProvider>
    );
    await screen.findByRole('heading', { name: 'Judges demo' });
    expect(screen.getByRole('button', { name: 'Create my invitation' })).toHaveAttribute('data-guide', 'aiBuildParty');
    expectNoSpanish();
    cleanup();
    vi.restoreAllMocks();

    // Create.
    localStorage.setItem('fp_locale', 'en');
    render(
      <I18nProvider>
        <CreateEventView onEventCreated={vi.fn()} onCancel={vi.fn()} onShowToast={vi.fn()} />
      </I18nProvider>
    );
    expect(screen.getByText('Create your next invitation')).toBeInTheDocument();
    expect(screen.getByLabelText(/Event Title/i)).toBeInTheDocument();
    expectNoSpanish();
    cleanup();
    vi.restoreAllMocks();

    // Invite.
    localStorage.setItem('fp_locale', 'en');
    vi.spyOn(api, 'getEventBySlug').mockResolvedValue({ event: eventFixture(), guest: null });
    render(
      <I18nProvider>
        <PublicInviteView slug="sunday-lunch" capabilities={capabilities} onShowToast={vi.fn()} onNavigateHome={vi.fn()} />
      </I18nProvider>
    );
    await screen.findByRole('heading', { name: 'Sunday lunch' });
    expectNoSpanish();
    cleanup();
    vi.restoreAllMocks();

    // Dashboard.
    localStorage.setItem('fp_locale', 'en');
    vi.spyOn(api, 'getDashboard').mockResolvedValue(dashboardFixture());
    vi.spyOn(api, 'getModerationGuests').mockResolvedValue({ guests: [] });
    vi.spyOn(api, 'getModerationConversations').mockResolvedValue({ conversations: [] });
    render(
      <I18nProvider>
        <OrganizerDashboardView slug="sunday-lunch" capabilities={null} onNavigateInvite={vi.fn()} onNavigateHome={vi.fn()} onShowToast={vi.fn()} />
      </I18nProvider>
    );
    await screen.findByRole('heading', { name: 'Sunday lunch' });
    expectNoSpanish();
  });
});
