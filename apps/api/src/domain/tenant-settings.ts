/**
 * Configuración editable por sitio (SP-5): lectura pública, actualización por admin y validación.
 * Depende de `tenant_settings`, `tenants`, Ajv con `esquemas/sitio.schema.json` y contraste en `@fiestapay/shared`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import type { ErrorObject, ValidateFunction } from 'ajv';
import { contrastRatio } from '@fiestapay/shared';
import { assertTenantAdmin, tenantIdForSlug } from './access.js';
import type { Queryable } from './read.js';
import { badRequest, notFound } from '../errors.js';

const SCHEMA_FILE = 'esquemas/sitio.schema.json';
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const require = createRequire(import.meta.url);
const AjvConstructor = require('ajv') as new (opts?: object) => {
  compile: (schema: object) => ValidateFunction;
};

/** Paleta por defecto FiestaPay; coincide con `0013_tenants.sql` y `estilos/tokens.css`. */
export const DEFAULT_SITE_COLORS = {
  cloudwhite: '#F7FAFC',
  ink: '#12263A',
  inkMuted: '#4A5D73',
  blue: '#125FE6',
  teal: '#0B8075',
  yellow: '#FFC85A',
  coral: '#E85D4A',
} as const;

export interface SiteColorPalette {
  cloudwhite: string;
  ink: string;
  inkMuted: string;
  blue: string;
  teal: string;
  yellow: string;
  coral: string;
}

export interface SiteModuleFlags {
  reuniones: boolean;
  eventos: boolean;
  recaudacion: boolean;
  asistente: boolean;
}

/** Forma expuesta al cliente y validada con Ajv (camelCase). */
export interface TenantSiteSettings {
  displayName: string;
  tagline: string;
  about: string;
  colores: SiteColorPalette;
  modulos: SiteModuleFlags;
}

interface TenantSettingsDbRow {
  display_name: string;
  tagline: string;
  about: string;
  color_cloudwhite: string;
  color_ink: string;
  color_ink_muted: string;
  color_blue: string;
  color_teal: string;
  color_yellow: string;
  color_coral: string;
  modulo_reuniones: boolean;
  modulo_eventos: boolean;
  modulo_recaudacion: boolean;
  modulo_asistente: boolean;
}

let validateSiteSettings: ValidateFunction | null = null;

/**
 * Compila el validador Ajv contra sitio.schema.json (una sola vez por proceso).
 * Salida: función de validación reutilizable.
 */
function siteSettingsValidator(): ValidateFunction {
  if (validateSiteSettings) return validateSiteSettings;
  const ajv = new AjvConstructor({ allErrors: true, strict: false, validateSchema: false });
  const raw = readFileSync(join(REPO_ROOT, SCHEMA_FILE), 'utf8');
  const schema = JSON.parse(raw) as { $id?: string };
  validateSiteSettings = ajv.compile(schema);
  return validateSiteSettings;
}

/**
 * Formatea el primer error Ajv con campo, expectativa y archivo de esquema (criterio SP-5).
 */
function formatSchemaError(error: ErrorObject): string {
  const campo = error.instancePath?.replace(/^\//, '').replace(/\//g, '.') || '(raíz)';
  const esperado = error.message ?? 'valor inválido';
  return `Campo "${campo}": se esperaba ${esperado} (esquema ${SCHEMA_FILE})`;
}

const CONTRAST_PAIRS: { name: string; foreground: keyof SiteColorPalette; background: keyof SiteColorPalette; minimum: number }[] = [
  { name: 'ink-on-cloudwhite', foreground: 'ink', background: 'cloudwhite', minimum: 4.5 },
  { name: 'inkMuted-on-cloudwhite', foreground: 'inkMuted', background: 'cloudwhite', minimum: 4.5 },
  { name: 'blue-on-cloudwhite', foreground: 'blue', background: 'cloudwhite', minimum: 3 },
  { name: 'teal-on-cloudwhite', foreground: 'teal', background: 'cloudwhite', minimum: 3 },
  { name: 'coral-on-cloudwhite', foreground: 'coral', background: 'cloudwhite', minimum: 3 },
];

/**
 * Rechaza paletas con contraste insuficiente antes de persistir (servidor, no solo UI).
 * Entrada: objeto `colores` ya con hex válido.
 */
export function assertSiteColorContrast(colores: SiteColorPalette): void {
  for (const pair of CONTRAST_PAIRS) {
    const ratio = contrastRatio(colores[pair.foreground], colores[pair.background]);
    if (ratio < pair.minimum) {
      throw badRequest(
        `Color "${pair.foreground}" sobre "${pair.background}" no alcanza contraste ${pair.minimum}:1 (tiene ${ratio.toFixed(2)}:1; esquema ${SCHEMA_FILE})`,
      );
    }
  }
}

/**
 * Valida cuerpo de guardado con Ajv y contraste WCAG.
 * Entrada: cuerpo parseado del PUT.
 * Salida: objeto tipado listo para persistir.
 */
export function parseAndValidateSiteSettings(body: unknown): TenantSiteSettings {
  const validate = siteSettingsValidator();
  if (!validate(body)) {
    const first = validate.errors?.[0];
    throw badRequest(first ? formatSchemaError(first) : `Datos inválidos (esquema ${SCHEMA_FILE})`);
  }
  const settings = body as TenantSiteSettings;
  assertSiteColorContrast(settings.colores);
  return {
    displayName: settings.displayName.trim(),
    tagline: settings.tagline.trim(),
    about: settings.about.trim(),
    colores: settings.colores,
    modulos: settings.modulos,
  };
}

/** Convierte fila SQL a DTO del API. */
export function rowToSiteSettings(row: TenantSettingsDbRow): TenantSiteSettings {
  return {
    displayName: row.display_name,
    tagline: row.tagline,
    about: row.about,
    colores: {
      cloudwhite: row.color_cloudwhite,
      ink: row.color_ink,
      inkMuted: row.color_ink_muted,
      blue: row.color_blue,
      teal: row.color_teal,
      yellow: row.color_yellow,
      coral: row.color_coral,
    },
    modulos: {
      reuniones: row.modulo_reuniones,
      eventos: row.modulo_eventos,
      recaudacion: row.modulo_recaudacion,
      asistente: row.modulo_asistente,
    },
  };
}

const SETTINGS_SELECT = `SELECT display_name, tagline, about,
       color_cloudwhite, color_ink, color_ink_muted, color_blue, color_teal, color_yellow, color_coral,
       modulo_reuniones, modulo_eventos, modulo_recaudacion, modulo_asistente
  FROM tenant_settings WHERE tenant_id = $1`;

/**
 * Lectura pública de la configuración visible en el subdominio (sin auth).
 * Entrada: slug del host `site`.
 */
export async function readPublicSiteSettings(db: Queryable, hostSlug: string): Promise<TenantSiteSettings> {
  const tenantId = await tenantIdForSlug(db, hostSlug);
  if (!tenantId) throw notFound('Ruta no encontrada');
  const { rows } = await db.query<TenantSettingsDbRow>(SETTINGS_SELECT, [tenantId]);
  const row = rows[0];
  if (!row) throw notFound('Ruta no encontrada');
  return rowToSiteSettings(row);
}

/**
 * Lectura para pantalla de admin (exige admin del mismo tenant).
 */
export async function readTenantSettingsForAdmin(
  db: Queryable,
  hostSlug: string,
  userId: string,
): Promise<TenantSiteSettings> {
  const tenantId = await tenantIdForSlug(db, hostSlug);
  if (!tenantId) throw notFound('Ruta no encontrada');
  await assertTenantAdmin(db, tenantId, userId);
  return readPublicSiteSettings(db, hostSlug);
}

/**
 * Persiste configuración validada; solo admin del sitio.
 */
export async function updateTenantSiteSettings(
  db: Queryable,
  hostSlug: string,
  userId: string,
  settings: TenantSiteSettings,
): Promise<TenantSiteSettings> {
  const tenantId = await tenantIdForSlug(db, hostSlug);
  if (!tenantId) throw notFound('Ruta no encontrada');
  await assertTenantAdmin(db, tenantId, userId);
  const { rows } = await db.query<TenantSettingsDbRow>(
    `UPDATE tenant_settings SET
       display_name = $2, tagline = $3, about = $4,
       color_cloudwhite = $5, color_ink = $6, color_ink_muted = $7,
       color_blue = $8, color_teal = $9, color_yellow = $10, color_coral = $11,
       modulo_reuniones = $12, modulo_eventos = $13, modulo_recaudacion = $14, modulo_asistente = $15,
       updated_at = now()
     WHERE tenant_id = $1
     RETURNING display_name, tagline, about,
       color_cloudwhite, color_ink, color_ink_muted, color_blue, color_teal, color_yellow, color_coral,
       modulo_reuniones, modulo_eventos, modulo_recaudacion, modulo_asistente`,
  [
    tenantId,
    settings.displayName,
    settings.tagline,
    settings.about,
    settings.colores.cloudwhite,
    settings.colores.ink,
    settings.colores.inkMuted,
    settings.colores.blue,
    settings.colores.teal,
    settings.colores.yellow,
    settings.colores.coral,
    settings.modulos.reuniones,
    settings.modulos.eventos,
    settings.modulos.recaudacion,
    settings.modulos.asistente,
  ]);
  const row = rows[0];
  if (!row) throw notFound('Ruta no encontrada');
  return rowToSiteSettings(row);
}

/**
 * Indica si el módulo asistente está activo en el sitio (solo hosts `site`; el legado no consulta esto).
 */
export async function siteAssistantModuleEnabled(db: Queryable, hostSlug: string): Promise<boolean> {
  const tenantId = await tenantIdForSlug(db, hostSlug);
  if (!tenantId) return false;
  const { rows } = await db.query<{ modulo_asistente: boolean }>(
    'SELECT modulo_asistente FROM tenant_settings WHERE tenant_id = $1',
    [tenantId],
  );
  return rows[0]?.modulo_asistente ?? false;
}