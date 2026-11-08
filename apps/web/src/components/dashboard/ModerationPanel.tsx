import React, { useEffect, useState } from 'react';
import type { ModerationConversation, ModerationGuest, ModerationMessage } from '../../types';
import { api, ApiError } from '../../api/client';
import { useMessages } from '../../i18n/I18nContext';
import { moderationCatalog } from '../../i18n/messages/organizerModeration';

interface ModerationPanelProps {
  slug: string;
  refreshKey: number;
  onGuests: (guests: ModerationGuest[]) => void;
}

export const ModerationPanel: React.FC<ModerationPanelProps> = ({ slug, refreshKey, onGuests }) => {
  const m = useMessages(moderationCatalog);
  const [conversations, setConversations] = useState<ModerationConversation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<ModerationMessage[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancel = false;
    const load = async () => {
      try {
        const [guestPage, conversationPage] = await Promise.all([
          api.getModerationGuests(slug),
          api.getModerationConversations(slug),
        ]);
        if (cancel) return;
        onGuests(guestPage.guests);
        setConversations(conversationPage.conversations);
        setNotice(null);
      } catch (err) {
        if (cancel) return;
        setNotice(err instanceof ApiError ? err.message : m.readFail);
      }
    };
    void load();
    return () => {
      cancel = true;
    };
  }, [slug, refreshKey, onGuests, m]);

  useEffect(() => {
    if (!selected) {
      setMessages([]);
      return;
    }
    let cancel = false;
    const load = async () => {
      try {
        const page = await api.getModerationMessages(slug, selected);
        if (!cancel) setMessages(page.messages);
      } catch (err) {
        if (!cancel) setNotice(err instanceof ApiError ? err.message : m.messagesFail);
      }
    };
    void load();
    return () => {
      cancel = true;
    };
  }, [slug, selected, refreshKey, m]);

  const removeMessage = async (messageId: string) => {
    setBusy(true);
    try {
      await api.deleteModerationMessage(slug, messageId);
      setMessages((prev) => prev.filter((message) => message.id !== messageId));
      setNotice(m.removedNote);
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : m.deleteFail);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel moderation-panel" aria-label={m.panelAria}>
      <h3 style={{ fontSize: '1.05rem' }}>{m.title}</h3>
      <p className="moderation-note">
        {m.note}
      </p>
      {notice && (
        <p role="alert" className="moderation-note">
          {notice}
        </p>
      )}
      <div className="moderation-layout">
        <div>
          {conversations.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--color-ink-muted)' }}>{m.empty}</p>
          ) : (
            conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                className="btn btn-secondary"
                aria-pressed={selected === conversation.id}
                onClick={() => setSelected(conversation.id)}
                style={{ display: 'block', width: '100%', marginBottom: '0.35rem', textAlign: 'left' }}
              >
                {conversation.guestName && conversation.guestName.trim().length > 0 ? conversation.guestName : m.fallback}
              </button>
            ))
          )}
        </div>
        <div>
          {messages.map((message) => (
            <article key={message.id} style={{ marginBottom: '0.6rem' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--color-ink-muted)' }}>
                {message.role === 'user' ? m.roleUser : m.roleAssistant} · {message.id}
              </div>
              <p className="moderation-message">{message.text}</p>
              <button
                type="button"
                className="btn btn-secondary"
                data-testid={`moderation-delete-${message.id}`}
                disabled={busy}
                onClick={() => void removeMessage(message.id)}
              >
                {m.deleteMsg}
              </button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};
