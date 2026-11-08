import { defineCatalog } from '../catalog';

/**
 * Recovery route: token states, request form, and statuses. Token logic is
 * untouched; server messages render verbatim. Spanish stays byte-identical.
 */
export const recoveryCatalog = defineCatalog({
  es: {
    panelAria: 'Recuperar enlace de organizador',
    title: 'Recuperar enlace',
    sub: 'El enlace de organizador sigue siendo el acceso principal.',
    tokenNote:
      'El enlace ya esta solo en esta pagina. Recargar la pierde. Pulsa confirmar para usarlo. Abrir el correo no cambia nada por si solo.',
    confirm: 'Confirmar enlace',
    confirming: 'Confirmando...',
    verifiedLead: 'Correo guardado para',
    verifyOk: 'El correo quedo verificado. Ya puede usarse para recuperar el enlace de organizador.',
    recoveredNote: 'Este es el enlace nuevo. El anterior ya no abre el panel.',
    consumeFail: 'El enlace no sirve. Solicita uno nuevo.',
    requestFail: 'No se pudo solicitar el enlace',
    requestOk: 'Si el correo esta verificado para esa invitación, recibirás instrucciones.',
    requestLead: 'Si perdiste el enlace, pide otro con el identificador de la invitación y el correo verificado.',
    slugLabel: 'Identificador de la invitación',
    emailLabel: 'Correo verificado',
    requestCta: 'Solicitar enlace',
    sending: 'Enviando...',
    goDashboard: 'Ir al panel',
    unavailable:
      'La recuperacion por correo no esta disponible en este servidor. Conserva el enlace de organizador; no hace falta un correo.',
  },
  en: {
    panelAria: 'Recover organizer link',
    title: 'Recover link',
    sub: 'The organizer link is still the main access.',
    tokenNote:
      'The link now lives only on this page. Reloading loses it. Press confirm to use it. Opening the email changes nothing by itself.',
    confirm: 'Confirm link',
    confirming: 'Confirming...',
    verifiedLead: 'Email saved for',
    verifyOk: 'The email was verified. It can now be used to recover the organizer link.',
    recoveredNote: 'This is the new link. The previous one no longer opens the dashboard.',
    consumeFail: 'The link does not work. Request a new one.',
    requestFail: 'Could not request the link',
    requestOk: 'If the email is verified for that invitation, you will receive instructions.',
    requestLead: 'If you lost the link, request another one with the invitation id and the verified email.',
    slugLabel: 'Invitation id',
    emailLabel: 'Verified email',
    requestCta: 'Request link',
    sending: 'Sending...',
    goDashboard: 'Go to the dashboard',
    unavailable:
      'Email recovery is not available on this server. Keep the organizer link; no email is needed.',
  },
});

/**
 * Optional recovery email card. The SMTP-accepted note keeps its honest
 * wording: acceptance is not inbox delivery. Spanish stays byte-identical.
 */
export const recoveryEmailCatalog = defineCatalog({
  es: {
    panelAria: 'Correo opcional',
    title: 'Correo opcional',
    unavailable:
      'El correo de recuperacion no esta disponible en este servidor. La invitación se crea igual y el enlace de organizador sigue siendo el acceso.',
    lead: 'No hace falta un correo para crear la invitación. Si lo guardas, primero hay que confirmarlo. Despues puede servir para pedir un enlace nuevo.',
    stateVerified: (masked: string) => `Correo verificado: ${masked}`,
    statePending: (masked: string) => `Correo pendiente de confirmar: ${masked}`,
    stateNone: 'Sin correo de recuperacion',
    reading: 'Leyendo estado...',
    emailLabel: 'Correo del organizador',
    save: 'Guardar correo',
    saving: 'Guardando...',
    remove: 'Quitar correo',
    readFail: 'No se pudo leer el estado del correo.',
    alreadyVerified: 'Ese correo ya estaba verificado.',
    acceptedNote: 'El servidor de salida acepto el correo. Eso no confirma que haya llegado a la bandeja.',
    removedNote: 'Correo quitado. Los enlaces anteriores ya no sirven.',
    saveFail: 'No se pudo guardar el correo',
    removeFail: 'No se pudo quitar el correo',
  },
  en: {
    panelAria: 'Optional email',
    title: 'Optional email',
    unavailable:
      'Recovery email is not available on this server. The invitation is still created and the organizer link remains the access.',
    lead: 'No email is needed to create the invitation. If you save one, it must be confirmed first. Afterwards it can be used to request a new link.',
    stateVerified: (masked: string) => `Verified email: ${masked}`,
    statePending: (masked: string) => `Email pending confirmation: ${masked}`,
    stateNone: 'No recovery email',
    reading: 'Reading status...',
    emailLabel: 'Organizer email',
    save: 'Save email',
    saving: 'Saving...',
    remove: 'Remove email',
    readFail: 'Could not read the email status.',
    alreadyVerified: 'That email was already verified.',
    acceptedNote: 'The outbound server accepted the email. That does not confirm it reached the inbox.',
    removedNote: 'Email removed. Previous links no longer work.',
    saveFail: 'Could not save the email',
    removeFail: 'Could not remove the email',
  },
});

/**
 * Organizer/public link card with the admin QR. URLs stay verbatim; only
 * the surrounding copy translates. Spanish stays byte-identical.
 */
export const organizerLinkCatalog = defineCatalog({
  es: {
    panelAria: 'Enlaces de la invitación',
    title: 'Guarda el enlace de organizador',
    lead: 'Este enlace abre el panel en otro navegador. No lo compartas con invitados. El enlace publico es otro. El correo es opcional y no reemplaza este enlace.',
    recoverLinkText: 'Si lo pierdes, pide recuperacion por correo',
    unavailableSuffix: 'La recuperacion por correo no esta disponible en este servidor.',
    adminLabel: 'Enlace de organizador',
    copyAdmin: 'Copiar enlace de organizador',
    publicLabel: 'Enlace publico para invitados',
    copyPublic: 'Copiar enlace publico',
    copied: 'Copiado',
  },
  en: {
    panelAria: 'Invitation links',
    title: 'Save the organizer link',
    lead: 'This link opens the dashboard in another browser. Do not share it with guests. The public link is a different one. Email is optional and does not replace this link.',
    recoverLinkText: 'If you lose it, request email recovery',
    unavailableSuffix: 'Email recovery is not available on this server.',
    adminLabel: 'Organizer link',
    copyAdmin: 'Copy organizer link',
    publicLabel: 'Public link for guests',
    copyPublic: 'Copy public link',
    copied: 'Copied',
  },
});

/**
 * QR/share modal. The invitation title and URL stay verbatim; the WhatsApp
 * draft arrives already localized. Spanish stays byte-identical.
 */
export const qrShareCatalog = defineCatalog({
  es: {
    title: 'Compartir Invitación',
    desc: (eventTitle: string) => `Invita a tus amigos a "${eventTitle}"`,
    body: 'Tus amigos pueden escanear este código con la cámara de su teléfono para unirse al instante, sin necesidad de descargar ninguna app.',
    linkAria: 'Enlace de invitación para copiar',
    copy: 'Copiar enlace',
    copied: '¡Copiado! ✓',
    draftTitle: 'Borrador para WhatsApp',
    openDraft: 'Abrir borrador en WhatsApp',
    close: 'Cerrar',
  },
  en: {
    title: 'Share Invitation',
    desc: (eventTitle: string) => `Invite your friends to "${eventTitle}"`,
    body: 'Your friends can scan this code with their phone camera to join instantly, with no app to download.',
    linkAria: 'Invitation link to copy',
    copy: 'Copy link',
    copied: 'Copied! ✓',
    draftTitle: 'WhatsApp draft',
    openDraft: 'Open draft in WhatsApp',
    close: 'Close',
  },
});
