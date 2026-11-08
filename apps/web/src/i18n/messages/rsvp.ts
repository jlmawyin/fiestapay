import { defineCatalog } from '../catalog';

/** Guest RSVP form. Spanish stays byte-identical. */
export const rsvpCatalog = defineCatalog({
  es: {
    chooseFirst: 'Elige si vienes antes de guardar.',
    saveError: 'Error al guardar asistencia.',
    heading: 'Tu Asistencia',
    guestIs: 'Invitado: ',
    fullCapacity: (capacity: number) =>
      `La capacidad máxima de esta invitación (${capacity} personas) ya está completa. Si confirmas ahora, se verificará disponibilidad en el servidor.`,
    groupLabel: 'Selecciona tu confirmación de asistencia',
    yes: '¡Sí, voy!',
    maybe: '? Tal vez',
    no: 'No podré ir',
    companionsTitle: '¿Traes acompañantes?',
    companionsHelp: 'Pareja, amigos o familiares que vendrán contigo',
    minusCompanion: 'Restar un acompañante',
    plusCompanion: 'Añadir un acompañante',
    saving: 'Guardando respuesta...',
    save: 'Actualizar mi Asistencia',
  },
  en: {
    chooseFirst: 'Choose whether you are coming before saving.',
    saveError: 'Could not save attendance.',
    heading: 'Your attendance',
    guestIs: 'Guest: ',
    fullCapacity: (capacity: number) =>
      `This invitation is already at full capacity (${capacity} people). If you confirm now, availability will be checked on the server.`,
    groupLabel: 'Choose your attendance confirmation',
    yes: 'Yes, I am coming!',
    maybe: '? Maybe',
    no: 'I cannot make it',
    companionsTitle: 'Bringing companions?',
    companionsHelp: 'Partner, friends, or family coming with you',
    minusCompanion: 'Remove one companion',
    plusCompanion: 'Add one companion',
    saving: 'Saving your answer...',
    save: 'Update my attendance',
  },
});
