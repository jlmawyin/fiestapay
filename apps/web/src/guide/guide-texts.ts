import { defineCatalog } from '../i18n/catalog';

/**
 * Textos del resaltado de tours guiados (NAP-F5b). Antes vivían en
 * `i18n/catalogs/orb.ts` junto al orbe retirado; los tours no usan IA y se
 * quedan, así que sus cuatro cadenas viven junto a la guía.
 */
export const guideCatalog = defineCatalog({
  es: {
    guideTapHere: (label: string) => `Pulsa aquí: ${label}`,
    guideNext: 'Siguiente',
    guideExit: 'Salir',
  },
  en: {
    guideTapHere: (label: string) => `Tap here: ${label}`,
    guideNext: 'Next',
    guideExit: 'Exit',
  },
});
