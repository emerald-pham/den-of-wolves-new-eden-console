import { commissarPurgeAuthorityIsCurrent } from '@/lib/commissarPurgeAuthority';
import { lazy, Suspense, useEffect, useRef } from 'react';
import { HashRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import Landing from '@/routes/Landing';
import RoleSelect from '@/routes/RoleSelect';
import NotFound from '@/routes/NotFound';
import ShipConsole from '@/routes/ShipConsole';
import GmConsole from '@/routes/GmConsole';
import ShipRoleSelect from '@/routes/ShipRoleSelect';
import JointEngineeringConsole from '@/routes/JointEngineeringConsole';
import {
  CONNECT_RETRY_INTERVAL_MS,
  connectAutomatically,
  logoutGmAccess,
  reconcileGmAuthority,
  refreshPresence,
  requireStationReselectionForCurrentSession,
} from '@/lib/sessionService';
import AppHeader from '@/components/AppHeader';
import WolfHackingRuntime from '@/components/WolfHackingRuntime';
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
import { markServiceWorkerUpdateAvailable } from '@/pwa';
import { dockingForShuttle } from '@/data/shuttles';
import { findShip } from '@/data/ships';
import { findConsoleRole } from '@/data/roles';
import { replacementRoleFor } from '@/data/replacementRoles';
import CrisisReportPanel from '@/components/CrisisReportPanel';
import PrivateLoyaltyPanel from '@/components/PrivateLoyaltyPanel';
import EndgameDialog from '@/components/EndgameDialog';
import EscapeState from '@/routes/EscapeState';
import ReplacementRoleWorkspace from '@/routes/ReplacementRoleWorkspace';
import type {
  ArbourVision,
  CommissarPurgeAuthority,
  CurrentGroupCandidateRevealProjection,
  GameSession,
  LoyaltyCensus,
  Player,
  PlayerDiscoveryProjection,
  RoleBrief as RoleBriefProjection,
  WolfCultIntelligence,
} from '@/types/game';
import { isSessionRoute, restoreSessionRoute } from '@/lib/sessionRoute';
import { stripGmNavigationProjection } from '@/lib/navigationPrivacy';
import { shouldLoadAwayMissionDiscardPanel } from '@/lib/awayMissionVisibility';

const GM_RECONCILE_INTERVAL_MS = 5_000;
const PRESENCE_HEARTBEAT_INTERVAL_MS = 10_000;
const RoleBrief = lazy(() => import('@/routes/RoleBrief'));
const SessionMode = lazy(() => import('@/routes/SessionMode'));
const ShuttleConsole = lazy(() => import('@/routes/ShuttleConsole'));
const AwayMissionDiscardPanel = lazy(() => import('@/components/AwayMissionDiscardPanel'));
const hasConsoleDradis = (path: string): boolean =>
  path === '/press' || path.startsWith('/ships/') || path.startsWith('/union/') ||
  path.startsWith('/shuttles/') || path.startsWith('/replacement/');

function pursuitEmergencyAuthorityMatches(session: GameSession): boolean {
  const marker = session.pursuitEmergencyWindow;
  const authority = session.pursuitEmergencyWindowAuthority;
  return Boolean(marker && authority && marker.type === authority.type &&
    marker.status === authority.status && marker.cycle === authority.cycle &&
    marker.openedAt === authority.openedAt);
}

function stripNavigationProjection(session: GameSession): GameSession {
  const next = { ...session };
  delete next.playerDiscovery;
  delete next.currentGroupCandidateReveals;
  delete next.shipGalacticCoordinates;
  delete next.shipNavigationLogs;
  return next;
}


function effectivePlayerShip(player: Player | null | undefined): Player['shipPreferenceId'] {
  if (!player) return undefined;
  if (player.replacementStatus === 'awaiting-re-role') return undefined;
  if (player.replacementRoleId) {
    const replacement = replacementRoleFor(player.replacementRoleId);
    const replacementShip = replacement?.vesselId ? findShip(replacement.vesselId) : undefined;
    return replacementShip?.id;
  }
  const assignedShipId = findConsoleRole(player.assignedRoleId ?? undefined)?.shipId;
  return assignedShipId ? findShip(assignedShipId)?.id : undefined;
}

function playerEntitlementKey(player: Player | null | undefined): string | undefined {
  if (!player) return undefined;
  if (player.replacementStatus === 'awaiting-re-role') return undefined;
  if (player.replacementRoleId) return `replacement:${player.replacementRoleId}`;
  return player.assignedRoleId ? `assigned:${player.assignedRoleId}` : undefined;
}

function playerAuthorityKey(player: Player | null | undefined): string | undefined {
  if (!player || player.role !== 'player') return undefined;
  if (player.replacementStatus === 'awaiting-re-role') return undefined;
  if (player.replacementRoleId === 'commissar' && player.activeConsoleRoleId === null) {
    return `commissar:${player.uid}`;
  }
  const activeConsoleRoleId = player.activeConsoleRoleId;
  if (
    activeConsoleRoleId === 'admiral' ||
    activeConsoleRoleId === 'dione-captain' ||
    activeConsoleRoleId === 'icebreaker-captain' ||
    activeConsoleRoleId === 'shepherd-captain' ||
    activeConsoleRoleId === 'quellon-captain' ||
    activeConsoleRoleId === 'refinery-124-captain' ||
    activeConsoleRoleId === 'capybara-captain'
  ) {
    return `captain:${player.uid}:${activeConsoleRoleId}`;
  }
  return undefined;
}

export function stationRoleFromPath(pathname: string): string | undefined {
  const shipMatch = /^\/ships\/([^/]+)\/roles\/([^/]+)$/.exec(pathname);
  if (shipMatch) {
    const [, shipId, roleId] = shipMatch;
    const role = findConsoleRole(roleId);
    return role && role.shipId === shipId ? role.id : undefined;
  }
  const unionMatch = /^\/union\/roles\/([^/]+)$/.exec(pathname);
  const unionRole = findConsoleRole(unionMatch?.[1]);
  return unionRole?.shipId === 'joint-engineering-union' ? unionRole.id : undefined;
}

function playerHasStationRouteAuthority(player: Player | null | undefined, routeRoleId: string): boolean {
  if (!playerCanUseCoreStationRoute(player)) return false;
  if (player.activeConsoleRoleId != null) return player.activeConsoleRoleId === routeRoleId;
  const assignedRoleId = player.assignedRoleId && player.assignedRoleId !== 'press-officer'
    ? player.assignedRoleId
    : undefined;
  const seatRoleId = player.seatId && player.seatId !== 'press-officer'
    ? player.seatId
    : undefined;
  const pointersAgree = !assignedRoleId || !seatRoleId || assignedRoleId === seatRoleId;
  const boundRoleId = pointersAgree ? assignedRoleId ?? seatRoleId : undefined;
  return boundRoleId === routeRoleId;
}

function playerCanUseCoreStationRoute(player: Player | null | undefined): player is Player {
  return Boolean(
    player && player.role === 'player' && !player.escapeState &&
    player.replacementStatus == null && player.replacementRoleId == null,
  );
}

function AppRoutes() {
  const { reducedMotion } = useMotionPreference();
  const location = useLocation();
  const navigate = useNavigate();
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const communicationError = useSessionStore((state) => state.communicationError);
  const sessionId = session?.id;
  const playerUid = me?.uid;
  const playerRole = me?.role;
  const awayMissionPointerCount = useSessionStore((state) => state.awayMissionHandPointers.length);
  const gmAwayMissionPointerCount = useSessionStore((state) => state.gmAwayMissionHandPointers.length);
  const showAwayMissionDiscardPanel = shouldLoadAwayMissionDiscardPanel(
    sessionId,
    playerRole,
    awayMissionPointerCount,
    gmAwayMissionPointerCount,
  );
  const playerAuthority = playerAuthorityKey(me);
  const identityHydrationRevision = useSessionStore((state) => state.identityHydrationRevision);
  const escapeLocked = me?.role === 'player' && me.escapeState !== undefined;
  const playerListenerGeneration = useRef(0);
  const playerListenerIdentity = useRef('');
  const appRoutesMounted = useRef(false);
  const currentPath = useRef(location.pathname);
  const pendingStationRelease = useRef<{
    readonly sessionId: string;
    readonly playerUid: string;
    readonly routeRoleId: string;
    readonly playerProjectionFresh: boolean;
  } | null>(null);
  currentPath.current = location.pathname;
  const gmAccessAuthenticatedAt = useSessionStore((state) => state.gmAccessAuthenticatedAt);
  const lastRoute = useSessionStore((state) => state.lastRoute);
  const setLastRoute = useSessionStore((state) => state.setLastRoute);
  const shuttleId = location.pathname.startsWith('/shuttles/')
    ? location.pathname.slice('/shuttles/'.length).split('/')[0]
    : undefined;
  const shuttleHost = shuttleId ? dockingForShuttle(session ?? {}, shuttleId)?.shipId : undefined;
  const pressDocking = dockingForShuttle(session ?? {}, 'snn-press-shuttle');
  const replacementRouteRoleId = location.pathname.startsWith('/replacement/')
    ? location.pathname.slice('/replacement/'.length).split('/')[0]
    : undefined;
  const replacementRouteShipId = replacementRouteRoleId
    ? replacementRoleFor(replacementRouteRoleId)?.vesselId
    : undefined;
  const shipId = location.pathname.startsWith('/ships/')
    ? location.pathname.slice('/ships/'.length).split('/')[0] ?? 'aegis'
    : location.pathname === '/press'
      ? pressDocking?.shipId ?? 'dione'
      : replacementRouteShipId
        ? findShip(replacementRouteShipId)?.id ?? 'aegis'
      : shuttleHost ?? 'aegis';

  useEffect(() => {
    appRoutesMounted.current = true;
    return () => { appRoutesMounted.current = false; };
  }, []);

  useEffect(() => {
    if (session && isSessionRoute(location.pathname)) {
      setLastRoute(location.pathname);
    }
  }, [location.pathname, session, setLastRoute]);

  useEffect(() => {
    if (communicationError?.kind !== 'station-selection-required' || location.pathname === '/console') return;
    navigate('/console', { replace: true });
  }, [communicationError?.kind, location.pathname, navigate]);

  useEffect(() => {
    if (!sessionId || !playerUid) return;
    let active = true;
    const identity = `${sessionId}:${playerUid}`;
    if (
      pendingStationRelease.current &&
      (pendingStationRelease.current.sessionId !== sessionId ||
        pendingStationRelease.current.playerUid !== playerUid)
    ) pendingStationRelease.current = null;
    const listenerGeneration = playerListenerIdentity.current === identity
      ? playerListenerGeneration.current
      : ++playerListenerGeneration.current;
    playerListenerIdentity.current = identity;
    const listenerAuthorityKey = playerAuthority;
    const callbackCurrent = () => appRoutesMounted.current &&
      playerListenerGeneration.current === listenerGeneration;
    let pendingRoleBrief: RoleBriefProjection | null = null;
    let pendingWolfCultIntelligence: { intelligence: WolfCultIntelligence; generation: number } | null = null;
    let wolfCultAuthorityGeneration = 0;
    let wolfCultBlocked = false;
    let pendingArbourVision: { vision: ArbourVision; generation: number } | null = null;
    let arbourVisionAuthorityGeneration = 0;
    let arbourVisionBlocked = false;
    let arbourVisionBlockReason: 'entitlement' | 'loyalty' | null = null;
    let arbourVisionRevisionFloor = 0;
    let pendingGmDiscovery: Pick<GameSession, 'shipGalacticCoordinates' | 'shipNavigationLogs' |
      'organiserSites' | 'organiserSystems' | 'organiserSystemHistory' | 'pursuitDistances' |
      'pursuitGroups' | 'shipFleetGroupIds' | 'candidatePlanCheckpoint' |
      'pursuitEmergencyWindowAuthority'> | null = null;
    let unsubscribe: () => void = () => undefined;
    let unsubscribeLoyaltyCensus: () => void = () => undefined;
    let censusSubscribed = false;
    let censusGeneration = 0;
    let playerProjectionFresh = false;
    let pendingPlayerDiscovery: PlayerDiscoveryProjection | null | undefined;
    let retainedGroupCandidateProjection: CurrentGroupCandidateRevealProjection | undefined;
    const hideCurrentGroupCandidateReveals = () => {
      const store = useSessionStore.getState();
      const current = store.session;
      if (!current || current.id !== sessionId) return;
      const next = { ...current };
      delete next.currentGroupCandidateReveals;
      if (next.playerDiscovery?.candidateReveals !== undefined) {
        next.playerDiscovery = { ...next.playerDiscovery, candidateReveals: [] };
      }
      store.setSession(next);
    };
    const clearCurrentGroupCandidateReveals = () => {
      retainedGroupCandidateProjection = undefined;
      pendingPlayerDiscovery = undefined;
      hideCurrentGroupCandidateReveals();
    };
    const restoreRetainedGroupCandidateProjection = () => {
      if (!callbackCurrent() || !playerProjectionFresh) return;
      const store = useSessionStore.getState();
      if (store.connection !== 'live' || store.sessionSnapshotFreshness !== 'server') return;
      const current = store.session;
      const retained = retainedGroupCandidateProjection;
      if (!current || current.id !== sessionId || !retained) return;
      if (current.phase !== 'active' || store.me?.uid !== playerUid || store.me.role !== 'player' ||
          store.me.fleetGroupId !== retained.groupId) {
        retainedGroupCandidateProjection = undefined;
        hideCurrentGroupCandidateReveals();
        return;
      }
      if (current.currentGroupCandidateReveals !== retained) {
        store.setSession({ ...current, currentGroupCandidateReveals: retained });
      }
    };
    const applyPendingPlayerDiscovery = () => {
      if (!callbackCurrent() || pendingPlayerDiscovery === undefined) return;
      const store = useSessionStore.getState();
      const current = store.session;
      if (!current || current.id !== sessionId) return;
      if (pendingPlayerDiscovery === null) {
        pendingPlayerDiscovery = undefined;
        retainedGroupCandidateProjection = undefined;
        store.setSession(stripNavigationProjection(current));
        return;
      }
      const projection = pendingPlayerDiscovery;
      const requiresCandidateAuthority = projection.candidateReveals !== undefined;
      // Navigation remains an own-ship projection. Group candidate names need
      // both independent server snapshots because either can change the read
      // audience while this protected document is arriving.
      if (requiresCandidateAuthority &&
          (!playerProjectionFresh || store.connection !== 'live' || store.sessionSnapshotFreshness !== 'server')) return;
      const me = store.me;
      if (me?.uid !== playerUid || me.role !== 'player' ||
          (requiresCandidateAuthority &&
            (!me.fleetGroupId || projection.groupId !== me.fleetGroupId))) {
        retainedGroupCandidateProjection = undefined;
        pendingPlayerDiscovery = undefined;
        store.setSession(stripNavigationProjection(current));
        return;
      }
      const candidateProjection: CurrentGroupCandidateRevealProjection | undefined =
        current.phase === 'active' && requiresCandidateAuthority &&
          me.fleetGroupId === projection.groupId
          ? {
            groupId: projection.groupId,
            candidateReveals: projection.candidateReveals,
            revision: projection.revision,
          }
          : undefined;
      retainedGroupCandidateProjection = candidateProjection;
      const withoutPreviousDiscovery = stripNavigationProjection(current);
      const withGroupCandidates = candidateProjection
        ? { ...withoutPreviousDiscovery, currentGroupCandidateReveals: candidateProjection }
        : withoutPreviousDiscovery;
      const entitledShipId = effectivePlayerShip(me);
      if (!entitledShipId || projection.shipId !== entitledShipId) {
        pendingPlayerDiscovery = undefined;
        store.setSession(withGroupCandidates);
        return;
      }
      const shipId = projection.shipId;
      pendingPlayerDiscovery = undefined;
      store.setSession({
        ...withGroupCandidates,
        playerDiscovery: projection,
        ...(shipId && projection.currentCoordinate
          ? { shipGalacticCoordinates: { [shipId]: projection.currentCoordinate } }
          : {}),
        ...(shipId ? { shipNavigationLogs: { [shipId]: projection.navigationLogs } } : {}),
      });
    };
    const unsubscribeAuthorityFreshness = useSessionStore.subscribe((state, previousState) => {
      const wasFresh = previousState.connection === 'live' &&
        previousState.sessionSnapshotFreshness === 'server';
      const isFresh = state.connection === 'live' && state.sessionSnapshotFreshness === 'server';
      if (!wasFresh || isFresh) return;
      playerProjectionFresh = false;
      clearCurrentGroupCandidateReveals();
    });
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
    const clearWolfCultIntelligence = () => {
      wolfCultAuthorityGeneration += 1;
      wolfCultBlocked = true;
      pendingWolfCultIntelligence = null;
      useSessionStore.getState().setWolfCultIntelligence(null);
    };
    const invalidateArbourVision = () => {
      arbourVisionAuthorityGeneration += 1;
      arbourVisionRevisionFloor = Math.max(
        arbourVisionRevisionFloor,
        pendingArbourVision?.vision.revision ?? 0,
        useSessionStore.getState().arbourVision?.revision ?? 0,
      );
      arbourVisionBlocked = true;
      arbourVisionBlockReason = 'loyalty';
      pendingArbourVision = null;
      useSessionStore.getState().setArbourVision(null);
    };
    const retainArbourVisionForEntitlementChange = () => {
      const store = useSessionStore.getState();
      const candidate = arbourVisionBlockReason === 'loyalty'
        ? null
        : pendingArbourVision?.vision ?? store.arbourVision ?? null;
      arbourVisionAuthorityGeneration += 1;
      arbourVisionBlocked = true;
      arbourVisionBlockReason = 'entitlement';
      pendingArbourVision = candidate
        ? { vision: candidate, generation: arbourVisionAuthorityGeneration }
        : null;
      store.setArbourVision(null);
    };
    const currentPlayerMayReadCensus = () => {
      const state = useSessionStore.getState();
      return callbackCurrent() && playerProjectionFresh && state.session?.id === sessionId &&
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
    const reconcileStationRelease = () => {
      const pending = pendingStationRelease.current;
      if (!pending?.playerProjectionFresh) return;
      const store = useSessionStore.getState();
      if (
        store.session?.id !== pending.sessionId ||
        store.me?.uid !== pending.playerUid ||
        stationRoleFromPath(currentPath.current) !== pending.routeRoleId ||
        playerHasStationRouteAuthority(store.me, pending.routeRoleId)
      ) {
        pendingStationRelease.current = null;
        return;
      }
      if (store.connection !== 'live' || store.sessionSnapshotFreshness !== 'server') return;
      if (requireStationReselectionForCurrentSession()) pendingStationRelease.current = null;
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
        onSession: (next) => {
          if (!callbackCurrent()) return;
          const store = useSessionStore.getState();
          const current = store.session;
          if (!current || current.id !== next.id) {
            retainedGroupCandidateProjection = undefined;
            store.setSession(next);
            return;
          }
          // Protected documents have independent snapshot timing. A public
          // header update must not discard their already accepted projections.
          const currentCandidateProjection = current.currentGroupCandidateReveals ??
            retainedGroupCandidateProjection;
          if (currentCandidateProjection && (next.phase !== 'active' || store.me?.uid !== playerUid ||
              store.me.role !== 'player' || store.me.fleetGroupId !== currentCandidateProjection.groupId)) {
            retainedGroupCandidateProjection = undefined;
          }
          const candidateProjection = store.connection === 'live' && store.sessionSnapshotFreshness === 'server' && playerProjectionFresh &&
            next.phase === 'active' && store.me?.uid === playerUid && store.me.role === 'player' &&
            currentCandidateProjection && store.me.fleetGroupId === currentCandidateProjection.groupId
            ? currentCandidateProjection : undefined;
          if (candidateProjection) retainedGroupCandidateProjection = candidateProjection;
          if (!next.pursuitEmergencyWindow && current.pursuitEmergencyWindowAuthority &&
              pendingGmDiscovery?.pursuitEmergencyWindowAuthority) {
            const {
              pursuitEmergencyWindowAuthority: clearedEmergencyAuthority,
              ...pendingWithoutEmergencyAuthority
            } = pendingGmDiscovery;
            void clearedEmergencyAuthority;
            pendingGmDiscovery = pendingWithoutEmergencyAuthority;
          }
          const emergencyAuthority = pendingGmDiscovery?.pursuitEmergencyWindowAuthority ??
            current.pursuitEmergencyWindowAuthority;
          const composed = {
            ...next,
            ...(current.playerDiscovery ? { playerDiscovery: current.playerDiscovery } : {}),
            ...(current.shipGalacticCoordinates ? { shipGalacticCoordinates: current.shipGalacticCoordinates } : {}),
            ...(current.shipNavigationLogs ? { shipNavigationLogs: current.shipNavigationLogs } : {}),
            ...(current.organiserSystems ? { organiserSystems: current.organiserSystems } : {}),
            ...(current.organiserSites ? { organiserSites: current.organiserSites } : {}),
            ...(current.organiserSystemHistory ? { organiserSystemHistory: current.organiserSystemHistory } : {}),
            ...(current.pursuitDistances ? { pursuitDistances: current.pursuitDistances } : {}),
            ...(current.pursuitGroups ? { pursuitGroups: current.pursuitGroups } : {}),
            ...(current.shipFleetGroupIds ? { shipFleetGroupIds: current.shipFleetGroupIds } : {}),
            ...(current.candidatePlanCheckpoint ? { candidatePlanCheckpoint: current.candidatePlanCheckpoint } : {}),
            ...(emergencyAuthority && pursuitEmergencyAuthorityMatches({
              ...next,
              pursuitEmergencyWindowAuthority: emergencyAuthority,
            }) ? { pursuitEmergencyWindowAuthority: emergencyAuthority } : {}),
            ...(candidateProjection ? { currentGroupCandidateReveals: candidateProjection } : {}),
          };
          store.setSession(store.me?.role === 'gm' ? composed : stripGmNavigationProjection(composed));
        },
        onPlayerDiscovery: (projection) => {
          if (!callbackCurrent()) return;
          const store = useSessionStore.getState();
          const current = store.session;
          if (!current || current.id !== sessionId) return;
          if (store.me?.role === 'gm' && current.organiserSystems !== undefined) {
            pendingPlayerDiscovery = undefined;
            retainedGroupCandidateProjection = undefined;
            const next = { ...current };
            delete next.currentGroupCandidateReveals;
            if (projection) next.playerDiscovery = projection;
            else delete next.playerDiscovery;
            store.setSession(next);
            return;
          }
          pendingPlayerDiscovery = projection;
          applyPendingPlayerDiscovery();
        },
        onGmDiscovery: (projection) => {
          if (!callbackCurrent()) return;
          const store = useSessionStore.getState();
          const current = store.session;
          if (!current || current.id !== sessionId) return;
          pendingGmDiscovery = projection;
          if (!projection) {
            if (store.me?.role === 'gm') {
              retainedGroupCandidateProjection = undefined;
              const next = { ...stripGmNavigationProjection(current) };
              delete next.currentGroupCandidateReveals;
              store.setSession(next);
            } else {
              // An ordinary player's denied GM-chart listener is expected;
              // scrub any stale chart data without clearing their separate
              // current-group candidate projection.
              store.setSession(stripGmNavigationProjection(current));
            }
            return;
          }
          if (store.me?.role === 'gm') {
            const next = { ...current, ...projection };
            if (!projection.candidatePlanCheckpoint) delete next.candidatePlanCheckpoint;
            if (!projection.pursuitEmergencyWindowAuthority ||
                !pursuitEmergencyAuthorityMatches(next)) {
              delete next.pursuitEmergencyWindowAuthority;
            }
            store.setSession(next);
          }
        },
        onSessionFreshness: (fresh) => {
          if (!callbackCurrent()) return;
          const store = useSessionStore.getState();
          store.setConnection(fresh ? 'live' : 'offline');
          store.setSessionSnapshotFreshness(fresh ? 'server' : 'cache');
          if (!fresh) clearCurrentGroupCandidateReveals();
          else {
            applyPendingPlayerDiscovery();
            restoreRetainedGroupCandidateProjection();
            reconcileStationRelease();
          }
        },
        onPlayer: (next) => {
          if (!callbackCurrent()) return;
          const store = useSessionStore.getState();
          const previousPlayer = store.me;
          const routeRoleId = stationRoleFromPath(currentPath.current);
          const pending = pendingStationRelease.current;
          const pendingStillApplies = Boolean(
            pending && playerCanUseCoreStationRoute(next) &&
            routeRoleId === pending.routeRoleId && next.sessionId === pending.sessionId &&
            next.uid === pending.playerUid &&
            !playerHasStationRouteAuthority(next, pending.routeRoleId),
          );
          if (
            routeRoleId && previousPlayer?.sessionId === next.sessionId &&
            previousPlayer.uid === next.uid && playerCanUseCoreStationRoute(next) &&
            playerHasStationRouteAuthority(previousPlayer, routeRoleId) &&
            !playerHasStationRouteAuthority(next, routeRoleId)
          ) {
            pendingStationRelease.current = {
              sessionId: next.sessionId,
              playerUid: next.uid,
              routeRoleId,
              playerProjectionFresh: false,
            };
          } else if (pendingStillApplies && pending) {
            pendingStationRelease.current = { ...pending, playerProjectionFresh: false };
          } else {
            pendingStationRelease.current = null;
          }
          const previousEntitlement = playerEntitlementKey(store.me);
          const previousFleetGroupId = store.me?.fleetGroupId;
          const previousWolfCultIdentity = store.me
            ? `${store.me.uid}:${store.me.role}:${store.me.assignedRoleId ?? ''}:${store.me.replacementRoleId ?? ''}:${store.me.replacementStatus ?? ''}`
            : '';
          const nextWolfCultIdentity = `${next.uid}:${next.role}:${next.assignedRoleId ?? ''}:${next.replacementRoleId ?? ''}:${next.replacementStatus ?? ''}`;
          const nextEntitlement = playerEntitlementKey(next);
          if (playerAuthorityKey(next) !== listenerAuthorityKey) {
            store.setFacilitatorRuleCall(null);
          }
          playerProjectionFresh = false;
          const currentCandidateProjection = store.session?.id === sessionId
            ? store.session.currentGroupCandidateReveals ?? retainedGroupCandidateProjection
            : undefined;
          retainedGroupCandidateProjection = currentCandidateProjection && store.me?.uid === playerUid &&
            store.me.role === 'player' && next.uid === playerUid && next.role === 'player' &&
            store.session?.phase === 'active' && next.fleetGroupId === currentCandidateProjection.groupId
            ? currentCandidateProjection : undefined;
          hideCurrentGroupCandidateReveals();
          store.setMe(next);
          if (previousWolfCultIdentity !== nextWolfCultIdentity || next.role !== 'player') {
            clearWolfCultIntelligence();
          }
          if (previousEntitlement !== nextEntitlement) {
            retainArbourVisionForEntitlementChange();
          }
          if (next.replacementStatus != null) {
            store.setPrivateLoyalty(null);
            clearWolfCultIntelligence();
            invalidateArbourVision();
          }
          if (previousFleetGroupId !== next.fleetGroupId) {
            const current = useSessionStore.getState().session;
            if (current?.id === sessionId) {
              useSessionStore.getState().setSession(stripNavigationProjection(current));
            }
          }
          const authority = store.commissarPurgeAuthority;
          const authorityStillCurrent = authority?.role === 'commissar'
            ? next.replacementRoleId === 'commissar' && next.activeConsoleRoleId === null
            : authority?.role === 'captain'
              ? next.role === 'player' && next.activeConsoleRoleId === authority.captainRoleId &&
                (next.replacementRoleId == null || next.replacementRoleId === authority.captainRoleId)
              : false;
          if (!authorityStillCurrent) {
            store.setCommissarPurgeAuthority(null);
          }
          if (next.role === 'gm') {
            store.setFacilitatorRuleCall(null);
          } else {
            store.setGmAwayMissionHandPointers([]);
          }
          if (next.role !== 'player') {
            store.setAwayMissionHandPointers([]);
            store.setAwayMissionHandPointer(null);
            store.setAwayMissionHands([]);
            store.setAwayMissionHand(null);
          }
          if (next.role !== 'gm' && previousEntitlement !== nextEntitlement) {
            const current = useSessionStore.getState().session;
            if (current?.id === sessionId) {
              useSessionStore.getState().setSession(stripNavigationProjection(current));
            }
          }
          const effectiveBriefRoleId = next.replacementStatus === 'awaiting-re-role'
            ? undefined
            : next.replacementRoleId ?? next.assignedRoleId;
          if (!effectiveBriefRoleId) {
            pendingRoleBrief = null;
            store.setRoleBrief(null);
          } else {
            const bufferedBrief = pendingRoleBrief;
            pendingRoleBrief = null;
            if (
              bufferedBrief &&
              bufferedBrief.assignmentUid === next.uid &&
              bufferedBrief.roleId === effectiveBriefRoleId
            ) {
              store.setRoleBrief(bufferedBrief);
            } else {
              const currentBrief = store.roleBrief;
              if (currentBrief && currentBrief.roleId !== effectiveBriefRoleId) {
                store.setRoleBrief(null);
              }
            }
          }
          if (next.role !== 'gm') {
            pendingGmDiscovery = null;
            clearLoyaltyCensus();
            useSessionStore.getState().setGmSetupReceipt(null);
            useSessionStore.getState().setGmCrisisState(null);
            const current = useSessionStore.getState().session;
            if (current?.id === sessionId) {
              useSessionStore.getState().setSession(stripGmNavigationProjection(current));
            }
          } else if (pendingGmDiscovery) {
            const current = store.session;
            if (current?.id === sessionId) {
              const next = { ...current, ...pendingGmDiscovery };
              if (!pendingGmDiscovery.candidatePlanCheckpoint) delete next.candidatePlanCheckpoint;
              if (!pendingGmDiscovery.pursuitEmergencyWindowAuthority ||
                  !pursuitEmergencyAuthorityMatches(next)) {
                delete next.pursuitEmergencyWindowAuthority;
              }
              store.setSession(next);
            }
          }
        },
        onPlayerFreshness: (fresh) => {
          if (!callbackCurrent()) return;
          playerProjectionFresh = fresh;
          const pending = pendingStationRelease.current;
          if (
            pending && pending.sessionId === sessionId && pending.playerUid === playerUid
          ) pendingStationRelease.current = { ...pending, playerProjectionFresh: fresh };
          if (!fresh) {
            clearCurrentGroupCandidateReveals();
          }
          else {
            applyPendingPlayerDiscovery();
            restoreRetainedGroupCandidateProjection();
            reconcileStationRelease();
          }
          reconcileLoyaltyCensus();
        },
        onKicked: () => {
          if (!callbackCurrent()) return;
          clearLoyaltyCensus();
          clearWolfCultIntelligence();
          useSessionStore.getState().setAwayMissionHandPointers([]);
          useSessionStore.getState().setAwayMissionHandPointer(null);
          useSessionStore.getState().setAwayMissionHands([]);
          useSessionStore.getState().setAwayMissionHand(null);
          useSessionStore.getState().setGmAwayMissionHandPointers([]);
          useSessionStore.getState().disconnect();
        },
        onSeats: (next) => { if (callbackCurrent()) useSessionStore.getState().setSeats(next); },
        onPrivateLoyalty: (next) => {
          if (!callbackCurrent()) return;
          const store = useSessionStore.getState();
          if (store.me?.replacementStatus != null) {
            store.setPrivateLoyalty(null);
            clearWolfCultIntelligence();
            invalidateArbourVision();
            return;
          }
          store.setPrivateLoyalty(next);
          if (store.me?.role !== 'player' || next?.kind !== 'wolf-cult') {
            clearWolfCultIntelligence();
          } else {
            wolfCultBlocked = false;
            const pending = pendingWolfCultIntelligence;
            if (pending && pending.generation === wolfCultAuthorityGeneration) {
              pendingWolfCultIntelligence = null;
              store.setWolfCultIntelligence(pending.intelligence);
            }
          }
          if (next?.kind === 'universal-arbour') {
            if (arbourVisionBlocked) {
              const candidate = arbourVisionBlockReason === 'entitlement' &&
                pendingArbourVision?.generation === arbourVisionAuthorityGeneration &&
                pendingArbourVision.vision.revision >= arbourVisionRevisionFloor
                ? pendingArbourVision.vision
                : null;
              arbourVisionBlocked = false;
              arbourVisionBlockReason = null;
              pendingArbourVision = null;
              if (candidate) {
                arbourVisionRevisionFloor = candidate.revision;
                store.setArbourVision(candidate);
              } else {
                store.setArbourVision(null);
              }
            } else if (
              pendingArbourVision &&
              pendingArbourVision.generation === arbourVisionAuthorityGeneration &&
              pendingArbourVision.vision.revision > arbourVisionRevisionFloor
            ) {
              store.setArbourVision(pendingArbourVision.vision);
              arbourVisionRevisionFloor = pendingArbourVision.vision.revision;
              pendingArbourVision = null;
            }
          } else {
            invalidateArbourVision();
          }
        },
        onWolfCultIntelligence: (next) => {
          if (!callbackCurrent()) return;
          const store = useSessionStore.getState();
          if (!next) {
            pendingWolfCultIntelligence = null;
            store.setWolfCultIntelligence(null);
            return;
          }
          if (wolfCultBlocked || store.me?.role !== 'player' ||
              store.me.replacementStatus != null) {
            pendingWolfCultIntelligence = null;
            store.setWolfCultIntelligence(null);
            return;
          }
          if (store.privateLoyalty?.kind !== 'wolf-cult') {
            pendingWolfCultIntelligence = { intelligence: next, generation: wolfCultAuthorityGeneration };
            store.setWolfCultIntelligence(null);
            return;
          }
          pendingWolfCultIntelligence = null;
          store.setWolfCultIntelligence(next);
        },
        onArbourVision: (next) => {
          if (!callbackCurrent()) return;
          const store = useSessionStore.getState();
          if (store.me?.replacementStatus != null) {
            pendingArbourVision = null;
            store.setArbourVision(null);
            return;
          }
          if (!next) {
            pendingArbourVision = null;
            store.setArbourVision(null);
            return;
          }
          if (next.revision <= arbourVisionRevisionFloor) return;
          if (arbourVisionBlocked) {
            if (arbourVisionBlockReason === 'entitlement') {
              const candidate = pendingArbourVision?.vision;
              if (next.revision > arbourVisionRevisionFloor &&
                  (!candidate || next.revision > candidate.revision)) {
                pendingArbourVision = { vision: next, generation: arbourVisionAuthorityGeneration };
              }
            } else {
              pendingArbourVision = null;
            }
            store.setArbourVision(null);
            return;
          }
          if (store.privateLoyalty?.kind !== 'universal-arbour') {
            pendingArbourVision = { vision: next, generation: arbourVisionAuthorityGeneration };
            store.setArbourVision(null);
            return;
          }
          pendingArbourVision = null;
          arbourVisionRevisionFloor = next.revision;
          store.setArbourVision(next);
        },
        onFacilitatorRuleCall: (next) => {
          if (!callbackCurrent()) return;
          const store = useSessionStore.getState();
          if (playerAuthorityKey(store.me) !== listenerAuthorityKey) return;
          if (
            !next ||
            store.me?.role !== 'player' ||
            next.audience !== 'selected-player' ||
            next.recipientUid !== store.me.uid
          ) {
            store.setFacilitatorRuleCall(null);
            return;
          }
          store.setFacilitatorRuleCall(next);
        },
        onRoleBrief: (next) => {
          if (!callbackCurrent()) return;
          const store = useSessionStore.getState();
          if (!next) {
            pendingRoleBrief = null;
            store.setRoleBrief(null);
            return;
          }
          if (store.me?.uid !== next.assignmentUid || store.me.replacementStatus != null) {
            pendingRoleBrief = null;
            store.setRoleBrief(null);
            return;
          }
          if (store.me.replacementRoleId === next.roleId || store.me.assignedRoleId === next.roleId) {
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
        onAwayMissionHandPointers: (next) => {
          if (!callbackCurrent()) return;
          const store = useSessionStore.getState();
          if ((store.me && store.me.uid !== playerUid) || store.me?.role === 'gm') {
            store.setAwayMissionHandPointers([]);
            store.setAwayMissionHandPointer(null);
            store.setAwayMissionHands([]);
            store.setAwayMissionHand(null);
            return;
          }
          store.setAwayMissionHandPointers(next);
        },
        onAwayMissionHands: (next) => {
          if (!callbackCurrent()) return;
          const store = useSessionStore.getState();
          if ((store.me && store.me.uid !== playerUid) || store.me?.role === 'gm' ||
              next.some((hand) => !store.awayMissionHandPointers.some((pointer) => pointer.handId === hand.handId))) {
            store.setAwayMissionHands([]);
            store.setAwayMissionHand(null);
            return;
          }
          store.setAwayMissionHands(next);
        },
        onGmAwayMissionHandPointers: (next) => {
          if (!callbackCurrent()) return;
          const store = useSessionStore.getState();
          store.setGmAwayMissionHandPointers(store.me?.role === 'gm' ? next : []);
        },
        onCommissarPurgeAuthority: (next: CommissarPurgeAuthority | null) => {
          if (!callbackCurrent()) return;
          const store = useSessionStore.getState();
          if (!next) {
            store.setCommissarPurgeAuthority(null);
            return;
          }
          // Firestore can deliver the old private document after a role
          // transition. Recheck the live player projection before accepting
          // it so a revoked captain or Commissar cannot rehydrate stale data.
          if (commissarPurgeAuthorityIsCurrent(next, store.session, store.me)) {
            store.setCommissarPurgeAuthority(next);
          }
        },
        onSetupReceipt: (next) => {
          if (!callbackCurrent()) return;
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
        onError: () => {
          if (!callbackCurrent()) return;
          playerProjectionFresh = false;
          clearCurrentGroupCandidateReveals();
          const store = useSessionStore.getState();
          store.setSessionSnapshotFreshness('cache');
          store.setConnection('offline');
        },
      });
    });
    return () => {
      active = false;
      playerListenerGeneration.current += 1;
      pendingRoleBrief = null;
      clearLoyaltyCensus();
      clearWolfCultIntelligence();
      pendingArbourVision = null;
      arbourVisionBlocked = true;
      useSessionStore.getState().setArbourVision(null);
      useSessionStore.getState().setFacilitatorRuleCall(null);
      unsubscribeAuthorityFreshness();
      unsubscribe();
    };
  }, [identityHydrationRevision, playerAuthority, playerRole, playerUid, sessionId]);

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

  const restoreRoute = restoreSessionRoute(lastRoute);
  const home =
    session && me ? (
      <Navigate to={restoreRoute} replace />
    ) : (
      <Landing />
    );

  return (
    <div
      data-motion={reducedMotion ? 'reduce' : 'full'}
      data-escape-locked={escapeLocked ? 'true' : undefined}
    >
      <ShipPlot
        hostile={false}
        aboard={hasConsoleDradis(location.pathname)}
        viewerId={shipId}
        capybaraEnabled={session?.capybaraEnabled !== false}
        dioneEnabled={session?.dioneEnabled !== false}
        shipGalacticCoordinates={session?.shipGalacticCoordinates}
        shipDamage={session?.shipDamage}
        shipJumpTransitions={session?.shipJumpTransitions}
        activeRoleIds={session?.activeRoleIds}
        activeVesselIds={session?.activeVesselIds}
        ambientSession={session ?? undefined}
        turnPhase={session?.turnPhase}
      />
      <AppHeader />
      <WolfHackingRuntime />
      <EndgameDialog />
      <CommunicationError />
      <UnrestAlert />
      <PopulationAlert />
      <ScreenFade>
        {(screen) => (
          <>
            <PrivateLoyaltyPanel />
            <CrisisReportPanel />
            {showAwayMissionDiscardPanel && (
              <Suspense fallback={null}>
                <AwayMissionDiscardPanel />
              </Suspense>
            )}
            {escapeLocked ? <EscapeState /> : <Routes location={screen}>
              <Route path="/" element={home} />
              <Route path="/roles" element={<RoleSelect />} />
              <Route path="/brief" element={
                <Suspense fallback={
                  <main className="role-brief-screen">
                    <article className="role-brief cic-frame">
                      <Link className="session-mode__back cic-text-button" to="/console">
                        Back to stations
                      </Link>
                      <p role="status">Opening private briefing…</p>
                    </article>
                  </main>
                }>
                  <RoleBrief />
                </Suspense>
              } />
              <Route path="/escape" element={<EscapeState />} />
              <Route path="/gm" element={<GmConsole />} />
              <Route path="/console" element={(
                <Suspense fallback={<main className="session-mode"><p role="status">Opening stations…</p></main>}>
                  <SessionMode mode="console" />
                </Suspense>
              )} />
              <Route path="/press" element={(
                <Suspense fallback={(
                  <main className="session-mode">
                    <div className="session-mode__panel cic-frame">
                      <Link className="session-mode__back cic-text-button" to="/console">
                        Back to stations
                      </Link>
                      <p role="status">Opening Press…</p>
                    </div>
                  </main>
                )}>
                  <SessionMode mode="press" />
                </Suspense>
              )} />
              <Route path="/shuttles/:shuttleId" element={(
                <Suspense fallback={<main className="session-mode"><p role="status">Opening shuttle console…</p></main>}>
                  <ShuttleConsole />
                </Suspense>
              )} />
              <Route path="/ships/:shipId/roles" element={<ShipRoleSelect />} />
              <Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} />
              <Route path="/ships/:shipId/observer" element={<ShipConsole observer />} />
              <Route path="/ships/:shipId" element={<ShipConsole />} />
              <Route path="/union/roles/:roleId" element={<JointEngineeringConsole />} />
              <Route path="/replacement/:roleId" element={<ReplacementRoleWorkspace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>}
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
    const markAuthorityOffline = () => {
      const store = useSessionStore.getState();
      store.setSessionSnapshotFreshness('cache');
      store.setConnection('offline');
    };
    const renewPresence = () => refreshPresence().catch(markAuthorityOffline);
    const stopVersionMonitor = startVersionUpgradeMonitor({
      reconnect: () => run(connectAutomatically),
      onUpdateAvailable: markServiceWorkerUpdateAvailable,
    });
    // Some session-service failures mark the connection offline without going
    // through the browser's offline event. A server snapshot is no longer a
    // current authority proof once the Firebase connection is down.
    const stopOfflineAuthorityWatch = useSessionStore.subscribe((state) => {
      if (state.connection === 'offline' && state.sessionSnapshotFreshness === 'server') {
        state.setSessionSnapshotFreshness('cache');
      }
    });
    run(connectAutomatically);

    const retry = window.setInterval(() => {
      if (useSessionStore.getState().connection !== 'live') run(connectAutomatically);
    }, CONNECT_RETRY_INTERVAL_MS);
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

    const markOffline = markAuthorityOffline;
    const reconnectNow = () => {
      run(connectAutomatically);
    };
    const reconnectWhenVisible = () => {
      if (document.visibilityState === 'visible') run(connectAutomatically);
    };

    window.addEventListener('offline', markOffline);
    window.addEventListener('online', reconnectNow);
    document.addEventListener('visibilitychange', reconnectWhenVisible);

    return () => {
      window.clearInterval(retry);
      window.clearInterval(reconcileGm);
      window.clearInterval(heartbeat);
      stopVersionMonitor();
      stopOfflineAuthorityWatch();
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
