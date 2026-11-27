import {
  TemplateKind,
  RsvpStatus,
  AgendaItem,
  EventInput,
  FiestaEvent,
  Guest,
  Quote,
  OrderResult,
  Capabilities as SharedCapabilities,
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

/**
 * NAP-F5b: capabilities del servidor más el aviso local de la avatar.
 * F5b prohíbe tocar packages/shared (DSH la suma en F5a); la web extiende
 * aquí: ausente (servidor anterior) = ofrecida, `false` = recorrido fijo.
 */
export type Capabilities = SharedCapabilities & { avatar?: boolean };

export type {
  TemplateKind,
  RsvpStatus,
  AgendaItem,
  EventInput,
  FiestaEvent,
  Guest,
  Quote,
  OrderResult,
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
