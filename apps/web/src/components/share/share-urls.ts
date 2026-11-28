/**
 * Enlaces para compartir la invitación (NAP-U3). El botón de WhatsApp usa el
 * esquema wa.me pedido, con texto y link codificados; el texto largo lo arma
 * el ayudante existente `buildInviteShareText` (no se duplica).
 */

/** Enlace wa.me con el texto ya codificado. */
export function whatsAppMeUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
