import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UI_LABELS } from '@fiestapay/shared';
import { PublicInviteView } from '../views/PublicInviteView';
import { ChatAssistant } from '../components/chat/ChatAssistant';
import { VoiceInvitationAgent } from '../components/voice/VoiceInvitationAgent';
import { api } from '../api/client';
import { I18nProvider } from '../i18n/I18nContext';
import { setActiveLocale } from '../i18n/locale-store';
import type { Capabilities, ChatResult, FiestaEvent, Guest, Quote } from '../types';

const labels = UI_LABELS.en;

const caps: Capabilities = {
  paypal: false,
  paypalClientId: null,
  chat: true,
  llmProvider: 'openai',
  voice: true,
  sandbox: true,
  email: false,
};

function eventFixture(over: Partial<FiestaEvent> = {}): FiestaEvent {
  return {
    id: 'evt-en-1',
    slug: 'sunday-lunch',
    title: 'Sunday lunch',
    template: 'comida',
    meal: 'almuerzo',
    description: 'A relaxed test lunch',
    startsAt: '2026-12-15T19:00:00.000Z',
    endsAt: '2026-12-15T23:00:00.000Z',
    location: 'Quito',
    includes: ['Starter', 'Main course'],
    agenda: [{ time: '19:00', title: 'Welcome', speaker: 'Ana Torres' }],
    priceCents: 2500,
    capacity: 8,
    goalCents: 20000,
    minimumCents: 5000,
    confirmed: false,
    collectedCents: 0,
    confirmedPeople: 0,
    minimumReached: false,
    createdAt: '2026-10-20T00:00:00.000Z',
    fundingStatus: 'open',
    organizerName: 'Ana',
    ...over,
  };
}

function guestFixture(over: Partial<Guest> = {}): Guest {
  return {
    id: 'guest-en-1',
    name: 'TestGuest',
    status: 'maybe',
    companions: 0,
    paidCents: 0,
    dueCents: 0,
    ...over,
  };
}

function quoteFixture(over: Partial<Quote> = {}): Quote {
  return {
    id: 'quote-en-1',
    guestId: 'guest-en-1',
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

/** Spanish UI copy (own strings, never organizer content) that must not leak into English. */
const SPANISH_WITNESSES = [
  'Cuota Fija',
  'por persona',
  '¿Vienes a comer?',
  'Unirme a comer',
  'INICIO Y FIN',
  'LUGAR',
  'TIPO DE COMIDA',
  'ASISTENCIA',
  '¿Qué incluye tu cuota?',
  'Programa de la invitación',
  'Expositor:',
  'Ver en Google Maps',
  'Código QR / Compartir',
  'Tu camino al pago',
  'sin dinero real',
  'Únete con tu nombre',
  'Confirma tu asistencia',
  'Revisa tu importe',
  'Paga en PayPal Sandbox',
  'Quiero pagar',
  'Ej. Invitado Demo',
  'Sesión activa:',
  'Abonado:',
  'Tu Asistencia',
  'Actualizar mi Asistencia',
  '¡Sí, voy!',
  'Tal vez',
  'No podré ir',
  'acompañantes',
  'Revisa tu pago',
  'Diferencia a pagar',
  'Confirmar y Generar Pago',
  'Confirmo que revisé',
  'Completar Pago Seguro',
  'Autorización recibida',
  'Confirmar y Completar Captura',
  'Verificar Estado',
  'Verificar / Continuar Captura',
  'Abrir PayPal',
  'Estado de la cuota',
  'Mínimo:',
  'Progreso hacia el mínimo',
  'Cargando la invitación',
  'te invita.',
  'Organiza ',
  'Almuerzo',
  'personas pagadas',
  'cupo 8',
  'Desglose',
  'cuota verificada',
];

function renderInvite(slug = 'sunday-lunch', onShowToast = vi.fn()) {
  localStorage.setItem('fp_locale', 'en');
  render(
    <I18nProvider>
      <PublicInviteView slug={slug} capabilities={caps} onShowToast={onShowToast} onNavigateHome={vi.fn()} />
    </I18nProvider>
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

describe('guest invitation in English', () => {
  it('renders the invitation chrome in English with Guayaquil time and no Spanish witnesses', async () => {
    window.history.replaceState({}, '', '/e/sunday-lunch');
    vi.spyOn(api, 'getEventBySlug').mockResolvedValue({ event: eventFixture(), guest: null });
    renderInvite();

    expect(await screen.findByRole('heading', { name: 'Sunday lunch' })).toBeInTheDocument();
    // Template copy, facts, and organizer lines in English.
    expect(screen.getByRole('heading', { name: 'Coming to eat?' })).toBeInTheDocument();
    expect(screen.getByText('Flat share: $25.00 per person')).toBeInTheDocument();
    expect(screen.getByText('START AND END')).toBeInTheDocument();
    expect(screen.getByText('MEAL TYPE')).toBeInTheDocument();
    expect(screen.getByText('lunch')).toBeInTheDocument();
    expect(screen.getByText('Ana invites you.')).toBeInTheDocument();
    expect(screen.getByText('Organized by Ana')).toBeInTheDocument();
    expect(screen.getByText('What does your share include?')).toBeInTheDocument();
    expect(screen.getByText('Invitation schedule')).toBeInTheDocument();
    expect(screen.getByText('Speaker: Ana Torres')).toBeInTheDocument();
    // Organizer content is untouched.
    expect(screen.getByText('A relaxed test lunch')).toBeInTheDocument();
    expect(screen.getByText('Starter')).toBeInTheDocument();
    // Cover art keeps its decorative text but exposes an English accessible name.
    expect(
      screen.getByRole('img', { name: 'Festive banquet and shared meal illustration' })
    ).toBeInTheDocument();
    // Guayaquil zone is printed, in the locale format.
    expect(screen.getByText(/America\/Guayaquil/)).toBeInTheDocument();
    // Wizard header, step titles, and strict order: only step 1 is open.
    expect(screen.getByText(labels.paymentPathTitle)).toBeInTheDocument();
    expect(screen.getByText(labels.stepJoin, { selector: '.payment-wizard__step-title' })).toBeInTheDocument();
    expect(screen.getByText(labels.stepRsvp, { selector: '.payment-wizard__step-title' })).toBeInTheDocument();
    expect(screen.getByText(labels.stepQuote, { selector: '.payment-wizard__step-title' })).toBeInTheDocument();
    expect(screen.getByText(labels.stepPay, { selector: '.payment-wizard__step-title' })).toBeInTheDocument();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'I want to pay' })).not.toBeInTheDocument();
    expect(screen.queryByText(/I want to pay/)).not.toBeInTheDocument();
    // Join form in English.
    expect(screen.getByLabelText('Guest alias')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join the meal' })).toBeInTheDocument();

    const body = document.body.textContent ?? '';
    for (const witness of SPANISH_WITNESSES) {
      expect(body, `witness: ${witness}`).not.toContain(witness);
    }
    expect(body).not.toMatch(/[áéíóúñ¿¡]/);
  });

  it('walks join, RSVP, quote, and confirmation with $50.00 amounts', async () => {
    window.history.replaceState({}, '', '/e/sunday-lunch');
    const joined = guestFixture({ status: 'maybe' });
    const attending = guestFixture({ status: 'yes', companions: 1, dueCents: 5000 });
    vi.spyOn(api, 'getEventBySlug').mockResolvedValue({ event: eventFixture(), guest: null });
    const join = vi.spyOn(api, 'joinEvent').mockResolvedValue({ guest: joined });
    const rsvp = vi.spyOn(api, 'rsvp').mockResolvedValue({ guest: attending, event: eventFixture() });
    vi.spyOn(api, 'getQuote').mockResolvedValue({ quote: quoteFixture() });
    const createOrder = vi.spyOn(api, 'createOrder').mockResolvedValue({ orderId: 'ORD-EN-1', status: 'created' });
    renderInvite();

    await screen.findByRole('heading', { name: 'Sunday lunch' });
    fireEvent.change(screen.getByLabelText('Guest alias'), { target: { value: 'TestGuest' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join the meal' }));
    await waitFor(() => expect(join).toHaveBeenCalledWith('sunday-lunch', 'TestGuest'));

    fireEvent.click(screen.getByRole('radio', { name: /Yes, I am coming!/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add one companion' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
    await waitFor(() => expect(rsvp).toHaveBeenCalledWith('sunday-lunch', 'yes', 1));

    const card = await screen.findByRole('region', { name: 'Review your payment' });
    expect(within(card).getByText('People:').parentElement).toHaveTextContent('2 people');
    expect(within(card).getByText('Share per person:').parentElement).toHaveTextContent('$25.00');
    expect(within(card).getByText('Total:').parentElement).toHaveTextContent('$50.00');
    expect(within(card).getByText('Balance to pay:').parentElement).toHaveTextContent('$50.00');
    // The confirmation checkbox and button use UI_LABELS literally.
    fireEvent.click(within(card).getByRole('checkbox', { name: labels.quoteReview }));
    expect(within(card).getByText('I confirm I reviewed')).toBeInTheDocument();
    expect(within(card).getByText(/2 people, the/)).toHaveTextContent('$25.00');
    expect(within(card).getByText(/2 people, the/)).toHaveTextContent('$50.00');
    const pay = within(card).getByRole('button', { name: `Confirm and Create Payment ($50.00)` });
    expect(pay).toBeEnabled();
    fireEvent.click(pay);
    await waitFor(() => expect(createOrder).toHaveBeenCalledWith('sunday-lunch', 'quote-en-1'));

    const body = document.body.textContent ?? '';
    for (const witness of SPANISH_WITNESSES) {
      expect(body, `witness: ${witness}`).not.toContain(witness);
    }
  });

  it('returns from PayPal approved without auto-capture and without paid claims', async () => {
    window.history.replaceState({}, '', '/e/sunday-lunch?paypal=approved&token=ORD-EN-9');
    const guest = guestFixture({ status: 'yes', companions: 1, dueCents: 5000 });
    vi.spyOn(api, 'getOrder').mockResolvedValue({ status: 'approved', guest });
    vi.spyOn(api, 'getEventBySlug').mockResolvedValue({ event: eventFixture(), guest });
    vi.spyOn(api, 'getQuote').mockResolvedValue({ quote: quoteFixture() });
    const capture = vi.spyOn(api, 'captureOrder');
    const { onShowToast } = renderInvite();

    expect(await screen.findByText(/Authorization received in PayPal/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: labels.captureComplete })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: labels.verifyStatus })).toBeInTheDocument();
    expect(capture).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(onShowToast).toHaveBeenCalledWith('info', expect.stringContaining('back from PayPal'), 'PayPal return')
    );
    expect(onShowToast).not.toHaveBeenCalledWith('success', expect.anything(), expect.anything());
    expect(window.location.search).toBe('');

    const body = document.body.textContent ?? '';
    expect(body).not.toContain('Autorización recibida');
    expect(body).not.toContain('Confirmar y Completar Captura');
  });
});

describe('guest chat in English', () => {
  it('greets, types, and sends in English while server history stays verbatim', async () => {
    localStorage.setItem('fp_locale', 'en');
    vi.spyOn(api, 'getChatHistory').mockResolvedValue({
      messages: [{ id: 'h1', role: 'assistant', text: 'Historial del servidor sin traducir', createdAt: '2026-12-01T12:00:00Z' }],
    });
    let resolveSend!: (value: ChatResult) => void;
    const sendPromise = new Promise<ChatResult>((resolve) => { resolveSend = resolve; });
    const send = vi.spyOn(api, 'sendChat').mockReturnValue(sendPromise);
    render(
      <I18nProvider>
        <ChatAssistant slug="sunday-lunch" capabilities={caps} />
      </I18nProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open AI assistant' }));
    expect(await screen.findByText(/I am your FiestaPay agent for this invitation/)).toBeInTheDocument();
    expect(screen.getByText('Historial del servidor sin traducir')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Write a message or question...')).toBeInTheDocument();

    const input = screen.getByRole('textbox', { name: 'Message for the assistant' });
    fireEvent.change(input, { target: { value: 'How much is it?' } });
    fireEvent.submit(input.closest('form')!);
    expect(await screen.findByText(/Thinking… \d+ s/)).toBeInTheDocument();
    expect(send).toHaveBeenCalledWith('sunday-lunch', 'How much is it?');
    await act(async () => { resolveSend({ text: 'Respuesta del modelo' }); });
    expect(await screen.findByText('Respuesta del modelo')).toBeInTheDocument();

    const body = document.body.textContent ?? '';
    expect(body).not.toContain('Soy tu asistente');
    expect(body).not.toContain('Escribe un mensaje');
    expect(body).not.toContain('está escribiendo');
  });
});

describe('guest voice panel in English', () => {
  it('shows consent and literal start/stop labels in English', async () => {
    localStorage.setItem('fp_locale', 'en');
    render(
      <I18nProvider>
        <VoiceInvitationAgent
          slug="sunday-lunch"
          capabilities={caps}
          guest={guestFixture({ status: 'yes' })}
          onShowToast={vi.fn()}
        />
      </I18nProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open voice assistant' }));
    expect(screen.getByText('Voice assistant')).toBeInTheDocument();
    expect(screen.getByText('I consent to processing my audio with AssemblyAI')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: labels.startVoice })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: labels.startVoice })).toBeEnabled();

    const body = document.body.textContent ?? '';
    expect(body).not.toContain('Acepto procesar mi audio');
    expect(body).not.toContain('Iniciar Conversación');
    expect(body).not.toContain('Detener y Cerrar');
  });

  it('offers the literal listen label for the public voice', () => {
    localStorage.setItem('fp_locale', 'en');
    render(
      <I18nProvider>
        <VoiceInvitationAgent audience="public" capabilities={{ ...caps, voice: false }} onShowToast={vi.fn()} />
      </I18nProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open voice assistant' }));
    expect(screen.getByRole('button', { name: labels.listen })).toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toContain('Escuchar información');
  });
});
