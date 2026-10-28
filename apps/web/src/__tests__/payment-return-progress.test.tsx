import type { ComponentProps } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Guest } from '../types';
import { api } from '../api/client';
import { PayPalSection } from '../components/invite/PayPalSection';
import { nextReturnDelay, RETURN_BUDGET_MS, RETURN_RETRY_DELAYS_MS, returnServerAction } from '../components/invite/paymentReturn';

const { loadScriptMock, buttonApis } = vi.hoisted(() => ({
  loadScriptMock: vi.fn(),
  buttonApis: [] as Array<{
    createOrder: () => Promise<string>;
    onApprove: () => Promise<void>;
    onCancel: () => void;
    onError: (err: unknown) => void;
  }>,
}));

vi.mock('@paypal/paypal-js', () => ({
  loadScript: loadScriptMock,
}));

const guest: Guest = {
  id: 'guest-ext',
  name: 'Invitada',
  status: 'yes',
  companions: 0,
  paidCents: 0,
  dueCents: 5000,
};

const capsOff = {
  paypal: false,
  paypalClientId: null,
  chat: false,
  voice: false,
  sandbox: true as const,
  email: false,
};

const capsOn = { ...capsOff, paypal: true, paypalClientId: 'client-sandbox-test' };

const order = {
  orderId: 'ORD-EXT-REAL',
  status: 'created',
  approveUrl: 'https://sandbox.paypal.com/checkoutnow?token=ORD-EXT-REAL',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setDocumentHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: hidden ? 'hidden' : 'visible' });
}

async function flushArmTimer() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function openExternalAndReturn(name: RegExp) {
  fireEvent.click(screen.getByRole('link', { name }));
  await flushArmTimer();
  await act(async () => {
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('focus'));
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  setDocumentHidden(false);
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
  buttonApis.length = 0;
});

beforeEach(() => {
  buttonApis.length = 0;
  loadScriptMock.mockImplementation(async () => ({
    Buttons: (config: (typeof buttonApis)[number]) => ({
      render: async () => {
        buttonApis.push(config);
      },
    }),
  }));
});

describe('payment return schedule', () => {
  it('captures only server-approved states and bounds the retries', () => {
    expect(returnServerAction('approved')).toBe('capture');
    expect(returnServerAction('paid')).toBe('capture');
    expect(returnServerAction('capturing')).toBe('capture');
    expect(returnServerAction('created')).toBe('retry');
    expect(returnServerAction('cancelled')).toBe('stop');
    expect(returnServerAction('failed')).toBe('stop');
    expect(returnServerAction('APPROVED')).toBe('stop');
    expect(nextReturnDelay(1, 0, 0)).toBe(RETURN_RETRY_DELAYS_MS[0]);
    expect(nextReturnDelay(2, 0, 2_000)).toBe(RETURN_RETRY_DELAYS_MS[1]);
    expect(nextReturnDelay(3, 0, 6_000)).toBe(RETURN_RETRY_DELAYS_MS[2]);
    expect(nextReturnDelay(4, 0, 14_000)).toBeNull();
    expect(nextReturnDelay(1, 0, RETURN_BUDGET_MS - 1_000)).toBeNull();
    expect(nextReturnDelay(0, 0, 0)).toBeNull();
  });
});

describe('PayPal external return progress', () => {
  const externalName = /Abrir enlace de aprobación PayPal/i;

  function renderSection(overrides: Partial<ComponentProps<typeof PayPalSection>> = {}) {
    const onCaptureSuccess = vi.fn<(id: string) => Promise<boolean>>(async () => false);
    const onCancelOrError = vi.fn();
    const view = render(
      <PayPalSection
        order={order}
        capabilities={capsOff}
        onCaptureSuccess={onCaptureSuccess}
        onCancelOrError={onCancelOrError}
        {...overrides}
      />,
    );
    return { ...view, onCaptureSuccess, onCancelOrError };
  }

  it('does not treat a URL, stored order, or focus as payment', async () => {
    sessionStorage.setItem('fiestapay_order_x', JSON.stringify({ orderId: 'ORD-OTHER', status: 'paid', approveUrl: 'https://sandbox.paypal.com/other' }));
    window.history.replaceState({}, '', '/e/x?paypal=approved&token=ORD-OTHER&PayerID=PAYER');
    const getOrder = vi.spyOn(api, 'getOrder');
    const { onCaptureSuccess } = renderSection();

    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('focus'));

    expect(getOrder).not.toHaveBeenCalled();
    expect(onCaptureSuccess).not.toHaveBeenCalled();
    expect(screen.queryByText(/confirmado con éxito/i)).toBeNull();
    expect(screen.getByRole('link', { name: externalName })).toHaveAttribute('href', order.approveUrl);
  });

  it('shows busy feedback immediately and captures once after the server reports approved', async () => {
    const pending = deferred<{ status: string; guest: Guest }>();
    const capture = deferred<boolean>();
    vi.spyOn(api, 'getOrder').mockReturnValue(pending.promise);
    const { onCaptureSuccess } = renderSection();
    onCaptureSuccess.mockReturnValue(capture.promise);

    await openExternalAndReturn(externalName);

    const live = screen.getByText(/Comprobando el pago con el servidor/).closest('[aria-live="polite"]');
    expect(live).toHaveAttribute('aria-busy', 'true');
    expect(api.getOrder).toHaveBeenCalledTimes(1);
    expect(api.getOrder).toHaveBeenCalledWith('ORD-EXT-REAL');
    expect(onCaptureSuccess).not.toHaveBeenCalled();
    expect(screen.queryByText(/confirmado con éxito/i)).toBeNull();

    window.dispatchEvent(new Event('focus'));
    expect(api.getOrder).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve({ status: 'approved', guest });
    });

    await waitFor(() => expect(onCaptureSuccess).toHaveBeenCalledTimes(1));
    expect(onCaptureSuccess).toHaveBeenCalledWith('ORD-EXT-REAL');
    expect(screen.getByText(/Verificando captura con el servidor/)).toBeInTheDocument();
    expect(screen.queryByText(/confirmado con éxito/i)).toBeNull();

    await act(async () => {
      capture.resolve(true);
    });

    expect(screen.getByText(/confirmado con éxito/i)).toBeInTheDocument();
  });

  it('does not show success when capture returns unpaid, including a paid reconcile', async () => {
    vi.spyOn(api, 'getOrder').mockResolvedValue({ status: 'paid', guest: { ...guest, paidCents: 5000, dueCents: 0 } });
    const { onCaptureSuccess } = renderSection();
    onCaptureSuccess.mockResolvedValue(false);

    await openExternalAndReturn(externalName);

    await waitFor(() => expect(onCaptureSuccess).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/confirmado con éxito/i)).toBeNull();
    expect(screen.getByText(/No se marcó como pagado/)).toBeInTheDocument();
  });

  it('keeps a manual retry after a reconcile error and does not capture early', async () => {
    vi.spyOn(api, 'getOrder').mockRejectedValue(new Error('network down'));
    const { onCaptureSuccess, onCancelOrError } = renderSection();

    await openExternalAndReturn(externalName);

    await waitFor(() => expect(screen.getByText(/No pudimos consultar la orden/)).toBeInTheDocument());
    expect(onCaptureSuccess).not.toHaveBeenCalled();
    expect(onCancelOrError).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Verificar / Continuar Captura' }));
    await waitFor(() => expect(onCaptureSuccess).toHaveBeenCalledTimes(1));
    expect(onCaptureSuccess).toHaveBeenCalledWith('ORD-EXT-REAL');
  });

  it('single-flights a manual verify with the in-flight return check', async () => {
    const pending = deferred<{ status: string; guest: Guest }>();
    const capture = deferred<boolean>();
    vi.spyOn(api, 'getOrder').mockReturnValue(pending.promise);
    const { onCaptureSuccess } = renderSection();
    onCaptureSuccess.mockReturnValue(capture.promise);

    await openExternalAndReturn(externalName);
    fireEvent.click(screen.getByRole('button', { name: 'Verificar / Continuar Captura' }));
    fireEvent.click(screen.getByRole('button', { name: /Verificando/ }));
    window.dispatchEvent(new Event('focus'));

    expect(onCaptureSuccess).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.resolve({ status: 'approved', guest });
      capture.resolve(false);
    });
    expect(onCaptureSuccess).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/confirmado con éxito/i)).toBeNull();
  });

  it('stops an unapproved order without capturing and still allows a later manual retry', async () => {
    vi.useFakeTimers();
    vi.spyOn(api, 'getOrder').mockResolvedValue({ status: 'created', guest });
    const { onCaptureSuccess } = renderSection();

    fireEvent.click(screen.getByRole('link', { name: externalName }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => {
      window.dispatchEvent(new Event('blur'));
      window.dispatchEvent(new Event('focus'));
    });
    expect(api.getOrder).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(api.getOrder).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(4_000); });
    expect(api.getOrder).toHaveBeenCalledTimes(3);
    await act(async () => { await vi.advanceTimersByTimeAsync(8_000); });
    expect(api.getOrder).toHaveBeenCalledTimes(4);
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(api.getOrder).toHaveBeenCalledTimes(4);
    expect(onCaptureSuccess).not.toHaveBeenCalled();
    expect(screen.getByText(/Nada se marcó como pagado/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Verificar / Continuar Captura' }));
    expect(onCaptureSuccess).toHaveBeenCalledTimes(1);
  });

  it('does not reconcile from a hidden tab and resumes one check when it is visible', async () => {
    vi.useFakeTimers();
    vi.spyOn(api, 'getOrder').mockResolvedValue({ status: 'created', guest });
    renderSection();

    fireEvent.click(screen.getByRole('link', { name: externalName }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    setDocumentHidden(true);
    await act(async () => {
      window.dispatchEvent(new Event('blur'));
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });
    expect(api.getOrder).not.toHaveBeenCalled();

    setDocumentHidden(false);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(api.getOrder).toHaveBeenCalledTimes(1);

    setDocumentHidden(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(api.getOrder).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(api.getOrder).toHaveBeenCalledTimes(1);

    setDocumentHidden(false);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(api.getOrder).toHaveBeenCalledTimes(2);
  });

  it('ignores a late reconcile after unmount or an order change', async () => {
    const pending = deferred<{ status: string; guest: Guest }>();
    vi.spyOn(api, 'getOrder').mockReturnValue(pending.promise);
    const first = renderSection();

    await openExternalAndReturn(externalName);
    first.unmount();
    await act(async () => {
      pending.resolve({ status: 'approved', guest });
    });
    expect(first.onCaptureSuccess).not.toHaveBeenCalled();

    const secondPending = deferred<{ status: string; guest: Guest }>();
    vi.mocked(api.getOrder).mockReturnValue(secondPending.promise);
    const second = renderSection();
    await openExternalAndReturn(externalName);
    second.rerender(
      <PayPalSection
        order={{ ...order, orderId: 'ORD-NEXT' }}
        capabilities={capsOff}
        onCaptureSuccess={second.onCaptureSuccess}
        onCancelOrError={second.onCancelOrError}
      />,
    );
    await act(async () => {
      secondPending.resolve({ status: 'paid', guest: { ...guest, paidCents: 5000, dueCents: 0 } });
    });
    expect(second.onCaptureSuccess).not.toHaveBeenCalled();
    expect(screen.queryByText(/confirmado con éxito/i)).toBeNull();
    expect(api.getOrder).toHaveBeenCalledWith('ORD-EXT-REAL');
    expect(api.getOrder).not.toHaveBeenCalledWith('ORD-OTHER');
  });

  it('stops on a terminal server status without capturing', async () => {
    vi.spyOn(api, 'getOrder').mockResolvedValue({ status: 'failed', guest });
    const { onCaptureSuccess } = renderSection();
    await openExternalAndReturn(externalName);
    await waitFor(() => expect(screen.getByText(/figura como "failed"/)).toBeInTheDocument());
    expect(onCaptureSuccess).not.toHaveBeenCalled();
    expect(screen.queryByText(/confirmado con éxito/i)).toBeNull();
  });
});

describe('PayPal yellow popup capture', () => {
  function renderReady() {
    const onCaptureSuccess = vi.fn<(id: string) => Promise<boolean>>(async () => true);
    const onCancelOrError = vi.fn();
    const createOrder = vi.spyOn(api, 'createOrder');
    const view = render(
      <PayPalSection
        order={order}
        capabilities={capsOn}
        onCaptureSuccess={onCaptureSuccess}
        onCancelOrError={onCancelOrError}
      />,
    );
    return { ...view, onCaptureSuccess, onCancelOrError, createOrder };
  }

  it('returns the existing order and auto-captures once from onApprove', async () => {
    const script = deferred<{ Buttons: (config: (typeof buttonApis)[number]) => { render: () => Promise<void> } }>();
    loadScriptMock.mockReturnValue(script.promise);
    const capture = deferred<boolean>();
    const { onCaptureSuccess, createOrder } = renderReady();
    onCaptureSuccess.mockReturnValue(capture.promise);

    expect(screen.getByText(/Cargando interfaz oficial de PayPal Sandbox/)).toBeInTheDocument();
    await act(async () => {
      script.resolve({
        Buttons: (config) => ({
          render: async () => { buttonApis.push(config); },
        }),
      });
    });
    await waitFor(() => expect(buttonApis).toHaveLength(1));
    expect(screen.queryByText(/Cargando interfaz oficial de PayPal Sandbox/)).toBeNull();
    await act(async () => {
      expect(await buttonApis[0].createOrder()).toBe('ORD-EXT-REAL');
      void buttonApis[0].onApprove();
      void buttonApis[0].onApprove();
    });

    expect(createOrder).not.toHaveBeenCalled();
    expect(onCaptureSuccess).toHaveBeenCalledTimes(1);
    expect(onCaptureSuccess).toHaveBeenCalledWith('ORD-EXT-REAL');
    expect(screen.getByText(/Verificando captura con el servidor/)).toBeInTheDocument();
    expect(screen.queryByText(/confirmado con éxito/i)).toBeNull();

    await act(async () => { capture.resolve(true); });
    expect(screen.getByText(/confirmado con éxito/i)).toBeInTheDocument();
  });

  it('single-flights the popup with a focus return and reports cancel or error without capture', async () => {
    const pending = deferred<{ status: string; guest: Guest }>();
    const capture = deferred<boolean>();
    vi.spyOn(api, 'getOrder').mockReturnValue(pending.promise);
    const { onCaptureSuccess, onCancelOrError } = renderReady();
    onCaptureSuccess.mockReturnValue(capture.promise);

    await waitFor(() => expect(buttonApis).toHaveLength(1));
    await openExternalAndReturn(/Abrir PayPal/i);
    await act(async () => { void buttonApis[0].onApprove(); });
    expect(onCaptureSuccess).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve({ status: 'approved', guest });
      capture.resolve(false);
    });
    expect(onCaptureSuccess).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/confirmado con éxito/i)).toBeNull();

    buttonApis[0].onCancel();
    buttonApis[0].onError(new Error('popup denied'));
    expect(onCaptureSuccess).toHaveBeenCalledTimes(1);
    expect(onCancelOrError).toHaveBeenCalledTimes(2);
    expect(onCancelOrError.mock.calls.some(([message]) => String(message).includes('cancelado'))).toBe(true);
    expect(onCancelOrError.mock.calls.some(([message]) => String(message).includes('popup denied'))).toBe(true);
  });

  it('retries a failed SDK load without creating an order', async () => {
    loadScriptMock.mockRejectedValueOnce(new Error('sdk blocked'));
    const createOrder = vi.spyOn(api, 'createOrder');
    render(
      <PayPalSection
        order={order}
        capabilities={capsOn}
        onCaptureSuccess={vi.fn(async () => false)}
        onCancelOrError={vi.fn()}
      />,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/sdk blocked/);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar carga de PayPal' }));
    await waitFor(() => expect(buttonApis).toHaveLength(1));
    expect(loadScriptMock).toHaveBeenCalledTimes(2);
    expect(createOrder).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not apply a popup capture that finishes after the order changed', async () => {
    const capture = deferred<boolean>();
    const { onCaptureSuccess, rerender, onCancelOrError } = renderReady();
    onCaptureSuccess.mockReturnValue(capture.promise);
    await waitFor(() => expect(buttonApis).toHaveLength(1));

    await act(async () => { void buttonApis[0].onApprove(); });
    expect(onCaptureSuccess).toHaveBeenCalledWith('ORD-EXT-REAL');
    rerender(
      <PayPalSection
        order={{ ...order, orderId: 'ORD-NEXT' }}
        capabilities={capsOn}
        onCaptureSuccess={onCaptureSuccess}
        onCancelOrError={onCancelOrError}
      />,
    );
    await act(async () => { capture.resolve(true); });
    expect(screen.queryByText(/confirmado con éxito/i)).toBeNull();
    expect(onCaptureSuccess).toHaveBeenCalledTimes(1);
  });
});
