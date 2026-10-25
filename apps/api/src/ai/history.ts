import type { GeminiPart, HistoryRole } from './gemini.js';
import type { OpenAIItem } from './openai.js';

/**
 * A persisted chat part. User turns are provider neutral (`text`); model and function turns keep
 * the selected provider's native shape: Gemini parts as returned, or one OpenAI item per part
 * under `openai`. Each adapter replays its own turns verbatim and reduces foreign ones to text.
 */
export interface StoredPart extends GeminiPart {
  openai?: OpenAIItem;
}

export interface StoredTurn {
  role: HistoryRole;
  parts: StoredPart[];
}

export const isOpenAITurn = (turn: StoredTurn): boolean => turn.parts.some((p) => p.openai !== undefined);

/** Visible text of neutral or Gemini parts; Gemini thought summaries and signatures are excluded. */
export const visibleText = (parts: StoredPart[]): string =>
  parts
    .map((p) => (typeof p.text === 'string' && !('thought' in p && p.thought === true) ? p.text : ''))
    .join('')
    .trim();
