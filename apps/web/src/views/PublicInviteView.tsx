import React, { useEffect, useState, useCallback, useLayoutEffect, useRef } from 'react';
import { Check, MapPin, QrCode } from 'lucide-react';
import type { FiestaEvent, Guest, Quote, OrderResult, Capabilities, RsvpStatus, AgendaItem } from '../types';
import { api, ApiError } from '../api/client';
import { useI18n, useMessages } from '../i18n/I18nContext';
import { inviteCatalog } from '../i18n/messages/invite';
import { TemplateCover } from '../components/illustrations/TemplateCover';
import { ThemeScope } from '../components/events/ThemeScope';
import { TicketCutout } from '../components/common/TicketCutout';
import { PaymentWizard } from '../components/invite/PaymentWizard';
import { AssistantOrb } from '../components/assistant/AssistantOrb';
import { QrShareModal } from '../components/dashboard/QrShareModal';
import { FundingStatusPanel, newGuestActivityBlocked } from '../components/common/FundingStatusPanel';
import {
  attendanceSummary,
  buildInviteShareText,
  formatEventRange,
  mealLabel,
  namedGreeting,
  organizerLine,
  publicInviteUrl,
  resolveTheme,
  shareableInviteUrl,
  templateInviteCopy,
} from '../lib/event-presentation';

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [activeOrder, setActiveOrder] = useState<OrderResult | null>(null);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [isReconcilingOrder, setIsReconcilingOrder] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [needsCode, setNeedsCode] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [isSavingRsvp, setIsSavingRsvp] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const { locale, formatMoney } = useI18n();
  const m = useMessages(inviteCatalog);
  const copyRef = useRef(m);
  copyRef.current = m;
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
        ? copyRef.current.returnCancelled
        : copyRef.current.returnApproved, copyRef.current.returnTitle);
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
          onShowToast('success', copyRef.current.paidVerified, copyRef.current.paidTitle);
          return;
        }
        if (!['created', 'approved', 'capturing'].includes(result.status)) {
          try { sessionStorage.removeItem(`fiestapay_order_${slug}`); } catch { /* Optional. */ }
          onShowToast('warning', copyRef.current.orderClosed, copyRef.current.orderClosedTitle);
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
        if (active) onShowToast('warning', copyRef.current.orderUnverified, copyRef.current.orderUnverifiedTitle);
      }
    })();
    return () => { active = false; };
  }, [slug, onShowToast]);

  const loadEvent = useCallback(async () => {
    const scope = scopeVersion.current;
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await api.getEventBySlug(slug);
      if (scope !== scopeVersion.current) return;
      setNeedsCode(false);
      setEvent(data.event);
      setGuest(data.guest);
    } catch (err: any) {
      if (scope !== scopeVersion.current) return;
      if (err instanceof ApiError && err.status === 403) {
        setNeedsCode(true);
        setEvent(null);
        return;
      }
      setLoadError(err?.message || copyRef.current.loadFail);
      onShowToast('error', err.message || copyRef.current.loadFail, copyRef.current.loadFailTitle);
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
    if (guest.blockedAt || guest.removedAt) return;
    if (event && newGuestActivityBlocked(event)) return;
    const scope = scopeVersion.current;
    setIsLoadingQuote(true);
    try {
      const data = await api.getQuote(slug);
      if (scope !== scopeVersion.current) return;
      setQuote(data.quote);
    } catch (err: any) {
      if (scope !== scopeVersion.current) return;
      onShowToast('error', err.message || copyRef.current.quoteFail, copyRef.current.quoteTitle);
    } finally {
      if (scope === scopeVersion.current) setIsLoadingQuote(false);
    }
  }, [slug, guest, event, onShowToast]);

  useEffect(() => {
    if (guest?.blockedAt || guest?.removedAt) return;
    if (guest && guest.status === 'yes' && event && !newGuestActivityBlocked(event)) {
      fetchQuote();
    }
  }, [guest?.status, guest?.companions, guest?.blockedAt, guest?.removedAt, event, fetchQuote]);

  const handleJoin = async (name: string) => {
    const scope = scopeVersion.current;
    setIsJoining(true);
    try {
      const data = await api.joinEvent(slug, name);
      if (scope !== scopeVersion.current) return;
      setGuest(data.guest);
      onShowToast('success', copyRef.current.welcomeGuest(name), copyRef.current.joinedTitle);
    } catch (err: any) {
      if (scope !== scopeVersion.current) return;
      onShowToast('error', err.message || copyRef.current.joinFail, copyRef.current.joinFailTitle);
    } finally {
      if (scope === scopeVersion.current) {
        setIsJoining(false);
      }
    }
  };

  const handleSaveRsvp = async (status: RsvpStatus, companions: number) => {
    if (guest?.blockedAt || guest?.removedAt) {
      onShowToast('error', copyRef.current.revokedRsvp, copyRef.current.revokedTitle);
      throw new Error('sesion revocada');
    }
    const scope = scopeVersion.current;
    setIsSavingRsvp(true);
    try {
      const data = await api.rsvp(slug, status, companions);
      if (scope !== scopeVersion.current) return;
      setGuest(data.guest);
      setEvent(data.event);
      setQuote(null);
      setActiveOrder(null); // reset prior active order if assistance changed
      try {
        sessionStorage.removeItem(`fiestapay_order_${slug}`);
      } catch {
        // Storage is optional; the active order remains in React state.
      }
      onShowToast('success', copyRef.current.rsvpSaved, copyRef.current.rsvpSavedTitle);
    } catch (err: any) {
      if (scope !== scopeVersion.current) return;
      onShowToast('error', err.message || copyRef.current.rsvpFail, copyRef.current.rsvpFailTitle);
      throw err;
    } finally {
      if (scope === scopeVersion.current) {
        setIsSavingRsvp(false);
      }
    }
  };

  const handleCreateOrder = async (quoteId: string) => {
    if (guest?.blockedAt || guest?.removedAt) return;
    const scope = scopeVersion.current;
    setIsCreatingOrder(true);
    try {
      const orderRes = await api.createOrder(slug, quoteId);
      if (scope !== scopeVersion.current) return;
      setActiveOrder(orderRes);
      try {
        sessionStorage.setItem(`fiestapay_order_${slug}`, JSON.stringify(orderRes));
      } catch {
        // Storage is optional; the active order remains in React state.
      }
      onShowToast('info', copyRef.current.orderReady, copyRef.current.orderReadyTitle);
    } catch (err: any) {
      if (scope !== scopeVersion.current) return;
      onShowToast('error', err.message || copyRef.current.orderFail, copyRef.current.orderFailTitle);
    } finally {
      if (scope === scopeVersion.current) {
        setIsCreatingOrder(false);
      }
    }
  };

  const handleCaptureSuccess = async (orderId: string): Promise<boolean> => {
    if (guest?.blockedAt || guest?.removedAt) return false;
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
        onShowToast('success', copyRef.current.captureOk, copyRef.current.captureOkTitle);
        return true;
      } else {
        if (res.guest) {
          setGuest(res.guest);
        }
        onShowToast(
          'warning',
          copyRef.current.captureStatus(res.status),
          copyRef.current.captureStatusTitle
        );
        return false;
      }
    } catch (err: any) {
      if (scope !== scopeVersion.current) return false;
      onShowToast(
        'error',
        copyRef.current.captureCheckFail(err.message || copyRef.current.networkFallback),
        copyRef.current.captureCheckFailTitle
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
        onShowToast('success', copyRef.current.reconcilePaid, copyRef.current.paidTitle);
      } else {
        if (res.guest) setGuest(res.guest);
        onShowToast('info', copyRef.current.reconcileStatus(res.status), copyRef.current.reconcileTitle);
      }
    } catch (err: any) {
      if (scope !== scopeVersion.current) return;
      onShowToast('error', err.message || copyRef.current.reconcileFail, copyRef.current.reconcileFailTitle);
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
    onShowToast('info', copyRef.current.dismissOrder, copyRef.current.dismissTitle);
  };

  const handlePaymentCancelOrError = (msg: string) => {
    onShowToast('warning', msg, copyRef.current.payIncompleteTitle);
  };


  if (isLoading) {
    return (
      <div className="panel" style={{ textAlign: 'center', padding: '4rem 1rem' }}>
        <p style={{ color: 'var(--color-ink-muted)' }}>{m.loading}</p>
      </div>
    );
  }

  if (loadError && !event) {
    return (
      <div className="panel" style={{ textAlign: 'center', padding: '3rem 1rem', maxWidth: '560px', margin: '2rem auto' }}>
        <h3>{m.loadFail}</h3>
        <p role="alert" style={{ color: 'var(--color-ink-muted)', margin: '0.75rem 0 1.5rem 0' }}>
          {loadError}
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => void loadEvent()} className="btn btn-primary">
            {m.retry}
          </button>
          <button type="button" onClick={onNavigateHome} className="btn btn-secondary">
            {m.goHome}
          </button>
        </div>
      </div>
    );
  }

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnlocking(true);
    try {
      await api.unlockEvent(slug, accessCode);
      setNeedsCode(false);
      await loadEvent();
    } catch (err: unknown) {
      onShowToast('error', err instanceof Error ? err.message : copyRef.current.privateWrong, copyRef.current.privateToastTitle);
    } finally {
      setUnlocking(false);
    }
  };

  if (needsCode && !event) {
    return (
      <form className="panel" onSubmit={(e) => void submitCode(e)} style={{ maxWidth: '420px', margin: '2rem auto' }}>
        <h2>{m.privateTitle}</h2>
        <p style={{ color: 'var(--color-ink-muted)', margin: '0.5rem 0 1rem' }}>{m.privateHelp}</p>
        <label className="form-label" htmlFor="private-code">{m.privateLabel}</label>
        <input id="private-code" className="form-input" value={accessCode} onChange={(e) => setAccessCode(e.target.value)} autoComplete="off" />
        <button type="submit" className="btn btn-primary" style={{ marginTop: '0.75rem' }} disabled={unlocking}>
          {unlocking ? m.privateChecking : m.privateEnter}
        </button>
      </form>
    );
  }

  if (!event) {
    return (
      <div className="panel" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
        <h3>{m.notFoundTitle}</h3>
        <p style={{ color: 'var(--color-ink-muted)', margin: '0.75rem 0 1.5rem 0' }}>
          {m.notFoundBody}
        </p>
        <button onClick={onNavigateHome} className="btn btn-primary">
          {m.goHome}
        </button>
      </div>
    );
  }

  const theme = resolveTheme(event.template, event.theme);
  const copy = templateInviteCopy(event.template, locale);
  const whenLabel = formatEventRange(event.startsAt, event.endsAt, undefined, locale);
  const hostLine = organizerLine(event.organizerName, locale);
  const greeting = namedGreeting(event.organizerName, locale);
  const publicUrl = (() => {
    try {
      return publicInviteUrl(window.location.origin, event.slug);
    } catch {
      return shareableInviteUrl(window.location.href);
    }
  })();
  const shareText = buildInviteShareText({
    template: event.template,
    theme: theme.key,
    title: event.title,
    location: event.location,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    priceCents: event.priceCents,
    inviteUrl: publicUrl,
    organizerName: event.organizerName,
  }, locale);
  const activityBlocked = newGuestActivityBlocked(event);
  const sessionRevoked = Boolean(guest?.blockedAt || guest?.removedAt);
  const formsClosed = activityBlocked || sessionRevoked;
  const closedReason = activityBlocked
    ? (event.fundingStatus === 'failed' ? m.blockedFailed : m.blockedClosed)
    : sessionRevoked
      ? (guest?.removedAt ? m.revokedRemoved : m.revokedBlocked)
      : null;

  const paidOrCovered = Boolean(
    guest && guest.status === 'yes' && (quote ? quote.amountCents === 0 : guest.dueCents === 0 && guest.paidCents > 0),
  ) || activeOrder?.status === 'paid';

  return (
    <ThemeScope theme={theme}>
    <div className="invite-shell">
      {/* Main Signature Invitation Ticket */}
      <article className="ticket-card" aria-label={m.inviteAria(event.title)}>
        {/* Cover illustration */}
        <TemplateCover template={event.template} accent={theme.accent} height="200px" />

        {/* Header Section */}
        <div style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <span className="badge badge-blue">{m.quotaBadge(formatMoney(event.priceCents))}</span>
            {event.fundingStatus === 'failed' ? (
              <span className="badge badge-coral">{m.badgeFailed}</span>
            ) : event.confirmed ? (
              <span className="badge badge-teal">
                <Check size={14} aria-hidden="true" />
                <span>{m.badgeConfirmed}</span>
              </span>
            ) : event.fundingStatus === 'funded' ? (
              <span className="badge badge-blue">{m.badgeFunded}</span>
            ) : null}
          </div>

          <p className="theme-phrase" style={{ margin: '0 0 0.35rem' }}>{copy.welcome}</p>
          {greeting ? (
            <p style={{ margin: '0 0 0.35rem', color: 'var(--theme-muted, var(--color-ink-muted))' }}>{greeting}</p>
          ) : null}
          {hostLine ? (
            <p style={{ margin: '0 0 0.5rem', fontWeight: 700 }}>{hostLine}</p>
          ) : null}

          <h1 style={{ fontSize: '1.85rem', marginBottom: '0.5rem', color: 'var(--color-ink)' }}>
            {event.title}
          </h1>

          <p style={{ fontSize: '0.95rem', color: 'var(--color-ink-muted)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
            {event.description}
          </p>

          {/* Practical Logistics Details */}
          <div className="invite-facts">
            <div>
              <span style={{ color: 'var(--color-ink-muted)', display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>
                {m.factStartEnd}
              </span>
              <strong style={{ color: 'var(--color-ink)' }}>{whenLabel}</strong>
            </div>

            <div>
              <span style={{ color: 'var(--color-ink-muted)', display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>
                {m.factPlace}
              </span>
              <strong style={{ color: 'var(--color-ink)' }}>{event.location}</strong>
            </div>

            {event.template === 'comida' ? (
              <div>
                <span style={{ color: 'var(--color-ink-muted)', display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>
                  {m.factMeal}
                </span>
                <strong style={{ textTransform: 'capitalize', color: 'var(--color-ink)' }}>{mealLabel(event.meal, locale)}</strong>
              </div>
            ) : null}

            <div>
              <span style={{ color: 'var(--color-ink-muted)', display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>
                {m.factAttendance}
              </span>
              <strong style={{ color: 'var(--color-ink)' }}>
                {attendanceSummary({ paidPeople: event.paidPeople, capacity: event.capacity }, locale)}
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
              <MapPin size={16} aria-hidden="true" />
              <span>{m.mapsCta}</span>
            </a>
            <button
              onClick={() => setShowQrModal(true)}
              className="btn btn-secondary"
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
            >
              <QrCode size={16} aria-hidden="true" />
              <span>{m.qrCta}</span>
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
                {m.includesTitle}
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
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                    }}
                  >
                    <Check size={14} aria-hidden="true" />
                    <span>{item}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {event.agenda && event.agenda.length > 0 && (
            <div>
              <h3 style={{ fontSize: '1rem', marginBottom: '0.65rem', color: 'var(--color-ink)' }}>
                {m.agendaTitle}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {event.agenda.map((ag: AgendaItem, i: number) => (
                  <div key={i} style={{ display: 'flex', gap: '0.75rem', fontSize: '0.85rem', alignItems: 'baseline' }}>
                    <span style={{ fontWeight: 800, color: 'var(--color-blue)', minWidth: '50px' }}>{ag.time}</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                      <span style={{ color: 'var(--color-ink)' }}>{ag.title}</span>
                      {ag.speaker && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-ink-muted)' }}>
                          {m.speakerLabel(ag.speaker)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: '1.25rem' }}>
            <FundingStatusPanel
              event={event}
              audience="guest"
              paidCents={guest?.paidCents}
              dueCents={guest?.dueCents}
            />
          </div>
        </div>

        {/* Ticket Perforated Divider */}
        <TicketCutout />

        {/* Guest RSVP & Payment Stub */}
        <div style={{ padding: '1.5rem', backgroundColor: '#FAFCFE' }}>
          {activityBlocked && (
            <p className="funding-stopped-banner" role="status" style={{ marginBottom: '1rem' }}>
              {event.fundingStatus === 'failed' ? m.blockedFailed : m.blockedClosed}
            </p>
          )}
          {sessionRevoked && (
            <p className="session-revoked-banner" role="status" style={{ marginBottom: '1rem' }}>
              {guest?.removedAt ? m.revokedRemoved : m.revokedBlocked}
            </p>
          )}

          <PaymentWizard
            event={event}
            guest={guest}
            quote={quote}
            activeOrder={activeOrder}
            capabilities={capabilities}
            isJoining={isJoining}
            isSavingRsvp={isSavingRsvp}
            isLoadingQuote={isLoadingQuote}
            isCreatingOrder={isCreatingOrder}
            isReconcilingOrder={isReconcilingOrder}
            formsClosed={formsClosed}
            closedReason={closedReason}
            sessionRevoked={sessionRevoked}
            paidOrCovered={paidOrCovered}
            onJoin={handleJoin}
            onSaveRsvp={handleSaveRsvp}
            onCreateOrder={handleCreateOrder}
            onRefreshQuote={fetchQuote}
            onReconcileOrder={handleReconcileOrder}
            onDismissOrder={handleDismissOrder}
            onCaptureSuccess={handleCaptureSuccess}
            onCancelOrError={handlePaymentCancelOrError}
          />
        </div>
      </article>

      {/* QR Share Modal */}
      <QrShareModal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
        inviteUrl={publicUrl}
        eventTitle={event.title}
        shareText={shareText}
      />

      <AssistantOrb
        key={`guest:${slug}`}
        audience="guest"
        slug={slug}
        capabilities={capabilities}
        guest={guest}
        theme={{ template: event.template, themeKey: event.theme, meal: event.meal }}
        accessRevoked={sessionRevoked}
        eventClosed={activityBlocked}
        onApplyQuote={(q) => {
          setQuote(q);
          onShowToast('info', copyRef.current.assistantQuote, copyRef.current.quoteTitle);
        }}
        onConfirmRsvp={handleSaveRsvp}
        onShowToast={onShowToast}
      />
    </div>
    </ThemeScope>
  );
};
