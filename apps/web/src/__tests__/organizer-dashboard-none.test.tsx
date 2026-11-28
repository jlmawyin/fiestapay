/**
 * NAP-U3 — panel de reunión sin PayPal (`paymentProvider: 'none'`): ningún
 * texto ni botón de PayPal; la cuota es colecta entre panas y el panel
 * muestra la dirección propia, los dos QR (el de administrador distinto) y
 * los botones de compartir. Sin red: API falsa.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrganizerDashboardView } from '../views/OrganizerDashboardView';
import { api, type AvatarCatalogItem } from '../api/client';
import type { Dashboard } from '../types';

vi.mock('ag-grid-react', () => ({
  AgGridReact: () => <div data-testid="guest-grid" />,
}));

vi.mock('@touchcastllc/napster-companion-api', () => ({
  NapsterCompanionApiSdk: { init: vi.fn() },
  DataChannelMessageType: { SEND_MESSAGE: 'send_message', FUNCTION_CALL_OUTPUT: 'send_function_output' },
}));

const SLUG = 'asado-sabado';

const dashboardNone = (): Dashboard => ({
  event: {
    id: 'evt-1',
    slug: SLUG,
    title: 'Asado del sábado',
    template: 'comida',
    meal: 'cena',
    description: '',
    startsAt: '2026-12-12T18:00:00.000Z',
    endsAt: '2026-12-12T21:00:00.000Z',
    location: 'Mi casa',
    includes: [],
    agenda: [],
    priceCents: 2500,
    capacity: 10,
    goalCents: null,
    minimumCents: null,
    confirmed: false,
    collectedCents: 0,
    confirmedPeople: 0,
    minimumReached: false,
    createdAt: '2026-11-28T00:00:00.000Z',
    subdomain: 'asado-sabado',
    publicUrl: 'https://asado-sabado.somospanas.com',
    paymentProvider: 'none',
    avatarId: 'marco',
  },
  guests: [],
  audit: [],
});

const AVATARS: { avatars: AvatarCatalogItem[] } = {
  avatars: [
    { id: 'elena', firstName: 'Elena', displayName: 'Elena Navarro', gender: 'female', previewUrl: 'https://img/e.jpg', loopUrl: null, tags: ['fiesta'], default: true },
    { id: 'marco', firstName: 'Marco', displayName: 'Marco Paz', gender: 'male', previewUrl: 'https://img/m.jpg', loopUrl: null, tags: ['karaoke'], default: false },
  ],
};

describe('panel de reunión sin PayPal (NAP-U3)', () => {
  beforeEach(() => {
    localStorage.setItem('fp_locale', 'es');
    localStorage.setItem(`fp_admin_${SLUG}`, 'clave-1');
    Element.prototype.scrollIntoView = vi.fn();
    // jsdom no trae canvas: el QR oculto y el dibujo lo toleran (null).
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('sin PayPal: colecta, dirección propia, dos QR y compartir', async () => {
    vi.spyOn(api, 'getDashboard').mockResolvedValue(dashboardNone());
    vi.spyOn(api, 'getAvatars').mockResolvedValue(AVATARS);
    render(
      <OrganizerDashboardView
        slug={SLUG}
        capabilities={null}
        onNavigateInvite={vi.fn()}
        onNavigateHome={vi.fn()}
        onShowToast={vi.fn()}
      />,
    );

    expect(await screen.findByTestId('dashboard-colecta')).toHaveTextContent('Colecta entre panas');
    // NAP-U5: quién recibe a los invitados, con opción de cambiarla.
    expect(await screen.findByTestId('host-avatar')).toBeInTheDocument();
    expect(screen.getByTestId('host-avatar-name')).toHaveTextContent('Marco Paz');
    expect(screen.getByTestId('host-avatar-change')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-public-url')).toHaveTextContent('https://asado-sabado.somospanas.com');
    expect(screen.getByTestId('share-guest-qr').querySelector('svg')).toBeTruthy();
    expect(screen.getByTestId('share-admin-qr').querySelector('svg')).toBeTruthy();
    expect(screen.getByTestId('share-admin-warning')).toHaveTextContent(
      'No compartas este QR: abre tu panel de organizador',
    );
    expect(screen.getByTestId('share-buttons')).toBeInTheDocument();
    expect(screen.getByTestId('share-download-square')).toBeInTheDocument();
    expect(screen.getByTestId('share-download-story')).toBeInTheDocument();
    expect(screen.getByTestId('share-whatsapp')).toHaveAttribute(
      'href',
      expect.stringMatching(/^https:\/\/wa\.me\/\?text=/),
    );
    expect(screen.getByTestId('share-copy-link')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/PayPal/);
  });

  it('con PayPal conserva el panel de actividad', async () => {
    const data = dashboardNone();
    data.event.paymentProvider = 'paypal_sandbox';
    delete (data.event as { publicUrl?: unknown }).publicUrl;
    vi.spyOn(api, 'getDashboard').mockResolvedValue(data);
    render(
      <OrganizerDashboardView
        slug={SLUG}
        capabilities={null}
        onNavigateInvite={vi.fn()}
        onNavigateHome={vi.fn()}
        onShowToast={vi.fn()}
      />,
    );

    await screen.findByText('Actividad de pagos');
    expect(screen.queryByTestId('dashboard-colecta')).toBeNull();
    expect(screen.queryByTestId('dashboard-share')).toBeNull();
  });
});
