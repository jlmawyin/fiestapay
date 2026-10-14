export type TemplateKind = 'comida' | 'casa' | 'viaje' | 'evento';
export type RsvpStatus = 'yes' | 'no' | 'maybe';
export interface AgendaItem { time: string; title: string; speaker?: string }
export interface EventInput {
  title: string; template: TemplateKind; meal: 'desayuno' | 'almuerzo' | 'cena';
  description: string; startsAt: string; location: string; includes: string[];
  priceCents: number; capacity: number | null; goalCents: number | null; minimumCents: number | null;
  agenda: AgendaItem[];
}
export interface FiestaEvent extends EventInput {
  id: string; slug: string; confirmed: boolean; collectedCents: number; confirmedPeople: number;
  minimumReached: boolean; createdAt: string;
}
export interface Guest { id: string; name: string; status: RsvpStatus; companions: number; paidCents: number; dueCents: number }
export interface Quote { id: string; guestId: string; people: number; unitCents: number; totalCents: number; paidCents: number; amountCents: number; summary: string; expiresAt: string }
export interface OrderResult { orderId: string; status: string; approveUrl?: string }
export interface Capabilities { paypal: boolean; gemini: boolean; voice: boolean; paypalClientId: string | null; sandbox: true }
export interface ChatResult { text: string; quote?: Quote; guest?: Guest; actions?: string[] }
export interface Dashboard { event: FiestaEvent; guests: Guest[]; audit: { action: string; createdAt: string }[] }
export const TEMPLATE_LABELS: Record<TemplateKind,string> = {comida:'Comida',casa:'Fiesta en casa',viaje:'Viaje conjunto',evento:'Evento'};
export function usd(cents: number): string { return new Intl.NumberFormat('es-EC',{style:'currency',currency:'USD'}).format(cents/100); }
export function fixedQuote(priceCents: number, people: number, paidCents=0) {
  if(!Number.isSafeInteger(priceCents)||priceCents<1||!Number.isSafeInteger(people)||people<1||people>100||!Number.isSafeInteger(paidCents)||paidCents<0) throw new Error('Invalid quote');
  const totalCents=priceCents*people;
  if(!Number.isSafeInteger(totalCents)) throw new Error('Invalid total');
  return {totalCents,amountCents:Math.max(0,totalCents-paidCents)};
}
