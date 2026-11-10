import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Eye, Link2, MessageCircle, QrCode } from 'lucide-react';
import { UI_LABELS, formatEventDateTime, themePhrase, type Locale } from '@fiestapay/shared';
import type { Dashboard, Capabilities, EventInput, ModerationGuest } from '../types';
import { api, ApiError } from '../api/client';
import { adminKeyFor, rememberAdminKey } from '../api/admin-key';
import { useI18n, useMessages } from '../i18n/I18nContext';
import { dashboardCatalog } from '../i18n/messages/organizerDashboard';
import { GuestGrid } from '../components/dashboard/GuestGrid';
import { ModerationPanel } from '../components/dashboard/ModerationPanel';
import { ReminderDrafts } from '../components/dashboard/ReminderDrafts';
import { OrganizerLinkCard } from '../components/dashboard/OrganizerLinkCard';
import { RecoveryEmailCard } from '../components/dashboard/RecoveryEmailCard';
import { QrShareModal } from '../components/dashboard/QrShareModal';
import { CreateEventForm } from '../components/events/CreateEventForm';
import { Modal } from '../components/common/Modal';
import { OrganizerAssistant } from '../components/chat/OrganizerAssistant';
import { FundingStatusPanel, formatEventInstant } from '../components/common/FundingStatusPanel';
import { ThemeScope } from '../components/events/ThemeScope';
import {
  attendanceSummary,
  buildInviteShareText,
  buildInviteShareUrl,
  formatEventRange,
  goalProgressPercent,
  organizerLine,
  publicInviteUrl,
  resolveTheme,
  shareableInviteUrl,
} from '../lib/event-presentation';
import { orderStatusLabel } from '../lib/order-status';

interface GatheringCopy {
  noun: string;
  phrase: string;
  ofPhrase: string;
  feminine: boolean;
}

/** Noun without article. Viaje and evento stay masculine. Unknown context stays "invitación". */
function gatheringCopy(template: string | null | undefined, locale: Locale = 'es'): GatheringCopy {
  if (locale === 'en') {
    switch (template) {
      case 'comida':
        return { noun: 'meal', phrase: 'the meal', ofPhrase: 'of the meal', feminine: false };
      case 'casa':
        return { noun: 'house gathering', phrase: 'the house gathering', ofPhrase: 'of the house gathering', feminine: false };
      case 'viaje':
        return { noun: 'trip', phrase: 'the trip', ofPhrase: 'of the trip', feminine: false };
      case 'evento':
        return { noun: 'event', phrase: 'the event', ofPhrase: 'of the event', feminine: false };
      default:
        return { noun: 'invitation', phrase: 'the invitation', ofPhrase: 'of the invitation', feminine: false };
    }
  }
  switch (template) {
    case 'comida':
      return { noun: 'comida', phrase: 'la comida', ofPhrase: 'de la comida', feminine: true };
    case 'casa':
      return { noun: 'casa', phrase: 'la casa', ofPhrase: 'de la casa', feminine: true };
    case 'viaje':
      return { noun: 'viaje', phrase: 'el viaje', ofPhrase: 'del viaje', feminine: false };
    case 'evento':
      return { noun: 'evento', phrase: 'el evento', ofPhrase: 'del evento', feminine: false };
    default:
      return { noun: 'invitación', phrase: 'la invitación', ofPhrase: 'de la invitación', feminine: true };
  }
}

function capitalLabel(value: string, locale: Locale): string {
  return value.length === 0 ? value : value.charAt(0).toLocaleUpperCase(locale === 'en' ? 'en-US' : 'es-EC') + value.slice(1);
}

function gendered(copy: GatheringCopy, feminine: string, masculine: string): string {
  return copy.feminine ? feminine : masculine;
}

interface OrganizerDashboardViewProps {
  slug: string;
  capabilities: Capabilities | null;
  onNavigateInvite: (slug: string) => void;
  onNavigateHome: () => void;
  /** Existing recovery route. Offered without changing server-side authorization. */
  onNavigateRecover?: () => void;
  onShowToast: (type: 'success' | 'error' | 'info' | 'warning', message: string, title?: string) => void;
}

export const OrganizerDashboardView: React.FC<OrganizerDashboardViewProps> = ({
  slug,
  capabilities,
  onNavigateInvite,
  onNavigateHome,
  onNavigateRecover,
  onShowToast,
}) => {
  const { locale, formatMoney } = useI18n();
  const m = useMessages(dashboardCatalog);
  const labels = UI_LABELS[locale];
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [busyLifecycle, setBusyLifecycle] = useState(false);
  const requestVersion = useRef(0);
  const [moderationTick, setModerationTick] = useState(0);
  const [moderationById, setModerationById] = useState<Record<string, ModerationGuest>>({});
  const [moderationBusyId, setModerationBusyId] = useState<string | null>(null);
  const storedKey = adminKeyFor(slug);
  const rememberGuests = useCallback((list: ModerationGuest[]) => {
    setModerationById(Object.fromEntries(list.map((guest) => [guest.id, guest])));
  }, []);

  useEffect(() => {
    const version = ++requestVersion.current;
    setDashboard(null);
    setIsLoading(true);
    setLoadError(null);
    setAccessDenied(false);
    setShowConfirmModal(false);
    setShowQrModal(false);
    setIsConfirming(false);
    const load = async () => {
      try {
        return await api.getDashboard(slug);
      } catch (err) {
        if (err instanceof ApiError && err.status === 403 && !adminKeyFor(slug)) {
          const minted = await api.bootstrapAdminKey(slug);
          rememberAdminKey(slug, minted.adminKey);
          return api.getDashboard(slug);
        }
        throw err;
      }
    };
    void load().then(data => {
      if (requestVersion.current === version) setDashboard(data);
    }).catch((err: Error) => {
      if (requestVersion.current === version) {
        if (err instanceof ApiError && err.status === 403) setAccessDenied(true);
        setLoadError(err.message || m.loadFailFallback);
        onShowToast('error', err.message || m.loadFailFallback, m.loadFailTitle);
      }
    }).finally(() => {
      if (requestVersion.current === version) setIsLoading(false);
    });
    return () => { requestVersion.current += 1; };
  }, [slug, onShowToast, reloadTick, m]);

  const handleConfirmEvent = async () => {
    const version = requestVersion.current;
    setIsConfirming(true);
    try {
      const res = await api.confirmEvent(slug);
      if (requestVersion.current !== version) return;
      setDashboard((prev: Dashboard | null) => (prev ? { ...prev, event: res.event } : null));
      setShowConfirmModal(false);
      const copy = gatheringCopy(dashboard?.event.template, locale);
      onShowToast(
        'success',
        m.confirmDoneMsg(capitalLabel(copy.phrase, locale), gendered(copy, 'confirmada', 'confirmado')),
        m.confirmDoneTitle(capitalLabel(copy.noun, locale), gendered(copy, 'confirmada', 'confirmado')),
      );
    } catch (err: any) {
      if (requestVersion.current !== version) return;
      onShowToast('error', err.message || m.confirmFailMsg(gatheringCopy(dashboard?.event.template, locale).phrase), m.confirmFailTitle);
    } finally {
      if (requestVersion.current === version) setIsConfirming(false);
    }
  };

  const inviteUrl = `${window.location.origin}/e/${slug}`;

  const moderateGuest = async (action: 'block' | 'unblock' | 'remove', guestId: string) => {
    setModerationBusyId(guestId);
    try {
      const result =
        action === 'block'
          ? await api.blockGuest(slug, guestId)
          : action === 'unblock'
            ? await api.unblockGuest(slug, guestId)
            : await api.removeGuest(slug, guestId);
      onShowToast('success', result.message, m.moderationTitle);
    } catch (err) {
      const message = err instanceof Error ? err.message : m.moderateFail;
      onShowToast('error', message, m.moderationTitle);
    } finally {
      setModerationBusyId(null);
      setModerationTick((value) => value + 1);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedLink(true);
      onShowToast('info', m.copiedMsg, m.copiedTitle);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // fallback
    }
  };

  const handleWhatsAppShare = () => {
    if (!dashboard) return;
    const { event } = dashboard;
    const publicUrl = (() => {
      try {
        return publicInviteUrl(window.location.origin, event.slug);
      } catch {
        return shareableInviteUrl(inviteUrl);
      }
    })();
    const whatsappUrl = buildInviteShareUrl({
      template: event.template,
      theme: event.theme,
      title: event.title,
      location: event.location,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      priceCents: event.priceCents,
      inviteUrl: publicUrl,
      organizerName: event.organizerName,
    }, locale);
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  if (isLoading || (dashboard && dashboard.event.slug !== slug)) {
    return (
      <div className="panel" style={{ textAlign: 'center', padding: '4rem 1rem' }}>
        <p style={{ color: 'var(--color-ink-muted)' }}>{m.loading}</p>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="panel" style={{ textAlign: 'center', padding: '3rem 1rem', maxWidth: '620px', margin: '2rem auto' }}>
        <h3>{m.accessTitle}</h3>
        <p style={{ color: 'var(--color-ink-muted)', margin: '0.75rem 0 1.5rem 0' }}>
          {accessDenied
            ? m.accessBody
            : m.loadFailBody(loadError ? `: ${loadError}` : '')}
        </p>
        <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          {!accessDenied ? (
            <button type="button" onClick={() => setReloadTick((value) => value + 1)} className="btn btn-primary">
              {m.retry}
            </button>
          ) : null}
          {onNavigateRecover ? (
            <button type="button" onClick={onNavigateRecover} className="btn btn-secondary">
              {labels.recoverLink}
            </button>
          ) : null}
          <button type="button" onClick={() => onNavigateInvite(slug)} className="btn btn-secondary">
            {m.viewPublic}
          </button>
          <button type="button" onClick={onNavigateHome} className="btn btn-secondary">
            {m.backTo(labels.myInvitations)}
          </button>
        </div>
      </div>
    );
  }

  const handleSaveEdit = async (input: EventInput) => {
    setSavingEdit(true);
    try {
      const res = await api.updateEvent(slug, input);
      setDashboard((prev) => (prev ? { ...prev, event: res.event } : prev));
      setEditing(false);
      const copy = gatheringCopy(dashboard.event.template, locale);
      onShowToast('success', m.savedMsg, m.savedTitle(capitalLabel(copy.noun, locale), gendered(copy, 'actualizada', 'actualizado')));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleClose = async () => {
    setBusyLifecycle(true);
    try {
      const res = await api.closeEvent(slug);
      setDashboard((prev) => (prev ? { ...prev, event: res.event } : prev));
      setShowClose(false);
      const copy = gatheringCopy(dashboard.event.template, locale);
      onShowToast('info', m.closedMsg, m.closedTitle(capitalLabel(copy.noun, locale), gendered(copy, 'cerrada', 'cerrado')));
    } catch (err: unknown) {
      onShowToast('error', err instanceof Error ? err.message : m.closeFail, m.confirmFailTitle);
    } finally {
      setBusyLifecycle(false);
    }
  };

  const handleDelete = async () => {
    setBusyLifecycle(true);
    try {
      await api.deleteEvent(slug);
      setShowDelete(false);
      const copy = gatheringCopy(dashboard.event.template, locale);
      onShowToast(
        'info',
        m.deletedMsg(capitalLabel(copy.phrase, locale), gendered(copy, 'pública', 'público')),
        m.deletedTitle(capitalLabel(copy.noun, locale), gendered(copy, 'eliminada', 'eliminado')),
      );
      onNavigateHome();
    } catch (err: unknown) {
      onShowToast('error', err instanceof Error ? err.message : m.deleteFail, m.confirmFailTitle);
      setBusyLifecycle(false);
    }
  };

  const { event, guests, guestTotals, audit, payments } = dashboard;
  const copy = gatheringCopy(event.template, locale);
  const canConfirm = !event.minimumCents || event.minimumReached;
  const theme = resolveTheme(event.template, event.theme);
  const parties = guests.filter((guest) => !guest.removedAt).length;
  const attendance = attendanceSummary({ parties, paidPeople: event.paidPeople, capacity: event.capacity }, locale);
  const hostLine = organizerLine(event.organizerName, locale);
  const whenLabel = formatEventRange(event.startsAt, event.endsAt, undefined, locale);
  const goalPct = goalProgressPercent(event.collectedCents, event.goalCents);
  const shareDraft = buildInviteShareText({
    template: event.template,
    theme: theme.key,
    title: event.title,
    location: event.location,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    priceCents: event.priceCents,
    inviteUrl,
    organizerName: event.organizerName,
  }, locale);

  return (
    <ThemeScope theme={theme}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem', minWidth: 0, maxWidth: '100%' }}>
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
            <span className="badge badge-ink">{m.badgePanel}</span>
            {event.fundingStatus === 'failed' ? (
              <span className="badge badge-coral">{m.badgeFailed}</span>
            ) : event.confirmed ? (
              <span className="badge badge-teal">
                <Check size={14} aria-hidden="true" />
                <span>{m.badgeConfirmed}</span>
              </span>
            ) : (
              <span className="badge badge-yellow">{m.badgePending}</span>
            )}
            {event.fundingStatus === 'funded' ? (
              <span className="badge badge-blue">{m.badgeFunded}</span>
            ) : null}
          </div>
          <h1 style={{ fontSize: '1.65rem', color: 'var(--color-ink)' }}>{event.title}</h1>
          {hostLine ? <p style={{ fontSize: '0.875rem', fontWeight: 700 }}>{hostLine}</p> : null}
          <p className="theme-phrase" style={{ fontSize: '0.95rem', margin: '0.15rem 0' }}>{themePhrase(theme.key, locale)}</p>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-ink-muted)' }}>
            {event.location} · {whenLabel}
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button onClick={() => onNavigateInvite(slug)} className="btn btn-secondary" style={{ fontSize: '0.85rem' }}>
            <Eye size={16} aria-hidden="true" />
            <span>{m.viewInviteBtn}</span>
          </button>
          <button onClick={handleWhatsAppShare} className="btn btn-teal" style={{ fontSize: '0.85rem' }}>
            <MessageCircle size={16} aria-hidden="true" />
            <span>{m.shareWhatsapp}</span>
          </button>
          <button onClick={() => setShowQrModal(true)} className="btn btn-secondary" style={{ fontSize: '0.85rem' }}>
            <QrCode size={16} aria-hidden="true" />
            <span>{m.qrBtn}</span>
          </button>
          <button onClick={handleCopyLink} className="btn btn-secondary" style={{ fontSize: '0.85rem' }}>
            {copiedLink ? <Check size={16} aria-hidden="true" /> : <Link2 size={16} aria-hidden="true" />}
            <span>{copiedLink ? m.copiedBtn : m.copyLink}</span>
          </button>
          <button type="button" onClick={() => setEditing((v) => !v)} className="btn btn-secondary" style={{ fontSize: '0.85rem' }}>
            {editing ? m.editClose : m.editOpen(copy.noun)}
          </button>
          <button type="button" onClick={() => setShowClose(true)} className="btn btn-secondary" style={{ fontSize: '0.85rem' }} disabled={event.closed}>
            {m.closeCta}
          </button>
          <button type="button" onClick={() => setShowDelete(true)} className="btn btn-secondary" style={{ fontSize: '0.85rem' }}>
            {m.deleteCta(copy.noun)}
          </button>
        </div>
      </div>

      {storedKey ? (
        <>
          <OrganizerLinkCard slug={slug} adminKey={storedKey} recoveryAvailable={capabilities?.email === true} />
          <RecoveryEmailCard slug={slug} available={capabilities?.email === true} />
        </>
      ) : null}

      {editing ? (
        <div className="panel">
          <CreateEventForm
            initial={event}
            onSubmit={handleSaveEdit}
            onCancel={() => setEditing(false)}
            isLoading={savingEdit}
            submitLabel={m.saveChanges}
          />
        </div>
      ) : null}

      <section className="panel" aria-label={m.paymentsAria}>
        <h2 style={{ fontSize: '1.15rem', marginBottom: '0.5rem' }}>{m.paymentsTitle}</h2>
        {(payments ?? []).length === 0 ? (
          <p style={{ color: 'var(--color-ink-muted)', fontSize: '0.875rem' }}>{m.paymentsEmpty}</p>
        ) : (
          <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.875rem' }}>
            {(payments ?? []).map((payment) => (
              <li key={payment.orderId}>
                {payment.guestName || m.paymentGuestFallback} · {formatMoney(payment.amountCents)} · {orderStatusLabel(payment.status, locale)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <FundingStatusPanel event={event} audience="admin" parties={parties} />

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
            {m.raisedKicker}
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--color-ink)', margin: '0.2rem 0' }}>
            {formatMoney(event.collectedCents)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-ink-light)' }}>
            {m.raisedHint}
          </div>
        </div>

        {/* Goal */}
        <div className="panel" style={{ borderLeft: '4px solid var(--color-blue)' }}>
          <div style={{ fontSize: '0.775rem', color: 'var(--color-ink-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
            {m.goalKicker}
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--color-ink)', margin: '0.2rem 0' }}>
            {event.goalCents ? formatMoney(event.goalCents) : m.goalNone}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-ink-light)' }}>
            {goalPct !== null ? m.goalReached(goalPct) : m.goalFlexible}
          </div>
        </div>

        {/* Minimum Threshold */}
        <div className="panel" style={{ borderLeft: '4px solid var(--color-coral)' }}>
          <div style={{ fontSize: '0.775rem', color: 'var(--color-ink-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
            {m.minKicker}
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--color-ink)', margin: '0.2rem 0' }}>
            {event.minimumCents ? formatMoney(event.minimumCents) : m.minNone}
          </div>
          <div style={{ fontSize: '0.75rem' }}>
            {event.minimumCents ? (
              event.minimumReached ? (
                <span style={{ color: 'var(--color-teal)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Check size={14} aria-hidden="true" />
                  <span>{m.minReached}</span>
                </span>
              ) : (
                <span style={{ color: 'var(--color-coral)', fontWeight: 700 }}>{m.minMissing(formatMoney(event.minimumCents - event.collectedCents))}</span>
              )
            ) : (
              <span style={{ color: 'var(--color-ink-light)' }}>{m.minNoCondition}</span>
            )}
            {event.fundingDeadlineAt && event.fundingStatus !== 'legacy' && event.fundingStatus !== 'inactive' ? (
              <div style={{ fontSize: '0.75rem', color: 'var(--color-ink-muted)', marginTop: '0.35rem' }}>
                {m.deadlineLine(formatEventInstant(event.fundingDeadlineAt, locale))}
              </div>
            ) : null}
          </div>
        </div>

        {/* Capacity / Attendees */}
        <div className="panel" style={{ borderLeft: '4px solid var(--color-yellow)' }}>
          <div style={{ fontSize: '0.775rem', color: 'var(--color-ink-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
            {m.confirmedKicker}
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--color-ink)', margin: '0.2rem 0' }}>
            {event.confirmedPeople} {event.capacity ? `/ ${event.capacity}` : ''}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-ink-light)' }}>
            {attendance}
          </div>
        </div>
      </div>

      {/* Confirmation of Event Realization */}
      {!event.confirmed && event.fundingStatus !== 'failed' && (
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
            <h3 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>{m.confirmCardTitle(locale === 'en' ? copy.phrase : copy.ofPhrase)}</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-ink-muted)' }}>
              {canConfirm
                ? m.confirmCardOk(copy.phrase)
                : m.confirmCardNeedMin(formatMoney(event.minimumCents || 0), locale === 'en' ? copy.phrase : copy.ofPhrase)}
            </p>
          </div>
          <div>
            <button
              onClick={() => setShowConfirmModal(true)}
              disabled={!canConfirm}
              className="btn btn-teal"
              style={{ fontWeight: 700 }}
              title={canConfirm ? m.confirmBtnTitleOk(copy.noun) : m.confirmBtnTitleNeedMin}
            >
              {labels.confirmEvent}
            </button>
          </div>
        </div>
      )}

      {/* Guests Management AG Grid Table */}
      <section aria-label={m.guestsAria} style={{ width: '100%', overflowX: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem' }}>{m.guestsTitle}</h2>
            <p style={{ fontSize: '0.825rem', color: 'var(--color-ink-muted)' }}>
              {m.guestsSub}
            </p>
          </div>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-ink-muted)' }}>
            {m.guestsCount(guests.length)}
          </span>
        </div>

        <GuestGrid
          guests={guests.map((guest) => {
            const extra = moderationById[guest.id];
            return extra
              ? {
                  ...guest,
                  blockedAt: extra.blockedAt,
                  removedAt: extra.removedAt,
                  paymentPending: extra.paymentPending,
                }
              : guest;
          })}
          eventTitle={event.title}
          inviteUrl={inviteUrl}
          guestTotals={guestTotals}
          moderation={{
            busyId: moderationBusyId,
            onBlock: (guestId) => void moderateGuest('block', guestId),
            onUnblock: (guestId) => void moderateGuest('unblock', guestId),
            onRemove: (guestId) => void moderateGuest('remove', guestId),
          }}
        />
        <ModerationPanel slug={slug} refreshKey={moderationTick} onGuests={rememberGuests} />
        <p style={{ fontSize: '0.775rem', color: 'var(--color-ink-light)', marginTop: '0.5rem' }}>
          {m.guestsFoot}
        </p>
      </section>

      <ReminderDrafts slug={slug} />

      {/* Audit Trail */}
      {audit && audit.length > 0 && (
        <section aria-label={m.auditAria} className="panel">
          <h3 style={{ fontSize: '1.05rem', marginBottom: '0.75rem' }}>{m.auditTitle}</h3>
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
                  {formatEventDateTime(entry.createdAt, locale, { hour: '2-digit', minute: '2-digit' })}
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
        shareText={shareDraft}
      />

      {/* Confirm Event Modal */}
      <Modal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        title={m.confirmModalTitle}
        description={m.confirmModalDesc}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-ink-muted)', lineHeight: 1.5 }}>
            {m.confirmModalBody(event.title)}
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button onClick={() => setShowConfirmModal(false)} className="btn btn-secondary" disabled={isConfirming}>
              {m.modalCancel}
            </button>
            <button onClick={handleConfirmEvent} className="btn btn-teal" disabled={isConfirming}>
              {isConfirming ? m.confirming : labels.confirmEvent}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showClose} onClose={() => setShowClose(false)} title={m.closeModalTitle} description={m.closeModalDesc}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <button type="button" className="btn btn-secondary" onClick={() => setShowClose(false)} disabled={busyLifecycle}>{m.modalCancel}</button>
          <button type="button" className="btn btn-primary" onClick={() => void handleClose()} disabled={busyLifecycle}>{m.closeModalYes}</button>
        </div>
      </Modal>
      <Modal isOpen={showDelete} onClose={() => setShowDelete(false)} title={m.deleteModalTitle(locale === 'en' ? 'this' : (copy.feminine ? 'esta' : 'este'), copy.noun)} description={m.deleteModalDesc}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <button type="button" className="btn btn-secondary" onClick={() => setShowDelete(false)} disabled={busyLifecycle}>{m.modalCancel}</button>
          <button type="button" className="btn btn-primary" onClick={() => void handleDelete()} disabled={busyLifecycle}>{m.deleteModalYes(copy.phrase)}</button>
        </div>
      </Modal>

      <OrganizerAssistant
        slug={slug}
        capabilities={capabilities}
        theme={{ template: event.template, themeKey: event.theme, meal: event.meal }}
      />
    </div>
    </ThemeScope>
  );
};
