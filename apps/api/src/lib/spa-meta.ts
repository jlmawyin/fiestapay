/**
 * Metadatos Open Graph de la SPA por host (NAP-S2).
 * Depende de `HostClassification` y de la fila pública del evento; escapa todo lo que inserta.
 */
import type { HostClassification } from './host.js';

export interface EventMeta {
  title: string;
  description: string;
  access_code_hash: Buffer | null;
}

const BASE_TITLE = 'Somos Panas';
const BASE_DESCRIPTION = 'Somos Panas (FiestaPay): un espacio para cada grupo de panas, con una dirección propia por reunión.';

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function originOf(host: HostClassification): string {
  if (host.kind === 'event' && host.subdomain) return `https://${host.subdomain}.somospanas.com`;
  if (host.kind === 'root') return 'https://somospanas.com';
  if (host.kind === 'legacy') return 'https://fiestapay.somospanas.com';
  return `https://${host.hostname}`;
}

/**
 * Inyecta title/description/OG en el index de la SPA.
 * Un evento con código de acceso no aporta datos: se publica el texto general.
 */
export function renderIndexWithMeta(html: string, host: HostClassification, event: EventMeta | null): string {
  const visible = host.kind === 'event' && event && !event.access_code_hash ? event : null;
  const title = visible ? `${visible.title} · ${BASE_TITLE}` : BASE_TITLE;
  const description = visible ? visible.description.slice(0, 300) : BASE_DESCRIPTION;
  const origin = originOf(host);
  const url = `${origin}/`;
  const meta = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(url)}">`,
    `<meta property="og:image" content="${escapeHtml(`${origin}/og-image.png`)}">`,
    '<meta property="og:type" content="website">',
  ].join('');
  const sinTitulo = html.replace(/<title[^>]*>[\s\S]*?<\/title>/i, '');
  if (/<\/head>/i.test(sinTitulo)) return sinTitulo.replace(/<\/head>/i, `${meta}</head>`);
  return `${meta}${sinTitulo}`;
}
