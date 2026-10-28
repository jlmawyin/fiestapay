import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { THEMES, TEMPLATE_INVITE_COPY, contrastRatio, themeContrastPairs } from '@fiestapay/shared';
import { CreateEventForm } from '../components/events/CreateEventForm';
import { FundingStatusPanel } from '../components/common/FundingStatusPanel';
import { RsvpForm, visibleRsvpChoice } from '../components/invite/RsvpForm';
import { PublicInviteView } from '../views/PublicInviteView';
import { api } from '../api/client';
import type { EventInput, FiestaEvent, Guest } from '../types';
import {
  attendanceSummary,
  buildInviteShareText,
  buildInviteShareUrl,
  formatEventRange,
  goalProgressPercent,
  guestFundingOutcome,
  guestPayLabel,
  minimumProgressPercent,
  plainShareText,
  textFromWhatsAppUrl,
  whatsAppShareUrl,
} from '../lib/event-presentation';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  sessionStorage.clear();
});

const event = (over: Partial<FiestaEvent> = {}): FiestaEvent => ({
  id: 'evt-present',
  slug: 'viaje-cuenca',
  title: 'Viaje a Cuenca',
  template: 'viaje',
  meal: 'cena',
  description: 'Salida del grupo',
  startsAt: '2026-12-15T19:00:00.000Z',
  endsAt: '2026-12-16T15:00:00.000Z',
  location: 'Cuenca & Baños',
  includes: ['Bus'],
  agenda: [],
  priceCents: 6500,
  capacity: 8,
  goalCents: 20000,
  minimumCents: 5000,
  confirmed: false,
  collectedCents: 4999,
  confirmedPeople: 1,
  minimumReached: false,
  createdAt: '2026-10-20T00:00:00.000Z',
  fundingStatus: 'open',
  organizerName: 'Ana',
  theme: 'montana',
  ...over,
});

describe('presentation copy, contrast, and WhatsApp roundtrip', () => {
  it('keeps four welcomes and sixteen themes with WCAG pairs', () => {
    expect(TEMPLATE_INVITE_COPY.comida.welcome).toBe('¿Vienes a comer?');
    expect(TEMPLATE_INVITE_COPY.casa.welcome).toBe('¿Vienes a casa?');
    expect(TEMPLATE_INVITE_COPY.viaje.welcome).toBe('¿Te unes al viaje?');
    expect(TEMPLATE_INVITE_COPY.viaje.join).toBe('Unirme al viaje');
    expect(TEMPLATE_INVITE_COPY.evento.welcome).toBe('¿Vienes al evento?');
    expect(THEMES).toHaveLength(16);
    const failures: string[] = [];
    for (const theme of THEMES) {
      for (const pair of themeContrastPairs(theme)) {
        const ratio = contrastRatio(pair.foreground, pair.background);
        if (ratio < pair.minimum) failures.push(`${pair.name} ${ratio.toFixed(2)} < ${pair.minimum}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('roundtrips Unicode, strips secrets, and keeps both dates', () => {
    const grin = String.fromCodePoint(0x1f600);
    const title = `Viaje ${grin} a Cuenca & Baños`;
    const invite = 'https://example.com/e/viaje-cuenca?adminKey=super-secret&code=privado#hash';
    const text = buildInviteShareText({
      template: 'viaje',
      theme: 'montana',
      title: `${title}<b>html</b>\uD800`,
      location: 'A & B?',
      startsAt: '2026-12-15T19:00:00.000Z',
      endsAt: '2026-12-16T15:00:00.000Z',
      priceCents: 6500,
      inviteUrl: invite,
      organizerName: 'Ana',
    });
    const href = buildInviteShareUrl({
      template: 'viaje',
      theme: 'montana',
      title: `${title}<b>html</b>\uD800`,
      location: 'A & B?',
      startsAt: '2026-12-15T19:00:00.000Z',
      endsAt: '2026-12-16T15:00:00.000Z',
      priceCents: 6500,
      inviteUrl: invite,
      organizerName: 'Ana',
    });
    expect(href.startsWith('https://api.whatsapp.com/send?text=')).toBe(true);
    expect(textFromWhatsAppUrl(href)).toBe(plainShareText(text));
    expect(textFromWhatsAppUrl(whatsAppShareUrl(text))).toBe(plainShareText(text));
    expect(href).not.toContain('adminKey');
    expect(href).not.toContain('super-secret');
    expect(href).not.toContain('privado');
    expect(text).not.toContain('<b>');
    expect(text).toContain(grin);
    expect(text).toContain('¿Te unes al viaje?');
    expect(text).toContain('La montaña nos espera.');
    expect(text).toContain('America/Guayaquil');
    expect(text).toContain('15');
    expect(text).toContain('16');
    expect(text).toContain('https://example.com/e/viaje-cuenca');
    const reserved = 'A & B?';
    expect(encodeURIComponent(encodeURIComponent(reserved))).not.toBe(encodeURIComponent(reserved));
    expect(href).toContain(encodeURIComponent(reserved));
    expect(href).not.toContain(encodeURIComponent(encodeURIComponent(reserved)));
    expect(formatEventRange('2026-12-15T19:00:00.000Z', '2026-12-16T15:00:00.000Z')).toContain('Fin:');
    expect(formatEventRange('2026-12-15T19:00:00.000Z', '2026-12-15T23:00:00.000Z')).not.toContain('16');
  });

  it('labels people without recalculating money and keeps 4999 under the minimum', () => {
    expect(attendanceSummary({ parties: 1, paidPeople: 2, capacity: 8 })).toBe('1 invitado · 2 personas pagadas · cupo 8');
    expect(attendanceSummary({ parties: 2, paidPeople: 1 })).toBe('2 invitados · 1 persona pagada');
    expect(minimumProgressPercent(4999, 5000, false)).toBe(99);
    expect(minimumProgressPercent(5000, 5000, true)).toBe(100);
    expect(goalProgressPercent(4999, 5000)).toBe(99);
    expect(guestPayLabel(2000, 3000)).toBe('Abonado $20,00. Falta $30,00');
    expect(guestPayLabel(5000, 0)).toBe('Pagado');
    expect(guestFundingOutcome({
      fundingStatus: 'failed',
      confirmed: false,
      refundSummary: { refundedCents: 0, pendingCents: 100, needsReviewCents: 0, outstandingCents: 100 },
    })).toBe('Mínimo no alcanzado. Devolución en proceso.');
    expect(guestFundingOutcome({
      fundingStatus: 'failed',
      confirmed: false,
      refundSummary: { refundedCents: 100, pendingCents: 0, needsReviewCents: 0, outstandingCents: 0 },
    })).toBe('Mínimo no alcanzado. Devuelto.');
    expect(guestFundingOutcome({
      fundingStatus: 'failed',
      confirmed: false,
      refundSummary: { refundedCents: 50, pendingCents: 10, needsReviewCents: 0, outstandingCents: 10 },
    })).toBe('Mínimo no alcanzado. Devolución en proceso.');
  });
});

describe('create review and guest surfaces', () => {
  it('requires a fresh review and does not use window.confirm', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CreateEventForm onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    fireEvent.change(screen.getByLabelText(/Título del Evento/i), { target: { value: 'Cena en casa' } });
    fireEvent.change(screen.getByLabelText(/Lugar o Dirección/i), { target: { value: 'Sala' } });
    fireEvent.change(screen.getByLabelText(/Cuota por persona/i), { target: { value: '25.00' } });
    fireEvent.change(screen.getByLabelText(/Capacidad máxima/i), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText(/Nombre de quien organiza/i), { target: { value: 'Ana' } });
    fireEvent.click(screen.getByRole('button', { name: 'Revisar invitación' }));
    expect(screen.getByRole('region', { name: 'Resumen de la invitación' })).toHaveTextContent('Estas fechas son una sugerencia');
    expect(screen.getByRole('button', { name: 'Publicar invitación' })).toBeEnabled();
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Título del Evento/i), { target: { value: 'Cena real' } });
    expect(screen.queryByRole('button', { name: 'Publicar invitación' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Revisar invitación' }));
    fireEvent.click(screen.getByRole('button', { name: 'Publicar invitación' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Publicar invitación' })).toBeNull());
    const payload = onSubmit.mock.calls[0][0] as EventInput;
    expect(payload.title).toBe('Cena real');
    expect(payload.organizerName).toBe('Ana');
    expect(payload.theme).toBe('mesa');
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('hides the meal selector outside comida and offers the theme list', () => {
    render(<CreateEventForm onSubmit={vi.fn()} onCancel={vi.fn()} isLoading={false} />);
    expect(screen.getByLabelText(/Tipo de Comida/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Viaje/i }));
    expect(screen.queryByLabelText(/Tipo de Comida/i)).toBeNull();
    expect(screen.getByRole('radio', { name: 'Camino' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Montaña' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Costa' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Ciudad' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Título del Evento/i), { target: { value: 'Finde en Cuenca' } });
    expect(screen.getByRole('button', { name: 'Usar Montaña' })).toBeEnabled();
    expect(screen.getByRole('radio', { name: 'Camino' })).toHaveAttribute('aria-checked', 'true');
  });

  it('does not check Tal vez for an untouched maybe guest', () => {
    const guest: Guest = { id: 'g-new', name: 'Luis', status: 'maybe', companions: 0, paidCents: 0, dueCents: 5000 };
    expect(visibleRsvpChoice(guest)).toBeNull();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<RsvpForm guest={guest} event={event()} onSaveRsvp={onSave} isLoading={false} />);
    for (const radio of screen.getAllByRole('radio')) expect(radio).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar mi Asistencia' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Elige si vienes antes de guardar.');
    fireEvent.click(screen.getByRole('radio', { name: /Sí, voy/i }));
    expect(screen.getByRole('radio', { name: /Sí, voy/i })).toHaveAttribute('aria-checked', 'true');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows a viaje invitation without meal metadata or guest fee jargon', async () => {
    vi.spyOn(api, 'getEventBySlug').mockResolvedValue({ event: event(), guest: null });
    render(<PublicInviteView slug="viaje-cuenca" capabilities={null} onShowToast={vi.fn()} onNavigateHome={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: 'Viaje a Cuenca' })).toBeInTheDocument();
    expect(screen.getAllByText('¿Te unes al viaje?').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('button', { name: 'Unirme al viaje' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Entrar a la fiesta/i })).toBeNull();
    expect(screen.getByText('Organiza Ana')).toBeInTheDocument();
    expect(screen.getByText('Ana te invita.')).toBeInTheDocument();
    expect(screen.queryByText(/TIPO DE COMIDA/i)).toBeNull();
    expect(screen.queryByText(/^cena$/i)).toBeNull();
    expect(screen.getByText(/America\/Guayaquil/)).toBeInTheDocument();
    expect(screen.getByText(/Progreso hacia el mínimo: 99%/)).toBeInTheDocument();
    expect(screen.queryByText(/comisión/i)).toBeNull();
    expect(screen.queryByText(/reembolso/i)).toBeNull();
    expect(screen.queryByText(/cuota verificada/i)).toBeNull();
    expect(screen.queryByText(/Saldo capturado/i)).toBeNull();
  });

  it('keeps the refund ledger on the admin panel and plain outcome for a guest', () => {
    const failed = event({
      fundingStatus: 'failed',
      collectedCents: 4999,
      minimumCents: 5000,
      minimumReached: false,
      refundSummary: { refundedCents: 0, pendingCents: 2000, needsReviewCents: 0, outstandingCents: 4999 },
    });
    render(<FundingStatusPanel event={failed} audience="guest" paidCents={2000} dueCents={3000} parties={1} />);
    expect(screen.getByText('Abonado $20,00. Falta $30,00')).toBeInTheDocument();
    expect(screen.getByText('Mínimo no alcanzado. Devolución en proceso.')).toBeInTheDocument();
    expect(screen.queryByText(/aún NO es dinero devuelto/)).toBeNull();
    cleanup();
    render(<FundingStatusPanel event={failed} audience="admin" parties={1} />);
    expect(screen.getByText(/aún NO es dinero devuelto/)).toBeInTheDocument();
    expect(screen.getByText(/1 invitado · /)).toBeInTheDocument();
  });
});
