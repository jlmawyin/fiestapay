/**
 * Tema día/noche de Somos Panas (NAP-U2). El atributo `data-tema` en <html>
 * manda sobre `estilos/tokens.css`; un script en <head> lo fija antes del
 * primer pintado para no parpadear. Sin elección guardada se sigue al sistema.
 */

/** Valores del atributo `data-tema` en <html>. */
export type Tema = 'dia' | 'noche';

/** Clave de la elección en localStorage (ausente = seguir al sistema). */
export const TEMA_STORAGE_KEY = 'fp_tema';

/** Lee lo guardado; null si no hay elección o el almacenamiento falla. */
export function readStoredTema(): Tema | null {
  try {
    const raw = window.localStorage.getItem(TEMA_STORAGE_KEY);
    return raw === 'dia' || raw === 'noche' ? raw : null;
  } catch {
    return null;
  }
}

/** Tema que pide el sistema ahora mismo (día si no se puede saber). */
export function systemTema(): Tema {
  try {
    if (typeof matchMedia !== 'function') return 'dia';
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'noche' : 'dia';
  } catch {
    return 'dia';
  }
}

/** Tema visible: lo guardado, o el sistema si no hay elección. */
export function resolveTema(): Tema {
  return readStoredTema() ?? systemTema();
}

/** Aplica el tema al atributo de <html> (el CSS hace el resto). */
export function applyTema(tema: Tema): void {
  try {
    document.documentElement.setAttribute('data-tema', tema);
  } catch {
    // Sin DOM no hay nada que pintar.
  }
}

/**
 * Calcula el cambio del interruptor de dos estados: el objetivo es lo
 * contrario de lo visible. Si coincide con el sistema se borra lo guardado
 * (volver a seguirlo); si no, se guarda literal. Nunca se borra por
 * coincidencia posterior: el sistema puede cambiar solo con la hora.
 */
export function nextStoredTema(visible: Tema, sistema: Tema): Tema | null {
  const objetivo: Tema = visible === 'noche' ? 'dia' : 'noche';
  return objetivo === sistema ? null : objetivo;
}

/** Guarda la elección (null = volver al sistema) y la aplica. */
export function storeTema(next: Tema | null): Tema {
  try {
    if (next === null) window.localStorage.removeItem(TEMA_STORAGE_KEY);
    else window.localStorage.setItem(TEMA_STORAGE_KEY, next);
  } catch {
    // Sin almacenamiento el tema igual se aplica a la vista actual.
  }
  const visible = next ?? systemTema();
  applyTema(visible);
  return visible;
}
