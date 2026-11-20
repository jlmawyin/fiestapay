/**
 * SP-8 — invitado en sitio `none`: sin botón PayPal, sin paso de generar pago ni captura.
 */
import type { ComponentProps } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PayPalSection } from '../components/invite/PayPalSection';
import { QuoteReviewCard } from '../components/invite/QuoteReviewCard';

const { loadScriptMock } = vi.hoisted(() => ({
  loadScriptMock: vi.fn(),
}));

vi.mock('@paypal/paypal-js', () => ({
  loadScript: loadScriptMock,
}));

const capsNone = {
  paypal: false,
  paypalClientId: null,
  paymentProvider: 'none' as const,
  voice: false,
  sandbox: true as const,
  email: false,
};

const quote = {
  id: 'q-1',
  guestId: 'g-1',
  people: 1,
  unitCents: 2500,
  totalCents: 2500,
  paidCents: 0,
  amountCents: 2500,
  summary: 'Cuenta',
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('UI invitado sin procesador', () => {
  const paypalBase: ComponentProps<typeof PayPalSection> = {
    order: { orderId: 'ORD-NONE-1', status: 'created' },
    capabilities: capsNone,
    onCaptureSuccess: async () => false,
    onCancelOrError: () => {},
  };

  it('PayPalSection no carga PayPal JS ni muestra el contenedor del botón', () => {
    render(<PayPalSection {...paypalBase} />);
    expect(loadScriptMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Cobro en línea no disponible en este sitio/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /PayPal/i })).not.toBeInTheDocument();
  });

  it('PayPalSection con orden approved no muestra captura manual (SP8-D-3)', () => {
    render(<PayPalSection {...paypalBase} order={{ orderId: 'ORD-NONE-2', status: 'approved' }} />);
    expect(screen.queryByText(/Autorización recibida en PayPal/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Capturar/i })).not.toBeInTheDocument();
  });

  it('QuoteReviewCard sin checkout en línea no muestra Generar pago (SP8-D-2)', () => {
    render(
      <QuoteReviewCard
        quote={quote}
        isLoadingQuote={false}
        onRefreshQuote={async () => {}}
        onCreateOrder={async () => {}}
        isCreatingOrder={false}
        onlineCheckout={false}
      />,
    );
    expect(screen.getByText(/Cobro en línea no disponible en este sitio/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Generar pago/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});