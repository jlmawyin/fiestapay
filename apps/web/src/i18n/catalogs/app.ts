import { defineCatalog } from '../catalog';

/** App shell: toasts, banners, and document title. Spanish stays identical. */
export const appCatalog = defineCatalog({
  es: {
    docTitle: 'FiestaPay — Fiestas organizadas, pagos resueltos',
    sessionFallback: 'No se pudo conectar con el servidor backend.',
    eventsFallback: 'No se pudieron cargar tus invitaciones.',
    retryConnection: 'Reintentar Conexión',
    demoNoKey:
      'La demo se creó, pero el servidor no devolvió la clave de organizador. No se abrirá el panel como administrador.',
    demoNoKeyTitle: 'Demo sin clave',
    demoReady: (title: string) => `Demo privada "${title}" creada. Ya puedes probar PayPal Sandbox.`,
    demoReadyTitle: 'Demo privada lista',
    demoCreateFail: 'No se pudo crear la demo privada. Revisa tu conexión e inténtalo de nuevo.',
    demoCreateFailTitle: 'Error al crear demo privada',
    payUncertainFirst:
      'No sabemos si la demo de pago llegó a crearse. Revisa "Mis invitaciones" antes de volver a intentarlo; no se abrirá otra automáticamente.',
    payUncertainTitle: 'Creación sin confirmar',
    payUncertainRetry:
      'No sabemos si la demo de pago llegó a crearse. Revisa "Mis invitaciones" antes de volver a intentarlo. No abriremos otra automáticamente.',
    payCreateFail: 'No se pudo crear la demo de pago. Revisa tu conexión e inténtalo de nuevo.',
    payPrepareFailTitle: 'Error al preparar el pago',
    payReady: (guestName: string) =>
      `Demo de pago lista: ${guestName} asistirá con un acompañante. Revisa la cotización y confirma el pago manualmente en PayPal Sandbox.`,
    payReadyTitle: 'Pago de prueba preparado',
    payIncompleteSlug: (slug: string) =>
      `La demo "${slug}" ya está creada y tu enlace de organizador quedó guardado. No se pudo preparar el ingreso/RSVP; vuelve a intentarlo sin crear otra demo.`,
    payIncompleteNone: 'No se pudo preparar la demo de pago. No se creó ninguna invitación nueva.',
    payIncompleteTitle: 'Demo de pago incompleta',
    resetDone: 'Demostración reiniciada. Las invitaciones reales siguen activas.',
    resetDoneTitle: 'Reinicio completado',
    resetFail: 'Error al reiniciar la demostración',
    resetFailTitle: 'Error',
  },
  en: {
    docTitle: 'FiestaPay — Gatherings organized, payments settled',
    sessionFallback: 'Could not reach the backend server.',
    eventsFallback: 'Your invitations could not be loaded.',
    retryConnection: 'Retry connection',
    demoNoKey:
      'The demo was created, but the server did not return an organizer key. The dashboard will not open as an administrator.',
    demoNoKeyTitle: 'Demo without a key',
    demoReady: (title: string) => `Private demo "${title}" created. You can now try PayPal Sandbox.`,
    demoReadyTitle: 'Private demo ready',
    demoCreateFail: 'The private demo could not be created. Check your connection and try again.',
    demoCreateFailTitle: 'Could not create private demo',
    payUncertainFirst:
      'We do not know whether the payment demo was created. Check "My invitations" before retrying; another one will not open automatically.',
    payUncertainTitle: 'Unconfirmed creation',
    payUncertainRetry:
      'We do not know whether the payment demo was created. Check "My invitations" before retrying. We will not open another one automatically.',
    payCreateFail: 'The payment demo could not be created. Check your connection and try again.',
    payPrepareFailTitle: 'Could not prepare the payment',
    payReady: (guestName: string) =>
      `Payment demo ready: ${guestName} will attend with one companion. Review the quote and confirm the payment manually in PayPal Sandbox.`,
    payReadyTitle: 'Test payment prepared',
    payIncompleteSlug: (slug: string) =>
      `The demo "${slug}" is already created and your organizer link is saved. The join/RSVP could not be prepared; try again without creating another demo.`,
    payIncompleteNone: 'The payment demo could not be prepared. No new invitation was created.',
    payIncompleteTitle: 'Incomplete payment demo',
    resetDone: 'Demo reset. Your real invitations stay active.',
    resetDoneTitle: 'Reset complete',
    resetFail: 'Could not reset the demo',
    resetFailTitle: 'Error',
  },
});
