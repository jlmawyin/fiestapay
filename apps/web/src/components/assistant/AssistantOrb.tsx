import React, { useEffect, useId, useRef, useState } from 'react';
import type { Capabilities, Guest, Quote, RsvpStatus } from '../../types';
import { PublicChatAssistant } from '../chat/PublicChatAssistant';
import { ChatAssistant } from '../chat/ChatAssistant';
import { VoiceInvitationAgent } from '../voice/VoiceInvitationAgent';

export type AssistantAudience = 'public' | 'guest' | 'organizer';
export type AssistantOrbMode = 'text' | 'voice';

export interface AssistantOrbProps {
  /** public: informational only. guest: the invitation routes. organizer: keyed panel routes. */
  audience?: AssistantAudience;
  slug?: string;
  capabilities: Capabilities | null;
  guest?: Guest | null;
  onApplyQuote?: (quote: Quote) => void;
  onConfirmRsvp?: (status: RsvpStatus, companions: number) => Promise<void>;
  accessRevoked?: boolean;
  eventClosed?: boolean;
  onShowToast: (type: 'success' | 'error' | 'info' | 'warning', message: string, title?: string) => void;
}

function subtitleFor(audience: AssistantAudience, mode: AssistantOrbMode): string {
  if (mode === 'voice') {
    if (audience === 'public') return 'Voz informativa · sin datos del evento';
    if (audience === 'organizer') return 'Voz del organizador · sin cambios automáticos';
    return 'Voz de esta invitación';
  }
  if (audience === 'public') return 'Información general de FiestaPay';
  if (audience === 'organizer') return 'Asistente del organizador · solo lectura';
  return 'Asistente de esta invitación';
}

/**
 * One visible launcher for Text and Voice. The text component stays mounted (hidden when
 * voice is selected or the orb is closed), so its own in-memory history survives close and
 * reopen. Voice is mounted only after the person explicitly selects Hablar and is unmounted
 * on switch/close, which reuses its existing stop, lease-release and late-token cleanup.
 */
export const AssistantOrb: React.FC<AssistantOrbProps> = ({
  audience = 'public',
  slug,
  capabilities,
  guest = null,
  onApplyQuote,
  onConfirmRsvp,
  accessRevoked = false,
  eventClosed = false,
  onShowToast,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<AssistantOrbMode>('text');
  const launcherRef = useRef<HTMLButtonElement>(null);
  const textTabRef = useRef<HTMLButtonElement>(null);
  const justClosedRef = useRef(false);
  const panelId = `assistant-orb-${useId().replace(/:/g, '')}`;

  const textKey = audience === 'public' ? 'public' : `${audience}:${slug ?? ''}`;
  const voiceKey = `voice:${audience}:${slug ?? ''}`;

  const closeOrb = () => {
    justClosedRef.current = true;
    setIsOpen(false);
    setMode('text');
  };

  useEffect(() => {
    if (isOpen) {
      textTabRef.current?.focus();
    } else if (justClosedRef.current) {
      justClosedRef.current = false;
      launcherRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeOrb();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        onClick={() => {
          if (isOpen) closeOrb();
          else setIsOpen(true);
        }}
        aria-label={isOpen ? 'Cerrar asistente FiestaPay' : 'Abrir asistente FiestaPay'}
        aria-expanded={isOpen}
        aria-controls={panelId}
        style={{
          position: 'fixed',
          right: '1rem',
          bottom: '1rem',
          zIndex: 950,
          width: '64px',
          height: '64px',
          padding: 0,
          border: '2px solid #FFFFFF',
          borderRadius: '50%',
          cursor: 'pointer',
          color: '#FFFFFF',
          background:
            'radial-gradient(circle at 30% 24%, rgba(255,255,255,0.92) 0 7%, rgba(255,255,255,0.18) 8% 22%, transparent 23%), conic-gradient(from 210deg, var(--color-blue), var(--color-teal), var(--color-yellow), var(--color-blue))',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.45rem',
          lineHeight: 1,
        }}
      >
        <span aria-hidden="true" style={{ textShadow: '0 1px 2px rgba(18,38,58,0.35)' }}>
          ✦
        </span>
        <span
          style={{
            position: 'absolute',
            width: '1px',
            height: '1px',
            padding: 0,
            margin: '-1px',
            overflow: 'hidden',
            clip: 'rect(0, 0, 0, 0)',
            whiteSpace: 'nowrap',
            border: 0,
          }}
        >
          Asistente FiestaPay
        </span>
      </button>

      <section
        id={panelId}
        role="dialog"
        aria-label="Asistente FiestaPay"
        aria-modal="false"
        style={{
          position: 'fixed',
          right: '0.75rem',
          bottom: '5.75rem',
          zIndex: 960,
          display: isOpen ? 'flex' : 'none',
          flexDirection: 'column',
          width: 'min(400px, calc(100vw - 1.5rem))',
          height: 'min(620px, calc(100dvh - 7rem))',
          maxHeight: 'calc(100dvh - 7rem)',
          overflow: 'hidden',
          backgroundColor: '#FFFFFF',
          color: 'var(--color-ink)',
          borderRadius: 'var(--radius-xl)',
          border: '1.5px solid var(--color-border)',
          boxShadow: 'var(--shadow-ticket)',
        }}
      >
        <header
          style={{
            padding: '0.8rem 0.9rem',
            backgroundColor: 'var(--color-ink)',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', minWidth: 0 }}>
            <span
              aria-hidden="true"
              style={{
                width: '30px',
                height: '30px',
                flex: '0 0 30px',
                borderRadius: '50%',
                background:
                  'radial-gradient(circle at 32% 26%, #FFFFFF 0 9%, transparent 10%), conic-gradient(from 210deg, var(--color-blue), var(--color-teal), var(--color-yellow), var(--color-blue))',
              }}
            />
            <div style={{ minWidth: 0 }}>
              <strong style={{ display: 'block', fontSize: '0.92rem' }}>Asistente FiestaPay</strong>
              <span
                style={{
                  display: 'block',
                  fontSize: '0.7rem',
                  color: 'var(--color-yellow)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {subtitleFor(audience, mode)}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={closeOrb}
            aria-label="Cerrar panel del asistente"
            style={{
              background: 'none',
              border: 'none',
              color: '#FFFFFF',
              cursor: 'pointer',
              fontSize: '1.25rem',
              lineHeight: 1,
              padding: '0.2rem',
              flex: '0 0 auto',
            }}
          >
            ×
          </button>
        </header>

        <div
          role="tablist"
          aria-label="Modo del asistente"
          style={{
            display: 'flex',
            gap: '0.4rem',
            padding: '0.45rem 0.65rem',
            backgroundColor: 'var(--color-surface-subtle)',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <button
            ref={textTabRef}
            type="button"
            role="tab"
            id={`${panelId}-text-tab`}
            aria-selected={mode === 'text'}
            aria-controls={`${panelId}-text-pane`}
            tabIndex={mode === 'text' ? 0 : -1}
            onClick={() => setMode('text')}
            className={mode === 'text' ? 'btn btn-primary' : 'btn btn-secondary'}
            style={{ flex: 1, padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}
          >
            Escribir
          </button>
          <button
            type="button"
            role="tab"
            id={`${panelId}-voice-tab`}
            aria-selected={mode === 'voice'}
            aria-controls={`${panelId}-voice-pane`}
            tabIndex={mode === 'voice' ? 0 : -1}
            onClick={() => setMode('voice')}
            className={mode === 'voice' ? 'btn btn-teal' : 'btn btn-secondary'}
            style={{ flex: 1, padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}
          >
            Hablar
          </button>
        </div>

        <div
          id={`${panelId}-text-pane`}
          role="tabpanel"
          aria-labelledby={`${panelId}-text-tab`}
          style={{
            display: mode === 'text' ? 'flex' : 'none',
            flex: 1,
            minHeight: 0,
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {audience === 'public' ? (
            <PublicChatAssistant
              key={textKey}
              capabilities={capabilities}
              embedded
              open={isOpen && mode === 'text'}
              onOpenChange={(next) => {
                if (!next) closeOrb();
              }}
            />
          ) : (
            <ChatAssistant
              key={textKey}
              slug={slug ?? ''}
              capabilities={capabilities}
              audience={audience}
              embedded
              open={isOpen && mode === 'text'}
              accessRevoked={accessRevoked}
              closed={eventClosed}
              onApplyQuote={onApplyQuote}
              onConfirmRsvp={onConfirmRsvp}
              onOpenChange={(next) => {
                if (!next) closeOrb();
              }}
            />
          )}
        </div>

        {mode === 'voice' && isOpen && (
          <div
            id={`${panelId}-voice-pane`}
            role="tabpanel"
            aria-labelledby={`${panelId}-voice-tab`}
            style={{ display: 'flex', flex: 1, minHeight: 0, flexDirection: 'column', overflow: 'hidden' }}
          >
            <VoiceInvitationAgent
              key={voiceKey}
              slug={slug}
              capabilities={capabilities}
              guest={guest}
              audience={audience}
              embedded
              open
              accessRevoked={accessRevoked}
              eventClosed={eventClosed}
              onApplyQuote={onApplyQuote}
              onConfirmRsvp={onConfirmRsvp}
              onShowToast={onShowToast}
              onOpenChange={(next) => {
                if (!next) closeOrb();
              }}
            />
          </div>
        )}
      </section>
    </>
  );
};
