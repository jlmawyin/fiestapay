import { join } from 'node:path';
import type { LlmProvider } from '@fiestapay/shared';
import { normalizeMailbox } from './email/address.js';

export function voiceConfig(env: NodeJS.ProcessEnv = process.env) {
  const bounded = (v: string | undefined, fallback: number, cap: number) => Math.min(cap, Math.max(1, Number(v) || fallback));
  return {enabled:env.VOICE_ENABLED === 'true' && Boolean(env.ASSEMBLYAI_API_KEY),key:env.ASSEMBLYAI_API_KEY ?? '',maxSeconds:Math.floor(bounded(env.VOICE_MAX_SECONDS,120,300)),dailySeconds:Math.floor(bounded(env.VOICE_DAILY_SECONDS,1800,3600))};
}

const SANDBOX_HOSTS = new Set(['api-m.sandbox.paypal.com', 'api.sandbox.paypal.com']);

export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  merchantId: string;
  baseUrl: string;
  webhookId: string | null;
  timeoutMs: number;
  brandName: string;
}

export interface OpenAIConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  maxToolRounds: number;
  maxHistoryMessages: number;
  maxOutputTokens: number;
  /** Fixed for the approved model; not configurable from the environment. */
  reasoningEffort: 'low';
}

export interface EmailConfig {
  /** cPanel outgoing hostname from SMTP_HOST. Never a default invented here. */
  host: string;
  port: 465 | 587;
  user: string;
  pass: string;
  from: string;
  timeoutMs: number;
  dailyCap: number;
  ipLimit: number;
  ipWindowSeconds: number;
  eventLimit: number;
  eventWindowSeconds: number;
  tokenTtlSeconds: number;
}

export interface Config {
  env: 'development' | 'test' | 'production';
  port: number;
  host: string;
  databaseUrl: string | null;
  /** Canonical public origin of the deployment, used for PayPal return/cancel URLs. */
  publicOrigin: string | null;
  allowedOrigins: string[];
  cookieName: string;
  cookieSecure: boolean;
  cookieMaxAgeSeconds: number;
  quoteTtlSeconds: number;
  bodyLimitBytes: number;
  /** Rate limiting is on unless RATE_LIMIT=0 (used by tests that share one client IP). */
  rateLimitEnabled: boolean;
  rateLimitMax: number;
  webDir: string;
  serveWeb: boolean;
  paypal: PayPalConfig | null;
  /** Compatibility marker. The only accepted value is openai. */
  llmProvider: LlmProvider;
  openai: OpenAIConfig | null;
  voice: ReturnType<typeof voiceConfig>;
  email: EmailConfig | null;
  /** Reason PayPal is unavailable, for honest 503 bodies. */
  paypalDisabledReason: string | null;
  emailDisabledReason: string | null;
  openaiDisabledReason: string | null;
}

const str = (v: string | undefined): string | null => {
  const t = (v ?? '').trim();
  return t.length > 0 ? t : null;
};

const num = (v: string | undefined, fallback: number): number => {
  const n = Number(str(v) ?? '');
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

const capped = (v: string | undefined, fallback: number, cap: number): number => Math.min(cap, num(v, fallback));

const originList =(raw: string | null): string[] => {
  if (!raw) return [];
  return raw
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, '').toLowerCase())
    .filter((o) => o.length > 0);
};

function readPayPal(env: NodeJS.ProcessEnv): { config: PayPalConfig | null; reason: string | null } {
  const clientId = str(env.PAYPAL_CLIENT_ID);
  const clientSecret = str(env.PAYPAL_CLIENT_SECRET);
  const merchantId = str(env.PAYPAL_MERCHANT_ID);
  const baseUrl = (str(env.PAYPAL_BASE_URL) ?? 'https://api-m.sandbox.paypal.com').replace(/\/+$/, '');
  const missing: string[] = [];
  if (!clientId) missing.push('PAYPAL_CLIENT_ID');
  if (!clientSecret) missing.push('PAYPAL_CLIENT_SECRET');
  if (!merchantId) missing.push('PAYPAL_MERCHANT_ID');
  if (missing.length > 0) return { config: null, reason: `Falta configuracion de PayPal: ${missing.join(', ')}` };

  let host: string;
  try {
    host = new URL(baseUrl).host;
  } catch {
    return { config: null, reason: 'PAYPAL_BASE_URL invalida' };
  }
  // P1 is sandbox-only on purpose: refuse to talk to live PayPal even if someone sets the URL.
  if (!SANDBOX_HOSTS.has(host)) {
    return { config: null, reason: 'PAYPAL_BASE_URL debe apuntar al sandbox de PayPal' };
  }

  return {
    config: {
      clientId: clientId!,
      clientSecret: clientSecret!,
      merchantId: merchantId!,
      baseUrl,
      webhookId: str(env.PAYPAL_WEBHOOK_ID),
      timeoutMs: num(env.PAYPAL_TIMEOUT_MS, 12000),
      brandName: str(env.PAYPAL_BRAND_NAME) ?? 'FiestaPay (demo sandbox)',
    },
    reason: null,
  };
}

/** DNS hostname only. IP literals, URLs and a single label are rejected. No default host. */
function readSmtpHost(raw: string | null): string | null {
  if (!raw) return null;
  const host = raw.toLowerCase();
  if (host.length > 253 || host.includes('..') || host.endsWith('.')) return null;
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(host)) return null;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return null;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return null;
  return host;
}

function hasControl(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/** Password is kept verbatim. Empty, padded, control, or oversized values disable mail. */
function readSmtpPass(raw: string | undefined): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 1024) return null;
  if (raw !== raw.trim()) return null;
  if (hasControl(raw)) return null;
  return raw;
}

function readEmail(env: NodeJS.ProcessEnv, publicOrigin: string | null): { config: EmailConfig | null; reason: string | null } {
  const hostRaw = str(env.SMTP_HOST);
  const portRaw = (env.SMTP_PORT ?? '').trim();
  const userRaw = str(env.SMTP_USER);
  const fromRaw = str(env.EMAIL_FROM);
  const missing: string[] = [];
  if (!hostRaw) missing.push('SMTP_HOST');
  if (!portRaw) missing.push('SMTP_PORT');
  if (!userRaw) missing.push('SMTP_USER');
  if (readSmtpPass(env.SMTP_PASS) === null && (env.SMTP_PASS ?? '').trim() === '') missing.push('SMTP_PASS');
  if (!fromRaw) missing.push('EMAIL_FROM');
  if (missing.length > 0) return { config: null, reason: `Falta configuracion de correo: ${missing.join(', ')}` };
  if (!publicOrigin) return { config: null, reason: 'Falta PUBLIC_ORIGIN para los enlaces de recuperacion' };
  if (portRaw !== '465' && portRaw !== '587') return { config: null, reason: 'SMTP_PORT invalido' };
  const host = readSmtpHost(hostRaw);
  if (!host) return { config: null, reason: 'SMTP_HOST invalido' };
  const user = normalizeMailbox(userRaw!);
  if (!user) return { config: null, reason: 'SMTP_USER invalido' };
  const pass = readSmtpPass(env.SMTP_PASS);
  if (!pass) return { config: null, reason: 'SMTP_PASS invalido' };
  const from = normalizeMailbox(fromRaw!);
  if (!from) return { config: null, reason: 'EMAIL_FROM invalido' };
  return {
    config: {
      host,
      port: portRaw === '465' ? 465 : 587,
      user,
      pass,
      from,
      timeoutMs: Math.min(20_000, Math.max(1_000, num(env.EMAIL_TIMEOUT_MS, 8000))),
      dailyCap: Math.min(100, num(env.EMAIL_DAILY_CAP, 20)),
      ipLimit: Math.min(20, num(env.EMAIL_IP_LIMIT, 5)),
      ipWindowSeconds: Math.min(86_400, num(env.EMAIL_IP_WINDOW_SECONDS, 3600)),
      eventLimit: Math.min(20, num(env.EMAIL_EVENT_LIMIT, 5)),
      eventWindowSeconds: Math.min(86_400, num(env.EMAIL_EVENT_WINDOW_SECONDS, 3600)),
      tokenTtlSeconds: Math.min(900, num(env.EMAIL_TOKEN_TTL_SECONDS, 900)),
    },
    reason: null,
  };
}

/** Compatibility only. Any value other than openai fails closed and is not echoed. */
function readLlmProvider(env: NodeJS.ProcessEnv): LlmProvider {
  const raw = (str(env.LLM_PROVIDER) ?? 'openai').toLowerCase();
  if (raw === 'openai') return raw;
  throw new Error('LLM_PROVIDER invalido: solo se admite openai');
}

function readOpenAI(env: NodeJS.ProcessEnv): { config: OpenAIConfig | null; reason: string | null } {
  const apiKey = str(env.OPENAI_API_KEY);
  if (!apiKey) return { config: null, reason: 'El asistente no esta configurado: falta OPENAI_API_KEY' };
  const baseUrl = (str(env.OPENAI_BASE_URL) ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
  try {
    if (new URL(baseUrl).protocol !== 'https:') return { config: null, reason: 'OPENAI_BASE_URL debe usar https' };
  } catch {
    return { config: null, reason: 'OPENAI_BASE_URL invalida' };
  }
  return {
    config: {
      apiKey,
      model: str(env.OPENAI_MODEL) ?? 'gpt-6-luna',
      baseUrl,
      timeoutMs: capped(env.OPENAI_TIMEOUT_MS, 20000, 60000),
      maxToolRounds: capped(env.OPENAI_MAX_TOOL_ROUNDS, 4, 6),
      maxHistoryMessages: capped(env.OPENAI_MAX_HISTORY, 24, 60),
      maxOutputTokens: capped(env.OPENAI_MAX_OUTPUT_TOKENS, 2000, 4000),
      reasoningEffort: 'low',
    },
    reason: null,
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const nodeEnv = str(env.NODE_ENV);
  const resolvedEnv: Config['env'] = nodeEnv === 'production' ? 'production' : nodeEnv === 'test' ? 'test' : 'development';
  const publicOrigin = str(env.PUBLIC_ORIGIN);
  const allowed = new Set<string>([...originList(str(env.ALLOWED_ORIGINS)), ...originList(publicOrigin)]);
  if (resolvedEnv !== 'production') {
    for (const dev of ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000', 'http://127.0.0.1:3000']) {
      allowed.add(dev);
    }
  }
  const paypal = readPayPal(env);
  const email = readEmail(env, publicOrigin === null ? null : publicOrigin.replace(/\/+$/, ''));
  const llmProvider = readLlmProvider(env);
  const openai = readOpenAI(env);
  const webDir = str(env.WEB_DIST_DIR) ?? join(import.meta.dirname, '..', '..', 'web', 'dist');

  return {
    env: resolvedEnv,
    port: num(env.PORT, 3000),
    host: str(env.HOST) ?? '0.0.0.0',
    databaseUrl: str(env.DATABASE_URL),
    publicOrigin: publicOrigin === null ? null : publicOrigin.replace(/\/+$/, ''),
    allowedOrigins: [...allowed],
    cookieName: str(env.SESSION_COOKIE_NAME) ?? 'fp_session',
    cookieSecure: resolvedEnv === 'production' || (publicOrigin ?? '').startsWith('https://'),
    cookieMaxAgeSeconds: num(env.SESSION_TTL_SECONDS, 60 * 60 * 24 * 30),
    quoteTtlSeconds: num(env.QUOTE_TTL_SECONDS, 15 * 60),
    bodyLimitBytes: num(env.BODY_LIMIT_BYTES, 64 * 1024),
    rateLimitEnabled: str(env.RATE_LIMIT) !== '0',
    rateLimitMax: num(env.RATE_LIMIT_MAX, 300),
    webDir,
    serveWeb: str(env.SERVE_WEB) !== '0',
    paypal: paypal.config,
    paypalDisabledReason: paypal.reason,
    llmProvider,
    openai: openai.config,
    openaiDisabledReason: openai.reason,
    voice: voiceConfig(env),
    email: email.config,
    emailDisabledReason: email.reason,
  };
}
