import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from '../config.js';
import type { Pool, PoolClient } from '../db/pool.js';
import { newId, newSessionToken, sha256 } from './ids.js';
import { unauthorized } from '../errors.js';

export interface SessionRow {
  id: string;
  demo_generation: number;
}

type Queryable = Pool | PoolClient;

/** Reads the session behind the cookie. Only the sha256 of the token is ever stored. */
export async function readSession(db: Queryable, config: Config, req: FastifyRequest): Promise<SessionRow | null> {
  const token = req.cookies?.[config.cookieName];
  if (!token || token.length < 16 || token.length > 200) return null;
  const { rows } = await db.query<SessionRow>(
    `UPDATE sessions SET last_seen_at = now()
      WHERE token_hash = $1 AND created_at > now() - ($2 * interval '1 second')
      RETURNING id, demo_generation`,
    [sha256(token), config.cookieMaxAgeSeconds],
  );
  return rows[0] ?? null;
}

export async function requireSession(db: Queryable, config: Config, req: FastifyRequest): Promise<SessionRow> {
  const session = await readSession(db, config, req);
  if (!session) throw unauthorized('Sesion requerida');
  return session;
}

/** Creates a session row and sets the HttpOnly cookie. */
export async function createSession(db: Queryable, config: Config, reply: FastifyReply): Promise<SessionRow> {
  const token = newSessionToken();
  const id = newId();
  const { rows } = await db.query<SessionRow>(
    `INSERT INTO sessions (id, token_hash) VALUES ($1, $2) RETURNING id, demo_generation`,
    [id, sha256(token)],
  );
  reply.setCookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: '/',
    maxAge: config.cookieMaxAgeSeconds,
  });
  return rows[0]!;
}

export async function ensureSession(
  db: Queryable,
  config: Config,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<SessionRow> {
  return (await readSession(db, config, req)) ?? (await createSession(db, config, reply));
}
