import React, { useEffect, useState } from 'react';
import { Check, Copy, MessageCircle } from 'lucide-react';
import { useMessages } from '../../i18n/I18nContext';
import { dashboardCatalog } from '../../i18n/messages/organizerDashboard';
import { avatarCatalog } from '../../i18n/messages/avatar';
import {
  AVATAR_REMINDER_DRAFT_EVENT,
  consumeAvatarReminderDraft,
} from '../../components/avatar/reminderPrefill';
import { AVATAR_OPEN_EVENT } from '../../components/avatar/avatar-open';
import { whatsAppShareUrl } from '../../lib/event-presentation';

/**
 * NAP-F5b: borradores de recordatorio solo para el organizador, escritos por
 * la avatar Napster. El organizador abre la avatar (montada en el panel),
 * pide un recordatorio y la tool `draft_reminder` deja el texto abajo. Lo
 * copia o abre el mismo enlace manual de WhatsApp de la tabla. Nada se envía solo.
 */
export const ReminderDrafts: React.FC = () => {
  const m = useMessages(dashboardCatalog);
  const avatarTexts = useMessages(avatarCatalog);
  const [avatarNote, setAvatarNote] = useState<string | null>(null);
  const [avatarCopied, setAvatarCopied] = useState(false);

  useEffect(() => {
    const pending = consumeAvatarReminderDraft();
    if (typeof pending === 'string') setAvatarNote(pending);
    const onDraft = (event: Event) => {
      const text = (event as CustomEvent<{ text?: unknown }>).detail?.text;
      consumeAvatarReminderDraft();
      if (typeof text === 'string') {
        setAvatarNote(text);
        setAvatarCopied(false);
      }
    };
    document.addEventListener(AVATAR_REMINDER_DRAFT_EVENT, onDraft);
    return () => document.removeEventListener(AVATAR_REMINDER_DRAFT_EVENT, onDraft);
  }, []);

  const handleCopyAvatarNote = async () => {
    if (avatarNote === null) return;
    try {
      await navigator.clipboard.writeText(avatarNote);
      setAvatarCopied(true);
    } catch {
      // Sin portapapeles el texto sigue seleccionable en su campo.
    }
  };

  return (
    <section aria-label={m.remindersTitle} className="reminder-drafts panel">
      <h2 style={{ fontSize: '1.25rem' }}>{m.remindersTitle}</h2>
      <p style={{ fontSize: '0.825rem', color: 'var(--color-ink-muted)' }}>{m.remindersSub}</p>
      <div className="reminder-drafts__controls">
        <button
          type="button"
          className="btn btn-teal"
          onClick={() => document.dispatchEvent(new CustomEvent(AVATAR_OPEN_EVENT))}
        >
          {m.remindersCta}
        </button>
      </div>
      {avatarNote !== null ? (
        <div className="reminder-drafts__item" data-testid="reminder-avatar-note">
          <label className="form-label" htmlFor="reminder-avatar-msg">
            {avatarTexts.reminderFieldLabel}
          </label>
          <textarea
            id="reminder-avatar-msg"
            data-testid="reminder-avatar-text"
            className="form-textarea reminder-drafts__message"
            rows={3}
            value={avatarNote}
            onChange={(e) => {
              setAvatarNote(e.target.value);
              setAvatarCopied(false);
            }}
          />
          <div className="reminder-drafts__actions">
            <button
              type="button"
              className="btn btn-secondary"
              data-testid="reminder-avatar-copy"
              onClick={() => void handleCopyAvatarNote()}
            >
              {avatarCopied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
              <span>{avatarCopied ? avatarTexts.reminderCopied : avatarTexts.reminderCopy}</span>
            </button>
            <a
              href={whatsAppShareUrl(avatarNote)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-teal"
              data-testid="reminder-avatar-whatsapp"
            >
              <MessageCircle size={14} aria-hidden="true" />
              <span>{avatarTexts.reminderWhatsapp}</span>
            </a>
          </div>
        </div>
      ) : null}
    </section>
  );
};
