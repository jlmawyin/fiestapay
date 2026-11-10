import { defineCatalog } from '../catalog';

/** Header chrome. Navigation buttons use UI_LABELS literally at the call site. */
export const headerCatalog = defineCatalog({
  es: {
    logoLabel: 'Ir a la página principal de FiestaPay',
    tagline: 'Anfitrión de fiestas con IA · PayPal',
  },
  en: {
    logoLabel: 'Go to the FiestaPay home page',
    tagline: 'AI party host · PayPal',
  },
});
