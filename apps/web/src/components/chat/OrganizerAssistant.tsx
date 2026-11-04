import type { Capabilities } from '../../types';
import { ChatAssistant } from './ChatAssistant';
import { VoiceInvitationAgent } from '../voice/VoiceInvitationAgent';

interface OrganizerAssistantProps {
  slug: string;
  capabilities: Capabilities | null;
  onShowToast?: (type: 'success' | 'error' | 'info' | 'warning', message: string, title?: string) => void;
}

/** Panel assistant. Text and voice both require the organizer key on their own routes. */
export function OrganizerAssistant({ slug, capabilities, onShowToast = () => {} }: OrganizerAssistantProps) {
  return (
    <>
      <ChatAssistant slug={slug} capabilities={capabilities} audience="organizer" />
      <VoiceInvitationAgent
        slug={slug}
        capabilities={capabilities}
        guest={null}
        audience="organizer"
        onShowToast={onShowToast}
      />
    </>
  );
}
