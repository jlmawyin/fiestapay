/**
 * Intención de la siguiente sesión de avatar (NAP-F4w).
 * Cuando la persona pulsa «Crear un nuevo espacio» en la raíz o la avatar
 * ejecuta `start_new_space`, la siguiente sesión puede pedirse con
 * `intent:'create'` para que el servidor la trate como creador. Bandera de un
 * solo uso: el video la ojea y la texto la consume.
 */
let createIntent = false;

/** Marca que la siguiente sesión es de creación. */
export function markCreateIntent(): void {
  createIntent = true;
}

/** Lee la bandera sin consumirla (la sesión de video la usa y la conserva). */
export function peekCreateIntent(): boolean {
  return createIntent;
}

/** Lee y limpia la bandera (la sesión de texto cierra la cadena). */
export function consumeCreateIntent(): boolean {
  const pending = createIntent;
  createIntent = false;
  return pending;
}

/** Limpia la bandera cuando la sesión de video la usó con éxito. */
export function clearCreateIntent(): void {
  createIntent = false;
}
