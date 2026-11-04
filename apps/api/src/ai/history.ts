import type { OpenAIItem } from './openai.js';

/** Roles as persisted. `function` holds tool outputs and is not shown as chat text. */
export type HistoryRole = 'user' | 'model' | 'function';

/**
 * Persisted chat part. New user turns store `{text}`. New model and function turns store one
 * OpenAI item under `openai`. Older rows may still carry `thought`, `thoughtSignature`,
 * `functionCall`, or `functionResponse`. Those keys stay readable and are not replayed.
 */
export interface StoredPart {
  text?: string;
  /** Legacy thought summaries are excluded from visible text. */
  thought?: boolean;
  /** Legacy signature. Never forwarded to the model or a transcript. */
  thoughtSignature?: string;
  /** Legacy tool call. Not executed on replay. */
  functionCall?: { id?: string; name?: string; args?: unknown };
  /** Legacy tool result. Not replayed. */
  functionResponse?: { id?: string; name?: string; response?: Record<string, unknown> };
  openai?: OpenAIItem;
}

export interface StoredTurn {
  role: HistoryRole;
  parts: StoredPart[];
}

export const isOpenAITurn = (turn: StoredTurn): boolean => turn.parts.some((part) => part.openai !== undefined);

/** Visible text. Thought summaries and non-text payloads are excluded. */
export const visibleText = (parts: StoredPart[]): string =>
  parts
    .map((part) => (typeof part.text === 'string' && part.thought !== true ? part.text : ''))
    .join('')
    .trim();
