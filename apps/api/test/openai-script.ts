import type {
  OpenAIFunctionCallItem,
  OpenAIMessageItem,
  OpenAIOutputItem,
  OpenAIReasoningItem,
  RespondFn,
  RespondInput,
  RespondOutput,
} from '../src/ai/openai.js';

export const reasoning = (id: string, encrypted: string): OpenAIReasoningItem => ({
  type: 'reasoning',
  id,
  encrypted_content: encrypted,
  summary: [],
});

export const fnCall = (callId: string, name: string, args = '{}', id?: string): OpenAIFunctionCallItem => ({
  type: 'function_call',
  ...(id ? { id } : {}),
  call_id: callId,
  name,
  arguments: args,
});

export const message = (text: string): OpenAIMessageItem => ({
  type: 'message',
  role: 'assistant',
  status: 'completed',
  content: [{ type: 'output_text', text, annotations: [] }],
});

export const completed = (...items: OpenAIOutputItem[]): RespondOutput => ({ status: 'completed', items });

/** Scripted Responses model: returns queued outputs in order, repeating the last one. */
export function scriptedOpenAI(turns: RespondOutput[]): { respond: RespondFn; inputs: RespondInput[] } {
  const inputs: RespondInput[] = [];
  let index = 0;
  const respond: RespondFn = async (_config, input) => {
    // Snapshot: the caller rebuilds input each round, but keep tests independent of that.
    inputs.push(structuredClone(input));
    const turn = turns[Math.min(index, turns.length - 1)]!;
    index += 1;
    return turn;
  };
  return { respond, inputs };
}
