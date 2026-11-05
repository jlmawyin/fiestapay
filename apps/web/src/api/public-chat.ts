import { request } from './client';

interface PublicChatResponse {
  text: string;
}

/**
 * The public channel sends exactly one question. The shared request helper adds the 30s
 * timeout; this path is not an organizer route, so no admin key is attached.
 */
export async function sendPublicChat(message: string): Promise<string> {
  const response = await request<PublicChatResponse>('/api/chat/public', {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
  if (!response || typeof response.text !== 'string' || response.text.trim().length === 0) {
    throw new Error('El chat público devolvió una respuesta vacía.');
  }
  return response.text;
}
