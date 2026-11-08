import { defineCatalog } from '../catalog';

/** Sandbox ribbon. Spanish strings stay byte-identical to the current UI. */
export const ribbonCatalog = defineCatalog({
  es: {
    regionLabel: 'Aviso de modo sandbox y pagos de prueba',
    badge: 'PAGO DE PRUEBA',
    sandboxLine: 'PayPal sandbox · Sin dinero real',
    checking: 'Comprobando PayPal y chat',
    paypalConfigured: 'PayPal: Configurado',
    paypalMissing: 'PayPal: No configurado',
    paypalUnavailable: 'PayPal: No disponible',
    chatConfigured: 'Chat: Configurado',
    chatOff: 'Chat: Desactivado',
    chatUnavailable: 'Chat: No disponible',
    retry: 'Reintentar',
  },
  en: {
    regionLabel: 'Sandbox mode and test payments notice',
    badge: 'TEST PAYMENT',
    sandboxLine: 'PayPal sandbox · No real money',
    checking: 'Checking PayPal and chat',
    paypalConfigured: 'PayPal: Configured',
    paypalMissing: 'PayPal: Not configured',
    paypalUnavailable: 'PayPal: Unavailable',
    chatConfigured: 'Chat: Configured',
    chatOff: 'Chat: Off',
    chatUnavailable: 'Chat: Unavailable',
    retry: 'Retry',
  },
});
