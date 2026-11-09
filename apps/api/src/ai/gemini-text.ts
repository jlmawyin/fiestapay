import { randomUUID } from 'node:crypto';
import { GEMINI_LIVE_API_VERSION, type GeminiFunctionDeclaration } from '@fiestapay/shared';
import type { GeminiConfig } from '../config.js';
import { unavailable } from '../errors.js';
import type { StoredTurn } from './history.js';
import type { ProviderAdapter } from './chat.js';
import {
  openaiCallsOf,
  openaiTextOf,
  toOpenAITools,
  toOpenAIInput,
  type OpenAIFunctionCallItem,
  type OpenAIMessageItem,
  type OpenAIOutputItem,
  type OpenAIInputItem,
  type OpenAITool,
  type RespondFn,
  type RespondInput,
  type RespondOutput,
} from './openai.js';
import type { FunctionDeclaration } from './tools.js';

/**
 * Gemini's maxOutputTokens is a shared budget: it also counts reasoning tokens
 * (usageMetadata.thoughtsTokenCount). Every caller cap therefore means "visible text"; the
 * request adds this headroom so low-level thinking cannot consume the caller's budget and turn
 * an otherwise complete answer into finishReason MAX_TOKENS.
 */
export const GEMINI_THINKING_HEADROOM_TOKENS = 2048;

const NO_ANSWER = 'El asistente no respondio a tiempo; usa los formularios de la pagina';
const UNREADABLE = 'El asistente devolvio una respuesta ilegible';
const FAILED = 'El asistente no pudo completar la respuesta; usa los formularios de la pagina';

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

export interface GeminiTextBody {
  systemInstruction: { parts: Array<{ text: string }> };
  contents: unknown[];
  generationConfig: { maxOutputTokens: number; thinkingConfig: { thinkingLevel: 'low' } };
  tools?: Array<{ functionDeclarations: GeminiFunctionDeclaration[] }>;
  toolConfig?: { functionCallingConfig: { mode: 'AUTO' } };
}

interface GeminiPart {
  text?: string;
  thoughtSignature?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

/** JSON-schema types in the Gemini REST form: OBJECT, STRING, INTEGER, ... */
function uppercaseTypes(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(uppercaseTypes);
  if (!node || typeof node !== 'object') return node;
  const input = node as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
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

/** Server tool declarations converted to the contract's GeminiFunctionDeclaration shape. */
export function toGeminiFunctionDeclarations(declarations: FunctionDeclaration[]): GeminiFunctionDeclaration[] {
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

function toolsForGemini(tools: OpenAITool[]): GeminiFunctionDeclaration[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: {
      type: 'OBJECT' as const,
      properties: (uppercaseTypes(tool.parameters.properties) ?? {}) as Record<string, unknown>,
      ...(tool.parameters.required.length > 0 ? { required: tool.parameters.required } : {}),
    },
  }));
}

function responseObject(output: string): Record<string, unknown> {
  if (output.trim().length === 0) return {};
  try {
    const parsed: unknown = JSON.parse(output);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    return { result: parsed };
  } catch {
    return { result: output };
  }
}

function argumentsObject(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Provider-neutral Responses input to Gemini contents. Signed function calls and their answers
 * are replayed verbatim. A legacy function call without its signature is not sent back as a
 * call: only visible assistant text survives, which avoids a guaranteed 400 on Gemini 3.x.
 */
export function toGeminiContents(input: OpenAIInputItem[]): GeminiContent[] {
  const contents: GeminiContent[] = [];
  const categories: Array<'user' | 'output' | 'model'> = [];
  const callNames = new Map<string, string>();

  const push = (role: 'user' | 'model', category: 'user' | 'output' | 'model', part: GeminiPart) => {
    const last = contents[contents.length - 1];
    if (last && last.role === role && categories[categories.length - 1] === category) {
      last.parts.push(part);
      return;
    }
    contents.push({ role, parts: [part] });
    categories.push(category);
  };

  for (let index = 0; index < input.length; index += 1) {
    const item = asRecord(input[index]);
    switch (item.type) {
      case 'function_call': {
        // A parallel step has a signature only on its first call. Buffer the run: if no call
        // in the step carries a signature the whole legacy step is replayed as text only.
        const run: Array<Record<string, unknown>> = [];
        while (index < input.length && asRecord(input[index]).type === 'function_call') {
          run.push(asRecord(input[index]));
          index += 1;
        }
        index -= 1;
        const usable = run.filter((call) => typeof call.call_id === 'string' && typeof call.name === 'string' && typeof call.arguments === 'string');
        if (!usable.some((call) => typeof call.gemini_signature === 'string' && call.gemini_signature.length > 0)) break;
        for (const call of usable) {
          const callId = call.call_id as string;
          const name = call.name as string;
          callNames.set(callId, name);
          const signature = typeof call.gemini_signature === 'string' && call.gemini_signature.length > 0
            ? call.gemini_signature
            : undefined;
          push('model', 'model', {
            functionCall: { name, args: argumentsObject(call.arguments as string) },
            ...(signature ? { thoughtSignature: signature } : {}),
          });
        }
        break;
      }
      case 'function_call_output': {
        const callId = item.call_id;
        const output = item.output;
        if (typeof callId !== 'string' || typeof output !== 'string') break;
        const name = callNames.get(callId);
        if (!name) break;
        push('user', 'output', { functionResponse: { name, response: responseObject(output) } });
        break;
      }
      case 'message': {
        if (item.role !== 'assistant') break;
        const content = Array.isArray(item.content) ? item.content : [];
        const parts: GeminiPart[] = [];
        for (const raw of content) {
          const part = asRecord(raw);
          if (part.type === 'output_text' && typeof part.text === 'string') parts.push({ text: part.text });
          if (part.type === 'refusal' && typeof part.refusal === 'string') parts.push({ text: part.refusal });
        }
        if (parts.length === 0) break;
        const signature = item.gemini_signature;
        if (typeof signature === 'string' && signature.length > 0) parts[parts.length - 1]!.thoughtSignature = signature;
        for (const part of parts) push('model', 'model', part);
        break;
      }
      case 'reasoning':
        break;
      default:
        // Plain text user/assistant messages and legacy rows.
        if ((item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string' && item.content.length > 0) {
          const role = item.role === 'user' ? 'user' : 'model';
          push(role, role === 'user' ? 'user' : 'model', { text: item.content });
        }
        break;
    }
  }
  return contents;
}

export function geminiRequestBody(config: GeminiConfig, input: RespondInput): GeminiTextBody {
  const declarations = toolsForGemini(input.tools);
  return {
    systemInstruction: { parts: [{ text: input.instructions }] },
    contents: toGeminiContents(input.input),
    generationConfig: {
      // The caller cap is visible-text budget; reasoning gets its own headroom.
      maxOutputTokens: config.maxOutputTokens + GEMINI_THINKING_HEADROOM_TOKENS,
      // Gemini 3.x accepts a low thinking level; reasoning stays on but inexpensive.
      thinkingConfig: { thinkingLevel: 'low' },
    },
    ...(declarations.length > 0
      ? {
          tools: [{ functionDeclarations: declarations }],
          toolConfig: { functionCallingConfig: { mode: 'AUTO' as const } },
        }
      : {}),
  };
}

const INCOMPLETE_REASONS = new Set([
  'MAX_TOKENS',
  'SAFETY',
  'RECITATION',
  'BLOCKLIST',
  'PROHIBITED_CONTENT',
  'SPII',
  'IMAGE_SAFETY',
]);

/** Normalizes one generateContent answer to the shared output contract. Body text is never echoed. */
export function parseGeminiResponse(raw: unknown): RespondOutput {
  const res = asRecord(raw);
  if (res.error !== undefined && res.error !== null) throw unavailable(FAILED);
  const candidates = Array.isArray(res.candidates) ? res.candidates : [];
  const candidate = asRecord(candidates[0]);
  const finishReason = typeof candidate.finishReason === 'string' ? candidate.finishReason : '';
  if (finishReason && finishReason !== 'STOP') return { items: [], status: 'incomplete' };
  if (candidates.length === 0) throw unavailable(UNREADABLE);
  const content = asRecord(candidate.content);
  const parts = Array.isArray(content.parts) ? content.parts : [];
  if (parts.length === 0) {
    return finishReason === 'STOP' ? { items: [], status: 'completed' } : { items: [], status: 'incomplete' };
  }

  const items: OpenAIOutputItem[] = [];
  for (const rawPart of parts) {
    const part = asRecord(rawPart);
    if (part.thought === true) continue;
    const signatureRaw = typeof part.thoughtSignature === 'string' ? part.thoughtSignature : part.thought_signature;
    const signature = typeof signatureRaw === 'string' && signatureRaw.length > 0 ? signatureRaw : undefined;
    const call = asRecord(part.functionCall);
    if (typeof call.name === 'string' && call.name.length > 0) {
      const args = typeof call.args === 'string' ? argumentsObject(call.args) : asRecord(call.args);
      const item: OpenAIFunctionCallItem = {
        type: 'function_call',
        call_id: `call_${randomUUID()}`,
        name: call.name,
        arguments: JSON.stringify(args),
        ...(signature ? { gemini_signature: signature } : {}),
      };
      items.push(item);
      continue;
    }
    if (typeof part.text === 'string' && part.text.length > 0) {
      const item: OpenAIMessageItem = {
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text: part.text, annotations: [] }],
        ...(signature ? { gemini_signature: signature } : {}),
      };
      items.push(item);
    }
  }
  if (items.length === 0 && INCOMPLETE_REASONS.has(finishReason)) return { items: [], status: 'incomplete' };
  return { items, status: 'completed' };
}

/**
 * One stateless generateContent round. The key travels only in x-goog-api-key; an HTTP error
 * reports its status, never the provider body, request or key.
 */
export async function createGeminiResponse(config: GeminiConfig, input: RespondInput): Promise<RespondOutput> {
  const body = JSON.stringify(geminiRequestBody(config, input));
  const url = `https://generativelanguage.googleapis.com/${GEMINI_LIVE_API_VERSION}/models/${encodeURIComponent(config.textModel)}:generateContent`;

  let response: Response;
  let text: string;
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
    text = await response.text();
  } catch {
    throw unavailable(NO_ANSWER);
  }

  if (!response.ok) {
    // Status only: the body can echo prompt content and provider detail.
    throw unavailable(`El asistente no esta disponible (proveedor respondio ${response.status})`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw unavailable(UNREADABLE);
  }
  return parseGeminiResponse(parsed);
}

/** Gemini counterpart of openaiAdapter, with the same provider-neutral round contract. */
export function geminiAdapter(
  config: GeminiConfig,
  instruction: string,
  respond: RespondFn,
  declarations: FunctionDeclaration[],
): ProviderAdapter {
  const tools = toOpenAITools(declarations);
  return {
    maxToolRounds: config.maxToolRounds,
    async round(history: StoredTurn[]) {
      const output = await respond(config, {
        instructions: instruction,
        input: toOpenAIInput(history),
        tools,
      });
      if (output.status !== 'completed') return { turn: null, calls: [], text: '' };
      return {
        turn: output.items.length > 0 ? { role: 'model', parts: output.items.map((item) => ({ openai: item })) } : null,
        calls: openaiCallsOf(output.items),
        text: openaiTextOf(output.items),
      };
    },
    responses(answers) {
      return {
        role: 'function',
        parts: answers.map(({ call, response }) => ({
          openai: { type: 'function_call_output', call_id: call.id ?? '', output: JSON.stringify(response) },
        })),
      };
    },
  };
}
