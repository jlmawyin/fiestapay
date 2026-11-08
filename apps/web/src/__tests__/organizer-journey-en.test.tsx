import type { ComponentType } from 'react';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UI_LABELS } from '@fiestapay/shared';
import { api } from '../api/client';
import { I18nProvider } from '../i18n/I18nContext';
import { setActiveLocale } from '../i18n/locale-store';
import { CreateEventForm } from '../components/events/CreateEventForm';
import { CreateEventView } from '../views/CreateEventView';
import { OrganizerDashboardView } from '../views/OrganizerDashboardView';
import { forgetRecoveryToken, OrganizerRecoveryView } from '../views/OrganizerRecoveryView';
import { OrganizerAssistant } from '../components/chat/OrganizerAssistant';
import { ComidaCover } from '../components/illustrations/ComidaCover';
import { CasaCover } from '../components/illustrations/CasaCover';
import { ViajeCover } from '../components/illustrations/ViajeCover';
import { EventoCover } from '../components/illustrations/EventoCover';
import { buildInviteShareText } from '../lib/event-presentation';
import type { Dashboard, EventInput, FiestaEvent, Guest } from '../types';

// jsdom has no grid layout/virtualization. Exercise our real cell renderers here;
// AG Grid rendering and horizontal scrolling are checked separately in the browser.
vi.mock('ag-grid-react', () => ({
  AgGridReact: ({ rowData, columnDefs }: { rowData: Guest[]; columnDefs: ColDef<Guest>[] }) => (
    <table><tbody>{rowData.map(guest => <tr key={guest.id}>{columnDefs.map((col, i) => {
      const value = col.field ? guest[col.field as keyof Guest] : undefined;
      const Cell = col.cellRenderer as ComponentType<Pick<ICellRendererParams<Guest>, 'data' | 'value'>> | undefined;
      return <td key={i}>{Cell ? <Cell data={guest} value={value} /> : String(value ?? '')}</td>;
    })}</tr>)}</tbody></table>
  ),
}));

/** Spanish UI copy (own strings, never person content) that must not leak into English. */
const SPANISH_WITNESSES = [
  'Título del Evento',
  'Cuota por persona',
  'Revisar invitación',
  'Publicar invitación',
  'Publicar estos valores',
  'Revisar campos',
  'Nombre de la invitación',
  'Resumen de la invitación',
  'Sin mínimo',
  'Sin meta',
  'Tipo de invitación',
  'Programa o Agenda',
  'Añadir horario',
  'Capacidad máxima',
  'Mínimo requerido',
  'Meta ideal',
  'Escribe un titulo',
  'Desayuno',
  'Almuerzo',
  'Cena',
  'Panel del Organizador',
  'Confirmar Realización',
  'Recaudado',
  'Meta de Recaudación',
  'Mínimo Requerido',
  'Confirmados (asistencia)',
  'Lista de Invitados y Pagos',
  'Confirmado, sin pagar',
  'Recordatorio',
  'Pendiente:',
  'Compartir en WhatsApp',
  'Copiar Link',
  'Ver Invitación Pública',
  'Cerrar inscripciones',
  'Sin pagos registrados',
  'Registro de Actividad',
  'Por Confirmar',
  'Mínimo no alcanzado',
  'Umbral de financiamiento',
  'Moderacion de chat',
  'Sin conversaciones',
  'Te recordamos tu confirmación',
  'cuota pendiente',
  'Recuperar enlace',
  'Recuperar mi enlace',
  'Confirmar enlace',
  'Solicitar enlace',
  'Identificador de la invitación',
  'Correo verificado',
  'Correo del organizador',
  'Guardar correo',
  'Enlace de organizador',
  'Copiar enlace de organizador',
  'Compartir Invitación',
  'Borrador para WhatsApp',
  'Correo opcional',
  'Sin correo de recuperacion',
  'Ir al panel',
  'COMIDA & ASADO',
  'FIESTA EN CASA',
  'VIAJE EN GRUPO',
  'EVENTO & CELEBRACIÓN',
  '¿Vienes a comer?',
  'Unirme a comer',
];

function expectNoSpanishWitnesses(container: HTMLElement = document.body): void {
  const text = container.textContent ?? '';
  for (const witness of SPANISH_WITNESSES) {
    expect(text, `Spanish witness in English UI: ${witness}`).not.toContain(witness);
  }
}

const guests: Guest[] = [
  { id: 'unpaid', name: 'José & Demo', status: 'yes', companions: 1, paidCents: 0, dueCents: 5000 },
  { id: 'partial', name: 'Inés Demo', status: 'yes', companions: 1, paidCents: 2500, dueCents: 2500 },
  { id: 'paid', name: 'Carlos Demo', status: 'yes', companions: 0, paidCents: 2500, dueCents: 0 },
  { id: 'maybe', name: 'Lucía Demo', status: 'maybe', companions: 0, paidCents: 0, dueCents: 0 },
];

function eventFixture(over: Partial<FiestaEvent> = {}): FiestaEvent {
  return {
    id: 'evt-org-en',
    slug: 'sunday-dinner',
    title: 'Sunday dinner',
    template: 'comida',
    meal: 'almuerzo',
    description: 'A relaxed test dinner',
    startsAt: '2026-10-31T18:00:00Z',
    endsAt: '2026-10-31T22:00:00Z',
    location: 'Salón demo',
    includes: ['Starter'],
    agenda: [],
    priceCents: 2500,
    capacity: 10,
    goalCents: 10000,
    minimumCents: 5000,
    confirmed: false,
    collectedCents: 5000,
    confirmedPeople: 5,
    paidPeople: 4,
    minimumReached: true,
    createdAt: '2026-10-24T09:00:00Z',
    fundingStatus: 'open',
    fundingDeadlineAt: '2026-10-30T18:00:00Z',
    organizerName: 'Ana Org',
    theme: 'mesa',
    ...over,
  };
}

function dashboardFixture(slug = 'sunday-dinner'): Dashboard {
  return {
    event: eventFixture({ slug }),
    guests,
    payments: [
      { orderId: 'ORD-1', guestName: 'José & Demo', amountCents: 2500, status: 'captured', createdAt: '2026-10-25T10:00:00Z' },
    ],
    audit: [{ action: 'event.updated', createdAt: '2026-10-24T15:04:00Z' }],
  };
}

function renderEn(node: React.ReactElement): void {
  localStorage.setItem('fp_locale', 'en');
  render(<I18nProvider>{node}</I18nProvider>);
}

const messageOf = (link: HTMLElement): string =>
  new URL((link as HTMLAnchorElement).href).searchParams.get('text')!;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
  document.documentElement.lang = 'es';
  setActiveLocale('es');
  forgetRecoveryToken();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
  document.documentElement.lang = 'es';
  setActiveLocale('es');
  forgetRecoveryToken();
});

describe('organizer dashboard in English', () => {
  function mockDashboard(slug = 'sunday-dinner') {
    vi.spyOn(api, 'getDashboard').mockResolvedValue(dashboardFixture(slug));
    vi.spyOn(api, 'getModerationGuests').mockResolvedValue({ guests: [] });
    vi.spyOn(api, 'getModerationConversations').mockResolvedValue({ conversations: [] });
  }

  it('renders the panel in English with Guayaquil time, $25.00, and no Spanish witnesses', async () => {
    mockDashboard();
    const onShowToast = vi.fn();
    renderEn(
      <OrganizerDashboardView slug="sunday-dinner" capabilities={null} onNavigateInvite={vi.fn()} onNavigateHome={vi.fn()} onShowToast={onShowToast} />,
    );

    expect(await screen.findByRole('heading', { name: 'Sunday dinner' })).toBeInTheDocument();
    expect(screen.getByText('Organizer Dashboard')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: UI_LABELS.en.confirmEvent })).toBeInTheDocument();
    // Server amounts formatted in English, Guayaquil wall time whatever the browser zone is.
    expect(screen.getAllByText('$25.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$50.00').length).toBeGreaterThan(0);
    expect(screen.getByText(/America\/Guayaquil/)).toBeInTheDocument();
    expect(screen.getAllByText(/01:00 PM/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Organized by Ana Org')).toBeInTheDocument();
    expect(screen.getByText('Coming to eat?')).toBeInTheDocument();
    expect(screen.getByText('4 guests · 4 paid people · capacity 10')).toBeInTheDocument();
    expect(screen.getByText('Guest and Payment List')).toBeInTheDocument();
    expect(screen.getByText('No conversations.')).toBeInTheDocument();
    expectNoSpanishWitnesses();
  });

  it('sends the WhatsApp reminder in English with the server balance and the public URL', async () => {
    mockDashboard();
    renderEn(
      <OrganizerDashboardView slug="sunday-dinner" capabilities={null} onNavigateInvite={vi.fn()} onNavigateHome={vi.fn()} onShowToast={vi.fn()} />,
    );
    const link = await screen.findByRole('link', { name: /José & Demo/ });
    const text = messageOf(link);
    expect(text).toContain('Hi José & Demo!');
    expect(text).toContain('Sunday dinner');
    expect(text).toContain('pending share of $50.00');
    expect(text).toContain('http');
    expect(text).toContain('/e/sunday-dinner');
    expect(text).not.toContain('Te recordamos');
    expect(screen.getByText('Confirmed, unpaid')).toBeInTheDocument();
    expect(screen.getByText('Confirmed (partial payment)')).toBeInTheDocument();
  });

  it('confirms the event in English and shares an English WhatsApp draft', async () => {
    mockDashboard();
    const data = dashboardFixture();
    const confirm = vi.spyOn(api, 'confirmEvent').mockResolvedValue({ event: { ...data.event, confirmed: true } });
    const onShowToast = vi.fn();
    renderEn(
      <OrganizerDashboardView slug="sunday-dinner" capabilities={null} onNavigateInvite={vi.fn()} onNavigateHome={vi.fn()} onShowToast={onShowToast} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: UI_LABELS.en.confirmEvent }));
    expect(screen.getByText('Confirm the invitation will happen?')).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: UI_LABELS.en.confirmEvent });
    fireEvent.click(buttons[buttons.length - 1]!);
    await waitFor(() => expect(confirm).toHaveBeenCalledExactlyOnceWith('sunday-dinner'));
    expect(onShowToast).toHaveBeenCalledWith(
      'success',
      'The meal has been formally confirmed!',
      'Meal confirmed',
    );

    fireEvent.click(screen.getByRole('button', { name: '📲 QR' }));
    expect(screen.getByText('Share Invitation')).toBeInTheDocument();
    const draft = screen.getByLabelText('WhatsApp draft');
    expect(draft.textContent).toContain('Coming to eat?');
    expect(draft.textContent).toContain('Share per person:');
    expect(draft.textContent).not.toContain('¿Vienes a comer?');
  });

  it('keeps the Spanish dashboard identical', async () => {
    mockDashboard();
    render(
      <OrganizerDashboardView slug="sunday-dinner" capabilities={null} onNavigateInvite={vi.fn()} onNavigateHome={vi.fn()} onShowToast={vi.fn()} />,
    );
    expect(await screen.findByRole('heading', { name: 'Sunday dinner' })).toBeInTheDocument();
    expect(screen.getByText('Panel del Organizador')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: UI_LABELS.es.confirmEvent })).toBeInTheDocument();
    expect(screen.getAllByText('$25,00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$50,00').length).toBeGreaterThan(0);
    expect(screen.getByText('¿Vienes a comer?')).toBeInTheDocument();
    expect(screen.getByText('Organiza Ana Org')).toBeInTheDocument();
    expect(screen.getByText('4 invitados · 4 personas pagadas · cupo 10')).toBeInTheDocument();
    expect(screen.getByText('Confirmado, sin pagar')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /José & Demo/ });
    expect(messageOf(link)).toContain('Te recordamos tu confirmación');
    expect(messageOf(link)).toContain('$50,00');
  });
});

describe('create/edit form in English', () => {
  function fillBasicsEn() {
    fireEvent.change(screen.getByLabelText('Event Title *'), { target: { value: 'Sunday dinner' } });
    fireEvent.change(screen.getByLabelText('Place or Address *'), { target: { value: 'Main hall' } });
    fireEvent.change(screen.getByLabelText('Share per person *'), { target: { value: '25.00' } });
    fireEvent.change(screen.getByLabelText('Maximum capacity *'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('Date and Time *'), { target: { value: '2026-12-10T14:00' } });
    fireEvent.change(screen.getByLabelText('End Time *'), { target: { value: '2026-12-10T18:00' } });
    fireEvent.change(screen.getByLabelText('Description for guests'), { target: { value: 'Real description here' } });
    fireEvent.change(screen.getByLabelText('What does the share include? (Comma separated)'), {
      target: { value: 'Snack, juice' },
    });
  }

  function fillBasicsEs() {
    fireEvent.change(screen.getByLabelText(/Título del Evento/i), { target: { value: 'Sunday dinner' } });
    fireEvent.change(screen.getByLabelText(/Lugar o Dirección/i), { target: { value: 'Main hall' } });
    fireEvent.change(screen.getByLabelText(/Cuota por persona/i), { target: { value: '25.00' } });
    fireEvent.change(screen.getByLabelText(/Capacidad máxima/i), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText(/Fecha y Hora/i), { target: { value: '2026-12-10T14:00' } });
    fireEvent.change(screen.getByLabelText(/Hora de fin/i), { target: { value: '2026-12-10T18:00' } });
    fireEvent.change(screen.getByLabelText(/Descripción para los invitados/i), { target: { value: 'Real description here' } });
    fireEvent.change(screen.getByLabelText(/Qué incluye la cuota/i), { target: { value: 'Snack, juice' } });
  }

  it('renders the form chrome in English with Guayaquil note and no Spanish witnesses', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderEn(<CreateEventForm onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    fillBasicsEn();
    expect(screen.getByRole('radio', { name: /Meal/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Table' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Group trip/ }));
    expect(screen.getByRole('radio', { name: 'Mountain' })).toBeInTheDocument();
    expect(screen.getByText('Times are interpreted in America/Guayaquil.')).toBeInTheDocument();
    expect((screen.getByLabelText('Event Title *') as HTMLInputElement).placeholder).toBe('Invitation name');
    fireEvent.click(screen.getByRole('button', { name: 'Review invitation' }));
    expect(screen.getByRole('region', { name: 'Invitation summary' })).toBeInTheDocument();
    expectNoSpanishWitnesses();
  });

  it('sends exactly the same EventInput in English as in Spanish', async () => {
    const onSubmitEn = vi.fn().mockResolvedValue(undefined);
    renderEn(<CreateEventForm onSubmit={onSubmitEn} onCancel={vi.fn()} isLoading={false} />);
    fillBasicsEn();
    fireEvent.click(screen.getByRole('button', { name: 'Review invitation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Publish invitation' }));
    await waitFor(() => expect(onSubmitEn).toHaveBeenCalledTimes(1));
    const payloadEn = onSubmitEn.mock.calls[0][0] as EventInput;
    cleanup();
    localStorage.clear();

    const onSubmitEs = vi.fn().mockResolvedValue(undefined);
    render(<CreateEventForm onSubmit={onSubmitEs} onCancel={vi.fn()} isLoading={false} />);
    fillBasicsEs();
    fireEvent.click(screen.getByRole('button', { name: 'Revisar invitación' }));
    fireEvent.click(screen.getByRole('button', { name: 'Publicar invitación' }));
    await waitFor(() => expect(onSubmitEs).toHaveBeenCalledTimes(1));
    const payloadEs = onSubmitEs.mock.calls[0][0] as EventInput;

    expect(payloadEn).toEqual(payloadEs);
    expect(payloadEn.priceCents).toBe(2500);
    expect(payloadEn.capacity).toBe(8);
    expect(new Date(payloadEn.startsAt).getTime()).toBe(new Date('2026-12-10T14:00').getTime());
  });

  it('validates in English without changing the rules', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderEn(<CreateEventForm onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review invitation' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Write a title.');
    expect(onSubmit).not.toHaveBeenCalled();
    expectNoSpanishWitnesses();
  });

  it('creates the invitation in English from the create view', async () => {
    const created = {
      event: eventFixture({ title: 'Sunday dinner', slug: 'sunday-dinner' }),
      adminKey: 'admin-key-en',
    };
    vi.spyOn(api, 'createEvent').mockResolvedValue(created);
    const onShowToast = vi.fn();
    renderEn(<CreateEventView onEventCreated={vi.fn()} onCancel={vi.fn()} onShowToast={onShowToast} recoveryAvailable={false} />);
    expect(screen.getByText('Create your next invitation')).toBeInTheDocument();
    fillBasicsEn();
    fireEvent.click(screen.getByRole('button', { name: 'Review invitation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Publish invitation' }));
    await waitFor(() => expect(api.createEvent).toHaveBeenCalledTimes(1));
    expect(onShowToast).toHaveBeenCalledWith(
      'success',
      'Invitation "Sunday dinner" created successfully!',
      'Invitation created',
    );
    expect(await screen.findByRole('button', { name: 'Go to the dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Save the organizer link')).toBeInTheDocument();
    expectNoSpanishWitnesses();
  });
});

describe('recovery route in both languages', () => {
  it('renders /recover in English', async () => {
    vi.spyOn(api, 'requestRecovery').mockResolvedValue({ status: 'accepted' });
    renderEn(<OrganizerRecoveryView available />);
    expect(screen.getByRole('heading', { name: 'Recover link' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Invitation id'), { target: { value: 'sunday-dinner' } });
    fireEvent.change(screen.getByLabelText('Verified email'), { target: { value: 'ana@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Request link' }));
    expect(await screen.findByText('If the email is verified for that invitation, you will receive instructions.')).toBeInTheDocument();
    expectNoSpanishWitnesses();
  });

  it('confirms a token in English and shows the English link card', async () => {
    const token = 'e'.repeat(43);
    window.history.replaceState({}, '', `/recover#t=${token}`);
    vi.spyOn(api, 'consumeRecovery').mockResolvedValue({ purpose: 'recover', slug: 'sunday-dinner', adminKey: 'key-en' });
    renderEn(<OrganizerRecoveryView available />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm link' }));
    expect(await screen.findByDisplayValue(/key-en/)).toBeTruthy();
    expect(screen.getByText('Copy organizer link')).toBeInTheDocument();
    expectNoSpanishWitnesses();
  });

  it('keeps /recover identical in Spanish', async () => {
    vi.spyOn(api, 'requestRecovery').mockResolvedValue({ status: 'accepted' });
    render(<OrganizerRecoveryView available />);
    expect(screen.getByRole('heading', { name: 'Recuperar enlace' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Identificador de la invitación'), { target: { value: 'cena' } });
    fireEvent.change(screen.getByLabelText('Correo verificado'), { target: { value: 'ana@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar enlace' }));
    expect(await screen.findByText('Si el correo esta verificado para esa invitación, recibirás instrucciones.')).toBeInTheDocument();
  });
});

describe('organizer assistant chrome in English', () => {
  it('shows the English chrome with the server greeting', async () => {
    vi.spyOn(api, 'getOrganizerChatHistory').mockResolvedValue({ messages: [], greeting: 'Server greeting.' });
    renderEn(<OrganizerAssistant slug="sunday-dinner" capabilities={null} />);
    fireEvent.click(screen.getByRole('button', { name: UI_LABELS.en.orbLauncher }));
    expect(screen.getByText('Organizer assistant · read-only')).toBeInTheDocument();
    expect(await screen.findByText('Server greeting.')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: UI_LABELS.en.textTab })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: UI_LABELS.en.voiceTab })).toBeInTheDocument();
  });
});

describe('cover badges and share draft', () => {
  it('shows the badge in the active language without changing the drawing', () => {
    const { unmount } = render(<ComidaCover />);
    expect(document.querySelector('svg text')?.textContent).toBe('COMIDA & ASADO');
    unmount();
    cleanup();
    renderEn(<ComidaCover />);
    expect(document.querySelector('svg text')?.textContent).toBe('FOOD & BBQ');
    cleanup();
    localStorage.clear();

    const cases = [
      { node: <CasaCover />, es: 'FIESTA EN CASA', en: 'HOUSE PARTY' },
      { node: <ViajeCover />, es: 'VIAJE EN GRUPO', en: 'GROUP TRIP' },
      { node: <EventoCover />, es: 'EVENTO & CELEBRACIÓN', en: 'EVENT & CELEBRATION' },
    ] as const;
    for (const { node, es, en } of cases) {
      const esView = render(node);
      expect(document.querySelector('svg text')?.textContent).toBe(es);
      esView.unmount();
      cleanup();
      renderEn(node);
      expect(document.querySelector('svg text')?.textContent).toBe(en);
      cleanup();
      localStorage.clear();
    }
  });

  it('builds the share draft in the organizer language', () => {
    const input = {
      template: 'comida' as const,
      theme: 'mesa' as const,
      title: 'Sunday dinner',
      location: 'Main hall',
      startsAt: '2026-12-15T19:00:00Z',
      endsAt: '2026-12-15T23:00:00Z',
      priceCents: 2500,
      inviteUrl: 'https://example.com/e/sunday-dinner',
      organizerName: 'Ana Org',
    };
    const en = buildInviteShareText(input, 'en');
    expect(en).toContain('Coming to eat?');
    expect(en).toContain('Share per person: $25.00');
    expect(en).not.toContain('¿Vienes a comer?');
    expect(en).not.toContain('Cuota por persona');
    const es = buildInviteShareText(input, 'es');
    expect(es).toContain('¿Vienes a comer?');
    expect(es).toContain('¿Vienes a comer?');
    expect(es).toContain('Cuota por persona: $25,00');
  });
});
