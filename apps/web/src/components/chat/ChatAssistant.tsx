import React, { useCallback, useEffect, useRef, useState } from 'react';
import { EVENT_TIME_ZONE, intlLocale, type Locale } from '@fiestapay/shared';
import type { Capabilities, Quote, ChatResult, ChatTranscriptMessage, RsvpStatus } from '../../types';
import { ApiError, api } from '../../api/client';
import { useI18n, useMessages } from '../../i18n/I18nContext';
import { guestChatCatalog } from '../../i18n/messages/guestChat';
import { peopleWord } from '../../lib/event-presentation';
import { AssistantText } from './AssistantText';

interface ChatAssistantProps {
  slug: string;
  capabilities: Capabilities | null;
  onApplyQuote?: (quote: Quote) => void;
  onConfirmRsvp?: (status: RsvpStatus, companions: number) => Promise<void>;
  /** Server says this session cannot send. The transcript stays readable. */
  accessRevoked?: boolean;
  /** Invitation is closed to new messages. Guest only. */
  closed?: boolean;
  /** Guest keeps the public assistant. Organizer uses the keyed panel routes. */
  audience?: 'guest' | 'organizer';
  /** Presentation seam: render without its own floating trigger inside a host panel. */
  embedded?: boolean;
  /** Optional controlled visibility. Standalone use keeps its internal state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function parseRsvpAction(actionStr: string): { status: RsvpStatus; companions: number } | null {
  const match = /^rsvp:(yes|no|maybe):(\d+)$/.exec(actionStr.trim());
  if (!match) return null;
  return {
    status: match[1] as RsvpStatus,
    companions: parseInt(match[2], 10),
  };
}


/** Message clock in the event zone, formatted in the locale. */
function stampMessage(when: string | number | Date, locale: Locale): string {
  return new Date(when).toLocaleTimeString(intlLocale(locale), {
    timeZone: EVENT_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  quote?: Quote;
  actions?: string[];
  timestamp: string;
}

const GREETING_ID = 'init-1';
let pendingSerial = 0;

function applyTranscript(
  prev: ChatMessage[],
  incoming: ChatTranscriptMessage[],
  locale: Locale,
): ChatMessage[] {
  const greeting = prev.filter((message) => message.id === GREETING_ID);
  const fromServer: ChatMessage[] = incoming.map((message) => {
    const previous = prev.find((item) => item.id === message.id);
    return {
      id: message.id,
      sender: message.role === 'user' ? 'user' : 'assistant',
      text: message.text,
      timestamp: stampMessage(message.createdAt, locale),
      ...(previous?.quote ? { quote: previous.quote } : {}),
      ...(previous?.actions ? { actions: previous.actions } : {}),
    };
  });
  const serverTexts = new Set(fromServer.map((message) => `${message.sender}:${message.text}`));
  const pending = prev.filter(
    (message) => message.id.startsWith('pending-') && !serverTexts.has(`${message.sender}:${message.text}`),
  );
  return [...greeting, ...fromServer, ...pending];
}

export const ChatAssistant: React.FC<ChatAssistantProps> = ({
  slug,
  capabilities,
  onApplyQuote,
  onConfirmRsvp,
  accessRevoked = false,
  closed = false,
  audience = 'guest',
  embedded = false,
  open,
  onOpenChange,
}) => {
  const organizer = audience === 'organizer';
  const [internalOpen, setInternalOpen] = useState(false);
  const controlled = open !== undefined;
  const isOpen = controlled ? open : internalOpen;
  const setOpen = (next: boolean) => {
    if (!controlled) setInternalOpen(next);
    onOpenChange?.(next);
  };
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [confirmedActionIds, setConfirmedActionIds] = useState<Set<string>>(new Set());
  const composerDisabled = (!organizer && (accessRevoked || closed)) || !capabilities?.chat;
  const { locale, formatMoney } = useI18n();
  const m = useMessages(guestChatCatalog);
  const copyRef = useRef(m);
  copyRef.current = m;
  const localeRef = useRef(locale);
  localeRef.current = locale;

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init-1',
      sender: 'assistant',
      text: organizer ? m.orgLoading : m.greeting,
      timestamp: stampMessage(new Date(), locale),
    },
  ]);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const chatAvailable = Boolean(capabilities?.chat);

  const forgetOrganizerTranscript = useCallback((notice: string) => {
    setMessages([
      {
        id: GREETING_ID,
        sender: 'assistant',
        text: copyRef.current.orgKeyDead,
        timestamp: stampMessage(new Date(), localeRef.current),
      },
    ]);
    setErrorNotice(notice);
    setIsLoading(false);
  }, []);

  const pullHistory = useCallback(async () => {
    try {
      if (organizer) {
        const page = await api.getOrganizerChatHistory(slug);
        setMessages((prev) => {
          const next = applyTranscript(prev, page.messages, localeRef.current);
          return next.map((message) => (message.id === GREETING_ID ? { ...message, text: page.greeting } : message));
        });
        return;
      }
      const page = await api.getChatHistory(slug);
      setMessages((prev) => applyTranscript(prev, page.messages, localeRef.current));
    } catch (err) {
      const status = err instanceof ApiError ? err.status : undefined;
      if (organizer && status === 403) {
        forgetOrganizerTranscript(err instanceof Error ? err.message : copyRef.current.orgKeyInvalid);
        return;
      }
      const message = err instanceof Error ? err.message : copyRef.current.historyError;
      setErrorNotice(message);
    }
  }, [forgetOrganizerTranscript, organizer, slug]);

  useEffect(() => {
    if (!isOpen) return;
    void pullHistory();
    const timer = window.setInterval(() => void pullHistory(), 4000);
    return () => window.clearInterval(timer);
  }, [isOpen, pullHistory]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isLoading || composerDisabled) return;

    const userText = inputMessage.trim();
    pendingSerial += 1;
    const userMsg: ChatMessage = {
      id: `pending-user-${pendingSerial}`,
      sender: 'user',
      text: userText,
      timestamp: stampMessage(new Date(), localeRef.current),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setIsLoading(true);
    setErrorNotice(null);

    try {
      const res: ChatResult = organizer ? await api.sendOrganizerChat(slug, userText) : await api.sendChat(slug, userText);
      const assistantMsg: ChatMessage = {
        id: res.assistantMessageId ?? `pending-assistant-${pendingSerial}`,
        sender: 'assistant',
        text: res.text,
        ...(organizer ? {} : { quote: res.quote, actions: res.actions }),
        timestamp: stampMessage(new Date(), localeRef.current),
      };
      setMessages((prev) => {
        const withoutPending = prev.map((message) =>
          message.id === userMsg.id ? { ...message, id: res.userMessageId ?? message.id } : message,
        );
        if (withoutPending.some((message) => message.id === assistantMsg.id)) return withoutPending;
        return [...withoutPending, assistantMsg];
      });
      void pullHistory();
    } catch (err: any) {
      if (organizer && err?.status === 403) {
        forgetOrganizerTranscript(err.message || copyRef.current.orgKeyInvalid);
      } else if (err.status === 503) {
        setErrorNotice(organizer ? copyRef.current.org503 : copyRef.current.error503);
      } else {
        setErrorNotice(err.message || copyRef.current.errorGeneric);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Trigger Button */}
      {!embedded && (
        <div style={{ position: 'fixed', bottom: '1.5rem', left: '1.5rem', zIndex: 900 }}>
          <button
            onClick={() => setOpen(!isOpen)}
            className="btn btn-primary"
            style={{
              borderRadius: 'var(--radius-full)',
              padding: '0.75rem 1.25rem',
              boxShadow: 'var(--shadow-lg)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              border: '2px solid #FFFFFF',
            }}
            aria-label={isOpen ? m.closeAssistant : m.openAssistant}
            aria-expanded={isOpen}
          >
            <span style={{ fontSize: '1.2rem' }}>✨</span>
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{m.chatShort}</span>
            {isOpen ? '✕' : ''}
          </button>
        </div>
      )}

      {/* Drawer / Floating Chat Box */}
      {isOpen && (
        <div
          style={{
            position: embedded ? 'relative' : 'fixed',
            bottom: embedded ? 'auto' : '5.2rem',
            left: embedded ? 'auto' : '1.5rem',
            width: embedded ? '100%' : '360px',
            maxWidth: embedded ? 'none' : 'calc(100vw - 3rem)',
            height: embedded ? '100%' : '480px',
            maxHeight: embedded ? 'none' : 'calc(100dvh - 6.2rem)',
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
          }}
          role="complementary"
          aria-label={m.panelLabel}
        >
          {/* Header */}
          {!embedded && (
          <div
            style={{
              padding: '0.85rem 1rem',
              backgroundColor: 'var(--color-ink)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.1rem' }}>✨</span>
              <div>
                <strong style={{ fontSize: '0.9rem', display: 'block' }}>
                  {organizer ? m.orgTitle : m.title}
                </strong>
                <span style={{ fontSize: '0.72rem', color: 'var(--color-yellow)' }}>
                  {chatAvailable ? (organizer ? m.orgSubtitle : m.subtitle) : m.chatOff}
                </span>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', color: '#FFFFFF', cursor: 'pointer', fontSize: '1.1rem' }}
              aria-label={m.closeChat}
            >
              ×
            </button>
          </div>
          )}

          {/* Voice status notice */}
          <div
            style={{
              backgroundColor: 'var(--color-surface-subtle)',
              padding: '0.45rem 0.75rem',
              fontSize: '0.75rem',
              color: 'var(--color-ink-muted)',
              borderBottom: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <span>🎙️</span>
            <span>
              {organizer ? m.orgNotice : m.notice}
            </span>
          </div>

          {/* Chat Messages */}
          <div
            style={{
              flex: 1,
              padding: '0.85rem',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              backgroundColor: 'var(--color-cloudwhite)',
            }}
          >
            {!organizer && (accessRevoked || closed) && (
              <div className="session-revoked-banner" role="status">
                {accessRevoked ? m.revokedBanner : m.closedBanner}
              </div>
            )}

            {!chatAvailable && (
              <div
                style={{
                  backgroundColor: 'var(--color-yellow-tint)',
                  border: '1px solid var(--color-yellow)',
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.8rem',
                  color: 'var(--color-ink)',
                }}
              >
                {m.disabledBox}
              </div>
            )}

            {messages.map((msg) => {
              const isUser = msg.sender === 'user';
              return (
                <div
                  key={msg.id}
                  style={{
                    alignSelf: isUser ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                  }}
                >
                  <div
                    style={{
                      backgroundColor: isUser ? 'var(--color-blue)' : '#FFFFFF',
                      color: isUser ? '#FFFFFF' : 'var(--color-ink)',
                      padding: '0.65rem 0.85rem',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.85rem',
                      border: isUser ? 'none' : '1px solid var(--color-border)',
                      boxShadow: 'var(--shadow-sm)',
                    }}
                  >
                    <div style={{ whiteSpace: 'pre-wrap' }}>
                      <AssistantText text={msg.text} />
                    </div>

                    {/* Quote Action Card returned by assistant */}
                    {msg.quote && (
                      <div
                        style={{
                          marginTop: '0.65rem',
                          padding: '0.6rem',
                          backgroundColor: 'var(--color-surface-subtle)',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--color-blue)',
                          color: 'var(--color-ink)',
                          fontSize: '0.8rem',
                        }}
                      >
                        <div style={{ fontWeight: 700, color: 'var(--color-blue)', marginBottom: '0.25rem' }}>
                          {m.quoteTitle}
                        </div>
                        <div>
                          {m.quoteLine(msg.quote.people)}<strong>{formatMoney(msg.quote.amountCents)}</strong>
                        </div>
                        {onApplyQuote && !accessRevoked && !closed && (
                          <button
                            onClick={() => onApplyQuote(msg.quote!)}
                            className="btn btn-teal"
                            style={{
                              marginTop: '0.5rem',
                              padding: '0.35rem 0.6rem',
                              fontSize: '0.75rem',
                              width: '100%',
                            }}
                          >
                            {m.reviewOnScreen}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Action Proposals returned by assistant (e.g. rsvp:yes:1) */}
                    {msg.actions && msg.actions.length > 0 && (
                      <div style={{ marginTop: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {msg.actions.map((act, actIdx) => {
                          const rsvpAction = parseRsvpAction(act);
                          if (!rsvpAction) return null;
                          const actionKey = `${msg.id}-${actIdx}`;
                          const isConfirmed = confirmedActionIds.has(actionKey);
                          const totalPeople = rsvpAction.status === 'yes' ? 1 + rsvpAction.companions : 0;
                          const statusLabel =
                            rsvpAction.status === 'yes'
                              ? m.attend(totalPeople, peopleWord(totalPeople, locale))
                              : rsvpAction.status === 'no'
                              ? m.decline
                              : m.maybe;

                          return (
                            <div
                              key={actionKey}
                              style={{
                                padding: '0.6rem',
                                backgroundColor: 'var(--color-yellow-tint)',
                                borderRadius: 'var(--radius-sm)',
                                border: '1px solid var(--color-yellow)',
                                color: 'var(--color-ink)',
                                fontSize: '0.8rem',
                              }}
                            >
                              <div style={{ fontWeight: 700, color: 'var(--color-ink)', marginBottom: '0.2rem' }}>
                                {m.rsvpTitle}
                              </div>
                              <div style={{ fontSize: '0.78rem', color: 'var(--color-ink-muted)', marginBottom: '0.4rem' }}>
                                {m.suggestion}<strong>{statusLabel}</strong>
                              </div>
                              {onConfirmRsvp && !accessRevoked && !closed && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await onConfirmRsvp(rsvpAction.status, rsvpAction.companions);
                                      setConfirmedActionIds((prev) => new Set(prev).add(actionKey));
                                    } catch {
                                      // handled by parent toast
                                    }
                                  }}
                                  disabled={isConfirmed}
                                  className="btn btn-teal"
                                  style={{
                                    padding: '0.35rem 0.6rem',
                                    fontSize: '0.75rem',
                                    width: '100%',
                                    fontWeight: 700,
                                  }}
                                >
                                  {isConfirmed ? m.confirmedServer : m.confirmRsvp}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: '0.68rem',
                      color: 'var(--color-ink-light)',
                      marginTop: '0.2rem',
                      textAlign: isUser ? 'right' : 'left',
                    }}
                  >
                    {msg.timestamp}
                  </div>
                </div>
              );
            })}

            {isLoading && (
              <div
                style={{
                  alignSelf: 'flex-start',
                  backgroundColor: '#FFFFFF',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.8rem',
                  color: 'var(--color-ink-muted)',
                  border: '1px solid var(--color-border)',
                }}
                role="status"
                aria-live="polite"
              >
                {m.typing}
              </div>
            )}

            {errorNotice && (
              <div
                style={{
                  backgroundColor: 'var(--color-coral-tint)',
                  color: 'var(--color-coral)',
                  padding: '0.6rem',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.8rem',
                }}
              >
                {errorNotice}
              </div>
            )}
          </div>

          {/* Chat Input Form */}
          <form
            onSubmit={handleSend}
            style={{
              padding: '0.65rem',
              backgroundColor: '#FFFFFF',
              borderTop: '1px solid var(--color-border)',
              display: 'flex',
              gap: '0.4rem',
            }}
          >
            <input
              className="form-input"
              style={{ fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder={m.placeholder}
              disabled={isLoading || composerDisabled}
              aria-label={m.composerAria}
            />
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '0.5rem 0.7rem', fontSize: '0.75rem' }}
              onClick={() => void pullHistory()}
            >
              {m.refresh}
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ padding: '0.5rem 0.85rem', fontSize: '0.85rem' }}
              disabled={isLoading || !inputMessage.trim() || composerDisabled}
            >
              {m.send}
            </button>
          </form>
        </div>
      )}
    </>
  );
};
