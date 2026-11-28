import type { LocaleCatalog, Messages } from '../catalog';
import { avatarCatalog } from './avatar';
import { inviteCatalog } from './invite';
import { rsvpCatalog } from './rsvp';
import { paypalCatalog } from './paypal';
import { fundingCatalog } from './funding';
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
};

export { inviteCatalog, rsvpCatalog, paypalCatalog, fundingCatalog };

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

/** Catálogo suelto de la avatar Napster (NAP-F3); fuera de los mapas con claves fijas. */
export { avatarCatalog };
/** Catálogos sueltos de la entrevista y de compartir (NAP-U3). */
export { interviewCatalog } from './interview';
export { shareCatalog } from './share';
