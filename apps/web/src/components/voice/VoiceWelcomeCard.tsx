import React, { useState } from 'react';
import { useMessages } from '../../i18n/I18nContext';
import { voiceCatalog } from '../../i18n/messages/voice';
import { ASSISTANT_VOICE_OPEN_EVENT } from '../assistant/AssistantOrb';

/** Per-tab dismissal: a new tab shows the card again. */
const DISMISS_KEY = 'fp_voice_welcome_dismissed';

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * FP-WELCOME-1 voice welcome card, shown under the headline on the landing and
 * the judges demo. A visible card, never a modal: it never blocks the page.
 * The accept click, with the consent line visible next to it, is the explicit
 * consent that opens the orb in voice mode and starts one public session.
 * The example phrases are plain labels; only the accept button starts voice.
 */
export const VoiceWelcomeCard: React.FC = () => {
  const m = useMessages(voiceCatalog);
  const [dismissed, setDismissed] = useState(readDismissed);

  if (dismissed) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // The card still hides for this render without the per-tab memory.
    }
    setDismissed(true);
  };

  const accept = () => {
    try {
      document.dispatchEvent(new CustomEvent(ASSISTANT_VOICE_OPEN_EVENT));
    } catch {
      // The orb listens for this event; a failed dispatch starts nothing.
    }
  };

  return (
    <section
      aria-label={m.welcomeTitle}
      data-testid="voice-welcome-card"
      style={{
        backgroundColor: '#FFFFFF',
        border: '1.5px solid var(--color-teal)',
        borderRadius: 'var(--radius-lg)',
        padding: '1rem 1.1rem',
        boxShadow: 'var(--shadow-md)',
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
        <h2 style={{ fontSize: '1.05rem', margin: 0 }}>{m.welcomeTitle}</h2>
        <button
          type="button"
          onClick={dismiss}
          aria-label={m.welcomeDismiss}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            lineHeight: 1,
            padding: '0.2rem',
            fontSize: '1.1rem',
            color: 'var(--color-ink-muted)',
            flex: '0 0 auto',
          }}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <p style={{ margin: '0.5rem 0', fontSize: '0.9rem', color: 'var(--color-ink)' }}>{m.welcomeLead}</p>
      <ul style={{ listStyle: 'none', display: 'flex', gap: '0.4rem', flexWrap: 'wrap', padding: 0, margin: '0 0 0.85rem' }}>
        {[m.welcomeEx1, m.welcomeEx2, m.welcomeEx3].map((example) => (
          <li key={example}>
            <span className="badge badge-teal">{example}</span>
          </li>
        ))}
      </ul>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap' }}>
        <button type="button" onClick={accept} className="btn btn-primary">
          {m.welcomeAccept}
        </button>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-ink-muted)', maxWidth: '420px' }}>
          {m.welcomeConsent}
        </span>
      </div>
    </section>
  );
};
