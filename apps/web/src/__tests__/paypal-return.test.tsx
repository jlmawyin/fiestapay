import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicInviteView } from '../views/PublicInviteView';
import { api } from '../api/client';
import type { FiestaEvent, Guest } from '../types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/e/test-fiesta');
});

const mockGuest: Guest = {
  id: 'guest-100',
  name: 'Alejandro',
  status: 'yes',
  companions: 0,
  paidCents: 0,
  dueCents: 2500,
};

const mockEvent: FiestaEvent = {
  id: 'event-100',
  slug: 'test-fiesta',
  title: 'Almuerzo de Amigos',
  template: 'comida',
  meal: 'almuerzo',
  description: 'Reunión de prueba',
  startsAt: '2026-11-01T13:00:00Z',
  location: 'Guayaquil',
  includes: ['Comida', 'Bebida'],
  priceCents: 2500,
  capacity: 10,
  goalCents: 10000,
  minimumCents: 5000,
  agenda: [],
  confirmed: false,
  collectedCents: 0,
  confirmedPeople: 1,
  minimumReached: false,
  createdAt: '2026-10-15T00:00:00Z',
};

const mockCapabilities = {
  paypal: false, // fallback button mode
  paypalClientId: null,
  gemini: false,
  voice: false,
  sandbox: true as const,
};

describe('PayPal Return Flow, URL Order Recovery and Capture Safety', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getOrder').mockResolvedValue({status:'approved', guest:mockGuest});
    vi.spyOn(api, 'getEventBySlug').mockResolvedValue({
      event: mockEvent,
      guest: mockGuest,
    });
    vi.spyOn(api, 'getQuote').mockResolvedValue({
      quote: {
        id: 'quote-100',
        guestId: mockGuest.id,
        people: 1,
        unitCents: 2500,
        totalCents: 2500,
        paidCents: 0,
        amountCents: 2500,
        summary: '1 persona',
        expiresAt: '2099-01-01T00:00:00Z',
      },
    });
  });

  it('recovers active order in a new tab without sessionStorage when returning with ?paypal=approved&token=...', async () => {
    // Simulate new tab return URL from PayPal: empty sessionStorage
    window.history.replaceState({}, '', '/e/test-fiesta?paypal=approved&token=ORD-SANDBOX-777&PayerID=TESTPAYER');
    expect(sessionStorage.getItem('fiestapay_order_test-fiesta')).toBeNull();

    const captureSpy = vi.spyOn(api, 'captureOrder');
    const onShowToast = vi.fn();

    render(
      <PublicInviteView
        slug="test-fiesta"
        capabilities={mockCapabilities}
        onShowToast={onShowToast}
        onNavigateHome={vi.fn()}
      />
    );

    // 1. Order state is recovered from the authenticated server, not from URL flags.
    await waitFor(() => {
      const stored = sessionStorage.getItem('fiestapay_order_test-fiesta');
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed.orderId).toBe('ORD-SANDBOX-777');
      expect(parsed.status).toBe('approved');
    });
    expect(api.getOrder).toHaveBeenCalledWith('ORD-SANDBOX-777');

    // 2. URL parameters are cleaned up
    expect(window.location.search).toBe('');

    // 3. Informational toast informs return, but does NOT claim payment success
    expect(onShowToast).toHaveBeenCalledWith(
      'info',
      expect.stringContaining('Has regresado de PayPal'),
      expect.any(String)
    );

    // 4. Token/PayerID is NEVER trusted as payment proof -> capture was NOT called automatically
    expect(captureSpy).not.toHaveBeenCalled();

    // 5. Human confirmation banner is visible with button to complete capture
    expect(await screen.findByText(/Autorización recibida en PayPal/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Confirmar y Completar Captura de Pago/i })).toBeInTheDocument();
  });

  it('completes capture with human confirmation and verified server paid status', async () => {
    window.history.replaceState({}, '', '/e/test-fiesta?paypal=approved&token=ORD-SANDBOX-777');

    const captureSpy = vi.spyOn(api, 'captureOrder').mockResolvedValueOnce({
      status: 'paid',
      guest: { ...mockGuest, paidCents: 2500, dueCents: 0 },
    });
    const onShowToast = vi.fn();

    render(
      <PublicInviteView
        slug="test-fiesta"
        capabilities={mockCapabilities}
        onShowToast={onShowToast}
        onNavigateHome={vi.fn()}
      />
    );

    const confirmBtn = await screen.findByRole('button', { name: /Confirmar y Completar Captura de Pago/i });
    fireEvent.click(confirmBtn);

    // Human confirmation triggers backend capture with orderId
    await waitFor(() => {
      expect(captureSpy).toHaveBeenCalledWith('ORD-SANDBOX-777');
    });

    // Upon verified paid status, success toast is shown and order is cleared
    await waitFor(() => {
      expect(onShowToast).toHaveBeenCalledWith(
        'success',
        expect.stringContaining('capturado correctamente por el servidor'),
        expect.stringContaining('Pago confirmado')
      );
    });

    // sessionStorage order cleared upon verified payment
    expect(sessionStorage.getItem('fiestapay_order_test-fiesta')).toBeNull();
  });

  it('does NOT show success or mark paid when capture response is non-paid', async () => {
    window.history.replaceState({}, '', '/e/test-fiesta?paypal=approved&token=ORD-SANDBOX-777');

    const captureSpy = vi.spyOn(api, 'captureOrder').mockResolvedValueOnce({
      status: 'approved', // Not paid yet (e.g. pending settlement)
      guest: mockGuest,
    });
    const onShowToast = vi.fn();

    render(
      <PublicInviteView
        slug="test-fiesta"
        capabilities={mockCapabilities}
        onShowToast={onShowToast}
        onNavigateHome={vi.fn()}
      />
    );

    const confirmBtn = await screen.findByRole('button', { name: /Confirmar y Completar Captura de Pago/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(captureSpy).toHaveBeenCalledWith('ORD-SANDBOX-777');
    });

    // Warning toast shown; NO success toast
    await waitFor(() => {
      expect(onShowToast).toHaveBeenCalledWith(
        'warning',
        expect.stringContaining('El servidor reporta el estado de la orden como "approved"'),
        expect.stringContaining('Verificación de Pago')
      );
    });

    expect(onShowToast).not.toHaveBeenCalledWith(
      'success',
      expect.anything(),
      expect.anything()
    );

    // Order remains active and saved in sessionStorage for retry/reconciliation
    expect(sessionStorage.getItem('fiestapay_order_test-fiesta')).not.toBeNull();
  });

  it('does NOT trigger capture when returning with ?paypal=cancelled', async () => {
    window.history.replaceState({}, '', '/e/test-fiesta?paypal=cancelled&token=ORD-SANDBOX-CANCELLED');

    const captureSpy = vi.spyOn(api, 'captureOrder');
    const onShowToast = vi.fn();

    render(
      <PublicInviteView
        slug="test-fiesta"
        capabilities={mockCapabilities}
        onShowToast={onShowToast}
        onNavigateHome={vi.fn()}
      />
    );

    // Cancellation says nothing about whether a concurrent capture settled.
    await waitFor(() => {
      expect(onShowToast).toHaveBeenCalledWith(
        'info',
        expect.stringContaining('cancelación'),
        'Regreso de PayPal'
      );
    });

    // Must NOT capture automatically on cancellation
    expect(captureSpy).not.toHaveBeenCalled();

    // Order is retained so user can retry or dismiss
    await waitFor(() => expect(sessionStorage.getItem('fiestapay_order_test-fiesta')).not.toBeNull());
  });

  it('does not trust an approved URL when the server still reports created', async () => {
    window.history.replaceState({}, '', '/e/test-fiesta?paypal=approved&token=ORD-UNAPPROVED');
    vi.mocked(api.getOrder).mockResolvedValue({status:'created', guest:mockGuest});
    const captureSpy=vi.spyOn(api,'captureOrder');
    render(<PublicInviteView slug="test-fiesta" capabilities={mockCapabilities} onShowToast={vi.fn()} onNavigateHome={vi.fn()} />);
    await waitFor(() => expect(JSON.parse(sessionStorage.getItem('fiestapay_order_test-fiesta') || 'null')?.status).toBe('created'));
    expect(screen.queryByText(/Autorización recibida en PayPal/i)).not.toBeInTheDocument();
    expect(captureSpy).not.toHaveBeenCalled();
  });

  it('rejects an owned order whose guest belongs to another invitation', async () => {
    window.history.replaceState({}, '', '/e/test-fiesta?paypal=approved&token=ORD-OTHER-EVENT');
    vi.mocked(api.getOrder).mockResolvedValue({status:'approved', guest:{...mockGuest,id:'another-guest'}});
    const onShowToast=vi.fn();
    const captureSpy=vi.spyOn(api,'captureOrder');
    render(<PublicInviteView slug="test-fiesta" capabilities={mockCapabilities} onShowToast={onShowToast} onNavigateHome={vi.fn()} />);
    await waitFor(() => expect(onShowToast).toHaveBeenCalledWith('warning',expect.any(String),'Orden sin verificar'));
    expect(sessionStorage.getItem('fiestapay_order_test-fiesta')).toBeNull();
    expect(screen.queryByRole('button',{name:/Confirmar y Completar Captura/})).not.toBeInTheDocument();
    expect(captureSpy).not.toHaveBeenCalled();
  });

  it('uses verified paid state after cancellation without starting another capture', async () => {
    window.history.replaceState({}, '', '/e/test-fiesta?paypal=cancelled&token=ORD-ALREADY-PAID');
    const paidGuest={...mockGuest,paidCents:2500,dueCents:0};
    vi.mocked(api.getOrder).mockResolvedValue({status:'paid',guest:paidGuest});
    vi.mocked(api.getEventBySlug).mockResolvedValue({event:{...mockEvent,collectedCents:2500},guest:paidGuest});
    const onShowToast=vi.fn();
    const captureSpy=vi.spyOn(api,'captureOrder');
    render(<PublicInviteView slug="test-fiesta" capabilities={mockCapabilities} onShowToast={onShowToast} onNavigateHome={vi.fn()} />);
    await waitFor(() => expect(onShowToast).toHaveBeenCalledWith('success',expect.stringContaining('ya está pagada'),'Pago confirmado'));
    expect(captureSpy).not.toHaveBeenCalled();
  });

  it.each(['superseded','failed'])('does not reopen a %s order for checkout', async (status) => {
    window.history.replaceState({}, '', '/e/test-fiesta?paypal=approved&token=ORD-CLOSED');
    vi.mocked(api.getOrder).mockResolvedValue({status,guest:mockGuest});
    const onShowToast=vi.fn();
    render(<PublicInviteView slug="test-fiesta" capabilities={mockCapabilities} onShowToast={onShowToast} onNavigateHome={vi.fn()} />);
    await waitFor(() => expect(onShowToast).toHaveBeenCalledWith('warning',expect.any(String),'Orden cerrada'));
    expect(screen.queryByText('Completar Pago Seguro')).not.toBeInTheDocument();
    expect(sessionStorage.getItem('fiestapay_order_test-fiesta')).toBeNull();
  });

  it.each(['capture','reconcile'])('ignores late %s success after navigation to another invitation', async (operation) => {
    window.history.replaceState({}, '', '/e/test-fiesta?paypal=approved&token=ORD-PENDING');
    let resolve!: (value:{status:string;guest:Guest}) => void;
    const pending=new Promise<{status:string;guest:Guest}>(done=>{resolve=done;});
    const captureSpy=vi.spyOn(api,'captureOrder').mockReturnValue(pending);
    const onShowToast=vi.fn();
    const props={capabilities:mockCapabilities,onShowToast,onNavigateHome:vi.fn()};
    const view=render(<PublicInviteView slug="test-fiesta" {...props} />);
    await screen.findByRole('button',{name:/Confirmar y Completar Captura/});
    if(operation==='capture') {
      fireEvent.click(screen.getByRole('button',{name:/Confirmar y Completar Captura/}));
      await waitFor(()=>expect(captureSpy).toHaveBeenCalled());
    } else {
      vi.mocked(api.getOrder).mockReturnValueOnce(pending);
      fireEvent.click(screen.getByRole('button',{name:/Verificar Estado/}));
      await waitFor(()=>expect(api.getOrder).toHaveBeenCalledTimes(2));
    }
    vi.mocked(api.getEventBySlug).mockResolvedValue({event:{...mockEvent,id:'event-two',slug:'second',title:'Segunda fiesta'},guest:{...mockGuest,id:'guest-two',name:'Invitado segundo',status:'maybe'}});
    view.rerender(<PublicInviteView slug="second" {...props} />);
    await screen.findByRole('heading',{name:'Segunda fiesta'});
    await act(async () => { resolve({status:'paid',guest:{...mockGuest,paidCents:2500,dueCents:0}}); await pending; });
    await waitFor(()=>expect(screen.getByRole('heading',{name:'Segunda fiesta'})).toBeInTheDocument());
    expect(onShowToast).not.toHaveBeenCalledWith('success',expect.anything(),expect.anything());
    expect(api.getEventBySlug).toHaveBeenLastCalledWith('second');
    expect(screen.queryByText(/Alejandro/)).not.toBeInTheDocument();
  });
});
