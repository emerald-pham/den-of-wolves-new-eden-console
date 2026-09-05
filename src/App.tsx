import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Landing from '@/routes/Landing';
import RoleSelect from '@/routes/RoleSelect';
import NotFound from '@/routes/NotFound';
import SessionMode from '@/routes/SessionMode';
import GmConsole from '@/routes/GmConsole';
import { connect, reconcileGmAuthority } from '@/lib/sessionService';
import AppHeader from '@/components/AppHeader';
import ContactPlot from '@/components/ContactPlot';
import ScreenFade from '@/components/ScreenFade';
import CommunicationError from '@/components/CommunicationError';
import { useSessionStore } from '@/store/useSessionStore';

const RECONNECT_INTERVAL_MS = 2_000;
const GM_RECONCILE_INTERVAL_MS = 5_000;
const SESSION_ROUTES = new Set(['/roles', '/gm', '/setup', '/console']);

function AppRoutes() {
  const location = useLocation();
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const lastRoute = useSessionStore((state) => state.lastRoute);
  const setLastRoute = useSessionStore((state) => state.setLastRoute);
  // The threat board lives above the router so it survives every navigation:
  // one continuous scan from the launcher through to a connected console,
  // rather than a fresh one that restarts its sweep on each route.
  const [intrusion, setIntrusion] = useState(false);

  useEffect(() => {
    if (session && SESSION_ROUTES.has(location.pathname)) {
      setLastRoute(location.pathname);
    }
  }, [location.pathname, session, setLastRoute]);

  const restoreRoute =
    lastRoute && SESSION_ROUTES.has(lastRoute) ? lastRoute : '/roles';
  const home =
    session && me ? (
      <Navigate to={restoreRoute} replace />
    ) : (
      <Landing onTransmission={setIntrusion} />
    );

  return (
    <>
      <ContactPlot hostile={intrusion} />
      <AppHeader />
      <CommunicationError />
      <ScreenFade>
        {(screen) => (
          <Routes location={screen}>
            <Route path="/" element={home} />
            <Route path="/roles" element={<RoleSelect />} />
            <Route path="/gm" element={<GmConsole />} />
            <Route path="/setup" element={<SessionMode mode="setup" />} />
            <Route path="/console" element={<SessionMode mode="console" />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        )}
      </ScreenFade>
    </>
  );
}

/**
 * HashRouter, not BrowserRouter: deep links keep working on any purely static
 * host with no rewrite rules, which is what both Firebase Hosting's default
 * config and GitHub Pages give you.
 */
export default function App() {
  // The status light starts red and only goes yellow once this resolves, so a
  // misconfigured or unreachable Firebase shows as red rather than as a page
  // that looks fine and silently does nothing.
  useEffect(() => {
    void connect();

    const retry = window.setInterval(() => {
      if (useSessionStore.getState().connection !== 'live') void connect();
    }, RECONNECT_INTERVAL_MS);
    const reconcileGm = window.setInterval(() => {
      const state = useSessionStore.getState();
      if (state.connection === 'live' && state.gmInstance) {
        void reconcileGmAuthority().catch(() => undefined);
      }
    }, GM_RECONCILE_INTERVAL_MS);

    const markOffline = () => {
      useSessionStore.getState().setConnection('offline');
    };
    const reconnectNow = () => {
      void connect();
    };

    window.addEventListener('offline', markOffline);
    window.addEventListener('online', reconnectNow);

    return () => {
      window.clearInterval(retry);
      window.clearInterval(reconcileGm);
      window.removeEventListener('offline', markOffline);
      window.removeEventListener('online', reconnectNow);
    };
  }, []);

  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  );
}
