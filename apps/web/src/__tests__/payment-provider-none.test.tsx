/**
 * SP-8 — invitado en sitio `none`: sin botón PayPal ni carga del SDK.
 */
import type { ComponentProps } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PayPalSection } from '../components/invite/PayPalSection';

const { loadScriptMock } = vi.hoisted(() => ({
  loadScriptMock: vi.fn(),
}));

vi.mock('@paypal/paypal-js', () => ({
  loadScript: loadScriptMock,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PayPalSection en sitio sin procesador', () => {
  const base: ComponentProps<typeof PayPalSection> = {
    order: { orderId: 'ORD-NONE-1', status: 'created' },
    capabilities: {
      paypal: false,
      paypalClientId: null,
      paymentProvider: 'none',
      voice: false,
      sandbox: true,
      email: false,
    },
    onCaptureSuccess: async () => false,
    onCancelOrError: () => {},
  };

  it('no carga PayPal JS ni muestra el contenedor del botón', () => {
    render(<PayPalSection {...base} />);
    expect(loadScriptMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Cobro en línea no disponible en este sitio/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /PayPal/i })).not.toBeInTheDocument();
  });
});