import React, { useState } from 'react';
import type { TemplateKind } from '../../types';
import { GUEST_ENTRY_COPY, guestEntryCopy } from '../../lib/event-presentation';

interface JoinFormProps {
  onJoin: (name: string) => Promise<void>;
  isLoading: boolean;
  /** When set, the alias field stays visible and disabled. */
  disabledReason?: string | null;
  /** Omitted callers get neutral copy. The invitation passes the real template. */
  template?: TemplateKind | null;
}

export const JoinForm: React.FC<JoinFormProps> = ({
  onJoin,
  isLoading,
  disabledReason = null,
  template = null,
}) => {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const copy = guestEntryCopy(template);
  const locked = isLoading || Boolean(disabledReason);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (locked) return;
    if (!name.trim()) {
      setError(GUEST_ENTRY_COPY.aliasError);
      return;
    }
    setError(null);
    try {
      await onJoin(name.trim());
    } catch (err: any) {
      setError(err?.message || GUEST_ENTRY_COPY.joinError);
    }
  };

  return (
    <div
      style={{
        backgroundColor: 'var(--color-yellow-tint)',
        border: '1.5px solid var(--color-yellow)',
        borderRadius: 'var(--radius-lg)',
        padding: '1.25rem',
        maxWidth: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '1.3rem' }} aria-hidden="true">👋</span>
        <h3 style={{ fontSize: '1.1rem', color: 'var(--color-ink)' }}>{copy.welcome}</h3>
      </div>
      <p style={{ fontSize: '0.85rem', color: 'var(--color-ink-muted)', marginBottom: '1rem' }}>
        {GUEST_ENTRY_COPY.aliasHelp}
      </p>

      {disabledReason && (
        <div className="session-revoked-banner" role="status" style={{ marginBottom: '0.75rem' }}>
          {disabledReason}
        </div>
      )}

      {error && (
        <div
          style={{
            backgroundColor: 'var(--color-coral-tint)',
            color: 'var(--color-coral)',
            padding: '0.5rem 0.75rem',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.825rem',
            marginBottom: '0.75rem',
          }}
          role="alert"
        >
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        aria-label="Ingreso del invitado"
        style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', maxWidth: '100%' }}
      >
        <input
          className="form-input"
          style={{ flex: '1 1 11rem', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box' }}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={GUEST_ENTRY_COPY.aliasPlaceholder}
          aria-label={GUEST_ENTRY_COPY.aliasLabel}
          name="attendee-name"
          id="attendee-name"
          required
          disabled={locked}
        />
        <button
          type="submit"
          className="btn btn-primary"
          style={{ flex: '1 1 8rem', minWidth: 0 }}
          disabled={locked || !name.trim()}
        >
          {isLoading ? GUEST_ENTRY_COPY.entering : copy.join}
        </button>
      </form>
    </div>
  );
};
