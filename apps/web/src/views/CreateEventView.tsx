import React, { useEffect, useRef, useState } from 'react';
import type { EventInput } from '../types';
import { api } from '../api/client';
import { rememberAdminKey } from '../api/admin-key';
import { OrganizerLinkCard } from '../components/dashboard/OrganizerLinkCard';
import { RecoveryEmailCard } from '../components/dashboard/RecoveryEmailCard';
import { CreateEventForm } from '../components/events/CreateEventForm';

interface CreateEventViewProps {
  onEventCreated: (slug: string) => void;
  onCancel: () => void;
  onShowToast: (type: 'success' | 'error' | 'info' | 'warning', message: string, title?: string) => void;
  recoveryAvailable?: boolean;
}

export const CreateEventView: React.FC<CreateEventViewProps> = ({
  onEventCreated,
  onCancel,
  onShowToast,
  recoveryAvailable = false,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [created, setCreated] = useState<{ slug: string; adminKey: string } | null>(null);
  const mountedRef = useRef(true);
  const inFlightRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleSubmit = async (input: EventInput) => {
    if (inFlightRef.current) {
      return inFlightRef.current;
    }

    const run = (async () => {
      if (mountedRef.current) setIsLoading(true);
      try {
        const res = await api.createEvent(input);
        if (res.adminKey) rememberAdminKey(res.event.slug, res.adminKey);
        if (!mountedRef.current) return;
        onShowToast('success', `¡Fiesta "${res.event.title}" creada con éxito!`, 'Fiesta Creada');
        if (res.adminKey) setCreated({ slug: res.event.slug, adminKey: res.adminKey });
        else onEventCreated(res.event.slug);
      } catch (err: any) {
        if (!mountedRef.current) return;
        onShowToast('error', err.message || 'No se pudo crear la fiesta', 'Error al crear');
        throw err;
      } finally {
        if (mountedRef.current) setIsLoading(false);
      }
    })();

    inFlightRef.current = run;
    try {
      await run;
    } finally {
      inFlightRef.current = null;
    }
  };

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto' }}>
      <div className="panel" style={{ padding: '1.75rem' }}>
        <div style={{ marginBottom: '1.25rem' }}>
          <span className="badge badge-blue" style={{ marginBottom: '0.35rem' }}>
            Nueva Fiesta
          </span>
          <h1 style={{ fontSize: '1.75rem', color: 'var(--color-ink)' }}>Crea tu Próxima Fiesta</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-ink-muted)' }}>
            Elige una de las 4 plantillas, personaliza la cuota en dólares y comparte el enlace con tus amigos.
          </p>
        </div>

        {created ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <OrganizerLinkCard slug={created.slug} adminKey={created.adminKey} recoveryAvailable={recoveryAvailable} />
            <RecoveryEmailCard slug={created.slug} available={recoveryAvailable} />
            <button type="button" className="btn btn-primary" onClick={() => onEventCreated(created.slug)}>
              Ir al panel
            </button>
          </div>
        ) : (
          <>
            {isLoading ? (
              <div className="create-event-progress" role="status" aria-live="polite" aria-busy="true">
                <p>Creando la fiesta…</p>
                <div className="create-event-progress-bar" aria-hidden="true" />
              </div>
            ) : null}
            <CreateEventForm onSubmit={handleSubmit} onCancel={onCancel} isLoading={isLoading} />
          </>
        )}
      </div>
    </div>
  );
};
