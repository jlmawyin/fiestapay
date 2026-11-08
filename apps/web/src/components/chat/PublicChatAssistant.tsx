import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import type { AssistantContext } from '@fiestapay/shared';
import type { Capabilities } from '../../types';
import { ApiError } from '../../api/client';
import { sendPublicChat } from '../../api/public-chat';
import { useMessages } from '../../i18n/I18nContext';
import { chatCatalog } from '../../i18n/catalogs/chat';
import { AssistantText } from './AssistantText';

export interface PublicChatAssistantProps {
  capabilities: Capabilities | null;
  /** Presentation seam: render without its own floating trigger inside a host panel. */
  embedded?: boolean;
  /** Optional controlled visibility. Standalone use keeps its internal state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Landing vs demo conversation. Sent to the server; omitted when unnamed. */
  context?: AssistantContext;
  /** Suffix for the panel id when several instances share one document. */
  idSuffix?: string;
}

interface PublicMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

interface PublicChatError {
  message: string;
  failedQuestion: string;
}

function messageId(seq: number, role: PublicMessage['role']): string {
  return `public-${role}-${seq}`;
}

type ChatCopy = (typeof chatCatalog)['es'];

function friendlyError(err: unknown, m: ChatCopy): string {
  const status = err instanceof ApiError ? err.status : undefined;
  if (status === 429) return m.error429;
  if (status === 503) return m.error503;
  return m.errorGeneric;
}

/**
 * Public informational chat. It only calls the model from an explicit Send; opening the panel,
 * recarga and close/reopen never fetch. All conversation state is local React state.
 */
export const PublicChatAssistant: React.FC<PublicChatAssistantProps> = ({
  capabilities,
  embedded = false,
  open,
  onOpenChange,
  context,
  idSuffix,
}) => {
  const m = useMessages(chatCatalog);
  const welcomeRef = useRef<string | null>(null);
  if (welcomeRef.current === null) welcomeRef.current = m.welcome;
  const [internalOpen, setInternalOpen] = useState(false);
  const controlled = open !== undefined;
  const isOpen = controlled ? open : internalOpen;
  const setOpen = (next: boolean) => {
    if (!controlled) setInternalOpen(next);
    onOpenChange?.(next);
  };
  const [inputMessage, setInputMessage] = useState('');
  // The welcome snapshot never refreshes: switching languages keeps the
  // visible history and only new replies arrive in the new language.
  const [messages, setMessages] = useState<PublicMessage[]>(() => [
    { id: 'public-assistant-welcome', role: 'assistant', text: welcomeRef.current ?? m.welcome },
  ]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<PublicChatError | null>(null);
  const sendingRef = useRef(false);
  const aliveRef = useRef(true);
  const sequenceRef = useRef(0);
  const panelId = idSuffix ? `public-chat-panel-${idSuffix}` : 'public-chat-panel';
  const quickHelp = [m.quickHelp1, m.quickHelp2, m.quickHelp3];

  const chatAvailable = capabilities?.chat === true;
  const composerDisabled = !chatAvailable || isSending;
  const canSend = !composerDisabled && inputMessage.trim().length > 0;

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      // Late replies from this component must not update unmounted state or another drawer.
      aliveRef.current = false;
      sendingRef.current = false;
    };
  }, []);

  const submitQuestion = async (rawText: string, retry = false) => {
    if (sendingRef.current || !chatAvailable) return;
    const text = rawText.trim().slice(0, 1200);
    if (text.length === 0) return;

    sendingRef.current = true;
    setIsSending(true);
    setError(null);
    if (!retry) {
      sequenceRef.current += 1;
      const userMessage: PublicMessage = {
        id: messageId(sequenceRef.current, 'user'),
        role: 'user',
        text,
      };
      setMessages((previous) => [...previous, userMessage]);
      setInputMessage('');
    }

    try {
      const reply = await sendPublicChat(text, context);
      if (!aliveRef.current) return;
      sequenceRef.current += 1;
      setMessages((previous) => [
        ...previous,
        { id: messageId(sequenceRef.current, 'assistant'), role: 'assistant', text: reply },
      ]);
      setError(null);
    } catch (err) {
      if (!aliveRef.current) return;
      setError({ message: friendlyError(err, m), failedQuestion: text });
    } finally {
      sendingRef.current = false;
      if (aliveRef.current) setIsSending(false);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSend) return;
    void submitQuestion(inputMessage);
  };

  return (
    <>
      {!embedded && (
        <div style={{ position: 'fixed', bottom: '1.5rem', left: '1.5rem', zIndex: 900 }}>
          <button
            type="button"
            onClick={() => setOpen(!isOpen)}
            className="btn btn-secondary"
            style={{
              borderRadius: 'var(--radius-full)',
              padding: '0.75rem 1.25rem',
              boxShadow: 'var(--shadow-lg)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.55rem',
              border: '2px solid #FFFFFF',
              fontWeight: 700,
            }}
            aria-label={isOpen ? m.closeLabel : m.openLabel}
            aria-expanded={isOpen}
            aria-controls={panelId}
          >
            <MessageCircle size={18} aria-hidden="true" />
            <span style={{ fontSize: '0.9rem' }}>{m.chatShort}</span>
          </button>
        </div>
      )}

      {isOpen && (
        <section
          id={panelId}
          role={embedded ? 'region' : 'dialog'}
          aria-label={m.panelLabel}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
          }}
          style={{
            position: embedded ? 'relative' : 'fixed',
            bottom: embedded ? 'auto' : '5.2rem',
            left: embedded ? 'auto' : '1rem',
            width: embedded ? '100%' : 'min(380px, calc(100vw - 2rem))',
            maxHeight: embedded ? 'none' : 'calc(100dvh - 6.4rem)',
            flex: embedded ? 1 : undefined,
            minHeight: embedded ? 0 : undefined,
            backgroundColor: '#FFFFFF',
            borderRadius: embedded ? 0 : 'var(--radius-xl)',
            border: embedded ? 'none' : '1.5px solid var(--color-border)',
            boxShadow: embedded ? 'none' : 'var(--shadow-ticket)',
            zIndex: embedded ? 'auto' : 901,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            color: 'var(--color-ink)',
          }}
        >
          {!embedded && (
          <header
            style={{
              padding: '0.8rem 0.95rem',
              backgroundColor: 'var(--color-ink)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '0.75rem',
            }}
          >
            <div>
              <span
                style={{
                  display: 'inline-block',
                  backgroundColor: 'var(--color-yellow)',
                  color: 'var(--color-ink)',
                  borderRadius: 'var(--radius-full)',
                  padding: '0.08rem 0.45rem',
                  fontSize: '0.62rem',
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                  marginBottom: '0.25rem',
                }}
              >
                {m.headerBadge}
              </span>
              <strong style={{ display: 'block', fontSize: '0.95rem' }}>{m.headerTitle}</strong>
              <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--color-yellow)' }}>
                {m.headerSub}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                color: '#FFFFFF',
                cursor: 'pointer',
                lineHeight: 1,
                padding: '0.1rem',
                display: 'inline-flex',
              }}
              aria-label={m.headerClose}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </header>
          )}

          <div
            style={{
              padding: '0.55rem 0.75rem',
              backgroundColor: 'var(--color-surface-subtle)',
              borderBottom: '1px solid var(--color-border)',
              fontSize: '0.73rem',
              color: 'var(--color-ink-muted)',
              lineHeight: 1.45,
            }}
          >
            {m.infoStrip}
          </div>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              padding: '0.8rem',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.65rem',
              backgroundColor: 'var(--color-cloudwhite)',
            }}
            aria-live="polite"
          >
            {messages.map((message) => {
              const fromUser = message.role === 'user';
              return (
                <div
                  key={message.id}
                  style={{
                    alignSelf: fromUser ? 'flex-end' : 'flex-start',
                    maxWidth: '88%',
                    backgroundColor: fromUser ? 'var(--color-blue)' : '#FFFFFF',
                    color: fromUser ? '#FFFFFF' : 'var(--color-ink)',
                    padding: '0.6rem 0.75rem',
                    borderRadius: 'var(--radius-md)',
                    border: fromUser ? 'none' : '1px solid var(--color-border)',
                    boxShadow: 'var(--shadow-sm)',
                    fontSize: '0.83rem',
                    overflowWrap: 'anywhere',
                  }}
                >
                  <div style={{ whiteSpace: 'pre-wrap' }}>
                    <AssistantText text={message.text} />
                  </div>
                </div>
              );
            })}

            {isSending && (
              <div
                role="status"
                aria-live="polite"
                style={{
                  alignSelf: 'flex-start',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.5rem 0.7rem',
                  fontSize: '0.8rem',
                  color: 'var(--color-ink-muted)',
                }}
              >
                {m.typing}
              </div>
            )}

            {!chatAvailable && (
              <div
                style={{
                  backgroundColor: 'var(--color-yellow-tint)',
                  border: '1px solid var(--color-yellow)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.7rem',
                  fontSize: '0.8rem',
                  color: 'var(--color-ink)',
                }}
                role="note"
              >
                {capabilities === null ? m.checkingAvailability : m.unavailable}
              </div>
            )}

            {error && (
              <div
                role="alert"
                style={{
                  backgroundColor: 'var(--color-coral-tint)',
                  border: '1px solid var(--color-coral)',
                  color: 'var(--color-ink)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.65rem',
                  fontSize: '0.8rem',
                  lineHeight: 1.45,
                }}
              >
                <div>{error.message}</div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void submitQuestion(error.failedQuestion, true)}
                  disabled={isSending || !chatAvailable}
                  style={{ marginTop: '0.5rem', padding: '0.35rem 0.7rem', fontSize: '0.78rem' }}
                >
                  {m.retry}
                </button>
              </div>
            )}
          </div>

          <div style={{ padding: '0.55rem 0.75rem', borderTop: '1px solid var(--color-border)', backgroundColor: '#FFFFFF' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--color-ink-muted)', marginBottom: '0.4rem' }}>
              {m.quickLead}
            </div>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              {quickHelp.map((question) => (
                <button
                  key={question}
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setInputMessage(question)}
                  disabled={composerDisabled}
                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', borderRadius: 'var(--radius-full)' }}
                >
                  {question}
                </button>
              ))}
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            style={{
              padding: '0.65rem',
              borderTop: '1px solid var(--color-border)',
              backgroundColor: '#FFFFFF',
              display: 'flex',
              gap: '0.45rem',
              alignItems: 'flex-end',
            }}
          >
            <label style={{ flex: 1, fontSize: '0.75rem', color: 'var(--color-ink-muted)' }}>
              <span style={{ display: 'block', marginBottom: '0.2rem' }}>{m.composerLabel}</span>
              <textarea
                className="form-input"
                value={inputMessage}
                onChange={(event) => setInputMessage(event.target.value)}
                placeholder={m.placeholder}
                disabled={composerDisabled}
                maxLength={1200}
                rows={2}
                aria-label={m.composerAria}
                style={{ width: '100%', resize: 'vertical', minHeight: '2.6rem', fontSize: '0.85rem', padding: '0.5rem 0.65rem' }}
              />
            </label>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!canSend}
              style={{ padding: '0.5rem 0.8rem', fontSize: '0.82rem', marginBottom: '0.1rem' }}
            >
              {m.send}
            </button>
          </form>

          <p style={{ padding: '0.5rem 0.75rem', fontSize: '0.67rem', color: 'var(--color-ink-muted)', backgroundColor: 'var(--color-surface-subtle)', borderTop: '1px solid var(--color-border)', lineHeight: 1.45 }}>
            {m.privacy}
          </p>
        </section>
      )}
    </>
  );
};
