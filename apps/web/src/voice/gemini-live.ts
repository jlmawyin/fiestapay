// Isolated Gemini Live transport for the voice panel.
// The component consumes only GeminiLiveConnector / GeminiLiveSessionHandle,
// so tests can substitute a fake without touching the network. The ephemeral
// token is never logged.

import { GoogleGenAI } from '@google/genai';
import type { GeminiVoiceSessionConfig } from '@fiestapay/shared';

/** Microphone wire format: base64 PCM16 LE 16 kHz. */
export const GEMINI_INPUT_SAMPLE_RATE = 16000;
export const GEMINI_INPUT_MIME = 'audio/pcm;rate=16000';
/** Model audio output: base64 PCM16 LE 24 kHz (same rate as PlaybackQueue). */
export const GEMINI_OUTPUT_SAMPLE_RATE = 24000;

export interface GeminiLiveFunctionCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface GeminiLiveToolResponse {
  id: string;
  name: string;
  response: Record<string, unknown>;
}

export interface GeminiLiveCallbacks {
  onOpen?: () => void;
  onAudio?: (base64Pcm16: string, mimeType?: string) => void;
  onInputTranscript?: (text: string, finished?: boolean) => void;
  onOutputTranscript?: (text: string, finished?: boolean) => void;
  onInterrupted?: () => void;
  onTurnComplete?: () => void;
  onToolCalls?: (calls: GeminiLiveFunctionCall[]) => void;
  onToolCallCancellation?: (ids: string[]) => void;
  onGoAway?: () => void;
  onError?: (error: unknown) => void;
  onClose?: (event?: unknown) => void;
}

export interface GeminiLiveSessionHandle {
  sendAudio: (base64Pcm16: string) => void;
  endAudioStream?: () => void;
  sendKickoff: (text: string) => void;
  sendToolResponse: (responses: GeminiLiveToolResponse[]) => void;
  close: () => void;
  readonly closed: boolean;
}

export interface GeminiLiveConnectOptions {
  token: string;
  model: string;
  apiVersion: string;
  liveConfig: unknown;
  callbacks: GeminiLiveCallbacks;
}

export type GeminiLiveConnector = (options: GeminiLiveConnectOptions) => Promise<GeminiLiveSessionHandle>;

/** True when the locked live config declares a function tool (e.g. the guide switch). */
export function liveConfigHasTool(liveConfig: unknown, toolName: string): boolean {
  if (!liveConfig || typeof liveConfig !== 'object') return false;
  const tools = (liveConfig as { tools?: unknown }).tools;
  if (!Array.isArray(tools)) return false;
  for (const group of tools) {
    if (!group || typeof group !== 'object') continue;
    const declarations = (group as { functionDeclarations?: unknown }).functionDeclarations;
    if (!Array.isArray(declarations)) continue;
    for (const declaration of declarations) {
      if (
        declaration &&
        typeof declaration === 'object' &&
        (declaration as { name?: unknown }).name === toolName
      ) {
        return true;
      }
    }
  }
  return false;
}

/** Validates the server locked session object. Null means the token is unusable. */
export function asGeminiSessionConfig(raw: unknown): GeminiVoiceSessionConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Record<string, unknown>;
  if (candidate.provider !== 'gemini') return null;
  if (typeof candidate.model !== 'string' || candidate.model.length === 0) return null;
  if (typeof candidate.apiVersion !== 'string' || candidate.apiVersion.length === 0) return null;
  if (!candidate.liveConfig || typeof candidate.liveConfig !== 'object') return null;
  if (typeof candidate.kickoff !== 'string' || candidate.kickoff.length === 0) return null;
  return candidate as unknown as GeminiVoiceSessionConfig;
}

function toFunctionCalls(raw: unknown): GeminiLiveFunctionCall[] {
  if (!Array.isArray(raw)) return [];
  const out: GeminiLiveFunctionCall[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const call = item as { id?: unknown; name?: unknown; args?: unknown };
    if (typeof call.name !== 'string' || call.name.length === 0) continue;
    out.push({
      id: typeof call.id === 'string' ? call.id : '',
      name: call.name,
      args: call.args && typeof call.args === 'object' && !Array.isArray(call.args)
        ? (call.args as Record<string, unknown>)
        : {},
    });
  }
  return out;
}

function emitTranscripts(serverContent: Record<string, unknown>, callbacks: GeminiLiveCallbacks): void {
  const input = serverContent.inputTranscription as { text?: unknown; finished?: unknown } | undefined;
  if (input && typeof input.text === 'string' && input.text.length > 0) {
    callbacks.onInputTranscript?.(input.text, input.finished === true);
  }
  const interim = serverContent.interimInputTranscription as { text?: unknown; finished?: unknown } | undefined;
  if (interim && typeof interim.text === 'string' && interim.text.length > 0) {
    callbacks.onInputTranscript?.(interim.text, interim.finished === true);
  }
  const output = serverContent.outputTranscription as { text?: unknown; finished?: unknown } | undefined;
  if (output && typeof output.text === 'string' && output.text.length > 0) {
    callbacks.onOutputTranscript?.(output.text, output.finished === true);
  }
}

function handleMessage(message: unknown, callbacks: GeminiLiveCallbacks): void {
  if (!message || typeof message !== 'object') return;
  const msg = message as Record<string, unknown>;
  if (msg.goAway !== undefined && msg.goAway !== null) {
    callbacks.onGoAway?.();
  }
  const toolCall = msg.toolCall as { functionCalls?: unknown } | undefined;
  if (toolCall && typeof toolCall === 'object') {
    const calls = toFunctionCalls(toolCall.functionCalls);
    if (calls.length > 0) callbacks.onToolCalls?.(calls);
  }
  const cancellation = msg.toolCallCancellation as { ids?: unknown } | undefined;
  if (cancellation && typeof cancellation === 'object' && Array.isArray(cancellation.ids)) {
    const ids = cancellation.ids.filter((id): id is string => typeof id === 'string');
    if (ids.length > 0) callbacks.onToolCallCancellation?.(ids);
  }
  const serverContent = msg.serverContent as Record<string, unknown> | undefined;
  if (!serverContent || typeof serverContent !== 'object') return;
  if (serverContent.interrupted === true) {
    callbacks.onInterrupted?.();
  }
  const modelTurn = serverContent.modelTurn as { parts?: unknown } | undefined;
  if (modelTurn && typeof modelTurn === 'object' && Array.isArray(modelTurn.parts)) {
    for (const part of modelTurn.parts) {
      if (!part || typeof part !== 'object') continue;
      const inline = (part as { inlineData?: unknown }).inlineData as
        | { data?: unknown; mimeType?: unknown }
        | undefined;
      if (inline && typeof inline.data === 'string' && inline.data.length > 0) {
        callbacks.onAudio?.(inline.data, typeof inline.mimeType === 'string' ? inline.mimeType : undefined);
      }
    }
  }
  emitTranscripts(serverContent, callbacks);
  if (serverContent.turnComplete === true) {
    callbacks.onTurnComplete?.();
  }
}

export function formatKickoffTurn(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  const isEnglish = /^(?:hi|welcome|organizer)\b/i.test(trimmed);
  if (isEnglish) {
    return [
      'VOICE SESSION START INSTRUCTION (do not roleplay the user or switch voices):',
      'Speak aloud ONLY the exact greeting below in your single assistant voice, then STOP immediately and wait in silence for the person to speak.',
      'NEVER answer your own question, NEVER invent or simulate the user\'s party or reply, NEVER call tools during this greeting, and NEVER use a second voice or perform a two-person dialogue.',
      `Exact greeting to speak: "${trimmed}"`,
    ].join('\n');
  }
  return [
    'INSTRUCCIÓN DE INICIO DE VOZ (no simules al usuario ni cambies de voz):',
    'Pronuncia en voz alta ÚNICAMENTE el saludo exacto de abajo con tu única voz de asistente y luego DETENTE de inmediato en silencio esperando a que la persona hable.',
    'PROHIBIDO responder a tu propia pregunta, PROHIBIDO inventar o simular la fiesta o la respuesta de la persona, PROHIBIDO llamar herramientas en este saludo inicial y PROHIBIDO usar una segunda voz o hacer un diálogo entre dos personas.',
    `Saludo exacto a pronunciar: «${trimmed}»`,
  ].join('\n');
}

export const connectGeminiLive: GeminiLiveConnector = async ({
  token,
  model,
  apiVersion,
  liveConfig,
  callbacks,
}) => {
  const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion } });
  let closed = false;
  let opened = false;
  const fireOpen = () => {
    if (opened) return;
    opened = true;
    callbacks.onOpen?.();
  };
  const session = await ai.live.connect({
    model,
    config: liveConfig as never,
    callbacks: {
      onopen: () => {
        fireOpen();
      },
      onmessage: (message: unknown) => {
        handleMessage(message, callbacks);
      },
      onerror: (event: unknown) => {
        callbacks.onError?.(event);
      },
      onclose: (event: unknown) => {
        closed = true;
        callbacks.onClose?.(event);
      },
    },
  });
  // The promise resolves once the session exists; onopen may arrive just
  // after. The guard keeps exactly one open signal either way.
  fireOpen();
  return {
    sendAudio: (base64Pcm16: string) => {
      if (closed) return;
      session.sendRealtimeInput({ audio: { data: base64Pcm16, mimeType: GEMINI_INPUT_MIME } });
    },
    endAudioStream: () => {
      if (!closed) session.sendRealtimeInput({ audioStreamEnd: true });
    },
    sendKickoff: (text: string) => {
      if (closed) return;
      session.sendClientContent({
        turns: [{ role: 'user', parts: [{ text: formatKickoffTurn(text) }] }],
        turnComplete: true,
      });
    },
    sendToolResponse: (responses: GeminiLiveToolResponse[]) => {
      if (closed || responses.length === 0) return;
      session.sendToolResponse({
        functionResponses: responses.map((item) => ({
          id: item.id,
          name: item.name,
          response: item.response,
        })),
      });
    },
    close: () => {
      if (closed) return;
      closed = true;
      try {
        session.close();
      } catch {
        // A closing session never throws to the caller.
      }
    },
    get closed() {
      return closed;
    },
  };
};
