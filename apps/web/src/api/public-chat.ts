import type { AssistantContext } from '@fiestapay/shared';
import { request } from './client';

interface PublicChatResponse {
  text: string;
}

/**
 * The public channel sends exactly one question. The shared request helper adds the 30s
 * timeout; this path is not an organizer route, so no admin key is attached.
 * `context` keeps the landing and demo conversations separate on the server.
 * It is omitted when the caller does not name a context.
 */
export async function sendPublicChat(message: string, context?: AssistantContext): Promise<string> {
  const response = await request<PublicChatResponse>('/api/chat/public', {
    method: 'POST',
    body: JSON.stringify(context === undefined ? { message } : { message, context }),
  });
  if (!response || typeof response.text !== 'string' || response.text.trim().length === 0) {
    throw new Error('El chat público devolvió una respuesta vacía.');
  }
  return response.text;
}
