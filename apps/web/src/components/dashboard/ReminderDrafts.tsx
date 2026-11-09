import React, { useState } from 'react';
import { Check, Copy, MessageCircle } from 'lucide-react';
import type { ReminderDraft, ReminderTone } from '@fiestapay/shared';
import { api } from '../../api/client';
import { useI18n, useMessages } from '../../i18n/I18nContext';
import { dashboardCatalog } from '../../i18n/messages/organizerDashboard';
import { whatsAppShareUrl } from '../../lib/event-presentation';

interface ReminderDraftsProps {
  slug: string;
}

const TONES: ReminderTone[] = ['amable', 'divertido', 'formal'];

/**
 * Organizer-only drafted payment reminders. The server prepares one editable
 * draft per guest who owes money (server `dueCents`, never recomputed here);
 * the organizer copies it or opens the same manual WhatsApp draft link the
 * guest grid uses. Nothing is ever sent automatically.
 */
export const ReminderDrafts: React.FC<ReminderDraftsProps> = ({ slug }) => {
  const { formatMoney } = useI18n();
  const m = useMessages(dashboardCatalog);
  const [tone, setTone] = useState<ReminderTone>('amable');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<ReminderDraft[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [source, setSource] = useState<'ai' | 'rules' | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const toneLabel = (value: ReminderTone): string => {
    switch (value) {
      case 'amable':
        return m.remindersToneFriendly;
      case 'divertido':
        return m.remindersToneFun;
      case 'formal':
        return m.remindersToneFormal;
    }
  };

  const handleDraft = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setError(null);
    setCopiedId(null);
    try {
      const res = await api.draftReminders(slug, tone);
      setDrafts(res.drafts);
      setTruncated(res.truncated);
      setSource(res.source);
    } catch (err: unknown) {
      setDrafts(null);
      setTruncated(false);
      setSource(null);
      setError(err instanceof Error && err.message ? err.message : m.remindersError);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (guestId: string, message: string) => {
    setDrafts((prev) => prev?.map((draft) => (draft.guestId === guestId ? { ...draft, message } : draft)) ?? null);
    if (copiedId === guestId) setCopiedId(null);
  };

  const handleCopy = async (draft: ReminderDraft) => {
    try {
      await navigator.clipboard.writeText(draft.message);
      setCopiedId(draft.guestId);
    } catch {
      // Clipboard unavailable: the text stays selectable in its own field.
    }
  };

  return (
    <section aria-label={m.remindersTitle} className="reminder-drafts panel">
      <h2 style={{ fontSize: '1.25rem' }}>{m.remindersTitle}</h2>
      <p style={{ fontSize: '0.825rem', color: 'var(--color-ink-muted)' }}>{m.remindersSub}</p>
      <div className="reminder-drafts__controls">
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" htmlFor="reminder-tone">
            {m.remindersToneLabel}
          </label>
          <select
            id="reminder-tone"
            className="form-select"
            value={tone}
            onChange={(e) => setTone(e.target.value as ReminderTone)}
          >
            {TONES.map((value) => (
              <option key={value} value={value}>
                {toneLabel(value)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="btn btn-teal"
          onClick={() => void handleDraft()}
          disabled={isLoading}
        >
          {isLoading ? m.remindersLoading : m.remindersCta}
        </button>
      </div>
      {error ? (
        <p role="alert" className="reminder-drafts__error">
          {error}
        </p>
      ) : null}
      {drafts !== null && !error ? (
        <div aria-live="polite" className="reminder-drafts__results">
          {drafts.length === 0 ? (
            <p className="reminder-drafts__empty">{m.remindersEmpty}</p>
          ) : (
            <>
              <ul className="reminder-drafts__list">
                {drafts.map((draft) => (
                  <li
                    key={draft.guestId}
                    data-testid={`reminder-draft-${draft.guestId}`}
                    className="reminder-drafts__item"
                  >
                    <div className="reminder-drafts__head">
                      <strong className="reminder-drafts__alias">{draft.alias}</strong>
                      <span className="reminder-drafts__due">
                        {m.remindersDue(formatMoney(draft.dueCents))}
                      </span>
                    </div>
                    <label className="form-label" htmlFor={`reminder-msg-${draft.guestId}`}>
                      {m.remindersMessageLabel(draft.alias)}
                    </label>
                    <textarea
                      id={`reminder-msg-${draft.guestId}`}
                      className="form-textarea reminder-drafts__message"
                      rows={3}
                      value={draft.message}
                      onChange={(e) => handleEdit(draft.guestId, e.target.value)}
                    />
                    <div className="reminder-drafts__actions">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        data-testid={`reminder-copy-${draft.guestId}`}
                        onClick={() => void handleCopy(draft)}
                      >
                        {copiedId === draft.guestId ? (
                          <Check size={14} aria-hidden="true" />
                        ) : (
                          <Copy size={14} aria-hidden="true" />
                        )}
                        <span>{copiedId === draft.guestId ? m.copiedBtn : m.remindersCopy}</span>
                      </button>
                      <a
                        href={whatsAppShareUrl(draft.message)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-teal"
                        data-testid={`reminder-whatsapp-${draft.guestId}`}
                      >
                        <MessageCircle size={14} aria-hidden="true" />
                        <span>{m.remindersOpenWhatsapp}</span>
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
              {truncated ? (
                <p className="reminder-drafts__note">{m.remindersTruncated}</p>
              ) : null}
              {source === 'rules' ? (
                <p className="reminder-drafts__note">{m.remindersRules}</p>
              ) : null}
              <p className="reminder-drafts__note">{m.remindersNote}</p>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
};
