/** Voice lifecycle constants and Spanish-only error copy shared by the UI. */

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
 * Never renders provider or browser English. Unknown failures fall back to a friendly
 * Spanish sentence that offers the text path.
 */
export function friendlyVoiceError(error: unknown): string {
  const candidate = error as { status?: unknown; name?: unknown } | null | undefined;
  const status = typeof candidate?.status === 'number' ? candidate.status : 0;
  if (status === 429) {
    return 'La voz no está disponible por ahora. Espera unos segundos y vuelve a intentarlo, o continúa por texto.';
  }
  if (status === 503 || status === 502) {
    return 'El servicio de voz no está disponible en este momento. Puedes continuar por texto.';
  }
  if (status === 403) {
    return 'Esta sesión ya no puede usar la voz. Puedes continuar por texto o volver a la invitación.';
  }
  if (status === 404) {
    return 'La sesión de voz ya terminó. Puedes iniciar una nueva o continuar por texto.';
  }
  const name = typeof candidate?.name === 'string' ? candidate.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Permiso de micrófono denegado. Puedes usar el formulario o el chat escrito.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No se encontró un micrófono. Puedes continuar por texto.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'El micrófono está ocupado por otra aplicación. Puedes continuar por texto.';
  }
  return 'No se pudo iniciar o continuar la voz. Revisa el micrófono o continúa por texto.';
}
