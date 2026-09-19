import { commissarPurgeAuthorityIsCurrent } from '@/lib/commissarPurgeAuthority';
import { useEffect, useRef } from 'react';
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
import { markServiceWorkerUpdateAvailable } from '@/pwa';
import { dockingForShuttle } from '@/data/shuttles';
import { findShip } from '@/data/ships';
import { findConsoleRole } from '@/data/roles';
import { replacementRoleFor } from '@/data/replacementRoles';
import CrisisReportPanel from '@/components/CrisisReportPanel';
import PrivateLoyaltyPanel from '@/components/PrivateLoyaltyPanel';
import AwayMissionDiscardPanel from '@/components/AwayMissionDiscardPanel';
import RoleBrief from '@/routes/RoleBrief';
import EscapeState from '@/routes/EscapeState';
import type { ArbourVision, CommissarPurgeAuthority, GameSession, LoyaltyCensus, Player, RoleBrief as RoleBriefProjection, WolfCultIntelligence } from '@/types/game';
import { isSessionRoute, restoreSessionRoute } from '@/lib/sessionRoute';
import { stripGmNavigationProjection } from '@/lib/navigationPrivacy';

const RECONNECT_INTERVAL_MS = 2_000;
const GM_RECONCILE_INTERVAL_MS = 5_000;
const PRESENCE_HEARTBEAT_INTERVAL_MS = 10_000;
const hasConsoleDradis = (path: string): boolean =>
  path === '/press' || path.startsWith('/ships/') || path.startsWith('/union/') || path.startsWith('/shuttles/');

function stripNavigationProjection(session: GameSession): GameSession {
  const next = { ...session };
  delete next.playerDiscovery;
  delete next.shipGalacticCoordinates;
  delete next.shipNavigationLogs;
  return next;
}


function effectivePlayerShip(player: Player | null | undefined): Player['shipPreferenceId'] {
  if (!player) return undefined;
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
  if (player.replacementRoleId) return `replacement:${player.replacementRoleId}`;
  return player.assignedRoleId ? `assigned:${player.assignedRoleId}` : undefined;
}

function playerAuthorityKey(player: Player | null | undefined): string | undefined {
  if (!player || player.role !== 'player') return undefined;
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

function AppRoutes() {
  const { reducedMotion } = useMotionPreference();
  const location = useLocation();
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const sessionId = session?.id;
  const playerUid = me?.uid;
  const playerRole = me?.role;
  const playerAuthority = playerAuthorityKey(me);
  const escapeLocked = me?.role === 'player' && me.escapeState !== undefined;
  const playerListenerGeneration = useRef(0);
  const playerListenerIdentity = useRef('');
  const appRoutesMounted = useRef(false);
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
    appRoutesMounted.current = true;
    return () => { appRoutesMounted.current = false; };
  }, []);

  useEffect(() => {
    if (session && isSessionRoute(location.pathname)) {
      setLastRoute(location.pathname);
    }
  }, [location.pathname, session, setLastRoute]);

  useEffect(() => {
    if (!sessionId || !playerUid) return;
    let active = true;
    const identity = `${sessionId}:${playerUid}`;
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
      'organiserSites' | 'organiserSystems' | 'organiserSystemHistory' | 'pursuitDistances'> | null = null;
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
            store.setSession(next);
            return;
          }
          // Protected documents have independent snapshot timing. A public
          // header update must not discard their already accepted projections.
          const composed = {
            ...next,
            ...(current.playerDiscovery ? { playerDiscovery: current.playerDiscovery } : {}),
            ...(current.shipGalacticCoordinates ? { shipGalacticCoordinates: current.shipGalacticCoordinates } : {}),
            ...(current.shipNavigationLogs ? { shipNavigationLogs: current.shipNavigationLogs } : {}),
            ...(current.organiserSystems ? { organiserSystems: current.organiserSystems } : {}),
            ...(current.organiserSites ? { organiserSites: current.organiserSites } : {}),
            ...(current.organiserSystemHistory ? { organiserSystemHistory: current.organiserSystemHistory } : {}),
            ...(current.pursuitDistances ? { pursuitDistances: current.pursuitDistances } : {}),
          };
          store.setSession(store.me?.role === 'gm' ? composed : stripGmNavigationProjection(composed));
        },
        onPlayerDiscovery: (projection) => {
          if (!callbackCurrent()) return;
          const store = useSessionStore.getState();
          const current = store.session;
          if (!current || current.id !== sessionId) return;
          if (store.me?.role === 'gm' && current.organiserSystems !== undefined) {
            const next = { ...current };
            if (projection) next.playerDiscovery = projection;
            else delete next.playerDiscovery;
            store.setSession(next);
            return;
          }
          if (!projection) {
            store.setSession(stripNavigationProjection(current));
            return;
          }
          const entitledShipId = effectivePlayerShip(store.me);
          if (!entitledShipId || projection.shipId !== entitledShipId) return;
          const shipId = projection.shipId;
          const withoutPreviousDiscovery = stripNavigationProjection(current);
          store.setSession({
            ...withoutPreviousDiscovery,
            playerDiscovery: projection,
            ...(shipId && projection.currentCoordinate
              ? { shipGalacticCoordinates: { [shipId]: projection.currentCoordinate } }
              : {}),
            ...(shipId
              ? { shipNavigationLogs: { [shipId]: projection.navigationLogs } }
              : {}),
          });
        },
        onGmDiscovery: (projection) => {
          if (!callbackCurrent()) return;
          const store = useSessionStore.getState();
          const current = store.session;
          if (!current || current.id !== sessionId) return;
          pendingGmDiscovery = projection;
          if (!projection) {
            store.setSession(stripGmNavigationProjection(current));
            return;
          }
          if (store.me?.role === 'gm') store.setSession({ ...current, ...projection });
        },
        onSessionFreshness: (fresh) => {
          if (!callbackCurrent()) return;
          const store = useSessionStore.getState();
          store.setSessionSnapshotFreshness(fresh ? 'server' : 'cache');
          store.setConnection(fresh ? 'live' : 'offline');
        },
        onPlayer: (next) => {
          if (!callbackCurrent()) return;
          const store = useSessionStore.getState();
          const previousEntitlement = playerEntitlementKey(store.me);
          const previousWolfCultIdentity = store.me
            ? `${store.me.uid}:${store.me.role}:${store.me.assignedRoleId ?? ''}:${store.me.replacementRoleId ?? ''}`
            : '';
          const nextWolfCultIdentity = `${next.uid}:${next.role}:${next.assignedRoleId ?? ''}:${next.replacementRoleId ?? ''}`;
          const nextEntitlement = playerEntitlementKey(next);
          if (playerAuthorityKey(next) !== listenerAuthorityKey) {
            store.setFacilitatorRuleCall(null);
          }
          playerProjectionFresh = false;
          store.setMe(next);
          if (previousWolfCultIdentity !== nextWolfCultIdentity || next.role !== 'player') {
            clearWolfCultIntelligence();
          }
          if (previousEntitlement !== nextEntitlement) {
            retainArbourVisionForEntitlementChange();
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
          const effectiveBriefRoleId = next.replacementRoleId ?? next.assignedRoleId;
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
            if (current?.id === sessionId) store.setSession({ ...current, ...pendingGmDiscovery });
          }
        },
        onPlayerFreshness: (fresh) => {
          if (!callbackCurrent()) return;
          playerProjectionFresh = fresh;
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
          if (wolfCultBlocked || store.me?.role !== 'player') {
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
          if (store.me?.uid !== next.assignmentUid) {
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
        onError: () => { if (callbackCurrent()) useSessionStore.getState().setConnection('offline'); },
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
      unsubscribe();
    };
  }, [playerAuthority, playerRole, playerUid, sessionId]);

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
      <CommunicationError />
      <UnrestAlert />
      <PopulationAlert />
      <ScreenFade>
        {(screen) => (
          <>
            <PrivateLoyaltyPanel />
            <CrisisReportPanel />
            <AwayMissionDiscardPanel />
            {escapeLocked ? <EscapeState /> : <Routes location={screen}>
              <Route path="/" element={home} />
              <Route path="/roles" element={<RoleSelect />} />
              <Route path="/brief" element={<RoleBrief />} />
              <Route path="/escape" element={<EscapeState />} />
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
    const renewPresence = () => refreshPresence().catch(() => {
      useSessionStore.getState().setConnection('offline');
    });
    const stopVersionMonitor = startVersionUpgradeMonitor({
      reconnect: () => run(connect),
      onUpdateAvailable: markServiceWorkerUpdateAvailable,
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
