/** Voice lifecycle constants and localized error copy shared by the UI. */

import type { Locale } from '@fiestapay/shared';

/** A real 60 seconds without interaction ends a voice session. */
export const VOICE_IDLE_MS = 60_000;
/** After any refusal the client waits before allowing another attempt. No auto-retry. */
export const VOICE_COOLDOWN_MS = 15_000;
/** At most one activity write per real interaction burst. Not a heartbeat. */
export const VOICE_ACTIVITY_THROTTLE_MS = 5_000;

/** True when the failure is a refusal that must start the client cooldown. */
export function isVoiceCooldownError(error: unknown): boolean {
  const status = (error as { status?: unknown } | null | undefined)?.status;
  return status === 429 || status === 503 || status === 502;
}

/**
 * Never renders provider or browser English in Spanish (and never Spanish in
 * English). Unknown failures fall back to a friendly sentence that offers the
 * text path. Spanish output is byte-identical to the historical copy.
 */
export function friendlyVoiceError(error: unknown, locale: Locale = 'es'): string {
  const en = locale === 'en';
  const candidate = error as { status?: unknown; name?: unknown } | null | undefined;
  const status = typeof candidate?.status === 'number' ? candidate.status : 0;
  if (status === 429) {
    return en
      ? 'Voice is not available right now. Wait a few seconds and try again, or continue by text.'
      : 'La voz no está disponible por ahora. Espera unos segundos y vuelve a intentarlo, o continúa por texto.';
  }
  if (status === 503 || status === 502) {
    return en
      ? 'The voice service is not available right now. You can continue by text.'
      : 'El servicio de voz no está disponible en este momento. Puedes continuar por texto.';
  }
  if (status === 403) {
    return en
      ? 'This session can no longer use voice. You can continue by text or go back to the invitation.'
      : 'Esta sesión ya no puede usar la voz. Puedes continuar por texto o volver a la invitación.';
  }
  if (status === 404) {
    return en
      ? 'The voice session already ended. You can start a new one or continue by text.'
      : 'La sesión de voz ya terminó. Puedes iniciar una nueva o continuar por texto.';
  }
  const name = typeof candidate?.name === 'string' ? candidate.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return en
      ? 'Microphone permission denied. You can use the form or the written chat.'
      : 'Permiso de micrófono denegado. Puedes usar el formulario o el chat escrito.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return en
      ? 'No microphone was found. You can continue by text.'
      : 'No se encontró un micrófono. Puedes continuar por texto.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return en
      ? 'The microphone is busy in another application. You can continue by text.'
      : 'El micrófono está ocupado por otra aplicación. Puedes continuar por texto.';
  }
  return en
    ? 'Voice could not start or continue. Check the microphone or continue by text.'
    : 'No se pudo iniciar o continuar la voz. Revisa el micrófono o continúa por texto.';
}
