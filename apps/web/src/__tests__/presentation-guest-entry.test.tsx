import type { ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JoinForm } from '../components/invite/JoinForm';
import { QuoteReviewCard } from '../components/invite/QuoteReviewCard';
import { PublicInviteView } from '../views/PublicInviteView';
import { api } from '../api/client';
import { usd, type FiestaEvent, type Guest, type Quote, type TemplateKind } from '../types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
});

const feeEstimate: NonNullable<Quote['feeEstimate']> = {
  estimate: true,
  feeCents: 300,
  netCents: 4700,
  rateBps: 540,
  fixedCents: 30,
  currency: 'USD',
  absorber: 'organizer',
  provenance: 'paypal-ec-business-fees-2026-09-28-domestic-standard',
};

const entries: { template: TemplateKind; title: string; welcome: string; join: string }[] = [
  { template: 'comida', title: 'Almuerzo del domingo', welcome: '¿Vienes a comer?', join: 'Unirme a comer' },
  { template: 'viaje', title: 'Salida a la costa', welcome: '¿Te unes al viaje?', join: 'Unirme al viaje' },
  { template: 'casa', title: 'Tarde en el patio', welcome: '¿Vienes a casa?', join: 'Unirme en casa' },
  { template: 'evento', title: 'Taller de cierre', welcome: '¿Vienes al evento?', join: 'Unirme al evento' },
];

function eventFor(template: TemplateKind, title: string): FiestaEvent {
  return {
    id: `evt-${template}`,
    slug: `inv-${template}`,
    title,
    template,
    meal: 'almuerzo',
    description: 'Invitación de prueba',
    startsAt: '2026-12-15T19:00:00.000Z',
    endsAt: '2026-12-15T23:00:00.000Z',
    location: 'Quito',
    includes: [],
    agenda: [],
    priceCents: 2500,
    capacity: 8,
    goalCents: 20000,
    minimumCents: null,
    confirmed: false,
    collectedCents: 0,
    confirmedPeople: 0,
    minimumReached: false,
    createdAt: '2026-10-20T00:00:00.000Z',
    fundingStatus: 'open',
  };
}

function quoteFor(over: Partial<Quote> = {}): Quote {
  return {
    id: 'quote-partial',
    guestId: 'g-pay',
    people: 3,
    unitCents: 2500,
    totalCents: 7500,
    paidCents: 5000,
    amountCents: 2500,
    summary: 'Cotización oficial del servidor',
    expiresAt: '2099-01-01T00:00:00Z',
    feeEstimate,
    ...over,
  };
}

function cardProps(over: Partial<ComponentProps<typeof QuoteReviewCard>> = {}) {
  return {
    quote: quoteFor(),
    isLoadingQuote: false,
    onRefreshQuote: vi.fn(async () => undefined),
    onCreateOrder: vi.fn(async () => undefined),
    isCreatingOrder: false,
    template: 'comida' as const,
    ...over,
  };
}

describe('guest entry copy before join', () => {
  it.each(entries)(
    'shows $template heading and action, with no RSVP selected',
    async ({ template, title, welcome, join }) => {
      window.history.replaceState({}, '', `/e/inv-${template}`);
      vi.spyOn(api, 'getEventBySlug').mockResolvedValue({ event: eventFor(template, title), guest: null });
      render(
        <PublicInviteView slug={`inv-${template}`} capabilities={null} onShowToast={vi.fn()} onNavigateHome={vi.fn()} />,
      );
      expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: welcome })).toBeInTheDocument();
      expect(screen.getAllByText(welcome).length).toBeGreaterThanOrEqual(2);
      const button = screen.getByRole('button', { name: join });
      expect(button).toBeDisabled();
      expect(screen.getByLabelText('Alias del invitado')).toHaveValue('');
      expect(screen.queryAllByRole('radio')).toHaveLength(0);
      expect(screen.queryByText(/¿Vienes a la fiesta\?/i)).toBeNull();
      expect(screen.queryByRole('button', { name: /Entrar a la fiesta/i })).toBeNull();
      expect(screen.getByText(/alias ficticio/i)).toBeInTheDocument();
      expect(screen.getByText(/No necesitas datos personales, contraseña ni registro previo/i)).toBeInTheDocument();
    },
  );

  it('uses neutral copy when no template is passed', () => {
    render(<JoinForm onJoin={vi.fn(async () => undefined)} isLoading={false} />);
    expect(screen.getByRole('heading', { name: '¿Te unes?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unirme' })).toBeDisabled();
    expect(screen.queryByText(/fiesta/i)).toBeNull();
  });

  it('keeps the alias field usable at a 360px frame and honors the disabled guard', () => {
    const onJoin = vi.fn(async () => undefined);
    const { container } = render(
      <div style={{ width: '360px' }}>
        <JoinForm onJoin={onJoin} isLoading={false} template="casa" />
      </div>,
    );
    const frame = container.firstElementChild as HTMLElement;
    expect(frame).toHaveStyle({ width: '360px' });
    const form = screen.getByRole('form', { name: 'Ingreso del invitado' });
    const input = screen.getByLabelText('Alias del invitado');
    expect(form.getAttribute('style')).toContain('flex-wrap: wrap');
    expect(input.getAttribute('style')).toContain('min-width: 0');
    expect(input.getAttribute('style')).toContain('max-width: 100%');
    fireEvent.change(input, { target: { value: 'Nico' } });
    expect(screen.getByRole('button', { name: 'Unirme en casa' })).toBeEnabled();
    cleanup();

    render(<JoinForm onJoin={onJoin} isLoading template="casa" />);
    expect(screen.getByRole('button', { name: 'Entrando...' })).toBeDisabled();
    expect(screen.getByLabelText('Alias del invitado')).toBeDisabled();
    cleanup();

    render(<JoinForm onJoin={onJoin} isLoading={false} disabledReason="Esta sesión no puede entrar." />);
    fireEvent.change(screen.getByLabelText('Alias del invitado'), { target: { value: 'Nico' } });
    expect(screen.getByRole('status')).toHaveTextContent('Esta sesión no puede entrar.');
    expect(screen.getByLabelText('Alias del invitado')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Unirme' })).toBeDisabled();
    fireEvent.submit(screen.getByRole('form', { name: 'Ingreso del invitado' }));
    expect(onJoin).not.toHaveBeenCalled();
  });

  it('rejects an empty alias and shows a plain error', async () => {
    const onJoin = vi.fn(async () => undefined);
    render(<JoinForm onJoin={onJoin} isLoading={false} template="evento" />);
    const form = screen.getByRole('form', { name: 'Ingreso del invitado' });
    fireEvent.submit(form);
    expect(onJoin).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Por favor ingresa un alias ficticio.');
    expect(screen.getByRole('alert').textContent).not.toMatch(/fiesta/i);

    fireEvent.change(screen.getByLabelText('Alias del invitado'), { target: { value: '   ' } });
    fireEvent.submit(form);
    expect(onJoin).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Unirme al evento' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Alias del invitado'), { target: { value: 'Luz' } });
    onJoin.mockRejectedValueOnce(new Error('Cupo lleno'));
    fireEvent.click(screen.getByRole('button', { name: 'Unirme al evento' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Cupo lleno');

    onJoin.mockRejectedValueOnce('fallo');
    fireEvent.click(screen.getByRole('button', { name: 'Unirme al evento' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo completar el ingreso.');
    expect(screen.getByRole('alert').textContent).not.toMatch(/fiesta/i);
  });
});

describe('guest quote privacy and server amounts', () => {
  it('shows 3 people, 25, 75, 50 and 25 due, and hides fee and net in the invitation', async () => {
    const guest: Guest = {
      id: 'g-pay',
      name: 'Luz',
      status: 'yes',
      companions: 2,
      paidCents: 5000,
      dueCents: 2500,
    };
    const quote = quoteFor();
    window.history.replaceState({}, '', '/e/inv-comida');
    vi.spyOn(api, 'getEventBySlug').mockResolvedValue({ event: eventFor('comida', 'Almuerzo del domingo'), guest });
    vi.spyOn(api, 'getQuote').mockResolvedValue({ quote });
    const createOrder = vi.spyOn(api, 'createOrder').mockResolvedValue({ orderId: 'ord-1', status: 'created' });

    render(
      <PublicInviteView slug="inv-comida" capabilities={null} onShowToast={vi.fn()} onNavigateHome={vi.fn()} />,
    );

    const card = await screen.findByRole('region', { name: 'Revisa tu pago' });
    expect(within(card).getByText('Personas:').parentElement).toHaveTextContent('3 personas');
    expect(within(card).getByText('Cuota por persona:').parentElement).toHaveTextContent(usd(2500));
    expect(within(card).getByText('Total:').parentElement).toHaveTextContent(usd(7500));
    expect(within(card).getByText('Ya abonado:').parentElement).toHaveTextContent(usd(5000));
    expect(within(card).getByText('Diferencia a pagar:').parentElement).toHaveTextContent(usd(2500));
    expect(card.textContent).not.toMatch(/comisión|neto|pasarela|oficial|servidor|cotización|fiesta/i);
    expect(card.textContent).not.toContain(usd(feeEstimate.feeCents));
    expect(card.textContent).not.toContain(usd(feeEstimate.netCents));
    expect(document.body.textContent).not.toContain(usd(feeEstimate.feeCents));
    expect(document.body.textContent).not.toContain(usd(feeEstimate.netCents));
    expect(within(card).queryByText(/Estimación de comisión no disponible/i)).toBeNull();

    const pay = within(card).getByRole('button', { name: `Confirmar y Generar Pago (${usd(2500)})` });
    expect(within(card).queryByRole('button', { name: usd(7500) })).toBeNull();
    expect(within(card).queryByRole('button', { name: usd(5000) })).toBeNull();
    expect(within(card).getAllByRole('button', { name: /Confirmar y Generar Pago/ })).toHaveLength(1);
    expect(pay).toBeDisabled();
    expect(within(card).getByRole('checkbox', { name: /Confirmar revisión de la cotización/i })).not.toBeChecked();
    fireEvent.click(pay);
    expect(createOrder).not.toHaveBeenCalled();

    fireEvent.click(within(card).getByRole('checkbox', { name: /Confirmar revisión de la cotización/i }));
    expect(within(card).getByText(/3 personas, la cuota/)).toHaveTextContent(usd(2500));
    expect(within(card).getByText(/3 personas, la cuota/)).toHaveTextContent(usd(7500));
    fireEvent.click(pay);
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1));
    expect(createOrder).toHaveBeenCalledWith('inv-comida', 'quote-partial');
  });

  it('prints the server difference when it is not total minus paid', () => {
    const quote = quoteFor({ unitCents: 2000, totalCents: 7500, paidCents: 5000, amountCents: 2600 });
    render(<QuoteReviewCard {...cardProps({ quote, template: 'viaje' })} />);
    const card = screen.getByRole('region', { name: 'Revisa tu pago' });
    expect(within(card).getByText('Diferencia a pagar:').parentElement).toHaveTextContent(usd(2600));
    expect(within(card).getByRole('button', { name: `Confirmar y Generar Pago (${usd(2600)})` })).toBeInTheDocument();
    expect(card.textContent).not.toContain(usd(2500));
    expect(card.textContent).toContain(usd(7500));
    expect(card.textContent).toContain(usd(5000));
  });

  it('requires a fresh confirmation when the quote id changes', () => {
    const onCreateOrder = vi.fn(async () => undefined);
    const props = cardProps({ onCreateOrder });
    const { rerender } = render(<QuoteReviewCard {...props} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Confirmar revisión de la cotización/i }));
    expect(screen.getByRole('button', { name: /Confirmar y Generar Pago/ })).toBeEnabled();

    rerender(<QuoteReviewCard {...props} quote={quoteFor({ id: 'quote-next', people: 2, totalCents: 5000, amountCents: 5000, paidCents: 0 })} />);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    const proceed = screen.getByRole('button', { name: `Confirmar y Generar Pago (${usd(5000)})` });
    expect(proceed).toBeDisabled();
    fireEvent.click(proceed);
    expect(onCreateOrder).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(proceed);
    expect(onCreateOrder).toHaveBeenCalledTimes(1);
    expect(onCreateOrder).toHaveBeenCalledWith('quote-next');
  });

  it('ignores a repeated click and a click while a quote or an order is busy', async () => {
    let release: () => void = () => undefined;
    const onCreateOrder = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    render(<QuoteReviewCard {...cardProps({ onCreateOrder })} />);
    fireEvent.click(screen.getByRole('checkbox'));
    const pay = screen.getByRole('button', { name: /Confirmar y Generar Pago/ });
    fireEvent.click(pay);
    fireEvent.click(pay);
    expect(onCreateOrder).toHaveBeenCalledTimes(1);
    expect(onCreateOrder).toHaveBeenCalledWith('quote-partial');
    expect(screen.getByRole('button', { name: 'Preparando tu pago...' })).toBeDisabled();
    release();
    await waitFor(() => expect(screen.getByRole('button', { name: /Confirmar y Generar Pago/ })).toBeEnabled());

    cleanup();
    const blocked = vi.fn(async () => undefined);
    const { rerender } = render(<QuoteReviewCard {...cardProps({ onCreateOrder: blocked })} />);
    fireEvent.click(screen.getByRole('checkbox'));
    rerender(<QuoteReviewCard {...cardProps({ onCreateOrder: blocked, isLoadingQuote: true })} />);
    const pending = screen.getByRole('button', { name: /Confirmar y Generar Pago/ });
    expect(pending).toBeDisabled();
    fireEvent.click(pending);
    expect(blocked).not.toHaveBeenCalled();

    rerender(<QuoteReviewCard {...cardProps({ onCreateOrder: blocked, isCreatingOrder: true })} />);
    const creating = screen.getByRole('button', { name: 'Preparando tu pago...' });
    expect(creating).toBeDisabled();
    fireEvent.click(creating);
    expect(blocked).not.toHaveBeenCalled();

    cleanup();
    render(<QuoteReviewCard {...cardProps({ quote: null, isLoadingQuote: true })} />);
    expect(screen.getByRole('status')).toHaveTextContent('Calculando tu pago');
    expect(screen.queryByRole('button', { name: /Confirmar y Generar Pago/ })).toBeNull();
    expect(screen.queryByText(/cotización|servidor|oficial|comisión|neto/i)).toBeNull();
  });

  it('states a zero balance without confirming or reserving the gathering', () => {
    const paidOff = quoteFor({ amountCents: 0, paidCents: 7500, totalCents: 7500 });
    const { rerender } = render(<QuoteReviewCard {...cardProps({ quote: paidOff, template: 'viaje' })} />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Tu pago de este viaje ya está cubierto. Eso no confirma el viaje ni reserva un lugar.');
    expect(screen.queryByRole('button', { name: /Confirmar y Generar Pago/ })).toBeNull();
    expect(screen.queryByText(/fiesta/i)).toBeNull();
    expect(screen.queryByText(/lugar reservado/i)).toBeNull();
    expect(screen.getByText('Total:').parentElement).toHaveTextContent(usd(7500));
    expect(screen.getByText('Ya abonado:').parentElement).toHaveTextContent(usd(7500));
    expect(screen.getByText('Diferencia a pagar:').parentElement).toHaveTextContent(usd(0));

    rerender(<QuoteReviewCard {...cardProps({ quote: quoteFor({ amountCents: 0, paidCents: 0, totalCents: 0, unitCents: 0 }), template: null })} />);
    expect(screen.getByRole('status')).toHaveTextContent('No hay saldo pendiente. Eso no confirma el encuentro ni reserva un lugar.');
    expect(screen.queryByText(/fiesta/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /Confirmar y Generar Pago/ })).toBeNull();
  });
});
