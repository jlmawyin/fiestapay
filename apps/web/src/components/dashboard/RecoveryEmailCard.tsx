import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { RecoveryContactStatus } from '../../types';

interface RecoveryEmailCardProps {
  slug: string;
  available: boolean;
}

const stateLabel = (contact: RecoveryContactStatus): string => {
  if (contact.state === 'verified' && contact.masked) return `Correo verificado: ${contact.masked}`;
  if (contact.state === 'pending' && contact.masked) return `Correo pendiente de confirmar: ${contact.masked}`;
  return 'Sin correo de recuperacion';
};

export const RecoveryEmailCard: React.FC<RecoveryEmailCardProps> = ({ slug, available }) => {
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
      if (!cancel) setNote('No se pudo leer el estado del correo.');
    });
    return () => {
      cancel = true;
    };
  }, [slug, available]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      const saved = await api.setRecoveryContact(slug, email);
      setContact(saved.contact);
      setEmail('');
      if (saved.delivery === 'unchanged') setNote('Ese correo ya estaba verificado.');
      else setNote('El servidor de salida acepto el correo. Eso no confirma que haya llegado a la bandeja.');
    } catch (err: unknown) {
      setNote(err instanceof Error ? err.message : 'No se pudo guardar el correo');
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
      setNote('Correo quitado. Los enlaces anteriores ya no sirven.');
    } catch (err: unknown) {
      setNote(err instanceof Error ? err.message : 'No se pudo quitar el correo');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel" aria-label="Correo opcional">
      <h2 style={{ fontSize: '1.15rem', marginBottom: '0.35rem' }}>Correo opcional</h2>
      {!available ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-ink-muted)' }}>
          El correo de recuperacion no esta disponible en este servidor. La invitación se crea igual y el enlace de organizador sigue siendo el acceso.
        </p>
      ) : (
        <>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-ink-muted)', marginBottom: '0.75rem' }}>
            No hace falta un correo para crear la invitación. Si lo guardas, primero hay que confirmarlo. Despues puede servir para pedir un enlace nuevo.
          </p>
          <p style={{ fontSize: '0.875rem', marginBottom: '0.75rem' }}>{contact ? stateLabel(contact) : 'Leyendo estado...'}</p>
          <form onSubmit={(event) => void save(event)} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <label className="form-label" htmlFor={`recovery-email-${slug}`} style={{ flexBasis: '100%' }}>
              Correo del organizador
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
              {busy ? 'Guardando...' : 'Guardar correo'}
            </button>
            {contact && contact.state !== 'none' ? (
              <button type="button" className="btn btn-secondary" onClick={() => void remove()} disabled={busy}>
                Quitar correo
              </button>
            ) : null}
          </form>
          {note ? <p style={{ fontSize: '0.875rem', marginTop: '0.75rem' }}>{note}</p> : null}
        </>
      )}
    </section>
  );
};
