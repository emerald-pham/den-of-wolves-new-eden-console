import {
  collection,
  connectFirestoreEmulator,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  limit,
  query,
  where,
  type DocumentData,
  type Unsubscribe,
  type Firestore,
} from 'firebase/firestore';
import { app } from './firebase';
import { emulatorPorts, useEmulators } from './firebaseConfig';
import type {
  DamageDraw,
  GameSession,
  GmInstance,
  Player,
  PrivateLoyalty,
  Seat,
  SessionSetup,
  SessionChartId,
  SessionExpansionMode,
  SessionEvent,
  ShipJumpStates,
  ShipJumpTransitions,
  ShipNavigationLogs,
  SetupReceipt,
} from '@/types/game';
import { DEFAULT_ACTIVE_ROLE_IDS } from '@/data/roles';
import { ROLE_SEAT_METADATA } from '@/data/seatMetadata';
import {
  normalizeShuttleManifest,
} from '@/data/shuttles';
import {
  INITIAL_SHIP_CONSOLE_LOCKS,
  INITIAL_SHIP_GALACTIC_COORDINATES,
  INITIAL_SHIP_JUMP_STATES,
  INITIAL_SHIP_JUMP_TRANSITIONS,
} from '@/data/ships';
import { shipResources, shipUnrest } from '@/data/resources';
import { INITIAL_SHIP_SURVIVORS } from '@/data/shipPopulation';
import { normalizePressDispatch } from './pressDispatchState';
import { normalizeDisplayName } from './displayName';
import { turnPhaseState } from './turnPhase';

let firestore: Firestore | undefined;

export function db(): Firestore {
  if (!firestore) {
    // The persisted Zustand snapshot and short-lived outbox own offline state;
    // Firestore's listener reconnect supplies fresh server authority.
    firestore = getFirestore(app());
    if (useEmulators) connectFirestoreEmulator(firestore, '127.0.0.1', emulatorPorts.firestore);
  }
  return firestore;
}

function iso(value: unknown): string {
  if (
    typeof value === 'object' && value !== null && 'toDate' in value &&
    typeof value.toDate === 'function'
  ) return (value.toDate() as Date).toISOString();
  return new Date().toISOString();
}

function privateLoyalty(value: unknown): PrivateLoyalty | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  if (typeof payload.kind !== 'string' ||
      (typeof payload.suspicion !== 'number' && payload.suspicion !== null)) return null;
  return {
    kind: payload.kind,
    suspicion: payload.suspicion,
    ...(typeof payload.partnerUid === 'string' ? { partnerUid: payload.partnerUid } : {}),
  };
}

function setupReceipt(value: unknown): SetupReceipt | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.source !== 'string' || typeof raw.version !== 'string' ||
    typeof raw.playerCount !== 'number' || !Array.isArray(raw.rosterIds) ||
    typeof raw.wolfCount !== 'number' || (raw.wolfCount !== 1 && raw.wolfCount !== 2) ||
    !Array.isArray(raw.selectedWolfRoleIds) || !Array.isArray(raw.eligibleRoleIds) ||
    typeof raw.resultCount !== 'number' ||
    (raw.loyaltySource !== 'automatic-default' && raw.loyaltySource !== 'explicit-preserved') ||
    typeof raw.expectedSetupRevision !== 'number' || typeof raw.committedSetupRevision !== 'number' ||
    typeof raw.actorUid !== 'string' || typeof raw.serverTime !== 'string' || typeof raw.event !== 'string'
  ) return null;
  return raw as unknown as SetupReceipt;
}

function turnStartAnnouncement(value: unknown): GameSession['turnStartAnnouncement'] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const announcement = value as Readonly<Record<string, unknown>>;
  const turn = announcement.turn;
  const survivorPopulation = announcement.survivorPopulation;
  const revision = announcement.revision;
  if (
    typeof turn !== 'number' || !Number.isSafeInteger(turn) || turn < 1 ||
    typeof survivorPopulation !== 'number' || !Number.isSafeInteger(survivorPopulation) ||
    survivorPopulation < 0 ||
    (revision !== undefined &&
      (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0))
  ) return undefined;
  return {
    turn,
    survivorPopulation,
    ...(revision === undefined ? {} : { revision }),
  };
}

function debriefMode(value: unknown): NonNullable<GameSession['debriefMode']> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { active: false, revision: 0 };
  }
  const state = value as Readonly<Record<string, unknown>>;
  if (
    typeof state.active !== 'boolean' ||
    typeof state.revision !== 'number' || !Number.isSafeInteger(state.revision) ||
    state.revision < 0
  ) return { active: false, revision: 0 };
  return { active: state.active, revision: state.revision };
}

function shipNavigationLogs(value: unknown): ShipNavigationLogs {
  const stored = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return Object.fromEntries(Object.keys(INITIAL_SHIP_CONSOLE_LOCKS).map((shipId) => [
    shipId,
    Array.isArray(stored[shipId]) ? stored[shipId] : [],
  ]));
}

function shipConsoleLocks(value: unknown): NonNullable<GameSession['shipConsoleLocks']> {
  const stored = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return Object.fromEntries(Object.keys(INITIAL_SHIP_CONSOLE_LOCKS).map((shipId) => [
    shipId,
    stored[shipId] === true,
  ]));
}

function shipJumpStates(value: unknown): ShipJumpStates {
  const stored = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return Object.fromEntries(Object.keys(INITIAL_SHIP_JUMP_STATES).map((shipId) => {
    const state = stored[shipId];
    if (typeof state !== 'object' || state === null || Array.isArray(state)) return [shipId, {}];
    const raw = state as Record<string, unknown>;
    const lock = raw.integrityLockedUntil;
    const integrityLockedUntil = lock && typeof (lock as { toDate?: unknown }).toDate === 'function'
      ? iso(lock)
      : typeof lock === 'string' ? lock : undefined;
    return [shipId, {
      ...(typeof raw.lastJumpTurn === 'number' && Number.isSafeInteger(raw.lastJumpTurn) && raw.lastJumpTurn >= 1
        ? { lastJumpTurn: raw.lastJumpTurn }
        : {}),
      ...(integrityLockedUntil ? { integrityLockedUntil } : {}),
    }];
  })) as ShipJumpStates;
}

function shipJumpTransitions(value: unknown): ShipJumpTransitions {
  const stored = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return Object.fromEntries(Object.keys(INITIAL_SHIP_JUMP_TRANSITIONS).flatMap((shipId) => {
    const transition = stored[shipId];
    if (typeof transition !== 'object' || transition === null || Array.isArray(transition)) return [];
    const raw = transition as Record<string, unknown>;
    const occurredAtValue = raw.occurredAt;
    const occurredAt = occurredAtValue && typeof (occurredAtValue as { toDate?: unknown }).toDate === 'function'
      ? iso(occurredAtValue)
      : typeof occurredAtValue === 'string' ? occurredAtValue : undefined;
    if (
      typeof raw.id !== 'string' || typeof raw.shipId !== 'string' ||
      typeof raw.origin !== 'string' || typeof raw.destination !== 'string' || !occurredAt
    ) return [];
    return [[shipId, {
      id: raw.id,
      shipId: raw.shipId,
      origin: raw.origin,
      destination: raw.destination,
      occurredAt,
    }]];
  })) as ShipJumpTransitions;
}

function pursuitGroups(value: unknown): Readonly<Record<string, number>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const result: Record<string, number> = {};
  for (const [group, amount] of Object.entries(value as Record<string, unknown>)) {
    if (typeof amount === 'number' && Number.isSafeInteger(amount) && amount >= 0) {
      result[group] = amount;
    }
  }
  return result;
}

function sessionSetup(value: unknown): SessionSetup | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const playerCount = raw.playerCount;
  const chartId = raw.chartId;
  const expansion = raw.expansion;
  const turnLimit = raw.turnLimit;
  const activeRoleIds = raw.activeRoleIds;
  const activeVesselIds = raw.activeVesselIds;
  if (
    typeof playerCount !== 'number' || !Number.isSafeInteger(playerCount) || playerCount < 8 || playerCount > 20 ||
    !(['A', 'B', 'C'] as readonly string[]).includes(String(chartId)) ||
    !(['base', 'capybara', 'none'] as readonly string[]).includes(String(expansion)) ||
    !([6, 7, 8] as readonly number[]).includes(Number(turnLimit)) ||
    typeof raw.dioneEnabled !== 'boolean' || typeof raw.capybaraEnabled !== 'boolean' ||
    !Array.isArray(activeRoleIds) || activeRoleIds.some((roleId) => typeof roleId !== 'string') ||
    !Array.isArray(activeVesselIds) || activeVesselIds.some((vesselId) => typeof vesselId !== 'string')
  ) return undefined;
  return {
    playerCount,
    chartId: chartId as SessionChartId,
    expansion: expansion as SessionExpansionMode,
    turnLimit: turnLimit as SessionSetup['turnLimit'],
    dioneEnabled: raw.dioneEnabled,
    capybaraEnabled: raw.capybaraEnabled,
    activeRoleIds: [...activeRoleIds] as string[],
    activeVesselIds: [...activeVesselIds] as string[],
  };
}

export function sessionFrom(id: string, data: DocumentData): GameSession {
  const dradisContactTriggeredAt = data.dradisContactTriggeredAt;
  const announcement = turnStartAnnouncement(data.turnStartAnnouncement);
  const phaseClock = turnPhaseState(data.turnPhase);
  const playerCount = Number.isSafeInteger(data.playerCount) && data.playerCount >= 8 && data.playerCount <= 20
    ? data.playerCount as number
    : undefined;
  const setup = sessionSetup(data.setup);
  const hasActiveRoleIds = Array.isArray(data.activeRoleIds) || Boolean(setup);
  const activeRoleIds = hasActiveRoleIds
    ? (Array.isArray(data.activeRoleIds) ? data.activeRoleIds : setup?.activeRoleIds) as string[]
    : DEFAULT_ACTIVE_ROLE_IDS;
  const shuttleManifest = normalizeShuttleManifest(
    Array.isArray(data.shuttleDockings) ? data.shuttleDockings : undefined,
    Array.isArray(data.shuttleVisitLog) ? data.shuttleVisitLog : undefined,
    hasActiveRoleIds ? activeRoleIds : undefined,
    playerCount,
  );
  return {
    id,
    name: data.name as string,
    joinCode: data.joinCode as string,
    phase: data.phase as GameSession['phase'],
    currentTurn: Number.isSafeInteger(data.currentTurn) && data.currentTurn >= 0 ? data.currentTurn as number : 1,
    ...(playerCount === undefined ? {} : { playerCount }),
    ...(data.chartId === 'A' || data.chartId === 'B' || data.chartId === 'C'
      ? { chartId: data.chartId } : {}),
    ...(data.expansion === 'base' || data.expansion === 'capybara' || data.expansion === 'none'
      ? { expansion: data.expansion } : {}),
    ...(data.turnLimit === 6 || data.turnLimit === 7 || data.turnLimit === 8
      ? { turnLimit: data.turnLimit } : {}),
    ...(typeof data.configurationLocked === 'boolean'
      ? { configurationLocked: data.configurationLocked } : {}),
    ...(Number.isSafeInteger(data.setupRevision) && data.setupRevision >= 0
      ? { setupRevision: data.setupRevision as number } : {}),
    ...(setup ? { setup, activeVesselIds: [...setup.activeVesselIds] } :
      Array.isArray(data.activeVesselIds)
        ? { activeVesselIds: data.activeVesselIds.filter((vesselId): vesselId is string => typeof vesselId === 'string') }
        : {}),
    ...(announcement ? { turnStartAnnouncement: announcement } : {}),
    ...(phaseClock ? { turnPhase: phaseClock } : {}),
    capybaraEnabled: data.capybaraEnabled !== false,
    dioneEnabled: data.dioneEnabled !== false,
    pressEnabled: data.pressEnabled !== false,
    pressAvailabilityRevision:
      Number.isSafeInteger(data.pressAvailabilityRevision) && data.pressAvailabilityRevision >= 0
        ? data.pressAvailabilityRevision as number
        : 0,
    shipGalacticCoordinates:
      typeof data.shipGalacticCoordinates === 'object' && data.shipGalacticCoordinates !== null
        ? { ...INITIAL_SHIP_GALACTIC_COORDINATES, ...data.shipGalacticCoordinates as Record<string, string> }
        : INITIAL_SHIP_GALACTIC_COORDINATES,
    shipNavigationLogs: shipNavigationLogs(data.shipNavigationLogs),
    shipConsoleLocks: shipConsoleLocks(data.shipConsoleLocks),
    shipJumpStates: shipJumpStates(data.shipJumpStates),
    shipJumpTransitions: shipJumpTransitions(data.shipJumpTransitions),
    pursuitGroups: pursuitGroups(data.pursuitGroups),
    fleetRedAlert: data.fleetRedAlert ?? { active: false, revision: 0 },
    debriefMode: debriefMode(data.debriefMode),
    pressDispatch: normalizePressDispatch(data.pressDispatch),
    maintenanceCycles: data.maintenanceCycles ?? {},
    shuttleCargo: data.shuttleCargo ?? {},
    shuttleFuelled: data.shuttleFuelled ?? {},
    shipUpgrades: data.shipUpgrades ?? {},
    shipResources: shipResources(data.shipResources),
    shipDamage: typeof data.shipDamage === 'object' && data.shipDamage !== null
      ? data.shipDamage as NonNullable<GameSession['shipDamage']>
      : {},
    shipUnrest: shipUnrest(data.shipUnrest),
    shipSurvivors: typeof data.shipSurvivors === 'object' && data.shipSurvivors !== null
      ? data.shipSurvivors as NonNullable<GameSession['shipSurvivors']>
      : INITIAL_SHIP_SURVIVORS,
    populationAlerts: typeof data.populationAlerts === 'object' && data.populationAlerts !== null
      ? data.populationAlerts as NonNullable<GameSession['populationAlerts']> : {},
    unrestAlerts:
      typeof data.unrestAlerts === 'object' && data.unrestAlerts !== null
        ? data.unrestAlerts as NonNullable<GameSession['unrestAlerts']>
        : {},
    gmControlsLocked: data.gmControlsLocked === true,
    activeRoleIds,
    shuttleDockings: shuttleManifest.dockings,
    shuttleVisitLog: shuttleManifest.visits,
    confettiUsedShipIds: Array.isArray(data.confettiUsedShipIds)
      ? data.confettiUsedShipIds as string[]
      : [],
    ...(dradisContactTriggeredAt && typeof dradisContactTriggeredAt.toDate === 'function'
      ? { dradisContactTriggeredAt: iso(dradisContactTriggeredAt) }
      : {}),
    ownerUid: data.ownerUid as string,
    createdAt: iso(data.createdAt),
    updatedAt: iso(data.updatedAt),
  };
}

function playerFrom(sessionId: string, uid: string, data: DocumentData): Player {
  return {
    uid,
    sessionId,
    displayName: normalizeDisplayName(data.displayName),
    role: data.role as Player['role'],
    seatId: (data.seatId as string | null) ?? null,
    ...(typeof data.assignedRoleId === 'string' || data.assignedRoleId === null
      ? { assignedRoleId: data.assignedRoleId as string | null } : {}),
    ...(typeof data.shipPreferenceId === 'string' || data.shipPreferenceId === null
      ? { shipPreferenceId: data.shipPreferenceId as string | null } : {}),
    activeConsoleRoleId: (data.activeConsoleRoleId as string | null) ?? null,
    joinedAt: iso(data.joinedAt),
  };
}

function seatFrom(sessionId: string, id: string, data: DocumentData): Seat {
  const roleId = typeof data.roleId === 'string' ? data.roleId : id;
  const metadata = ROLE_SEAT_METADATA[roleId];
  return {
    id,
    sessionId,
    roleId,
    label: typeof data.label === 'string' ? data.label : metadata?.label ?? roleId,
    factionId: typeof data.factionId === 'string' || data.factionId === null
      ? data.factionId as string | null
      : metadata?.factionId ?? null,
    status: data.status as Seat['status'],
    holderUid: (data.holderUid as string | null) ?? null,
    claimedAt: data.claimedAt ? iso(data.claimedAt) : null,
  };
}

function gmInstanceFrom(
  sessionId: string,
  id: string,
  data: DocumentData,
  promoteSoleLegacyResponsibility = false,
): GmInstance {
  const hasCanonicalResponsibilities = Array.isArray(data.responsibilities);
  const storedResponsibilities = hasCanonicalResponsibilities
    ? data.responsibilities.filter((responsibility: unknown): responsibility is 'main' | 'assistant' =>
      responsibility === 'main' || responsibility === 'assistant')
    : data.responsibility === 'main' || data.responsibility === 'assistant'
      ? [data.responsibility]
      : [];
  const responsibilities = promoteSoleLegacyResponsibility && !hasCanonicalResponsibilities &&
    storedResponsibilities.length === 1
    ? ['main', 'assistant'] as const
    : storedResponsibilities;
  return {
    id,
    sessionId,
    uid: data.uid as string,
    name: data.name as string,
    deviceLabel: data.deviceLabel as string,
    ...(data.responsibility === 'main' || data.responsibility === 'assistant'
      ? { responsibility: data.responsibility } : {}),
    ...(responsibilities.length > 0 ? { responsibilities } : {}),
    claimedAt: iso(data.claimedAt),
  };
}

export interface SessionStateHandlers {
  readonly onSession: (session: GameSession) => void;
  readonly onPlayer: (player: Player) => void;
  readonly onKicked: () => void;
  readonly onSeats: (seats: readonly Seat[]) => void;
  readonly onPrivateLoyalty?: (loyalty: PrivateLoyalty | null) => void;
  readonly onSetupReceipt?: (receipt: SetupReceipt | null) => void;
  readonly onError: () => void;
}

/** Keep the local snapshot current while Firestore handles reconnect/cache replay. */
export function subscribeSessionState(
  sessionId: string,
  uid: string,
  handlers: SessionStateHandlers,
): Unsubscribe {
  const database = db();
  const unsubscribes = [
    onSnapshot(doc(database, `sessions/${sessionId}`), (snapshot) => {
      if (snapshot.exists()) handlers.onSession(sessionFrom(snapshot.id, snapshot.data()));
      else handlers.onError();
    }, handlers.onError),
    onSnapshot(doc(database, `sessions/${sessionId}/players/${uid}`), (snapshot) => {
      if (snapshot.exists() && snapshot.get('kickedAt')) {
        handlers.onKicked();
      } else if (snapshot.exists() && snapshot.get('connected') === true) {
        handlers.onPlayer(playerFrom(sessionId, uid, snapshot.data()));
      } else handlers.onError();
    }, handlers.onError),
    onSnapshot(collection(database, `sessions/${sessionId}/seats`), (snapshot) => {
      handlers.onSeats(snapshot.docs
        .map((seat) => seatFrom(sessionId, seat.id, seat.data()))
        .filter((seat) => seat.roleId !== 'press-officer'));
    }, handlers.onError),
    ...(handlers.onPrivateLoyalty ? [onSnapshot(
      doc(database, `sessions/${sessionId}/secrets/loyalty-${uid}`),
      (snapshot) => handlers.onPrivateLoyalty?.(
        snapshot.exists() ? privateLoyalty(snapshot.get('payload')) : null,
      ),
      handlers.onError,
    )] : []),
    ...(handlers.onSetupReceipt ? [onSnapshot(
      query(
        collection(database, `sessions/${sessionId}/secrets`),
        where('visibleToUids', 'array-contains', uid),
      ),
      (snapshot) => {
        const latest = snapshot.docs
          .map((secret) => setupReceipt(secret.get('payload')))
          .filter((receipt): receipt is SetupReceipt => receipt !== null)
          .sort((left, right) => left.committedSetupRevision - right.committedSetupRevision)
          .at(-1) ?? null;
        handlers.onSetupReceipt?.(latest);
      },
      handlers.onError,
    )] : []),
  ];
  return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
}

export function subscribeGmInstances(
  sessionId: string,
  onInstances: (instances: readonly GmInstance[]) => void,
  onError: () => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db(), `sessions/${sessionId}/gmInstances`), orderBy('claimedAt', 'asc')),
    (snapshot) => onInstances(snapshot.docs.map((instance) =>
      gmInstanceFrom(sessionId, instance.id, instance.data(), snapshot.docs.length === 1))),
    onError,
  );
}

export function subscribeConnectedPlayers(
  sessionId: string,
  onPlayers: (players: readonly Player[]) => void,
  onError: () => void = () => undefined,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db(), `sessions/${sessionId}/players`),
      where('connected', '==', true),
    ),
    (snapshot) => onPlayers(snapshot.docs.map((player) =>
      playerFrom(sessionId, player.id, player.data()))),
    onError,
  );
}

export function subscribeShipConfetti(
  sessionId: string,
  shipId: string,
  onPop: (sourceShipId: string, actorRoleName?: string, actorName?: string) => void,
  onError: () => void = () => undefined,
): Unsubscribe {
  let initial = true;
  let lastSignal: string | null = null;
  return onSnapshot(
    doc(db(), `sessions/${sessionId}/shipConfetti/${shipId}`),
    (snapshot) => {
      const signal = snapshot.exists() ? iso(snapshot.get('createdAt')) : null;
      const sourceShipId = snapshot.exists() ? String(snapshot.get('shipId')) : shipId;
      const actorRoleName = snapshot.exists() ? String(snapshot.get('actorRoleName')) : '';
      const actorName = snapshot.exists() ? String(snapshot.get('actorName')) : '';
      if (initial) {
        initial = false;
        lastSignal = signal;
        if (signal && Date.now() - Date.parse(signal) < 5_000) {
          onPop(sourceShipId, actorRoleName, actorName);
        }
        return;
      }
      if (signal && signal !== lastSignal) onPop(sourceShipId, actorRoleName, actorName);
      lastSignal = signal;
    },
    onError,
  );
}

export function subscribeSessionEvents(
  sessionId: string,
  onEvents: (events: readonly SessionEvent[]) => void,
  onError: () => void = () => undefined,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db(), `sessions/${sessionId}/events`),
      orderBy('createdAt', 'desc'),
      limit(30),
    ),
    (snapshot) => onEvents(snapshot.docs.flatMap<SessionEvent>((event) => {
      const data = event.data();
      if (data.type === 'fullscreen-alert') return [{
        id: event.id,
        sessionId,
        type: 'fullscreen-alert' as const,
        sourceRoleName: data.sourceRoleName as string,
        message: data.message as string,
        createdAt: iso(data.createdAt),
      }];
      if (data.type === 'maintenance' && (data.action === 'begin' || data.action === 'end')) return [{
        id: event.id,
        sessionId,
        type: 'maintenance' as const,
        shipId: data.shipId as string,
        shipName: data.shipName as string,
        action: data.action,
        createdAt: iso(data.createdAt),
      }];
      if (
        data.type === 'timer-pause' &&
        (data.action === 'paused' || data.action === 'resumed') &&
        (data.window === 'restricted' || data.window === 'open') &&
        typeof data.turn === 'number' && Number.isSafeInteger(data.turn) && data.turn >= 1
      ) return [{
        id: event.id,
        sessionId,
        type: 'timer-pause' as const,
        action: data.action,
        turn: data.turn,
        window: data.window,
        actorName: typeof data.actorName === 'string' ? data.actorName : 'GM',
        createdAt: iso(data.createdAt),
      }];
      if (data.type !== 'ship-confetti') return [];
      return [{
        id: event.id,
        sessionId,
        type: 'ship-confetti' as const,
        shipId: data.shipId as string,
        shipName: data.shipName as string,
        actorName: data.actorName as string,
        actorRoleName: data.actorRoleName as string,
        createdAt: iso(data.createdAt),
      }];
    })),
    onError,
  );
}

export function subscribeDamageDraws(
  sessionId: string,
  onDraws: (draws: readonly DamageDraw[]) => void,
  onError: () => void = () => undefined,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db(), `sessions/${sessionId}/damageDraws`),
      orderBy('createdAt', 'desc'),
      limit(30),
    ),
    (snapshot) => onDraws(snapshot.docs.flatMap<DamageDraw>((draw) => {
      const data = draw.data();
      if (data.type === 'ship-destroyed') return [{
        id: draw.id,
        sessionId,
        type: 'ship-destroyed' as const,
        shipId: data.shipId as string,
        createdAt: iso(data.createdAt),
      }];
      if (data.type !== 'ship-damage') return [];
      return [{
        id: draw.id,
        sessionId,
        type: 'ship-damage' as const,
        shipId: data.shipId as string,
        card: data.card as string,
        systemId: data.systemId as string,
        systemName: data.systemName as string,
        recycled: data.recycled === true,
        createdAt: iso(data.createdAt),
      }];
    })),
    onError,
  );
}
