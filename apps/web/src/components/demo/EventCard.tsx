import React from 'react';
import { UI_LABELS } from '@fiestapay/shared';
import type { FiestaEvent } from '../../types';
import { adminKeyFor } from '../../api/admin-key';
import { TemplateCover } from '../illustrations/TemplateCover';
import { ThemeScope } from '../events/ThemeScope';
import { useI18n, useMessages } from '../../i18n/I18nContext';
import { cardsCatalog } from '../../i18n/catalogs/cards';
import { formatEventRange, organizerLine, resolveTheme } from '../../lib/event-presentation';

interface EventCardProps {
  event: FiestaEvent;
  onNavigateInvite: (slug: string) => void;
  onNavigateDashboard: (slug: string) => void;
  onNavigateRecover: () => void;
}

/**
 * Own-invitation and demo card. Same behavior in both lists: the owner
 * dashboard opens only with a local key, otherwise recovery is offered.
 */
export const EventCard: React.FC<EventCardProps> = ({
  event,
  onNavigateInvite,
  onNavigateDashboard,
  onNavigateRecover,
}) => {
  const { locale, formatMoney } = useI18n();
  const m = useMessages(cardsCatalog);
  const labels = UI_LABELS[locale];
  const theme = resolveTheme(event.template, event.theme);
  const hostLine = organizerLine(event.organizerName, locale);
  const whenLabel = formatEventRange(event.startsAt, event.endsAt, undefined, locale);
  const hasAdminKey = Boolean(adminKeyFor(event.slug));

  return (
    <ThemeScope theme={theme}>
      <article className="ticket-card" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TemplateCover template={event.template} accent={theme.accent} height="130px" />

        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', flex: 1, gap: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
            <div style={{ minWidth: 0 }}>
              <span className="badge badge-blue" style={{ marginBottom: '0.35rem' }}>
                {m.quota(formatMoney(event.priceCents))}
              </span>
              <p className="theme-phrase" style={{ fontSize: '0.85rem', margin: '0.2rem 0' }}>{theme.phrase}</p>
              <h3 style={{ fontSize: '1.15rem', color: 'var(--color-ink)' }}>{event.title}</h3>
              {hostLine ? <p style={{ fontSize: '0.8rem', fontWeight: 700 }}>{hostLine}</p> : null}
            </div>
            {event.confirmed && <span className="badge badge-teal">{m.confirmedBadge}</span>}
          </div>

          <div style={{ fontSize: '0.825rem', color: 'var(--color-ink-muted)', overflowWrap: 'anywhere' }}>
            <div>{whenLabel}</div>
            <div>{event.location}</div>
          </div>

          <div
            style={{
              backgroundColor: 'var(--color-surface-subtle)',
              padding: '0.75rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.825rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <span style={{ fontWeight: 600 }}>{m.raisedLabel}</span>
              <strong style={{ color: 'var(--color-teal)' }}>{formatMoney(event.collectedCents)}</strong>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--color-ink-light)', marginBottom: '0.35rem' }}>
              {m.beforeFeesNote}
            </div>
            {event.goalCents && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-ink-muted)' }}>
                <span>{m.goalLabel}</span>
                <span>{formatMoney(event.goalCents)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.2rem' }}>
              <span>{m.attendeesLabel}</span>
              <strong>{event.confirmedPeople} {event.capacity ? `/ ${event.capacity}` : ''}</strong>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.5rem' }}>
            <button
              onClick={() => onNavigateInvite(event.slug)}
              className="btn btn-secondary"
              style={{ fontSize: '0.825rem', padding: '0.5rem' }}
            >
              {m.viewInvite}
            </button>
            {hasAdminKey ? (
              <button
                onClick={() => onNavigateDashboard(event.slug)}
                className="btn btn-primary"
                style={{ fontSize: '0.825rem', padding: '0.5rem' }}
              >
                {m.openDashboard}
              </button>
            ) : (
              <button
                onClick={() => onNavigateRecover()}
                className="btn btn-secondary"
                style={{ fontSize: '0.825rem', padding: '0.5rem' }}
              >
                {labels.recoverLink}
              </button>
            )}
          </div>
          {!hasAdminKey ? (
            <p style={{ fontSize: '0.72rem', color: 'var(--color-ink-muted)', margin: 0 }}>
              {m.noKeyNote}
            </p>
          ) : null}
        </div>
      </article>
    </ThemeScope>
  );
};
