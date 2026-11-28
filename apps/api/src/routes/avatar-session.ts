/**
 * Rutas de sesión de avatar Napster (NAP-F2).
 * Depende de `createNapsterClient`, `decideAvatarVisitor` y `profile.ts`. El navegador recibe solo
 * token y handle; el `connection.id` se guarda en memoria con TTL de 30 minutos.
 */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  avatarSessionEndSchema,
  avatarSessionRequestSchema,
  type AvatarSessionAvatar,
  type AvatarSessionResponse,
  type AvatarVisitor,
} from '@fiestapay/shared';
import { buildExternalClientProfile, buildInitialSpeech } from '../napster/profile.js';
import {
  avatarAgentId,
  avatarIsReady,
  avatarPresentation,
  defaultAvatarEntry,
  findAvatarById,
} from '../napster/catalog.js';
import { createNapsterClient, NapsterError } from '../napster/client.js';
import { readyEventAvatarAgents } from '../domain/event-avatars.js';
import { AvatarEventNotFoundError, decideAvatarVisitor, type VisitorDecision } from '../napster/visitor.js';
import type { RouteDeps } from './deps.js';

const VENTANA_MS = 10 * 60 * 1_000;
const MAX_SESIONES_POR_IP = 6;
const TTL_HANDLE_MS = 30 * 60 * 1_000;

/**
 * NAP-F4s: en modo texto el token de Napster es base64 con `{ url }`; el servidor lo decodifica
 * para devolver la URL del socket, sin aceptar URLs del modelo ni reconstruirla desde el navegador.
 */
function socketUrlDesdeToken(token: string): string {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8')) as { url?: unknown };
    if (typeof decoded.url === 'string' && /^(https|wss):\/\//.test(decoded.url)) return decoded.url;
  } catch {
    // Token ilegible: se trata como fallo del proveedor.
  }
  throw new NapsterError('upstream');
}

interface SesionGuardada {
  connectionId: string;
  expiresAt: number;
}

/** Envía el error de avatar con el status y, si aplica, Retry-After. */
function responderError(
  reply: FastifyReply,
  status: number,
  error: string,
  retryAfterSec?: number,
) {
  if (retryAfterSec !== undefined) reply.header('Retry-After', String(retryAfterSec));
  return reply.code(status).send(retryAfterSec === undefined ? { error } : { error, retryAfterSec });
}

/** NAP-S1: nombre del organizador del avatar custom listo, para presentarlo en la sesión. */
async function readyEventAvatarFirstName(pool: RouteDeps['pool'], eventSlug: string): Promise<string | null> {
  const { rows } = await pool.query<{ first_name: string }>(
    `SELECT a.first_name
       FROM event_avatars a
       JOIN events e ON e.id = a.event_id
      WHERE e.slug = $1 AND a.status = 'ready' LIMIT 1`,
    [eventSlug],
  );
  return rows[0]?.first_name ?? null;
}

export async function registerAvatarSessionRoutes(app: FastifyInstance, deps: RouteDeps): Promise<void> {
  const { config, pool } = deps;
  // NAP-F2-D1: un solo cliente por app conserva la serialización de 1 conexión/s entre peticiones.
  const napster = config.napster;
  const cliente = napster?.enabled && napster.apiKey
    ? createNapsterClient({ apiKey: napster.apiKey, baseUrl: napster.baseUrl })
    : null;
  const handles = new Map<string, SesionGuardada>();
  const intentosPorIp = new Map<string, number[]>();

  const limpiar = (ahora: number) => {
    for (const [handle, sesion] of handles) {
      if (sesion.expiresAt <= ahora) handles.delete(handle);
    }
    for (const [ip, marcas] of intentosPorIp) {
      const vigentes = marcas.filter((marca) => ahora - marca < VENTANA_MS);
      if (vigentes.length === 0) intentosPorIp.delete(ip);
      else intentosPorIp.set(ip, vigentes);
    }
  };

  const permitirIntento = (ip: string, ahora: number): boolean => {
    const vigentes = (intentosPorIp.get(ip) ?? []).filter((marca) => ahora - marca < VENTANA_MS);
    if (vigentes.length >= MAX_SESIONES_POR_IP) {
      intentosPorIp.set(ip, vigentes);
      return false;
    }
    vigentes.push(ahora);
    intentosPorIp.set(ip, vigentes);
    return true;
  };

  app.post('/avatar-session', async (req, reply): Promise<AvatarSessionResponse | FastifyReply> => {
    const ahora = Date.now();
    limpiar(ahora);
    if (!permitirIntento(req.ip, ahora)) {
      return responderError(reply, 429, 'avatar_rate_limited', Math.ceil(VENTANA_MS / 1_000));
    }

    const parsed = avatarSessionRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Datos invalidos' });
    const body = parsed.data;

    // NAP-S1: el id elegido debe existir en el catálogo y tener sus dos agentes listos.
    let seleccionada = defaultAvatarEntry();
    if (body.avatarId) {
      const encontrada = findAvatarById(body.avatarId);
      if (!encontrada || !avatarIsReady(encontrada)) {
        return responderError(reply, 400, 'avatar_unknown');
      }
      seleccionada = encontrada;
    }

    if (!cliente || !napster) {
      return responderError(reply, 503, 'avatar_disabled');
    }
    const baseAgents = { es: napster.agentIdEs, en: napster.agentIdEn };

    let decision: VisitorDecision;
    try {
      decision = await decideAvatarVisitor(pool, config, req, body);
    } catch (error) {
      if (error instanceof AvatarEventNotFoundError) return responderError(reply, 404, 'event_not_found');
      return responderError(reply, 502, 'avatar_upstream');
    }

    // NAP-S1: prioridad (a) avatar del evento listo, (b) avatarId elegido, (c) default.
    let agentId = avatarAgentId(seleccionada, body.lang, baseAgents);
    let agentKind: 'default' | 'custom' = 'default';
    let avatar: AvatarSessionAvatar = avatarPresentation(seleccionada);
    if (body.eventSlug) {
      const custom = await readyEventAvatarAgents(pool, body.eventSlug);
      const customId = body.lang === 'es' ? custom?.es : custom?.en;
      if (customId) {
        const firstName = (await readyEventAvatarFirstName(pool, body.eventSlug)) ?? seleccionada.firstName;
        agentId = customId;
        agentKind = 'custom';
        avatar = { id: 'event', firstName, previewUrl: null };
      }
    }
    if (!agentId) return responderError(reply, 503, 'avatar_disabled');

    const visitor: AvatarVisitor = decision.visitor;
    const contexto = {
      visitor,
      lang: body.lang,
      avatarFirstName: avatar.firstName,
      eventTitle: decision.eventTitle,
      siteName: decision.siteName,
    };

    try {
      const esTexto = body.mode === 'text';
      const peticion: Record<string, unknown> = {
        channelType: esTexto ? 'websocket' : 'webrtc',
        externalClientProfile: buildExternalClientProfile(contexto),
        initialSpeech: buildInitialSpeech(contexto),
      };
      if (esTexto) peticion.modality = 'text';
      const conexion = await cliente.createConnection(agentId, peticion);
      const handle = randomUUID();
      handles.set(handle, { connectionId: conexion.connectionId, expiresAt: Date.now() + TTL_HANDLE_MS });
      const respuesta: AvatarSessionResponse = {
        token: conexion.token,
        handle,
        visitor,
        lang: body.lang,
        agent: agentKind,
        avatar,
      };
      // NAP-F4s: solo el modo texto necesita abrir el socket; la URL sale del token del servidor.
      if (esTexto) respuesta.socketUrl = socketUrlDesdeToken(conexion.token);
      return respuesta;
    } catch (error) {
      if (!(error instanceof NapsterError)) return responderError(reply, 502, 'avatar_upstream');
      if (error.kind === 'busy') return responderError(reply, 409, 'avatar_busy');
      if (error.kind === 'rate_limited') {
        const retryAfterSec = Math.max(1, Math.ceil((error.retryAfterMs ?? 1_000) / 1_000));
        return responderError(reply, 429, 'avatar_rate_limited', retryAfterSec);
      }
      if (error.kind === 'no_credits') return responderError(reply, 503, 'avatar_no_credits');
      return responderError(reply, 502, 'avatar_upstream');
    }
  });

  app.post('/avatar-session/end', async (req, reply) => {
    const parsed = avatarSessionEndSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Datos invalidos' });
    limpiar(Date.now());
    const sesion = handles.get(parsed.data.handle);
    if (!sesion) return reply.code(204).send();
    handles.delete(parsed.data.handle);
    if (cliente) {
      try {
        await cliente.deleteConnection(sesion.connectionId);
      } catch {
        // NAP-F2: el cierre del navegador no debe quedar bloqueado por un fallo de Napster.
      }
    }
    return reply.code(204).send();
  });
}
