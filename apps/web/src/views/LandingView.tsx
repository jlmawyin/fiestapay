import React from 'react';
import { PartyPopper } from 'lucide-react';
import { UI_LABELS } from '@fiestapay/shared';
import type { Capabilities, FiestaEvent } from '../types';
import { EventCard } from '../components/demo/EventCard';
import { VoiceWelcomeCard } from '../components/voice/VoiceWelcomeCard';
import { useI18n, useMessages } from '../i18n/I18nContext';
import { landingCatalog } from '../i18n/catalogs/landing';
import { cardsCatalog } from '../i18n/catalogs/cards';
import { isDemoEvent } from '../lib/event-presentation';
import type { CreatePath } from '../lib/create-interview';

export interface LandingViewProps {
  events: FiestaEvent[];
  isLoading: boolean;
  /** Voice capabilities. The welcome card only shows while voice is known to be on. */
  capabilities?: Capabilities | null;
  /** A bounded read failure. Existing events stay visible. */
  eventsError?: string | null;
  onRetryEvents?: () => void;
  onNavigateCreate: (path?: CreatePath) => void;
  onNavigateInvite: (slug: string) => void;
  onNavigateDashboard: (slug: string) => void;
  onNavigateDemo: (quick?: boolean) => void;
  onNavigateRecover: () => void;
}

/**
 * Product landing: the story, how it works in 3 steps, the two CTAs, the
 * use-case shortcuts, and the visitor's own invitations only
 * (`isDemo !== true`; rows without the flag count as own).
 */
export const LandingView: React.FC<LandingViewProps> = ({
  events,
  isLoading,
  capabilities = null,
  eventsError,
  onRetryEvents,
  onNavigateCreate,
  onNavigateInvite,
  onNavigateDashboard,
  onNavigateDemo,
  onNavigateRecover,
}) => {
  const { locale } = useI18n();
  const m = useMessages(landingCatalog);
  const cards = useMessages(cardsCatalog);
  const labels = UI_LABELS[locale];
  const ownEvents = events.filter((event) => !isDemoEvent(event));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', minWidth: 0 }}>
      <section
        aria-label={m.introLabel}
        style={{
          background: 'linear-gradient(135deg, #FFFFFF 0%, var(--color-blue-tint) 100%)',
          borderRadius: 'var(--radius-xl)',
          border: '1.5px solid var(--color-border)',
          padding: '1.25rem 1.4rem',
          boxShadow: 'var(--shadow-md)',
          minWidth: 0,
        }}
      >
        <span className="badge badge-teal" style={{ marginBottom: '0.5rem' }}>
          {labels.sandboxBadge}
        </span>
        <h1 style={{ fontSize: 'clamp(1.45rem, 4vw, 1.9rem)', marginBottom: '0.5rem', maxWidth: '720px' }}>
          {m.title}
        </h1>
        <p style={{ color: 'var(--color-ink-muted)', fontSize: '0.92rem', margin: '0 0 0.65rem', maxWidth: '720px' }}>
          {m.story}
        </p>
        <p
          style={{
            color: 'var(--color-ink)',
            fontSize: '0.8rem',
            lineHeight: 1.5,
            margin: '0 0 1rem',
            maxWidth: '720px',
            borderLeft: '3px solid var(--color-teal)',
            paddingLeft: '0.6rem',
          }}
        >
          {m.differentiation}
        </p>
        {capabilities?.voice === true ? (
          <div style={{ margin: '0 0 1rem', maxWidth: '720px' }}>
            <VoiceWelcomeCard />
          </div>
        ) : null}
        <div className="landing-stats" aria-label={m.statsTitle}>
          <p className="landing-stats__title">{m.statsTitle}</p>
          <ul className="landing-stats__list">
            <li>{m.statsDrafts}</li>
            <li>{m.statsFields}</li>
            <li>{m.statsQuotes}</li>
          </ul>
          <p className="landing-stats__note">{m.statsNote}</p>
        </div>
        <h2 className="landing-choose__title">{m.chooseTitle}</h2>
        <div className="landing-choose__actions">
          <button
            type="button"
            onClick={() => onNavigateCreate('sentence')}
            className="btn btn-primary"
            data-guide="createInvitation"
          >
            {m.pathSentence}
          </button>
          <button type="button" onClick={() => onNavigateCreate('interview')} className="btn btn-secondary">
            {m.pathInterview}
          </button>
        </div>
        <button type="button" onClick={() => onNavigateCreate('manual')} className="landing-path-link">
          {m.pathManual}
        </button>
        <div className="landing-judge-path">
          <div>
            <strong>{m.judgePathTitle}</strong>
            <p>{m.judgePathText}</p>
          </div>
          <div className="landing-judge-path__actions">
            <button type="button" onClick={() => onNavigateDemo(true)} className="btn btn-teal">
              {m.judgePathCta}
            </button>
          </div>
        </div>
      </section>

      <section aria-label={m.stepsTitle} style={{ minWidth: 0 }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>{m.stepsTitle}</h2>
        <ol style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: 0, margin: 0 }}>
          {[
            { title: m.step1Title, text: m.step1Text },
            { title: m.step2Title, text: m.step2Text },
            { title: m.step3Title, text: m.step3Text },
          ].map((step, index) => (
            <li
              key={step.title}
              style={{
                display: 'flex',
                gap: '0.75rem',
                alignItems: 'flex-start',
                backgroundColor: '#FFFFFF',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: '0.8rem 0.95rem',
                minWidth: 0,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  flex: '0 0 1.75rem',
                  width: '1.75rem',
                  height: '1.75rem',
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-blue)',
                  color: '#FFFFFF',
                  fontWeight: 800,
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {index + 1}
              </span>
              <div style={{ minWidth: 0 }}>
                <strong style={{ display: 'block', fontSize: '0.92rem' }}>{step.title}</strong>
                <span style={{ fontSize: '0.85rem', color: 'var(--color-ink-muted)' }}>{step.text}</span>
              </div>
            </li>
          ))}
        </ol>
        <p
          style={{
            margin: '0.75rem 0 0',
            padding: '0.6rem 0.7rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-surface-subtle)',
            fontSize: '0.78rem',
            color: 'var(--color-ink)',
          }}
        >
          {m.sandboxNote}
        </p>
      </section>

      <section aria-label={m.useCasesTitle} style={{ minWidth: 0 }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>{m.useCasesTitle}</h2>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => onNavigateCreate()} className="btn btn-secondary">
            {m.useCaseSchool}
          </button>
          <button type="button" onClick={() => onNavigateCreate()} className="btn btn-secondary">
            {m.useCaseWork}
          </button>
        </div>
      </section>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          flexWrap: 'wrap',
          padding: '0.85rem 1rem',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--color-surface-subtle)',
        }}
      >
        <div>
          <strong style={{ fontSize: '0.9rem' }}>{m.recoverTitle}</strong>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-ink-muted)' }}>
            {m.recoverText}
          </p>
        </div>
        <button type="button" onClick={onNavigateRecover} className="btn btn-secondary">
          {labels.recoverLink}
        </button>
      </div>

      <section id="my-invitations" aria-label={labels.myInvitations} tabIndex={-1} style={{ minWidth: 0 }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>
          {labels.myInvitations}
          <span style={{ marginLeft: '0.6rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-ink-muted)' }}>
            {cards.registeredCount(ownEvents.length)}
          </span>
        </h2>

        {isLoading ? (
          <div className="panel" style={{ textAlign: 'center', padding: '3rem' }}>
            <div style={{ color: 'var(--color-ink-muted)' }}>{cards.loading}</div>
          </div>
        ) : eventsError && ownEvents.length === 0 ? (
          <div className="panel" role="alert" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>{cards.loadErrorTitle}</h3>
            <p style={{ color: 'var(--color-ink-muted)', marginBottom: '1rem' }}>{eventsError}</p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => onRetryEvents?.()} className="btn btn-primary">
                {cards.retry}
              </button>
              <button type="button" onClick={() => onNavigateCreate()} className="btn btn-secondary">
                {cards.createButton}
              </button>
            </div>
          </div>
        ) : ownEvents.length === 0 ? (
          <div
            className="panel"
            style={{
              textAlign: 'center',
              padding: '2.5rem 1.5rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1rem',
            }}
          >
            <div style={{ color: 'var(--color-coral)' }} aria-hidden="true">
              <PartyPopper size={44} aria-hidden="true" />
            </div>
            <h3 style={{ fontSize: '1.25rem' }}>{m.emptyTitle}</h3>
            <p style={{ color: 'var(--color-ink-muted)', maxWidth: '460px', fontSize: '0.9rem' }}>
              {m.emptyText}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button type="button" onClick={() => onNavigateCreate()} className="btn btn-primary" data-guide="createInvitation">
                {labels.createInvitation}
              </button>
              <button type="button" onClick={() => onNavigateDemo()} className="btn btn-secondary">
                {labels.judgesDemo}
              </button>
            </div>
          </div>
        ) : (
          <div className="event-home-grid">
            {ownEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onNavigateInvite={onNavigateInvite}
                onNavigateDashboard={onNavigateDashboard}
                onNavigateRecover={onNavigateRecover}
              />
            ))}
          </div>
        )}
        {!isLoading && eventsError && ownEvents.length > 0 ? (
          <p role="alert" style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--color-coral)' }}>
            {eventsError}{' '}
            <button type="button" onClick={() => onRetryEvents?.()} className="btn btn-secondary" style={{ padding: '0.2rem 0.55rem', fontSize: '0.75rem' }}>
              {cards.retry}
            </button>
          </p>
        ) : null}
      </section>
    </div>
  );
};
