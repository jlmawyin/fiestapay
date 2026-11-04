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
  ChatTranscript,
  ChatTranscriptMessage,
  ModerationGuest,
  ModerationActionResult,
  ModerationConversation,
  ModerationMessage,
  ModerationMessagePage,
  Dashboard,
  CreatedEvent,
  RecoveryStatus,
  RecoveryContactStatus,
  RecoveryContactUpdate,
  RecoveryRequestResult,
  RecoveryConsumeResult,
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
  ChatTranscript,
  ChatTranscriptMessage,
  ModerationGuest,
  ModerationActionResult,
  ModerationConversation,
  ModerationMessage,
  ModerationMessagePage,
  Dashboard,
  CreatedEvent,
  RecoveryStatus,
  RecoveryContactStatus,
  RecoveryContactUpdate,
  RecoveryRequestResult,
  RecoveryConsumeResult,
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
