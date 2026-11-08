import { defineCatalog } from '../catalog';

/**
 * Chat moderation panel. Conversation contents and server messages render
 * verbatim; only the surrounding chrome translates. Spanish stays
 * byte-identical.
 */
export const moderationCatalog = defineCatalog({
  es: {
    panelAria: 'Moderacion de chat',
    title: 'Moderacion de chat',
    note: 'Bloquear corta acciones nuevas de esa sesion. Retirar es logico: no borra pagos. Un pago en verificacion conserva el cupo hasta que se concilie. Esto no identifica a la persona en otro navegador.',
    empty: 'Sin conversaciones.',
    fallback: 'Participante',
    roleUser: 'Persona',
    roleAssistant: 'Asistente',
    deleteMsg: 'Borrar mensaje',
    removedNote: 'Mensaje retirado del historial. La persona lo deja de ver al recargar.',
    readFail: 'No se pudo leer la moderacion.',
    messagesFail: 'No se pudo leer los mensajes.',
    deleteFail: 'No se pudo borrar el mensaje.',
  },
  en: {
    panelAria: 'Chat moderation',
    title: 'Chat moderation',
    note: 'Blocking stops new actions from that session. Withdrawing is logical: it deletes no payments. A payment being verified keeps the seat until it reconciles. This does not identify the person in another browser.',
    empty: 'No conversations.',
    fallback: 'Participant',
    roleUser: 'Person',
    roleAssistant: 'Assistant',
    deleteMsg: 'Delete message',
    removedNote: 'Message withdrawn from the history. The person stops seeing it on reload.',
    readFail: 'Could not read moderation.',
    messagesFail: 'Could not read the messages.',
    deleteFail: 'Could not delete the message.',
  },
});
