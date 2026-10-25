import React, { useState } from 'react';
import type { EventInput } from '../types';
import { api } from '../api/client';
import { rememberAdminKey } from '../api/admin-key';
import { OrganizerLinkCard } from '../components/dashboard/OrganizerLinkCard';
import { CreateEventForm } from '../components/events/CreateEventForm';

interface CreateEventViewProps {
  onEventCreated: (slug: string) => void;
  onCancel: () => void;
  onShowToast: (type: 'success' | 'error' | 'info' | 'warning', message: string, title?: string) => void;
}

export const CreateEventView: React.FC<CreateEventViewProps> = ({
  onEventCreated,
  onCancel,
  onShowToast,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [created, setCreated] = useState<{ slug: string; adminKey: string } | null>(null);

  const handleSubmit = async (input: EventInput) => {
    setIsLoading(true);
    try {
      const res = await api.createEvent(input);
      if (res.adminKey) rememberAdminKey(res.event.slug, res.adminKey);
      onShowToast('success', `¡Fiesta "${res.event.title}" creada con éxito!`, 'Fiesta Creada');
      if (res.adminKey) setCreated({ slug: res.event.slug, adminKey: res.adminKey });
      else onEventCreated(res.event.slug);
    } catch (err: any) {
      onShowToast('error', err.message || 'No se pudo crear la fiesta', 'Error al crear');
      throw err;
    } finally {
      setIsLoading(false);
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
            <OrganizerLinkCard slug={created.slug} adminKey={created.adminKey} />
            <button type="button" className="btn btn-primary" onClick={() => onEventCreated(created.slug)}>
              Ir al panel
            </button>
          </div>
        ) : (
          <CreateEventForm onSubmit={handleSubmit} onCancel={onCancel} isLoading={isLoading} />
        )}
      </div>
    </div>
  );
};
