import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { api } from '../api/client';
import { FundingStatusPanel } from '../components/common/FundingStatusPanel';
import { Header } from '../components/common/Header';
import { OrganizerLinkCard } from '../components/dashboard/OrganizerLinkCard';
import { RecoveryEmailCard } from '../components/dashboard/RecoveryEmailCard';
import { CreateEventForm } from '../components/events/CreateEventForm';
import { CasaCover } from '../components/illustrations/CasaCover';
import { EventoCover } from '../components/illustrations/EventoCover';
import { fundedIsNotConfirmationNote, organizerConfirmedBadge } from '../lib/event-presentation';
import type { Capabilities, CreatedEvent, FiestaEvent } from '../types';
import { CreateEventView } from '../views/CreateEventView';
import { OrganizerHomeView } from '../views/OrganizerHomeView';
import { OrganizerRecoveryView } from '../views/OrganizerRecoveryView';
import { PublicInviteView } from '../views/PublicInviteView';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
});

const caps: Capabilities = {
  paypal: false,
  paypalClientId: null,
  chat: false,
  voice: false,
  sandbox: true,
  email: true,
};

function event(over: Partial<FiestaEvent> = {}): FiestaEvent {
  return {
    id: 'evt-copy',
    slug: 'ruta-banos',
    title: 'Ruta a Baños',
    template: 'viaje',
    meal: 'almuerzo',
    description: 'Salida del grupo',
    startsAt: '2026-12-15T13:00:00.000Z',
    endsAt: '2026-12-16T18:00:00.000Z',
    location: 'Baños',
    includes: [],
    agenda: [],
    priceCents: 2500,
    capacity: 8,
    goalCents: null,
    minimumCents: 10000,
    confirmed: false,
    collectedCents: 10000,
    confirmedPeople: 2,
    minimumReached: true,
    createdAt: '2026-10-20T00:00:00.000Z',
    fundingStatus: 'funded',
    ...over,
  };
}

function reviewInvitation() {
  fireEvent.click(screen.getByRole('button', { name: 'Revisar invitación' }));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('neutral presentation copy', () => {
  it('keeps the brand and names the header actions as invitations', () => {
    render(<Header onNavigateHome={vi.fn()} onNavigateCreate={vi.fn()} />);
    expect(screen.getByRole('button', { name: /FiestaPay/i })).toBeInTheDocument();
    const nav = screen.getByRole('navigation');
    expect(within(nav).getByRole('button', { name: 'Mis invitaciones' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: '+ Nueva invitación' })).toBeInTheDocument();
    expect(within(nav).queryByRole('button', { name: /fiesta/i })).toBeNull();
  });

  it('uses invitation headings before a type is published and still opens the panel with the slug', async () => {
    const created = event({ template: 'viaje', title: 'Ruta a Baños' });
    const pending = deferred<CreatedEvent>();
    vi.spyOn(api, 'createEvent').mockReturnValue(pending.promise);
    const onEventCreated = vi.fn();
    const onShowToast = vi.fn();
    render(
      <CreateEventView onEventCreated={onEventCreated} onCancel={vi.fn()} onShowToast={onShowToast} />,
    );

    expect(screen.getByText('Nueva invitación')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Crea tu próxima invitación' })).toBeInTheDocument();
    expect(screen.queryByText(/fiesta/i)).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: /Viaje/i }));
    fireEvent.change(screen.getByLabelText(/Título del Evento/i), { target: { value: 'Ruta a Baños' } });
    fireEvent.change(screen.getByLabelText(/Lugar o Dirección/i), { target: { value: 'Baños' } });
    fireEvent.change(screen.getByLabelText(/Cuota por persona/i), { target: { value: '25.00' } });
    fireEvent.change(screen.getByLabelText(/Capacidad máxima/i), { target: { value: '8' } });
    reviewInvitation();
    fireEvent.click(screen.getByRole('button', { name: 'Publicar invitación' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Creando la invitación…');
    await act(async () => {
      pending.resolve({ event: created, adminKey: 'clave-panel' });
    });
    expect(await screen.findByRole('button', { name: 'Ir al panel' })).toBeInTheDocument();
    expect(onShowToast).toHaveBeenCalledWith(
      'success',
      '¡Invitación "Ruta a Baños" creada con éxito!',
      'Invitación creada',
    );
    expect(onShowToast.mock.calls.some((call) => String(call[1]).includes('$'))).toBe(false);
    expect(onShowToast.mock.calls.some((call) => /fiesta/i.test(String(call[1])))).toBe(false);
    expect(onEventCreated).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Ir al panel' }));
    expect(onEventCreated).toHaveBeenCalledTimes(1);
    expect(onEventCreated).toHaveBeenCalledWith('ruta-banos');
  });

  it('names home actions as invitations and keeps the demo price as a plain label', () => {
    render(
      <OrganizerHomeView
        events={[]}
        isLoading={false}
        onNavigateCreate={vi.fn()}
        onNavigateInvite={vi.fn()}
        onNavigateDashboard={vi.fn()}
        onCreateDemo={vi.fn(async () => undefined)}
        onResetDemo={vi.fn(async () => undefined)}
        isResetting={false}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Organiza tus invitaciones, claridad en cada cuota' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Crear nueva invitación' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '⚡ Generar demo de comida ($25 USD)' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar Demo' }));
    expect(screen.getByText('Esta acción afectará las invitaciones creadas en esta sesión de organizador.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sí, Reiniciar Demo' })).toBeInTheDocument();
    expect(screen.queryByText(/fiesta/i)).toBeNull();
  });

  it('prints the demo title without a client amount', async () => {
    vi.spyOn(api, 'getCapabilities').mockResolvedValue(caps);
    vi.spyOn(api, 'getOrganizerEvents').mockResolvedValue({ events: [] });
    const created = event();
    vi.spyOn(api, 'createDemoEvent').mockResolvedValue({ event: created, adminKey: null });
    vi.spyOn(api, 'getEventBySlug').mockResolvedValue({ event: created, guest: null });

    render(<App />);
    const createDemo = vi.mocked(api.createDemoEvent);
    await waitFor(() => expect(api.getOrganizerEvents).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText(/Cargando tus invitaciones/)).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: '⚡ Generar demo de comida ($25 USD)' }));
    await waitFor(() => expect(createDemo).toHaveBeenCalled());
    expect(await screen.findByText('Demo de comida "Ruta a Baños" creada.', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByText(/Cuota \$25/)).toBeNull();
    expect(screen.queryByText(/fiesta de demostración/i)).toBeNull();
  });

  it('uses the demo error and reset lines without saying the real invitations were removed', async () => {
    vi.spyOn(api, 'getCapabilities').mockResolvedValue(caps);
    vi.spyOn(api, 'getOrganizerEvents').mockResolvedValue({ events: [] });
    vi.spyOn(api, 'createDemoEvent').mockRejectedValue(new Error(''));
    vi.spyOn(api, 'resetDemo').mockResolvedValue({ event: event(), adminKey: null });

    render(<App />);
    const createDemo = vi.mocked(api.createDemoEvent);
    await waitFor(() => expect(api.getOrganizerEvents).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText(/Cargando tus invitaciones/)).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: '⚡ Generar demo de comida ($25 USD)' }));
    await waitFor(() => expect(createDemo).toHaveBeenCalled());
    expect(await screen.findByText('Error al generar la demo de comida', {}, { timeout: 3000 })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar Demo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sí, Reiniciar Demo' }));
    expect(await screen.findByText('Demostración reiniciada. Las invitaciones reales siguen activas.', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByText(/fiestas reales/i)).toBeNull();
    expect(screen.queryByText(/elimin/i)).toBeNull();
  });

  it('keeps a funded viaje unconfirmed until the organizer says so', () => {
    const { unmount } = render(
      <FundingStatusPanel event={event({ template: 'viaje', fundingStatus: 'funded', confirmed: false })} />,
    );
    expect(screen.getByText('Umbral de financiamiento alcanzado')).toBeInTheDocument();
    expect(screen.getByText('Sin confirmación del organizador')).toBeInTheDocument();
    expect(screen.queryByText('Viaje confirmado por el organizador')).toBeNull();
    expect(screen.getByText(fundedIsNotConfirmationNote('viaje'))).toBeInTheDocument();
    expect(screen.getByText(/no confirma el viaje por sí solo/)).toBeInTheDocument();
    expect(screen.queryByText(/la viaje|la evento|\bfiesta\b/i)).toBeNull();
    unmount();

    render(<FundingStatusPanel event={event({ template: 'viaje', confirmed: true })} />);
    expect(screen.getByText('Viaje confirmado por el organizador')).toBeInTheDocument();
    expect(screen.getByText(/no confirma el viaje por sí solo/)).toBeInTheDocument();

    expect(organizerConfirmedBadge('comida')).toBe('Comida confirmada por el organizador');
    expect(organizerConfirmedBadge('casa')).toBe('Reunión en casa confirmada por el organizador');
    expect(organizerConfirmedBadge('evento')).toBe('Evento confirmado por el organizador');
    expect(organizerConfirmedBadge(null)).toBe('Invitación confirmada por el organizador');
    expect(fundedIsNotConfirmationNote('evento')).toContain('el evento');
    expect(fundedIsNotConfirmationNote('evento')).not.toContain('la evento');
    expect(fundedIsNotConfirmationNote('casa')).toContain('la reunión en casa');
    expect(fundedIsNotConfirmationNote(null)).toContain('la invitación');
    for (const template of ['comida', 'casa', 'viaje', 'evento', null] as const) {
      expect(organizerConfirmedBadge(template)).not.toMatch(/fiesta/i);
      expect(fundedIsNotConfirmationNote(template)).not.toMatch(/fiesta/i);
    }
  });

  it('warns on the legacy title example and the new placeholder, and does not prefill it', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CreateEventForm onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    const title = screen.getByLabelText(/Título del Evento/i) as HTMLInputElement;
    expect(title).toHaveValue('');
    expect(title).toHaveAttribute('placeholder', 'Nombre de la invitación');
    expect(screen.getByLabelText(/Lugar o Dirección/i)).toHaveAttribute('placeholder', 'Lugar o direccion');

    fireEvent.change(title, { target: { value: 'Nombre de la invitación' } });
    fireEvent.change(screen.getByLabelText(/Lugar o Dirección/i), { target: { value: 'Lugar o direccion' } });
    fireEvent.change(screen.getByLabelText(/Descripción para los invitados/i), { target: { value: 'Que van a hacer' } });
    fireEvent.change(screen.getByLabelText(/Qué incluye la cuota/i), { target: { value: 'Separa con comas' } });
    fireEvent.change(screen.getByLabelText(/Cuota por persona/i), { target: { value: '25.00' } });
    fireEvent.change(screen.getByLabelText(/Capacidad máxima/i), { target: { value: '4' } });
    reviewInvitation();

    const alert = screen.getByRole('alert', { name: /texto de ejemplo/i });
    expect(alert).toHaveTextContent('Título del Evento: Nombre de la invitación');
    expect(alert).toHaveTextContent('Lugar o Dirección: Lugar o direccion');
    expect(alert).toHaveTextContent('Descripción para los invitados: Que van a hacer');
    expect(alert).toHaveTextContent('¿Qué incluye la cuota? (Separados por coma): Separa con comas');
    expect(screen.getByRole('button', { name: 'Publicar estos valores' })).toBeEnabled();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(title, { target: { value: 'nombre de la fiesta' } });
    reviewInvitation();
    expect(screen.getByRole('alert', { name: /texto de ejemplo/i })).toHaveTextContent('Título del Evento: nombre de la fiesta');

    fireEvent.change(title, { target: { value: 'Nombre de la invitacion' } });
    reviewInvitation();
    expect(screen.getByRole('alert', { name: /texto de ejemplo/i })).toHaveTextContent('Título del Evento: Nombre de la invitacion');

    fireEvent.change(title, { target: { value: 'La ruta incluye Nombre de la invitación solo como frase' } });
    fireEvent.change(screen.getByLabelText(/Lugar o Dirección/i), { target: { value: 'Baños' } });
    fireEvent.change(screen.getByLabelText(/Descripción para los invitados/i), { target: { value: 'Salida temprano' } });
    fireEvent.change(screen.getByLabelText(/Qué incluye la cuota/i), { target: { value: 'Bus' } });
    reviewInvitation();
    expect(screen.queryByRole('button', { name: 'Publicar estos valores' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Publicar invitación' })).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('asks for an invitation id and gives the same recovery answer either way', async () => {
    vi.spyOn(api, 'requestRecovery').mockResolvedValue({ status: 'accepted' });
    render(<OrganizerRecoveryView available />);
    expect(screen.getByLabelText('Identificador de la invitación')).toBeInTheDocument();
    expect(screen.getByText(/identificador de la invitación y el correo verificado/)).toBeInTheDocument();
    expect(screen.queryByText(/fiesta/i)).toBeNull();
    fireEvent.change(screen.getByLabelText('Identificador de la invitación'), { target: { value: 'ruta-banos' } });
    fireEvent.change(screen.getByLabelText('Correo verificado'), { target: { value: 'ana@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar enlace' }));
    expect(await screen.findByText('Si el correo esta verificado para esa invitación, recibirás instrucciones.')).toBeInTheDocument();
    expect(screen.queryByText(/no existe|no está registrado|bandeja/i)).toBeNull();
  });

  it('keeps recovery email copy neutral and the organizer link label neutral', async () => {
    vi.spyOn(api, 'getRecoveryStatus').mockResolvedValue({ email: true, contact: { state: 'none', masked: null } });
    render(<RecoveryEmailCard slug="ruta-banos" available />);
    expect(await screen.findByText(/No hace falta un correo para crear la invitación/)).toBeInTheDocument();
    cleanup();
    render(<RecoveryEmailCard slug="ruta-banos" available={false} />);
    expect(screen.getByText(/La invitación se crea igual/)).toBeInTheDocument();
    cleanup();
    render(<OrganizerLinkCard slug="ruta-banos" adminKey="clave-de-prueba" />);
    expect(screen.getByLabelText('Enlaces de la invitación')).toBeInTheDocument();
  });

  it('drops generic fiesta from the evento illustration and keeps the casa type phrase', () => {
    render(<EventoCover />);
    expect(screen.getByRole('img', { name: 'Ilustración de gran evento formal y celebración con luces' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /fiesta/i })).toBeNull();
    cleanup();
    render(<CasaCover />);
    expect(screen.getByRole('img', { name: 'Ilustración de fiesta acogedora en casa' })).toBeInTheDocument();
  });

  it('uses a neutral load error when the invitation cannot be read', async () => {
    vi.spyOn(api, 'getEventBySlug').mockRejectedValue(new Error(''));
    const onShowToast = vi.fn();
    render(
      <PublicInviteView slug="ruta-banos" capabilities={null} onShowToast={onShowToast} onNavigateHome={vi.fn()} />,
    );
    await waitFor(() => {
      expect(onShowToast).toHaveBeenCalledWith('error', 'No se pudo cargar la invitación', 'Error de carga');
    });
  });
});
