/**
 * Sugerencia de avatares (NAP-U5): la tool `suggest_avatars` la entrega y la
 * entrevista la muestra. Mismo patrón que el borrador de guía (evento más
 * pendiente de un solo uso), en rutas propias de avatar.
 */
import type { AvatarTag } from '@fiestapay/shared';

/** La entrevista escucha este evento para resaltar las sugeridas. */
export const AVATAR_SUGGEST_EVENT = 'napster:avatar-suggest' as const;

export interface AvatarSuggestDetail {
  tag: AvatarTag;
}

let pendingTag: AvatarTag | null = null;

/** Publica la sugerencia: pendiente para quien monte y evento para quien escucha. */
export function setAvatarSuggestion(tag: AvatarTag): void {
  pendingTag = tag;
  try {
    document.dispatchEvent(new CustomEvent<AvatarSuggestDetail>(AVATAR_SUGGEST_EVENT, { detail: { tag } }));
  } catch {
    // Sin entrevista montada el pendiente espera; nada se rompe.
  }
}

/** Consume la sugerencia pendiente de un solo uso, si la hay. */
export function consumeAvatarSuggestion(): AvatarTag | null {
  const tag = pendingTag;
  pendingTag = null;
  return tag;
}
