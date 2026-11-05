import React, { useState } from 'react';
import type { FiestaEvent } from '../types';
import { usd } from '../types';
import { adminKeyFor } from '../api/admin-key';
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
  /** Explicit payment demo. It never runs on render. */
  onStartPaymentDemo?: () => Promise<void>;
  onResetDemo: () => Promise<void>;
  isResetting: boolean;
  /** Opens the read-only fictional AG Grid preview at /demo. */
  onNavigatePreview?: () => void;
  /** Opens the existing recovery route without weakening dashboard authorization. */
  onNavigateRecover?: () => void;
}

export const OrganizerHomeView: React.FC<OrganizerHomeViewProps> = ({
  events,
  isLoading,
  eventsError,
  onRetryEvents,
  onNavigateCreate,
  onNavigateInvite,
  onNavigateDashboard,
  onCreateDemo,
  onStartPaymentDemo,
  onResetDemo,
  isResetting,
  onNavigatePreview,
  onNavigateRecover,
}) => {
  const [showResetModal, setShowResetModal] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const [isPaymentDemoLoading, setIsPaymentDemoLoading] = useState(false);

  const handleDemoClick = async () => {
    if (isDemoLoading) return;
    setIsDemoLoading(true);
    try {
      await onCreateDemo();
    } finally {
      setIsDemoLoading(false);
    }
  };

  const handlePaymentDemoClick = async () => {
    if (isPaymentDemoLoading) return;
    setIsPaymentDemoLoading(true);
    try {
      await onStartPaymentDemo?.();
    } finally {
      setIsPaymentDemoLoading(false);
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
      {/* Short hero: the first card action must stay clear of the orb on a 390px screen. */}
      <section
        style={{
          background: 'linear-gradient(135deg, #FFFFFF 0%, var(--color-blue-tint) 100%)',
          borderRadius: 'var(--radius-xl)',
          border: '1.5px solid var(--color-border)',
          padding: '1.1rem 1.25rem',
          boxShadow: 'var(--shadow-md)',
        }}
        aria-label="Panel principal del organizador"
      >
        <span className="badge badge-teal" style={{ marginBottom: '0.45rem' }}>
          PayPal Sandbox · sin dinero real
        </span>
        <h1 style={{ fontSize: 'clamp(1.45rem, 4vw, 1.9rem)', marginBottom: '0.25rem' }}>
          Organiza tus invitaciones, claridad en cada cuota
        </h1>
        <p style={{ color: 'var(--color-ink-muted)', fontSize: '0.9rem', margin: 0, maxWidth: '720px' }}>
          Elige una demo para explorar el panel o recorrer un pago, o crea tu propia invitación.
        </p>
      </section>

      <div
        className="event-home-grid"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))' }}
      >
        <article
          aria-labelledby="demo-card-title"
          style={{
            backgroundColor: '#FFFFFF',
            border: '1.5px solid var(--color-teal)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.15rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.8rem',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <div>
            <span className="badge badge-teal">Datos ficticios</span>
            <h2 id="demo-card-title" style={{ fontSize: '1.3rem', margin: '0.5rem 0 0.25rem' }}>
              Explora la demo
            </h2>
            <p style={{ margin: 0, color: 'var(--color-ink-muted)', fontSize: '0.88rem' }}>
              Mira el panel AG Grid o recorre un pago completo sin crear datos reales.
            </p>
          </div>

          <div style={{ display: 'grid', gap: '0.5rem', marginTop: 'auto' }}>
            <button type="button" onClick={() => onNavigatePreview?.()} className="btn btn-secondary">
              Ver panel de ejemplo (AG Grid)
            </button>
            <button
              type="button"
              onClick={handleDemoClick}
              className="btn btn-teal"
              disabled={isDemoLoading}
            >
              {isDemoLoading ? 'Creando demo privada...' : 'Crear mi demo privada'}
            </button>
            <button
              type="button"
              onClick={handlePaymentDemoClick}
              className="btn btn-primary"
              disabled={isPaymentDemoLoading}
            >
              {isPaymentDemoLoading ? 'Preparando pago de prueba...' : 'Probar pago con PayPal'}
            </button>
          </div>
          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-ink-muted)' }}>
            El pago de prueba crea una comida ficticia y prepara a Invitado Demo con un acompañante.
            La cotización y la confirmación siguen siendo tuyas.
          </p>
        </article>

        <article
          aria-labelledby="live-card-title"
          style={{
            backgroundColor: '#FFFFFF',
            border: '1.5px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.15rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.8rem',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <div>
            <span className="badge badge-blue">Tu propia invitación</span>
            <h2 id="live-card-title" style={{ fontSize: '1.3rem', margin: '0.5rem 0 0.25rem' }}>
              Prueba en vivo
            </h2>
            <p style={{ margin: 0, color: 'var(--color-ink-muted)', fontSize: '0.88rem' }}>
              Crea tu propia fiesta, compártela y observa cómo se unen tus invitados.
            </p>
          </div>

          <p
            style={{
              margin: 0,
              padding: '0.6rem 0.7rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-surface-subtle)',
              fontSize: '0.78rem',
              color: 'var(--color-ink)',
            }}
          >
            La aplicación es real; PayPal está en modo <strong>SANDBOX</strong>: no se mueve dinero real.
          </p>

          <button
            type="button"
            onClick={onNavigateCreate}
            className="btn btn-primary"
            style={{ marginTop: 'auto' }}
          >
            + Crear mi propia fiesta
          </button>
        </article>
      </div>

      {/* Recovery remains visible and separate from the collapsed personal history. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          flexWrap: 'wrap',
          padding: '0.85rem 1rem',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--color-surface-subtle)',
        }}
      >
        <div>
          <strong style={{ fontSize: '0.9rem' }}>¿Ya creaste una invitación?</strong>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-ink-muted)' }}>
            Recupera tu enlace de organizador con el correo verificado.
          </p>
        </div>
        <button type="button" onClick={() => onNavigateRecover?.()} className="btn btn-secondary">
          Recuperar mi enlace
        </button>
      </div>

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
