/**
 * Avatar Napster (NAP-F3 portada pública, NAP-F4w invitado/creador y texto).
 * Depende de `useNapsterSession` (ciclo de vida), del catálogo
 * `i18n/messages/avatar` y del recorrido fijo `contenido/tutorial.json` como
 * último respaldo sin IA. Primero muestra bienvenida y consentimiento; el video
 * inline o el chat solo arrancan tras un clic. El visitante lo decide el
 * servidor; la vista solo aporta `eventSlug`/`eventTitle` cuando hay evento.
 */
import React, { useEffect, useRef, useState } from 'react';
import type { AvatarLang } from '@fiestapay/shared';
import '@touchcastllc/napster-companion-api/styles';
import '../../styles/napster-avatar.css';
import tutorial from '../../../../../contenido/tutorial.json';
import { useI18n, useMessages } from '../../i18n/I18nContext';
import { avatarCatalog } from '../../i18n/messages/avatar';
import { useNapsterSession } from './useNapsterSession';
import { createAvatarToolRouter, type AvatarToolRouter } from './toolRouter';
import { markCreateIntent } from './sessionIntent';
import { AVATAR_OPEN_EVENT } from './avatar-open';

type LocaleKey = 'es' | 'en';

export interface NapsterAvatarProps {
  /** Slug del evento abierto; el servidor valida y decide `guest`. */
  eventSlug?: string;
  /** Título visible del evento, para el saludo «Te invitaron a …». */
  eventTitle?: string;
  /** Intención fija de la vista (NAP-F4: el legado pide `intent:'create'`). */
  intent?: 'create';
  /**
   * NAP-F5b: capabilities.avatar de la vista. Con `false` la tarjeta muestra
   * el recorrido fijo sin tocar la red; sin dato se asume disponible.
   */
  avatarEnabled?: boolean;
  /**
   * NAP-F6w: la vista se entera del agente de la sesión ('custom' cuando el
   * evento tiene avatar con la foto del organizador).
   */
  onAgent?: (agent: string | null) => void;
}

/** Sección del DOM → etiqueta de contexto en el idioma de la página. */
function sectionLabel(sectionId: string, texts: (typeof avatarCatalog)['es']): string | null {
  switch (sectionId) {
    case 'portal-section-hero':
      return texts.sectionHero;
    case 'portal-section-como-funciona':
      return texts.sectionHow;
    case 'portal-section-eventos-publicos':
      return texts.sectionEvents;
    case 'portal-section-donaciones':
      return texts.sectionDonations;
    case 'portal-section-compositor':
      return texts.sectionComposer;
    case 'portal-section-preguntas':
      return texts.sectionFaq;
    default:
      return null;
  }
}

export const NapsterAvatar: React.FC<NapsterAvatarProps> = ({ eventSlug, eventTitle, intent, avatarEnabled = true, onAgent }) => {
  const { locale } = useI18n();
  const texts = useMessages(avatarCatalog);
  const lang: AvatarLang = locale === 'en' ? 'en' : 'es';
  const page = lang as LocaleKey;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState('');
  const routerRef = useRef<AvatarToolRouter | null>(null);
  if (!routerRef.current) {
    routerRef.current = createAvatarToolRouter({ visitor: 'public', inviteSlug: eventSlug });
  }
  const session = useNapsterSession({
    lang,
    containerRef,
    eventSlug,
    intent,
    router: routerRef.current,
  });
  const { status, reason, captions, textMessages, textReady, degradedToPublic, agent, notifyLocation } = session;
  const guestGreeting = eventTitle && !degradedToPublic ? eventTitle : null;

  // NAP-F6w: informa del agente ('custom') para el saludo de la invitación.
  useEffect(() => {
    onAgent?.(agent);
  }, [agent, onAgent]);

  // NAP-F3: con la sesión viva, cada cambio de sección visible avisa al agente
  // con send_message sistema y trigger_response:false (doc client-commands).
  useEffect(() => {
    if ((status !== 'live' && status !== 'text') || typeof IntersectionObserver === 'undefined') return;
    const sections = Array.from(document.querySelectorAll('[id^="portal-section-"]'));
    if (sections.length === 0) return;
    let current: string | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = entry.target.id;
          if (id === current) continue;
          current = id;
          const label = sectionLabel(id, texts);
          if (label) notifyLocation(texts.nowAt(label));
        }
      },
      { threshold: 0.3 },
    );
    for (const section of sections) observer.observe(section);
    const onHashChange = (): void => {
      const hash = window.location.hash.replace(/^#/, '');
      const label = hash ? sectionLabel(hash, texts) : null;
      if (label) notifyLocation(texts.nowAt(label));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => {
      observer.disconnect();
      window.removeEventListener('hashchange', onHashChange);
    };
  }, [status, notifyLocation, texts]);

  // NAP-F4w: si la persona pulsa «Crear un nuevo espacio» en la raíz, la
  // siguiente sesión se pide con intent:'create'. Delegación sin tocar la vista.
  useEffect(() => {
    const onClick = (event: MouseEvent): void => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest('[data-testid="portal-create-space"]')) markCreateIntent();
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  // NAP-F5b: el aviso del formulario manual abre la avatar (video con su
  // intent) y lleva hasta la tarjeta.
  const statusRef = useRef(status);
  statusRef.current = status;
  const startRef = useRef(session.start);
  startRef.current = session.start;
  useEffect(() => {
    const onOpen = (): void => {
      if (statusRef.current !== 'idle' && statusRef.current !== 'fallback') return;
      startRef.current();
      try {
        document
          .querySelector('[data-testid="napster-avatar"],[data-testid="napster-avatar-fallback"]')
          ?.scrollIntoView({ block: 'start' });
      } catch {
        // El scroll es cortesía; la sesión ya arrancó.
      }
    };
    document.addEventListener(AVATAR_OPEN_EVENT, onOpen);
    return () => document.removeEventListener(AVATAR_OPEN_EVENT, onOpen);
  }, []);

  if (!avatarEnabled) {
    return (
      <section className="napster-card" data-testid="napster-avatar-fallback" aria-labelledby="napster-fallback">
        <h2 id="napster-fallback">{texts.unavailableTitle}</h2>
        <p>{texts.unavailableBody}</p>
        <ol className="napster-fallback-steps" data-testid="napster-avatar-tutorial">
          {tutorial.pasos.map((paso) => (
            <li key={paso.numero} data-testid={`napster-avatar-step-${paso.numero}`}>
              <p className="napster-step-num">{paso.numero}</p>
              <h3>{paso.titulo[page] ?? paso.titulo.es}</h3>
              <p>{paso.texto[page] ?? paso.texto.es}</p>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  if (status === 'idle') {
    return (
      <section className="napster-card" data-testid="napster-avatar" aria-labelledby="napster-welcome">
        <h2 id="napster-welcome">{guestGreeting ? texts.invitedTitle(guestGreeting) : texts.welcomeTitle}</h2>
        <p>{guestGreeting ? texts.invitedText : texts.welcomeText}</p>
        <p className="napster-consent">{texts.consent}</p>
        <div className="napster-actions">
          <button type="button" className="napster-btn" data-testid="napster-avatar-start" onClick={session.start}>
            {texts.startVideo}
          </button>
          <button
            type="button"
            className="napster-btn napster-btn-secondary"
            data-testid="napster-avatar-read"
            onClick={session.readInstead}
          >
            {texts.preferReading}
          </button>
        </div>
      </section>
    );
  }

  if (status === 'fallback') {
    const title = reason === 'reading' ? texts.readingTitle : texts.unavailableTitle;
    const body = reason === 'reading' ? null : texts.unavailableBody;
    return (
      <section className="napster-card" data-testid="napster-avatar-fallback" aria-labelledby="napster-fallback">
        <h2 id="napster-fallback">{title}</h2>
        {body ? <p>{body}</p> : null}
        <ol className="napster-fallback-steps" data-testid="napster-avatar-tutorial">
          {tutorial.pasos.map((paso) => (
            <li key={paso.numero} data-testid={`napster-avatar-step-${paso.numero}`}>
              <p className="napster-step-num">{paso.numero}</p>
              <h3>{paso.titulo[page] ?? paso.titulo.es}</h3>
              <p>{paso.texto[page] ?? paso.texto.es}</p>
            </li>
          ))}
        </ol>
        <div className="napster-actions">
          <button type="button" className="napster-btn" data-testid="napster-avatar-retry" onClick={session.start}>
            {texts.retryVideo}
          </button>
        </div>
      </section>
    );
  }

  if (status === 'text') {
    return (
      <section className="napster-card" data-testid="napster-avatar-text" aria-labelledby="napster-chat">
        <h2 id="napster-chat">{texts.textTitle}</h2>
        <p className="napster-consent">{textReady ? texts.textHint : texts.textConnecting}</p>
        <ol className="napster-chat-list" aria-live="polite" data-testid="napster-avatar-messages">
          {textMessages.map((message) => (
            <li
              key={message.id}
              data-testid={`napster-avatar-message-${message.id}`}
              className={message.role === 'user' ? 'napster-chat-user' : 'napster-chat-assistant'}
            >
              <span className="napster-caption-role">
                {message.role === 'user' ? texts.youSaid : texts.avatarSays}:{' '}
              </span>
              {message.text}
            </li>
          ))}
        </ol>
        <form
          className="napster-chat-form"
          onSubmit={(event) => {
            event.preventDefault();
            session.sendText(draft);
            setDraft('');
          }}
        >
          <label className="napster-chat-label" htmlFor="napster-chat-input">
            {texts.textPlaceholder}
          </label>
          <input
            id="napster-chat-input"
            data-testid="napster-avatar-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={texts.textPlaceholder}
            autoComplete="off"
            disabled={!textReady}
          />
          <button
            type="submit"
            className="napster-btn"
            data-testid="napster-avatar-send"
            disabled={!textReady || draft.trim().length === 0}
          >
            {texts.textSend}
          </button>
        </form>
        <div className="napster-actions">
          <button type="button" className="napster-btn" data-testid="napster-avatar-end" onClick={session.stop}>
            {texts.endSession}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="napster-card" data-testid="napster-avatar-live" aria-labelledby="napster-session">
      <h2 id="napster-session" className="napster-status">
        {status === 'live' ? texts.liveLabel : texts.connecting}
      </h2>
      <div ref={containerRef} className="napster-video" data-testid="napster-avatar-video" />
      <div className="napster-actions">
        <button type="button" className="napster-btn" data-testid="napster-avatar-end" onClick={session.stop}>
          {texts.endSession}
        </button>
      </div>
      <div className="napster-captions">
        <h3>{texts.captionsTitle}</h3>
        <ol aria-live="polite" data-testid="napster-avatar-captions">
          {captions.map((caption) => (
            <li key={caption.id} data-testid={`napster-avatar-caption-${caption.id}`}>
              <span className="napster-caption-role">
                {caption.role === 'user' ? texts.youSaid : texts.avatarSays}:{' '}
              </span>
              {caption.text}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
};
