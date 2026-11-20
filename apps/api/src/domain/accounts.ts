/**
 * Cuentas Somos Panas (SP-4): registro, verificación de correo, sesión con usuario y límites de intento.
 * Depende de `users`, `account_email_tokens`, `sessions`, adaptador de correo inyectable y `email/address`.
 * Contraseñas: scrypt de Node (`node:crypto`) con sal aleatoria por usuario.
 * Parámetros documentados: N=16384, r=8, p=1, derivación de 64 bytes (ver SCRYPT_PARAMS).
 * `email_hash` en la base: HMAC-SHA256 del correo normalizado (trim + minúsculas) con clave de servidor
 * (`ACCOUNTS_EMAIL_HMAC_KEY` en configuración; en pruebas un valor fijo del harness, nunca un secreto real en Git).
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from '../db/pool.js';
import { badRequest, unauthorized, HttpError } from '../errors.js';
import { normalizeMailbox } from '../email/address.js';
import type { EmailAdapter, EmailSendResult } from '../email/types.js';
import { newId, sha256 } from '../lib/ids.js';
import type { Config } from '../config.js';
import { createSession, ensureSession, readSession, type SessionRow } from '../lib/session.js';
import { withTransaction } from '../db/pool.js';
import { digestMatches } from './access.js';

/** Parámetros scrypt usados en hash de contraseña (D3). */
export const SCRYPT_PARAMS = {
  N: 16_384,
  r: 8,
  p: 1,
  keylen: 64,
  maxmem: 128 * 1024 * 1024,
} as const;

const LOGIN_FAILURE = 'No autorizado';
const LOGIN_LIMIT = 'Demasiados intentos de correo. Espera antes de volver a solicitarlo.';
const EMAIL_NOT_CONFIGURED = 'El correo de recuperacion no esta configurado';
const VERIFY_INVALID = 'El enlace no es valido. Solicita uno nuevo.';
const GENERIC_VERIFY_SENT =
  'Si el correo esta registrado y aun no se verifico, enviamos un enlace. Revisa tu bandeja.';

/** Reservas diarias de correo de cuenta: distinto del candado de recuperación de eventos. */
const ACCOUNT_EMAIL_BUDGET_LOCK = 778899127;

export interface AccountPublicUser {
  id: string;
  email: string;
}

export interface RegisterResult {
  status: 'pending';
  message: string;
}

export interface LoginResult {
  user: AccountPublicUser;
}

export interface VerifyEmailResult {
  verified: true;
  user: AccountPublicUser;
}

export interface SessionAccountResult {
  user: AccountPublicUser | null;
}

type Queryable = Pool | PoolClient;

/**
 * Lee la clave HMAC para `users.email_hash`.
 * Entrada: entorno de proceso (en pruebas, valor fijo del harness).
 * Salida: buffer de clave; error si falta en producción o prueba.
 */
export function resolveEmailHmacKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const raw = (env.ACCOUNTS_EMAIL_HMAC_KEY ?? '').trim();
  if (raw.length >= 16 && raw.length <= 256) {
    return Buffer.from(raw, 'utf8');
  }
  // Valor fijo del harness en pruebas; nunca sustituye la clave real en producción.
  if ((env.NODE_ENV ?? '').trim() === 'test') {
    return Buffer.from('harness-fixed-email-hmac-key-sp4', 'utf8');
  }
  throw new Error('ACCOUNTS_EMAIL_HMAC_KEY ausente o invalida');
}

/**
 * HMAC-SHA256 del correo ya normalizado (minúsculas).
 * Entrada: correo normalizado y clave del servidor.
 * Salida: digest binario para la columna `email_hash`.
 */
export function hmacEmailHash(normalizedEmail: string, key: Buffer): Buffer {
  return createHmac('sha256', key).update(normalizedEmail, 'utf8').digest();
}

/**
 * Deriva y serializa el hash de contraseña con sal propia.
 * Entrada: contraseña en texto plano (solo en el servidor, nunca se devuelve).
 * Salida: cadena `scrypt:N:r:p:salt:hash` en base64url.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, SCRYPT_PARAMS.keylen, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
    maxmem: SCRYPT_PARAMS.maxmem,
  });
  return [
    'scrypt',
    String(SCRYPT_PARAMS.N),
    String(SCRYPT_PARAMS.r),
    String(SCRYPT_PARAMS.p),
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join(':');
}

/**
 * Verifica contraseña contra el hash almacenado.
 * Entrada: contraseña presentada y cadena almacenada.
 * Salida: true solo si coincide; siempre ejecuta scrypt en el intento válido.
 */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4]!, 'base64url');
    expected = Buffer.from(parts[5]!, 'base64url');
  } catch {
    return false;
  }
  if (expected.length === 0) return false;
  const derived = scryptSync(password, salt, expected.length, { N, r, p, maxmem: SCRYPT_PARAMS.maxmem });
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

function newVerifyToken(): string {
  return randomBytes(32).toString('base64url');
}

function accountVerifyEmail(origin: string, to: string, token: string) {
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(token)) throw new Error('token de verificacion invalido');
  const link = `${origin.replace(/\/+$/, '')}/verify#t=${token}`;
  return {
    to,
    subject: 'Confirma tu correo en Somos Panas',
    text: [
      'Confirma tu cuenta en la portada de Somos Panas.',
      'El enlace caduca en 15 minutos y funciona una sola vez.',
      link,
      'Si no pediste esto, ignora el mensaje.',
    ].join('\n\n'),
  };
}

async function bumpWindow(db: PoolClient, scope: string, bucket: Buffer, windowSeconds: number): Promise<number> {
  const { rows } = await db.query<{ hits: number }>(
    `INSERT INTO email_attempt_windows AS w (scope, bucket, window_start, hits)
     VALUES ($1, $2, now(), 1)
     ON CONFLICT (scope, bucket) DO UPDATE
     SET hits = CASE
           WHEN w.window_start <= now() - make_interval(secs => $3) THEN 1
           ELSE w.hits + 1
         END,
         window_start = CASE
           WHEN w.window_start <= now() - make_interval(secs => $3) THEN now()
           ELSE w.window_start
         END
     RETURNING hits`,
    [scope, bucket, windowSeconds],
  );
  return rows[0]?.hits ?? 1;
}

async function reserveAccountEmailDaily(db: PoolClient, cap: number): Promise<boolean> {
  await db.query('SELECT pg_advisory_xact_lock($1)', [ACCOUNT_EMAIL_BUDGET_LOCK]);
  const { rows } = await db.query<{ reserved: number }>(
    `SELECT reserved FROM email_daily_budget
      WHERE day = (now() AT TIME ZONE 'America/Guayaquil')::date
      FOR UPDATE`,
  );
  const reserved = rows[0]?.reserved ?? 0;
  if (reserved >= cap) return false;
  if (rows.length === 0) {
    await db.query(
      `INSERT INTO email_daily_budget (day, reserved)
       VALUES ((now() AT TIME ZONE 'America/Guayaquil')::date, 1)`,
    );
  } else {
    await db.query(
      `UPDATE email_daily_budget SET reserved = reserved + 1
        WHERE day = (now() AT TIME ZONE 'America/Guayaquil')::date`,
    );
  }
  return true;
}

const LOGIN_IP_LIMIT = 20;
const LOGIN_IP_WINDOW_SECONDS = 3600;
const LOGIN_EMAIL_LIMIT = 10;
const LOGIN_EMAIL_WINDOW_SECONDS = 3600;

async function chargeLoginAttempt(db: PoolClient, ip: string, emailHash: Buffer): Promise<boolean> {
  const ipHits = await bumpWindow(db, 'account_login_ip', sha256(`login-ip:${ip}`), LOGIN_IP_WINDOW_SECONDS);
  const emailHits = await bumpWindow(
    db,
    'account_login_email',
    sha256(`login-email:${emailHash.toString('base64url')}`),
    LOGIN_EMAIL_WINDOW_SECONDS,
  );
  return ipHits <= LOGIN_IP_LIMIT && emailHits <= LOGIN_EMAIL_LIMIT;
}

interface UserRow {
  id: string;
  email: string;
  email_hash: Buffer;
  password_hash: string;
  email_verified_at: Date | null;
}

function toPublicUser(row: Pick<UserRow, 'id' | 'email'>): AccountPublicUser {
  return { id: row.id, email: row.email };
}

async function loadUserByEmailHash(db: Queryable, emailHash: Buffer): Promise<UserRow | null> {
  const { rows } = await db.query<UserRow>(
    `SELECT id, email, email_hash, password_hash, email_verified_at
       FROM users WHERE email_hash = $1`,
    [emailHash],
  );
  return rows[0] ?? null;
}

async function linkSessionUser(db: Queryable, sessionId: string, userId: string | null): Promise<void> {
  await db.query('UPDATE sessions SET user_id = $1 WHERE id = $2', [userId, sessionId]);
}

/**
 * Registra un correo y contraseña en la raíz; envía verificación por el adaptador inyectado.
 * Entrada: correo y contraseña; IP para límites; origen público para el enlace.
 * Salida: estado pendiente; nunca incluye contraseña ni token.
 */
export async function registerAccount(
  pool: Pool,
  rawEmail: string,
  password: string,
  ip: string,
  adapter: EmailAdapter | null,
  origin: string | null,
  hmacKey: Buffer,
  dailyCap = 100,
): Promise<RegisterResult> {
  const email = normalizeMailbox(rawEmail);
  if (!email) throw badRequest('Correo invalido');
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
    throw badRequest('Datos invalidos');
  }
  if (!adapter || !origin) throw new HttpError(503, EMAIL_NOT_CONFIGURED);

  const emailHash = hmacEmailHash(email, hmacKey);
  const outcome = await withTransaction(pool, async (client) => {
    const allowed = await reserveAccountEmailDaily(client, dailyCap);
    if (!allowed) return { kind: 'limited' as const };

    const existing = await loadUserByEmailHash(client, emailHash);
    if (existing) {
      if (existing.email_verified_at) {
        return { kind: 'exists' as const };
      }
      await client.query('DELETE FROM account_email_tokens WHERE user_id = $1', [existing.id]);
      const token = newVerifyToken();
      const expires = new Date(Date.now() + 900_000);
      const tokenId = newId();
      await client.query(
        `INSERT INTO account_email_tokens (id, user_id, token_hash, expires_at) VALUES ($1,$2,$3,$4)`,
        [tokenId, existing.id, sha256(token), expires.toISOString()],
      );
      return { kind: 'resend' as const, to: existing.email, token, tokenId };
    }

    const userId = newId();
    const passwordHash = hashPassword(password);
    await client.query(
      `INSERT INTO users (id, email, email_hash, password_hash) VALUES ($1,$2,$3,$4)`,
      [userId, email, emailHash, passwordHash],
    );
    const token = newVerifyToken();
    const expires = new Date(Date.now() + 900_000);
    const tokenId = newId();
    await client.query(
      `INSERT INTO account_email_tokens (id, user_id, token_hash, expires_at) VALUES ($1,$2,$3,$4)`,
      [tokenId, userId, sha256(token), expires.toISOString()],
    );
    void ip;
    return { kind: 'created' as const, to: email, token, tokenId };
  });

  if (outcome.kind === 'limited') throw new HttpError(429, LOGIN_LIMIT);
  if (outcome.kind === 'exists') throw new HttpError(409, 'Datos invalidos');

  let sendResult: EmailSendResult;
  try {
    sendResult = await adapter.send(accountVerifyEmail(origin, outcome.to, outcome.token));
  } catch {
    sendResult = { status: 'failed' };
  }
  if (sendResult.status !== 'accepted') {
    throw new HttpError(502, 'No se pudo enviar el correo de verificacion');
  }

  return { status: 'pending', message: GENERIC_VERIFY_SENT };
}

/**
 * Inicia sesión en la raíz con correo y contraseña verificada.
 * Entrada: credenciales, sesión del navegador, IP para límites.
 * Salida: usuario público; mensaje genérico si falla (no revela si el correo existe).
 */
export async function loginAccount(
  pool: Pool,
  config: Config,
  req: FastifyRequest,
  reply: FastifyReply,
  rawEmail: string,
  password: string,
  ip: string,
  hmacKey: Buffer,
): Promise<LoginResult> {
  const email = normalizeMailbox(rawEmail);
  if (!email) throw badRequest('Correo invalido');
  if (typeof password !== 'string' || password.length === 0 || password.length > 200) {
    throw badRequest('Datos invalidos');
  }
  const emailHash = hmacEmailHash(email, hmacKey);

  const allowed = await withTransaction(pool, async (client) => chargeLoginAttempt(client, ip, emailHash));
  if (!allowed) throw new HttpError(429, LOGIN_LIMIT);

  const user = await loadUserByEmailHash(pool, emailHash);
  if (!user || !user.email_verified_at || !verifyPassword(password, user.password_hash)) {
    throw unauthorized(LOGIN_FAILURE);
  }

  const session =
    (await readSession(pool, config, req)) ?? (await createSession(pool, config, reply));
  await linkSessionUser(pool, session.id, user.id);
  return { user: toPublicUser(user) };
}

/**
 * Canjea el token de verificación de correo (un solo uso, con caducidad).
 * Entrada: token en texto plano del correo.
 * Salida: usuario verificado; error genérico si no es válido.
 */
export async function verifyAccountEmail(pool: Pool, rawToken: string, hmacKey: Buffer): Promise<VerifyEmailResult> {
  if (typeof rawToken !== 'string' || rawToken.length < 43 || rawToken.length > 200 || !/^[A-Za-z0-9_-]+$/.test(rawToken)) {
    throw badRequest(VERIFY_INVALID);
  }
  const digest = sha256(rawToken);
  const outcome = await withTransaction(pool, async (client) => {
    const locked = await client.query<{
      id: string;
      user_id: string;
      token_hash: Buffer;
      expires_at: Date;
      consumed_at: Date | null;
    }>(
      `SELECT id, user_id, token_hash, expires_at, consumed_at
         FROM account_email_tokens WHERE token_hash = $1 FOR UPDATE`,
      [digest],
    );
    const row = locked.rows[0];
    if (!row || !digestMatches(row.token_hash, rawToken)) return { kind: 'unknown' as const };
    if (row.consumed_at) return { kind: 'reused' as const };
    if (row.expires_at.getTime() <= Date.now()) return { kind: 'expired' as const };

    const consumed = await client.query(
      `UPDATE account_email_tokens SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL RETURNING id`,
      [row.id],
    );
    if ((consumed.rowCount ?? 0) !== 1) return { kind: 'reused' as const };

    await client.query('UPDATE users SET email_verified_at = now() WHERE id = $1', [row.user_id]);
    await client.query('DELETE FROM account_email_tokens WHERE user_id = $1 AND id <> $2', [row.user_id, row.id]);

    const userRows = await client.query<UserRow>(
      `SELECT id, email, email_hash, password_hash, email_verified_at FROM users WHERE id = $1`,
      [row.user_id],
    );
    const user = userRows.rows[0];
    if (!user) return { kind: 'unknown' as const };
    void hmacKey;
    return { kind: 'ok' as const, user };
  });

  if (outcome.kind === 'expired') throw badRequest('Este enlace caduco. Solicita uno nuevo.');
  if (outcome.kind === 'reused') throw badRequest('Este enlace ya se uso. Solicita uno nuevo.');
  if (outcome.kind === 'unknown') throw badRequest(VERIFY_INVALID);
  return { verified: true, user: toPublicUser(outcome.user) };
}

/** Cierra la sesión de cuenta enlazada; la cookie anónima sigue válida. */
export async function logoutAccount(
  pool: Pool,
  config: Config,
  req: FastifyRequest,
): Promise<{ ok: true }> {
  const session = await readSession(pool, config, req);
  if (!session) throw unauthorized('Sesion requerida');
  await linkSessionUser(pool, session.id, null);
  return { ok: true };
}

/** Devuelve la cuenta enlazada a la cookie actual, si existe y está verificada. */
export async function currentAccount(
  pool: Pool,
  config: Config,
  req: FastifyRequest,
): Promise<SessionAccountResult> {
  const session = await readSession(pool, config, req);
  if (!session) return { user: null };
  const { rows } = await pool.query<UserRow>(
    `SELECT u.id, u.email, u.email_hash, u.password_hash, u.email_verified_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = $1 AND u.email_verified_at IS NOT NULL`,
    [session.id],
  );
  const user = rows[0];
  return { user: user ? toPublicUser(user) : null };
}

/**
 * Garantiza sesión con usuario verificado o lanza 401.
 * Entrada: request con cookie.
 * Salida: filas de usuario y sesión.
 */
export async function requireVerifiedUser(
  pool: Pool,
  config: Config,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<{ session: SessionRow; user: UserRow }> {
  const session = (await readSession(pool, config, req)) ?? (await ensureSession(pool, config, req, reply));
  const { rows } = await pool.query<UserRow>(
    `SELECT u.id, u.email, u.email_hash, u.password_hash, u.email_verified_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = $1 AND u.email_verified_at IS NOT NULL`,
    [session.id],
  );
  const user = rows[0];
  if (!user) throw unauthorized('Sesion requerida');
  return { session, user };
}