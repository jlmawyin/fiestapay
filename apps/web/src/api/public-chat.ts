import type { AssistantContext } from '@fiestapay/shared';
import { AI_REQUEST_TIMEOUT_MS, request } from './client';

interface PublicChatResponse {
  text: string;
}

/**
 * The public channel sends exactly one question with the 55 s AI budget; the
 * API answers before 45 s. This path is not an organizer route, so no admin
 * key is attached. `context` keeps landing and demo apart on the server and
 * is omitted when the caller does not name a context.
 */
export async function sendPublicChat(message: string, context?: AssistantContext): Promise<string> {
  const response = await request<PublicChatResponse>('/api/chat/public', {
    method: 'POST',
    body: JSON.stringify(context === undefined ? { message } : { message, context }),
    timeoutMs: AI_REQUEST_TIMEOUT_MS,
  });
  if (!response || typeof response.text !== 'string' || response.text.trim().length === 0) {
    throw new Error('El chat público devolvió una respuesta vacía.');
  }
  return response.text;
}
