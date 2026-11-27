/**
 * Apertura de la avatar Napster desde otras vistas (NAP-F5b). El aviso del
 * formulario manual despacha este evento y la tarjeta montada arranca la
 * sesión con su propio intent y hace scroll hasta ella.
 */

/** NapsterAvatar escucha este evento para arrancar la sesión. */
export const AVATAR_OPEN_EVENT = 'napster:avatar-open' as const;

/** Pide a la avatar montada que arranque (video con su intent). */
export function openAvatar(): void {
  try {
    document.dispatchEvent(new CustomEvent(AVATAR_OPEN_EVENT));
  } catch {
    // Sin tarjeta montada el aviso no hace nada.
  }
}
