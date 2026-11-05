import type { Capabilities } from '../../types';
import { AssistantOrb } from '../assistant/AssistantOrb';

interface OrganizerAssistantProps {
  slug: string;
  capabilities: Capabilities | null;
  onShowToast?: (type: 'success' | 'error' | 'info' | 'warning', message: string, title?: string) => void;
}

/**
 * Panel assistant: one orb, with the same keyed guest/organizer routes behind it.
 * The key scopes text and voice history to this organizer slug so a dashboard navigation
 * can never carry a private conversation into another event.
 */
export function OrganizerAssistant({ slug, capabilities, onShowToast = () => {} }: OrganizerAssistantProps) {
  return (
    <AssistantOrb
      key={`organizer:${slug}`}
      audience="organizer"
      slug={slug}
      capabilities={capabilities}
      guest={null}
      onShowToast={onShowToast}
    />
  );
}
