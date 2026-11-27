import { defineCatalog } from '../catalog';

/** Header chrome. Navigation buttons use UI_LABELS literally at the call site. */
export const headerCatalog = defineCatalog({
  es: {
    logoLabel: 'Ir a la página principal de Somos Panas',
    tagline: 'De Somos Panas · PayPal',
  },
  en: {
    logoLabel: 'Go to the Somos Panas home page',
    tagline: 'By Somos Panas · PayPal',
  },
});
