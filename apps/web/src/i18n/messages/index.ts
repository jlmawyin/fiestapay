import type { LocaleCatalog, Messages } from '../catalog';
import { inviteCatalog } from './invite';
import { rsvpCatalog } from './rsvp';
import { paypalCatalog } from './paypal';
import { fundingCatalog } from './funding';
import { guestChatCatalog } from './guestChat';
import { voiceCatalog } from './voice';
import { createEventCatalog } from './organizerCreate';
import { dashboardCatalog } from './organizerDashboard';
import { gridCatalog } from './organizerGrid';
import { moderationCatalog } from './organizerModeration';
import { coversCatalog } from './organizerCovers';
import {
  organizerLinkCatalog,
  qrShareCatalog,
  recoveryCatalog,
  recoveryEmailCatalog,
} from './organizerRecovery';

/** Guest-journey catalogs (FP-BIL-A2). The parity test iterates this map. */
export const ALL_GUEST_CATALOGS: Record<string, LocaleCatalog<Messages>> = {
  invite: inviteCatalog,
  rsvp: rsvpCatalog,
  paypal: paypalCatalog,
  funding: fundingCatalog,
  guestChat: guestChatCatalog,
  voice: voiceCatalog,
};

export { inviteCatalog, rsvpCatalog, paypalCatalog, fundingCatalog, guestChatCatalog, voiceCatalog };

/** Organizer-journey catalogs (FP-BIL-A3). The parity test iterates this map. */
export const ALL_ORGANIZER_CATALOGS: Record<string, LocaleCatalog<Messages>> = {
  createEvent: createEventCatalog,
  dashboard: dashboardCatalog,
  grid: gridCatalog,
  moderation: moderationCatalog,
  covers: coversCatalog,
  recovery: recoveryCatalog,
  recoveryEmail: recoveryEmailCatalog,
  organizerLink: organizerLinkCatalog,
  qrShare: qrShareCatalog,
};

export {
  createEventCatalog,
  dashboardCatalog,
  gridCatalog,
  moderationCatalog,
  coversCatalog,
  recoveryCatalog,
  recoveryEmailCatalog,
  organizerLinkCatalog,
  qrShareCatalog,
};
