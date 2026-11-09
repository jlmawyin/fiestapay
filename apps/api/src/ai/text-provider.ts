import type { GeminiConfig, OpenAIConfig } from '../config.js';
import type { Config } from '../config.js';
import type { Locale } from '@fiestapay/shared';
import { unavailable } from '../errors.js';
import { createGeminiResponse } from './gemini-text.js';
import { createResponse, type RespondFn } from './openai.js';

/** Everything a text assistant needs after provider selection, without database or HTTP. */
export interface TextProviderSelection {
  provider: 'gemini' | 'openai';
  config: OpenAIConfig | GeminiConfig;
  maxHistoryMessages: number;
  maxOutputTokens: number;
  respond: RespondFn;
  /** Present only when the selected provider is Gemini. */
  gemini?: GeminiConfig;
  /** Present only when the selected provider is OpenAI. */
  openai?: OpenAIConfig;
}

/**
 * Resolves AI_TEXT_PROVIDER against the real configuration and the optional test seam.
 * An injected respond wins; the selected provider still supplies model, limits and config.
 * A missing key is a 503 with no secret, never a silent jump to another provider.
 */
export function selectTextProvider(
  config: Config,
  locale: Locale = 'es',
  injected?: RespondFn,
): TextProviderSelection {
  if (config.textProvider === 'gemini') {
    const gemini = config.gemini;
    if (!gemini) {
      throw unavailable(locale === 'en'
        ? 'The assistant is not configured'
        : (config.geminiDisabledReason ?? 'El asistente no esta configurado'));
    }
    return {
      provider: 'gemini',
      config: gemini,
      maxHistoryMessages: gemini.maxHistoryMessages,
      maxOutputTokens: gemini.maxOutputTokens,
      respond: injected ?? createGeminiResponse,
      gemini,
    };
  }

  const openai = config.openai;
  if (!openai) {
    throw unavailable(locale === 'en'
      ? 'The assistant is not configured'
      : (config.openaiDisabledReason ?? 'El asistente no esta configurado'));
  }
  return {
    provider: 'openai',
    config: openai,
    maxHistoryMessages: openai.maxHistoryMessages,
    maxOutputTokens: openai.maxOutputTokens,
    respond: injected ?? createResponse,
    openai,
  };
}
