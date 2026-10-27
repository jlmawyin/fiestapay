import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { api } from '../api/client';
import { CreateEventView } from '../views/CreateEventView';
import type { Capabilities, CreatedEvent, FiestaEvent } from '../types';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const pendingCaps: Capabilities = {
  paypal: false,
  paypalClientId: null,
  gemini: false,
  voice: false,
  sandbox: true,
  email: false,
};

const createdEvent: CreatedEvent = {
  event: {
    id: 'evt-1',
    slug: 'fiesta-nueva',
    title: 'Fiesta de prueba',
    template: 'comida',
    meal: 'almuerzo',
    description: '',
    startsAt: '2026-11-10T19:00:00.000Z',
    location: 'Parque',
    includes: [],
    priceCents: 2500,
    capacity: 10,
    goalCents: null,
    minimumCents: null,
    agenda: [],
    confirmed: false,
    collectedCents: 0,
    confirmedPeople: 0,
    minimumReached: false,
    createdAt: '2026-10-26T00:00:00.000Z',
  } satisfies FiestaEvent,
  adminKey: 'admin-key-1',
};

function fillCreateForm() {
  fireEvent.change(screen.getByLabelText(/Título del Evento/i), { target: { value: 'Fiesta de prueba' } });
  fireEvent.change(screen.getByLabelText(/Lugar o Dirección/i), { target: { value: 'Parque' } });
  fireEvent.change(screen.getByLabelText(/Cuota por persona/i), { target: { value: '25.00' } });
  fireEvent.change(screen.getByLabelText(/Capacidad máxima/i), { target: { value: '10' } });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
});

describe('capability ribbon pending and failure states', () => {
  it('does not flash PayPal/Chat configuration while the capabilities GET is pending, then shows resolved false', async () => {
    const caps = deferred<Capabilities>();
    vi.spyOn(api, 'getCapabilities').mockReturnValue(caps.promise);
    vi.spyOn(api, 'getOrganizerEvents').mockResolvedValue({ events: [] });

    render(<App />);

    expect(screen.getByText('PAGO DE PRUEBA')).toBeInTheDocument();
    expect(screen.getByText(/Comprobando PayPal y chat/)).toBeInTheDocument();
    expect(screen.queryByText(/No configurado/i)).toBeNull();
    expect(screen.queryByText(/Desactivado/i)).toBeNull();
    expect(screen.queryByText(/Configurado/i)).toBeNull();
    expect(screen.queryByText(/gemini/i)).toBeNull();

    await act(async () => {
      caps.resolve(pendingCaps);
    });

    expect(await screen.findByText('PayPal: No configurado')).toBeInTheDocument();
    expect(screen.getByText('Chat: Desactivado')).toBeInTheDocument();
    expect(screen.getByText('PAGO DE PRUEBA')).toBeInTheDocument();
    expect(screen.queryByText(/Comprobando PayPal y chat/)).toBeNull();
    expect(screen.queryByText(/gemini/i)).toBeNull();
  });

  it('shows an unavailable ribbon with retry after capabilities failure, not a configured or unconfigured guess', async () => {
    const getCaps = vi.spyOn(api, 'getCapabilities').mockRejectedValue(new Error('backend ausente'));
    vi.spyOn(api, 'getOrganizerEvents').mockResolvedValue({ events: [] });

    render(<App />);

    expect(await screen.findByText('PayPal: No disponible')).toBeInTheDocument();
    expect(screen.getByText('Chat: No disponible')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar Conexión' })).toBeInTheDocument();
    expect(screen.queryByText(/No configurado/i)).toBeNull();
    expect(screen.queryByText(/Desactivado/i)).toBeNull();
    expect(screen.queryByText(/Configurado/i)).toBeNull();
    expect(screen.queryByText(/gemini/i)).toBeNull();

    const retryCaps = deferred<Capabilities>();
    getCaps.mockReturnValue(retryCaps.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(getCaps).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(/Comprobando PayPal y chat/)).toBeInTheDocument();
    expect(screen.queryByText('PayPal: No disponible')).toBeNull();

    await act(async () => {
      retryCaps.resolve(pendingCaps);
    });

    expect(await screen.findByText('PayPal: No configurado')).toBeInTheDocument();
    expect(screen.getByText('Chat: Desactivado')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull();
  });
});

describe('create event pending progress and duplicate protection', () => {
  it('shows indeterminate creating status and issues one POST under a double submit', async () => {
    const pending = deferred<CreatedEvent>();
    const createEvent = vi.spyOn(api, 'createEvent').mockReturnValue(pending.promise);
    const sendChat = vi.spyOn(api, 'sendChat');
    const onEventCreated = vi.fn();
    const onShowToast = vi.fn();

    render(
      <CreateEventView
        onEventCreated={onEventCreated}
        onCancel={vi.fn()}
        onShowToast={onShowToast}
        recoveryAvailable={false}
      />,
    );

    fillCreateForm();
    const submit = screen.getByRole('button', { name: /Crear y Obtener Enlace de Invitación/i });
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(await screen.findByRole('status')).toHaveTextContent(/Creando la fiesta/);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByText(/\d+\s*%/)).toBeNull();
    expect(screen.queryByText(/paso\s+\d/i)).toBeNull();
    expect(createEvent).toHaveBeenCalledTimes(1);
    expect(sendChat).not.toHaveBeenCalled();
    expect(onEventCreated).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Enlaces de la fiesta')).toBeNull();

    await act(async () => {
      pending.resolve(createdEvent);
    });

    expect(await screen.findByLabelText('Enlaces de la fiesta')).toBeInTheDocument();
    expect(localStorage.getItem('fp_admin_fiesta-nueva')).toBe('admin-key-1');
    expect(onShowToast).toHaveBeenCalledWith(
      'success',
      '¡Fiesta "Fiesta de prueba" creada con éxito!',
      'Fiesta Creada',
    );
    expect(createEvent).toHaveBeenCalledTimes(1);
    expect(sendChat).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('clears creating status on error without fake success, and ignores a late result after unmount', async () => {
    const createEvent = vi.spyOn(api, 'createEvent').mockRejectedValue(new Error('Servidor ocupado'));
    const onEventCreated = vi.fn();
    const onShowToast = vi.fn();

    const { unmount } = render(
      <CreateEventView onEventCreated={onEventCreated} onCancel={vi.fn()} onShowToast={onShowToast} />,
    );

    fillCreateForm();
    fireEvent.click(screen.getByRole('button', { name: /Crear y Obtener Enlace de Invitación/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Servidor ocupado');
    expect(onShowToast).toHaveBeenCalledWith('error', 'Servidor ocupado', 'Error al crear');
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByLabelText('Enlaces de la fiesta')).toBeNull();
    expect(onEventCreated).not.toHaveBeenCalled();
    expect(localStorage.getItem('fp_admin_fiesta-nueva')).toBeNull();
    expect(createEvent).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Crear y Obtener Enlace de Invitación/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Servidor ocupado');
    expect(createEvent).toHaveBeenCalledTimes(2);

    unmount();

    const late = deferred<CreatedEvent>();
    createEvent.mockReturnValue(late.promise);
    const onEventCreatedLate = vi.fn();
    const onShowToastLate = vi.fn();
    const second = render(
      <CreateEventView
        onEventCreated={onEventCreatedLate}
        onCancel={vi.fn()}
        onShowToast={onShowToastLate}
      />,
    );

    fillCreateForm();
    fireEvent.click(screen.getByRole('button', { name: /Crear y Obtener Enlace de Invitación/i }));
    expect(await screen.findByRole('status')).toHaveTextContent(/Creando la fiesta/);
    second.unmount();

    await act(async () => {
      late.resolve(createdEvent);
    });

    expect(onEventCreatedLate).not.toHaveBeenCalled();
    expect(onShowToastLate).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Enlaces de la fiesta')).toBeNull();
    expect(localStorage.getItem('fp_admin_fiesta-nueva')).toBe('admin-key-1');
  });
});
