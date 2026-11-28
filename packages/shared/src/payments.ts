/**
 * Identificadores del proveedor de cobro en línea por sitio (Somos Panas SP-8, decisión D2).
 * Los sitios nuevos nacen con `none`; el legado FiestaPay conserva `paypal_sandbox`.
 */
export const PAYMENT_PROVIDER_IDS = ['none', 'paypal_sandbox'] as const;

export type PaymentProviderId = (typeof PAYMENT_PROVIDER_IDS)[number];

export function isPaymentProviderId(value: string): value is PaymentProviderId {
  return (PAYMENT_PROVIDER_IDS as readonly string[]).includes(value);
}

/** Traduce el id del sitio a si la web puede mostrar controles PayPal. */
export function siteAllowsPayPalCheckout(provider: PaymentProviderId, paypalConfigured: boolean): boolean {
  return provider === 'paypal_sandbox' && paypalConfigured;
}