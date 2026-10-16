import React, { useState } from 'react';
import type { FiestaEvent } from '../types';
import { usd } from '../types';
import { GatheringTable } from '../components/illustrations/GatheringTable';
import { TemplateCover } from '../components/illustrations/TemplateCover';
import { Modal } from '../components/common/Modal';

interface OrganizerHomeViewProps {
  events: FiestaEvent[];
  isLoading: boolean;
  onNavigateCreate: () => void;
  onNavigateInvite: (slug: string) => void;
  onNavigateDashboard: (slug: string) => void;
  onCreateDemo: () => Promise<void>;
  onResetDemo: () => Promise<void>;
  isResetting: boolean;
}

export const OrganizerHomeView: React.FC<OrganizerHomeViewProps> = ({
  events,
  isLoading,
  onNavigateCreate,
  onNavigateInvite,
  onNavigateDashboard,
  onCreateDemo,
  onResetDemo,
  isResetting,
}) => {
  const [showResetModal, setShowResetModal] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);

  const handleDemoClick = async () => {
    setIsDemoLoading(true);
    try {
      await onCreateDemo();
    } finally {
      setIsDemoLoading(false);
    }
  };

  const handleConfirmReset = async () => {
    try {
      await onResetDemo();
      setShowResetModal(false);
    } catch {
      // handled
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Signature Banner with GatheringTable illustration */}
      <section
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 'var(--radius-xl)',
          border: '1.5px solid var(--color-border)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-ticket)',
        }}
        aria-label="Panel principal del organizador"
      >
        <div style={{ maxHeight: '200px', overflow: 'hidden' }}>
          <GatheringTable height="180px" />
        </div>
        <div style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>
              Organiza tus Fiestas, Claridad en Cada Cuota
            </h1>
            <p style={{ color: 'var(--color-ink-muted)', fontSize: '0.95rem' }}>
              Crea invitaciones públicas con precios fijos, confirma asistencia con amigos y recibe pagos vía PayPal Sandbox.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button onClick={onNavigateCreate} className="btn btn-primary">
              + Crear Nueva Fiesta
            </button>
            <button
              onClick={() => setShowResetModal(true)}
              className="btn btn-secondary"
              style={{ color: 'var(--color-coral)' }}
              title="Reiniciar datos de demostración"
            >
              Reiniciar Demo
            </button>
          </div>
        </div>
      </section>

      {/* Events List */}
      <section aria-label="Tus fiestas organizadas">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.35rem' }}>Tus Fiestas Activas</h2>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-ink-muted)' }}>
            {events.length} {events.length === 1 ? 'fiesta registrada' : 'fiestas registradas'}
          </span>
        </div>

        {isLoading ? (
          <div className="panel" style={{ textAlign: 'center', padding: '3rem' }}>
            <div style={{ color: 'var(--color-ink-muted)' }}>Cargando tus fiestas...</div>
          </div>
        ) : events.length === 0 ? (
          <div
            className="panel"
            style={{
              textAlign: 'center',
              padding: '3rem 1.5rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1rem',
            }}
          >
            <div style={{ fontSize: '2.5rem' }}>🎉</div>
            <h3 style={{ fontSize: '1.25rem' }}>No tienes ninguna fiesta creada aún</h3>
            <p style={{ color: 'var(--color-ink-muted)', maxWidth: '460px', fontSize: '0.9rem' }}>
              Puedes empezar de inmediato creando una nueva fiesta o generando una fiesta demo preconfigurada (Asado Comida $25) para probar el flujo de pagos.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button
                onClick={handleDemoClick}
                className="btn btn-teal"
                disabled={isDemoLoading}
              >
                {isDemoLoading ? 'Generando demo...' : '⚡ Generar Fiesta Demo ($25 USD)'}
              </button>
              <button onClick={onNavigateCreate} className="btn btn-primary">
                + Crear Fiesta Personalizada
              </button>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '1.25rem',
            }}
          >
            {events.map((ev) => {
              const dateStr = new Date(ev.startsAt).toLocaleDateString('es-EC', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <article
                  key={ev.id}
                  className="ticket-card"
                  style={{ display: 'flex', flexDirection: 'column' }}
                >
                  <TemplateCover template={ev.template} height="130px" />

                  <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', flex: 1, gap: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <span className="badge badge-blue" style={{ marginBottom: '0.35rem' }}>
                          Cuota {usd(ev.priceCents)}
                        </span>
                        <h3 style={{ fontSize: '1.15rem', color: 'var(--color-ink)' }}>{ev.title}</h3>
                      </div>
                      {ev.confirmed && <span className="badge badge-teal">Confirmada</span>}
                    </div>

                    <div style={{ fontSize: '0.825rem', color: 'var(--color-ink-muted)' }}>
                      <div>📅 {dateStr}</div>
                      <div>📍 {ev.location}</div>
                    </div>

                    {/* Progress Bar & Financial Transparency */}
                    <div
                      style={{
                        backgroundColor: 'var(--color-surface-subtle)',
                        padding: '0.75rem',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '0.825rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ fontWeight: 600 }}>Recaudado:</span>
                        <strong style={{ color: 'var(--color-teal)' }}>{usd(ev.collectedCents)}</strong>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--color-ink-light)', marginBottom: '0.35rem' }}>
                        (antes de comisiones)
                      </div>
                      {ev.goalCents && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-ink-muted)' }}>
                          <span>Meta:</span>
                          <span>{usd(ev.goalCents)}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.2rem' }}>
                        <span>Asistentes confirmados:</span>
                        <strong>{ev.confirmedPeople} {ev.capacity ? `/ ${ev.capacity}` : ''}</strong>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.5rem' }}>
                      <button
                        onClick={() => onNavigateInvite(ev.slug)}
                        className="btn btn-secondary"
                        style={{ fontSize: '0.825rem', padding: '0.5rem' }}
                      >
                        Ver Invitación
                      </button>
                      <button
                        onClick={() => onNavigateDashboard(ev.slug)}
                        className="btn btn-primary"
                        style={{ fontSize: '0.825rem', padding: '0.5rem' }}
                      >
                        Panel de Control
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Reset Confirmation Modal */}
      <Modal
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
        title="¿Reiniciar Demostración?"
        description="Esta acción afectará las fiestas creadas en esta sesión de organizador."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-ink-muted)', lineHeight: 1.5 }}>
            Al reiniciar, se generará una nueva generación para el organizador. Las invitaciones anteriores se archivarán y no podrán recibir nuevos pagos. Los pagos tardíos que lleguen se conciliarán de forma segura con la generación anterior.
          </p>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button
              onClick={() => setShowResetModal(false)}
              className="btn btn-secondary"
              disabled={isResetting}
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmReset}
              className="btn btn-coral"
              disabled={isResetting}
            >
              {isResetting ? 'Reiniciando...' : 'Sí, Reiniciar Demo'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
