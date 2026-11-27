/**
 * Punto de relleno del recordatorio del organizador (NAP-F4w).
 * Replica el patrón `guide/showOnScreen.ts` (pending de un solo uso + evento):
 * la tool `draft_reminder` deja el texto y la vista de recordatorios lo
 * consume al montar o por evento si ya está montada. La lectura consume, así
 * un texto viejo nunca cae en una visita manual posterior.
 */

/** La vista de recordatorios escucha este evento con `{ text }` en el detalle. */
export const AVATAR_REMINDER_DRAFT_EVENT = 'napster:avatar-reminder-draft' as const;

let pendingReminderDraft: string | null = null;

/** Deja el texto pendiente y avisa a una vista ya montada. */
export function setAvatarReminderDraft(text: string): void {
  pendingReminderDraft = text;
  try {
    document.dispatchEvent(new CustomEvent(AVATAR_REMINDER_DRAFT_EVENT, { detail: { text } }));
  } catch {
    // El pending cubre la vista que monte después; el evento es oportunista.
  }
}

/** Lee y limpia el texto pendiente (o null si no hay). */
export function consumeAvatarReminderDraft(): string | null {
  const text = pendingReminderDraft;
  pendingReminderDraft = null;
  return text;
}
