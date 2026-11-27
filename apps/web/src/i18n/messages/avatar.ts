import { defineCatalog } from '../catalog';

/**
 * Textos de la avatar Napster en la portada raíz (NAP-F3, visitante Público).
 * Sigue el patrón messages/*: un defineCatalog es/en exportado suelto en
 * messages/index.ts (sin entrar en ALL_GUEST_CATALOGS, cuya prueba fija las claves).
 * Sin «FiestaPay» ni otra IA: el consentimiento nombra solo a Napster.
 */
export const avatarCatalog = defineCatalog({
  es: {
    welcomeTitle: 'Hola, soy tu pana guía de Somos Panas',
    welcomeText:
      'Te presento el sitio, te muestro los eventos abiertos y te acompaño a crear tu espacio.',
    consent:
      'Si eliges conversar, tu voz y tu video los procesa Napster para la llamada. También puedes leer el recorrido sin video.',
    startVideo: 'Conversar con video y voz',
    preferReading: 'Prefiero leer',
    connecting: 'Conectando con tu pana guía…',
    liveLabel: 'Conversando con video y voz',
    endSession: 'Terminar',
    captionsTitle: 'Subtítulos',
    avatarSays: 'Tu pana guía',
    youSaid: 'Tú',
    busyTitle: 'Las salas de video están llenas ahora mismo',
    busyBody: 'Te dejamos el recorrido para leer. Puedes reintentar el video en unos minutos.',
    unavailableTitle: 'El video no está disponible ahora mismo',
    unavailableBody: 'Te dejamos el recorrido para leer. Puedes reintentar el video cuando quieras.',
    readingTitle: 'Recorrido para leer',
    retryVideo: 'Reintentar video',
    sectionHero: 'la portada',
    sectionHow: 'cómo funciona',
    sectionEvents: 'los eventos públicos',
    sectionDonations: 'las donaciones',
    sectionComposer: 'crear un espacio',
    sectionFaq: 'las preguntas frecuentes',
    nowAt: (place: string) => `El visitante ahora está en ${place}.`,
  },
  en: {
    welcomeTitle: 'Hi, I am your Somos Panas buddy guide',
    welcomeText: 'I will show you around, list the open events and help you create your space.',
    consent:
      'If you choose to talk, Napster processes your voice and video for the call. You can also read the tour with no video.',
    startVideo: 'Talk with video and voice',
    preferReading: 'I prefer to read',
    connecting: 'Connecting to your buddy guide…',
    liveLabel: 'Talking with video and voice',
    endSession: 'End',
    captionsTitle: 'Captions',
    avatarSays: 'Your buddy guide',
    youSaid: 'You',
    busyTitle: 'The video rooms are full right now',
    busyBody: 'Here is the tour to read. You can retry video in a few minutes.',
    unavailableTitle: 'Video is not available right now',
    unavailableBody: 'Here is the tour to read. You can retry video whenever you like.',
    readingTitle: 'Tour to read',
    retryVideo: 'Retry video',
    sectionHero: 'the homepage',
    sectionHow: 'how it works',
    sectionEvents: 'the public events',
    sectionDonations: 'donations',
    sectionComposer: 'creating a space',
    sectionFaq: 'the frequent questions',
    nowAt: (place: string) => `The visitor is now at ${place}.`,
  },
});
