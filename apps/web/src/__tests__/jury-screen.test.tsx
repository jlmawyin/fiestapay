import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GuestGrid } from '../components/dashboard/GuestGrid';
import { CreateEventForm } from '../components/events/CreateEventForm';
import type { EventInput } from '../types';
import { usd } from '../types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function fillForm({ minimum = '', goal = '' }: { minimum?: string; goal?: string } = {}) {
  fireEvent.change(screen.getByLabelText(/Título del Evento/i), {
    target: { value: 'Cena de prueba' },
  });
  fireEvent.change(screen.getByLabelText(/Lugar o Dirección/i), {
    target: { value: 'Casa de Ana' },
  });
  fireEvent.change(screen.getByLabelText(/Cuota por persona/i), { target: { value: '25.00' } });
  fireEvent.change(screen.getByLabelText(/Capacidad máxima/i), { target: { value: '10' } });
  if (minimum) {
    fireEvent.change(screen.getByLabelText(/Mínimo requerido/i), { target: { value: minimum } });
  }
  if (goal) {
    fireEvent.change(screen.getByLabelText(/Meta ideal/i), { target: { value: goal } });
  }
}

function review() {
  fireEvent.click(screen.getByRole('button', { name: 'Revisar invitación' }));
}

function reviewSummary(): HTMLElement {
  return screen.getByRole('region', { name: 'Resumen de la invitación' });
}

function reviewedAmount(label: string): HTMLElement {
  const term = within(reviewSummary()).getByText(label);
  return term.nextElementSibling as HTMLElement;
}

describe('review summary money goals', () => {
  it('shows the reviewed minimum and goal amounts with usd formatting', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CreateEventForm onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    fillForm({ minimum: '50.00', goal: '80.00' });
    review();

    expect(reviewedAmount('Mínimo requerido')).toHaveTextContent(usd(5000));
    expect(reviewedAmount('Meta ideal')).toHaveTextContent(usd(8000));
    expect(within(reviewSummary()).queryByText('Sin mínimo')).toBeNull();
    expect(within(reviewSummary()).queryByText('Sin meta')).toBeNull();
  });

  it('shows the exact null labels when the reviewed payload has no amounts', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CreateEventForm onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    fillForm();
    review();

    expect(reviewedAmount('Mínimo requerido')).toHaveTextContent('Sin mínimo');
    expect(reviewedAmount('Meta ideal')).toHaveTextContent('Sin meta');
    expect(within(reviewSummary()).queryByText(usd(0))).toBeNull();
  });

  it('drops a stale summary after an edit, refreshes it, and publishes the reviewed amounts', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CreateEventForm onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    fillForm({ minimum: '50.00', goal: '80.00' });
    review();

    expect(reviewedAmount('Mínimo requerido')).toHaveTextContent(usd(5000));
    expect(reviewedAmount('Meta ideal')).toHaveTextContent(usd(8000));

    fireEvent.change(screen.getByLabelText(/Mínimo requerido/i), {
      target: { value: '60.00' },
    });

    expect(screen.queryByRole('region', { name: 'Resumen de la invitación' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Publicar invitación' })).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();

    review();

    expect(reviewedAmount('Mínimo requerido')).toHaveTextContent(usd(6000));
    expect(reviewedAmount('Meta ideal')).toHaveTextContent(usd(8000));

    fireEvent.click(screen.getByRole('button', { name: 'Publicar invitación' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0] as EventInput;
    expect(payload.priceCents).toBe(2500);
    expect(payload.minimumCents).toBe(6000);
    expect(payload.goalCents).toBe(8000);
  });
});

describe('guest grid empty state', () => {
  it('renders the real AgGrid empty overlay with the Aún no hay aportes locale text', async () => {
    render(<GuestGrid guests={[]} eventTitle="Fiesta" inviteUrl="https://example.com/f/fiesta" />);

    await waitFor(() => {
      expect(screen.getByText('Aún no hay aportes')).toBeInTheDocument();
    });
  });
});
