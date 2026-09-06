import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Landing from '@/routes/Landing';
import RoleSelect from '@/routes/RoleSelect';
import NotFound from '@/routes/NotFound';
import SessionMode from '@/routes/SessionMode';
import ShipConsole from '@/routes/ShipConsole';
import GmConsole from '@/routes/GmConsole';
import ShipRoleSelect from '@/routes/ShipRoleSelect';
import JointEngineeringConsole from '@/routes/JointEngineeringConsole';
import { connect, reconcileGmAuthority, refreshPresence } from '@/lib/sessionService';
import AppHeader from '@/components/AppHeader';
import ShipPlot from '@/components/ShipPlot';
import ScreenFade from '@/components/ScreenFade';
import CommunicationError from '@/components/CommunicationError';
import PopulationAlert from '@/components/PopulationAlert';
import UnrestAlert from '@/components/UnrestAlert';
import { useSessionStore } from '@/store/useSessionStore';
import { useMotionPreference } from '@/lib/motionPreference';

const RECONNECT_INTERVAL_MS = 2_000;
const GM_RECONCILE_INTERVAL_MS = 5_000;
const PRESENCE_HEARTBEAT_INTERVAL_MS = 10_000;
const SESSION_ROUTES = new Set(['/roles', '/gm', '/console', '/press']);
const isSessionRoute = (path: string): boolean =>
  SESSION_ROUTES.has(path) || path.startsWith('/ships/') || path.startsWith('/union/');
const hasConsoleDradis = (path: string): boolean =>
  path === '/press' || path.startsWith('/ships/') || path.startsWith('/union/');

function AppRoutes() {
  const { reducedMotion } = useMotionPreference();
  const location = useLocation();
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const sessionId = session?.id;
  const playerUid = me?.uid;
  const lastRoute = useSessionStore((state) => state.lastRoute);
  const setLastRoute = useSessionStore((state) => state.setLastRoute);
  const shipId = location.pathname.startsWith('/ships/')
    ? location.pathname.slice('/ships/'.length).split('/')[0] ?? 'aegis'
    : location.pathname === '/press'
      ? session?.shuttleDockings?.find((docking) => docking.shuttleId === 'snn-press-shuttle')
        ?.shipId ?? 'aegis'
      : 'aegis';

  useEffect(() => {
    if (session && isSessionRoute(location.pathname)) {
      setLastRoute(location.pathname);
    }
  }, [location.pathname, session, setLastRoute]);

  useEffect(() => {
    if (!sessionId || !playerUid) return;
    let active = true;
    let unsubscribe: () => void = () => undefined;
    void import('@/lib/firestore').then(({ subscribeSessionState }) => {
      if (!active) return;
      unsubscribe = subscribeSessionState(sessionId, playerUid, {
        onSession: (next) => useSessionStore.getState().setSession(next),
        onPlayer: (next) => useSessionStore.getState().setMe(next),
        onSeats: (next) => useSessionStore.getState().setSeats(next),
        onError: () => useSessionStore.getState().setConnection('offline'),
      });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [playerUid, sessionId]);

  const restoreRoute =
    lastRoute && isSessionRoute(lastRoute) ? lastRoute : '/roles';
  const home =
    session && me ? (
      <Navigate to={restoreRoute} replace />
    ) : (
      <Landing />
    );

  return (
    <div data-motion={reducedMotion ? 'reduce' : 'full'}>
      <ShipPlot
        hostile={false}
        aboard={hasConsoleDradis(location.pathname)}
        viewerId={shipId}
        capybaraEnabled={session?.capybaraEnabled !== false}
        dioneEnabled={session?.dioneEnabled !== false}
        shipGalacticCoordinates={session?.shipGalacticCoordinates}
      />
      <AppHeader />
      <CommunicationError />
      <UnrestAlert />
      <PopulationAlert />
      <ScreenFade>
        {(screen) => (
          <Routes location={screen}>
            <Route path="/" element={home} />
            <Route path="/roles" element={<RoleSelect />} />
            <Route path="/gm" element={<GmConsole />} />
            <Route path="/console" element={<SessionMode mode="console" />} />
            <Route path="/press" element={<SessionMode mode="press" />} />
            <Route path="/ships/:shipId/roles" element={<ShipRoleSelect />} />
            <Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} />
            <Route path="/ships/:shipId/observer" element={<ShipConsole observer />} />
            <Route path="/ships/:shipId" element={<ShipConsole />} />
            <Route path="/union/roles/:roleId" element={<JointEngineeringConsole />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        )}
      </ScreenFade>
    </div>
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
    const heartbeat = window.setInterval(() => {
      const state = useSessionStore.getState();
      if (state.connection === 'live' && state.session && state.me) {
        void refreshPresence().catch(() => state.setConnection('offline'));
      }
    }, PRESENCE_HEARTBEAT_INTERVAL_MS);

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
      window.clearInterval(heartbeat);
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
