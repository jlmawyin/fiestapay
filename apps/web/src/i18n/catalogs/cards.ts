import { defineCatalog } from '../catalog';

/**
 * Event cards shared by the landing (own invitations) and /demo (my demos).
 * Card behavior is unchanged: owner dashboard when a local key exists,
 * recovery otherwise. The recovery button uses UI_LABELS.recoverLink
 * literally at the call site.
 */
export const cardsCatalog = defineCatalog({
  es: {
    quota: (money: string) => `Cuota ${money}`,
    confirmedBadge: 'Confirmada',
    raisedLabel: 'Recaudado:',
    beforeFeesNote: '(antes de comisiones)',
    goalLabel: 'Meta:',
    attendeesLabel: 'Asistentes confirmados:',
    viewInvite: 'Ver Invitación',
    openDashboard: 'Panel de Control',
    noKeyNote:
      'La clave de organizador no está en este navegador. Recupérala con tu correo verificado para abrir el panel.',
    registeredCount: (count: number) => `${count} ${count === 1 ? 'registrada' : 'registradas'}`,
    loading: 'Cargando tus invitaciones...',
    loadErrorTitle: 'No se pudieron cargar tus invitaciones',
    retry: 'Reintentar',
    createButton: '+ Crear invitación',
  },
  en: {
    quota: (money: string) => `Share ${money}`,
    confirmedBadge: 'Confirmed',
    raisedLabel: 'Raised:',
    beforeFeesNote: '(before fees)',
    goalLabel: 'Goal:',
    attendeesLabel: 'Confirmed guests:',
    viewInvite: 'View invitation',
    openDashboard: 'Owner dashboard',
    noKeyNote:
      'The organizer key is not in this browser. Recover it with your verified email to open the dashboard.',
    registeredCount: (count: number) => `${count} ${count === 1 ? 'invitation' : 'invitations'}`,
    loading: 'Loading your invitations...',
    loadErrorTitle: 'Your invitations could not be loaded',
    retry: 'Retry',
    createButton: '+ Create invitation',
  },
});
