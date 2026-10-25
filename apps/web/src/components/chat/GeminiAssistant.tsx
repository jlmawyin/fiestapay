import React, { useState } from 'react';
import type { Capabilities, Quote, ChatResult, RsvpStatus } from '../../types';
import { api } from '../../api/client';
import { usd } from '../../types';

interface GeminiAssistantProps {
  slug: string;
  capabilities: (Capabilities & { chat?: boolean; llmProvider?: 'openai' | 'gemini' }) | null;
  onApplyQuote?: (quote: Quote) => void;
  onConfirmRsvp?: (status: RsvpStatus, companions: number) => Promise<void>;
}

function parseRsvpAction(actionStr: string): { status: RsvpStatus; companions: number } | null {
  const match = /^rsvp:(yes|no|maybe):(\d+)$/.exec(actionStr.trim());
  if (!match) return null;
  return {
    status: match[1] as RsvpStatus,
    companions: parseInt(match[2], 10),
  };
}


interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  quote?: Quote;
  actions?: string[];
  timestamp: string;
}

export const GeminiAssistant: React.FC<GeminiAssistantProps> = ({
  slug,
  capabilities,
  onApplyQuote,
  onConfirmRsvp,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [confirmedActionIds, setConfirmedActionIds] = useState<Set<string>>(new Set());

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init-1',
      sender: 'assistant',
      text: '¡Hola! Soy tu asistente de fiesta. Puedes preguntarme sobre la cuota, sugerirme cambios de acompañantes o consultar dudas sobre la organización.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const chatAvailable = Boolean(capabilities?.chat ?? capabilities?.gemini);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isLoading || !chatAvailable) return;

    const userText = inputMessage.trim();
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setIsLoading(true);
    setErrorNotice(null);

    try {
      const res: ChatResult = await api.sendChat(slug, userText);
      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        text: res.text,
        quote: res.quote,
        actions: res.actions,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      if (err.status === 503) {
        setErrorNotice(
          'El proveedor de chat no está disponible en este momento (503). Todas las acciones manuales de la fiesta siguen totalmente funcionales.'
        );
      } else {
        setErrorNotice(err.message || 'No se pudo obtener respuesta del asistente.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Trigger Button */}
      <div style={{ position: 'fixed', bottom: '1.5rem', left: '1.5rem', zIndex: 900 }}>
        <button
          onClick={() => setIsOpen(!isOpen)}
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
          aria-label={isOpen ? 'Cerrar asistente IA' : 'Abrir asistente IA'}
          aria-expanded={isOpen}
        >
          <span style={{ fontSize: '1.2rem' }}>✨</span>
          <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Chat</span>
          {isOpen ? '✕' : ''}
        </button>
      </div>

      {/* Drawer / Floating Chat Box */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: '5.2rem',
            left: '1.5rem',
            width: '360px',
            maxWidth: 'calc(100vw - 3rem)',
            height: '480px',
            maxHeight: 'calc(100dvh - 6.2rem)',
            backgroundColor: '#FFFFFF',
            borderRadius: 'var(--radius-xl)',
            border: '1.5px solid var(--color-border)',
            boxShadow: 'var(--shadow-ticket)',
            zIndex: 901,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
          role="complementary"
          aria-label="Panel del Asistente FiestaPay"
        >
          {/* Header */}
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
                <strong style={{ fontSize: '0.9rem', display: 'block' }}>Asistente FiestaPay</strong>
                <span style={{ fontSize: '0.72rem', color: 'var(--color-yellow)' }}>
                  {chatAvailable ? 'Consulta sobre tu fiesta' : 'Chat no disponible'}
                </span>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{ background: 'none', border: 'none', color: '#FFFFFF', cursor: 'pointer', fontSize: '1.1rem' }}
              aria-label="Cerrar chat"
            >
              ×
            </button>
          </div>

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
            <span>Revisa tu cuota antes de abrir PayPal. Asistencia y pago se confirman por separado.</span>
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
                ⚠️ El servicio de chat no está habilitado en este servidor. Puedes consultar la conversación previa pero las nuevas consultas están pausadas.
              </div>
            )}

            {messages.map((m) => {
              const isUser = m.sender === 'user';
              return (
                <div
                  key={m.id}
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
                    <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>

                    {/* Quote Action Card returned by assistant */}
                    {m.quote && (
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
                          🧾 Propuesta de Cotización
                        </div>
                        <div>
                          {m.quote.people} personas • Saldo: <strong>{usd(m.quote.amountCents)}</strong>
                        </div>
                        {onApplyQuote && (
                          <button
                            onClick={() => onApplyQuote(m.quote!)}
                            className="btn btn-teal"
                            style={{
                              marginTop: '0.5rem',
                              padding: '0.35rem 0.6rem',
                              fontSize: '0.75rem',
                              width: '100%',
                            }}
                          >
                            Revisar y Confirmar en Pantalla
                          </button>
                        )}
                      </div>
                    )}

                    {/* Action Proposals returned by assistant (e.g. rsvp:yes:1) */}
                    {m.actions && m.actions.length > 0 && (
                      <div style={{ marginTop: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {m.actions.map((act, actIdx) => {
                          const rsvpAction = parseRsvpAction(act);
                          if (!rsvpAction) return null;
                          const actionKey = `${m.id}-${actIdx}`;
                          const isConfirmed = confirmedActionIds.has(actionKey);
                          const totalPeople = rsvpAction.status === 'yes' ? 1 + rsvpAction.companions : 0;
                          const statusLabel =
                            rsvpAction.status === 'yes'
                              ? `Asistir (${totalPeople} ${totalPeople === 1 ? 'persona' : 'personas'})`
                              : rsvpAction.status === 'no'
                              ? 'No asistir'
                              : 'Tal vez';

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
                                📋 Propuesta de Asistencia
                              </div>
                              <div style={{ fontSize: '0.78rem', color: 'var(--color-ink-muted)', marginBottom: '0.4rem' }}>
                                Sugerencia: <strong>{statusLabel}</strong>
                              </div>
                              {onConfirmRsvp && (
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
                                  {isConfirmed ? '✓ Asistencia Confirmada en el Servidor' : 'Confirmar Asistencia'}
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
                    {m.timestamp}
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
              >
                Asistente FiestaPay está escribiendo...
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
              placeholder="Escribe un mensaje o pregunta..."
              disabled={isLoading || !chatAvailable}
              aria-label="Mensaje para el asistente"
            />
            <button
              type="submit"
              className="btn btn-primary"
              style={{ padding: '0.5rem 0.85rem', fontSize: '0.85rem' }}
              disabled={isLoading || !inputMessage.trim() || !chatAvailable}
            >
              Enviar
            </button>
          </form>
        </div>
      )}
    </>
  );
};
