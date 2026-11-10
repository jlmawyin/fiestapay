import type { GeminiConfig, OpenAIConfig } from '../config.js';
import { annotateHttpError, unavailable } from '../errors.js';
import { isOpenAITurn, visibleText, type StoredTurn } from './history.js';
import { isAbortLike, safeReason, textCallSignal } from './deadlines.js';
import type { FunctionDeclaration } from './tools.js';

export interface OpenAIReasoningItem {
  type: 'reasoning';
  id: string;
  /** Opaque and encrypted by the provider; lets a stateless (store:false) call keep its reasoning. */
  encrypted_content: string;
  summary: unknown[];
}

export interface OpenAIFunctionCallItem {
  type: 'function_call';
  id?: string;
  call_id: string;
  name: string;
  /** JSON text produced by the model; parsed and validated before any tool runs. */
  arguments: string;
  /**
   * Opaque Gemini thought signature attached to this functionCall part. It is stored and
   * replayed exactly as received; an older turn without it is replayed as visible text only.
   */
  gemini_signature?: string;
}

export type OpenAIMessageContent =
  | { type: 'output_text'; text: string; annotations: unknown[] }
  | { type: 'refusal'; refusal: string };

export interface OpenAIMessageItem {
  type: 'message';
  role: 'assistant';
  id?: string;
  status: 'completed';
  content: OpenAIMessageContent[];
  /** Optional Gemini signature on the last text part; replay is recommended, not validated. */
  gemini_signature?: string;
}

export interface OpenAIFunctionOutputItem {
  type: 'function_call_output';
  call_id: string;
  output: string;
}

export type OpenAIOutputItem = OpenAIReasoningItem | OpenAIFunctionCallItem | OpenAIMessageItem;
export type OpenAIItem = OpenAIOutputItem | OpenAIFunctionOutputItem;

/** Plain conversational message, used for user turns and for text carried over from legacy rows. */
export interface OpenAITextMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type OpenAIInputItem = OpenAIItem | OpenAITextMessage;

export interface OpenAITool {
  type: 'function';
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: false;
  };
  strict: true;
}

export interface RespondInput {
  instructions: string;
  input: OpenAIInputItem[];
  tools: OpenAITool[];
  /** Shared 40 s request deadline. Optional so existing test doubles stay assignable. */
  signal?: AbortSignal;
}

/**
 * Attaches the shared deadline without making it enumerable. Existing test seams clone the
 * request with structuredClone, which cannot serialize an AbortSignal; a non-enumerable property
 * still lets production adapters and tests read input.signal.
 */
export function withRespondSignal(input: RespondInput, signal?: AbortSignal): RespondInput {
  if (signal) {
    Object.defineProperty(input, 'signal', { value: signal, enumerable: false, configurable: true });
  }
  return input;
}

export interface RespondOutput {
  /** Empty when the response was incomplete: nothing from it is stored or executed. */
  items: OpenAIOutputItem[];
  status: 'completed' | 'incomplete';
  /** Safe provider finish reason, used only for the server log (for example MAX_TOKENS). */
  incompleteReason?: string;
}

/**
 * Seam for tests: a scripted model can replace the HTTP round trip. The bivariant form lets
 * the OpenAI and Gemini production functions, and existing scripts typed for OpenAIConfig,
 * stay assignable while each provider receives its own configuration object.
 */
export type RespondFn = {
  bivarianceHack(config: OpenAIConfig | GeminiConfig, input: RespondInput): Promise<RespondOutput>;
}['bivarianceHack'];

/** Arguments longer than this are refused without parsing. */
const MAX_ARGUMENT_CHARS = 2000;

const NO_ANSWER = 'El asistente no respondio a tiempo; usa los formularios de la pagina';
const UNREADABLE = 'El asistente devolvio una respuesta ilegible';
const FAILED = 'El asistente no pudo completar la respuesta; usa los formularios de la pagina';

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** Authorized tools in the strict Responses format. */
export function toOpenAITools(declarations: FunctionDeclaration[]): OpenAITool[] {
  return declarations.map((d): OpenAITool => ({
    type: 'function',
    name: d.name,
    description: d.description,
    parameters: {
      type: 'object',
      properties: d.parameters?.properties ?? {},
      required: d.parameters?.required ?? [],
      additionalProperties: false,
    },
    strict: true,
  }));
}

export const openaiTextOf = (items: OpenAIItem[]): string =>
  items
    .flatMap((item) =>
      item.type === 'message'
        ? item.content.map((c) => (c.type === 'output_text' ? c.text : c.refusal))
        : [],
    )
    .join('')
    .trim();

export interface ParsedCall {
  id: string;
  name: string;
  args: unknown;
  /** False when the argument text is not a JSON object; such a call is answered, never run. */
  argsValid: boolean;
}

function parseArguments(raw: string): { args: unknown; valid: boolean } {
  if (raw.length > MAX_ARGUMENT_CHARS) return { args: undefined, valid: false };
  if (raw.trim().length === 0) return { args: {}, valid: true };
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? { args: value, valid: true }
      : { args: undefined, valid: false };
  } catch {
    return { args: undefined, valid: false };
  }
}

export const openaiCallsOf = (items: OpenAIItem[]): ParsedCall[] =>
  items.flatMap((item) => {
    if (item.type !== 'function_call' || !item.call_id) return [];
    const { args, valid } = parseArguments(item.arguments);
    return [{ id: item.call_id, name: item.name, args, argsValid: valid }];
  });

const outputsOf = (turn: StoredTurn | undefined): OpenAIFunctionOutputItem[] =>
  turn?.role === 'function'
    ? turn.parts.flatMap((p) => (p.openai?.type === 'function_call_output' ? [p.openai] : []))
    : [];

/**
 * Stored turns to Responses input. Own turns are replayed verbatim (reasoning included) only when
 * every function_call has its output in the next turn. Otherwise, and for legacy rows, only the
 * visible text survives. Outputs never appear without their call, so a truncated window cannot
 * produce orphan tool items, foreign signatures, or legacy function payloads.
 */
export function toOpenAIInput(turns: StoredTurn[]): OpenAIInputItem[] {
  const input: OpenAIInputItem[] = [];
  const pushText = (role: 'user' | 'assistant', text: string) => {
    if (text.length > 0) input.push({ role, content: text });
  };

  for (let i = 0; i < turns.length; i += 1) {
    const turn = turns[i]!;
    if (turn.role === 'user') {
      pushText('user', visibleText(turn.parts));
      continue;
    }
    // Function turns are consumed together with the model turn that requested them.
    if (turn.role === 'function') continue;
    if (!isOpenAITurn(turn)) {
      pushText('assistant', visibleText(turn.parts));
      continue;
    }

    const items = turn.parts.flatMap((p) => (p.openai && p.openai.type !== 'function_call_output' ? [p.openai] : []));
    const callIds = new Set(items.flatMap((item) => (item.type === 'function_call' ? [item.call_id] : [])));
    if (callIds.size === 0) {
      input.push(...items);
      continue;
    }
    const next = turns[i + 1];
    const outputs = outputsOf(next).filter((o) => callIds.has(o.call_id));
    const answered = new Set(outputs.map((o) => o.call_id));
    if ([...callIds].every((id) => answered.has(id))) {
      const seen = new Set<string>();
      input.push(...items, ...outputs.filter((o) => !seen.has(o.call_id) && seen.add(o.call_id)));
      i += 1;
    } else {
      pushText('assistant', openaiTextOf(items));
    }
  }
  return input;
}

/**
 * Keeps only the item types and fields this contract uses. A malformed function_call rejects the
 * whole response, so no partial set of calls is ever executed.
 */
export function sanitizeOutput(raw: unknown[]): OpenAIOutputItem[] {
  const items: OpenAIOutputItem[] = [];
  let reasoningDropped = false;

  for (const entry of raw) {
    const item = asRecord(entry);
    switch (item.type) {
      case 'reasoning': {
        const { id, encrypted_content: encrypted } = item;
        if (typeof id !== 'string' || typeof encrypted !== 'string') {
          reasoningDropped = true;
          break;
        }
        items.push({ type: 'reasoning', id, encrypted_content: encrypted, summary: [] });
        break;
      }
      case 'function_call': {
        const { call_id: callId, name, arguments: args, id, gemini_signature: signature } = item;
        if (typeof callId !== 'string' || callId.length === 0 || typeof name !== 'string' || typeof args !== 'string') {
          throw unavailable(UNREADABLE);
        }
        items.push({
          type: 'function_call',
          ...(typeof id === 'string' ? { id } : {}),
          call_id: callId,
          name,
          arguments: args,
          ...(typeof signature === 'string' && signature.length > 0 ? { gemini_signature: signature } : {}),
        });
        break;
      }
      case 'message': {
        if (item.role !== 'assistant') break;
        const content = (Array.isArray(item.content) ? item.content : []).flatMap((c): OpenAIMessageContent[] => {
          const part = asRecord(c);
          if (part.type === 'output_text' && typeof part.text === 'string') {
            return [{ type: 'output_text', text: part.text, annotations: [] }];
          }
          if (part.type === 'refusal' && typeof part.refusal === 'string') return [{ type: 'refusal', refusal: part.refusal }];
          return [];
        });
        if (content.length === 0) break;
        const { id, gemini_signature: signature } = item;
        items.push({
          type: 'message',
          role: 'assistant',
          ...(typeof id === 'string' ? { id } : {}),
          status: 'completed',
          content,
          ...(typeof signature === 'string' && signature.length > 0 ? { gemini_signature: signature } : {}),
        });
        break;
      }
      default:
        // Other output types (hosted tools and so on) are not part of this contract.
        break;
    }
  }

  // Without its reasoning item a call id would reference reasoning the provider cannot find.
  if (!reasoningDropped) return items;
  return items.map((item): OpenAIOutputItem => {
    if (item.type !== 'function_call') return item;
    const { call_id, name, arguments: args, gemini_signature: signature } = item;
    return {
      type: 'function_call',
      call_id,
      name,
      arguments: args,
      ...(signature ? { gemini_signature: signature } : {}),
    };
  });
}

export function parseResponse(raw: unknown): RespondOutput {
  const res = asRecord(raw);
  if (res.error !== undefined && res.error !== null) throw unavailable(FAILED, { logCause: 'unreadable' });
  if (res.status === 'incomplete') {
    const details = asRecord(res.incomplete_details);
    return { items: [], status: 'incomplete', incompleteReason: safeReason(details.reason) };
  }
  if (res.status !== 'completed') throw unavailable(FAILED, { logCause: 'unreadable' });
  if (!Array.isArray(res.output)) throw unavailable(UNREADABLE, { logCause: 'unreadable' });
  return { items: sanitizeOutput(res.output), status: 'completed' };
}

/**
 * One stateless Responses API round with function calling and low reasoning. The key travels only
 * in the Authorization header; errors report the status, never the body or the request.
 */
export async function createResponse(config: OpenAIConfig, input: RespondInput): Promise<RespondOutput> {
  const startedAt = Date.now();
  const body = JSON.stringify({
    model: config.model,
    instructions: input.instructions,
    input: input.input,
    tools: input.tools,
    tool_choice: 'auto',
    reasoning: { effort: config.reasoningEffort },
    max_output_tokens: config.maxOutputTokens,
    store: false,
    include: ['reasoning.encrypted_content'],
  });
  const signal = textCallSignal(config.timeoutMs, input.signal);

  let response: Response;
  let text: string;
  try {
    response = await fetch(`${config.baseUrl}/responses`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiKey}`,
      },
      body,
      signal,
    });
    text = await response.text();
  } catch (err) {
    throw unavailable(NO_ANSWER, {
      logCause: isAbortLike(err, signal) ? 'timeout' : 'unreadable',
      elapsedMs: Date.now() - startedAt,
    });
  }

  if (!response.ok) {
    // Status only: the body can echo prompt content and provider detail.
    throw unavailable(`El asistente no esta disponible (proveedor respondio ${response.status})`, {
      logCause: `http_${response.status}`,
      elapsedMs: Date.now() - startedAt,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw unavailable(UNREADABLE, { logCause: 'unreadable', elapsedMs: Date.now() - startedAt });
  }
  try {
    return parseResponse(parsed);
  } catch (err) {
    throw annotateHttpError(err, { logCause: 'unreadable', elapsedMs: Date.now() - startedAt });
  }
}
