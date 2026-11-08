import { defineCatalog } from '../catalog';

/**
 * Visible badge text inside the template cover SVGs. The pill widths fit
 * both languages. Spanish stays byte-identical.
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
