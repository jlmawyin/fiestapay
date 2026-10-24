import type { Guest } from '../../types';
import { usd } from '../../types';

export interface ReminderParams {
  guestName: string;
  eventTitle: string;
  dueCents: number;
  inviteUrl: string;
}

export function buildGuestReminderMessage({
  guestName,
  eventTitle,
  dueCents,
  inviteUrl,
}: ReminderParams): string {
  const amountFormatted = usd(dueCents);
  return `¡Hola ${guestName}! Te recordamos tu confirmación para "${eventTitle}". Tienes una cuota pendiente de ${amountFormatted}. Puedes revisar los detalles y pagar aquí: ${inviteUrl}`;
}

export function buildGuestReminderUrl({
  guestName,
  eventTitle,
  dueCents,
  inviteUrl,
}: ReminderParams): string {
  const message = buildGuestReminderMessage({
    guestName,
    eventTitle,
    dueCents,
    inviteUrl,
  });
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function canSendReminder(guest: Guest): boolean {
  return guest.status === 'yes' && guest.dueCents > 0;
}

export interface GuestPaymentStatusInfo {
  label: string;
  badgeClass: string;
  isPending: boolean;
}

export function getGuestPaymentStatus(guest: Guest): GuestPaymentStatusInfo {
  if (guest.status === 'yes') {
    if (guest.paidCents === 0 && guest.dueCents > 0) {
      return {
        label: 'Confirmado, sin pagar',
        badgeClass: 'badge-coral',
        isPending: true,
      };
    }
    if (guest.paidCents > 0 && guest.dueCents > 0) {
      return {
        label: 'Confirmado (pago parcial)',
        badgeClass: 'badge-yellow',
        isPending: true,
      };
    }
    if (guest.dueCents === 0 && guest.paidCents > 0) {
      return {
        label: '✓ Confirmado (pagado)',
        badgeClass: 'badge-teal',
        isPending: false,
      };
    }
    return {
      label: '✓ Confirmado',
      badgeClass: 'badge-teal',
      isPending: false,
    };
  }
  if (guest.status === 'maybe') {
    return {
      label: '? Tal vez',
      badgeClass: 'badge-yellow',
      isPending: false,
    };
  }
  // status === 'no'
  return {
    label: '✕ No asistirá',
    badgeClass: 'badge-coral',
    isPending: false,
  };
}
