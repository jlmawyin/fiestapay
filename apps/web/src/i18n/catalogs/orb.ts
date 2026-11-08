import { defineCatalog } from '../catalog';

/**
 * Orb chrome. The launcher open label and the text/voice tabs use
 * UI_LABELS literally at the call site. Guest and organizer chat behavior
 * is unchanged; only these surrounding labels are translated.
 */
export const orbCatalog = defineCatalog({
  es: {
    launcherClose: 'Cerrar asistente FiestaPay',
    launcherShort: 'Asistente FiestaPay',
    dialogLabel: 'Asistente FiestaPay',
    title: 'Asistente FiestaPay',
    subtitlePublicText: 'Información general de FiestaPay',
    subtitlePublicVoice: 'Voz informativa · sin datos del evento',
    subtitleGuestText: 'Asistente de esta invitación',
    subtitleGuestVoice: 'Voz de esta invitación',
    subtitleOrganizerText: 'Asistente del organizador · solo lectura',
    subtitleOrganizerVoice: 'Voz del organizador · sin cambios automáticos',
    closePanel: 'Cerrar panel del asistente',
    modeLabel: 'Modo del asistente',
  },
  en: {
    launcherClose: 'Close FiestaPay assistant',
    launcherShort: 'FiestaPay assistant',
    dialogLabel: 'FiestaPay assistant',
    title: 'FiestaPay assistant',
    subtitlePublicText: 'General FiestaPay information',
    subtitlePublicVoice: 'Informational voice · no event data',
    subtitleGuestText: 'Assistant for this invitation',
    subtitleGuestVoice: 'Voice for this invitation',
    subtitleOrganizerText: 'Organizer assistant · read-only',
    subtitleOrganizerVoice: 'Organizer voice · no automatic changes',
    closePanel: 'Close assistant panel',
    modeLabel: 'Assistant mode',
  },
});
