import { GoogleGenAI, type LiveConnectConfig } from '@google/genai';
import {
  GEMINI_LIVE_API_VERSION,
  GEMINI_VOICE_BY_LOCALE,
  type GeminiFunctionDeclaration,
  type GeminiLiveConfig,
  type GeminiVoiceSessionConfig,
  type Locale,
} from '@fiestapay/shared';
import type { GeminiConfig } from '../config.js';
import { unavailable } from '../errors.js';
import type { FunctionDeclaration } from './tools.js';

/** JSON-schema values in Gemini REST form (OBJECT, STRING, INTEGER, ...). */
function uppercaseTypes(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(uppercaseTypes);
  if (!node || typeof node !== 'object') return node;
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === 'additionalProperties') continue;
    if (key === 'type' && typeof value === 'string') {
      output.type = value.toUpperCase();
    } else if (key === 'properties' && value && typeof value === 'object' && !Array.isArray(value)) {
      output.properties = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([name, schema]) => [name, uppercaseTypes(schema)]),
      );
    } else {
      output[key] = uppercaseTypes(value);
    }
  }
  return output;
}

/** Current server tool declarations to the exact declarations locked into the token. */
export function toGeminiVoiceDeclarations(declarations: FunctionDeclaration[]): GeminiFunctionDeclaration[] {
  return declarations.map((declaration) => ({
    name: declaration.name,
    description: declaration.description,
    ...(declaration.parameters
      ? {
          parameters: {
            type: 'OBJECT' as const,
            properties: (uppercaseTypes(declaration.parameters.properties) ?? {}) as Record<string, unknown>,
            ...(declaration.parameters.required ? { required: declaration.parameters.required } : {}),
          },
        }
      : {}),
  }));
}

/** The exact LiveConnectConfig the ephemeral token locks. The browser passes it verbatim. */
export function buildGeminiLiveConfig(
  locale: Locale,
  systemInstruction: string,
  tools: GeminiFunctionDeclaration[],
): GeminiLiveConfig {
  return {
    responseModalities: ['AUDIO'],
    systemInstruction,
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_VOICE_BY_LOCALE[locale] } } },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    // Public informational voice has no tools; guest and organizer get their current set.
    tools: tools.length > 0 ? [{ functionDeclarations: tools }] : [],
  };
}

export interface GeminiVoiceTokenRequest {
  apiKey: string;
  model: string;
  liveConfig: GeminiLiveConfig;
  uses: 1;
  newSessionExpireTime: string;
  expireTime: string;
}

/** Test seam: receives the complete locked request and returns the ephemeral token name. */
export type CreateGeminiVoiceTokenFn = (request: GeminiVoiceTokenRequest) => Promise<string>;

/**
 * Default seam: one single-use ephemeral token through the official SDK. Without
 * lockAdditionalFields every LiveConnectConfig field is locked, so a modified browser copy
 * cannot change tools, voice or instruction. Failures surface as an error with no body or key.
 */
export async function createGeminiVoiceToken(request: GeminiVoiceTokenRequest): Promise<string> {
  const ai = new GoogleGenAI({
    apiKey: request.apiKey,
    httpOptions: { apiVersion: GEMINI_LIVE_API_VERSION },
  });
  const token = await ai.authTokens.create({
    config: {
      uses: request.uses,
      newSessionExpireTime: request.newSessionExpireTime,
      expireTime: request.expireTime,
      // The runtime object is the contract's GeminiLiveConfig; the SDK's enum typing differs.
      liveConnectConstraints: { model: request.model, config: request.liveConfig as unknown as LiveConnectConfig },
      // Deliberately absent: with no lockAdditionalFields every config field is locked.
      httpOptions: { apiVersion: GEMINI_LIVE_API_VERSION },
    },
  });
  if (typeof token.name !== 'string' || token.name.length === 0) {
    throw new Error('Gemini did not return an auth token name');
  }
  return token.name;
}

export interface GeminiVoiceSetup {
  locale: Locale;
  maxSeconds: number;
  systemInstruction: string;
  kickoff: string;
  tools: GeminiFunctionDeclaration[];
}

export interface GeminiVoiceSession {
  token: string;
  sessionConfig: GeminiVoiceSessionConfig;
}

/**
 * Builds the session config the browser will use and requests the matching ephemeral token.
 * Any provider failure is the existing bilingual 503; the key, request and body never leak.
 */
export async function createGeminiVoiceSession(
  gemini: GeminiConfig,
  createToken: CreateGeminiVoiceTokenFn,
  setup: GeminiVoiceSetup,
): Promise<GeminiVoiceSession> {
  const now = Date.now();
  const liveConfig = buildGeminiLiveConfig(setup.locale, setup.systemInstruction, setup.tools);
  const sessionConfig: GeminiVoiceSessionConfig = {
    provider: 'gemini',
    model: gemini.liveModel,
    apiVersion: GEMINI_LIVE_API_VERSION,
    liveConfig,
    kickoff: setup.kickoff,
    locale: setup.locale,
  };
  const request: GeminiVoiceTokenRequest = {
    apiKey: gemini.apiKey,
    model: gemini.liveModel,
    liveConfig,
    uses: 1,
    newSessionExpireTime: new Date(now + 60_000).toISOString(),
    expireTime: new Date(now + (setup.maxSeconds + 30) * 1000).toISOString(),
  };

  try {
    const token = await createToken(request);
    return { token, sessionConfig };
  } catch {
    throw unavailable(setup.locale === 'en'
      ? 'Could not start voice. Continue by text'
      : 'No se pudo iniciar la voz. Continúa por texto');
  }
}
