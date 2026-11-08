import { defineCatalog } from '../catalog';

/**
 * Sandbox buyer card. The show/copy buttons use UI_LABELS literally at the
 * call site. Spanish strings stay byte-identical to the current UI.
 */
export const buyerCatalog = defineCatalog({
  es: {
    title: 'Cuenta Personal de prueba',
    badge: 'PayPal Sandbox',
    description:
      'Acceso compartido de Sandbox. No se mueve dinero real. Esta cuenta ficticia sirve solo para probar el pago; FiestaPay no inicia sesión ni crea órdenes por ti.',
    loadError: 'No se pudo consultar la cuenta de prueba. Inténtalo de nuevo.',
    retry: 'Reintentar cuenta de prueba',
    loading: 'Consultando la cuenta de prueba…',
    unavailable:
      'La cuenta de prueba no está disponible en este servidor. Puedes continuar creando tu propia invitación, pero no mostraremos datos inventados.',
    emailLabel: 'Correo',
    passwordLabel: 'Contraseña',
    emailAria: 'Correo de la cuenta de prueba',
    passwordAria: 'Contraseña de la cuenta de prueba',
    copying: 'Copiando…',
    emailCopied: 'Correo copiado.',
    passwordCopied: 'Contraseña copiada.',
    copyFallback: 'No se pudo copiar automáticamente. El texto quedó seleccionado; usa Ctrl+C o Cmd+C.',
  },
  en: {
    title: 'Personal test account',
    badge: 'PayPal Sandbox',
    description:
      'Shared Sandbox access. No real money moves. This fictional account is only for testing the payment; FiestaPay does not log in or create orders for you.',
    loadError: 'The test account could not be loaded. Please try again.',
    retry: 'Retry test account',
    loading: 'Loading the test account…',
    unavailable:
      'The test account is not available on this server. You can keep creating your own invitation, but we will not show made-up data.',
    emailLabel: 'Email',
    passwordLabel: 'Password',
    emailAria: 'Test account email',
    passwordAria: 'Test account password',
    copying: 'Copying…',
    emailCopied: 'Email copied.',
    passwordCopied: 'Password copied.',
    copyFallback: 'Automatic copy failed. The text is selected; use Ctrl+C or Cmd+C.',
  },
});
