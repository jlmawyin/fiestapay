import React, { useEffect, useState } from 'react';
import type { ModerationConversation, ModerationGuest, ModerationMessage } from '../../types';
import { api, ApiError } from '../../api/client';

interface ModerationPanelProps {
  slug: string;
  refreshKey: number;
  onGuests: (guests: ModerationGuest[]) => void;
}

const labelOf = (conversation: ModerationConversation): string =>
  conversation.guestName && conversation.guestName.trim().length > 0 ? conversation.guestName : 'Participante';

export const ModerationPanel: React.FC<ModerationPanelProps> = ({ slug, refreshKey, onGuests }) => {
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
        setNotice(err instanceof ApiError ? err.message : 'No se pudo leer la moderacion.');
      }
    };
    void load();
    return () => {
      cancel = true;
    };
  }, [slug, refreshKey, onGuests]);

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
        if (!cancel) setNotice(err instanceof ApiError ? err.message : 'No se pudo leer los mensajes.');
      }
    };
    void load();
    return () => {
      cancel = true;
    };
  }, [slug, selected, refreshKey]);

  const removeMessage = async (messageId: string) => {
    setBusy(true);
    try {
      await api.deleteModerationMessage(slug, messageId);
      setMessages((prev) => prev.filter((message) => message.id !== messageId));
      setNotice('Mensaje retirado del historial. La persona lo deja de ver al recargar.');
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : 'No se pudo borrar el mensaje.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel moderation-panel" aria-label="Moderacion de chat">
      <h3 style={{ fontSize: '1.05rem' }}>Moderacion de chat</h3>
      <p className="moderation-note">
        Bloquear corta acciones nuevas de esa sesion. Retirar es logico: no borra pagos. Un pago en verificacion
        conserva el cupo hasta que se concilie. Esto no identifica a la persona en otro navegador.
      </p>
      {notice && (
        <p role="alert" className="moderation-note">
          {notice}
        </p>
      )}
      <div className="moderation-layout">
        <div>
          {conversations.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--color-ink-muted)' }}>Sin conversaciones.</p>
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
                {labelOf(conversation)}
              </button>
            ))
          )}
        </div>
        <div>
          {messages.map((message) => (
            <article key={message.id} style={{ marginBottom: '0.6rem' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--color-ink-muted)' }}>
                {message.role === 'user' ? 'Persona' : 'Asistente'} · {message.id}
              </div>
              <p className="moderation-message">{message.text}</p>
              <button
                type="button"
                className="btn btn-secondary"
                data-testid={`moderation-delete-${message.id}`}
                disabled={busy}
                onClick={() => void removeMessage(message.id)}
              >
                Borrar mensaje
              </button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};
