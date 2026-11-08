import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DEMO_GUEST_NAME, type AssistantContext } from '@fiestapay/shared';
import type { Capabilities, FiestaEvent, ToastMessage } from './types';
import { api, ApiError } from './api/client';
import { adminKeyFor, captureAdminKeyFromLocation, rememberAdminKey } from './api/admin-key';
import { useI18n, useMessages } from './i18n/I18nContext';
import { appCatalog } from './i18n/catalogs/app';
import { DemoRibbon } from './components/common/DemoRibbon';
import { Header } from './components/common/Header';
import { ToastContainer } from './components/common/Toast';
import { LandingView } from './views/LandingView';
import { CreateEventView } from './views/CreateEventView';
import { PublicInviteView } from './views/PublicInviteView';
import { OrganizerDashboardView } from './views/OrganizerDashboardView';
import { OrganizerRecoveryView } from './views/OrganizerRecoveryView';
import { JudgePreviewView } from './views/JudgePreviewView';
import { AssistantOrb } from './components/assistant/AssistantOrb';
import { DemoBuyerAccountCard } from './components/demo/DemoBuyerAccountCard';

const DEMO_PAYMENT_SLUG_KEY = 'fp_demo_payment_slug';

/** UI association only. This marker grants no access and is never sent to the server. */
function readDemoPaymentSlug(): string | null {
  try {
    const value = sessionStorage.getItem(DEMO_PAYMENT_SLUG_KEY);
    return value && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function rememberDemoPaymentSlug(slug: string): void {
  try {
    sessionStorage.setItem(DEMO_PAYMENT_SLUG_KEY, slug);
  } catch {
    // The invitation still works; only the extra account card loses its UI association.
  }
}

type ViewMode =
  | { mode: 'home' }
  | { mode: 'demo' }
  | { mode: 'create' }
  | { mode: 'invite'; slug: string }
  | { mode: 'dashboard'; slug: string }
  | { mode: 'recover' };

export const App: React.FC = () => {
  captureAdminKeyFromLocation();
  const { locale } = useI18n();
  const m = useMessages(appCatalog);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [events, setEvents] = useState<FiestaEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [isResettingDemo, setIsResettingDemo] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [currentView, setCurrentView] = useState<ViewMode>({ mode: 'home' });
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [demoPaymentSlug, setDemoPaymentSlug] = useState<string | null>(() => readDemoPaymentSlug());
  const [orbOpenSignal, setOrbOpenSignal] = useState<number | undefined>(undefined);
  const demoCreationRef = useRef<Promise<void> | null>(null);
  const paymentDemoRef = useRef<Promise<void> | null>(null);
  const paymentDemoSlugRef = useRef<string | null>(null);
  const paymentCreationUncertainRef = useRef(false);
  // Latest copy without re-running the mount effect on every language switch.
  const copyRef = useRef(m);
  copyRef.current = m;
  const localeRef = useRef(locale);
  localeRef.current = locale;

  const showToast = useCallback(
    (type: 'success' | 'error' | 'info' | 'warning', message: string, title?: string) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, type, message, title }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 5000);
    },
    []
  );

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // URL Routing helper
  const navigate = useCallback((view: ViewMode, push = true) => {
    setCurrentView(view);
    let path = '/';
    if (view.mode === 'create') path = '/create';
    else if (view.mode === 'demo') path = '/demo';
    else if (view.mode === 'recover') path = '/recover';
    else if (view.mode === 'invite') path = `/e/${view.slug}`;
    else if (view.mode === 'dashboard') path = `/e/${view.slug}/admin`;

    if (push && window.location.pathname !== path) {
      window.history.pushState(view, '', path);
    }
  }, []);

  /** Header entry: landing plus a scroll to the visitor's own invitations. */
  const goToOwnInvitations = useCallback(() => {
    navigate({ mode: 'home' });
    window.setTimeout(() => {
      try {
        document.getElementById('my-invitations')?.scrollIntoView?.();
      } catch {
        // The landing is still usable without the scroll.
      }
    }, 0);
  }, [navigate]);

  // Parse path on initial load & popstate
  const handleLocationChange = useCallback(() => {
    const path = window.location.pathname;
    if (path === '/demo' || path === '/demo/') {
      setCurrentView({ mode: 'demo' });
      return;
    }
    if (path === '/recover' || path === '/recover/') {
      setCurrentView({ mode: 'recover' });
      return;
    }
    const dashboardMatch = path.match(/^\/e\/([^/]+)\/(?:admin|dashboard)\/?$/);
    if (dashboardMatch && dashboardMatch[1]) {
      setCurrentView({ mode: 'dashboard', slug: decodeURIComponent(dashboardMatch[1]) });
      return;
    }
    const inviteMatch = path.match(/^\/e\/([^/]+)\/?$/);
    if (inviteMatch) {
      setCurrentView({ mode: 'invite', slug: decodeURIComponent(inviteMatch[1]) });
      return;
    }
    if (path === '/create') {
      setCurrentView({ mode: 'create' });
      return;
    }
    setCurrentView({ mode: 'home' });
  }, []);

  // Initialize capabilities and restore organizer session. Both reads are bounded by the
  // API client timeout, so the home loader cannot stay pending forever.
  const initApp = useCallback(async () => {
    setSessionError(null);
    setIsLoadingEvents(true);
    setEventsError(null);
    const capabilitiesTask = api
      .getCapabilities()
      .then((caps) => setCapabilities(caps))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : null;
        setSessionError(message || copyRef.current.sessionFallback);
      });
    const eventsTask = api
      .getOrganizerEvents()
      .then((res) => setEvents(res.events || []))
      .catch((err: unknown) => {
        // Keep any history already shown. The home view offers a bounded retry.
        const message = err instanceof Error ? err.message : null;
        setEventsError(message || copyRef.current.eventsFallback);
      })
      .finally(() => setIsLoadingEvents(false));
    await Promise.allSettled([capabilitiesTask, eventsTask]);
  }, []);

  useEffect(() => {
    handleLocationChange();
    initApp();

    const onPopState = () => handleLocationChange();
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [handleLocationChange, initApp]);

  useEffect(() => {
    document.title = m.docTitle;
  }, [m]);

  /**
   * Fresh private judge demo. `POST /api/demo` always mints a new `is_demo`
   * event, so a historical demo without a stored key is never reused.
   * The server mints the key; the browser stores it and only then opens the panel.
   */
  const handleCreateDemo = useCallback((): Promise<void> => {
    if (demoCreationRef.current) return demoCreationRef.current;

    const creation = (async () => {
      try {
        const res = await api.createDemo('private');
        setEvents((prev) => [res.event, ...prev.filter((event) => event.id !== res.event.id)]);
        if (!res.adminKey) {
          showToast('error', copyRef.current.demoNoKey, copyRef.current.demoNoKeyTitle);
          return;
        }
        rememberAdminKey(res.event.slug, res.adminKey);
        showToast('success', copyRef.current.demoReady(res.event.title), copyRef.current.demoReadyTitle);
        navigate({ mode: 'dashboard', slug: res.event.slug });
      } catch (err: unknown) {
        const message = err instanceof Error && err.message ? err.message : copyRef.current.demoCreateFail;
        showToast('error', message, copyRef.current.demoCreateFailTitle);
      } finally {
        demoCreationRef.current = null;
      }
    })();

    demoCreationRef.current = creation;
    return creation;
  }, [navigate, showToast]);

  /**
   * Explicit payment demo. It creates exactly one fresh isolated demo through
   * `POST /api/demo`, saves its organizer key and slug before any guest work,
   * joins the locale's fictional guest, prepares an RSVP for two people, and
   * opens the ordinary invitation. It never opens PayPal, an order, or a quote.
   */
  const handleStartPaymentDemo = useCallback((): Promise<void> => {
    if (paymentDemoRef.current) return paymentDemoRef.current;

    const start = (async () => {
      let slug = paymentDemoSlugRef.current;
      const copy = copyRef.current;
      const guestName = DEMO_GUEST_NAME[localeRef.current];
      try {
        if (!slug) {
          if (paymentCreationUncertainRef.current) {
            showToast('warning', copy.payUncertainRetry, copy.payUncertainTitle);
            return;
          }

          let created: Awaited<ReturnType<typeof api.createDemo>>;
          try {
            created = await api.createDemo('payment');
          } catch (err: unknown) {
            if (err instanceof ApiError && err.status === 408) {
              paymentCreationUncertainRef.current = true;
              showToast('warning', copy.payUncertainFirst, copy.payUncertainTitle);
            } else {
              const message = err instanceof Error && err.message ? err.message : copy.payCreateFail;
              showToast('error', message, copy.payPrepareFailTitle);
            }
            return;
          }

          slug = created.event.slug;
          // Remember both facts before the next network call, so a partial join never causes a
          // second event to be created blindly on retry.
          paymentDemoSlugRef.current = slug;
          if (created.adminKey) rememberAdminKey(slug, created.adminKey);
          setEvents((prev) => [created.event, ...prev.filter((event) => event.id !== created.event.id)]);
          rememberDemoPaymentSlug(slug);
          setDemoPaymentSlug(slug);
        }

        const joined = await api.joinEvent(slug, guestName);
        // A completed paid session keeps its existing RSVP. Reloading this screen never starts
        // this flow; this guard only protects an explicit retry after a completed payment.
        if (!(joined.guest.paidCents > 0)) {
          await api.rsvp(slug, 'yes', 1);
        }
        showToast('success', copy.payReady(guestName), copy.payReadyTitle);
        navigate({ mode: 'invite', slug });
      } catch {
        const where = slug ? copy.payIncompleteSlug(slug) : copy.payIncompleteNone;
        showToast('error', where, copy.payIncompleteTitle);
      } finally {
        paymentDemoRef.current = null;
      }
    })();

    paymentDemoRef.current = start;
    return start;
  }, [navigate, showToast]);

  // Handle Reset Demo. It archives only this session's demos and stays on /demo.
  const handleResetDemo = async () => {
    setIsResettingDemo(true);
    try {
      const res = await api.resetDemo();
      if (res.adminKey) rememberAdminKey(res.event.slug, res.adminKey);
      try {
        const list = await api.getOrganizerEvents();
        setEvents(list.events || []);
      } catch {
        setEvents([res.event]);
      }
      showToast('info', copyRef.current.resetDone, copyRef.current.resetDoneTitle);
      navigate({ mode: 'demo' });
    } catch (err: unknown) {
      const message = err instanceof Error && err.message ? err.message : copyRef.current.resetFail;
      showToast('error', message, copyRef.current.resetFailTitle);
    } finally {
      setIsResettingDemo(false);
    }
  };

  const handleTalkToAssistant = useCallback(() => {
    setOrbOpenSignal((prev) => (prev ?? 0) + 1);
  }, []);

  const publicContext: AssistantContext = currentView.mode === 'demo' ? 'demo' : 'landing';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Sandbox Demo Ribbon */}
      <DemoRibbon
        capabilities={capabilities}
        status={capabilities ? 'ready' : sessionError ? 'unavailable' : 'loading'}
        onRetry={capabilities || !sessionError ? undefined : initApp}
      />

      {/* Global Navigation Header */}
      <Header
        onNavigateHome={goToOwnInvitations}
        onNavigateCreate={() => navigate({ mode: 'create' })}
        onNavigateDemo={() => navigate({ mode: 'demo' })}
        hasActiveEvent={events.length > 0}
      />

      {/* Expired Session / Connection Recovery Banner */}
      {sessionError && (
        <div
          style={{
            backgroundColor: 'var(--color-coral-tint)',
            borderBottom: '1px solid var(--color-coral)',
            padding: '0.75rem 1rem',
            textAlign: 'center',
            fontSize: '0.875rem',
            color: 'var(--color-coral)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
          }}
          role="alert"
        >
          <span>⚠️ {sessionError}</span>
          <button onClick={initApp} className="btn btn-secondary" style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}>
            {m.retryConnection}
          </button>
        </div>
      )}

      {/* Main Body View */}
      <main className="app-container" style={{ marginTop: '1.5rem', flex: 1 }}>
        {currentView.mode === 'home' && (
          <LandingView
            events={events}
            isLoading={isLoadingEvents}
            eventsError={eventsError}
            onRetryEvents={initApp}
            onNavigateCreate={() => navigate({ mode: 'create' })}
            onNavigateInvite={(slug) => navigate({ mode: 'invite', slug })}
            onNavigateDashboard={(slug) => navigate({ mode: 'dashboard', slug })}
            onNavigateDemo={() => navigate({ mode: 'demo' })}
            onNavigateRecover={() => navigate({ mode: 'recover' })}
          />
        )}

        {currentView.mode === 'demo' && (
          <JudgePreviewView
            events={events}
            isLoading={isLoadingEvents}
            eventsError={eventsError}
            onRetryEvents={initApp}
            onCreateDemo={handleCreateDemo}
            onStartPaymentDemo={handleStartPaymentDemo}
            onTalkToAssistant={handleTalkToAssistant}
            onResetDemo={handleResetDemo}
            isResetting={isResettingDemo}
            onNavigateInvite={(slug) => navigate({ mode: 'invite', slug })}
            onNavigateDashboard={(slug) => navigate({ mode: 'dashboard', slug })}
            onNavigateRecover={() => navigate({ mode: 'recover' })}
            onBack={() => navigate({ mode: 'home' })}
          />
        )}

        {currentView.mode === 'create' && (
          <CreateEventView
            recoveryAvailable={capabilities?.email === true}
            onEventCreated={(slug) => {
              initApp();
              // The create response already stored the organizer key. A missing key stays public.
              navigate({ mode: adminKeyFor(slug) ? 'dashboard' : 'invite', slug });
            }}
            onCancel={() => navigate({ mode: 'home' })}
            onShowToast={showToast}
          />
        )}

        {currentView.mode === 'invite' && (
          <div>
            {demoPaymentSlug === currentView.slug ? (
              <div style={{ marginBottom: '1rem' }}>
                <DemoBuyerAccountCard />
              </div>
            ) : null}
            <PublicInviteView
              key={currentView.slug}
              slug={currentView.slug}
              capabilities={capabilities}
              onShowToast={showToast}
              onNavigateHome={() => navigate({ mode: 'home' })}
            />
          </div>
        )}

        {currentView.mode === 'recover' && <OrganizerRecoveryView available={capabilities?.email === true} />}

        {currentView.mode === 'dashboard' && (
          <OrganizerDashboardView
            slug={currentView.slug}
            capabilities={capabilities}
            onNavigateInvite={(slug) => navigate({ mode: 'invite', slug })}
            onNavigateHome={() => navigate({ mode: 'home' })}
            onNavigateRecover={() => navigate({ mode: 'recover' })}
            onShowToast={showToast}
          />
        )}

        {/*
          Cross-front contract: builder B supplies the unified orb. Public home/demo/create/
          recovery get one launcher; invite and dashboard keep their own role-scoped orb.
          Landing and demo keep separate public conversations by context.
        */}
        {(currentView.mode === 'home' ||
          currentView.mode === 'demo' ||
          currentView.mode === 'create' ||
          currentView.mode === 'recover') && (
          <AssistantOrb
            audience="public"
            capabilities={capabilities}
            onShowToast={showToast}
            context={publicContext}
            openSignal={orbOpenSignal}
          />
        )}
      </main>

      {/* Global Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};
