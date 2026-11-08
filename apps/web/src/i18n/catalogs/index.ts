import type { LocaleCatalog, Messages } from '../catalog';
import { appCatalog } from './app';
import { buyerCatalog } from './buyer';
import { cardsCatalog } from './cards';
import { chatCatalog } from './chat';
import { demoCatalog } from './demo';
import { headerCatalog } from './header';
import { landingCatalog } from './landing';
import { modalCatalog } from './modal';
import { orbCatalog } from './orb';
import { ribbonCatalog } from './ribbon';
import { toastCatalog } from './toast';

/** Every catalog this package renders. The parity test iterates this map. */
export const ALL_CATALOGS: Record<string, LocaleCatalog<Messages>> = {
  app: appCatalog,
  buyer: buyerCatalog,
  cards: cardsCatalog,
  chat: chatCatalog,
  demo: demoCatalog,
  header: headerCatalog,
  landing: landingCatalog,
  modal: modalCatalog,
  orb: orbCatalog,
  ribbon: ribbonCatalog,
  toast: toastCatalog,
};

export {
  appCatalog,
  buyerCatalog,
  cardsCatalog,
  chatCatalog,
  demoCatalog,
  headerCatalog,
  landingCatalog,
  modalCatalog,
  orbCatalog,
  ribbonCatalog,
  toastCatalog,
};
