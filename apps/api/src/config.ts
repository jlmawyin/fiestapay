import { join } from 'node:path';
import type { LlmProvider } from '@fiestapay/shared';

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

export interface GeminiConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  maxToolRounds: number;
  maxHistoryMessages: number;
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
  /** Chat provider chosen by LLM_PROVIDER. Only the selected one is ever configured. */
  llmProvider: LlmProvider;
  openai: OpenAIConfig | null;
  gemini: GeminiConfig | null;
  voice: ReturnType<typeof voiceConfig>;
  /** Reason PayPal is unavailable, for honest 503 bodies. */
  paypalDisabledReason: string | null;
  openaiDisabledReason: string | null;
  geminiDisabledReason: string | null;
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

function readGemini(env: NodeJS.ProcessEnv): { config: GeminiConfig | null; reason: string | null } {
  const apiKey = str(env.GEMINI_API_KEY);
  if (!apiKey) return { config: null, reason: 'Falta configuracion de Gemini: GEMINI_API_KEY' };
  return {
    config: {
      apiKey,
      model: str(env.GEMINI_MODEL) ?? 'gemini-3.8-flash',
      baseUrl: (str(env.GEMINI_BASE_URL) ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, ''),
      timeoutMs: num(env.GEMINI_TIMEOUT_MS, 20000),
      maxToolRounds: num(env.GEMINI_MAX_TOOL_ROUNDS, 4),
      maxHistoryMessages: num(env.GEMINI_MAX_HISTORY, 24),
    },
    reason: null,
  };
}

/** Throws on an unknown value: a typo must not silently switch, or disable, the chat provider. */
function readLlmProvider(env: NodeJS.ProcessEnv): LlmProvider {
  const raw = (str(env.LLM_PROVIDER) ?? 'openai').toLowerCase();
  if (raw === 'openai' || raw === 'gemini') return raw;
  throw new Error('LLM_PROVIDER invalido: use openai o gemini');
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
  // Only the selected provider is read, so there is no configured client to fall back to.
  const llmProvider = readLlmProvider(env);
  const openai = llmProvider === 'openai' ? readOpenAI(env) : { config: null, reason: 'Proveedor de chat seleccionado: gemini' };
  const gemini = llmProvider === 'gemini' ? readGemini(env) : { config: null, reason: 'Proveedor de chat seleccionado: openai' };
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
    gemini: gemini.config,
    voice: voiceConfig(env),
    geminiDisabledReason: gemini.reason,
  };
}
