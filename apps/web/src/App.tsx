import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Capabilities, FiestaEvent, ToastMessage } from './types';
import { api } from './api/client';
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
import { PublicChatAssistant } from './components/chat/PublicChatAssistant';
import { VoiceInvitationAgent } from './components/voice/VoiceInvitationAgent';

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
  const demoCreationRef = useRef<Promise<void> | null>(null);

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
          <PublicInviteView
            key={currentView.slug}
            slug={currentView.slug}
            capabilities={capabilities}
            onShowToast={showToast}
            onNavigateHome={() => navigate({ mode: 'home' })}
          />
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

        {/* Cross-front contract: builderB supplies this component. Home gets capabilities only. */}
        {currentView.mode === 'home' && <PublicChatAssistant capabilities={capabilities} />}
      </main>

      {/* Global Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/*
        Public informational voice. Available as soon as home/create/recover is open,
        without creating or joining an event. The invite route keeps its own event-scoped
        launcher, so this one is rendered only on these three routes and never duplicates it.
      */}
      {(currentView.mode === 'home' || currentView.mode === 'create' || currentView.mode === 'recover') && (
        <VoiceInvitationAgent
          audience="public"
          capabilities={capabilities}
          onShowToast={showToast}
        />
      )}
    </div>
  );
};
