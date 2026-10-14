import type { GeminiConfig } from '../config.js';
import { unavailable } from '../errors.js';
import type { FunctionDeclaration } from './tools.js';

export interface GeminiFunctionCall {
  id?: string;
  name: string;
  args?: unknown;
}

export interface GeminiPart {
  thoughtSignature?: string;
  text?: string;
  functionCall?: GeminiFunctionCall;
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> };
}

/** Roles as persisted. `function` is sent to the API as a user turn carrying functionResponse. */
export type HistoryRole = 'user' | 'model' | 'function';

export interface HistoryTurn {
  role: HistoryRole;
  parts: GeminiPart[];
}

interface GeminiResponse {
  candidates?: { content?: { role?: string; parts?: GeminiPart[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

export interface GenerateInput {
  systemInstruction: string;
  history: HistoryTurn[];
  declarations: FunctionDeclaration[];
}

export interface GenerateOutput {
  parts: GeminiPart[];
  finishReason: string | null;
}

/** Seam for tests: a scripted model can replace the HTTP round trip. */
export type GenerateFn = (config: GeminiConfig, input: GenerateInput) => Promise<GenerateOutput>;

const apiRole = (role: HistoryRole): 'user' | 'model' => (role === 'model' ? 'model' : 'user');

export const textOf = (parts: GeminiPart[]): string =>
  parts
    .map((p) => (typeof p.text === 'string' ? p.text : ''))
    .join('')
    .trim();

export const callsOf = (parts: GeminiPart[]): GeminiFunctionCall[] =>
  parts.flatMap((p) => (p.functionCall && typeof p.functionCall.name === 'string' ? [p.functionCall] : []));

/**
 * One `generateContent` round against the Gemini REST API with native function calling. The key
 * travels in a header (never a URL) and never leaves the server; errors are reported without
 * echoing request contents.
 */
export async function generateContent(config: GeminiConfig, input: GenerateInput): Promise<GenerateOutput> {
  const url = `${config.baseUrl}/models/${encodeURIComponent(config.model)}:generateContent`;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: input.systemInstruction }] },
    contents: input.history.map((turn) => ({ role: apiRole(turn.role), parts: turn.parts })),
    tools: [{ functionDeclarations: input.declarations }],
    toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
    generationConfig: { temperature: 0.2, maxOutputTokens: 800, candidateCount: 1 },
  });

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': config.apiKey,
      },
      body,
      signal: AbortSignal.timeout(config.timeoutMs),
    });
  } catch {
    throw unavailable('El asistente no respondio a tiempo; usa los formularios de la pagina');
  }

  const text = await response.text();
  if (!response.ok) {
    // Status only: the body can echo prompt content and provider detail.
    throw unavailable(`El asistente no esta disponible (proveedor respondio ${response.status})`);
  }

  let parsed: GeminiResponse;
  try {
    parsed = JSON.parse(text) as GeminiResponse;
  } catch {
    throw unavailable('El asistente devolvio una respuesta ilegible');
  }

  if (parsed.promptFeedback?.blockReason) {
    return { parts: [], finishReason: `BLOCKED_${parsed.promptFeedback.blockReason}` };
  }
  const candidate = parsed.candidates?.[0];
  const parts = Array.isArray(candidate?.content?.parts) ? candidate!.content!.parts! : [];
  return { parts, finishReason: candidate?.finishReason ?? null };
}
