/**
 * Aplica colores del sitio sobre tokens CSS (`estilos/tokens.css`) sin inyectar HTML ni CSS libre.
 * Solo acepta hex estricto #RRGGBB ya validado en el servidor.
 */
import type { CSSProperties } from 'react';
import type { TenantSiteSettings } from './site-types';

const HEX_STRICT = /^#[0-9A-Fa-f]{6}$/;

function safeHex(value: string): string | null {
  return HEX_STRICT.test(value) ? value : null;
}

/**
 * Devuelve propiedades React `style` para el contenedor raíz del sitio.
 * Entrada: paleta del API; salida: objeto con variables `--sp-color-*`.
 */
export function siteThemeStyle(settings: TenantSiteSettings): CSSProperties {
  const { colores } = settings;
  const style: Record<string, string> = {};
  const map: Record<keyof TenantSiteSettings['colores'], string> = {
    cloudwhite: '--sp-color-cloudwhite',
    ink: '--sp-color-ink',
    inkMuted: '--sp-color-ink-muted',
    blue: '--sp-color-blue',
    teal: '--sp-color-teal',
    yellow: '--sp-color-yellow',
    coral: '--sp-color-coral',
  };
  for (const key of Object.keys(map) as (keyof typeof map)[]) {
    const hex = safeHex(colores[key]);
    if (hex) style[map[key]] = hex;
  }
  return style;
}