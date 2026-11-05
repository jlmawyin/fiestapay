import React, { useState } from 'react';
import type { FiestaEvent } from '../types';
import { usd } from '../types';
import { adminKeyFor } from '../api/admin-key';
import { GatheringTable } from '../components/illustrations/GatheringTable';
import { TemplateCover } from '../components/illustrations/TemplateCover';
import { ThemeScope } from '../components/events/ThemeScope';
import { Modal } from '../components/common/Modal';
import { formatEventRange, organizerLine, resolveTheme } from '../lib/event-presentation';

interface OrganizerHomeViewProps {
  events: FiestaEvent[];
  isLoading: boolean;
  /** A bounded read failure. Existing events stay visible. */
  eventsError?: string | null;
  onRetryEvents?: () => void;
  onNavigateCreate: () => void;
  onNavigateInvite: (slug: string) => void;
  onNavigateDashboard: (slug: string) => void;
  onCreateDemo: () => Promise<void>;
  onResetDemo: () => Promise<void>;
  isResetting: boolean;
  /** Opens the read-only fictional AG Grid preview at /demo. */
  onNavigatePreview?: () => void;
  /** Opens the existing recovery route without weakening dashboard authorization. */
  onNavigateRecover?: () => void;
}

const journeySteps = ['Crear', 'Compartir', 'Unirse', 'Revisar importe', 'PayPal'];

export const OrganizerHomeView: React.FC<OrganizerHomeViewProps> = ({
  events,
  isLoading,
  eventsError,
  onRetryEvents,
  onNavigateCreate,
  onNavigateInvite,
  onNavigateDashboard,
  onCreateDemo,
  onResetDemo,
  isResetting,
  onNavigatePreview,
  onNavigateRecover,
}) => {
  const [showResetModal, setShowResetModal] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);

  const handleDemoClick = async () => {
    if (isDemoLoading) return;
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
      // handled by the caller's toast
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
        <div style={{ maxHeight: '120px', overflow: 'hidden' }}>
          <GatheringTable height="120px" />
        </div>
        <div style={{ padding: '1.5rem' }}>
          <div style={{ maxWidth: '760px', minWidth: 0 }}>
            <span className="badge badge-teal" style={{ marginBottom: '0.65rem' }}>
              PayPal Sandbox · sin dinero real
            </span>
            <h1 style={{ fontSize: '1.75rem', marginBottom: '0.35rem' }}>
              Organiza tus invitaciones, claridad en cada cuota
            </h1>
            <p style={{ color: 'var(--color-ink-muted)', fontSize: '0.95rem', marginBottom: '0.75rem' }}>
              Crea invitaciones públicas con precios fijos, confirma asistencia con amigos y revisa el importe antes de pagar en PayPal Sandbox.
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '0.6rem',
                marginBottom: '0.9rem',
              }}
            >
              <button onClick={() => onNavigatePreview?.()} className="btn btn-primary">
                Ver panel de ejemplo (AG Grid)
              </button>
              <button
                onClick={handleDemoClick}
                className="btn btn-teal"
                disabled={isDemoLoading}
              >
                {isDemoLoading ? 'Creando demo privada...' : 'Crear mi demo privada'}
              </button>
              <button onClick={onNavigateCreate} className="btn btn-secondary">
                + Crear nueva invitación
              </button>
              <button onClick={() => onNavigateRecover?.()} className="btn btn-secondary">
                Recuperar mi enlace
              </button>
            </div>

            <div
              aria-label="Cómo funciona una invitación"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.8rem',
                fontWeight: 700,
                color: 'var(--color-ink)',
                marginBottom: '0.5rem',
              }}
            >
              {journeySteps.map((step, index) => (
                <React.Fragment key={step}>
                  <span
                    style={{
                      backgroundColor: 'var(--color-blue-tint)',
                      color: 'var(--color-blue)',
                      borderRadius: 'var(--radius-full)',
                      padding: '0.2rem 0.6rem',
                    }}
                  >
                    {step}
                  </span>
                  {index < journeySteps.length - 1 ? <span aria-hidden="true" style={{ color: 'var(--color-ink-light)' }}>→</span> : null}
                </React.Fragment>
              ))}
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-ink-muted)' }}>
              El flujo es simple: Crear → Compartir → Unirse → Revisar importe → PayPal. Es una demostración sandbox: no se cobra dinero real.
            </p>
          </div>
        </div>
      </section>

      {/* Personal history stays available but collapsed by default. Nothing is deleted. */}
      <details
        style={{
          backgroundColor: '#FFFFFF',
          border: '1.5px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: '0.9rem 1rem',
        }}
      >
        <summary style={{ cursor: 'pointer', fontWeight: 800, color: 'var(--color-ink)', fontSize: '1.1rem' }}>
          Mis invitaciones
          <span style={{ marginLeft: '0.6rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-ink-muted)' }}>
            {events.length} {events.length === 1 ? 'registrada' : 'registradas'}
          </span>
        </summary>

        <div style={{ marginTop: '1rem' }}>
          {isLoading ? (
            <div className="panel" style={{ textAlign: 'center', padding: '3rem' }}>
              <div style={{ color: 'var(--color-ink-muted)' }}>Cargando tus invitaciones...</div>
            </div>
          ) : eventsError && events.length === 0 ? (
            <div className="panel" role="alert" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>No se pudieron cargar tus invitaciones</h3>
              <p style={{ color: 'var(--color-ink-muted)', marginBottom: '1rem' }}>{eventsError}</p>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button type="button" onClick={() => onRetryEvents?.()} className="btn btn-primary">
                  Reintentar
                </button>
                <button type="button" onClick={onNavigateCreate} className="btn btn-secondary">
                  + Crear invitación
                </button>
              </div>
            </div>
          ) : events.length === 0 ? (
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
              <div style={{ fontSize: '2.5rem' }} aria-hidden="true">🎉</div>
              <h3 style={{ fontSize: '1.25rem' }}>No tienes ninguna invitación creada aún</h3>
              <p style={{ color: 'var(--color-ink-muted)', maxWidth: '460px', fontSize: '0.9rem' }}>
                Puedes crear una invitación o una demo privada de comida a $25 para probar el flujo completo en PayPal Sandbox.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  onClick={handleDemoClick}
                  className="btn btn-teal"
                  disabled={isDemoLoading}
                >
                  {isDemoLoading ? 'Creando demo privada...' : 'Crear mi demo privada'}
                </button>
                <button onClick={onNavigateCreate} className="btn btn-primary">
                  + Crear invitación
                </button>
              </div>
            </div>
          ) : (
            <div className="event-home-grid">
              {events.map((ev) => {
                const theme = resolveTheme(ev.template, ev.theme);
                const hostLine = organizerLine(ev.organizerName);
                const whenLabel = formatEventRange(ev.startsAt, ev.endsAt);
                const hasAdminKey = Boolean(adminKeyFor(ev.slug));

                return (
                  <ThemeScope key={ev.id} theme={theme}>
                    <article
                      className="ticket-card"
                      style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}
                    >
                      <TemplateCover template={ev.template} accent={theme.accent} height="130px" />

                      <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', flex: 1, gap: '0.75rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                          <div style={{ minWidth: 0 }}>
                            <span className="badge badge-blue" style={{ marginBottom: '0.35rem' }}>
                              Cuota {usd(ev.priceCents)}
                            </span>
                            <p className="theme-phrase" style={{ fontSize: '0.85rem', margin: '0.2rem 0' }}>{theme.phrase}</p>
                            <h3 style={{ fontSize: '1.15rem', color: 'var(--color-ink)' }}>{ev.title}</h3>
                            {hostLine ? <p style={{ fontSize: '0.8rem', fontWeight: 700 }}>{hostLine}</p> : null}
                          </div>
                          {ev.confirmed && <span className="badge badge-teal">Confirmada</span>}
                        </div>

                        <div style={{ fontSize: '0.825rem', color: 'var(--color-ink-muted)', overflowWrap: 'anywhere' }}>
                          <div>{whenLabel}</div>
                          <div>{ev.location}</div>
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

                        {/* Actions. No stored key means no dashboard attempt. */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.5rem' }}>
                          <button
                            onClick={() => onNavigateInvite(ev.slug)}
                            className="btn btn-secondary"
                            style={{ fontSize: '0.825rem', padding: '0.5rem' }}
                          >
                            Ver Invitación
                          </button>
                          {hasAdminKey ? (
                            <button
                              onClick={() => onNavigateDashboard(ev.slug)}
                              className="btn btn-primary"
                              style={{ fontSize: '0.825rem', padding: '0.5rem' }}
                            >
                              Panel de Control
                            </button>
                          ) : (
                            <button
                              onClick={() => onNavigateRecover?.()}
                              className="btn btn-secondary"
                              style={{ fontSize: '0.825rem', padding: '0.5rem' }}
                            >
                              Recuperar enlace
                            </button>
                          )}
                        </div>
                        {!hasAdminKey ? (
                          <p style={{ fontSize: '0.72rem', color: 'var(--color-ink-muted)', margin: 0 }}>
                            La clave de organizador no está en este navegador. Recupérala con tu correo verificado para abrir el panel.
                          </p>
                        ) : null}
                      </div>
                    </article>
                  </ThemeScope>
                );
              })}
            </div>
          )}
          {!isLoading && eventsError && events.length > 0 ? (
            <p role="alert" style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--color-coral)' }}>
              {eventsError}{' '}
              <button type="button" onClick={() => onRetryEvents?.()} className="btn btn-secondary" style={{ padding: '0.2rem 0.55rem', fontSize: '0.75rem' }}>
                Reintentar
              </button>
            </p>
          ) : null}
        </div>
      </details>

      {/* Secondary, opt-in demo maintenance. It is never automatic. */}
      <details
        style={{
          backgroundColor: 'var(--color-surface-subtle)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          padding: '0.75rem 1rem',
          fontSize: '0.85rem',
        }}
      >
        <summary style={{ cursor: 'pointer', fontWeight: 700, color: 'var(--color-ink-muted)' }}>
          Opciones de demostración
        </summary>
        <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <p style={{ color: 'var(--color-ink-muted)' }}>
            Reiniciar solo afecta a las demos de esta sesión. Tus invitaciones reales, sus fechas y sus pagos no se borran.
          </p>
          <button
            onClick={() => setShowResetModal(true)}
            className="btn btn-secondary"
            style={{ color: 'var(--color-coral)', alignSelf: 'flex-start' }}
            title="Reiniciar datos de demostración"
          >
            Reiniciar Demo
          </button>
        </div>
      </details>

      {/* Reset Confirmation Modal */}
      <Modal
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
        title="¿Reiniciar Demostración?"
        description="Esta acción afectará las invitaciones creadas en esta sesión de organizador."
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
