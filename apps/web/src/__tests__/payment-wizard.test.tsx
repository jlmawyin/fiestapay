import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UI_LABELS } from '@fiestapay/shared';
import { PublicInviteView } from '../views/PublicInviteView';
import { api } from '../api/client';
import { I18nProvider } from '../i18n/I18nContext';
import { setActiveLocale } from '../i18n/locale-store';
import type { Capabilities, FiestaEvent, Guest, Quote } from '../types';

const labels = UI_LABELS.es;

const caps: Capabilities = {
  paypal: false,
  paypalClientId: null,
  chat: true,
  llmProvider: 'openai',
  voice: false,
  sandbox: true,
  email: false,
};

function eventFixture(over: Partial<FiestaEvent> = {}): FiestaEvent {
  return {
    id: 'evt-wiz-1',
    slug: 'fiesta-wizard',
    title: 'Fiesta del asistente',
    template: 'comida',
    meal: 'almuerzo',
    description: 'Fiesta de prueba del asistente',
    startsAt: '2026-12-15T19:00:00.000Z',
    endsAt: '2026-12-15T23:00:00.000Z',
    location: 'Quito',
    includes: [],
    agenda: [],
    priceCents: 2500,
    capacity: 8,
    goalCents: 20000,
    minimumCents: 5000,
    confirmed: false,
    collectedCents: 0,
    confirmedPeople: 0,
    minimumReached: false,
    createdAt: '2026-10-20T00:00:00Z',
    ...over,
  };
}

function guestFixture(over: Partial<Guest> = {}): Guest {
  return {
    id: 'guest-wiz-1',
    name: 'Alumno1',
    status: 'maybe',
    companions: 0,
    paidCents: 0,
    dueCents: 0,
    ...over,
  };
}

function quoteFixture(over: Partial<Quote> = {}): Quote {
  return {
    id: 'quote-wiz-1',
    guestId: 'guest-wiz-1',
    people: 2,
    unitCents: 2500,
    totalCents: 5000,
    paidCents: 0,
    amountCents: 5000,
    summary: '2 personas ($50.00)',
    expiresAt: '2099-01-01T00:00:00Z',
    ...over,
  };
}

function stepItem(title: string): HTMLElement {
  const item = screen.getByText(title, { selector: '.payment-wizard__step-title' }).closest('li');
  expect(item).not.toBeNull();
  return item as HTMLElement;
}

function wizardSummary(): string {
  const summary = screen.getByTestId('paypal-stepper').querySelector('.payment-wizard__summary');
  expect(summary).not.toBeNull();
  return summary!.textContent ?? '';
}

function renderInvite(slug = 'fiesta-wizard', onShowToast = vi.fn()) {
  render(
    <PublicInviteView slug={slug} capabilities={caps} onShowToast={onShowToast} onNavigateHome={vi.fn()} />,
  );
  return { onShowToast };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
  document.documentElement.lang = 'es';
  setActiveLocale('es');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
  document.documentElement.lang = 'es';
  setActiveLocale('es');
});

describe('payment wizard strict order', () => {
  it('opens only step 1 before joining, with future steps locked and no Quiero pagar', async () => {
    vi.spyOn(api, 'getEventBySlug').mockResolvedValue({ event: eventFixture(), guest: null });
    renderInvite();

    expect(await screen.findByText(labels.paymentPathTitle)).toBeInTheDocument();
    expect(stepItem(labels.stepJoin)).toHaveAttribute('aria-current', 'step');
    expect(stepItem(labels.stepRsvp)).toHaveAttribute('aria-disabled', 'true');
    expect(stepItem(labels.stepQuote)).toHaveAttribute('aria-disabled', 'true');
    expect(stepItem(labels.stepPay)).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByLabelText(/Alias del invitado/i)).toBeInTheDocument();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryByRole('checkbox', { name: /Confirmar revisión de la cotización/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Verificar Estado/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Quiero pagar' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Quiero pagar/)).not.toBeInTheDocument();
    expect(
      within(stepItem(labels.stepJoin)).getByRole('button', { name: labels.askAboutStep }),
    ).toBeInTheDocument();
  });

  it('walks join, RSVP, quote and order, opening each step in turn', async () => {
    const joined = guestFixture({ status: 'maybe' });
    const attending = guestFixture({ status: 'yes', companions: 1, dueCents: 5000 });
    vi.spyOn(api, 'getEventBySlug').mockResolvedValue({ event: eventFixture(), guest: null });
    const join = vi.spyOn(api, 'joinEvent').mockResolvedValue({ guest: joined });
    const rsvp = vi.spyOn(api, 'rsvp').mockResolvedValue({ guest: attending, event: eventFixture() });
    vi.spyOn(api, 'getQuote').mockResolvedValue({ quote: quoteFixture() });
    const createOrder = vi.spyOn(api, 'createOrder').mockResolvedValue({ orderId: 'ORD-WIZ-1', status: 'created' });
    renderInvite();

    await screen.findByText('Fiesta del asistente');
    fireEvent.change(screen.getByLabelText(/Alias del invitado/i), { target: { value: 'Alumno1' } });
    fireEvent.click(screen.getByRole('button', { name: /Unirme a comer/i }));
    await waitFor(() => expect(join).toHaveBeenCalledWith('fiesta-wizard', 'Alumno1'));

    // Step 2 opens with the RSVP form; the guest name folds into step 1.
    expect(await screen.findAllByRole('radio')).toHaveLength(3);
    expect(stepItem(labels.stepRsvp)).toHaveAttribute('aria-current', 'step');
    expect(within(stepItem(labels.stepJoin)).getByText('Alumno1')).toBeInTheDocument();
    expect(within(stepItem(labels.stepJoin)).getByText(/Te uniste como/)).toBeInTheDocument();
    expect(stepItem(labels.stepQuote)).toHaveAttribute('aria-disabled', 'true');
    expect(stepItem(labels.stepPay)).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(screen.getByRole('radio', { name: /Sí, voy/i }));
    fireEvent.click(screen.getByRole('button', { name: /Añadir un acompañante/i }));
    fireEvent.click(screen.getByRole('button', { name: labels.saveAndContinue }));
    await waitFor(() => expect(rsvp).toHaveBeenCalledWith('fiesta-wizard', 'yes', 1));

    // Step 3 opens with the server quote; the header shows paid/due.
    const card = await screen.findByRole('region', { name: 'Revisa tu pago' });
    expect(stepItem(labels.stepQuote)).toHaveAttribute('aria-current', 'step');
    expect(within(stepItem(labels.stepRsvp)).getByText(/Vas tú \+ 1 acompañante · 2 personas/)).toBeInTheDocument();
    expect(within(stepItem(labels.stepRsvp)).getByRole('button', { name: labels.changeStep })).toBeInTheDocument();
    expect(wizardSummary()).toBe('Abonado $0,00 · Falta $50,00');
    expect(stepItem(labels.stepPay)).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(within(card).getByRole('checkbox', { name: labels.quoteReview }));
    const pay = within(card).getByRole('button', { name: `${labels.generatePayment} ($50,00)` });
    expect(pay).toBeEnabled();
    fireEvent.click(pay);
    await waitFor(() => expect(createOrder).toHaveBeenCalledWith('fiesta-wizard', 'quote-wiz-1'));

    // Step 4 opens with verification; only there do PayPal controls appear.
    expect(await screen.findByText(/Orden activa registrada/)).toBeInTheDocument();
    expect(stepItem(labels.stepPay)).toHaveAttribute('aria-current', 'step');
    expect(within(stepItem(labels.stepQuote)).getByText('Importe revisado: $50,00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: labels.verifyStatus })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Quiero pagar' })).not.toBeInTheDocument();
  });

  it('shows the paid/due header in English with $0.00 and $50.00', async () => {
    localStorage.setItem('fp_locale', 'en');
    const guest = guestFixture({ status: 'yes', companions: 1, dueCents: 5000 });
    vi.spyOn(api, 'getEventBySlug').mockResolvedValue({ event: eventFixture(), guest });
    vi.spyOn(api, 'getQuote').mockResolvedValue({ quote: quoteFixture() });
    render(
      <I18nProvider>
        <PublicInviteView slug="fiesta-wizard" capabilities={caps} onShowToast={vi.fn()} onNavigateHome={vi.fn()} />
      </I18nProvider>,
    );

    await screen.findByRole('region', { name: 'Review your payment' });
    expect(wizardSummary()).toBe('Paid $0.00 · Remaining $50.00');
    expect(screen.getByText(UI_LABELS.en.paymentPathTitle)).toBeInTheDocument();
    expect(screen.queryByText(/Quiero pagar/)).not.toBeInTheDocument();
    expect(screen.queryByText(/I want to pay/)).not.toBeInTheDocument();
  });
});

describe('payment wizard attendance changes', () => {
  it('reopens step 2 with Cambiar and requires a fresh quote afterwards', async () => {
    const attending = guestFixture({ status: 'yes', companions: 1, dueCents: 5000 });
    vi.spyOn(api, 'getEventBySlug').mockResolvedValue({ event: eventFixture(), guest: attending });
    const getQuote = vi.spyOn(api, 'getQuote').mockResolvedValue({ quote: quoteFixture() });
    const rsvp = vi.spyOn(api, 'rsvp').mockResolvedValue({ guest: attending, event: eventFixture() });
    const createOrder = vi.spyOn(api, 'createOrder').mockResolvedValue({ orderId: 'ORD-WIZ-2', status: 'created' });
    renderInvite();

    const card = await screen.findByRole('region', { name: 'Revisa tu pago' });
    fireEvent.click(within(card).getByRole('checkbox', { name: labels.quoteReview }));
    fireEvent.click(within(card).getByRole('button', { name: /Confirmar y Generar Pago/ }));
    await screen.findByText(/Orden activa registrada/);
    expect(createOrder).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: labels.changeStep }));

    // Step 2 reopens; the following steps fold and lock without rendering forms.
    expect(stepItem(labels.stepRsvp)).toHaveAttribute('aria-current', 'step');
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(stepItem(labels.stepQuote)).toHaveAttribute('aria-disabled', 'true');
    expect(stepItem(labels.stepPay)).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('region', { name: 'Revisa tu pago' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Orden activa registrada/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: labels.saveAndContinue }));
    await waitFor(() => expect(rsvp).toHaveBeenCalledWith('fiesta-wizard', 'yes', 1));
    // A new server quote is required; no order is recreated automatically.
    await waitFor(() => expect(getQuote).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('region', { name: 'Revisa tu pago' })).toBeInTheDocument();
    expect(createOrder).toHaveBeenCalledTimes(1);
  });

  it('keeps steps 3-4 closed when the guest answers Tal vez', async () => {
    const joined = guestFixture({ status: 'maybe' });
    const maybe = guestFixture({ status: 'maybe', companions: 0 });
    vi.spyOn(api, 'getEventBySlug').mockResolvedValue({ event: eventFixture(), guest: null });
    vi.spyOn(api, 'joinEvent').mockResolvedValue({ guest: joined });
    vi.spyOn(api, 'rsvp').mockResolvedValue({ guest: maybe, event: eventFixture() });
    const getQuote = vi.spyOn(api, 'getQuote');
    renderInvite();

    await screen.findByText('Fiesta del asistente');
    fireEvent.change(screen.getByLabelText(/Alias del invitado/i), { target: { value: 'Alumno1' } });
    fireEvent.click(screen.getByRole('button', { name: /Unirme a comer/i }));
    fireEvent.click(await screen.findByRole('radio', { name: /Tal vez/i }));
    fireEvent.click(screen.getByRole('button', { name: labels.saveAndContinue }));

    await waitFor(() => expect(within(stepItem(labels.stepRsvp)).getByText(/Respondiste/)).toBeInTheDocument());
    expect(stepItem(labels.stepQuote)).toHaveAttribute('aria-disabled', 'true');
    expect(stepItem(labels.stepPay)).toHaveAttribute('aria-disabled', 'true');
    expect(within(stepItem(labels.stepQuote)).getByText(/Solo aplica si confirmas tu asistencia/)).toBeInTheDocument();
    expect(within(stepItem(labels.stepPay)).getByText(/Solo aplica si confirmas tu asistencia/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Revisa tu pago' })).not.toBeInTheDocument();
    expect(getQuote).not.toHaveBeenCalled();
  });

  it('keeps steps 3-4 closed when the guest answers No', async () => {
    const joined = guestFixture({ status: 'maybe' });
    const declined = guestFixture({ status: 'no', companions: 0 });
    vi.spyOn(api, 'getEventBySlug').mockResolvedValue({ event: eventFixture(), guest: null });
    vi.spyOn(api, 'joinEvent').mockResolvedValue({ guest: joined });
    vi.spyOn(api, 'rsvp').mockResolvedValue({ guest: declined, event: eventFixture() });
    const getQuote = vi.spyOn(api, 'getQuote');
    renderInvite();

    await screen.findByText('Fiesta del asistente');
    fireEvent.change(screen.getByLabelText(/Alias del invitado/i), { target: { value: 'Alumno1' } });
    fireEvent.click(screen.getByRole('button', { name: /Unirme a comer/i }));
    fireEvent.click(await screen.findByRole('radio', { name: /No podré ir/i }));
    fireEvent.click(screen.getByRole('button', { name: labels.saveAndContinue }));

    await waitFor(() => expect(within(stepItem(labels.stepRsvp)).getByText(/Respondiste/)).toBeInTheDocument());
    expect(stepItem(labels.stepQuote)).toHaveAttribute('aria-disabled', 'true');
    expect(stepItem(labels.stepPay)).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('region', { name: 'Revisa tu pago' })).not.toBeInTheDocument();
    expect(getQuote).not.toHaveBeenCalled();
  });
});

describe('payment wizard PayPal step', () => {
  it('opens step 4 on an approved return without auto-capture or paid claims', async () => {
    window.history.replaceState({}, '', '/e/fiesta-wizard?paypal=approved&token=ORD-WIZ-9');
    const guest = guestFixture({ status: 'yes', companions: 1, dueCents: 5000 });
    vi.spyOn(api, 'getOrder').mockResolvedValue({ status: 'approved', guest });
    vi.spyOn(api, 'getEventBySlug').mockResolvedValue({ event: eventFixture(), guest });
    vi.spyOn(api, 'getQuote').mockResolvedValue({ quote: quoteFixture() });
    const capture = vi.spyOn(api, 'captureOrder');
    const { onShowToast } = renderInvite();

    expect(await screen.findByText(/Autorización recibida en PayPal/)).toBeInTheDocument();
    expect(stepItem(labels.stepPay)).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('button', { name: labels.captureComplete })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: labels.verifyStatus })).toBeInTheDocument();
    expect(capture).not.toHaveBeenCalled();
    expect(onShowToast).not.toHaveBeenCalledWith('success', expect.anything(), expect.anything());
    expect(window.location.search).toBe('');
  });

  it('opens the assistant orb in text mode without sending or starting voice', async () => {
    vi.spyOn(api, 'getEventBySlug').mockResolvedValue({ event: eventFixture(), guest: null });
    vi.spyOn(api, 'getChatHistory').mockResolvedValue({ messages: [] });
    const send = vi.spyOn(api, 'sendChat');
    const voiceToken = vi.spyOn(api, 'getVoiceToken');
    const publicVoiceToken = vi.spyOn(api, 'getPublicVoiceToken');
    renderInvite();

    await screen.findByText(labels.paymentPathTitle);
    fireEvent.click(screen.getByRole('button', { name: labels.askAboutStep }));

    expect(await screen.findByRole('dialog', { name: 'Agente FiestaPay' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Escribir' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('textbox', { name: /Mensaje para el asistente/i })).toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
    expect(voiceToken).not.toHaveBeenCalled();
    expect(publicVoiceToken).not.toHaveBeenCalled();
  });
});

describe('payment wizard mobile layout', () => {
  it('keeps the wizard shrinkable at 375px through verifiable CSS rules', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(join(here, '..', 'index.css'), 'utf8');
    const wizard = /\.payment-wizard\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(wizard, '.payment-wizard rule').toContain('min-width: 0');
    expect(wizard, '.payment-wizard rule').toContain('max-width: 100%');
    const header = /\.payment-wizard__header\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(header, '.payment-wizard__header rule').toContain('flex-wrap: wrap');
    expect(header, '.payment-wizard__header rule').toContain('min-width: 0');
    const body = /\.payment-wizard__step-body\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(body, '.payment-wizard__step-body rule').toContain('min-width: 0');
    expect(css).toContain('@media (max-width: 420px)');
  });
});
