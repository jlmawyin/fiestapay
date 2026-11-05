import React, { useEffect, useRef, useState } from 'react';
import type { Capabilities } from '../../types';
import { ApiError } from '../../api/client';
import { sendPublicChat } from '../../api/public-chat';
import { AssistantText } from './AssistantText';

export interface PublicChatAssistantProps {
  capabilities: Capabilities | null;
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

const WELCOME =
  'Hola. Este es un chat público general y separado de tu evento o del panel del organizador. Puedo explicarte cómo funciona FiestaPay, el flujo de prueba con PayPal Sandbox, la tabla de invitados y la recuperación del organizador. No creo eventos, no reservo y no muevo dinero.';

const QUICK_HELP = [
  '¿Cómo funciona FiestaPay?',
  '¿Qué significa pagar en PayPal Sandbox?',
  '¿Cómo recupera el organizador su acceso?',
];

const PRIVACY_NOTE =
  'La conversación vive solo en esta pestaña abierta: al recargar o en una ventana nueva empieza vacía y aquí no se guarda historial. El servidor conserva metadatos de consumo, no el contenido de tus mensajes públicos. OpenAI procesa tus consultas para responder; no afirmamos que su retención sea cero.';

function messageId(seq: number, role: PublicMessage['role']): string {
  return `public-${role}-${seq}`;
}

function friendlyError(err: unknown): string {
  const status = err instanceof ApiError ? err.status : undefined;
  if (status === 429) {
    return 'Se alcanzó el límite temporal de consultas (429). Tu pregunta no se respondió. Espera un minuto y pulsa «Reintentar» cuando quieras; los formularios y el panel siguen disponibles.';
  }
  if (status === 503) {
    return 'El chat público no está disponible ahora (503). Tu pregunta no obtuvo respuesta. Pulsa «Reintentar» manualmente o continúa con los formularios y el panel; la recuperación del organizador sigue disponible si el correo está configurado. Nada se creó, pagó ni reembolsó.';
  }
  return 'No se pudo enviar la consulta al chat público. Tu pregunta no obtuvo respuesta. Pulsa «Reintentar» manualmente; los formularios y el panel siguen disponibles.';
}

/**
 * Public informational chat. It only calls the model from an explicit Send; opening the panel,
 * recarga and close/reopen never fetch. All conversation state is local React state.
 */
export const PublicChatAssistant: React.FC<PublicChatAssistantProps> = ({ capabilities }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [messages, setMessages] = useState<PublicMessage[]>([
    { id: 'public-assistant-welcome', role: 'assistant', text: WELCOME },
  ]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<PublicChatError | null>(null);
  const sendingRef = useRef(false);
  const aliveRef = useRef(true);
  const sequenceRef = useRef(0);

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
      const reply = await sendPublicChat(text);
      if (!aliveRef.current) return;
      sequenceRef.current += 1;
      setMessages((previous) => [
        ...previous,
        { id: messageId(sequenceRef.current, 'assistant'), role: 'assistant', text: reply },
      ]);
      setError(null);
    } catch (err) {
      if (!aliveRef.current) return;
      setError({ message: friendlyError(err), failedQuestion: text });
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
      <div style={{ position: 'fixed', bottom: '1.5rem', left: '1.5rem', zIndex: 900 }}>
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
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
          aria-label={isOpen ? 'Cerrar chat de FiestaPay' : 'Abrir chat de FiestaPay'}
          aria-expanded={isOpen}
          aria-controls="public-chat-panel"
        >
          <span aria-hidden="true" style={{ fontSize: '1.1rem' }}>💬</span>
          <span style={{ fontSize: '0.9rem' }}>Chat</span>
        </button>
      </div>

      {isOpen && (
        <section
          id="public-chat-panel"
          role="dialog"
          aria-label="Chat público de FiestaPay"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setIsOpen(false);
          }}
          style={{
            position: 'fixed',
            bottom: '5.2rem',
            left: '1rem',
            width: 'min(380px, calc(100vw - 2rem))',
            maxHeight: 'calc(100dvh - 6.4rem)',
            backgroundColor: '#FFFFFF',
            borderRadius: 'var(--radius-xl)',
            border: '1.5px solid var(--color-border)',
            boxShadow: 'var(--shadow-ticket)',
            zIndex: 901,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            color: 'var(--color-ink)',
          }}
        >
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
                NUEVO · PÚBLICO
              </span>
              <strong style={{ display: 'block', fontSize: '0.95rem' }}>Chat general de FiestaPay</strong>
              <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--color-yellow)' }}>
                Información general, no sobre un evento concreto
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                color: '#FFFFFF',
                cursor: 'pointer',
                fontSize: '1.25rem',
                lineHeight: 1,
                padding: '0.1rem',
              }}
              aria-label="Cerrar chat público"
            >
              ×
            </button>
          </header>

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
            Este chat es general y separado de tu evento o del panel del organizador. No crea eventos ni modifica asistencias o pagos.
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
                El asistente público está escribiendo…
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
                {capabilities === null
                  ? 'Comprobando la disponibilidad del chat público. Mientras tanto puedes usar los formularios y el panel manualmente.'
                  : 'El chat público no está habilitado en este servidor. Puedes crear tu invitación y usar los formularios y el panel manualmente; la recuperación del organizador sigue disponible si el correo está configurado.'}
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
                  Reintentar
                </button>
              </div>
            )}
          </div>

          <div style={{ padding: '0.55rem 0.75rem', borderTop: '1px solid var(--color-border)', backgroundColor: '#FFFFFF' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--color-ink-muted)', marginBottom: '0.4rem' }}>
              Ayuda rápida (solo rellena la pregunta; no se envía sola):
            </div>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              {QUICK_HELP.map((question) => (
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
              <span style={{ display: 'block', marginBottom: '0.2rem' }}>Tu pregunta</span>
              <textarea
                className="form-input"
                value={inputMessage}
                onChange={(event) => setInputMessage(event.target.value)}
                placeholder="Escribe una pregunta general…"
                disabled={composerDisabled}
                maxLength={1200}
                rows={2}
                aria-label="Pregunta para el chat público"
                style={{ width: '100%', resize: 'vertical', minHeight: '2.6rem', fontSize: '0.85rem', padding: '0.5rem 0.65rem' }}
              />
            </label>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!canSend}
              style={{ padding: '0.5rem 0.8rem', fontSize: '0.82rem', marginBottom: '0.1rem' }}
            >
              Enviar
            </button>
          </form>

          <p style={{ padding: '0.5rem 0.75rem', fontSize: '0.67rem', color: 'var(--color-ink-muted)', backgroundColor: 'var(--color-surface-subtle)', borderTop: '1px solid var(--color-border)', lineHeight: 1.45 }}>
            {PRIVACY_NOTE}
          </p>
        </section>
      )}
    </>
  );
};
