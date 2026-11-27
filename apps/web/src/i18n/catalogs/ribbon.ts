import { defineCatalog } from '../catalog';

/** Sandbox ribbon. NAP-F5b: el chat propio murió; la cinta muestra la avatar. */
export const ribbonCatalog = defineCatalog({
  es: {
    regionLabel: 'Aviso de modo sandbox y pagos de prueba',
    badge: 'PAGO DE PRUEBA',
    sandboxLine: 'PayPal sandbox · Sin dinero real',
    checking: 'Comprobando PayPal y avatar',
    paypalConfigured: 'PayPal: Configurado',
    paypalMissing: 'PayPal: No configurado',
    paypalUnavailable: 'PayPal: No disponible',
    avatarConfigured: 'Avatar: Configurada',
    avatarOff: 'Avatar: Desactivada',
    avatarUnavailable: 'Avatar: No disponible',
    retry: 'Reintentar',
  },
  en: {
    regionLabel: 'Sandbox mode and test payments notice',
    badge: 'TEST PAYMENT',
    sandboxLine: 'PayPal sandbox · No real money',
    checking: 'Checking PayPal and avatar',
    paypalConfigured: 'PayPal: Configured',
    paypalMissing: 'PayPal: Not configured',
    paypalUnavailable: 'PayPal: Unavailable',
    avatarConfigured: 'Avatar: Configured',
    avatarOff: 'Avatar: Off',
    avatarUnavailable: 'Avatar: Unavailable',
    retry: 'Retry',
  },
});
