import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ClipboardList, Receipt, Sparkles, TriangleAlert, X } from 'lucide-react';
import { EVENT_TIME_ZONE, intlLocale, type Locale } from '@fiestapay/shared';
import type { Capabilities, Quote, ChatResult, ChatTranscriptMessage, RsvpStatus } from '../../types';
import { ApiError, api } from '../../api/client';
import { useI18n, useMessages } from '../../i18n/I18nContext';
import { guestChatCatalog } from '../../i18n/messages/guestChat';
import { peopleWord } from '../../lib/event-presentation';
import { AssistantText } from './AssistantText';
import { AboutChat } from './AboutChat';
import { ChatComposer } from './ChatComposer';
import { scrollContainerToBottom, scrollMessageToTop, useElapsedSeconds } from './chat-hooks';

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
  /** Epoch ms. The list is always sorted by it, so polling never reorders. */
  createdAt: number;
  /** User-message delivery. Sent/assistant messages leave it undefined. */
  delivery?: 'sending' | 'failed';
}

interface SendFailure {
  message: string;
  failedQuestion: string;
}

const GREETING_ID = 'init-1';
let pendingSerial = 0;

/** Server echo comparison: trim and collapse whitespace. */
export function normalizeChatText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function parseChatTime(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Stable chronological order (Array.sort is stable: ties keep their order). */
function sortChatMessages(list: ChatMessage[]): ChatMessage[] {
  return [...list].sort((a, b) => a.createdAt - b.createdAt);
}

/** HTTP status when the failure carries one (ApiError or any status-carrying error). */
function errorStatusOf(err: unknown): number | undefined {
  if (err instanceof ApiError) return err.status;
  if (typeof err === 'object' && err !== null && 'status' in err) {
    const status = (err as { status?: unknown }).status;
    return typeof status === 'number' ? status : undefined;
  }
  return undefined;
}

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
      createdAt: parseChatTime(message.createdAt),
      ...(previous?.quote ? { quote: previous.quote } : {}),
      ...(previous?.actions ? { actions: previous.actions } : {}),
    };
  });
  // A pending message is dropped once the server echoes it, by returned id or
  // by normalized text. Survivors (still sending, failed) keep their original
  // spot in chronological order instead of floating at the end.
  const serverIds = new Set(fromServer.map((message) => message.id));
  const serverTexts = new Set(
    fromServer.map((message) => `${message.sender}:${normalizeChatText(message.text)}`),
  );
  const pending = prev.filter(
    (message) =>
      message.id.startsWith('pending-') &&
      !serverIds.has(message.id) &&
      !serverTexts.has(`${message.sender}:${normalizeChatText(message.text)}`),
  );
  return [...greeting, ...sortChatMessages([...fromServer, ...pending])];
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
      createdAt: Date.now(),
    },
  ]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<SendFailure | null>(null);
  /** Own answers scroll into view even when pinned mid-list by a retry. */
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);
  const elapsedSecs = useElapsedSeconds(isLoading);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastAssistantIdRef = useRef<string | null>(GREETING_ID);

  const chatAvailable = Boolean(capabilities?.chat);

  // Sending shows the question plus the thinking indicator; an answer scrolls
  // so the START of that answer sits at the top of the list.
  useEffect(() => {
    if (isLoading) scrollContainerToBottom(scrollRef.current);
  }, [isLoading]);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last?.sender === 'assistant' && last.id !== lastAssistantIdRef.current) {
      lastAssistantIdRef.current = last.id;
      scrollMessageToTop(scrollRef.current, last.id);
    }
  }, [messages]);

  useEffect(() => {
    if (!scrollTarget) return;
    scrollMessageToTop(scrollRef.current, scrollTarget);
    setScrollTarget(null);
  }, [scrollTarget, messages]);

  const forgetOrganizerTranscript = useCallback((notice: string) => {
    setMessages([
      {
        id: GREETING_ID,
        sender: 'assistant',
        text: copyRef.current.orgKeyDead,
        timestamp: stampMessage(new Date(), localeRef.current),
        createdAt: Date.now(),
      },
    ]);
    setHistoryError(notice);
    setSendError(null);
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
      setHistoryError(message);
    }
  }, [forgetOrganizerTranscript, organizer, slug]);

  useEffect(() => {
    if (!isOpen) return;
    void pullHistory();
    const timer = window.setInterval(() => void pullHistory(), 4000);
    return () => window.clearInterval(timer);
  }, [isOpen, pullHistory]);

  const friendlySendError = (err: unknown): string => {
    const status = errorStatusOf(err);
    if (status === 408 || status === 504) return copyRef.current.errorTimeout;
    if (status === 503) return organizer ? copyRef.current.org503 : copyRef.current.error503;
    if (status === 429) return copyRef.current.error429;
    if (err instanceof Error && err.message) return err.message;
    return copyRef.current.errorGeneric;
  };

  const sendMessage = async (rawText: string) => {
    const userText = rawText.trim().slice(0, 1200);
    if (!userText || isLoading || composerDisabled) return;

    pendingSerial += 1;
    const now = Date.now();
    const userMsg: ChatMessage = {
      id: `pending-user-${pendingSerial}`,
      sender: 'user',
      text: userText,
      timestamp: stampMessage(now, localeRef.current),
      createdAt: now,
      delivery: 'sending',
    };

    setMessages((prev) => sortChatMessages([...prev, userMsg]));
    setInputMessage('');
    setIsLoading(true);
    setSendError(null);
    setHistoryError(null);

    try {
      const res: ChatResult = organizer ? await api.sendOrganizerChat(slug, userText) : await api.sendChat(slug, userText);
      const answeredAt = Date.now();
      const assistantMsg: ChatMessage = {
        id: res.assistantMessageId ?? `pending-assistant-${pendingSerial}`,
        sender: 'assistant',
        text: res.text,
        ...(organizer ? {} : { quote: res.quote, actions: res.actions }),
        timestamp: stampMessage(answeredAt, localeRef.current),
        createdAt: answeredAt,
      };
      setMessages((prev) => {
        const confirmed = prev.map((message) =>
          message.id === userMsg.id
            ? { ...message, id: res.userMessageId ?? message.id, delivery: undefined }
            : message,
        );
        if (confirmed.some((message) => message.id === assistantMsg.id)) return sortChatMessages(confirmed);
        return sortChatMessages([...confirmed, assistantMsg]);
      });
      setScrollTarget(assistantMsg.id);
      void pullHistory();
    } catch (err: unknown) {
      if (organizer && errorStatusOf(err) === 403) {
        forgetOrganizerTranscript(err instanceof Error && err.message ? err.message : copyRef.current.orgKeyInvalid);
      } else {
        // The failed question stays in its chronological spot, marked inline.
        setMessages((prev) =>
          prev.map((message) => (message.id === userMsg.id ? { ...message, delivery: 'failed' } : message)),
        );
        setSendError({ message: friendlySendError(err), failedQuestion: userText });
      }
    } finally {
      setIsLoading(false);
    }
  };

  /** Resends a failed message in place: no duplicate bubble, same spot. */
  const retryMessage = async (id: string) => {
    const target = messages.find((message) => message.id === id && message.delivery === 'failed');
    if (!target || isLoading || composerDisabled) return;
    // Fresh serial so the answer id can never collide with an existing one.
    pendingSerial += 1;

    setMessages((prev) => prev.map((message) => (message.id === id ? { ...message, delivery: 'sending' } : message)));
    setIsLoading(true);
    setSendError(null);
    setHistoryError(null);

    try {
      const res: ChatResult = organizer
        ? await api.sendOrganizerChat(slug, target.text)
        : await api.sendChat(slug, target.text);
      const answeredAt = Date.now();
      const assistantMsg: ChatMessage = {
        id: res.assistantMessageId ?? `pending-assistant-${pendingSerial}`,
        sender: 'assistant',
        text: res.text,
        ...(organizer ? {} : { quote: res.quote, actions: res.actions }),
        timestamp: stampMessage(answeredAt, localeRef.current),
        // Pinned below its question however much was asked since the failure.
        createdAt: target.createdAt,
      };
      setMessages((prev) => {
        const confirmed = prev.map((message) =>
          message.id === id ? { ...message, id: res.userMessageId ?? message.id, delivery: undefined } : message,
        );
        if (confirmed.some((message) => message.id === assistantMsg.id)) return sortChatMessages(confirmed);
        return sortChatMessages([...confirmed, assistantMsg]);
      });
      setScrollTarget(assistantMsg.id);
      void pullHistory();
    } catch (err: unknown) {
      if (organizer && errorStatusOf(err) === 403) {
        forgetOrganizerTranscript(err instanceof Error && err.message ? err.message : copyRef.current.orgKeyInvalid);
      } else {
        setMessages((prev) =>
          prev.map((message) => (message.id === id ? { ...message, delivery: 'failed' } : message)),
        );
        setSendError({ message: friendlySendError(err), failedQuestion: target.text });
      }
    } finally {
      setIsLoading(false);
    }
  };

  /** The alert explains why; its retry reuses the failed bubble in place. */
  const retryAlert = () => {
    if (!sendError) return;
    const target = messages.find(
      (message) => message.delivery === 'failed' && message.text === sendError.failedQuestion,
    );
    if (target) void retryMessage(target.id);
  };

  const handleSubmit = () => {
    if (!inputMessage.trim() || isLoading || composerDisabled) return;
    void sendMessage(inputMessage);
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
            <Sparkles size={20} aria-hidden="true" />
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{m.chatShort}</span>
            {isOpen ? <X size={16} aria-hidden="true" /> : null}
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
              <Sparkles size={18} aria-hidden="true" />
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
              style={{ background: 'none', border: 'none', color: '#FFFFFF', cursor: 'pointer', display: 'inline-flex' }}
              aria-label={m.closeChat}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          )}

          <AboutChat title={m.aboutTitle}>
            <span>{organizer ? m.orgNotice : m.notice}</span>
          </AboutChat>

          {/* Chat Messages */}
          <div
            ref={scrollRef}
            data-testid="chat-messages"
            className="fp-chat-messages"
            style={{
              padding: '0.85rem',
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
                  display: 'flex',
                  gap: '0.5rem',
                  alignItems: 'flex-start',
                }}
              >
                <TriangleAlert size={16} aria-hidden="true" style={{ flex: '0 0 auto', marginTop: '0.1rem' }} />
                <span>{m.disabledBox}</span>
              </div>
            )}

            {messages.map((msg) => {
              const isUser = msg.sender === 'user';
              return (
                <div
                  key={msg.id}
                  data-mid={msg.id}
                  {...(msg.delivery ? { 'data-delivery': msg.delivery } : {})}
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
                      fontSize: isUser ? '0.85rem' : '0.95rem',
                      lineHeight: isUser ? 1.45 : 1.55,
                      border: isUser ? 'none' : '1px solid var(--color-border)',
                      boxShadow: 'var(--shadow-sm)',
                    }}
                  >
                    <AssistantText text={msg.text} />

                    {isUser && msg.delivery === 'failed' && (
                      <div
                        style={{
                          marginTop: '0.5rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                          flexWrap: 'wrap',
                        }}
                      >
                        <span
                          style={{
                            backgroundColor: 'var(--color-coral-tint)',
                            border: '1px solid var(--color-coral)',
                            color: 'var(--color-ink)',
                            borderRadius: 'var(--radius-full)',
                            padding: '0.1rem 0.55rem',
                            fontSize: '0.72rem',
                            fontWeight: 800,
                          }}
                        >
                          {m.notSent}
                        </span>
                        <span aria-hidden="true" style={{ color: 'var(--color-ink-light)' }}>
                          ·
                        </span>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => void retryMessage(msg.id)}
                          disabled={isLoading || composerDisabled}
                          style={{ padding: '0.25rem 0.6rem', fontSize: '0.72rem' }}
                        >
                          {m.retry}
                        </button>
                      </div>
                    )}

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
                        <div style={{ fontWeight: 700, color: 'var(--color-blue)', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Receipt size={16} aria-hidden="true" />
                          <span>{m.quoteTitle}</span>
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
                              <div style={{ fontWeight: 700, color: 'var(--color-ink)', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <ClipboardList size={16} aria-hidden="true" />
                                <span>{m.rsvpTitle}</span>
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
                                  {isConfirmed ? (
                                    <>
                                      <Check size={16} aria-hidden="true" />
                                      <span>{m.confirmedServer}</span>
                                    </>
                                  ) : (
                                    m.confirmRsvp
                                  )}
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
                {m.thinking(elapsedSecs)}
              </div>
            )}

            {historyError && (
              <div
                style={{
                  backgroundColor: 'var(--color-coral-tint)',
                  color: 'var(--color-coral)',
                  padding: '0.6rem',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.8rem',
                }}
              >
                {historyError}
              </div>
            )}

            {sendError && (
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
                <div>{sendError.message}</div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={retryAlert}
                  disabled={isLoading || composerDisabled}
                  style={{ marginTop: '0.5rem', padding: '0.35rem 0.7rem', fontSize: '0.78rem' }}
                >
                  {m.retry}
                </button>
              </div>
            )}
          </div>

          <ChatComposer
            value={inputMessage}
            onValueChange={setInputMessage}
            onSubmit={handleSubmit}
            disabled={isLoading || composerDisabled}
            placeholder={m.placeholder}
            composerLabel={m.composerLabel}
            composerAria={m.composerAria}
            sendLabel={m.send}
            maxLength={1200}
            extra={
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '0.5rem 0.7rem', fontSize: '0.75rem', marginBottom: '0.1rem', flex: '0 0 auto' }}
                onClick={() => void pullHistory()}
              >
                {m.refresh}
              </button>
            }
            strings={{
              enterSend: m.enterSend,
              enterButtonOnly: m.enterButtonOnly,
              enterHintSend: m.enterHintSend,
              enterHintButton: m.enterHintButton,
              enterGroupLabel: m.enterGroupLabel,
            }}
          />
        </div>
      )}
    </>
  );
};
