import { defineCatalog } from '../catalog';

/**
 * Textos para compartir la invitación (NAP-U3): QR de invitados y de
 * administrador, descargas de imagen, WhatsApp y copiar enlace. Catálogo
 * suelto, fuera de los mapas con claves fijas.
 */
export const shareCatalog = defineCatalog({
  es: {
    guestQrTitle: 'QR de invitados',
    guestQrBody: 'Tus panas lo escanean y llegan a tu invitación.',
    adminQrTitle: 'QR de administrador',
    adminWarning: 'No compartas este QR: abre tu panel de organizador',
    downloadSquare: 'Descargar cuadrada (1080×1080)',
    downloadStory: 'Descargar vertical (1080×1920)',
    downloading: 'Armando imagen…',
    whatsapp: 'Enviar por WhatsApp',
    copyLink: 'Copiar enlace',
    copied: 'Enlace copiado',
    shareTitle: 'Comparte tu invitación',
  },
  en: {
    guestQrTitle: 'Guest QR',
    guestQrBody: 'Your friends scan it and land on your invitation.',
    adminQrTitle: 'Organizer QR',
    adminWarning: 'Do not share this QR: it opens your organizer panel',
    downloadSquare: 'Download square (1080×1080)',
    downloadStory: 'Download vertical (1080×1920)',
    downloading: 'Building image…',
    whatsapp: 'Send over WhatsApp',
    copyLink: 'Copy link',
    copied: 'Link copied',
    shareTitle: 'Share your invitation',
  },
});
