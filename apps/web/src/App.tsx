import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Capabilities, FiestaEvent, ToastMessage } from './types';
import { api, ApiError } from './api/client';
import { adminKeyFor, captureAdminKeyFromLocation, rememberAdminKey } from './api/admin-key';
import { privateDemoEventInput } from './lib/event-presentation';
import { DemoRibbon } from './components/common/DemoRibbon';
import { Header } from './components/common/Header';
import { ToastContainer } from './components/common/Toast';
import { OrganizerHomeView } from './views/OrganizerHomeView';
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
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [events, setEvents] = useState<FiestaEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [isResettingDemo, setIsResettingDemo] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [currentView, setCurrentView] = useState<ViewMode>({ mode: 'home' });
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [demoPaymentSlug, setDemoPaymentSlug] = useState<string | null>(() => readDemoPaymentSlug());
  const demoCreationRef = useRef<Promise<void> | null>(null);
  const paymentDemoRef = useRef<Promise<void> | null>(null);
  const paymentDemoSlugRef = useRef<string | null>(null);
  const paymentCreationUncertainRef = useRef(false);

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
      .catch((err: any) => {
        setSessionError(err.message || 'No se pudo conectar con el servidor backend.');
      });
    const eventsTask = api
      .getOrganizerEvents()
      .then((res) => setEvents(res.events || []))
      .catch((err: any) => {
        // Keep any history already shown. The home view offers a bounded retry.
        setEventsError(err?.message || 'No se pudieron cargar tus invitaciones.');
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

  /**
   * Fresh private demo. This intentionally calls createEvent with new future dates instead
   * of resetDemo/startDemo, so a historical demo without a stored key is never reused.
   * The server mints the key; the browser stores it and only then opens the owner panel.
   */
  const handleCreateDemo = useCallback((): Promise<void> => {
    if (demoCreationRef.current) return demoCreationRef.current;

    const creation = (async () => {
      try {
        const res = await api.createEvent(privateDemoEventInput());
        setEvents((prev) => [res.event, ...prev.filter((event) => event.id !== res.event.id)]);
        if (!res.adminKey) {
          showToast(
            'error',
            'La demo se creó, pero el servidor no devolvió la clave de organizador. No se abrirá el panel como administrador.',
            'Demo sin clave',
          );
          return;
        }
        rememberAdminKey(res.event.slug, res.adminKey);
        showToast('success', `Demo privada "${res.event.title}" creada. Ya puedes probar PayPal Sandbox.`, 'Demo privada lista');
        navigate({ mode: 'dashboard', slug: res.event.slug });
      } catch (err: any) {
        showToast(
          'error',
          err?.message || 'No se pudo crear la demo privada. Revisa tu conexión e inténtalo de nuevo.',
          'Error al crear demo privada',
        );
      } finally {
        demoCreationRef.current = null;
      }
    })();

    demoCreationRef.current = creation;
    return creation;
  }, [navigate, showToast]);

  /**
   * Explicit payment demo. It creates exactly one future, isolated owned Comida, saves its
   * organizer key and slug before any guest work, joins "Invitado Demo", prepares an RSVP for
   * two people, and opens the ordinary invitation. It never opens PayPal, an order, or a quote.
   */
  const handleStartPaymentDemo = useCallback((): Promise<void> => {
    if (paymentDemoRef.current) return paymentDemoRef.current;

    const start = (async () => {
      let slug = paymentDemoSlugRef.current;
      try {
        if (!slug) {
          if (paymentCreationUncertainRef.current) {
            showToast(
              'warning',
              'No sabemos si la demo de pago llegó a crearse. Revisa "Mis invitaciones" antes de volver a intentarlo. No abriremos otra automáticamente.',
              'Creación sin confirmar',
            );
            return;
          }

          let created: Awaited<ReturnType<typeof api.createEvent>>;
          try {
            created = await api.createEvent(privateDemoEventInput());
          } catch (err: any) {
            if (err instanceof ApiError && err.status === 408) {
              paymentCreationUncertainRef.current = true;
              showToast(
                'warning',
                'No sabemos si la demo de pago llegó a crearse. Revisa "Mis invitaciones" antes de volver a intentarlo; no se abrirá otra automáticamente.',
                'Creación sin confirmar',
              );
            } else {
              showToast(
                'error',
                err?.message || 'No se pudo crear la demo de pago. Revisa tu conexión e inténtalo de nuevo.',
                'Error al preparar el pago',
              );
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

        const joined = await api.joinEvent(slug, 'Invitado Demo');
        // A completed paid session keeps its existing RSVP. Reloading this screen never starts
        // this flow; this guard only protects an explicit retry after a completed payment.
        if (!(joined.guest.paidCents > 0)) {
          await api.rsvp(slug, 'yes', 1);
        }
        showToast(
          'success',
          'Demo de pago lista: Invitado Demo asistirá con un acompañante. Revisa la cotización y confirma el pago manualmente en PayPal Sandbox.',
          'Pago de prueba preparado',
        );
        navigate({ mode: 'invite', slug });
      } catch {
        const where = slug
          ? `La demo "${slug}" ya está creada y tu enlace de organizador quedó guardado. No se pudo preparar el ingreso/RSVP; vuelve a intentarlo sin crear otra demo.`
          : 'No se pudo preparar la demo de pago. No se creó ninguna invitación nueva.';
        showToast('error', where, 'Demo de pago incompleta');
      } finally {
        paymentDemoRef.current = null;
      }
    })();

    paymentDemoRef.current = start;
    return start;
  }, [navigate, showToast]);

  // Handle Reset Demo
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
      showToast('info', 'Demostración reiniciada. Las invitaciones reales siguen activas.', 'Reinicio completado');
      navigate({ mode: 'home' });
    } catch (err: any) {
      showToast('error', err.message || 'Error al reiniciar la demostración', 'Error');
    } finally {
      setIsResettingDemo(false);
    }
  };

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
        onNavigateHome={() => navigate({ mode: 'home' })}
        onNavigateCreate={() => navigate({ mode: 'create' })}
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
            Reintentar Conexión
          </button>
        </div>
      )}

      {/* Main Body View */}
      <main className="app-container" style={{ marginTop: '1.5rem', flex: 1 }}>
        {currentView.mode === 'home' && (
          <OrganizerHomeView
            events={events}
            isLoading={isLoadingEvents}
            eventsError={eventsError}
            onRetryEvents={initApp}
            onNavigateCreate={() => navigate({ mode: 'create' })}
            onNavigateInvite={(slug) => navigate({ mode: 'invite', slug })}
            onNavigateDashboard={(slug) => navigate({ mode: 'dashboard', slug })}
            onCreateDemo={handleCreateDemo}
            onStartPaymentDemo={handleStartPaymentDemo}
            onResetDemo={handleResetDemo}
            isResetting={isResettingDemo}
            onNavigatePreview={() => navigate({ mode: 'demo' })}
            onNavigateRecover={() => navigate({ mode: 'recover' })}
          />
        )}

        {currentView.mode === 'demo' && (
          <JudgePreviewView
            onCreateDemo={handleCreateDemo}
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
        */}
        {(currentView.mode === 'home' ||
          currentView.mode === 'demo' ||
          currentView.mode === 'create' ||
          currentView.mode === 'recover') && (
          <AssistantOrb
            audience="public"
            capabilities={capabilities}
            onShowToast={showToast}
          />
        )}
      </main>

      {/* Global Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};
