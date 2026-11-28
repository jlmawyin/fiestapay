/**
 * Catálogo cerrado de avatares Napster (NAP-S1).
 * Depende de `contenido/avatares.json`, validado por `esquemas/avatares.schema.json`.
 * La entrada default toma sus agentes de NAPSTER_AGENT_ID_ES/EN; nunca de este JSON.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AvatarLang } from '@fiestapay/shared';

export interface AvatarCatalogEntry {
  id: string;
  firstName: string;
  gender: 'female' | 'male';
  companionId: string;
  previewUrl: string;
  /** NAP-S2: videoLoopUrl del catálogo napster-stock; null si no se conoce. */
  loopUrl: string | null;
  voice: string;
  agentIdEs: string | null;
  agentIdEn: string | null;
  default: boolean;
}

export interface PublicAvatar {
  id: string;
  firstName: string;
  gender: 'female' | 'male';
  previewUrl: string;
  loopUrl: string | null;
  default: boolean;
}

interface AvatarCatalogFile {
  avatars: AvatarCatalogEntry[];
}

const RUTA_CATALOGO = join(import.meta.dirname, '..', '..', '..', '..', 'contenido', 'avatares.json');
const CATALOGO = JSON.parse(readFileSync(RUTA_CATALOGO, 'utf8')) as AvatarCatalogFile;

/** Catálogo en el orden del JSON, para que la web pueda mostrar un orden estable. */
export const AVATAR_CATALOG: readonly AvatarCatalogEntry[] = Object.freeze(
  CATALOGO.avatars.map((entrada) => Object.freeze({ ...entrada })),
);

/** Entrada marcada como default; el esquema garantiza que exista exactamente una. */
export function defaultAvatarEntry(): AvatarCatalogEntry {
  const entrada = AVATAR_CATALOG.find((item) => item.default);
  if (!entrada) throw new Error('contenido/avatares.json no tiene avatar default');
  return entrada;
}

/** Busca por id exacto; null si no está en el catálogo cerrado. */
export function findAvatarById(id: string): AvatarCatalogEntry | null {
  return AVATAR_CATALOG.find((entrada) => entrada.id === id) ?? null;
}

/** NAP-S1: la default siempre está lista; las demás necesitan sus dos agentes del setup. */
export function avatarIsReady(entrada: AvatarCatalogEntry): boolean {
  return entrada.default || Boolean(entrada.agentIdEs && entrada.agentIdEn);
}

/** Proyección pública: sin agentIds, sin companionId y sin voz. */
export function publicAvatar(entrada: AvatarCatalogEntry): PublicAvatar {
  return {
    id: entrada.id,
    firstName: entrada.firstName,
    gender: entrada.gender,
    previewUrl: entrada.previewUrl,
    loopUrl: entrada.loopUrl ?? null,
    default: entrada.default,
  };
}

/** GET /api/avatars: solo entradas listas; la default siempre entra. */
export function readyPublicAvatars(): PublicAvatar[] {
  return AVATAR_CATALOG.filter(avatarIsReady).map(publicAvatar);
}

/** Agente del idioma para una entrada; la default usa los ids del entorno/config. */
export function avatarAgentId(
  entrada: AvatarCatalogEntry,
  lang: AvatarLang,
  baseAgents: { es: string; en: string },
): string | null {
  if (entrada.default) return lang === 'es' ? baseAgents.es || null : baseAgents.en || null;
  return lang === 'es' ? entrada.agentIdEs : entrada.agentIdEn;
}

/** Presentación mínima que viaja al navegador dentro de la sesión. */
export function avatarPresentation(entrada: AvatarCatalogEntry): {
  id: string;
  firstName: string;
  previewUrl: string;
} {
  return { id: entrada.id, firstName: entrada.firstName, previewUrl: entrada.previewUrl };
}
