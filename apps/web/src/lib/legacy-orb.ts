/**
 * Política de montaje del orbe FiestaPay (SP5-D-7).
 * Depende de la clasificación de host; en subdominio nunca se muestra aunque `modulos.asistente` esté encendido.
 */

/** Vistas legado que pueden mostrar el orbe público unificado; `site-home` queda fuera a propósito. */
export const LEGACY_ORB_MODES = ['home', 'demo', 'create', 'recover', 'tutorial'] as const;

export type LegacyOrbMode = (typeof LEGACY_ORB_MODES)[number];

/**
 * Decide si el orbe FiestaPay debe montarse en la vista actual.
 * Entrada: clasificación de host y modo de vista. Salida: true solo en legado FiestaPay, no en la raíz Somos Panas.
 */
export function shouldRenderLegacyOrb(
  isSiteHost: boolean,
  viewMode: string,
  hostKind: 'somospanas-root' | 'legacy' | 'site' = isSiteHost ? 'site' : 'legacy',
): boolean {
  if (isSiteHost || hostKind === 'site' || hostKind === 'somospanas-root') return false;
  return (LEGACY_ORB_MODES as readonly string[]).includes(viewMode);
}