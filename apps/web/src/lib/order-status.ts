import type { Locale } from '@fiestapay/shared';

/**
 * Translated labels for server status enums shown in the UI (payment rows,
 * order toasts, PayPal panel). Unknown values pass through unchanged so a
 * new server status stays visible instead of vanishing.
 */
const ORDER_STATUS_LABELS: Record<string, { es: string; en: string }> = {
  intent: { es: 'En preparación', en: 'Preparing' },
  created: { es: 'Creada', en: 'Created' },
  approved: { es: 'Aprobada en PayPal', en: 'Approved in PayPal' },
  capturing: { es: 'Verificando captura', en: 'Verifying capture' },
  paid: { es: 'Pagada', en: 'Paid' },
  captured: { es: 'Capturada', en: 'Captured' },
  superseded: { es: 'Reemplazada', en: 'Replaced' },
  failed: { es: 'Fallida', en: 'Failed' },
  expired: { es: 'Vencida', en: 'Expired' },
  cancelled: { es: 'Cancelada', en: 'Cancelled' },
  canceled: { es: 'Cancelada', en: 'Cancelled' },
  voided: { es: 'Anulada', en: 'Voided' },
  refunded: { es: 'Reembolsada', en: 'Refunded' },
  PENDIENTE_DE_APROBACION: { es: 'Pendiente de aprobación', en: 'Pending approval' },
};

export function orderStatusLabel(status: string, locale: Locale = 'es'): string {
  const found = ORDER_STATUS_LABELS[status];
  if (!found) return status;
  return locale === 'en' ? found.en : found.es;
}
