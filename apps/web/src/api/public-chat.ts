import type { AssistantContext, PublicChatResult } from '@fiestapay/shared';
import { isDraftEventProposal } from '../lib/draft-proposal';
import { AI_REQUEST_TIMEOUT_MS, request } from './client';

interface PublicChatResponse {
  text: string;
  draft?: unknown;
}

/**
 * The public channel sends exactly one question with the 55 s AI budget; the
 * API answers before 45 s. This path is not an organizer route, so no admin
 * key is attached. `context` keeps landing and demo apart on the server and
 * is omitted when the caller does not name a context.
 *
 * Old servers answered only `{ text }`; that still works. A malformed `draft`
 * is ignored instead of being handed to the create wizard.
 */
export async function sendPublicChat(
  message: string,
  context?: AssistantContext,
): Promise<PublicChatResult> {
  const response = await request<PublicChatResponse>('/api/chat/public', {
    method: 'POST',
    body: JSON.stringify(context === undefined ? { message } : { message, context }),
    timeoutMs: AI_REQUEST_TIMEOUT_MS,
  });
  if (!response || typeof response.text !== 'string' || response.text.trim().length === 0) {
    throw new Error('El chat público devolvió una respuesta vacía.');
  }
  if (response.draft !== undefined && isDraftEventProposal(response.draft)) {
    return { text: response.text, draft: response.draft };
  }
  return { text: response.text };
}
