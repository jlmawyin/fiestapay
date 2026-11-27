/**
 * Contrato de sesión de avatar Napster (NAP-F2).
 * Depende de zod. El navegador solo recibe el token efímero y un handle opaco; la clave vive en el servidor.
 */
import { z } from 'zod';

export const AVATAR_LANGS = ['es', 'en'] as const;
export type AvatarLang = (typeof AVATAR_LANGS)[number];

export const AVATAR_VISITORS = ['public', 'creator', 'guest'] as const;
export type AvatarVisitor = (typeof AVATAR_VISITORS)[number];

/** Petición de `POST /api/avatar-session`; el visitante nunca lo decide el navegador. */
export const avatarSessionRequestSchema = z
  .object({
    lang: z.enum(AVATAR_LANGS),
    intent: z.literal('create').optional(),
    eventSlug: z
      .string()
      .trim()
      .min(3)
      .max(80)
      .regex(/^[a-z0-9-]+$/, 'Slug invalido')
      .optional(),
    /** NAP-F4s: 'text' usa WebSocket + modality text; 'video' mantiene WebRTC (por defecto). */
    mode: z.enum(['video', 'text']).default('video'),
  })
  .strict();

export type AvatarSessionRequest = z.infer<typeof avatarSessionRequestSchema>;

/** Respuesta pública: ni connectionId, ni perfil, ni clave. */
export const avatarSessionResponseSchema = z
  .object({
    token: z.string().min(1),
    handle: z.string().uuid(),
    visitor: z.enum(AVATAR_VISITORS),
    lang: z.enum(AVATAR_LANGS),
    agent: z.enum(['default', 'custom']),
    /** Solo en modo texto: URL del socket ya resuelta por el servidor desde el token. */
    socketUrl: z.string().url().optional(),
  })
  .strict();

export type AvatarSessionResponse = z.infer<typeof avatarSessionResponseSchema>;

export const EVENT_AVATAR_STATUSES = ['none', 'uploaded', 'generating', 'ready', 'failed'] as const;
export type EventAvatarStatus = (typeof EVENT_AVATAR_STATUSES)[number];

export const eventAvatarUploadSchema = z
  .object({
    consent: z.literal(true),
    firstName: z.string().trim().min(1).max(60),
    /** Data URL base64 de JPEG o PNG; el servidor comprueba mime, magia y tamaño. */
    photo: z.string().min(1),
  })
  .strict();

export type EventAvatarUpload = z.infer<typeof eventAvatarUploadSchema>;

export const eventAvatarStatusSchema = z
  .object({
    status: z.enum(EVENT_AVATAR_STATUSES),
    firstName: z.string().nullable(),
    ready: z.boolean(),
  })
  .strict();

export type EventAvatarStatusResponse = z.infer<typeof eventAvatarStatusSchema>;

export const EVENT_AVATAR_ERRORS = ['avatar_upstream', 'avatar_limit', 'avatar_not_found'] as const;
export type EventAvatarErrorCode = (typeof EVENT_AVATAR_ERRORS)[number];

export const eventAvatarErrorSchema = z.object({ error: z.enum(EVENT_AVATAR_ERRORS) }).strict();

/** Cierre idempotente de una sesión por su handle opaco. */
export const avatarSessionEndSchema = z.object({ handle: z.string().uuid() }).strict();
export type AvatarSessionEnd = z.infer<typeof avatarSessionEndSchema>;

export const AVATAR_SESSION_ERRORS = [
  'avatar_disabled',
  'avatar_busy',
  'avatar_rate_limited',
  'avatar_no_credits',
  'avatar_upstream',
  'event_not_found',
] as const;

export type AvatarSessionErrorCode = (typeof AVATAR_SESSION_ERRORS)[number];

export const avatarSessionErrorSchema = z
  .object({
    error: z.enum(AVATAR_SESSION_ERRORS),
    retryAfterSec: z.number().int().positive().optional(),
  })
  .strict();

export type AvatarSessionError = z.infer<typeof avatarSessionErrorSchema>;
