/**
 * Corte de la dirección vieja del legado (NAP-S2).
 * Depende de `events.subdomain`; el API, el webhook y /media/avatar nunca se redirigen.
 */
import type { Queryable } from '../domain/read.js';
import { eventPublicUrl } from '../domain/subdomains.js';

export const ROOT_ORIGIN = 'https://somospanas.com';

/**
 * Destino 301 para una página del host legado.
 * `/e/<slug>` con subdomain salta a la dirección propia; el resto conserva path y query en la raíz.
 */
export async function legacyRedirectTarget(db: Queryable, url: string): Promise<string> {
  const [pathOnly = '/', query = ''] = url.split('?', 2);
  const match = /^\/e\/([a-z0-9-]+)\/?$/.exec(pathOnly);
  if (match) {
    const { rows } = await db.query<{ subdomain: string | null }>(
      'SELECT subdomain FROM events WHERE slug = $1 LIMIT 1',
      [match[1]],
    );
    const publicUrl = eventPublicUrl(rows[0]?.subdomain ?? null);
    if (publicUrl) return `${publicUrl}/${query ? `?${query}` : ''}`;
  }
  return `${ROOT_ORIGIN}${url}`;
}
