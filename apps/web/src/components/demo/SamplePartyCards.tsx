import React from 'react';
import { Flag, Target, Users, Wallet } from 'lucide-react';
import { TemplateCover } from '../illustrations/TemplateCover';
import { ThemeScope } from '../events/ThemeScope';
import { useI18n, useMessages } from '../../i18n/I18nContext';
import { demoCatalog } from '../../i18n/catalogs/demo';
import {
  goalProgressPercent,
  minimumProgressPercent,
  resolveTheme,
} from '../../lib/event-presentation';
import { sampleCollectedCents, samplePartyTitle, type SampleParty } from '../../lib/sample-parties';

interface SamplePartyCardsProps {
  parties: SampleParty[];
  selectedId: string;
  onSelect: (id: string) => void;
}

function progressBar(pct: number, label: string): React.ReactElement {
  return (
    <span
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
      style={{
        display: 'block',
        height: '8px',
        borderRadius: 'var(--radius-full)',
        backgroundColor: 'var(--theme-tint, var(--color-surface-subtle))',
        overflow: 'hidden',
        marginTop: '0.25rem',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'block',
          height: '100%',
          width: `${pct}%`,
          borderRadius: 'var(--radius-full)',
          backgroundColor: 'var(--theme-accent, var(--color-teal))',
        }}
      />
    </span>
  );
}

/**
 * Fixed fictional parties. Read-only: selecting a card only decides which
 * guests the sample grid below shows. No fetch, no payment, no moderation.
 */
export const SamplePartyCards: React.FC<SamplePartyCardsProps> = ({ parties, selectedId, onSelect }) => {
  const { formatMoney, locale } = useI18n();
  const m = useMessages(demoCatalog);
  return (
    <div className="event-home-grid" role="radiogroup" aria-label={m.sampleGroupAria}>
      {parties.map((party) => {
        const theme = resolveTheme(party.template, party.themeKey);
        const selected = party.id === selectedId;
        const collected = sampleCollectedCents(party);
        const confirmed = party.guests.filter((guest) => guest.attendance === 'yes').length;
        const paid = party.guests.filter((guest) => guest.paidCents > 0 && guest.dueCents === 0).length;
        const pending = party.guests.filter((guest) => guest.dueCents > 0).length;
        const minReached = collected >= party.minimumCents;
        const minPct = minimumProgressPercent(collected, party.minimumCents, minReached) ?? 0;
        const goalPct = goalProgressPercent(collected, party.goalCents) ?? 0;
        const minLabel = m.sampleMin(formatMoney(party.minimumCents), minPct);
        const goalLabel = m.sampleGoal(formatMoney(party.goalCents), goalPct);
        return (
          <ThemeScope key={party.id} theme={theme}>
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelect(party.id)}
              className="ticket-card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
                minWidth: 0,
                padding: 0,
                textAlign: 'left',
                fontFamily: 'inherit',
                color: 'inherit',
                cursor: 'pointer',
                borderWidth: '2px',
                borderColor: selected ? 'var(--theme-accent, var(--color-blue))' : undefined,
                boxShadow: selected
                  ? 'inset 0 0 0 1px var(--theme-accent, var(--color-blue))'
                  : undefined,
              }}
            >
              <TemplateCover template={party.template} accent={theme.accent} height="96px" />
              <span style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.9rem 1rem 1rem' }}>
                <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem' }}>
                  <span className="badge badge-blue">{m.sampleQuota(formatMoney(party.priceCents))}</span>
                  {selected ? <span className="badge badge-teal">{m.sampleSelected}</span> : null}
                </span>
                <span style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-ink)' }}>
                  {samplePartyTitle(party, locale)}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--color-ink-muted)' }}>
                  <Users size={14} aria-hidden="true" />
                  <span>{m.sampleGuests(confirmed, paid, pending)}</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-teal)' }}>
                  <Wallet size={14} aria-hidden="true" />
                  <span>{m.sampleRaised(formatMoney(collected))}</span>
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--color-ink-muted)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Flag size={14} aria-hidden="true" />
                    <span>{minLabel}</span>
                  </span>
                  {progressBar(minPct, minLabel)}
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--color-ink-muted)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Target size={14} aria-hidden="true" />
                    <span>{goalLabel}</span>
                  </span>
                  {progressBar(goalPct, goalLabel)}
                </span>
              </span>
            </button>
          </ThemeScope>
        );
      })}
    </div>
  );
};
