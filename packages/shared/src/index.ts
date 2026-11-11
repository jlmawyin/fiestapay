import type { ThemeKey } from './presentation.js';

export type { ThemeKey, ThemeDefinition, TemplateInviteCopy, ContrastPair, MealKind } from './presentation.js';
export {
  TEMPLATE_THEMES,
  TEMPLATE_INVITE_COPY,
  TEMPLATE_INVITE_COPY_EN,
  templateInviteCopy,
  TEMPLATE_LABELS_EN,
  templateLabel,
  MEAL_LABELS,
  mealLabel,
  THEMES,
  THEME_LABELS_EN,
  THEME_PHRASES_EN,
  themeLabel,
  themePhrase,
  ORGANIZER_NAME_MAX,
  themesForTemplate,
  defaultThemeFor,
  themeBelongs,
  resolveTheme,
  normalizeOrganizerName,
  suggestTheme,
  relativeLuminance,
  contrastRatio,
  themeContrastPairs,
} from './presentation.js';
export * from './i18n.js';
export * from './server-errors.js';

export type TemplateKind = 'comida' | 'casa' | 'viaje' | 'evento';
export type RsvpStatus = 'yes' | 'no' | 'maybe';
export interface AgendaItem { time: string; title: string; speaker?: string }
export interface EventInput {
  title: string; template: TemplateKind; meal: 'desayuno' | 'almuerzo' | 'cena';
  description: string; startsAt: string; endsAt: string; location: string; includes: string[];
  priceCents: number; capacity: number; goalCents: number | null; minimumCents: number | null;
  agenda: AgendaItem[];
  /** Public display name. Optional. Omitted on update keeps the stored name. */
  organizerName?: string | null;
  /** Palette key for this template. Omitted uses the template default. */
  theme?: ThemeKey;
  /** Write-only. The server stores a hash and never returns the code. */
  accessCode?: string | null;
  /**
   * Omitted on update keeps the stored deadline, including a legacy NULL.
   * Omitted on create with a minimum defaults to startsAt. Explicit null on
   * create with a minimum also defaults to startsAt. No minimum means no deadline.
   */
  fundingDeadlineAt?: string | null;
}
/** legacy: pre-funding row, exempt from automatic refunds. inactive: no automatic funding. */
export type FundingStatus = 'legacy' | 'inactive' | 'open' | 'funded' | 'failed';
/**
 * Refund progress for one event. pending and needsReview are not money returned.
 * outstanding is captured minus verified refunds, gross, before processor fees.
 */
export interface RefundSummary {
  refundedCents: number;
  pendingCents: number;
  needsReviewCents: number;
  outstandingCents: number;
}
export interface FiestaEvent {
  id: string; slug: string; title: string; template: TemplateKind; meal: 'desayuno' | 'almuerzo' | 'cena';
  description: string; startsAt: string; endsAt?: string; location: string; includes: string[];
  agenda: AgendaItem[]; priceCents: number; capacity: number | null; goalCents: number | null;
  minimumCents: number | null; confirmed: boolean; collectedCents: number; confirmedPeople: number;
  minimumReached: boolean; createdAt: string; closed?: boolean; accessRestricted?: boolean;
  /** ISO-8601, or null when automatic funding is not armed. */
  fundingDeadlineAt?: string | null;
  fundingStatus?: FundingStatus;
  /**
   * People in parties whose verified net covers the full current fixed quota
   * (current price times holder and companions). A positive remainder below that
   * quota counts as nobody in the party: seats are not guessed. Not RSVP.
   */
  paidPeople?: number;
  refundSummary?: RefundSummary;
  /** Net verified cents used at the irreversible decision. Null until then. */
  fundingBasisCents?: number | null;
  /** Public name of who organizes. Null on rows saved before this field existed. */
  organizerName?: string | null;
  /** Resolved theme key. Legacy rows are presented with the template default. */
  theme?: ThemeKey;
  /** True for judge-demo events (events.is_demo). Absent means false. */
  isDemo?: boolean;
}
export interface Guest {
  id: string;
  name: string;
  status: RsvpStatus;
  companions: number;
  paidCents: number;
  dueCents: number;
  /** Set only when this session is blocked. Omitted means the caller did not receive a moderation flag. */
  blockedAt?: string | null;
  /** Set only when the guest was logically removed. The row, orders and ledger stay. */
  removedAt?: string | null;
  /** True when a create, capture or refund lease is still unverified, so the seat was kept. */
  paymentPending?: boolean;
}
/** Ecuador domestic standard checkout estimate. Not a settled PayPal fee and not a guest surcharge. */
export const PAYPAL_EC_DOMESTIC_RATE_BPS = 540;
export const PAYPAL_EC_DOMESTIC_FIXED_CENTS = 30;
export const FEE_ESTIMATE_PROVENANCE = 'paypal-ec-business-fees-2026-09-28-domestic-standard';
export interface FeeEstimate {
  estimate: true;
  feeCents: number;
  netCents: number;
  rateBps: typeof PAYPAL_EC_DOMESTIC_RATE_BPS;
  fixedCents: typeof PAYPAL_EC_DOMESTIC_FIXED_CENTS;
  currency: 'USD';
  absorber: 'organizer';
  provenance: typeof FEE_ESTIMATE_PROVENANCE;
}
/**
 * Organizer-absorbed estimate for a guest amount that is already due.
 * Variable part rounds half up in integer cents. Zero due estimates zero.
 * The fixed component still applies to a positive amount, so a tiny charge
 * can estimate a negative net. Throws when the rate product plus the half-up
 * offset of 5000 would leave safe integers.
 */
export function estimateOrganizerFee(amountCents: number): FeeEstimate {
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) throw new Error('Centavos invalidos');
  const empty: FeeEstimate = {
    estimate: true,
    feeCents: 0,
    netCents: 0,
    rateBps: PAYPAL_EC_DOMESTIC_RATE_BPS,
    fixedCents: PAYPAL_EC_DOMESTIC_FIXED_CENTS,
    currency: 'USD',
    absorber: 'organizer',
    provenance: FEE_ESTIMATE_PROVENANCE,
  };
  if (amountCents === 0) return empty;
  const roundingOffset = 5_000;
  if (amountCents > Math.floor((Number.MAX_SAFE_INTEGER - roundingOffset) / PAYPAL_EC_DOMESTIC_RATE_BPS)) {
    throw new Error('Importe fuera de rango para estimar la comision');
  }
  const variable = Math.floor((amountCents * PAYPAL_EC_DOMESTIC_RATE_BPS + roundingOffset) / 10_000);
  const feeCents = variable + PAYPAL_EC_DOMESTIC_FIXED_CENTS;
  const netCents = amountCents - feeCents;
  if (!Number.isSafeInteger(feeCents) || !Number.isSafeInteger(netCents)) {
    throw new Error('Comision fuera de rango');
  }
  return { ...empty, feeCents, netCents };
}
export interface Quote { id: string; guestId: string; people: number; unitCents: number; totalCents: number; paidCents: number; amountCents: number; summary: string; expiresAt: string; feeEstimate?: FeeEstimate }
export interface OrderResult { orderId: string; status: string; approveUrl?: string }
/** The only runtime chat provider. */
export type LlmProvider = 'openai' | 'gemini';
export interface Capabilities {
  paypal: boolean; voice: boolean; paypalClientId: string | null; sandbox: true;
  chat?: boolean; llmProvider?: LlmProvider;
  /** Voice engine named in the consent notice before any token is requested. Absent = assemblyai. */
  voiceProvider?: VoiceProvider;
  /** True only when the server has SMTP configured. Never implies a message was accepted or delivered. */
  email: boolean;
}
/** Voice lease scope. Public is informational and has no event, guest or tools. */
export type VoiceAudience = 'guest' | 'organizer' | 'public';
import type { Locale } from './i18n.js';
/** Voice engine behind a lease. Gemini Live is the default; AssemblyAI is a config rollback only. */
export type VoiceProvider = 'gemini' | 'assemblyai';
/** Default Gemini models, validated in code (see docs/GEMINI.md). */
export const GEMINI_DEFAULT_LIVE_MODEL = 'gemini-3.8-live';
export const GEMINI_DEFAULT_TEXT_MODEL = 'gemini-3.5-flash';
/** The only API version that accepts ephemeral tokens (probed 9 Nov 2026). */
export const GEMINI_LIVE_API_VERSION = 'v1beta';
/** Prebuilt voice per locale. Native-audio models infer the language; there is no languageCode. */
export const GEMINI_VOICE_BY_LOCALE: Record<Locale, string> = { es: 'Kore', en: 'Puck' };

/** One function the browser may relay to the server tool route. Same names as the server tools. */
export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters?: { type: 'OBJECT'; properties: Record<string, unknown>; required?: string[] };
}

/**
 * Exactly the LiveConnectConfig the ephemeral token was locked to. The browser passes it verbatim to
 * `ai.live.connect({ model, config: liveConfig })`; a modified copy is ignored by the API because the
 * token locks every field. The key never leaves the server.
 */
export interface GeminiLiveConfig {
  responseModalities: ['AUDIO'];
  systemInstruction: string;
  speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: string } } };
  inputAudioTranscription: Record<string, never>;
  outputAudioTranscription: Record<string, never>;
  /** Empty for the public audience (no tools). */
  tools: Array<{ functionDeclarations: GeminiFunctionDeclaration[] }>;
}

export interface GeminiVoiceSessionConfig {
  provider: 'gemini';
  model: string;
  apiVersion: typeof GEMINI_LIVE_API_VERSION;
  liveConfig: GeminiLiveConfig;
  /** First user text the client sends with sendClientContent so the model greets in the locale. */
  kickoff: string;
  locale: Locale;
}

/**
 * Status a voice tool answers when it only prepared a payment: the person must approve in PayPal
 * and the server must verify the capture. The assistant never says "paid" from this.
 */
export const VOICE_PAYMENT_PENDING = 'PENDIENTE_DE_APROBACION';

/** One reservation. maxSeconds is the timebox; a released or idle lease is not reusable. */
export interface VoiceSessionToken {
  /** Gemini: ephemeral token name (auth_tokens/...), single use, new session within 60 s. */
  token: string;
  /** Gemini: GeminiVoiceSessionConfig. AssemblyAI rollback: its legacy session object. */
  sessionConfig: Record<string, unknown>;
  maxSeconds: number;
  leaseId: string;
  audience: VoiceAudience;
  /** Absent means assemblyai (images before 9 Nov 2026). */
  provider?: VoiceProvider;
}
/** Idempotent release. Repeating it keeps the first timestamp and never restores budget. */
export interface VoiceLeaseReleaseResult {
  ok: true;
  released: boolean;
  alreadyReleased: boolean;
}
/** Real-interaction activity. active=false means mic, WS and playback must stop. */
export interface VoiceLeaseActivityResult {
  ok: true;
  active: boolean;
}
export type RecoveryContactState = 'none' | 'pending' | 'verified';
export interface RecoveryContactStatus { state: RecoveryContactState; masked: string | null }
export interface RecoveryStatus { email: boolean; contact: RecoveryContactStatus }
/** `accepted` means the outbound SMTP server accepted the message, not that it reached an inbox. `unchanged` means the verified mailbox was already this one. */
export interface RecoveryContactUpdate { contact: RecoveryContactStatus; delivery: 'accepted' | 'unchanged' }
/** Same body for every public request. This is not an SMTP acceptance and not inbox delivery. */
export interface RecoveryRequestResult { status: 'accepted' }
export interface RecoveryConsumeVerified { purpose: 'verify'; slug: string; verified: true }
export interface RecoveryConsumeRecovered { purpose: 'recover'; slug: string; adminKey: string }
export type RecoveryConsumeResult = RecoveryConsumeVerified | RecoveryConsumeRecovered;
/** adminKey is returned once, on create. Later reads omit it. */
export interface CreatedEvent { event: FiestaEvent; adminKey: string | null }
/**
 * Optional AI help at the end of the creation assistant (POST /api/ai/suggest-presentation).
 * Only describes the gathering; never money, dates or capacity. The server always answers with a
 * theme that belongs to the template; it falls back to deterministic rules when AI is unavailable.
 */
export interface PresentationSuggestionInput {
  template: TemplateKind;
  title: string;
  meal?: 'desayuno' | 'almuerzo' | 'cena';
  location?: string;
  /** Free hints such as a food style ("asado") or trip extras ("hotel"). Max 10 x 60 chars. */
  hints?: string[];
}
export interface PresentationSuggestion {
  theme: ThemeKey;
  /** Short invitation text in the request language, or null when only rules answered. */
  description: string | null;
  source: 'ai' | 'rules';
}
/**
 * "Describe your party in one sentence" (POST /api/ai/draft-event). The server never creates an
 * event from it: the proposal only pre-fills the creation assistant and the organizer confirms.
 */
export interface DraftEventInput {
  /** 3..400 chars, e.g. "asado para 10 el sábado con $150". */
  text: string;
}
export interface DraftEventProposal {
  template: TemplateKind;
  title: string;
  meal?: 'desayuno' | 'almuerzo' | 'cena';
  /** YYYY-MM-DD in America/Guayaquil, only when the sentence states or clearly implies it. */
  date?: string;
  /** HH:MM 24 h, America/Guayaquil. */
  startTime?: string;
  durationMinutes?: number;
  location?: string;
  /** What the share covers, max 8 x 60 chars. */
  includes: string[];
  /** People including the organizer when stated; 1..500. */
  headcount?: number;
  /** Total budget in integer USD cents when stated. */
  budgetCents?: number;
  /** Explicit share read from the request or computed from the group budget and headcount. */
  perPersonCents?: number;
  /** Fields the AI filled, so the UI can mark them as suggestions. */
  suggested: Array<'template' | 'title' | 'meal' | 'date' | 'startTime' | 'durationMinutes' | 'location' | 'includes' | 'headcount' | 'budgetCents'>;
  source: 'ai' | 'rules';
}
/** Organizer-only: drafted payment reminders (POST /api/events/:slug/reminders/draft). Never sent. */
export type ReminderTone = 'amable' | 'divertido' | 'formal';
export interface ReminderDraftRequest { tone: ReminderTone }
export interface ReminderDraft {
  guestId: string;
  alias: string;
  /** Server balance in integer cents (> 0). */
  dueCents: number;
  /** Full message: AI-written friendly text + amount and invitation link inserted by the server. */
  message: string;
}
export interface ReminderDraftResult {
  drafts: ReminderDraft[];
  source: 'ai' | 'rules';
  /** True when more guests owe money than the per-call cap returned. */
  truncated: boolean;
}
export interface PublicChatResult {
  text: string;
  draft?: DraftEventProposal;
}
export interface ChatResult {
  text: string;
  quote?: Quote;
  guest?: Guest;
  actions?: string[];
  /** Server id of the user turn just stored. Absent when the turn was refused. */
  userMessageId?: string;
  /** Server id of the assistant turn just stored. Absent when the reply was discarded. */
  assistantMessageId?: string;
}
/** Visible chat text. Ids are the server row ids, never a client clock. */
export interface ChatTranscriptMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
}
export interface ChatTranscript {
  messages: ChatTranscriptMessage[];
  /** Older page cursor. Absent when this page reaches the start of the transcript. */
  nextBefore?: string;
}
export interface ModerationGuest {
  id: string;
  name: string;
  status: RsvpStatus;
  companions: number;
  paidCents: number;
  dueCents: number;
  blockedAt: string | null;
  removedAt: string | null;
  paymentPending: boolean;
}
export interface ModerationActionResult {
  outcome: 'blocked' | 'unblocked' | 'removed';
  guest: ModerationGuest;
  message: string;
}
/** Opaque conversation id. Not a session cookie and not a browser id. */
export interface ModerationConversation {
  id: string;
  guestId: string | null;
  guestName: string | null;
}
export interface ModerationMessage extends ChatTranscriptMessage {
  conversationId: string;
}
export interface ModerationMessagePage {
  messages: ModerationMessage[];
  nextBefore?: string;
}
export interface PaymentActivityItem {
  id: string;
  kind: 'capture' | 'refund';
  guestName: string;
  amountCents: number;
  captureId: string;
  createdAt: string;
}
export interface PayPalNotificationItem {
  type: 'CHECKOUT.ORDER.COMPLETED' | 'PAYMENT.CAPTURE.COMPLETED' | 'PAYMENT.CAPTURE.REFUNDED';
  receivedAt: string;
}
export interface PaymentListItem { orderId: string; guestName: string; amountCents: number; status: string; createdAt: string }
/**
 * Organizer-only grid totals, summed on the server in integer cents from the same rows as `guests`.
 * `people` counts confirmed attendees (1 + companions per "yes" guest). The web never re-adds amounts.
 */
export interface GuestTotals { people: number; paidCents: number; dueCents: number }
export interface Dashboard { event: FiestaEvent; guests: Guest[]; guestTotals?: GuestTotals; payments?: PaymentListItem[]; paymentActivity?: PaymentActivityItem[]; paypalNotifications?: PayPalNotificationItem[]; audit: { action: string; createdAt: string }[] }
export const TEMPLATE_LABELS: Record<TemplateKind,string> = {comida:'Comida',casa:'Fiesta en casa',viaje:'Viaje conjunto',evento:'Evento'};
export function usd(cents: number): string { return new Intl.NumberFormat('es-EC',{style:'currency',currency:'USD'}).format(cents/100); }
export function fixedQuote(priceCents: number, people: number, paidCents=0) {
  if(!Number.isSafeInteger(priceCents)||priceCents<1||!Number.isSafeInteger(people)||people<1||people>100||!Number.isSafeInteger(paidCents)||paidCents<0) throw new Error('Invalid quote');
  const totalCents=priceCents*people;
  if(!Number.isSafeInteger(totalCents)) throw new Error('Invalid total');
  return {totalCents,amountCents:Math.max(0,totalCents-paidCents)};
}
export * from './ui-guide.js';
