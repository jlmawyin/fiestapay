import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { RecoveryContactStatus } from '../../types';
import { useMessages } from '../../i18n/I18nContext';
import { recoveryEmailCatalog } from '../../i18n/messages/organizerRecovery';

interface RecoveryEmailCardProps {
  slug: string;
  available: boolean;
}

type EmailCopy = (typeof recoveryEmailCatalog)['es'];

const stateLabel = (contact: RecoveryContactStatus, m: EmailCopy): string => {
  if (contact.state === 'verified' && contact.masked) return m.stateVerified(contact.masked);
  if (contact.state === 'pending' && contact.masked) return m.statePending(contact.masked);
  return m.stateNone;
};

export const RecoveryEmailCard: React.FC<RecoveryEmailCardProps> = ({ slug, available }) => {
  const m = useMessages(recoveryEmailCatalog);
  const [contact, setContact] = useState<RecoveryContactStatus | null>(null);
  const [email, setEmail] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!available) return;
    let cancel = false;
    setContact(null);
    setNote(null);
    void api.getRecoveryStatus(slug).then((status) => {
      if (!cancel) setContact(status.contact);
    }).catch(() => {
      if (!cancel) setNote(m.readFail);
    });
    return () => {
      cancel = true;
    };
  }, [slug, available, m]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      const saved = await api.setRecoveryContact(slug, email);
      setContact(saved.contact);
      setEmail('');
      if (saved.delivery === 'unchanged') setNote(m.alreadyVerified);
      else setNote(m.acceptedNote);
    } catch (err: unknown) {
      setNote(err instanceof Error ? err.message : m.saveFail);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setNote(null);
    try {
      const cleared = await api.removeRecoveryContact(slug);
      setContact(cleared.contact);
      setNote(m.removedNote);
    } catch (err: unknown) {
      setNote(err instanceof Error ? err.message : m.removeFail);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel" aria-label={m.panelAria}>
      <h2 style={{ fontSize: '1.15rem', marginBottom: '0.35rem' }}>{m.title}</h2>
      {!available ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-ink-muted)' }}>
          {m.unavailable}
        </p>
      ) : (
        <>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-ink-muted)', marginBottom: '0.75rem' }}>
            {m.lead}
          </p>
          <p style={{ fontSize: '0.875rem', marginBottom: '0.75rem' }}>{contact ? stateLabel(contact, m) : m.reading}</p>
          <form onSubmit={(event) => void save(event)} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <label className="form-label" htmlFor={`recovery-email-${slug}`} style={{ flexBasis: '100%' }}>
              {m.emailLabel}
            </label>
            <input
              id={`recovery-email-${slug}`}
              className="form-input"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              maxLength={254}
              style={{ flex: '1 1 220px' }}
            />
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? m.saving : m.save}
            </button>
            {contact && contact.state !== 'none' ? (
              <button type="button" className="btn btn-secondary" onClick={() => void remove()} disabled={busy}>
                {m.remove}
              </button>
            ) : null}
          </form>
          {note ? <p style={{ fontSize: '0.875rem', marginTop: '0.75rem' }}>{note}</p> : null}
        </>
      )}
    </section>
  );
};
