import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import type { AssistantContext, DraftEventProposal } from '@fiestapay/shared';
import type { Capabilities } from '../../types';
import { ApiError } from '../../api/client';
import { sendPublicChat } from '../../api/public-chat';
import { useI18n, useMessages } from '../../i18n/I18nContext';
import { chatCatalog } from '../../i18n/catalogs/chat';
import { AssistantText } from './AssistantText';
import { AboutChat } from './AboutChat';
import { ChatComposer } from './ChatComposer';
import { scrollContainerToBottom, scrollMessageToTop, useElapsedSeconds } from './chat-hooks';
import { openCreateWithDraft } from '../../guide/showOnScreen';

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
  /** Landscape mode (panel height <= 560 px): tighter chrome, same behavior. */
  compact?: boolean;
  /** Optional draft prompt. The visitor still presses Send. */
  initialMessage?: string;
}

interface PublicMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** Complete server proposal; clicking its card hands it to /create once. */
  draft?: DraftEventProposal;
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
  const status = errorStatusOf(err);
  if (status === 408 || status === 504) return m.errorTimeout;
  if (status === 429) return m.error429;
  if (status === 503) return m.error503;
  return m.errorGeneric;
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
  compact = false,
  initialMessage = '',
}) => {
  const m = useMessages(chatCatalog);
  const { formatMoney, formatDateTime } = useI18n();
  const welcomeRef = useRef<string | null>(null);
  if (welcomeRef.current === null) welcomeRef.current = m.welcome;
  const [internalOpen, setInternalOpen] = useState(false);
  const controlled = open !== undefined;
  const isOpen = controlled ? open : internalOpen;
  const setOpen = (next: boolean) => {
    if (!controlled) setInternalOpen(next);
    onOpenChange?.(next);
  };
  const [inputMessage, setInputMessage] = useState(initialMessage);
  // The welcome snapshot never refreshes: switching languages keeps the
  // visible history and only new replies arrive in the new language.
  const [messages, setMessages] = useState<PublicMessage[]>(() => [
    { id: 'public-assistant-welcome', role: 'assistant', text: welcomeRef.current ?? m.welcome },
  ]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<PublicChatError | null>(null);
  const [showQuick, setShowQuick] = useState(false);
  const sendingRef = useRef(false);
  const aliveRef = useRef(true);
  const sequenceRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastAssistantIdRef = useRef<string | null>('public-assistant-welcome');
  const panelId = idSuffix ? `public-chat-panel-${idSuffix}` : 'public-chat-panel';
  const quickHelp = [m.quickHelp1, m.quickHelp2, m.quickHelp3];
  const elapsedSecs = useElapsedSeconds(isSending);

  const chatAvailable = capabilities?.chat === true;
  const composerDisabled = !chatAvailable || isSending;
  const hasAsked = messages.some((message) => message.role === 'user');

  const templateLabel = (draft: DraftEventProposal): string => {
    switch (draft.template) {
      case 'comida':
        return m.draftTemplateComida;
      case 'casa':
        return m.draftTemplateCasa;
      case 'viaje':
        return m.draftTemplateViaje;
      case 'evento':
        return m.draftTemplateEvento;
    }
  };

  const draftDetails = (draft: DraftEventProposal): string[] => {
    const details = [templateLabel(draft)];
    if (draft.date) {
      const startsAt = `${draft.date}T${draft.startTime ?? '12:00'}:00`;
      const formatted = formatDateTime(startsAt, {
        dateStyle: 'medium',
        ...(draft.startTime ? { timeStyle: 'short' as const } : {}),
      });
      if (formatted) details.push(formatted);
    }
    if (typeof draft.headcount === 'number' && draft.headcount > 0) {
      details.push(m.draftPeople(draft.headcount));
    }
    if (typeof draft.perPersonCents === 'number' && draft.perPersonCents > 0) {
      details.push(m.draftPerPerson(formatMoney(draft.perPersonCents)));
    }
    return details;
  };

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      // Late replies from this component must not update unmounted state or another drawer.
      aliveRef.current = false;
      sendingRef.current = false;
    };
  }, []);

  // Sending shows the question plus the thinking indicator; an answer scrolls
  // so the START of that answer sits at the top of the list.
  useEffect(() => {
    if (isSending) scrollContainerToBottom(scrollRef.current);
  }, [isSending]);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last?.role === 'assistant' && last.id !== lastAssistantIdRef.current) {
      lastAssistantIdRef.current = last.id;
      scrollMessageToTop(scrollRef.current, last.id);
    }
  }, [messages]);

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
        {
          id: messageId(sequenceRef.current, 'assistant'),
          role: 'assistant',
          text: reply.text,
          ...(reply.draft ? { draft: reply.draft } : {}),
        },
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

  const handleSubmit = () => {
    if (composerDisabled || inputMessage.trim().length === 0) return;
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

          <AboutChat title={m.aboutTitle}>
            <span>{m.infoStrip}</span>
            <span>{capabilities?.llmProvider === 'openai' ? m.privacy : m.privacyGemini}</span>
          </AboutChat>

          <div
            ref={scrollRef}
            data-testid="chat-messages"
            className="fp-chat-messages"
            style={{
              padding: '0.8rem',
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
                  data-mid={message.id}
                  style={{
                    alignSelf: fromUser ? 'flex-end' : 'flex-start',
                    maxWidth: '88%',
                    backgroundColor: fromUser ? 'var(--color-blue)' : '#FFFFFF',
                    color: fromUser ? '#FFFFFF' : 'var(--color-ink)',
                    padding: '0.6rem 0.75rem',
                    borderRadius: 'var(--radius-md)',
                    border: fromUser ? 'none' : '1px solid var(--color-border)',
                    boxShadow: 'var(--shadow-sm)',
                    fontSize: fromUser ? '0.85rem' : '0.95rem',
                    lineHeight: fromUser ? 1.45 : 1.55,
                    overflowWrap: 'anywhere',
                  }}
                >
                  <AssistantText text={message.text} guideScope="public" />
                  {message.draft ? (
                    <div
                      data-testid="public-draft-card"
                      role="group"
                      aria-label={m.draftCardAria}
                      style={{
                        marginTop: '0.65rem',
                        padding: '0.7rem',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--color-teal)',
                        backgroundColor: 'var(--color-teal-tint)',
                        color: 'var(--color-ink)',
                        fontSize: '0.82rem',
                      }}
                    >
                      <div style={{ fontWeight: 800, color: 'var(--color-teal)', marginBottom: '0.25rem' }}>
                        {m.draftCardTitle}
                      </div>
                      <div style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{message.draft.title}</div>
                      <div style={{ marginTop: '0.15rem', color: 'var(--color-ink-muted)' }}>
                        {draftDetails(message.draft).join(' · ')}
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => openCreateWithDraft(message.draft!)}
                        style={{ marginTop: '0.55rem', padding: '0.35rem 0.65rem', fontSize: '0.78rem' }}
                      >
                        {m.draftReview}
                      </button>
                    </div>
                  ) : null}
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
                {m.thinking(elapsedSecs)}
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

          {(!hasAsked || showQuick) && (
            <div
              data-testid="quick-help"
              className={compact ? 'fp-quick-help fp-quick-help--compact' : 'fp-quick-help'}
            >
              {!compact && (
                <div style={{ fontSize: '0.7rem', color: 'var(--color-ink-muted)', marginBottom: '0.4rem' }}>
                  {m.quickLead}
                </div>
              )}
              <div
                style={
                  compact
                    ? { display: 'flex', gap: '0.35rem', flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: '0.1rem' }
                    : { display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }
                }
              >
                {quickHelp.map((question) => (
                  <button
                    key={question}
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setInputMessage(question)}
                    disabled={composerDisabled}
                    style={
                      compact
                        ? { padding: '0.25rem 0.5rem', fontSize: '0.7rem', borderRadius: 'var(--radius-full)', whiteSpace: 'nowrap', flex: '0 0 auto' }
                        : { padding: '0.25rem 0.5rem', fontSize: '0.7rem', borderRadius: 'var(--radius-full)' }
                    }
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          )}

          {hasAsked && !showQuick && (
            <div style={{ padding: '0.35rem 0.75rem', borderTop: '1px solid var(--color-border)', backgroundColor: '#FFFFFF' }}>
              <button
                type="button"
                onClick={() => setShowQuick(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  fontSize: '0.72rem',
                  color: 'var(--color-blue)',
                  textDecoration: 'underline',
                  textUnderlineOffset: '2px',
                  cursor: 'pointer',
                }}
              >
                {m.showSuggestions}
              </button>
            </div>
          )}

          <ChatComposer
            value={inputMessage}
            onValueChange={setInputMessage}
            onSubmit={handleSubmit}
            disabled={composerDisabled}
            placeholder={m.placeholder}
            composerLabel={m.composerLabel}
            composerAria={m.composerAria}
            sendLabel={m.send}
            maxLength={1200}
            strings={{
              enterSend: m.enterSend,
              enterButtonOnly: m.enterButtonOnly,
              enterHintSend: m.enterHintSend,
              enterHintButton: m.enterHintButton,
              enterGroupLabel: m.enterGroupLabel,
            }}
          />
        </section>
      )}
    </>
  );
};
