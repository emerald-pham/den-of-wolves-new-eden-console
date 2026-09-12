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
import ShuttleConsole from '@/routes/ShuttleConsole';
import {
  connect,
  logoutGmAccess,
  reconcileGmAuthority,
  refreshPresence,
} from '@/lib/sessionService';
import AppHeader from '@/components/AppHeader';
import ShipPlot from '@/components/ShipPlot';
import ScreenFade from '@/components/ScreenFade';
import CommunicationError from '@/components/CommunicationError';
import PopulationAlert from '@/components/PopulationAlert';
import UnrestAlert from '@/components/UnrestAlert';
import TurnStartAnnouncement from '@/components/TurnStartAnnouncement';
import DebriefMode from '@/components/DebriefMode';
import TurnPhaseCoordinator from '@/components/TurnPhaseCoordinator';
import SessionWaiverGate from '@/components/SessionWaiverGate';
import MotionSafetyGate from '@/components/MotionSafetyGate';
import { GM_ACCESS_TIMEOUT_MS, useSessionStore } from '@/store/useSessionStore';
import { useMotionPreference, useMotionSafetyGatePending } from '@/lib/motionPreference';
import { startVersionUpgradeMonitor } from '@/lib/versionUpgrade';
import { dockingForShuttle } from '@/data/shuttles';
import PrivateLoyaltyPanel from '@/components/PrivateLoyaltyPanel';
import RoleBrief from '@/routes/RoleBrief';
import type { LoyaltyCensus, RoleBrief as RoleBriefProjection } from '@/types/game';

const RECONNECT_INTERVAL_MS = 2_000;
const GM_RECONCILE_INTERVAL_MS = 5_000;
const PRESENCE_HEARTBEAT_INTERVAL_MS = 10_000;
const SESSION_ROUTES = new Set(['/roles', '/gm', '/console', '/press']);
const isSessionRoute = (path: string): boolean =>
  SESSION_ROUTES.has(path) || path.startsWith('/ships/') || path.startsWith('/union/') || path.startsWith('/shuttles/');
const hasConsoleDradis = (path: string): boolean =>
  path === '/press' || path.startsWith('/ships/') || path.startsWith('/union/') || path.startsWith('/shuttles/');

function AppRoutes() {
  const { reducedMotion } = useMotionPreference();
  const location = useLocation();
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const sessionId = session?.id;
  const playerUid = me?.uid;
  const gmAccessAuthenticatedAt = useSessionStore((state) => state.gmAccessAuthenticatedAt);
  const lastRoute = useSessionStore((state) => state.lastRoute);
  const setLastRoute = useSessionStore((state) => state.setLastRoute);
  const shuttleId = location.pathname.startsWith('/shuttles/')
    ? location.pathname.slice('/shuttles/'.length).split('/')[0]
    : undefined;
  const shuttleHost = shuttleId ? dockingForShuttle(session ?? {}, shuttleId)?.shipId : undefined;
  const pressDocking = dockingForShuttle(session ?? {}, 'snn-press-shuttle');
  const shipId = location.pathname.startsWith('/ships/')
    ? location.pathname.slice('/ships/'.length).split('/')[0] ?? 'aegis'
    : location.pathname === '/press'
      ? pressDocking?.shipId ?? 'dione'
      : shuttleHost ?? 'aegis';

  useEffect(() => {
    if (session && isSessionRoute(location.pathname)) {
      setLastRoute(location.pathname);
    }
  }, [location.pathname, session, setLastRoute]);

  useEffect(() => {
    if (!sessionId || !playerUid) return;
    let active = true;
    let pendingRoleBrief: RoleBriefProjection | null = null;
    let unsubscribe: () => void = () => undefined;
    let unsubscribeLoyaltyCensus: () => void = () => undefined;
    let censusSubscribed = false;
    let censusGeneration = 0;
    let playerProjectionFresh = false;
    let subscribeLoyaltyCensusFn: (
      sessionId: string,
      onCensus: (census: LoyaltyCensus | null) => void,
    ) => () => void = () => () => undefined;
    const clearLoyaltyCensus = () => {
      censusGeneration += 1;
      censusSubscribed = false;
      unsubscribeLoyaltyCensus();
      unsubscribeLoyaltyCensus = () => undefined;
      useSessionStore.getState().setGmLoyaltyCensus(null);
    };
    const currentPlayerMayReadCensus = () => {
      const state = useSessionStore.getState();
      return active && playerProjectionFresh && state.session?.id === sessionId &&
        state.me?.uid === playerUid && state.me.role === 'gm';
    };
    const reconcileLoyaltyCensus = () => {
      if (!currentPlayerMayReadCensus()) {
        clearLoyaltyCensus();
        return;
      }
      if (censusSubscribed) return;
      const generation = ++censusGeneration;
      censusSubscribed = true;
      unsubscribeLoyaltyCensus = subscribeLoyaltyCensusFn(sessionId, (next) => {
        if (generation !== censusGeneration || !currentPlayerMayReadCensus()) return;
        useSessionStore.getState().setGmLoyaltyCensus(next);
      });
    };
    void import('@/lib/firestore').then(({
      sessionSnapshotAuthorityFor,
      subscribeSessionState,
      subscribeLoyaltyCensus,
    }) => {
      if (!active) return;
      subscribeLoyaltyCensusFn = subscribeLoyaltyCensus;
      unsubscribe = subscribeSessionState(sessionId, playerUid, {
        sessionSnapshotAuthority: sessionSnapshotAuthorityFor(sessionId, playerUid),
        onSession: (next) => useSessionStore.getState().setSession(next),
        onSessionFreshness: (fresh) => {
          const store = useSessionStore.getState();
          store.setSessionSnapshotFreshness(fresh ? 'server' : 'cache');
          store.setConnection(fresh ? 'live' : 'offline');
        },
        onPlayer: (next) => {
          const store = useSessionStore.getState();
          playerProjectionFresh = false;
          store.setMe(next);
          if (!next.assignedRoleId) {
            pendingRoleBrief = null;
            store.setRoleBrief(null);
          } else {
            const bufferedBrief = pendingRoleBrief;
            pendingRoleBrief = null;
            if (
              bufferedBrief &&
              bufferedBrief.assignmentUid === next.uid &&
              bufferedBrief.roleId === next.assignedRoleId
            ) {
              store.setRoleBrief(bufferedBrief);
            } else {
              const currentBrief = store.roleBrief;
              if (currentBrief && currentBrief.roleId !== next.assignedRoleId) {
                store.setRoleBrief(null);
              }
            }
          }
          if (next.role !== 'gm') {
            clearLoyaltyCensus();
            useSessionStore.getState().setGmSetupReceipt(null);
          }
        },
        onPlayerFreshness: (fresh) => {
          playerProjectionFresh = fresh;
          reconcileLoyaltyCensus();
        },
        onKicked: () => {
          clearLoyaltyCensus();
          useSessionStore.getState().disconnect();
        },
        onSeats: (next) => useSessionStore.getState().setSeats(next),
        onPrivateLoyalty: (next) => useSessionStore.getState().setPrivateLoyalty(next),
        onRoleBrief: (next) => {
          const store = useSessionStore.getState();
          if (!next) {
            pendingRoleBrief = null;
            store.setRoleBrief(null);
            return;
          }
          if (store.me?.uid !== next.assignmentUid) {
            pendingRoleBrief = null;
            store.setRoleBrief(null);
            return;
          }
          if (store.me.assignedRoleId === next.roleId) {
            pendingRoleBrief = null;
            store.setRoleBrief(next);
            return;
          }
          // Firestore can deliver the new private document before the player
          // projection that authorizes it. Hold the own-UID record until the
          // matching assignment arrives, while removing any former brief.
          pendingRoleBrief = next;
          store.setRoleBrief(null);
        },
        onSetupReceipt: (next) => {
          const store = useSessionStore.getState();
          // A denied GM query can report through the still-mounted session
          // listener after demotion. Never retain or rehydrate that private
          // receipt unless the current player projection is still a GM.
          if (store.me?.role !== 'gm') {
            store.setGmSetupReceipt(null);
            return;
          }
          store.setGmSetupReceipt(next);
        },
        onError: () => useSessionStore.getState().setConnection('offline'),
      });
    });
    return () => {
      active = false;
      pendingRoleBrief = null;
      clearLoyaltyCensus();
      unsubscribe();
    };
  }, [playerUid, sessionId]);

  useEffect(() => {
    if (gmAccessAuthenticatedAt === null) return;
    const expire = () => {
      const state = useSessionStore.getState();
      if (state.gmAccessAuthenticatedAt !== gmAccessAuthenticatedAt) return;
      state.clearGmAccess();
      void logoutGmAccess().catch(() => undefined);
    };
    const remaining = gmAccessAuthenticatedAt + GM_ACCESS_TIMEOUT_MS - Date.now();
    if (remaining <= 0) {
      expire();
      return;
    }
    const timeout = window.setTimeout(expire, remaining);
    return () => window.clearTimeout(timeout);
  }, [gmAccessAuthenticatedAt]);

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
        shipJumpTransitions={session?.shipJumpTransitions}
        ambientSession={session ?? undefined}
        turnPhase={session?.turnPhase}
      />
      <AppHeader />
      <CommunicationError />
      <UnrestAlert />
      <PopulationAlert />
      <ScreenFade>
        {(screen) => (
          <>
            <PrivateLoyaltyPanel />
            <Routes location={screen}>
              <Route path="/" element={home} />
              <Route path="/roles" element={<RoleSelect />} />
              <Route path="/brief" element={<RoleBrief />} />
              <Route path="/gm" element={<GmConsole />} />
              <Route path="/console" element={<SessionMode mode="console" />} />
              <Route path="/press" element={<SessionMode mode="press" />} />
              <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
              <Route path="/ships/:shipId/roles" element={<ShipRoleSelect />} />
              <Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} />
              <Route path="/ships/:shipId/observer" element={<ShipConsole observer />} />
              <Route path="/ships/:shipId" element={<ShipConsole />} />
              <Route path="/union/roles/:roleId" element={<JointEngineeringConsole />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </>
        )}
      </ScreenFade>
      <TurnStartAnnouncement />
      <DebriefMode />
      <TurnPhaseCoordinator />
      <SessionWaiverGate />
    </div>
  );
}

/**
 * HashRouter, not BrowserRouter: deep links keep working on any purely static
 * host with no rewrite rules, which is what both Firebase Hosting's default
 * config and GitHub Pages give you.
 */
export default function App() {
  return (
    <MotionSafetyGate>
      <AppRuntime />
    </MotionSafetyGate>
  );
}

function AppRuntime() {
  const motionSafetyPending = useMotionSafetyGatePending();

  // The status light starts red and only goes yellow once this resolves, so a
  // misconfigured or unreachable Firebase shows as red rather than as a page
  // that looks fine and silently does nothing.
  useEffect(() => {
    if (motionSafetyPending) return;
    // Slow mobile connections must not accumulate another request on every tick.
    // Keep independent leases so a slow GM check cannot delay presence renewal.
    const pending = new Set<() => Promise<void>>();
    const run = (check: () => Promise<void>) => {
      if (pending.has(check)) return;
      pending.add(check);
      void check().catch(() => undefined).finally(() => pending.delete(check));
    };
    const renewPresence = () => refreshPresence().catch(() => {
      useSessionStore.getState().setConnection('offline');
    });
    const stopVersionMonitor = startVersionUpgradeMonitor({
      reconnect: () => run(connect),
    });
    run(connect);

    const retry = window.setInterval(() => {
      if (useSessionStore.getState().connection !== 'live') run(connect);
    }, RECONNECT_INTERVAL_MS);
    const reconcileGm = window.setInterval(() => {
      const state = useSessionStore.getState();
      if (state.connection === 'live' && state.gmInstance) {
        run(reconcileGmAuthority);
      }
    }, GM_RECONCILE_INTERVAL_MS);
    const heartbeat = window.setInterval(() => {
      const state = useSessionStore.getState();
      if (state.connection === 'live' && state.session && state.me) {
        run(renewPresence);
      }
    }, PRESENCE_HEARTBEAT_INTERVAL_MS);

    const markOffline = () => {
      useSessionStore.getState().setConnection('offline');
    };
    const reconnectNow = () => {
      run(connect);
    };
    const reconnectWhenVisible = () => {
      if (document.visibilityState === 'visible') run(connect);
    };

    window.addEventListener('offline', markOffline);
    window.addEventListener('online', reconnectNow);
    document.addEventListener('visibilitychange', reconnectWhenVisible);

    return () => {
      window.clearInterval(retry);
      window.clearInterval(reconcileGm);
      window.clearInterval(heartbeat);
      stopVersionMonitor();
      window.removeEventListener('offline', markOffline);
      window.removeEventListener('online', reconnectNow);
      document.removeEventListener('visibilitychange', reconnectWhenVisible);
    };
  }, [motionSafetyPending]);

  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  );
}
