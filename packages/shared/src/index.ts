export type TemplateKind = 'comida' | 'casa' | 'viaje' | 'evento';
export type RsvpStatus = 'yes' | 'no' | 'maybe';
export interface AgendaItem { time: string; title: string; speaker?: string }
export interface EventInput {
  title: string; template: TemplateKind; meal: 'desayuno' | 'almuerzo' | 'cena';
  description: string; startsAt: string; endsAt: string; location: string; includes: string[];
  priceCents: number; capacity: number; goalCents: number | null; minimumCents: number | null;
  agenda: AgendaItem[];
  /** Write-only. The server stores a hash and never returns the code. */
  accessCode?: string | null;
}
export interface FiestaEvent {
  id: string; slug: string; title: string; template: TemplateKind; meal: 'desayuno' | 'almuerzo' | 'cena';
  description: string; startsAt: string; endsAt?: string; location: string; includes: string[];
  agenda: AgendaItem[]; priceCents: number; capacity: number | null; goalCents: number | null;
  minimumCents: number | null; confirmed: boolean; collectedCents: number; confirmedPeople: number;
  minimumReached: boolean; createdAt: string; closed?: boolean; accessRestricted?: boolean;
}
export interface Guest { id: string; name: string; status: RsvpStatus; companions: number; paidCents: number; dueCents: number }
export interface Quote { id: string; guestId: string; people: number; unitCents: number; totalCents: number; paidCents: number; amountCents: number; summary: string; expiresAt: string }
export interface OrderResult { orderId: string; status: string; approveUrl?: string }
/** Gemini stays in the type until the deferred provider-removal package. Runtime still prefers OpenAI. */
export type LlmProvider = 'openai' | 'gemini';
export interface Capabilities {
  paypal: boolean; voice: boolean; paypalClientId: string | null; sandbox: true;
  chat?: boolean; gemini?: boolean; llmProvider?: LlmProvider;
  /** True only when the server has SMTP configured. Never implies a message was accepted or delivered. */
  email: boolean;
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
export interface ChatResult { text: string; quote?: Quote; guest?: Guest; actions?: string[] }
export interface PaymentListItem { orderId: string; guestName: string; amountCents: number; status: string; createdAt: string }
export interface Dashboard { event: FiestaEvent; guests: Guest[]; payments?: PaymentListItem[]; audit: { action: string; createdAt: string }[] }
export const TEMPLATE_LABELS: Record<TemplateKind,string> = {comida:'Comida',casa:'Fiesta en casa',viaje:'Viaje conjunto',evento:'Evento'};
export function usd(cents: number): string { return new Intl.NumberFormat('es-EC',{style:'currency',currency:'USD'}).format(cents/100); }
export function fixedQuote(priceCents: number, people: number, paidCents=0) {
  if(!Number.isSafeInteger(priceCents)||priceCents<1||!Number.isSafeInteger(people)||people<1||people>100||!Number.isSafeInteger(paidCents)||paidCents<0) throw new Error('Invalid quote');
  const totalCents=priceCents*people;
  if(!Number.isSafeInteger(totalCents)) throw new Error('Invalid total');
  return {totalCents,amountCents:Math.max(0,totalCents-paidCents)};
}
