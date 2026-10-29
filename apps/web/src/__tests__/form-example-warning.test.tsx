import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import { CreateEventForm } from '../components/events/CreateEventForm';
import type { CreatedEvent, EventInput, FiestaEvent } from '../types';
import { CreateEventView } from '../views/CreateEventView';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

const pad = (n: number): string => String(n).padStart(2, '0');

function localInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fillMoney(price = '25.00', capacity = '8') {
  fireEvent.change(screen.getByLabelText(/Cuota por persona/i), { target: { value: price } });
  fireEvent.change(screen.getByLabelText(/Capacidad máxima/i), { target: { value: capacity } });
}

function fillRealBasics() {
  fireEvent.change(screen.getByLabelText(/Título del Evento/i), { target: { value: 'Asado en el parque' } });
  fireEvent.change(screen.getByLabelText(/Lugar o Dirección/i), { target: { value: 'Parque La Carolina' } });
  fillMoney();
}

function fillExactExamples() {
  fireEvent.change(screen.getByLabelText(/Título del Evento/i), { target: { value: 'Nombre de la fiesta' } });
  fireEvent.change(screen.getByLabelText(/Lugar o Dirección/i), { target: { value: 'Lugar o direccion' } });
  fireEvent.change(screen.getByLabelText(/Descripción para los invitados/i), { target: { value: 'Que van a hacer' } });
  fireEvent.change(screen.getByLabelText(/Qué incluye la cuota/i), { target: { value: 'Separa con comas' } });
  fillMoney('40.00', '6');
}

function submitCreate() {
  fireEvent.click(screen.getByRole('button', { name: 'Revisar invitación' }));
  const publish = screen.queryByRole('button', { name: 'Publicar invitación' });
  if (publish) fireEvent.click(publish);
}

function exampleAlert() {
  return screen.getByRole('alert', { name: /texto de ejemplo/i });
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('example placeholder warning', () => {
  it('blocks the first submit of exact placeholder values and names the fields', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CreateEventForm onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    fillExactExamples();
    submitCreate();

    const alert = exampleAlert();
    expect(alert).toHaveAttribute('id', 'example-values-warning');
    expect(alert).toHaveTextContent('Título del Evento: Nombre de la fiesta');
    expect(alert).toHaveTextContent('Lugar o Dirección: Lugar o direccion');
    expect(alert).toHaveTextContent('Descripción para los invitados: Que van a hacer');
    expect(alert).toHaveTextContent('¿Qué incluye la cuota? (Separados por coma): Separa con comas');
    expect(screen.getByRole('button', { name: 'Revisar campos' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Publicar estos valores' })).toBeEnabled();
    expect(document.activeElement).toBe(document.getElementById('example-values-warning'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();

    submitCreate();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('treats trim, case, and accents as the same placeholder and ignores a longer sentence', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CreateEventForm onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    fireEvent.change(screen.getByLabelText(/Título del Evento/i), { target: { value: '  NOMBRE DE LA FIESTA  ' } });
    fireEvent.change(screen.getByLabelText(/Lugar o Dirección/i), { target: { value: 'lugar o dirección' } });
    fireEvent.change(screen.getByLabelText(/Descripción para los invitados/i), {
      target: { value: 'Vamos a usar un ejemplo de lo que van a hacer en la tarde.' },
    });
    fillMoney();
    submitCreate();

    const alert = exampleAlert();
    expect(alert).toHaveTextContent(/Título del Evento:\s*NOMBRE DE LA FIESTA/);
    expect(alert).toHaveTextContent('Lugar o Dirección: lugar o dirección');
    expect(alert).not.toHaveTextContent('Vamos a usar un ejemplo');
    expect(screen.getByLabelText(/Título del Evento/i)).toHaveValue('  NOMBRE DE LA FIESTA  ');
    expect(screen.getByLabelText(/Lugar o Dirección/i)).toHaveValue('lugar o dirección');
    expect(screen.getByLabelText(/Descripción para los invitados/i)).toHaveValue(
      'Vamos a usar un ejemplo de lo que van a hacer en la tarde.',
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps every input when the organizer chooses to revise and focuses the first field', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CreateEventForm onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    fireEvent.change(screen.getByLabelText(/Tipo de Comida/i), { target: { value: 'cena' } });
    fireEvent.click(screen.getByRole('radio', { name: /Viaje/i }));
    fillExactExamples();
    fireEvent.change(screen.getByLabelText(/Mínimo requerido/i), { target: { value: '50.00' } });
    fireEvent.change(screen.getByLabelText(/Meta ideal/i), { target: { value: '80.00' } });
    fireEvent.change(screen.getByLabelText(/Codigo de acceso/i), { target: { value: 'mesa-3' } });
    fireEvent.click(screen.getByRole('button', { name: /\+ Añadir horario/i }));
    fireEvent.change(screen.getByLabelText(/Hora actividad 1/i), { target: { value: '19:00' } });
    fireEvent.change(screen.getByLabelText(/Título actividad 1/i), { target: { value: 'Bienvenida' } });
    fireEvent.change(screen.getByLabelText(/Expositor actividad 1/i), { target: { value: 'Ana' } });
    const start = (screen.getByLabelText(/Fecha y Hora/i) as HTMLInputElement).value;
    const end = (screen.getByLabelText(/Hora de fin/i) as HTMLInputElement).value;
    submitCreate();
    expect(exampleAlert()).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Revisar campos' }));

    expect(screen.queryByRole('button', { name: 'Publicar estos valores' })).toBeNull();
    expect(document.activeElement).toBe(document.getElementById('event-title'));
    expect(screen.getByLabelText(/Título del Evento/i)).toHaveValue('Nombre de la fiesta');
    expect(screen.getByLabelText(/Lugar o Dirección/i)).toHaveValue('Lugar o direccion');
    expect(screen.getByLabelText(/Descripción para los invitados/i)).toHaveValue('Que van a hacer');
    expect(screen.getByLabelText(/Qué incluye la cuota/i)).toHaveValue('Separa con comas');
    expect(screen.getByLabelText(/Cuota por persona/i)).toHaveValue(40);
    expect(screen.getByLabelText(/Capacidad máxima/i)).toHaveValue(6);
    expect(screen.getByLabelText(/Mínimo requerido/i)).toHaveValue(50);
    expect(screen.getByLabelText(/Meta ideal/i)).toHaveValue(80);
    expect(screen.queryByLabelText(/Tipo de Comida/i)).toBeNull();
    expect(screen.queryByText(/TIPO DE COMIDA/i)).toBeNull();
    expect(screen.getByRole('radio', { name: /Viaje/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText(/Codigo de acceso/i)).toHaveValue('mesa-3');
    expect(screen.getByLabelText(/Hora actividad 1/i)).toHaveValue('19:00');
    expect(screen.getByLabelText(/Título actividad 1/i)).toHaveValue('Bienvenida');
    expect(screen.getByLabelText(/Expositor actividad 1/i)).toHaveValue('Ana');
    expect(screen.getByLabelText(/Fecha y Hora/i)).toHaveValue(start);
    expect(screen.getByLabelText(/Hora de fin/i)).toHaveValue(end);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('publishes the current reviewed values once from the explicit action', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CreateEventForm onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    fireEvent.change(screen.getByLabelText(/Descripción para los invitados/i), { target: { value: '  qué van a hacer  ' } });
    fillRealBasics();
    submitCreate();
    expect(document.activeElement).toBe(document.getElementById('example-values-warning'));
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Publicar estos valores' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0] as EventInput;
    expect(payload.title).toBe('Asado en el parque');
    expect(payload.location).toBe('Parque La Carolina');
    expect(payload.description).toBe('qué van a hacer');
    expect(payload.priceCents).toBe(2500);
    expect(payload.capacity).toBe(8);
    expect(payload.template).toBe('comida');
  });

  it('drops a stale review after an edit and publishes the values currently on screen', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CreateEventForm onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    fillExactExamples();
    submitCreate();
    expect(screen.getByRole('button', { name: 'Publicar estos valores' })).toBeEnabled();

    fireEvent.click(screen.getByRole('radio', { name: /En Casa/i }));
    fireEvent.change(screen.getByLabelText(/Título del Evento/i), { target: { value: 'Asado real' } });
    expect(screen.queryByRole('button', { name: 'Publicar estos valores' })).toBeNull();
    submitCreate();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(exampleAlert()).toHaveTextContent('Lugar o Dirección: Lugar o direccion');
    expect(exampleAlert()).not.toHaveTextContent('Asado real');

    fireEvent.change(screen.getByLabelText(/Lugar o Dirección/i), { target: { value: 'Casa de Luis' } });
    fireEvent.change(screen.getByLabelText(/Descripción para los invitados/i), {
      target: { value: 'Traer una silla.' },
    });
    fireEvent.change(screen.getByLabelText(/Qué incluye la cuota/i), { target: { value: 'Picada, jugo' } });
    expect(screen.queryByRole('button', { name: 'Publicar estos valores' })).toBeNull();
    submitCreate();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0] as EventInput;
    expect(payload.template).toBe('casa');
    expect(payload.title).toBe('Asado real');
    expect(payload.location).toBe('Casa de Luis');
    expect(payload.description).toBe('Traer una silla.');
    expect(payload.includes).toEqual(['Picada', 'jugo']);
    expect(payload.title).not.toBe('Nombre de la fiesta');
  });

  it('submits genuine prose and keeps the meal override without a warning', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CreateEventForm onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    fireEvent.change(screen.getByLabelText(/Tipo de Comida/i), { target: { value: 'desayuno' } });
    fireEvent.click(screen.getByRole('radio', { name: /Evento/i }));
    const start = screen.getByLabelText(/Fecha y Hora/i) as HTMLInputElement;
    const evening = new Date(start.value);
    evening.setHours(20, 30, 0, 0);
    fireEvent.change(start, { target: { value: localInput(evening) } });
    fillRealBasics();
    fireEvent.change(screen.getByLabelText(/Descripción para los invitados/i), {
      target: { value: 'Este texto solo discute un ejemplo de invitación y no copia el placeholder.' },
    });
    fireEvent.change(screen.getByLabelText(/Qué incluye la cuota/i), { target: { value: 'Música, lugar' } });
    submitCreate();

    expect(screen.queryByRole('button', { name: 'Publicar estos valores' })).toBeNull();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0] as EventInput;
    expect(payload.template).toBe('evento');
    expect(payload.meal).toBe('desayuno');
    expect(payload.description).toContain('ejemplo');
    expect(payload.includes).toEqual(['Música', 'lugar']);
    expect(screen.queryByLabelText(/Tipo de Comida/i)).toBeNull();
  });

  it('still blocks invalid fields before any example prompt', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CreateEventForm onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    fireEvent.change(screen.getByLabelText(/Lugar o Dirección/i), { target: { value: 'Lugar o direccion' } });
    fillMoney();
    submitCreate();
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe un titulo.');
    expect(screen.queryByRole('button', { name: 'Publicar estos valores' })).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Título del Evento/i), { target: { value: 'Nombre de la fiesta' } });
    fireEvent.change(screen.getByLabelText(/Cuota por persona/i), { target: { value: '0' } });
    submitCreate();
    expect(screen.getByRole('alert')).toHaveTextContent('La cuota por persona debe ser mayor a 0.');
    expect(screen.queryByRole('button', { name: 'Publicar estos valores' })).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disables review actions while loading and does not submit', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const view = render(<CreateEventForm onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    fillExactExamples();
    submitCreate();
    expect(screen.getByRole('button', { name: 'Publicar estos valores' })).toBeEnabled();

    view.rerender(<CreateEventForm onSubmit={onSubmit} onCancel={vi.fn()} isLoading />);
    expect(screen.getByRole('button', { name: 'Publicar estos valores' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Revisar campos' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Guardando/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Publicar estos valores' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revisar campos' }));
    fireEvent.click(screen.getByRole('button', { name: /Guardando/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Título del Evento/i)).toHaveValue('Nombre de la fiesta');
  });

  it('lets the existing create view publish an acknowledged example only once', async () => {
    const pending = deferred<CreatedEvent>();
    const createEvent = vi.spyOn(api, 'createEvent').mockReturnValue(pending.promise);
    render(
      <CreateEventView onEventCreated={vi.fn()} onCancel={vi.fn()} onShowToast={vi.fn()} recoveryAvailable={false} />,
    );
    fillExactExamples();
    submitCreate();
    expect(exampleAlert()).toBeInTheDocument();
    expect(createEvent).not.toHaveBeenCalled();

    const publish = screen.getByRole('button', { name: 'Publicar estos valores' });
    fireEvent.click(publish);
    fireEvent.click(publish);

    expect(createEvent).toHaveBeenCalledTimes(1);
    const payload = createEvent.mock.calls[0][0] as EventInput;
    expect(payload.title).toBe('Nombre de la fiesta');
    expect(payload.location).toBe('Lugar o direccion');
    expect(payload.description).toBe('Que van a hacer');
    expect(payload.includes).toEqual(['Separa con comas']);
    expect(screen.getByRole('button', { name: 'Publicar estos valores' })).toBeDisabled();

    const created: CreatedEvent = {
      event: {
        id: 'evt-example',
        slug: 'fiesta-ejemplo',
        title: payload.title,
        template: payload.template,
        meal: payload.meal,
        description: payload.description,
        startsAt: payload.startsAt,
        endsAt: payload.endsAt,
        location: payload.location,
        includes: payload.includes,
        agenda: payload.agenda,
        priceCents: payload.priceCents,
        capacity: payload.capacity,
        goalCents: null,
        minimumCents: null,
        confirmed: false,
        collectedCents: 0,
        confirmedPeople: 0,
        minimumReached: false,
        createdAt: '2026-10-27T00:00:00.000Z',
      },
      adminKey: 'admin-key-example',
    };
    await act(async () => {
      pending.resolve(created);
    });
    expect(createEvent).toHaveBeenCalledTimes(1);
  });

  it('renders a hostile literal as text and submits that same string', async () => {
    const hostile = '<img src=x onerror="alert(1)"><script>alert(1)</script>';
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CreateEventForm onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    fireEvent.change(screen.getByLabelText(/Título del Evento/i), { target: { value: 'Nombre de la fiesta' } });
    fireEvent.change(screen.getByLabelText(/Lugar o Dirección/i), { target: { value: 'Parque' } });
    fireEvent.change(screen.getByLabelText(/Descripción para los invitados/i), { target: { value: hostile } });
    fillMoney();
    submitCreate();

    const alert = exampleAlert();
    expect(alert).toHaveTextContent('Título del Evento: Nombre de la fiesta');
    expect(alert.querySelector('script, img')).toBeNull();
    expect(document.getElementsByTagName('script')).toHaveLength(0);
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByLabelText(/Descripción para los invitados/i)).toHaveValue(hostile);
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Título del Evento/i), { target: { value: hostile } });
    expect(screen.queryByRole('button', { name: 'Publicar estos valores' })).toBeNull();
    submitCreate();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0] as EventInput;
    expect(payload.title).toBe(hostile);
    expect(payload.description).toBe(hostile);
    expect(document.getElementsByTagName('script')).toHaveLength(0);
    expect(document.querySelector('img')).toBeNull();
  });

  it('keeps an edited event\'s own values when one field is still an example', async () => {
    const starts = new Date();
    starts.setDate(starts.getDate() + 12);
    starts.setHours(16, 0, 0, 0);
    const ends = new Date(starts.getTime() + 4 * 60 * 60 * 1000);
    const initial: FiestaEvent = {
      id: 'evt-edit',
      slug: 'cumple-ana',
      title: 'Cumpleaños de Ana',
      template: 'casa',
      meal: 'cena',
      description: 'Que van a hacer',
      startsAt: starts.toISOString(),
      endsAt: ends.toISOString(),
      location: 'Sala de Ana',
      includes: ['Torta', 'Café'],
      agenda: [{ time: '18:00', title: 'Brindis', speaker: 'Ana' }],
      priceCents: 1800,
      capacity: 12,
      goalCents: 5000,
      minimumCents: null,
      confirmed: false,
      collectedCents: 0,
      confirmedPeople: 0,
      minimumReached: false,
      createdAt: '2026-10-01T00:00:00.000Z',
      fundingStatus: 'open',
      fundingDeadlineAt: null,
    };
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <CreateEventForm
        initial={initial}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        isLoading={false}
        submitLabel="Guardar cambios"
      />,
    );
    expect(screen.getByLabelText(/Título del Evento/i)).toHaveValue('Cumpleaños de Ana');
    expect(screen.getByLabelText(/Qué incluye la cuota/i)).toHaveValue('Torta, Café');
    expect(screen.getByLabelText(/Título actividad 1/i)).toHaveValue('Brindis');

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(onSubmit).not.toHaveBeenCalled();
    const alert = exampleAlert();
    expect(alert).toHaveTextContent('Descripción para los invitados: Que van a hacer');
    expect(alert).not.toHaveTextContent('Cumpleaños de Ana');
    expect(screen.getByLabelText(/Título del Evento/i)).toHaveValue('Cumpleaños de Ana');
    expect(screen.getByLabelText(/Expositor actividad 1/i)).toHaveValue('Ana');

    fireEvent.click(screen.getByRole('button', { name: 'Revisar campos' }));
    expect(document.activeElement).toBe(document.getElementById('event-desc'));
    expect(screen.getByLabelText(/Descripción para los invitados/i)).toHaveValue('Que van a hacer');
    expect(screen.getByLabelText(/Cuota por persona/i)).toHaveValue(18);
    expect(screen.getByRole('radio', { name: /En Casa/i })).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    fireEvent.click(screen.getByRole('button', { name: 'Publicar estos valores' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0] as EventInput;
    expect(payload.title).toBe('Cumpleaños de Ana');
    expect(payload.description).toBe('Que van a hacer');
    expect(payload.meal).toBe('cena');
    expect(payload.template).toBe('casa');
    expect(payload.agenda).toEqual([{ time: '18:00', title: 'Brindis', speaker: 'Ana' }]);
    expect(payload.includes).toEqual(['Torta', 'Café']);
    expect(payload.priceCents).toBe(1800);
    expect(Object.prototype.hasOwnProperty.call(payload, 'fundingDeadlineAt')).toBe(false);
  });
});

describe('event start must be strictly in the future', () => {
  function freeze(now: Date) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
  }

  function renderReady() {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CreateEventForm onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    fillRealBasics();
    return onSubmit;
  }

  it('rejects a start thirty seconds before the frozen clock', () => {
    const now = new Date(2026, 10, 15, 18, 0, 30, 0);
    const startValue = localInput(new Date(now.getTime() - 30_000));
    freeze(now);
    const onSubmit = renderReady();
    fireEvent.change(screen.getByLabelText(/Fecha y Hora/i), { target: { value: startValue } });
    submitCreate();
    expect(screen.getByRole('alert')).toHaveTextContent('El inicio debe ser en el futuro.');
    expect(screen.queryByRole('button', { name: 'Publicar estos valores' })).toBeNull();
    expect(screen.getByLabelText(/Fecha y Hora/i)).toHaveValue(startValue);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects a start equal to the frozen clock', () => {
    const now = new Date(2026, 10, 15, 18, 0, 0, 0);
    const startValue = localInput(now);
    freeze(now);
    const onSubmit = renderReady();
    fireEvent.change(screen.getByLabelText(/Fecha y Hora/i), { target: { value: startValue } });
    submitCreate();
    expect(screen.getByRole('alert')).toHaveTextContent('El inicio debe ser en el futuro.');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('accepts a start thirty seconds after the frozen clock', async () => {
    const now = new Date(2026, 10, 15, 18, 0, 30, 0);
    const future = new Date(now.getTime() + 30_000);
    const startValue = localInput(future);
    const expectedStartMs = new Date(2026, 10, 15, 18, 1, 0, 0).getTime();
    freeze(now);
    const onSubmit = renderReady();
    fireEvent.change(screen.getByLabelText(/Fecha y Hora/i), { target: { value: startValue } });
    submitCreate();
    expect(screen.queryByText('El inicio debe ser en el futuro.')).toBeNull();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    const payload = onSubmit.mock.calls[0][0] as EventInput;
    expect(new Date(payload.startsAt).getTime()).toBe(expectedStartMs);
    expect(expectedStartMs).toBeGreaterThan(now.getTime());
    expect(new Date(payload.endsAt).getTime()).toBeGreaterThan(expectedStartMs);
  });
});
