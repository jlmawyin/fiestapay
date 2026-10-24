import React, { useEffect, useRef, useState } from 'react';
import type { Dashboard, Capabilities } from '../types';
import { api } from '../api/client';
import { usd } from '../types';
import { GuestGrid } from '../components/dashboard/GuestGrid';
import { QrShareModal } from '../components/dashboard/QrShareModal';
import { Modal } from '../components/common/Modal';
import { GeminiAssistant } from '../components/chat/GeminiAssistant';

interface OrganizerDashboardViewProps {
  slug: string;
  capabilities: Capabilities | null;
  onNavigateInvite: (slug: string) => void;
  onNavigateHome: () => void;
  onShowToast: (type: 'success' | 'error' | 'info' | 'warning', message: string, title?: string) => void;
}

export const OrganizerDashboardView: React.FC<OrganizerDashboardViewProps> = ({
  slug,
  capabilities,
  onNavigateInvite,
  onNavigateHome,
  onShowToast,
}) => {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const requestVersion = useRef(0);

  useEffect(() => {
    const version = ++requestVersion.current;
    setDashboard(null);
    setIsLoading(true);
    setShowConfirmModal(false);
    setShowQrModal(false);
    setIsConfirming(false);
    void api.getDashboard(slug).then(data => {
      if (requestVersion.current === version) setDashboard(data);
    }).catch((err: Error) => {
      if (requestVersion.current === version) {
        onShowToast('error', err.message || 'Error al cargar el panel de control', 'Panel');
      }
    }).finally(() => {
      if (requestVersion.current === version) setIsLoading(false);
    });
    return () => { requestVersion.current += 1; };
  }, [slug, onShowToast]);

  const handleConfirmEvent = async () => {
    const version = requestVersion.current;
    setIsConfirming(true);
    try {
      const res = await api.confirmEvent(slug);
      if (requestVersion.current !== version) return;
      setDashboard((prev: Dashboard | null) => (prev ? { ...prev, event: res.event } : null));
      setShowConfirmModal(false);
      onShowToast('success', '¡La fiesta ha sido formalmente confirmada!', 'Fiesta Confirmada');
    } catch (err: any) {
      if (requestVersion.current !== version) return;
      onShowToast('error', err.message || 'No se pudo confirmar la fiesta', 'Error');
    } finally {
      if (requestVersion.current === version) setIsConfirming(false);
    }
  };

  const inviteUrl = `${window.location.origin}/e/${slug}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedLink(true);
      onShowToast('info', 'Enlace copiado al portapapeles', 'Copiado');
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // fallback
    }
  };

  const handleWhatsAppShare = () => {
    if (!dashboard) return;
    const { event } = dashboard;
    const msg = `¡Hola! Te invito a "${event.title}".
📅 Fecha: ${new Date(event.startsAt).toLocaleDateString('es-EC')}
📍 Lugar: ${event.location}
💵 Cuota por persona: ${usd(event.priceCents)}

Confirma tu asistencia y gestiona tu cuota aquí:
${inviteUrl}`;

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  if (isLoading || (dashboard && dashboard.event.slug !== slug)) {
    return (
      <div className="panel" style={{ textAlign: 'center', padding: '4rem 1rem' }}>
        <p style={{ color: 'var(--color-ink-muted)' }}>Cargando panel de control del organizador...</p>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="panel" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
        <h3>Error al acceder al panel</h3>
        <p style={{ color: 'var(--color-ink-muted)', margin: '0.75rem 0 1.5rem 0' }}>
          No tienes permisos de organizador para esta fiesta o la fiesta no existe.
        </p>
        <button onClick={onNavigateHome} className="btn btn-primary">
          Volver a Mis Fiestas
        </button>
      </div>
    );
  }

  const { event, guests, audit } = dashboard;
  const canConfirm = !event.minimumCents || event.minimumReached;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem', minWidth: 0, maxWidth: 'calc(100vw - 3rem)' }}>
      {/* Top Header Card */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 'var(--radius-xl)',
          border: '1.5px solid var(--color-border)',
          padding: '1.5rem',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.65rem', marginBottom: '0.35rem' }}>
            <span className="badge badge-ink">Panel del Organizador</span>
            {event.confirmed ? (
              <span className="badge badge-teal">Fiesta Confirmada ✓</span>
            ) : (
              <span className="badge badge-yellow">Por Confirmar</span>
            )}
          </div>
          <h1 style={{ fontSize: '1.65rem', color: 'var(--color-ink)' }}>{event.title}</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-ink-muted)' }}>
            📍 {event.location} • 📅 {new Date(event.startsAt).toLocaleString('es-EC')}
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button onClick={() => onNavigateInvite(slug)} className="btn btn-secondary" style={{ fontSize: '0.85rem' }}>
            👁️ Ver Invitación Pública
          </button>
          <button onClick={handleWhatsAppShare} className="btn btn-teal" style={{ fontSize: '0.85rem' }}>
            💬 Compartir en WhatsApp
          </button>
          <button onClick={() => setShowQrModal(true)} className="btn btn-secondary" style={{ fontSize: '0.85rem' }}>
            📲 QR
          </button>
          <button onClick={handleCopyLink} className="btn btn-secondary" style={{ fontSize: '0.85rem' }}>
            {copiedLink ? '¡Copiado! ✓' : '🔗 Copiar Link'}
          </button>
        </div>
      </div>

      {/* Financial Metrics Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
        }}
      >
        {/* Recaudado antes de comisiones */}
        <div className="panel" style={{ borderLeft: '4px solid var(--color-teal)' }}>
          <div style={{ fontSize: '0.775rem', color: 'var(--color-ink-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
            Recaudado
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--color-ink)', margin: '0.2rem 0' }}>
            {usd(event.collectedCents)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-ink-light)' }}>
            antes de comisiones
          </div>
        </div>

        {/* Goal */}
        <div className="panel" style={{ borderLeft: '4px solid var(--color-blue)' }}>
          <div style={{ fontSize: '0.775rem', color: 'var(--color-ink-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
            Meta de Recaudación
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--color-ink)', margin: '0.2rem 0' }}>
            {event.goalCents ? usd(event.goalCents) : 'Sin meta fijada'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-ink-light)' }}>
            {event.goalCents
              ? `${Math.min(100, Math.round((event.collectedCents / event.goalCents) * 100))}% alcanzado`
              : 'Presupuesto flexible'}
          </div>
        </div>

        {/* Minimum Threshold */}
        <div className="panel" style={{ borderLeft: '4px solid var(--color-coral)' }}>
          <div style={{ fontSize: '0.775rem', color: 'var(--color-ink-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
            Mínimo Requerido
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--color-ink)', margin: '0.2rem 0' }}>
            {event.minimumCents ? usd(event.minimumCents) : 'No requerido'}
          </div>
          <div style={{ fontSize: '0.75rem' }}>
            {event.minimumCents ? (
              event.minimumReached ? (
                <span style={{ color: 'var(--color-teal)', fontWeight: 700 }}>Mínimo alcanzado ✓</span>
              ) : (
                <span style={{ color: 'var(--color-coral)', fontWeight: 700 }}>Faltan {usd(event.minimumCents - event.collectedCents)}</span>
              )
            ) : (
              <span style={{ color: 'var(--color-ink-light)' }}>Sin condición mínima</span>
            )}
          </div>
        </div>

        {/* Capacity / Attendees */}
        <div className="panel" style={{ borderLeft: '4px solid var(--color-yellow)' }}>
          <div style={{ fontSize: '0.775rem', color: 'var(--color-ink-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
            Personas Confirmadas
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--color-ink)', margin: '0.2rem 0' }}>
            {event.confirmedPeople} {event.capacity ? `/ ${event.capacity}` : ''}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-ink-light)' }}>
            {guests.length} invitados registrados
          </div>
        </div>
      </div>

      {/* Confirmation of Event Realization */}
      {!event.confirmed && (
        <div
          style={{
            backgroundColor: 'var(--color-yellow-tint)',
            border: '1.5px solid var(--color-yellow)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.25rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>Confirmar Realización de la Fiesta</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-ink-muted)' }}>
              {canConfirm
                ? 'Puedes confirmar que la fiesta se realizará. La asistencia y los pagos de cada invitado se gestionan por separado.'
                : `Se requiere recaudar al menos ${usd(event.minimumCents || 0)} antes de poder confirmar formalmente la realización de la fiesta.`}
            </p>
          </div>
          <div>
            <button
              onClick={() => setShowConfirmModal(true)}
              disabled={!canConfirm}
              className="btn btn-teal"
              style={{ fontWeight: 700 }}
              title={canConfirm ? 'Confirmar fiesta' : 'Mínimo aún no alcanzado'}
            >
              ✓ Confirmar Realización
            </button>
          </div>
        </div>
      )}

      {/* Guests Management AG Grid Table */}
      <section aria-label="Lista de invitados y pagos" style={{ width: '100%', overflowX: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem' }}>Lista de Invitados y Pagos</h2>
            <p style={{ fontSize: '0.825rem', color: 'var(--color-ink-muted)' }}>
              Revisa la asistencia y los pagos de tus invitados. Desliza la tabla para ver los importes y preparar recordatorios.
            </p>
          </div>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-ink-muted)' }}>
            {guests.length} {guests.length === 1 ? 'invitado' : 'invitados'}
          </span>
        </div>

        <GuestGrid
          guests={guests}
          eventTitle={event.title}
          inviteUrl={inviteUrl}
        />
        <p style={{ fontSize: '0.775rem', color: 'var(--color-ink-light)', marginTop: '0.5rem' }}>
          Revisa el mensaje y elige a quién enviarlo en WhatsApp.
        </p>
      </section>

      {/* Audit Trail */}
      {audit && audit.length > 0 && (
        <section aria-label="Historial de auditoría" className="panel">
          <h3 style={{ fontSize: '1.05rem', marginBottom: '0.75rem' }}>Registro de Actividad y Auditoría</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
            {audit.map((entry: { action: string; createdAt: string }, idx: number) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '0.4rem 0',
                  borderBottom: '1px solid var(--color-border)',
                }}
              >
                <span style={{ color: 'var(--color-ink)' }}>{entry.action}</span>
                <span style={{ color: 'var(--color-ink-light)', fontSize: '0.775rem' }}>
                  {new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* QR Share Modal */}
      <QrShareModal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
        inviteUrl={inviteUrl}
        eventTitle={event.title}
      />

      {/* Confirm Event Modal */}
      <Modal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        title="¿Confirmar realización de la fiesta?"
        description="Esta acción marca la fiesta como confirmada para su realización."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-ink-muted)', lineHeight: 1.5 }}>
            Confirmas que "{event.title}" se llevará a cabo. La asistencia y los pagos de cada invitado se gestionan por separado.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button onClick={() => setShowConfirmModal(false)} className="btn btn-secondary" disabled={isConfirming}>
              Cancelar
            </button>
            <button onClick={handleConfirmEvent} className="btn btn-teal" disabled={isConfirming}>
              {isConfirming ? 'Confirmando...' : 'Sí, Confirmar Celebración'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Gemini Assistant */}
      <GeminiAssistant slug={slug} capabilities={capabilities} />
    </div>
  );
};
