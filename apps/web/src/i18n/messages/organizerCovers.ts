import { defineCatalog } from '../catalog';

/**
 * Visible badge text inside the template cover SVGs. Geometry is untouched;
 * the English badges fit the existing pills. Spanish stays byte-identical.
 */
export const coversCatalog = defineCatalog({
  es: {
    badgeComida: 'COMIDA & ASADO',
    badgeCasa: 'FIESTA EN CASA',
    badgeViaje: 'VIAJE EN GRUPO',
    badgeEvento: 'EVENTO & CELEBRACIÓN',
  },
  en: {
    badgeComida: 'FOOD & BBQ',
    badgeCasa: 'HOUSE PARTY',
    badgeViaje: 'GROUP TRIP',
    badgeEvento: 'EVENT & CELEBRATION',
  },
});
