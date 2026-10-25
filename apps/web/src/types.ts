import {
  TemplateKind,
  RsvpStatus,
  AgendaItem,
  EventInput,
  FiestaEvent,
  Guest,
  Quote,
  OrderResult,
  Capabilities,
  ChatResult,
  Dashboard,
  CreatedEvent,
  TEMPLATE_LABELS,
  usd,
  fixedQuote,
} from '@fiestapay/shared';

export type {
  TemplateKind,
  RsvpStatus,
  AgendaItem,
  EventInput,
  FiestaEvent,
  Guest,
  Quote,
  OrderResult,
  Capabilities,
  ChatResult,
  Dashboard,
  CreatedEvent,
};

export { TEMPLATE_LABELS, usd, fixedQuote };

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title?: string;
  message: string;
}

export interface ApiResponseError {
  error: string;
  status?: number;
}
