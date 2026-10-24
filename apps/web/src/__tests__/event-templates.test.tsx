import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreateEventForm } from '../components/events/CreateEventForm';
import { PublicInviteView } from '../views/PublicInviteView';
import { api } from '../api/client';
import type { EventInput, FiestaEvent } from '../types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Event Templates & Agenda', () => {
  it('four templates submit expected kind and cents via the same onSubmit (25/18/65/40 USD)', async () => {
    const onSubmit = vi.fn().mockImplementation(async (_input: EventInput) => undefined);
    render(
      <CreateEventForm onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />
    );

    // 1. Comida (default preset: $25.00 -> 2500 cents)
    fireEvent.click(screen.getByRole('button', { name: /Crear y Obtener Enlace de Invitación/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        template: 'comida',
        priceCents: 2500,
      })
    );

    // 2. Casa (preset: $18.00 -> 1800 cents, explicitly includes limpieza alongside comida)
    onSubmit.mockClear();
    fireEvent.click(screen.getByRole('radio', { name: /En Casa/i }));
    fireEvent.click(screen.getByRole('button', { name: /Crear y Obtener Enlace de Invitación/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const casaCall = onSubmit.mock.calls[0][0] as EventInput;
    expect(casaCall.template).toBe('casa');
    expect(casaCall.priceCents).toBe(1800);
    const casaIncludesJoined = casaCall.includes.join(' ').toLowerCase();
    expect(casaIncludesJoined).toMatch(/limpieza/);
    expect(casaIncludesJoined).toMatch(/comida/);

    // 3. Viaje (preset: $65.00 -> 6500 cents, explicitly includes transporte alongside hospedaje)
    onSubmit.mockClear();
    fireEvent.click(screen.getByRole('radio', { name: /Viaje/i }));
    fireEvent.click(screen.getByRole('button', { name: /Crear y Obtener Enlace de Invitación/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const viajeCall = onSubmit.mock.calls[0][0] as EventInput;
    expect(viajeCall.template).toBe('viaje');
    expect(viajeCall.priceCents).toBe(6500);
    const viajeIncludesJoined = viajeCall.includes.join(' ').toLowerCase();
    expect(viajeIncludesJoined).toMatch(/transporte/);
    expect(viajeIncludesJoined).toMatch(/hospedaje/);

    // 4. Evento (preset: $40.00 -> 4000 cents)
    onSubmit.mockClear();
    fireEvent.click(screen.getByRole('radio', { name: /Evento/i }));
    fireEvent.click(screen.getByRole('button', { name: /Crear y Obtener Enlace de Invitación/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const eventoCall = onSubmit.mock.calls[0][0] as EventInput;
    expect(eventoCall.template).toBe('evento');
    expect(eventoCall.priceCents).toBe(4000);
  });

  it('agenda allows adding, editing (with optional maxLength 80 speaker), deleting, and empty agenda', async () => {
    const onSubmit = vi.fn().mockImplementation(async (_input: EventInput) => undefined);
    render(<CreateEventForm onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);

    // Add a new agenda item
    fireEvent.click(screen.getByRole('button', { name: /\+ Añadir horario/i }));

    // Find speaker inputs
    const speakerInputs = screen.getAllByPlaceholderText(/Expositor \(opcional\)/i);
    const lastSpeakerInput = speakerInputs[speakerInputs.length - 1] as HTMLInputElement;

    // Check maxLength constraint
    expect(lastSpeakerInput.maxLength).toBe(80);

    // Edit time, title, and speaker on the new item
    const timeInputs = screen.getAllByPlaceholderText('14:00');
    const lastTimeInput = timeInputs[timeInputs.length - 1];
    fireEvent.change(lastTimeInput, { target: { value: '17:30' } });

    const titleInputs = screen.getAllByPlaceholderText('Descripción de la actividad');
    const lastTitleInput = titleInputs[titleInputs.length - 1];
    fireEvent.change(lastTitleInput, { target: { value: 'Taller de Parrilla' } });

    fireEvent.change(lastSpeakerInput, { target: { value: 'Chef Alejandro' } });

    // Submit and verify speaker is included in payload
    fireEvent.click(screen.getByRole('button', { name: /Crear y Obtener Enlace de Invitación/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const submittedWithSpeaker = onSubmit.mock.calls[0][0] as EventInput;
    const addedItem = submittedWithSpeaker.agenda.find((a) => a.title === 'Taller de Parrilla');
    expect(addedItem).toBeDefined();
    expect(addedItem?.time).toBe('17:30');
    expect(addedItem?.speaker).toBe('Chef Alejandro');

    // Remove all agenda items
    onSubmit.mockClear();
    let deleteButtons = screen.getAllByRole('button', { name: /Eliminar punto de agenda/i });
    while (deleteButtons.length > 0) {
      fireEvent.click(deleteButtons[0]);
      deleteButtons = screen.queryAllByRole('button', { name: /Eliminar punto de agenda/i });
    }

    // Submit with empty agenda - must remain valid
    fireEvent.click(screen.getByRole('button', { name: /Crear y Obtener Enlace de Invitación/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const submittedEmptyAgenda = onSubmit.mock.calls[0][0] as EventInput;
    expect(submittedEmptyAgenda.agenda).toEqual([]);
  });

  it('initializes datetime-local with local 14:00 components and submits preserving expected instant in non-UTC', async () => {
    const onSubmit = vi.fn().mockImplementation(async (_input: EventInput) => undefined);
    render(<CreateEventForm onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);

    const dateInput = screen.getByLabelText(/Fecha y Hora \*/i) as HTMLInputElement;

    // The control value must be initialized to 14:00 in local date-time format (YYYY-MM-DDTHH:mm)
    // The old buggy code did `setHours(14) -> toISOString().slice(0, 16)`, which resulted in 19:00 in America/Guayaquil (UTC-5)
    expect(dateInput.value).toMatch(/T14:00$/);
    expect(dateInput.value).not.toMatch(/T19:00$/);

    // Submit without changing date
    fireEvent.click(screen.getByRole('button', { name: /Crear y Obtener Enlace de Invitación/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    const submitted = onSubmit.mock.calls[0][0] as EventInput;
    expect(typeof submitted.startsAt).toBe('string');
    expect(submitted.startsAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    // When the submitted UTC ISO string is parsed back into local time, its hour MUST be 14:00 local
    const instant = new Date(submitted.startsAt);
    expect(instant.getHours()).toBe(14);
    expect(instant.getMinutes()).toBe(0);

    // If running in America/Guayaquil (-05:00 offset = 300 minutes), 14:00 local translates to 19:00 UTC
    if (new Date().getTimezoneOffset() === 300) {
      expect(submitted.startsAt).toMatch(/T19:00:00\.000Z$/);
    }
  });

  it('renders optional speaker in public invitation when present', async () => {
    const mockEvent: FiestaEvent = {
      id: 'event-test-1',
      slug: 'test-agenda-speaker',
      title: 'Fiesta con Expositor',
      template: 'comida',
      meal: 'almuerzo',
      description: 'Prueba de agenda con expositor',
      startsAt: '2026-11-10T19:00:00.000Z',
      location: 'Quito Centro',
      includes: ['Comida', 'Bebidas'],
      priceCents: 2500,
      capacity: 20,
      goalCents: 50000,
      minimumCents: 25000,
      agenda: [
        { time: '14:00', title: 'Charla Magistral', speaker: 'Dra. María Palacios' },
        { time: '15:30', title: 'Brindis General' },
      ],
      confirmed: false,
      collectedCents: 0,
      confirmedPeople: 0,
      minimumReached: false,
      createdAt: '2026-10-21T00:00:00.000Z',
    };

    vi.spyOn(api, 'getEventBySlug').mockResolvedValue({
      event: mockEvent,
      guest: null,
    });

    render(
      <PublicInviteView
        slug="test-agenda-speaker"
        capabilities={null}
        onShowToast={vi.fn()}
        onNavigateHome={vi.fn()}
      />
    );

    // Wait for event to load
    await waitFor(() => {
      expect(screen.getByText('Fiesta con Expositor')).toBeInTheDocument();
    });

    // Check agenda rendering with speaker
    expect(screen.getByText('Charla Magistral')).toBeInTheDocument();
    expect(screen.getByText(/Expositor: Dra\. María Palacios/i)).toBeInTheDocument();

    // Check agenda item without speaker renders title but no expositor
    expect(screen.getByText('Brindis General')).toBeInTheDocument();
    expect(screen.queryByText(/Expositor: Brindis/i)).toBeNull();
  });
});
