import React, { useEffect, useState } from 'react';
import type { Guest, RsvpStatus, FiestaEvent } from '../../types';

interface RsvpFormProps {
  guest: Guest;
  event: FiestaEvent;
  onSaveRsvp: (status: RsvpStatus, companions: number) => Promise<void>;
  isLoading: boolean;
}

const explicitKey = (guestId: string): string => `fp_rsvp_explicit_${guestId}`;

/** A brand-new guest is stored as maybe. That is not a choice until the person selects one. */
export function visibleRsvpChoice(guest: Pick<Guest, 'id' | 'status' | 'companions'>): RsvpStatus | null {
  if (guest.status === 'yes' || guest.status === 'no') return guest.status;
  if (guest.companions > 0) return 'maybe';
  try {
    if (sessionStorage.getItem(explicitKey(guest.id)) === 'maybe') return 'maybe';
  } catch {
    /* Storage is optional. */
  }
  return null;
}

export const RsvpForm: React.FC<RsvpFormProps> = ({ guest, event, onSaveRsvp, isLoading }) => {
  const [status, setStatus] = useState<RsvpStatus | null>(() => visibleRsvpChoice(guest));
  const [companions, setCompanions] = useState<number>(guest.companions || 0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStatus(visibleRsvpChoice(guest));
    setCompanions(guest.companions || 0);
  }, [guest.id, guest.status, guest.companions]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!status) {
      setError('Elige si vienes antes de guardar.');
      return;
    }
    try {
      await onSaveRsvp(status, companions);
      if (status === 'maybe') {
        try {
          sessionStorage.setItem(explicitKey(guest.id), 'maybe');
        } catch {
          /* The server copy remains. This browser may ask again. */
        }
      }
    } catch (err: any) {
      setError(err.message || 'Error al guardar asistencia.');
    }
  };

  const isFull =
    event.capacity !== null &&
    event.confirmedPeople >= event.capacity &&
    guest.status !== 'yes';

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        backgroundColor: 'var(--color-surface)',
        border: '1.5px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: '1.25rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <h3 style={{ fontSize: '1.1rem' }}>Tu Asistencia</h3>
        <span style={{ fontSize: '0.85rem', color: 'var(--color-ink-muted)' }}>
          Invitado: <strong style={{ color: 'var(--color-ink)' }}>{guest.name}</strong>
        </span>
      </div>

      {isFull && (
        <div
          style={{
            backgroundColor: 'var(--color-yellow-tint)',
            border: '1px solid var(--color-yellow)',
            padding: '0.65rem 0.85rem',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.825rem',
            marginBottom: '0.85rem',
            color: 'var(--color-ink)',
          }}
          role="alert"
        >
          La capacidad máxima de esta invitación ({event.capacity} personas) ya está completa. Si confirmas ahora, se verificará disponibilidad en el servidor.
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

      {/* RSVP Status Buttons */}
      <div
        className="rsvp-choice-grid"
        style={{ marginBottom: '1rem' }}
        role="radiogroup"
        aria-label="Selecciona tu confirmación de asistencia"
      >
        <button
          type="button"
          role="radio"
          aria-checked={status === 'yes'}
          onClick={() => setStatus('yes')}
          className="btn"
          style={{
            backgroundColor: status === 'yes' ? 'var(--color-teal-tint)' : 'var(--color-surface)',
            color: status === 'yes' ? 'var(--color-teal)' : 'var(--color-ink)',
            borderColor: status === 'yes' ? 'var(--color-teal)' : 'var(--color-border)',
            borderWidth: status === 'yes' ? '2px' : '1px',
            fontWeight: status === 'yes' ? 800 : 600,
            padding: '0.65rem 0.4rem',
            fontSize: '0.875rem',
          }}
        >
          ✓ ¡Sí, voy!
        </button>

        <button
          type="button"
          role="radio"
          aria-checked={status === 'maybe'}
          onClick={() => setStatus('maybe')}
          className="btn"
          style={{
            backgroundColor: status === 'maybe' ? 'var(--color-yellow-tint)' : 'var(--color-surface)',
            color: status === 'maybe' ? 'var(--color-yellow-dark)' : 'var(--color-ink)',
            borderColor: status === 'maybe' ? 'var(--color-yellow)' : 'var(--color-border)',
            borderWidth: status === 'maybe' ? '2px' : '1px',
            fontWeight: status === 'maybe' ? 800 : 600,
            padding: '0.65rem 0.4rem',
            fontSize: '0.875rem',
          }}
        >
          ? Tal vez
        </button>

        <button
          type="button"
          role="radio"
          aria-checked={status === 'no'}
          onClick={() => {
            setStatus('no');
            setCompanions(0);
          }}
          className="btn"
          style={{
            backgroundColor: status === 'no' ? 'var(--color-coral-tint)' : 'var(--color-surface)',
            color: status === 'no' ? 'var(--color-coral)' : 'var(--color-ink)',
            borderColor: status === 'no' ? 'var(--color-coral)' : 'var(--color-border)',
            borderWidth: status === 'no' ? '2px' : '1px',
            fontWeight: status === 'no' ? 800 : 600,
            padding: '0.65rem 0.4rem',
            fontSize: '0.875rem',
          }}
        >
          ✕ No podré ir
        </button>
      </div>

      {/* Companions Count (only if yes or maybe) */}
      {(status === 'yes' || status === 'maybe') && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.75rem',
            backgroundColor: 'var(--color-surface-subtle)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1rem',
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>¿Traes acompañantes?</div>
            <div style={{ fontSize: '0.775rem', color: 'var(--color-ink-muted)' }}>
              Pareja, amigos o familiares que vendrán contigo
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '32px', height: '32px', padding: 0 }}
              onClick={() => setCompanions(Math.max(0, companions - 1))}
              disabled={companions <= 0}
              aria-label="Restar un acompañante"
            >
              -
            </button>
            <span style={{ fontWeight: 800, minWidth: '24px', textAlign: 'center', fontSize: '1rem' }}>
              +{companions}
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '32px', height: '32px', padding: 0 }}
              onClick={() => setCompanions(companions + 1)}
              disabled={companions >= 10}
              aria-label="Añadir un acompañante"
            >
              +
            </button>
          </div>
        </div>
      )}

      {/* Save Button */}
      <button type="submit" className="btn btn-teal" style={{ width: '100%' }} disabled={isLoading}>
        {isLoading ? 'Guardando respuesta...' : 'Actualizar mi Asistencia'}
      </button>
    </form>
  );
};
