/**
 * NAP-U4 — invitación sin PayPal, botón final de asistencia e ilustración por plantilla.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nContext';
import { PublicInviteView } from '../views/PublicInviteView';
import { InviteHeroIllustration, inviteIllustrationFor } from '../components/invite/InviteHeroIllustration';
import { api } from '../api/client';
import type { Capabilities, FiestaEvent, Quote } from '../types';

const capsNone: Capabilities = {
  paypal: false,
  paypalClientId: null,
  paymentProvider: 'none',
  sandbox: true,
  email: false,
  avatar: false,
};

const eventNone: FiestaEvent = {
  id: 'evt-u4-none',
  slug: 'colecta-u4',
  title: 'Cena de reencuentro',
  template: 'comida',
  meal: 'cena',
  description: 'Nos vemos para compartir.',
  startsAt: '2026-12-15T19:00:00.000Z',
  endsAt: '2026-12-15T23:00:00.000Z',
  location: 'Quito',
  includes: [],
  agenda: [],
  priceCents: 1500,
  capacity: 12,
  goalCents: null,
  minimumCents: null,
  confirmed: false,
  collectedCents: 0,
  confirmedPeople: 0,
  minimumReached: false,
  createdAt: '2026-10-20T00:00:00Z',
  paymentProvider: 'none',
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('fp_locale', 'es');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('invitación sin PayPal (NAP-U4)', () => {
  it('no muestra PayPal, explica la colecta y termina con Confirmar asistencia', async () => {
    const getQuote = vi.spyOn(api, 'getQuote').mockResolvedValue({ quote: {} as Quote });
    vi.spyOn(api, 'getEventBySlug').mockResolvedValue({
      event: eventNone,
      guest: {
        id: 'g-u4',
        name: 'Invitada',
        status: 'maybe',
        companions: 0,
        paidCents: 0,
        dueCents: 0,
      },
    });
    render(
      <I18nProvider>
        <PublicInviteView
          slug="colecta-u4"
          capabilities={capsNone}
          onShowToast={vi.fn()}
          onNavigateHome={vi.fn()}
        />
      </I18nProvider>,
    );
    expect(await screen.findByText('Cena de reencuentro')).toBeInTheDocument();
    expect(screen.queryByText(/PayPal/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Generar pago/i })).not.toBeInTheDocument();
    expect(screen.getByText(/colecta entre panas/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar asistencia' })).toBeInTheDocument();
    expect(getQuote).not.toHaveBeenCalled();
  });

  it('elige una ilustración propia para cada plantilla', () => {
    expect(inviteIllustrationFor('comida')).toBe('comida');
    expect(inviteIllustrationFor('casa')).toBe('cumpleanos');
    expect(inviteIllustrationFor('evento')).toBe('reencuentro');
    expect(inviteIllustrationFor('viaje')).toBe('paseo');
    const { container, rerender } = render(<I18nProvider><InviteHeroIllustration template="casa" locale="es" /></I18nProvider>);
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('data-illustration', 'cumpleanos');
    expect(img).toHaveAttribute('src', '/ilustraciones/cumpleanos.svg');
    rerender(<I18nProvider><InviteHeroIllustration template="viaje" locale="en" /></I18nProvider>);
    expect(container.querySelector('img')).toHaveAttribute('src', '/ilustraciones/paseo.svg');
  });
});
