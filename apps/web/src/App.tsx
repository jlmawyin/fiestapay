import React, { useEffect, useState, useCallback } from 'react';
import type { Capabilities, FiestaEvent, ToastMessage } from './types';
import { api } from './api/client';
import { DemoRibbon } from './components/common/DemoRibbon';
import { Header } from './components/common/Header';
import { ToastContainer } from './components/common/Toast';
import { OrganizerHomeView } from './views/OrganizerHomeView';
import { CreateEventView } from './views/CreateEventView';
import { PublicInviteView } from './views/PublicInviteView';
import { OrganizerDashboardView } from './views/OrganizerDashboardView';

type ViewMode =
  | { mode: 'home' }
  | { mode: 'create' }
  | { mode: 'invite'; slug: string }
  | { mode: 'dashboard'; slug: string };

export const App: React.FC = () => {
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [events, setEvents] = useState<FiestaEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [isResettingDemo, setIsResettingDemo] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [currentView, setCurrentView] = useState<ViewMode>({ mode: 'home' });
  const [sessionError, setSessionError] = useState<string | null>(null);

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
    else if (view.mode === 'invite') path = `/e/${view.slug}`;
    else if (view.mode === 'dashboard') path = `/e/${view.slug}/dashboard`;

    if (push && window.location.pathname !== path) {
      window.history.pushState(view, '', path);
    }
  }, []);

  // Parse path on initial load & popstate
  const handleLocationChange = useCallback(() => {
    const path = window.location.pathname;
    const dashboardMatch = path.match(/^\/e\/([^/]+)\/dashboard\/?$/);
    if (dashboardMatch) {
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

  // Initialize capabilities and restore organizer session
  const initApp = useCallback(async () => {
    setSessionError(null);
    try {
      const caps = await api.getCapabilities();
      setCapabilities(caps);
    } catch (err: any) {
      setSessionError(err.message || 'No se pudo conectar con el servidor backend.');
    }

    setIsLoadingEvents(true);
    try {
      const res = await api.getOrganizerEvents();
      setEvents(res.events || []);
    } catch {
      // It's normal if cookie has no events yet
    } finally {
      setIsLoadingEvents(false);
    }
  }, []);

  useEffect(() => {
    handleLocationChange();
    initApp();

    const onPopState = () => handleLocationChange();
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [handleLocationChange, initApp]);

  // Handle Demo Seed Event
  const handleCreateDemo = async () => {
    try {
      const res = await api.createDemoEvent();
      setEvents((prev) => [res.event, ...prev.filter((e) => e.id !== res.event.id)]);
      showToast('success', `Fiesta "${res.event.title}" creada con éxito (Cuota $25 USD).`, 'Demo Listo');
      navigate({ mode: 'invite', slug: res.event.slug });
    } catch (err: any) {
      showToast('error', err.message || 'Error al generar fiesta de demostración', 'Error');
    }
  };

  // Handle Reset Demo
  const handleResetDemo = async () => {
    setIsResettingDemo(true);
    try {
      const res = await api.resetDemo();
      setEvents([res.event]);
      showToast('info', 'Demostración reiniciada. Se ha creado una nueva generación.', 'Reinicio completado');
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
      <DemoRibbon capabilities={capabilities} />

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
            onNavigateCreate={() => navigate({ mode: 'create' })}
            onNavigateInvite={(slug) => navigate({ mode: 'invite', slug })}
            onNavigateDashboard={(slug) => navigate({ mode: 'dashboard', slug })}
            onCreateDemo={handleCreateDemo}
            onResetDemo={handleResetDemo}
            isResetting={isResettingDemo}
          />
        )}

        {currentView.mode === 'create' && (
          <CreateEventView
            onEventCreated={(slug) => {
              initApp();
              navigate({ mode: 'invite', slug });
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

        {currentView.mode === 'dashboard' && (
          <OrganizerDashboardView
            slug={currentView.slug}
            capabilities={capabilities}
            onNavigateInvite={(slug) => navigate({ mode: 'invite', slug })}
            onNavigateHome={() => navigate({ mode: 'home' })}
            onShowToast={showToast}
          />
        )}
      </main>

      {/* Global Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};
