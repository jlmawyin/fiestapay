/**
 * Avatar Napster con la foto del organizador (NAP-F6s).
 * Depende de `event_avatars` (0016), del cliente Napster y de `events`. Guarda la foto solo hasta
 * que Napster termina el companion; la clave de organizador se valida en la ruta.
 */
import { randomBytes } from 'node:crypto';
import type { Pool } from '../db/pool.js';
import type { EventRow } from './read.js';
import { NapsterError, type NapsterClient } from '../napster/client.js';

// NAP-S3: límite de 15 fotos propias para respetar 100 agentes:
// 2 agentes base + 25 avatares no default × 2 = 50, + 15 fotos × 2 = 30; total 82 < 100.
export const MAX_EVENT_AVATARS = 15;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const POLL_MIN_MS = 10_000;

export type EventAvatarDbStatus = 'uploaded' | 'generating' | 'ready' | 'failed';

export interface EventAvatarRow {
  event_id: string;
  first_name: string;
  photo_mime: 'image/jpeg' | 'image/png';
  photo_token: string;
  companion_id: string | null;
  agent_id_es: string | null;
  agent_id_en: string | null;
  status: EventAvatarDbStatus;
  error: string | null;
}

export class EventAvatarLimitError extends Error {
  constructor() {
    super('avatar_limit');
    this.name = 'EventAvatarLimitError';
  }
}

export class EventAvatarPhotoError extends Error {
  constructor() {
    super('invalid_photo');
    this.name = 'EventAvatarPhotoError';
  }
}

const ultimoPoll = new Map<string, number>();

/**
 * Decodifica un data URL JPEG/PNG y comprueba mime, bytes mágicos y tamaño.
 * Entrada: cadena del cuerpo. Salida: mime y Buffer listos para `bytea`.
 */
export function decodeEventAvatarPhoto(photo: string): { mime: 'image/jpeg' | 'image/png'; bytes: Buffer } {
  const match = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=\s]+)$/.exec(photo.trim());
  if (!match) throw new EventAvatarPhotoError();
  const mime = match[1] as 'image/jpeg' | 'image/png';
  const bytes = Buffer.from(match[2]!, 'base64');
  if (bytes.length === 0 || bytes.length > MAX_PHOTO_BYTES) throw new EventAvatarPhotoError();
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png =
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if ((mime === 'image/jpeg' && !jpeg) || (mime === 'image/png' && !png)) throw new EventAvatarPhotoError();
  return { mime, bytes };
}

async function fila(pool: Pool, eventId: string): Promise<EventAvatarRow | null> {
  const { rows } = await pool.query<EventAvatarRow>(
    `SELECT event_id, first_name, photo_mime, photo_token, companion_id, agent_id_es, agent_id_en, status, error
       FROM event_avatars WHERE event_id = $1 LIMIT 1`,
    [eventId],
  );
  return rows[0] ?? null;
}

async function borrarAgentes(cliente: NapsterClient, row: EventAvatarRow | null): Promise<void> {
  if (!row) return;
  for (const id of [row.agent_id_es, row.agent_id_en]) {
    if (!id) continue;
    try {
      await cliente.deleteAgent(id);
    } catch {
      // NAP-F6s: el reemplazo no se bloquea si un agente viejo ya no existe.
    }
  }
}

/**
 * Guarda o reemplaza la foto y crea el companion v1. Deja `generating` si Napster acepta.
 * Entrada: evento ya autorizado, nombre, data URL y origen público del servidor.
 * Salida: fila resultante; lanza EventAvatarLimitError/PhotoError o NapsterError.
 */
export async function uploadEventAvatar(
  pool: Pool,
  cliente: NapsterClient,
  event: EventRow,
  firstName: string,
  photo: string,
  publicOrigin: string,
): Promise<EventAvatarRow> {
  const { mime, bytes } = decodeEventAvatarPhoto(photo);
  const { rows } = await pool.query<{ n: number }>(
    'SELECT COUNT(*)::int AS n FROM event_avatars WHERE event_id <> $1',
    [event.id],
  );
  if ((rows[0]?.n ?? 0) >= MAX_EVENT_AVATARS) throw new EventAvatarLimitError();

  const existente = await fila(pool, event.id);
  await borrarAgentes(cliente, existente);
  ultimoPoll.delete(event.id);

  const token = randomBytes(32).toString('base64url');
  await pool.query(
    `INSERT INTO event_avatars
       (event_id, consent_at, first_name, photo_mime, photo_bytes, photo_token, status, companion_id, agent_id_es, agent_id_en, error, updated_at)
     VALUES ($1, now(), $2, $3, $4, $5, 'uploaded', NULL, NULL, NULL, NULL, now())
     ON CONFLICT (event_id) DO UPDATE SET
       consent_at = now(), first_name = EXCLUDED.first_name, photo_mime = EXCLUDED.photo_mime,
       photo_bytes = EXCLUDED.photo_bytes, photo_token = EXCLUDED.photo_token,
       companion_id = NULL, agent_id_es = NULL, agent_id_en = NULL,
       status = 'uploaded', error = NULL, updated_at = now()`,
    [event.id, firstName, mime, bytes, token],
  );

  try {
    const companion = await cliente.createCompanion({
      description: `Organizador de la reunión ${event.title} en Somos Panas`,
      firstName,
      pictureUrl: `${publicOrigin.replace(/\/+$/, '')}/media/avatar/${token}`,
      version: 'v1',
    });
    await pool.query(
      `UPDATE event_avatars SET companion_id = $2, status = 'generating', error = NULL, updated_at = now()
        WHERE event_id = $1`,
      [event.id, companion.id],
    );
  } catch {
    const generico = 'No se pudo crear el avatar en Napster';
    await pool.query(
      `UPDATE event_avatars SET status = 'failed', error = $2, updated_at = now() WHERE event_id = $1`,
      [event.id, generico],
    );
    throw new NapsterError('upstream');
  }

  return (await fila(pool, event.id))!;
}

/** Copia la configuración editable del agente base y crea el agente del sitio. */
async function crearAgenteCopiado(
  cliente: NapsterClient,
  baseId: string,
  companionId: string,
  name: string,
  lang: 'es' | 'en',
): Promise<string> {
  const base = await cliente.getAgent(baseId);
  const body: Record<string, unknown> = {
    companionId,
    name,
    voiceId: base.voiceId,
    language: lang,
    providerSettings: base.providerSettings ?? {},
    functions: base.functions ?? [],
    faqCollections: base.faqCollections ?? [],
  };
  for (const key of ['knowledgeBaseId', 'disableIdleTimeout', 'useWebSearch', 'mode', 'tags']) {
    if (base[key] !== undefined && base[key] !== null) body[key] = base[key];
  }
  const creado = await cliente.createAgent(body);
  await cliente.putWebrtcChannel(creado.id, { videoPolicy: 'deferred' });
  return creado.id;
}

/**
 * Consulta Napster como máximo una vez cada 10 s. Si el companion está listo, crea los dos
 * agentes, guarda sus ids, borra la foto y deja `ready`.
 */
export async function refreshEventAvatar(
  pool: Pool,
  cliente: NapsterClient,
  event: EventRow,
  baseAgents: { es: string; en: string },
): Promise<EventAvatarRow | null> {
  let row = await fila(pool, event.id);
  if (!row || row.status !== 'generating' || !row.companion_id) return row;

  const ahora = Date.now();
  if (ahora - (ultimoPoll.get(event.id) ?? 0) < POLL_MIN_MS) return row;
  ultimoPoll.set(event.id, ahora);

  try {
    const companion = await cliente.getCompanion(row.companion_id);
    if (companion.status === 'failed' || companion.status === 'error') {
      await pool.query(
        `UPDATE event_avatars SET status = 'failed', error = $2, updated_at = now() WHERE event_id = $1`,
        [event.id, 'Napster no pudo generar el avatar'],
      );
      return fila(pool, event.id);
    }
    if (companion.status !== 'readyToUse' && companion.status !== 'completed') return row;

    const agentEs = await crearAgenteCopiado(
      cliente,
      baseAgents.es,
      row.companion_id,
      `somospanas-${event.slug}-es`,
      'es',
    );
    const agentEn = await crearAgenteCopiado(
      cliente,
      baseAgents.en,
      row.companion_id,
      `somospanas-${event.slug}-en`,
      'en',
    );
    await pool.query(
      `UPDATE event_avatars
          SET agent_id_es = $2, agent_id_en = $3, status = 'ready', error = NULL,
              photo_bytes = NULL, updated_at = now()
        WHERE event_id = $1`,
      [event.id, agentEs, agentEn],
    );
    row = await fila(pool, event.id);
    return row;
  } catch (error) {
    if (error instanceof NapsterError) throw error;
    throw new NapsterError('upstream');
  }
}

/**
 * Devuelve los agentes custom de un evento listo; null si no hay fila o no está listo.
 * Entrada: pool y slug del evento. Salida: ids por idioma o null.
 */
export async function readyEventAvatarAgents(
  pool: Pool,
  eventSlug: string,
): Promise<{ es: string; en: string } | null> {
  const { rows } = await pool.query<{ agent_id_es: string | null; agent_id_en: string | null }>(
    `SELECT a.agent_id_es, a.agent_id_en
       FROM event_avatars a
       JOIN events e ON e.id = a.event_id
      WHERE e.slug = $1 AND a.status = 'ready' LIMIT 1`,
    [eventSlug],
  );
  const row = rows[0];
  if (!row?.agent_id_es || !row.agent_id_en) return null;
  return { es: row.agent_id_es, en: row.agent_id_en };
}

/** GET público de la foto: bytes solo mientras existan; null si ya se borraron. */
export async function eventAvatarPhoto(
  pool: Pool,
  token: string,
): Promise<{ mime: string; bytes: Buffer } | null> {
  const { rows } = await pool.query<{ photo_mime: string; photo_bytes: Buffer | null }>(
    `SELECT photo_mime, photo_bytes FROM event_avatars
      WHERE photo_token = $1 AND photo_bytes IS NOT NULL LIMIT 1`,
    [token],
  );
  const row = rows[0];
  return row?.photo_bytes ? { mime: row.photo_mime, bytes: row.photo_bytes } : null;
}

/** Borra los agentes en Napster (mejor esfuerzo) y la fila; vuelve el avatar general. */
export async function deleteEventAvatar(
  pool: Pool,
  cliente: NapsterClient | null,
  eventId: string,
): Promise<void> {
  const row = await fila(pool, eventId);
  if (cliente) await borrarAgentes(cliente, row);
  await pool.query('DELETE FROM event_avatars WHERE event_id = $1', [eventId]);
  ultimoPoll.delete(eventId);
}

/** Agentes base configurados; el llamador comprueba que Napster esté habilitado. */
export function baseAgentIds(config: { agentIdEs: string; agentIdEn: string }): { es: string; en: string } {
  return { es: config.agentIdEs, en: config.agentIdEn };
}
