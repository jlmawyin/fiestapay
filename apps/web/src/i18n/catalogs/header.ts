import { defineCatalog } from '../catalog';

/** Header chrome. Navigation buttons use UI_LABELS literally at the call site. */
export const headerCatalog = defineCatalog({
  es: {
    logoLabel: 'Ir a la página principal de FiestaPay',
    tagline: 'Invitaciones con pagos claros',
  },
  en: {
    logoLabel: 'Go to the FiestaPay home page',
    tagline: 'Invitations with clear payments',
  },
});
