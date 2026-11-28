/**
 * Rutas del avatar con foto del organizador (NAP-F6s).
 * Depende de `domain/event-avatars.ts`, la clave de organizador y el cliente Napster.
 * Solo el host legado permite subir/gestionar la foto; la imagen pública usa un token aleatorio.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { eventAvatarStatusSchema, eventAvatarUploadSchema, type EventAvatarStatusResponse } from '@fiestapay/shared';
import { notFound } from '../errors.js';
import { assertAdminKey, presentedAdminKey } from '../domain/access.js';
import { getEventBySlug } from '../domain/read.js';
import {
  deleteEventAvatar,
  EventAvatarLimitError,
  EventAvatarPhotoError,
  eventAvatarPhoto,
  refreshEventAvatar,
  uploadEventAvatar,
} from '../domain/event-avatars.js';
import { createNapsterClient, NapsterError } from '../napster/client.js';
import type { RouteDeps } from './deps.js';

function assertEventAvatarHost(req: FastifyRequest, slug: string): void {
  const host = req.hostClassification;
  if (host?.kind === 'legacy') return;
  // NAP-S4: la pantalla final de la creación vive en la raíz; la clave sigue siendo obligatoria.
  if (host?.kind === 'root') return;
  // NAP-S2: el host de una reunión solo puede gestionar la foto de esa misma reunión.
  if (host?.kind === 'event' && host.slug === slug) return;
  throw notFound('Ruta no encontrada');
}

function slugDe(req: FastifyRequest): string {
  const slug = (req.params as { slug?: unknown }).slug;
  if (typeof slug !== 'string' || slug.length === 0) throw notFound('Evento no encontrado');
  return slug;
}

function responderError(reply: FastifyReply, status: number, error: string) {
  return reply.code(status).send({ error });
}

export async function registerEventAvatarRoutes(app: FastifyInstance, deps: RouteDeps): Promise<void> {
  const { pool, config } = deps;

  const eventoAutorizado = async (req: FastifyRequest) => {
    const slug = slugDe(req);
    assertEventAvatarHost(req, slug);
    const event = await getEventBySlug(pool, slug);
    assertAdminKey(event, presentedAdminKey(req));
    return event;
  };

  const cliente = () => {
    const napster = config.napster;
    if (!napster || !napster.apiKey || !napster.agentIdEs || !napster.agentIdEn) return null;
    return createNapsterClient({ apiKey: napster.apiKey, baseUrl: napster.baseUrl });
  };

  app.post('/events/:slug/avatar', { bodyLimit: 7 * 1024 * 1024 }, async (req, reply) => {
    const event = await eventoAutorizado(req);
    const parsed = eventAvatarUploadSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Datos invalidos' });
    const napster = config.napster;
    const napsterClient = cliente();
    if (!napsterClient || !napster || !config.publicOrigin) return responderError(reply, 503, 'avatar_upstream');

    try {
      const row = await uploadEventAvatar(
        pool,
        napsterClient,
        event,
        parsed.data.firstName,
        parsed.data.photo,
        config.publicOrigin,
      );
      return eventAvatarStatusSchema.parse({ status: row.status, firstName: row.first_name, ready: row.status === 'ready' });
    } catch (error) {
      if (error instanceof EventAvatarLimitError) return responderError(reply, 409, 'avatar_limit');
      if (error instanceof EventAvatarPhotoError) return reply.code(400).send({ error: 'Datos invalidos' });
      return responderError(reply, 502, 'avatar_upstream');
    }
  });

  app.get('/events/:slug/avatar', async (req, reply): Promise<EventAvatarStatusResponse | unknown> => {
    const event = await eventoAutorizado(req);
    const napsterClient = cliente();
    if (!napsterClient) return responderError(reply, 503, 'avatar_upstream');
    try {
      const row = await refreshEventAvatar(pool, napsterClient, event, {
        es: config.napster!.agentIdEs,
        en: config.napster!.agentIdEn,
      });
      if (!row) return { status: 'none', firstName: null, ready: false };
      return { status: row.status, firstName: row.first_name, ready: row.status === 'ready' };
    } catch (error) {
      if (error instanceof NapsterError) return responderError(reply, 502, 'avatar_upstream');
      throw error;
    }
  });

  app.delete('/events/:slug/avatar', async (req, reply) => {
    const event = await eventoAutorizado(req);
    const napsterClient = cliente();
    if (napsterClient) await deleteEventAvatar(pool, napsterClient, event.id);
    else await deleteEventAvatar(pool, null, event.id);
    return reply.code(204).send();
  });
}

/** GET público de la foto; no se registra bajo `/api`. */
export async function registerEventAvatarMediaRoute(app: FastifyInstance, deps: RouteDeps): Promise<void> {
  app.get('/media/avatar/:token', async (req, reply) => {
    const token = (req.params as { token?: unknown }).token;
    if (typeof token !== 'string' || token.length < 20) return reply.code(404).send({ error: 'No encontrado' });
    const photo = await eventAvatarPhoto(deps.pool, token);
    if (!photo) return reply.code(404).send({ error: 'No encontrado' });
    reply.header('Cache-Control', 'no-store');
    return reply.type(photo.mime).send(photo.bytes);
  });
}
