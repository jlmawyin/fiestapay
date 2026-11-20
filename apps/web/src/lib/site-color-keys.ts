/**
 * Claves de color del sitio según `esquemas/sitio.schema.json` (SP5-D-1).
 * Evita duplicar la paleta FiestaPay en la web.
 */
import sitioSchema from '../../../../esquemas/sitio.schema.json';
import type { TenantSiteSettings } from './site-types';

const required = sitioSchema.properties.colores.required as string[];

/** Lista ordenada de campos de paleta editables; coincide con el esquema de sitio. */
export const SITE_COLOR_KEYS = required as (keyof TenantSiteSettings['colores'])[];