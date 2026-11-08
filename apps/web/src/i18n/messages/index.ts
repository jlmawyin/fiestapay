import type { LocaleCatalog, Messages } from '../catalog';
import { inviteCatalog } from './invite';
import { rsvpCatalog } from './rsvp';
import { paypalCatalog } from './paypal';
import { fundingCatalog } from './funding';
import { guestChatCatalog } from './guestChat';
import { voiceCatalog } from './voice';

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
