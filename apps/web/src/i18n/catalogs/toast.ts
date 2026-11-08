import { defineCatalog } from '../catalog';

/** Toast chrome. The message bodies come from the caller. */
export const toastCatalog = defineCatalog({
  es: {
    regionLabel: 'Notificaciones del sistema',
    success: 'Éxito',
    error: 'Error',
    warning: 'Atención',
    info: 'Aviso',
    dismiss: 'Cerrar notificación',
  },
  en: {
    regionLabel: 'System notifications',
    success: 'Success',
    error: 'Error',
    warning: 'Heads up',
    info: 'Notice',
    dismiss: 'Dismiss notification',
  },
});
