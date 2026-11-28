/**
 * Etiquetas cerradas para sugerir avatares (NAP-S3).
 * Depende solo de TypeScript. La web y las tools comparten estos ids bilingües.
 */
export const AVATAR_TAGS = [
  { id: 'fiesta', es: 'Fiesta', en: 'Party' },
  { id: 'karaoke', es: 'Karaoke', en: 'Karaoke' },
  { id: 'musica', es: 'Música', en: 'Music' },
  { id: 'comida', es: 'Comida', en: 'Food' },
  { id: 'reunion', es: 'Reunión', en: 'Meetup' },
  { id: 'deportes', es: 'Deportes', en: 'Sports' },
  { id: 'ejercicio', es: 'Ejercicio', en: 'Exercise' },
  { id: 'playa', es: 'Playa', en: 'Beach' },
  { id: 'viajes', es: 'Viajes', en: 'Travel' },
  { id: 'navidad', es: 'Navidad', en: 'Christmas' },
  { id: 'recaudacion', es: 'Recaudación', en: 'Fundraising' },
  { id: 'estudio', es: 'Estudio', en: 'Study' },
  { id: 'cultura', es: 'Cultura', en: 'Culture' },
  { id: 'eventos', es: 'Eventos', en: 'Events' },
] as const;

export type AvatarTag = (typeof AVATAR_TAGS)[number]['id'];

export const AVATAR_TAG_IDS: readonly AvatarTag[] = AVATAR_TAGS.map((tag) => tag.id);
