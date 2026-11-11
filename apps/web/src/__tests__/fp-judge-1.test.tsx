import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UI_LABELS } from '@fiestapay/shared';
import type { DraftEventProposal } from '@fiestapay/shared';
import { App } from '../App';
import { ApiError, api } from '../api/client';
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

function proposalFixture(): DraftEventProposal {
  return {
    template: 'comida',
    title: 'BBQ Saturday',
    meal: 'almuerzo',
    date: '2026-12-19',
    startTime: '16:00',
    durationMinutes: 180,
    location: 'Central Park',
    includes: ['Grill', 'Drinks'],
    headcount: 10,
    budgetCents: 15000,
    perPersonCents: 1500,
    suggested: ['template', 'title', 'meal', 'date', 'startTime', 'durationMinutes', 'location', 'includes', 'headcount', 'budgetCents'],
    source: 'ai',
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

  it('centers the headline and story on AI and keeps the judges demo visible', async () => {
    renderLanding();
    const h1 = (await screen.findAllByRole('heading', { level: 1 }))[0]!;
    expect(h1).toHaveTextContent(
      locale === 'es'
        ? 'Tu anfitrión con IA que cobra la parte de cada uno con PayPal'
        : "Your AI party host that collects everyone's share with PayPal"
    );
    expect(screen.getByText(
      locale === 'es'
        ? 'Describe la fiesta en una frase y la IA la arma, el agente te guía por voz o texto y cada persona paga su parte en PayPal Sandbox.'
        : 'Describe the party in one sentence and the AI builds it, the agent guides you by voice or text, and everyone pays their share in PayPal Sandbox.'
    )).toBeInTheDocument();
    expect(screen.getByText(locale === 'es' ? 'Cómo funciona' : 'How it works')).toBeInTheDocument();
    for (const step of locale === 'es'
      ? ['Describe tu fiesta, la IA la arma', 'El agente guía a tus invitados', 'Cada uno paga su parte']
      : ['Describe your party, the AI builds it', 'The agent guides your guests', 'Everyone pays their share']) {
      expect(screen.getByText(step)).toBeInTheDocument();
    }
    expect(screen.getAllByRole('button', { name: labels.judgesDemo }).length).toBeGreaterThan(0);
  });
});

describe.each(['es', 'en'] as const)('FP-JUDGE-1 demo AI step (%s)', (locale) => {
  const labels = UI_LABELS[locale];
  const example =
    locale === 'es'
      ? 'Parrillada para 10 amigos, $15 cada uno, el sábado a las 4 pm en el parque'
      : 'BBQ for 10 friends, $15 each, Saturday 4 pm at Central Park';

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

  it('is the first step with the example phrase and the guide button', async () => {
    renderDemo();
    await screen.findByRole('heading', { name: labels.judgesDemo });
    const step = screen.getByRole('listitem', {
      name: locale === 'es' ? /Describe tu fiesta y la IA la arma/ : /Describe your party/,
    });
    expect(step).toHaveAttribute('aria-label', `1. ${locale === 'es' ? 'Describe tu fiesta y la IA la arma' : 'Describe your party — the AI builds it'}`);
    expect(within(step).getByLabelText(
      locale === 'es' ? 'Tu fiesta en una frase' : 'Your party in one sentence'
    )).toHaveValue(example);
    const button = within(step).getByRole('button', { name: labels.aiBuildParty });
    expect(button).toHaveAttribute('data-guide', 'aiBuildParty');
    expect(button).toBeEnabled();
    // The former first step is now step 2.
    expect(screen.getByRole('listitem', { name: /Mira el panel de ejemplo|Look at the sample dashboard/ })).toHaveAttribute(
      'aria-label',
      expect.stringMatching(/^2\. /)
    );
  });
});

describe('FP-JUDGE-1 AI prefill into /create', () => {
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

  it('prefills the sentence and fires one AI fill on the demo click', async () => {
    const draft = vi.spyOn(api, 'draftEvent').mockResolvedValue(proposalFixture());
    renderDemoEs();
    fireEvent.click(await screen.findByRole('button', { name: 'Crear la fiesta con IA' }));

    expect(window.location.pathname).toBe('/create');
    const input = (await screen.findByLabelText('Describe tu invitación en una frase')) as HTMLInputElement;
    expect(input.value).toBe('Parrillada para 10 amigos, $15 cada uno, el sábado a las 4 pm en el parque');
    await waitFor(() => expect(draft).toHaveBeenCalledTimes(1));
    expect(draft).toHaveBeenCalledWith('Parrillada para 10 amigos, $15 cada uno, el sábado a las 4 pm en el parque');
    // The proposal lands on the editable summary; nothing is published by itself.
    expect(await screen.findByRole('heading', { name: 'Revisar y publicar' })).toBeInTheDocument();
    expect(
      screen.getByText(/Redacté tu invitación\. Los campos sugeridos están marcados/),
    ).toBeInTheDocument();
    expect(screen.getAllByText('BBQ Saturday').length).toBeGreaterThan(0);
    await waitFor(() => expect(draft).toHaveBeenCalledTimes(1));
  });

  it('makes no AI call when /create opens without the demo click', async () => {
    const draft = vi.spyOn(api, 'draftEvent');
    localStorage.setItem('fp_locale', 'es');
    window.history.replaceState({}, '', '/create');
    vi.spyOn(api, 'getCapabilities').mockResolvedValue(capabilities);
    vi.spyOn(api, 'getOrganizerEvents').mockResolvedValue({ events: [] });
    render(
      <I18nProvider>
        <App />
      </I18nProvider>
    );

    const input = (await screen.findByLabelText('Describe tu invitación en una frase')) as HTMLInputElement;
    expect(input.value).toBe('');
    expect(draft).not.toHaveBeenCalled();
  });

  it('keeps the phrase written and shows the usual message when AI fails', async () => {
    const draft = vi.spyOn(api, 'draftEvent').mockRejectedValue(new ApiError('unavailable', 503));
    renderDemoEs();
    fireEvent.click(await screen.findByRole('button', { name: 'Crear la fiesta con IA' }));

    const input = (await screen.findByLabelText('Describe tu invitación en una frase')) as HTMLInputElement;
    expect(input.value).toBe('Parrillada para 10 amigos, $15 cada uno, el sábado a las 4 pm en el parque');
    await waitFor(() => expect(draft).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La IA no respondió. Te dejamos la sugerencia por reglas; puedes publicar igual.'
    );
    expect(input.value).toBe('Parrillada para 10 amigos, $15 cada uno, el sábado a las 4 pm en el parque');
    await waitFor(() => expect(draft).toHaveBeenCalledTimes(1));
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

  it('renders the PayPal and AI panel without raw enums in English', async () => {
    localStorage.setItem('fp_locale', 'en');
    window.history.replaceState({}, '', '/demo');
    vi.spyOn(api, 'getCapabilities').mockResolvedValue(capabilities);
    vi.spyOn(api, 'getOrganizerEvents').mockResolvedValue({ events: [] });
    render(
      <I18nProvider>
        <App />
      </I18nProvider>
    );

    const panel = await screen.findByTestId('paypal-ai-panel');
    expect(within(panel).getByText(/pending approval/)).toBeInTheDocument();
    expect(within(panel).queryByText(/PENDIENTE_DE_APROBACION/)).toBeNull();
  });
});

describe('FP-JUDGE-1 English sampling without fixed Spanish', () => {
  /** Fixed UI copy (never person-written content) that must not leak into English. */
  const SPANISH_WITNESSES = [
    'Tu anfitrión con IA',
    'Describe la fiesta en una frase',
    'Describe tu fiesta y la IA la arma',
    'Cómo funciona',
    'Parrillada para 10 amigos',
    'Tu fiesta en una frase',
    'Crear la fiesta con IA',
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
    'Describe tu invitación en una frase',
    'Rellenar con IA',
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
    await screen.findByRole('heading', { name: "Your AI party host that collects everyone's share with PayPal" });
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
    expect(screen.getByDisplayValue('BBQ for 10 friends, $15 each, Saturday 4 pm at Central Park')).toBeInTheDocument();
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
    expect(screen.getByLabelText('Describe your gathering in one sentence')).toBeInTheDocument();
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
