/**
 * Perfil e instrucciones de la avatar desde `contenido/avatar.json` (NAP-F2).
 * Depende del JSON versionado; no incluye datos personales ni la clave. El idioma elige agente y voz.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AvatarLang, AvatarVisitor } from '@fiestapay/shared';

interface AvatarContent {
  es: AvatarLanguageContent;
  en: AvatarLanguageContent;
}

interface AvatarLanguageContent {
  initialSpeech: Record<AvatarVisitor, string>;
  instructions: string;
}

export interface AvatarProfileContext {
  visitor: AvatarVisitor;
  lang: AvatarLang;
  eventTitle?: string;
  siteName?: string;
}

export interface AvatarExternalClientProfile {
  visitorType: AvatarVisitor;
  lang: AvatarLang;
  eventTitle?: string;
  siteName?: string;
}

const RUTA_CONTENIDO = join(import.meta.dirname, '..', '..', '..', '..', 'contenido', 'avatar.json');
const CONTENIDO = JSON.parse(readFileSync(RUTA_CONTENIDO, 'utf8')) as AvatarContent;

function reemplazar(texto: string, contexto: AvatarProfileContext): string {
  return texto
    .replaceAll('{evento}', contexto.eventTitle ?? '')
    .replaceAll('{sitio}', contexto.siteName ?? 'Somos Panas')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Texto base del agente para el idioma pedido. */
export function avatarInstructions(lang: AvatarLang): string {
  return CONTENIDO[lang].instructions;
}

/** Perfil público sin PII: solo tipo de visitante, idioma, evento y sitio. */
export function buildExternalClientProfile(contexto: AvatarProfileContext): AvatarExternalClientProfile {
  const perfil: AvatarExternalClientProfile = { visitorType: contexto.visitor, lang: contexto.lang };
  if (contexto.eventTitle) perfil.eventTitle = contexto.eventTitle;
  if (contexto.siteName) perfil.siteName = contexto.siteName;
  return perfil;
}

/** Pauta de apertura por visitante e idioma, con los nombres de evento y sitio ya resueltos. */
export function buildInitialSpeech(contexto: AvatarProfileContext): string {
  return reemplazar(CONTENIDO[contexto.lang].initialSpeech[contexto.visitor], contexto);
}
