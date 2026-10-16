import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicInviteView } from '../views/PublicInviteView';
import { api } from '../api/client';
import type { FiestaEvent, Guest } from '../types';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Assistant RSVP confirmation', () => {
  it('keeps a rejected capacity proposal unconfirmed and retryable', async () => {
    const guest: Guest = { id: 'guest-one', name: 'Invitado demo', status: 'maybe', companions: 0, paidCents: 0, dueCents: 0 };
    const event: FiestaEvent = {
      id: 'event-one', slug: 'fiesta', title: 'Comida demo', template: 'comida', meal: 'almuerzo',
      description: 'Evento de prueba', startsAt: '2099-01-01T12:00:00Z', location: 'Casa', includes: [],
      priceCents: 2500, capacity: 1, goalCents: null, minimumCents: null, agenda: [],
      confirmed: false, collectedCents: 0, confirmedPeople: 1, minimumReached: false, createdAt: '2026-01-01T00:00:00Z',
    };
    vi.spyOn(api, 'getEventBySlug').mockResolvedValue({ event, guest });
    vi.spyOn(api, 'sendChat').mockResolvedValue({ text: 'Revisa la propuesta', actions: ['rsvp:yes:1'] });
    vi.spyOn(api, 'rsvp').mockRejectedValue(new Error('Capacidad insuficiente'));
    const onShowToast = vi.fn();
    render(<PublicInviteView slug="fiesta" capabilities={{ gemini: true, voice: false, paypal: false, paypalClientId: null, sandbox: true }} onShowToast={onShowToast} onNavigateHome={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir asistente IA' }));
    const input = screen.getByRole('textbox', { name: /Mensaje para el asistente/i });
    fireEvent.change(input, { target: { value: 'Quiero asistir con un acompañante' } });
    fireEvent.submit(input.closest('form')!);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar Asistencia' }));
    await waitFor(() => expect(onShowToast).toHaveBeenCalledWith('error', 'Capacidad insuficiente', 'Error de cupo'));
    expect(screen.queryByRole('button', { name: /Asistencia Confirmada en el Servidor/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar Asistencia' })).toBeEnabled();
  });
});
