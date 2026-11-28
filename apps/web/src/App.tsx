import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { DEMO_GUEST_NAME, type HostInfo, type UiPage } from '@fiestapay/shared';
// NAP-U2: tokens día/noche para todo el sitio (el atributo data-tema los elige).
import '../../../estilos/tokens.css';
import { GuideOverlay } from './guide/GuideOverlay';
import { registerGuideNavigator } from './guide/showOnScreen';
import type { Capabilities, FiestaEvent, ToastMessage } from './types';
import { api, ApiError } from './api/client';
import { fetchHostInfo, shouldReadHostInfo } from './api/host-info';
import { adminKeyFor, captureAdminKeyFromLocation, rememberAdminKey } from './api/admin-key';
import { useI18n, useMessages } from './i18n/I18nContext';
import { appCatalog } from './i18n/catalogs/app';
import { DemoRibbon } from './components/common/DemoRibbon';
import { Header } from './components/common/Header';
import { ToastContainer } from './components/common/Toast';
import { LandingView } from './views/LandingView';
import { PortalLandingView } from './views/PortalLandingView';
import { CreateEventView } from './views/CreateEventView';
import { PublicInviteView } from './views/PublicInviteView';
import { FreeAddressView } from './views/FreeAddressView';
import { OrganizerDashboardView } from './views/OrganizerDashboardView';
import { OrganizerRecoveryView } from './views/OrganizerRecoveryView';
import { JudgePreviewView } from './views/JudgePreviewView';
import { TutorialView } from './views/TutorialView';
import { AccountRegisterView } from './views/AccountRegisterView';
import { AccountLoginView } from './views/AccountLoginView';
import { AccountVerifyView } from './views/AccountVerifyView';
import { SiteHomeView } from './views/SiteHomeView';
import { SiteSettingsView } from './views/SiteSettingsView';
import sitioTextos from '../../../contenido/sitio.json';
import { readAppHostContext } from './lib/app-host';
import { siteThemeStyle } from './lib/site-theme';
import type { TenantSiteSettings } from './lib/site-types';
import { DemoBuyerAccountCard } from './components/demo/DemoBuyerAccountCard';
import { NotFoundView } from './components/notfound/NotFoundView';
import { openAvatar } from './components/avatar/avatar-open';
// NAP-F5b: lib/create-interview eliminado con los caminos de IA.

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
  | { mode: 'demo'; quick?: boolean }
  | { mode: 'create' }
  | { mode: 'invite'; slug: string }
  | { mode: 'free'; label: string }
  | { mode: 'dashboard'; slug: string }
  | { mode: 'recover' }
  | { mode: 'tutorial' }
  | { mode: 'register' }
  | { mode: 'login' }
  | { mode: 'verify' }
  | { mode: 'site-home' }
  | { mode: 'site-settings' }
  | { mode: 'not-found' };

/** Guide pages are the public routes; invite/dashboard are not guide pages. */
function viewToGuidePage(view: ViewMode): UiPage | null {
  if (view.mode === 'home') return 'landing';
  if (view.mode === 'demo') return 'demo';
  if (view.mode === 'create') return 'create';
  if (view.mode === 'recover') return 'recover';
  if (view.mode === 'tutorial') return 'tutorial';
  if (view.mode === 'register') return 'landing';
  if (view.mode === 'login') return 'landing';
  if (view.mode === 'verify') return 'landing';
  return null;
}

function guidePageToView(page: UiPage): ViewMode {
  if (page === 'demo') return { mode: 'demo' };
  if (page === 'create') return { mode: 'create' };
  if (page === 'recover') return { mode: 'recover' };
  if (page === 'tutorial') return { mode: 'tutorial' };
  return { mode: 'home' };
}

const APP_HOST = readAppHostContext();
const IS_SOMOSPANAS_ROOT = APP_HOST.kind === 'somospanas-root';
const IS_LEGACY_HOST = APP_HOST.kind === 'legacy';

export const App: React.FC = () => {
  captureAdminKeyFromLocation();
  const { locale } = useI18n();
  const m = useMessages(appCatalog);
  const [siteProfile, setSiteProfile] = useState<TenantSiteSettings | null>(null);
  const [siteProfileError, setSiteProfileError] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [events, setEvents] = useState<FiestaEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [isResettingDemo, setIsResettingDemo] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [currentView, setCurrentView] = useState<ViewMode>({ mode: 'home' });
  // NAP-U4: host-info decide reunión/dirección libre/reservada sin cambiar el enrutado previo.
  const [hostInfo, setHostInfo] = useState<HostInfo | null>(null);
  const needsHostInfo = shouldReadHostInfo();
  const [hostInfoResolved, setHostInfoResolved] = useState(!needsHostInfo);
  // NAP-F5b: el paso IA de la demo y el orbe se retiraron con la IA propia.
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [demoPaymentSlug, setDemoPaymentSlug] = useState<string | null>(() => readDemoPaymentSlug());
  const currentViewRef = useRef<ViewMode>(currentView);
  currentViewRef.current = currentView;
  // NAP-U4: host-info decide reunión/dirección libre/reservada sin cambiar el enrutado previo.
  const hostInfoRef = useRef<HostInfo | null>(null);
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

  // URL Routing helper. Keep unrelated query parameters so deep links survive
  // locale changes. NAP-F5b: /create?path=… murió con los caminos de IA.
  const navigate = useCallback((view: ViewMode, push = true) => {
    setCurrentView(view);
    let path = '/';
    if (view.mode === 'create') path = '/create';
    else if (view.mode === 'demo') path = '/demo';
    else if (view.mode === 'recover') path = '/recover';
    else if (view.mode === 'tutorial') path = '/tutorial';
    else if (view.mode === 'register') path = '/register';
    else if (view.mode === 'login') path = '/login';
    else if (view.mode === 'verify') path = '/verify';
    else if (view.mode === 'site-settings') path = '/settings';
    else if (view.mode === 'invite') path = `/e/${view.slug}`;
    else if (view.mode === 'dashboard') path = `/e/${view.slug}/admin`;
    else if (view.mode === 'not-found') path = window.location.pathname;

    const params = new URLSearchParams(window.location.search);
    params.delete('path');
    params.delete('quick');
    if (view.mode === 'demo' && view.quick) params.set('quick', '1');
    const query = params.toString();
    const url = query ? `${path}?${query}` : path;

    if (push && `${window.location.pathname}${window.location.search}` !== url) {
      window.history.pushState(view, '', url);
    }
  }, []);

  // NAP-U2: el botón dorado de la raíz pide crear con la avatar arrancada.
  const pendingAvatarStartRef = useRef(false);
  const goToCreateWithAvatar = useCallback(() => {
    pendingAvatarStartRef.current = true;
    navigate({ mode: 'create' });
  }, [navigate]);

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
    const hostInfo = hostInfoRef.current;
    if (path === '/' || path === '') {
      // NAP-U4: el mismo «/» es la invitación en el host de una reunión y la vista libre si no existe.
      if (hostInfo?.kind === 'event') {
        setCurrentView({ mode: 'invite', slug: hostInfo.slug });
        return;
      }
      if (hostInfo?.kind === 'free') {
        setCurrentView({ mode: 'free', label: hostInfo.label });
        return;
      }
      if (hostInfo?.kind === 'reserved') {
        setCurrentView({ mode: 'not-found' });
        return;
      }
    }
    if (IS_SOMOSPANAS_ROOT && (path === '/demo' || path === '/demo/' || path === '/tutorial' || path === '/tutorial/')) {
      setCurrentView({ mode: 'home' });
      return;
    }
    if (path === '/demo' || path === '/demo/') {
      setCurrentView({ mode: 'demo', quick: new URLSearchParams(window.location.search).get('quick') === '1' });
      return;
    }
    if (path === '/recover' || path === '/recover/') {
      setCurrentView({ mode: 'recover' });
      return;
    }
    if (path === '/tutorial' || path === '/tutorial/') {
      setCurrentView({ mode: 'tutorial' });
      return;
    }
    if (path === '/register' || path === '/register/') {
      setCurrentView({ mode: 'register' });
      return;
    }
    if (path === '/login' || path === '/login/') {
      setCurrentView({ mode: 'login' });
      return;
    }
    if (path === '/verify' || path === '/verify/') {
      setCurrentView({ mode: 'verify' });
      return;
    }
    if (APP_HOST.isSiteHost && (path === '/settings' || path === '/settings/')) {
      setCurrentView({ mode: 'site-settings' });
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
    if (path === '/' || path === '') {
      setCurrentView(APP_HOST.isSiteHost ? { mode: 'site-home' } : { mode: 'home' });
      return;
    }
    // NAP-U2: las rutas desconocidas muestran la página de no encontrado.
    setCurrentView({ mode: 'not-found' });
  }, []);

  /** Carga la marca del subdominio (SP-5); no llama rutas del legado. */
  const initSiteProfile = useCallback(async () => {
    setSiteProfileError(null);
    try {
      const res = await fetch('/api/site/profile', { credentials: 'include' });
      const data = (await res.json()) as { settings?: TenantSiteSettings; error?: string };
      const fallo =
        localeRef.current === 'en'
          ? sitioTextos.errores.cargarSitio.en
          : sitioTextos.errores.cargarSitio.es;
      if (!res.ok || !data.settings) {
        setSiteProfileError(data.error ?? fallo);
        return;
      }
      setSiteProfile(data.settings);
    } catch {
      setSiteProfileError(
        localeRef.current === 'en' ? sitioTextos.errores.cargarSitio.en : sitioTextos.errores.cargarSitio.es,
      );
    }
  }, []);

  // Initialize capabilities and restore organizer session. Both reads are bounded by the
  // API client timeout, so the home loader cannot stay pending forever.
  const initApp = useCallback(async () => {
    if (APP_HOST.isSiteHost) {
      await initSiteProfile();
      return;
    }
    if (IS_SOMOSPANAS_ROOT) {
      return;
    }
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
  }, [initSiteProfile]);

  useEffect(() => {
    const waitingForHost = shouldReadHostInfo();
    if (!waitingForHost) handleLocationChange();
    initApp();

    // NAP-U4: en subdominios de Somos Panas se pregunta al servidor qué es este host.
    let active = true;
    if (waitingForHost) {
      void fetchHostInfo()
        .then((info) => {
          if (!active) return;
          if (info) {
            hostInfoRef.current = info;
            setHostInfo(info);
            if (info.kind === 'event') {
              // NAP-U4: el host de evento sí expone capabilities; el perfil de sitio no aplica.
              setCurrentView({ mode: 'invite', slug: info.slug });
              void api.getCapabilities().then((caps) => active && setCapabilities(caps)).catch(() => undefined);
            }
          }
          setHostInfoResolved(true);
          // Si host-info falla, el enrutado anterior decide como hoy.
          handleLocationChange();
        })
        .catch(() => {
          if (!active) return;
          setHostInfoResolved(true);
          handleLocationChange();
        });
    }

    const onPopState = () => handleLocationChange();
    window.addEventListener('popstate', onPopState);
    return () => {
      active = false;
      window.removeEventListener('popstate', onPopState);
    };
  }, [handleLocationChange, initApp]);

  useEffect(() => {
    document.title = m.docTitle;
  }, [m]);

  // NAP-U2: al llegar a /create desde el botón dorado se arranca la avatar con
  // el mismo clic (el gesto sigue vigente para el audio). Los efectos de la
  // vista hija corren antes, así que la tarjeta ya escucha el aviso.
  useEffect(() => {
    if (currentView.mode === 'create' && pendingAvatarStartRef.current) {
      pendingAvatarStartRef.current = false;
      openAvatar();
    }
  }, [currentView]);

  // FP-GUIDE-1: the guide service navigates through the app router (no reload).
  useEffect(() => {
    registerGuideNavigator({
      navigate: (page) => navigate(guidePageToView(page)),
      // Read through a ref so a late guide/voice response sees the route that
      // is actually rendered now, before the next effect flush.
      getCurrentPage: () => viewToGuidePage(currentViewRef.current),
      getCurrentInviteSlug: () =>
        currentViewRef.current.mode === 'invite' ? currentViewRef.current.slug : null,
    });
    return () => registerGuideNavigator(null);
  }, [navigate]);

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

  const siteTheme = siteProfile ? siteThemeStyle(siteProfile) : undefined;
  // NAP-U4: no decidir la vista antes de saber si el host es reunion/libre/reservado.
  if (!hostInfoResolved) {
    return <main className="app-container" aria-busy="true" data-host-pending="true" />;
  }
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', ...siteTheme }}>
      {/* Sandbox Demo Ribbon */}
      {IS_LEGACY_HOST ? <DemoRibbon
        capabilities={capabilities}
        status={capabilities ? 'ready' : sessionError ? 'unavailable' : 'loading'}
        onRetry={capabilities || !sessionError ? undefined : initApp}
      /> : null}

      {/* Global Navigation Header */}
      {IS_LEGACY_HOST ? <Header
        onNavigateHome={goToOwnInvitations}
        onNavigateCreate={() => navigate({ mode: 'create' })}
        onNavigateDemo={() => navigate({ mode: 'demo' })}
        onNavigateTutorial={() => navigate({ mode: 'tutorial' })}
        hasActiveEvent={events.length > 0}
      /> : null}

      {/* Expired Session / Connection Recovery Banner */}
      {IS_LEGACY_HOST && sessionError && (
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
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <TriangleAlert size={16} aria-hidden="true" />
            <span>{sessionError}</span>
          </span>
          <button onClick={initApp} className="btn btn-secondary" style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}>
            {m.retryConnection}
          </button>
        </div>
      )}

      {/* Main Body View */}
      <main className="app-container" style={{ marginTop: '1.5rem', flex: 1 }}>
        {APP_HOST.isSiteHost && hostInfo?.kind === 'site' && siteProfileError && (
          <p role="alert">{siteProfileError}</p>
        )}
        {currentView.mode === 'site-home' && siteProfile && (
          <SiteHomeView
            settings={siteProfile}
            onNavigateSettings={() => navigate({ mode: 'site-settings' })}
          />
        )}
        {currentView.mode === 'site-settings' && siteProfile && (
          <SiteSettingsView
            initial={siteProfile}
            onSaved={(settings) => {
              setSiteProfile(settings);
              navigate({ mode: 'site-home' });
            }}
            onBack={() => navigate({ mode: 'site-home' })}
          />
        )}

        {currentView.mode === 'home' && IS_SOMOSPANAS_ROOT ? (
          <PortalLandingView
            onNavigateRegister={() => navigate({ mode: 'register' })}
            onNavigateLogin={() => navigate({ mode: 'login' })}
            onNavigateCreate={goToCreateWithAvatar}
          />
        ) : null}

        {currentView.mode === 'home' && IS_LEGACY_HOST ? (
          <LandingView
            events={events}
            isLoading={isLoadingEvents}
            capabilities={capabilities}
            eventsError={eventsError}
            onRetryEvents={initApp}
            onNavigateCreate={() => navigate({ mode: 'create' })}
            onNavigateInvite={(slug) => navigate({ mode: 'invite', slug })}
            onNavigateDashboard={(slug) => navigate({ mode: 'dashboard', slug })}
            onNavigateDemo={(quick) => navigate({ mode: 'demo', quick })}
            onNavigateRecover={() => navigate({ mode: 'recover' })}
          />
        ) : null}

        {currentView.mode === 'demo' && IS_LEGACY_HOST && (
          <JudgePreviewView
            events={events}
            isLoading={isLoadingEvents}
            capabilities={capabilities}
            eventsError={eventsError}
            onRetryEvents={initApp}
            onCreateDemo={handleCreateDemo}
            quickPath={currentView.quick}
            onNavigateCreate={() => navigate({ mode: 'create' })}
            onStartPaymentDemo={handleStartPaymentDemo}
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

        {currentView.mode === 'free' && <FreeAddressView label={currentView.label} />}

        {currentView.mode === 'recover' && <OrganizerRecoveryView available={capabilities?.email === true} />}

        {currentView.mode === 'tutorial' && IS_LEGACY_HOST && (
          <TutorialView
            capabilities={capabilities}
            onNavigateDemo={() => navigate({ mode: 'demo' })}
            onNavigateCreate={() => navigate({ mode: 'create' })}
            onNavigateInvitations={goToOwnInvitations}
            onNavigateRecover={() => navigate({ mode: 'recover' })}
          />
        )}

        {currentView.mode === 'register' && (
          <AccountRegisterView
            onNavigateLogin={() => navigate({ mode: 'login' })}
            onRegistered={() => navigate({ mode: 'login' })}
          />
        )}

        {currentView.mode === 'login' && (
          <AccountLoginView
            onNavigateRegister={() => navigate({ mode: 'register' })}
            onLoggedIn={() => navigate({ mode: 'home' })}
          />
        )}

        {currentView.mode === 'verify' && (
          <AccountVerifyView onVerified={() => navigate({ mode: 'login' })} />
        )}

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

        {currentView.mode === 'not-found' && (
          <NotFoundView
            onNavigateHome={() => navigate(APP_HOST.isSiteHost ? { mode: 'site-home' } : { mode: 'home' })}
          />
        )}

        {/* NAP-F5b: el orbe se retiró; la avatar Napster vive en cada vista. */}
      </main>

      {/* Global Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* FP-GUIDE-1 tutorial highlight + guided tour */}
      <GuideOverlay />
    </div>
  );
};
