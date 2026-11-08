import type { Locale } from '@fiestapay/shared';
import { formatMoney } from '@fiestapay/shared';
import type { Guest } from '../../types';
import { shareableInviteUrl, whatsAppShareUrl } from '../../lib/event-presentation';
import { gridCatalog } from '../../i18n/messages/organizerGrid';

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
}: ReminderParams, locale: Locale = 'es'): string {
  const amountFormatted = formatMoney(dueCents, locale);
  const link = shareableInviteUrl(inviteUrl);
  const m = gridCatalog[locale];
  return m.reminderMsg(guestName, eventTitle, amountFormatted, link);
}

export function buildGuestReminderUrl({
  guestName,
  eventTitle,
  dueCents,
  inviteUrl,
}: ReminderParams, locale: Locale = 'es'): string {
  const message = buildGuestReminderMessage({
    guestName,
    eventTitle,
    dueCents,
    inviteUrl,
  }, locale);
  return whatsAppShareUrl(message);
}

export function canSendReminder(guest: Guest): boolean {
  return guest.status === 'yes' && guest.dueCents > 0;
}

export interface GuestPaymentStatusInfo {
  label: string;
  badgeClass: string;
  isPending: boolean;
}

export function getGuestPaymentStatus(guest: Guest, locale: Locale = 'es'): GuestPaymentStatusInfo {
  const m = gridCatalog[locale];
  if (guest.status === 'yes') {
    if (guest.paidCents === 0 && guest.dueCents > 0) {
      return {
        label: m.statusUnpaid,
        badgeClass: 'badge-coral',
        isPending: true,
      };
    }
    if (guest.paidCents > 0 && guest.dueCents > 0) {
      return {
        label: m.statusPartial,
        badgeClass: 'badge-yellow',
        isPending: true,
      };
    }
    if (guest.dueCents === 0 && guest.paidCents > 0) {
      return {
        label: m.statusPaid,
        badgeClass: 'badge-teal',
        isPending: false,
      };
    }
    return {
      label: m.statusConfirmed,
      badgeClass: 'badge-teal',
      isPending: false,
    };
  }
  if (guest.status === 'maybe') {
    return {
      label: m.statusMaybe,
      badgeClass: 'badge-yellow',
      isPending: false,
    };
  }
  // status === 'no'
  return {
    label: m.statusNo,
    badgeClass: 'badge-coral',
    isPending: false,
  };
}
