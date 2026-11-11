import { defineCatalog } from '../catalog';

/**
 * Orb chrome. The launcher open label and the text/voice tabs use
 * UI_LABELS literally at the call site. Guest and organizer chat behavior
 * is unchanged; only these surrounding labels are translated.
 */
export const orbCatalog = defineCatalog({
  es: {
    launcherClose: 'Cerrar Agente FiestaPay',
    launcherShort: 'Agente FiestaPay',
    dialogLabel: 'Agente FiestaPay',
    title: 'Agente FiestaPay',
    subtitlePublicText: 'Información general de FiestaPay',
    subtitlePublicVoice: 'Voz informativa · sin datos del evento',
    subtitleGuestText: 'Agente de esta invitación',
    subtitleGuestVoice: 'Voz de esta invitación',
    subtitleOrganizerText: 'Agente del organizador · solo lectura',
    subtitleOrganizerVoice: 'Voz del organizador · sin cambios automáticos',
    closePanel: 'Cerrar panel del agente',
    minimizePanel: 'Minimizar panel del agente',
    returnToChat: 'Volver al chat',
    guideBarProcessing: 'Procesando…',
    modeLabel: 'Modo del agente',
    guideTapHere: (label: string) => `Pulsa aquí: ${label}`,
    guideFillWithAi: 'Pulsa aquí para que la IA arme tu fiesta',
    guideNext: 'Siguiente',
    guideExit: 'Salir',
    guideBarSpeaking: 'Hablando…',
    guideBarListening: 'Escuchando…',
    guideBarStop: 'Detener',
    guideBarOpen: 'Abrir',
  },
  en: {
    launcherClose: 'Close FiestaPay agent',
    launcherShort: 'FiestaPay agent',
    dialogLabel: 'FiestaPay agent',
    title: 'FiestaPay agent',
    subtitlePublicText: 'General FiestaPay information',
    subtitlePublicVoice: 'Informational voice · no event data',
    subtitleGuestText: 'Agent for this invitation',
    subtitleGuestVoice: 'Voice for this invitation',
    subtitleOrganizerText: 'Organizer agent · read-only',
    subtitleOrganizerVoice: 'Organizer voice · no automatic changes',
    closePanel: 'Close agent panel',
    minimizePanel: 'Minimize agent panel',
    returnToChat: 'Back to chat',
    guideBarProcessing: 'Processing…',
    modeLabel: 'Agent mode',
    guideTapHere: (label: string) => `Tap here: ${label}`,
    guideFillWithAi: 'Tap here to let the AI build your party',
    guideNext: 'Next',
    guideExit: 'Exit',
    guideBarSpeaking: 'Speaking…',
    guideBarListening: 'Listening…',
    guideBarStop: 'Stop',
    guideBarOpen: 'Open',
  },
});
