/**
 * Avatar Napster en la portada raíz (NAP-F3, visitante Público).
 * Depende de `useNapsterSession` (ciclo de vida), del catálogo
 * `i18n/messages/avatar` y del recorrido fijo `contenido/tutorial.json` como
 * respaldo sin IA. Primero muestra bienvenida y consentimiento; el video inline
 * solo se monta tras el clic en «Conversar con video y voz».
 */
import React, { useEffect, useRef } from 'react';
import type { AvatarLang } from '@fiestapay/shared';
import '@touchcastllc/napster-companion-api/styles';
import '../../styles/napster-avatar.css';
import tutorial from '../../../../../contenido/tutorial.json';
import { useI18n, useMessages } from '../../i18n/I18nContext';
import { avatarCatalog } from '../../i18n/messages/avatar';
import { useNapsterSession } from './useNapsterSession';

type LocaleKey = 'es' | 'en';

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

export const NapsterAvatar: React.FC = () => {
  const { locale } = useI18n();
  const texts = useMessages(avatarCatalog);
  const lang: AvatarLang = locale === 'en' ? 'en' : 'es';
  const page = lang as LocaleKey;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const session = useNapsterSession({ lang, containerRef });
  const { status, reason, captions, notifyLocation } = session;

  // NAP-F3: con la sesión viva, cada cambio de sección visible avisa al agente
  // con send_message sistema y trigger_response:false (doc client-commands).
  useEffect(() => {
    if (status !== 'live' || typeof IntersectionObserver === 'undefined') return;
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

  if (status === 'idle') {
    return (
      <section className="napster-card" data-testid="napster-avatar" aria-labelledby="napster-welcome">
        <h2 id="napster-welcome">{texts.welcomeTitle}</h2>
        <p>{texts.welcomeText}</p>
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
    const title =
      reason === 'busy' ? texts.busyTitle : reason === 'reading' ? texts.readingTitle : texts.unavailableTitle;
    const body = reason === 'busy' ? texts.busyBody : reason === 'reading' ? null : texts.unavailableBody;
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
