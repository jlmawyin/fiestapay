import React, { useEffect, useState, useCallback, useLayoutEffect, useRef } from 'react';
import type { FiestaEvent, Guest, Quote, OrderResult, Capabilities, RsvpStatus, AgendaItem } from '../types';
import { api } from '../api/client';
import { usd } from '../types';
import { TemplateCover } from '../components/illustrations/TemplateCover';
import { TicketCutout } from '../components/common/TicketCutout';
import { JoinForm } from '../components/invite/JoinForm';
import { RsvpForm } from '../components/invite/RsvpForm';
import { QuoteReviewCard } from '../components/invite/QuoteReviewCard';
import { PayPalSection } from '../components/invite/PayPalSection';
import { GeminiAssistant } from '../components/chat/GeminiAssistant';
import { QrShareModal } from '../components/dashboard/QrShareModal';
import { VoiceInvitationAgent } from '../components/voice/VoiceInvitationAgent';

interface PublicInviteViewProps {
  slug: string;
  capabilities: Capabilities | null;
  onShowToast: (type: 'success' | 'error' | 'info' | 'warning', message: string, title?: string) => void;
  onNavigateHome: () => void;
}

export const PublicInviteView: React.FC<PublicInviteViewProps> = ({
  slug,
  capabilities,
  onShowToast,
  onNavigateHome,
}) => {
  const [event, setEvent] = useState<FiestaEvent | null>(null);
  const [guest, setGuest] = useState<Guest | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [activeOrder, setActiveOrder] = useState<OrderResult | null>(null);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [isReconcilingOrder, setIsReconcilingOrder] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isSavingRsvp, setIsSavingRsvp] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const scopeVersion = useRef(0);
  useLayoutEffect(() => {
    scopeVersion.current += 1;
    return () => { scopeVersion.current += 1; };
  }, [slug]);

  // URL and sessionStorage identify a candidate only. The authenticated server must
  // verify its state and its guest must belong to this invitation before it is actionable.
  useEffect(() => {
    let active = true;
    setActiveOrder(null);
    let savedOrder: OrderResult | null = null;
    try {
      const parsed = JSON.parse(sessionStorage.getItem(`fiestapay_order_${slug}`) || 'null');
      if (parsed && typeof parsed.orderId === 'string') savedOrder = parsed;
    } catch { /* Storage is optional. */ }

    const url = new URL(window.location.href);
    const returned = url.searchParams.get('paypal');
    const token = url.searchParams.get('token');
    const isReturn = returned === 'approved' || returned === 'cancelled';
    const candidateId = (isReturn && token) || savedOrder?.orderId;
    if (isReturn) {
      onShowToast('info', returned === 'cancelled'
        ? 'El enlace indica cancelación. Consultaremos el estado real de la orden.'
        : 'Has regresado de PayPal. Consultaremos el estado antes de continuar.', 'Regreso de PayPal');
    }
    if (isReturn || token) {
      url.searchParams.delete('paypal');
      url.searchParams.delete('token');
      url.searchParams.delete('PayerID');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    }
    if (!candidateId) return () => { active = false; };

    void (async () => {
      try {
        const result = await api.getOrder(candidateId);
        // Read invitation after reconciliation, because getOrder may apply a verified capture.
        const details = await api.getEventBySlug(slug);
        if (!active) return;
        if (!details.guest || result.guest?.id !== details.guest.id) {
          throw new Error('La orden no corresponde a tu invitación.');
        }
        setEvent(details.event);
        setGuest(details.guest);
        if (result.status === 'paid') {
          try { sessionStorage.removeItem(`fiestapay_order_${slug}`); } catch { /* Optional. */ }
          onShowToast('success', 'El servidor verificó que esta orden ya está pagada.', 'Pago confirmado');
          return;
        }
        if (!['created', 'approved', 'capturing'].includes(result.status)) {
          try { sessionStorage.removeItem(`fiestapay_order_${slug}`); } catch { /* Optional. */ }
          onShowToast('warning', 'Esta orden ya no admite pagos. Revisa una nueva cotización.', 'Orden cerrada');
          return;
        }
        const recovered: OrderResult = {
          orderId: candidateId,
          status: result.status,
          ...(savedOrder?.orderId === candidateId && savedOrder.approveUrl ? {approveUrl: savedOrder.approveUrl} : {}),
        };
        setActiveOrder(recovered);
        try { sessionStorage.setItem(`fiestapay_order_${slug}`, JSON.stringify(recovered)); } catch { /* Optional. */ }
      } catch {
        if (active) onShowToast('warning', 'No pudimos verificar esta orden para tu invitación. No se confirmó ningún estado de pago.', 'Orden sin verificar');
      }
    })();
    return () => { active = false; };
  }, [slug, onShowToast]);

  const loadEvent = useCallback(async () => {
    const scope = scopeVersion.current;
    setIsLoading(true);
    try {
      const data = await api.getEventBySlug(slug);
      if (scope !== scopeVersion.current) return;
      setEvent(data.event);
      setGuest(data.guest);
    } catch (err: any) {
      if (scope !== scopeVersion.current) return;
      onShowToast('error', err.message || 'No se pudo cargar la fiesta', 'Error de carga');
    } finally {
      if (scope === scopeVersion.current) setIsLoading(false);
    }
  }, [slug, onShowToast]);

  useEffect(() => {
    loadEvent();
  }, [loadEvent]);

  // Load quote when guest is attending and owes money
  const fetchQuote = useCallback(async () => {
    if (!guest || guest.status !== 'yes') return;
    const scope = scopeVersion.current;
    setIsLoadingQuote(true);
    try {
      const data = await api.getQuote(slug);
      if (scope !== scopeVersion.current) return;
      setQuote(data.quote);
    } catch (err: any) {
      if (scope !== scopeVersion.current) return;
      onShowToast('error', err.message || 'No se pudo calcular la cotización', 'Cotización');
    } finally {
      if (scope === scopeVersion.current) setIsLoadingQuote(false);
    }
  }, [slug, guest, onShowToast]);

  useEffect(() => {
    if (guest && guest.status === 'yes') {
      fetchQuote();
    }
  }, [guest?.status, guest?.companions, fetchQuote]);

  const handleJoin = async (name: string) => {
    setIsJoining(true);
    try {
      const data = await api.joinEvent(slug, name);
      setGuest(data.guest);
      onShowToast('success', `¡Bienvenido/a, ${name}! Tu sesión está lista.`, 'Unido con éxito');
    } catch (err: any) {
      onShowToast('error', err.message || 'Error al unirte', 'Error');
    } finally {
      setIsJoining(false);
    }
  };

  const handleSaveRsvp = async (status: RsvpStatus, companions: number) => {
    setIsSavingRsvp(true);
    try {
      const data = await api.rsvp(slug, status, companions);
      setGuest(data.guest);
      setEvent(data.event);
      setQuote(null);
      setActiveOrder(null); // reset prior active order if assistance changed
      try {
        sessionStorage.removeItem(`fiestapay_order_${slug}`);
      } catch {
        // Storage is optional; the active order remains in React state.
      }
      onShowToast('success', 'Tu respuesta de asistencia fue actualizada en el servidor.', 'Asistencia guardada');
    } catch (err: any) {
      onShowToast('error', err.message || 'Error al guardar asistencia', 'Error de cupo');
      throw err;
    } finally {
      setIsSavingRsvp(false);
    }
  };

  const handleCreateOrder = async (quoteId: string) => {
    setIsCreatingOrder(true);
    try {
      const orderRes = await api.createOrder(slug, quoteId);
      setActiveOrder(orderRes);
      try {
        sessionStorage.setItem(`fiestapay_order_${slug}`, JSON.stringify(orderRes));
      } catch {
        // Storage is optional; the active order remains in React state.
      }
      onShowToast('info', 'Orden de pago generada. Procede a pagar con PayPal.', 'Orden Lista');
    } catch (err: any) {
      onShowToast('error', err.message || 'No se pudo generar la orden de pago', 'Error de orden');
    } finally {
      setIsCreatingOrder(false);
    }
  };

  const handleCaptureSuccess = async (orderId: string): Promise<boolean> => {
    const scope = scopeVersion.current;
    try {
      const res = await api.captureOrder(orderId);
      if (scope !== scopeVersion.current) return false;
      // Capture success only if server status is paid and guest is evaluated
      if (res.status === 'paid' && res.guest) {
        setGuest(res.guest);
        setActiveOrder(null);
        try {
          sessionStorage.removeItem(`fiestapay_order_${slug}`);
        } catch {
          // Storage can be unavailable; the verified server state still applies.
        }
        // Reload event to get updated collectedCents
        await loadEvent();
        if (scope !== scopeVersion.current) return false;
        onShowToast('success', '¡Tu pago fue verificado y capturado correctamente por el servidor!', '¡Pago confirmado!');
        return true;
      } else {
        if (res.guest) {
          setGuest(res.guest);
        }
        onShowToast(
          'warning',
          `El servidor reporta el estado de la orden como "${res.status}". Si realizaste la transacción, verifica su conciliación nuevamente.`,
          'Verificación de Pago'
        );
        return false;
      }
    } catch (err: any) {
      if (scope !== scopeVersion.current) return false;
      onShowToast(
        'error',
        `No se pudo comprobar la captura con el servidor: ${err.message || 'Error de red'}. Puedes consultar el estado de tu orden para verificar si fue recibida.`,
        'Estado no confirmado'
      );
      throw err;
    }
  };

  const handleReconcileOrder = async () => {
    if (!activeOrder) return;
    const scope = scopeVersion.current;
    setIsReconcilingOrder(true);
    try {
      const res = await api.getOrder(activeOrder.orderId);
      if (scope !== scopeVersion.current) return;
      if (res.status === 'paid' && res.guest) {
        setGuest(res.guest);
        setActiveOrder(null);
        try {
          sessionStorage.removeItem(`fiestapay_order_${slug}`);
        } catch {
          // Storage can be unavailable; the verified server state still applies.
        }
        await loadEvent();
        if (scope !== scopeVersion.current) return;
        onShowToast('success', '¡La orden fue confirmada como pagada por el servidor!', 'Pago confirmado');
      } else {
        if (res.guest) setGuest(res.guest);
        onShowToast('info', `Estado actual de la orden en el servidor: "${res.status}".`, 'Consulta de Orden');
      }
    } catch (err: any) {
      if (scope !== scopeVersion.current) return;
      onShowToast('error', err.message || 'No se pudo consultar el estado de la orden', 'Error al verificar');
    } finally {
      if (scope === scopeVersion.current) setIsReconcilingOrder(false);
    }
  };

  const handleDismissOrder = () => {
    setActiveOrder(null);
    try {
      sessionStorage.removeItem(`fiestapay_order_${slug}`);
    } catch {
      // Dismissal still clears the in-memory order when storage is unavailable.
    }
    onShowToast('info', 'Orden descartada de la sesión.', 'Sesión limpia');
  };

  const handlePaymentCancelOrError = (msg: string) => {
    onShowToast('warning', msg, 'Pago no completado');
  };


  if (isLoading) {
    return (
      <div className="panel" style={{ textAlign: 'center', padding: '4rem 1rem' }}>
        <p style={{ color: 'var(--color-ink-muted)' }}>Cargando detalles de la fiesta...</p>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="panel" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
        <h3>Fiesta no encontrada</h3>
        <p style={{ color: 'var(--color-ink-muted)', margin: '0.75rem 0 1.5rem 0' }}>
          El enlace de la invitación no corresponde a ninguna fiesta activa.
        </p>
        <button onClick={onNavigateHome} className="btn btn-primary">
          Ir al Inicio
        </button>
      </div>
    );
  }

  const dateFormatted = new Date(event.startsAt).toLocaleDateString('es-EC', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const inviteUrl = window.location.href;

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Main Signature Invitation Ticket */}
      <article className="ticket-card" aria-label={`Invitación a la fiesta: ${event.title}`}>
        {/* Cover illustration */}
        <TemplateCover template={event.template} height="200px" />

        {/* Header Section */}
        <div style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <span className="badge badge-blue">Cuota Fija: {usd(event.priceCents)} por persona</span>
            {event.confirmed && <span className="badge badge-teal">Fiesta Confirmada ✓</span>}
          </div>

          <h1 style={{ fontSize: '1.85rem', marginBottom: '0.5rem', color: 'var(--color-ink)' }}>
            {event.title}
          </h1>

          <p style={{ fontSize: '0.95rem', color: 'var(--color-ink-muted)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
            {event.description}
          </p>

          {/* Practical Logistics Details */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '0.75rem',
              backgroundColor: 'var(--color-surface-subtle)',
              padding: '1rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.875rem',
            }}
          >
            <div>
              <span style={{ color: 'var(--color-ink-light)', display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>
                FECHA Y HORA
              </span>
              <strong style={{ color: 'var(--color-ink)' }}>{dateFormatted}</strong>
            </div>

            <div>
              <span style={{ color: 'var(--color-ink-light)', display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>
                LUGAR
              </span>
              <strong style={{ color: 'var(--color-ink)' }}>{event.location}</strong>
            </div>

            <div>
              <span style={{ color: 'var(--color-ink-light)', display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>
                TIPO DE COMIDA
              </span>
              <strong style={{ textTransform: 'capitalize', color: 'var(--color-ink)' }}>{event.meal}</strong>
            </div>

            <div>
              <span style={{ color: 'var(--color-ink-light)', display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>
                ASISTENTES CONFIRMADOS
              </span>
              <strong style={{ color: 'var(--color-ink)' }}>
                {event.confirmedPeople} personas {event.capacity ? `(máx. ${event.capacity})` : ''}
              </strong>
            </div>
          </div>

          {/* Useful Guest Event CTAs */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(event.location)}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary"
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
            >
              📍 Ver en Google Maps
            </a>
            <button
              onClick={() => setShowQrModal(true)}
              className="btn btn-secondary"
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
            >
              📲 Código QR / Compartir
            </button>
          </div>
        </div>

        {/* Ticket Perforated Divider */}
        <TicketCutout />

        {/* What's Included & Agenda Section */}
        <div style={{ padding: '1rem 1.5rem' }}>
          {event.includes.length > 0 && (
            <div style={{ marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: 'var(--color-ink)' }}>
                ¿Qué incluye tu cuota?
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {event.includes.map((item: string, idx: number) => (
                  <span
                    key={idx}
                    style={{
                      backgroundColor: 'var(--color-teal-tint)',
                      color: 'var(--color-teal)',
                      padding: '0.25rem 0.65rem',
                      borderRadius: 'var(--radius-full)',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                    }}
                  >
                    ✓ {item}
                  </span>
                ))}
              </div>
            </div>
          )}

          {event.agenda && event.agenda.length > 0 && (
            <div>
              <h3 style={{ fontSize: '1rem', marginBottom: '0.65rem', color: 'var(--color-ink)' }}>
                Programa de la Fiesta
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {event.agenda.map((ag: AgendaItem, i: number) => (
                  <div key={i} style={{ display: 'flex', gap: '0.75rem', fontSize: '0.85rem' }}>
                    <span style={{ fontWeight: 800, color: 'var(--color-blue)', minWidth: '50px' }}>{ag.time}</span>
                    <span style={{ color: 'var(--color-ink)' }}>{ag.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Financial Transparency Bar */}
          <div
            style={{
              marginTop: '1.25rem',
              backgroundColor: 'var(--color-surface-subtle)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '0.85rem 1rem',
              fontSize: '0.85rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontWeight: 700, color: 'var(--color-ink)' }}>Recaudado: </span>
                <strong style={{ color: 'var(--color-teal)', fontSize: '1.05rem' }}>
                  {usd(event.collectedCents)}
                </strong>
                <span style={{ fontSize: '0.72rem', color: 'var(--color-ink-muted)', marginLeft: '0.35rem' }}>
                  antes de comisiones
                </span>
              </div>
              {event.goalCents && (
                <span style={{ color: 'var(--color-ink-muted)' }}>Meta: {usd(event.goalCents)}</span>
              )}
            </div>

            {event.minimumCents && (
              <div style={{ marginTop: '0.35rem', fontSize: '0.775rem', color: 'var(--color-ink-muted)' }}>
                Mínimo necesario para confirmar: <strong>{usd(event.minimumCents)}</strong> (
                {event.minimumReached ? (
                  <span style={{ color: 'var(--color-teal)', fontWeight: 700 }}>Alcanzado ✓</span>
                ) : (
                  <span style={{ color: 'var(--color-coral)', fontWeight: 700 }}>Pendiente</span>
                )}
                )
              </div>
            )}
          </div>
        </div>

        {/* Ticket Perforated Divider */}
        <TicketCutout />

        {/* Guest RSVP & Payment Stub */}
        <div style={{ padding: '1.5rem', backgroundColor: '#FAFCFE' }}>
          {!guest ? (
            <JoinForm onJoin={handleJoin} isLoading={isJoining} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Guest Greeting Header */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.75rem 1rem',
                  backgroundColor: '#FFFFFF',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-ink-muted)' }}>Sesión activa:</div>
                  <strong style={{ fontSize: '1.05rem', color: 'var(--color-ink)' }}>{guest.name}</strong>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-ink-muted)' }}>Abonado:</div>
                  <strong style={{ color: 'var(--color-teal)', fontSize: '0.95rem' }}>{usd(guest.paidCents)}</strong>
                </div>
              </div>

              {/* RSVP Selector */}
              <RsvpForm guest={guest} event={event} onSaveRsvp={handleSaveRsvp} isLoading={isSavingRsvp} />

              {/* Server Quote & Payment Review */}
              {guest.status === 'yes' && (
                <>
                  <QuoteReviewCard
                    quote={quote}
                    isLoadingQuote={isLoadingQuote}
                    onRefreshQuote={fetchQuote}
                    onCreateOrder={handleCreateOrder}
                    isCreatingOrder={isCreatingOrder}
                  />

                  {/* Scoped Active Order Notice & Reconciliation */}
                  {activeOrder && (
                    <div
                      style={{
                        backgroundColor: 'var(--color-blue-tint)',
                        border: '1.5px solid var(--color-blue)',
                        borderRadius: 'var(--radius-md)',
                        padding: '0.75rem 1rem',
                        fontSize: '0.85rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '0.5rem',
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: 700, color: 'var(--color-ink)' }}>Orden activa registrada: </span>
                        <code>#{activeOrder.orderId.slice(0, 8)}</code>
                      </div>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button
                          type="button"
                          onClick={handleReconcileOrder}
                          disabled={isReconcilingOrder}
                          className="btn btn-teal"
                          style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                        >
                          {isReconcilingOrder ? 'Consultando...' : '🔍 Verificar Estado'}
                        </button>
                        <button
                          type="button"
                          onClick={handleDismissOrder}
                          className="btn btn-secondary"
                          style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                        >
                          Descartar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* PayPal Dynamic Integration */}
                  {activeOrder && (
                    <PayPalSection
                      order={activeOrder}
                      capabilities={capabilities}
                      onCaptureSuccess={handleCaptureSuccess}
                      onCancelOrError={handlePaymentCancelOrError}
                    />
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </article>

      {/* QR Share Modal */}
      <QrShareModal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
        inviteUrl={inviteUrl}
        eventTitle={event.title}
      />

      {/* Gemini Chat Assistant */}
      <GeminiAssistant
        slug={slug}
        capabilities={capabilities}
        onApplyQuote={(q) => {
          setQuote(q);
          onShowToast('info', 'Cotización sugerida por el asistente cargada. Revisa los detalles en pantalla.', 'Cotización');
        }}
        onConfirmRsvp={handleSaveRsvp}
      />

      {/* Real AssemblyAI Voice Agent */}
      <VoiceInvitationAgent
        slug={slug}
        capabilities={capabilities}
        guest={guest}
        onConfirmRsvp={handleSaveRsvp}
        onApplyQuote={(q) => {
          setQuote(q);
          onShowToast('info', 'Cotización sugerida por voz recibida. Revisa los detalles en pantalla.', 'Cotización');
        }}
        onShowToast={onShowToast}
      />
    </div>
  );
};
