import { describe, it, expect, vi } from 'vitest';
import { api } from '../api/client';
import type { FiestaEvent } from '../types';

describe('RSVP, Capacity and Event Confirmation (Docs/API.md)', () => {
  it('updates RSVP and receives updated event and guest status', async () => {
    const mockResponse = {
      guest: { id: 'g-10', name: 'Valeria', status: 'yes' as const, companions: 2, paidCents: 0, dueCents: 7500 },
      event: {
        id: 'ev-1',
        slug: 'asado-fiesta',
        title: 'Asado Fiesta',
        confirmedPeople: 3,
        collectedCents: 0,
      },
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const res = await api.rsvp('asado-fiesta', 'yes', 2);
    expect(res.guest.companions).toBe(2);
    expect(res.event.confirmedPeople).toBe(3);

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/events/asado-fiesta/rsvp',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ status: 'yes', companions: 2 }),
      })
    );
  });

  it('rejects confirmation when minimum threshold is configured but not reached', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Minimum amount not reached yet' }),
    } as Response);

    await expect(api.confirmEvent('asado-fiesta')).rejects.toThrow('Minimum amount not reached yet');
  });

  it('allows organizer confirmation when minimum is reached', async () => {
    const confirmedEvent: Partial<FiestaEvent> = {
      id: 'ev-1',
      slug: 'asado-fiesta',
      confirmed: true,
      minimumReached: true,
      collectedCents: 15000,
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ event: confirmedEvent }),
    } as Response);

    const res = await api.confirmEvent('asado-fiesta');
    expect(res.event.confirmed).toBe(true);
  });

  it('resets demo generation for organizer and returns new event', async () => {
    const newDemoEvent: Partial<FiestaEvent> = {
      id: 'ev-demo-2',
      slug: 'comida-demo-2',
      title: 'Comida Demo (Seeded)',
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ event: newDemoEvent }),
    } as Response);

    const res = await api.resetDemo();
    expect(res.event.id).toBe('ev-demo-2');
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/demo/reset',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
