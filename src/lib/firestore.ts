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
  PopulationAlert,
  Player,
  PrivateLoyalty,
  RoleBrief,
  Seat,
  SessionSetup,
  SessionChartId,
  SessionExpansionMode,
  SessionEvent,
  ShuttleDocking,
  ShuttleVisit,
  ShipNavigationLogEntry,
  ShipJumpStates,
  ShipJumpTransitions,
  ShipNavigationLogs,
  SetupReceipt,
  UnrestAlert,
} from '@/types/game';
import type { EntityId, EntityKind } from '@/types/identifiers';
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
import { parseMaintenanceEvent } from './maintenanceEvent';
import { useSessionStore } from '@/store/useSessionStore';
import { entityId, parseEntityId } from '@/types/identifiers';
import {
  acceptServerSessionAuthority,
  createSessionSnapshotAuthority,
  sessionSnapshotAuthorityFor,
  trustedTimestampCursor,
  type ServerAuthorityCursor,
  type SessionSnapshotAuthority,
} from './sessionSnapshotAuthority';

export {
  acceptCallableSessionAuthority,
  createSessionSnapshotAuthority,
  sessionSnapshotAuthorityFor,
  sessionSnapshotAuthorityVersion,
  type SessionSnapshotAuthority,
} from './sessionSnapshotAuthority';

let firestore: Firestore | undefined;

function projectionSessionAuthority(
  sessionId: string,
  supplied: SessionSnapshotAuthority | undefined,
): SessionSnapshotAuthority | undefined {
  if (supplied) return supplied;
  const store = useSessionStore.getState();
  const uid = store.me?.uid ?? store.gmInstance?.uid;
  return uid ? sessionSnapshotAuthorityFor(sessionId, uid) : undefined;
}

function serverAuthorityCursor(
  snapshot: { readonly data: () => DocumentData },
  data: DocumentData,
): ServerAuthorityCursor | undefined {
  const documentSnapshot = snapshot as { readonly updateTime?: unknown; readonly data: () => DocumentData };
  return trustedTimestampCursor(documentSnapshot.updateTime) ??
    trustedTimestampCursor(data.updatedAt);
}

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

function parseEntityIdArray<K extends EntityKind>(kind: K, value: unknown): readonly EntityId<K>[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const parsed = value.map((id) => parseEntityId(kind, id));
  return parsed.every((id): id is EntityId<K> => id !== undefined) ? parsed : undefined;
}

function privateLoyalty(value: unknown): PrivateLoyalty | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  const partnerUid = payload.partnerUid === undefined || payload.partnerUid === null
    ? undefined
    : parseEntityId('player', payload.partnerUid);
  if (typeof payload.kind !== 'string' ||
      (typeof payload.suspicion !== 'number' && payload.suspicion !== null) ||
      (payload.partnerUid !== undefined && payload.partnerUid !== null && !partnerUid)) return null;
  return {
    kind: payload.kind,
    suspicion: payload.suspicion,
    ...(partnerUid ? { partnerUid } : {}),
  };
}

function roleBrief(value: unknown, sessionId: string, uid: string): RoleBrief | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const assignmentUid = parseEntityId('player', raw.assignmentUid);
  const roleId = parseEntityId('role', raw.roleId);
  if (
    raw.type !== 'role-brief' || assignmentUid !== uid ||
    raw.sessionId !== sessionId || !roleId ||
    typeof raw.roleName !== 'string' || raw.roleName.trim().length === 0 ||
    typeof raw.vesselName !== 'string' || raw.vesselName.trim().length === 0 ||
    typeof raw.text !== 'string' || raw.text.trim().length === 0 ||
    typeof raw.commonRules !== 'string' || raw.commonRules.trim().length === 0 ||
    typeof raw.setupRevision !== 'number' ||
    !Number.isSafeInteger(raw.setupRevision) || raw.setupRevision < 0
  ) return null;
  return {
    assignmentUid,
    roleId,
    roleName: raw.roleName,
    vesselName: raw.vesselName,
    text: raw.text,
    commonRules: raw.commonRules,
    setupRevision: raw.setupRevision,
  };
}

function setupReceipt(value: unknown): SetupReceipt | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const rosterIds = parseEntityIdArray('role', raw.rosterIds);
  const selectedWolfRoleIds = parseEntityIdArray('role', raw.selectedWolfRoleIds);
  const eligibleRoleIds = parseEntityIdArray('role', raw.eligibleRoleIds);
  const actorUid = parseEntityId('player', raw.actorUid);
  if (
    typeof raw.source !== 'string' ||
    typeof raw.playerCount !== 'number' || !rosterIds ||
    typeof raw.wolfCount !== 'number' || (raw.wolfCount !== 1 && raw.wolfCount !== 2) ||
    !selectedWolfRoleIds || !eligibleRoleIds ||
    typeof raw.resultCount !== 'number' ||
    (raw.loyaltySource !== 'automatic-default' && raw.loyaltySource !== 'explicit-preserved') ||
    typeof raw.expectedSetupRevision !== 'number' || typeof raw.committedSetupRevision !== 'number' ||
    !actorUid || typeof raw.serverTime !== 'string' || typeof raw.event !== 'string'
  ) return null;
  return {
    ...raw,
    rosterIds,
    selectedWolfRoleIds,
    eligibleRoleIds,
    actorUid,
  } as unknown as SetupReceipt;
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
    Array.isArray(stored[shipId])
      ? stored[shipId].flatMap((entry) => {
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return [];
        const raw = entry as Record<string, unknown>;
        const id = parseEntityId('event', raw.id);
        const entryShipId = parseEntityId('vessel', raw.shipId);
        const subjectShipId = raw.subjectShipId === undefined
          ? undefined
          : parseEntityId('vessel', raw.subjectShipId);
        const occurredAtValue = raw.occurredAt;
        const occurredAt = occurredAtValue && typeof (occurredAtValue as { toDate?: unknown }).toDate === 'function'
          ? iso(occurredAtValue)
          : typeof occurredAtValue === 'string' ? occurredAtValue : undefined;
        if (!id || !entryShipId || entryShipId !== shipId ||
            (raw.subjectShipId !== undefined && !subjectShipId) ||
            (raw.type !== 'self-jump' && raw.type !== 'ship-jump-away' && raw.type !== 'ship-jump-arrival') ||
            typeof raw.origin !== 'string' || typeof raw.destination !== 'string' ||
            !occurredAt || typeof raw.stardate !== 'string') return [];
        return [{
          id,
          shipId: entryShipId,
          type: raw.type,
          origin: raw.origin,
          destination: raw.destination,
          ...(subjectShipId ? { subjectShipId } : {}),
          ...(typeof raw.subjectShipName === 'string' ? { subjectShipName: raw.subjectShipName } : {}),
          ...(typeof raw.navigationalError === 'boolean' ? { navigationalError: raw.navigationalError } : {}),
          occurredAt,
          stardate: raw.stardate,
        } satisfies ShipNavigationLogEntry];
      })
      : [],
  ])) as ShipNavigationLogs;
}

function alertMap<T extends UnrestAlert | PopulationAlert>(value: unknown, population: boolean): Readonly<Record<string, T>> {
  const stored = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return Object.fromEntries(Object.entries(stored).flatMap(([key, value]) => {
    const wireKey = parseEntityId('vessel', key);
    if (!wireKey || typeof value !== 'object' || value === null || Array.isArray(value)) return [];
    const raw = value as Record<string, unknown>;
    const shipId = parseEntityId('vessel', raw.shipId);
    if (!shipId || shipId !== wireKey || typeof raw.shipName !== 'string' ||
        !Array.isArray(raw.targetGmInstanceIds) ||
        raw.targetGmInstanceIds.some((id) => typeof id !== 'string') ||
        (population && typeof raw.population !== 'number')) return [];
    return [[key, { ...raw, shipId } as T]];
  })) as Readonly<Record<string, T>>;
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
  return Object.fromEntries(Object.keys(INITIAL_SHIP_JUMP_TRANSITIONS).flatMap((shipIdKey) => {
    const transition = stored[shipIdKey];
    if (typeof transition !== 'object' || transition === null || Array.isArray(transition)) return [];
    const raw = transition as Record<string, unknown>;
    const occurredAtValue = raw.occurredAt;
    const occurredAt = occurredAtValue && typeof (occurredAtValue as { toDate?: unknown }).toDate === 'function'
      ? iso(occurredAtValue)
      : typeof occurredAtValue === 'string' ? occurredAtValue : undefined;
    const id = parseEntityId('event', raw.id);
    const shipId = parseEntityId('vessel', raw.shipId);
    if (
      !id || !shipId ||
      typeof raw.origin !== 'string' || typeof raw.destination !== 'string' || !occurredAt
    ) return [];
    return [[shipIdKey, {
      id,
      shipId,
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
  const parsedRoleIds = parseEntityIdArray('role', activeRoleIds);
  const parsedVesselIds = parseEntityIdArray('vessel', activeVesselIds);
  if (
    typeof playerCount !== 'number' || !Number.isSafeInteger(playerCount) || playerCount < 8 || playerCount > 20 ||
    !(['A', 'B', 'C'] as readonly string[]).includes(String(chartId)) ||
    !(['base', 'capybara', 'none'] as readonly string[]).includes(String(expansion)) ||
    !([6, 7, 8] as readonly number[]).includes(Number(turnLimit)) ||
    typeof raw.dioneEnabled !== 'boolean' || typeof raw.capybaraEnabled !== 'boolean' ||
    (raw.universalArbourEnabled !== undefined && typeof raw.universalArbourEnabled !== 'boolean') ||
    (raw.wolfCultEnabled !== undefined && typeof raw.wolfCultEnabled !== 'boolean') ||
    !parsedRoleIds || !parsedVesselIds
  ) return undefined;
  return {
    playerCount,
    chartId: chartId as SessionChartId,
    expansion: expansion as SessionExpansionMode,
    turnLimit: turnLimit as SessionSetup['turnLimit'],
    dioneEnabled: raw.dioneEnabled,
    capybaraEnabled: raw.capybaraEnabled,
    universalArbourEnabled: raw.universalArbourEnabled === true,
    wolfCultEnabled: raw.wolfCultEnabled === true,
    activeRoleIds: parsedRoleIds,
    activeVesselIds: parsedVesselIds,
  };
}

function shuttleDocking(value: unknown): ShuttleDocking | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const shuttleId = parseEntityId('shuttle', raw.shuttleId);
  const shipId = parseEntityId('vessel', raw.shipId);
  if (!shuttleId || !shipId || typeof raw.dockedAt !== 'string') return undefined;
  return { shuttleId, shipId, dockedAt: raw.dockedAt };
}

function shuttleVisit(value: unknown): ShuttleVisit | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const id = parseEntityId('event', raw.id);
  const shuttleId = parseEntityId('shuttle', raw.shuttleId);
  const shipId = parseEntityId('vessel', raw.shipId);
  if (!id || !shuttleId || !shipId ||
      (raw.action !== 'docked' && raw.action !== 'departed') || typeof raw.occurredAt !== 'string') {
    return undefined;
  }
  return { id, shuttleId, shipId, action: raw.action, occurredAt: raw.occurredAt };
}

export function sessionFrom(id: string, data: DocumentData): GameSession {
  const sessionId = entityId('session', id);
  const dradisContactTriggeredAt = data.dradisContactTriggeredAt;
  const announcement = turnStartAnnouncement(data.turnStartAnnouncement);
  const phaseClock = turnPhaseState(data.turnPhase);
  const playerCount = Number.isSafeInteger(data.playerCount) && data.playerCount >= 8 && data.playerCount <= 20
    ? data.playerCount as number
    : undefined;
  const setup = sessionSetup(data.setup);
  const storedRoleIds = parseEntityIdArray('role', data.activeRoleIds);
  const storedVesselIds = parseEntityIdArray('vessel', data.activeVesselIds);
  const hasStoredRoleIds = Array.isArray(data.activeRoleIds);
  const hasStoredVesselIds = Array.isArray(data.activeVesselIds);
  const hasActiveRoleIds = hasStoredRoleIds || Boolean(setup);
  const activeRoleIds = hasStoredRoleIds
    ? storedRoleIds ?? []
    : setup?.activeRoleIds ?? DEFAULT_ACTIVE_ROLE_IDS;
  const activeVesselIds = setup?.activeVesselIds ?? (
    hasStoredVesselIds ? storedVesselIds : undefined
  );
  const storedDockings = Array.isArray(data.shuttleDockings)
    ? data.shuttleDockings.map(shuttleDocking).filter((docking): docking is ShuttleDocking => docking !== undefined)
    : undefined;
  const storedVisits = Array.isArray(data.shuttleVisitLog)
    ? data.shuttleVisitLog.map(shuttleVisit).filter((visit): visit is ShuttleVisit => visit !== undefined)
    : undefined;
  const ownerUid = parseEntityId('player', data.ownerUid);
  const shuttleManifest = normalizeShuttleManifest(
    storedDockings,
    storedVisits,
    hasActiveRoleIds ? activeRoleIds : undefined,
    playerCount,
  );
  return {
    id: sessionId,
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
      activeVesselIds ? { activeVesselIds: [...activeVesselIds] } : {}),
    ...(announcement ? { turnStartAnnouncement: announcement } : {}),
    ...(phaseClock ? { turnPhase: phaseClock } : {}),
    capybaraEnabled: data.capybaraEnabled !== false,
    dioneEnabled: data.dioneEnabled !== false,
    universalArbourEnabled: data.universalArbourEnabled === true,
    wolfCultEnabled: data.wolfCultEnabled === true,
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
    populationAlerts: alertMap<PopulationAlert>(data.populationAlerts, true),
    unrestAlerts: alertMap<UnrestAlert>(data.unrestAlerts, false),
    gmControlsLocked: data.gmControlsLocked === true,
    activeRoleIds,
    shuttleDockings: shuttleManifest.dockings,
    shuttleVisitLog: shuttleManifest.visits,
    confettiUsedShipIds: Array.isArray(data.confettiUsedShipIds)
      ? data.confettiUsedShipIds
        .map((shipId: unknown) => parseEntityId('vessel', shipId))
        .filter((shipId): shipId is NonNullable<typeof shipId> => shipId !== undefined)
      : [],
    ...(dradisContactTriggeredAt && typeof dradisContactTriggeredAt.toDate === 'function'
      ? { dradisContactTriggeredAt: iso(dradisContactTriggeredAt) }
      : {}),
    ...(ownerUid ? { ownerUid } : {}),
    createdAt: iso(data.createdAt),
    updatedAt: iso(data.updatedAt),
  };
}

function playerFrom(sessionId: string, uid: string, data: DocumentData): Player {
  const parsedSeatId = data.seatId === null || data.seatId === undefined
    ? null
    : parseEntityId('seat', data.seatId) ?? null;
  const parsedRoleId = data.assignedRoleId === null || data.assignedRoleId === undefined
    ? null
    : parseEntityId('role', data.assignedRoleId);
  const parsedVesselId = data.shipPreferenceId === null || data.shipPreferenceId === undefined
    ? null
    : parseEntityId('vessel', data.shipPreferenceId);
  const parsedConsoleId = data.activeConsoleRoleId === null || data.activeConsoleRoleId === undefined
    ? null
    : parseEntityId('role', data.activeConsoleRoleId);
  return {
    uid: entityId('player', uid),
    sessionId: entityId('session', sessionId),
    displayName: normalizeDisplayName(data.displayName),
    role: data.role as Player['role'],
    seatId: parsedSeatId,
    ...(parsedRoleId !== undefined ? { assignedRoleId: parsedRoleId } : {}),
    ...(parsedVesselId !== undefined ? { shipPreferenceId: parsedVesselId } : {}),
    ...(parsedConsoleId !== undefined ? { activeConsoleRoleId: parsedConsoleId } : {}),
    joinedAt: iso(data.joinedAt),
  };
}

function seatFrom(sessionId: string, id: string, data: DocumentData): Seat {
  const roleId = parseEntityId('role', data.roleId) ?? entityId('role', id);
  const seatId = entityId('seat', id);
  const parsedFactionId = data.factionId === null || data.factionId === undefined
    ? null
    : parseEntityId('vessel', data.factionId);
  const parsedHolderUid = data.holderUid === null || data.holderUid === undefined
    ? null
    : parseEntityId('player', data.holderUid) ?? null;
  const metadata = ROLE_SEAT_METADATA[roleId];
  return {
    id: seatId,
    sessionId: entityId('session', sessionId),
    roleId,
    label: typeof data.label === 'string' ? data.label : metadata?.label ?? roleId,
    factionId: parsedFactionId ?? (metadata?.factionId ? entityId('vessel', metadata.factionId) : null),
    status: data.status as Seat['status'],
    holderUid: parsedHolderUid,
    claimedAt: data.claimedAt ? iso(data.claimedAt) : null,
  };
}

function gmInstanceFrom(
  sessionId: string,
  id: string,
  data: DocumentData,
  promoteSoleLegacyResponsibility = false,
): GmInstance | undefined {
  const uid = parseEntityId('player', data.uid);
  if (!uid) return undefined;
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
    sessionId: entityId('session', sessionId),
    uid,
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
  /** Whether the accepted session snapshot is backed by server authority. */
  readonly onSessionFreshness?: (fresh: boolean) => void;
  /** Retain accepted server authority when an equivalent listener is restarted. */
  readonly sessionSnapshotAuthority?: SessionSnapshotAuthority;
  readonly onPlayer: (player: Player) => void;
  readonly onKicked: () => void;
  readonly onSeats: (seats: readonly Seat[]) => void;
  readonly onPrivateLoyalty?: (loyalty: PrivateLoyalty | null) => void;
  readonly onRoleBrief?: (brief: RoleBrief | null) => void;
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
  let subscribed = true;
  const sessionSnapshotAuthority =
    handlers.sessionSnapshotAuthority ?? createSessionSnapshotAuthority();
  const onError = () => {
    if (subscribed) handlers.onError();
  };
  const unsubscribes = [
    onSnapshot(doc(database, `sessions/${sessionId}`), (snapshot) => {
      if (!subscribed) return;
      if (snapshot.exists()) {
        const fromCache = snapshot.metadata?.fromCache === true;
        // A cache callback can arrive after Firestore has delivered a newer
        // server snapshot. It remains useful for the first render, but never
        // gets to roll back accepted authority or its freshness signal.
        if (fromCache && sessionSnapshotAuthority.hasServerSessionAuthority) return;
        const data = snapshot.data();
        const session = sessionFrom(snapshot.id, data);
        if (!fromCache && !acceptServerSessionAuthority(
          sessionSnapshotAuthority,
          session,
          serverAuthorityCursor(snapshot, data),
        )) return;
        handlers.onSession(session);
        if (fromCache) {
          handlers.onSessionFreshness?.(false);
        } else {
          handlers.onSessionFreshness?.(true);
        }
      }
      else onError();
    }, onError),
    onSnapshot(doc(database, `sessions/${sessionId}/players/${uid}`), (snapshot) => {
      if (!subscribed) return;
      const fromCache = snapshot.metadata?.fromCache === true;
      // Player role/seat projections are part of the same reconnect identity.
      // Once the session cursor is server-authoritative, a delayed cached
      // projection must not replace the role or seat used by the UI.
      if (fromCache && sessionSnapshotAuthority.hasServerSessionAuthority) return;
      // A cached kickedAt is not enough to tear down the persisted identity;
      // wait for the server projection to confirm that terminal decision.
      if (snapshot.exists() && snapshot.get('kickedAt') && !fromCache) {
        handlers.onKicked();
      } else if (snapshot.exists() && snapshot.get('connected') === true) {
        handlers.onPlayer(playerFrom(sessionId, uid, snapshot.data()));
      } else onError();
    }, onError),
    onSnapshot(collection(database, `sessions/${sessionId}/seats`), (snapshot) => {
      if (!subscribed) return;
      if (snapshot.metadata?.fromCache === true && sessionSnapshotAuthority.hasServerSessionAuthority) return;
      handlers.onSeats(snapshot.docs
        .map((seat) => seatFrom(sessionId, seat.id, seat.data()))
        .filter((seat) => seat.roleId !== 'press-officer'));
    }, onError),
    ...(handlers.onPrivateLoyalty ? [onSnapshot(
      doc(database, `sessions/${sessionId}/secrets/loyalty-${uid}`),
      (snapshot) => {
        if (!subscribed) return;
        if (snapshot.metadata?.fromCache === true && sessionSnapshotAuthority.hasServerSessionAuthority) return;
        handlers.onPrivateLoyalty?.(
          snapshot.exists() ? privateLoyalty(snapshot.get('payload')) : null,
        );
      },
      onError,
    )] : []),
    ...(handlers.onRoleBrief ? [onSnapshot(
      doc(database, `sessions/${sessionId}/roleBriefs/${uid}`),
      (snapshot) => {
        if (!subscribed) return;
        if (snapshot.metadata?.fromCache === true && sessionSnapshotAuthority.hasServerSessionAuthority) return;
        handlers.onRoleBrief?.(
          snapshot.exists() ? roleBrief(snapshot.data(), sessionId, uid) : null,
        );
      },
      (error: { readonly code?: string }) => {
        if (!subscribed) return;
        if (error.code === 'permission-denied' || error.code === 'not-found') {
          handlers.onRoleBrief?.(null);
        }
        onError();
      },
    )] : []),
    ...(handlers.onSetupReceipt ? [onSnapshot(
      query(
        collection(database, `sessions/${sessionId}/secrets`),
        where('visibleToUids', 'array-contains', uid),
      ),
      (snapshot) => {
        if (!subscribed) return;
        if (snapshot.metadata?.fromCache === true && sessionSnapshotAuthority.hasServerSessionAuthority) return;
        const latest = snapshot.docs
          .map((secret) => setupReceipt(secret.get('payload')))
          .filter((receipt): receipt is SetupReceipt => receipt !== null)
          .sort((left, right) => left.committedSetupRevision - right.committedSetupRevision)
          .at(-1) ?? null;
        handlers.onSetupReceipt?.(latest);
      },
      onError,
    )] : []),
  ];
  return () => {
    subscribed = false;
    unsubscribes.forEach((unsubscribe) => unsubscribe());
    handlers.onRoleBrief?.(null);
  };
}

export function subscribeGmInstances(
  sessionId: string,
  onInstances: (instances: readonly GmInstance[]) => void,
  onError: () => void,
  suppliedAuthority?: SessionSnapshotAuthority,
): Unsubscribe {
  let subscribed = true;
  let hasServerSnapshot = false;
  const unsubscribe = onSnapshot(
    query(collection(db(), `sessions/${sessionId}/gmInstances`), orderBy('claimedAt', 'asc')),
    (snapshot) => {
      if (!subscribed) return;
      const fromCache = snapshot.metadata?.fromCache === true;
      if (fromCache && (
        hasServerSnapshot ||
        projectionSessionAuthority(sessionId, suppliedAuthority)?.hasServerSessionAuthority
      )) return;
      if (!fromCache) hasServerSnapshot = true;
      onInstances(snapshot.docs.flatMap((instance) => {
        const gmInstance = gmInstanceFrom(sessionId, instance.id, instance.data(), snapshot.docs.length === 1);
        return gmInstance ? [gmInstance] : [];
      }));
    },
    () => { if (subscribed) onError(); },
  );
  return () => {
    subscribed = false;
    unsubscribe();
  };
}

export function subscribeConnectedPlayers(
  sessionId: string,
  onPlayers: (players: readonly Player[]) => void,
  onError: () => void = () => undefined,
  suppliedAuthority?: SessionSnapshotAuthority,
): Unsubscribe {
  let subscribed = true;
  let hasServerSnapshot = false;
  const unsubscribe = onSnapshot(
    query(
      collection(db(), `sessions/${sessionId}/players`),
      where('connected', '==', true),
    ),
    (snapshot) => {
      if (!subscribed) return;
      const fromCache = snapshot.metadata?.fromCache === true;
      if (fromCache && (
        hasServerSnapshot ||
        projectionSessionAuthority(sessionId, suppliedAuthority)?.hasServerSessionAuthority
      )) return;
      if (!fromCache) hasServerSnapshot = true;
      onPlayers(snapshot.docs.map((player) =>
        playerFrom(sessionId, player.id, player.data())));
    },
    () => { if (subscribed) onError(); },
  );
  return () => {
    subscribed = false;
    unsubscribe();
  };
}

export function subscribeShipConfetti(
  sessionId: string,
  shipId: string,
  onPop: (sourceShipId: string, actorRoleName?: string, actorName?: string) => void,
  onError: () => void = () => undefined,
  suppliedAuthority?: SessionSnapshotAuthority,
): Unsubscribe {
  let initial = true;
  let subscribed = true;
  let hasServerSnapshot = false;
  let lastSignal: string | null = null;
  const unsubscribe = onSnapshot(
    doc(db(), `sessions/${sessionId}/shipConfetti/${shipId}`),
    (snapshot) => {
      if (!subscribed) return;
      const fromCache = snapshot.metadata?.fromCache === true;
      if (fromCache && (
        hasServerSnapshot ||
        projectionSessionAuthority(sessionId, suppliedAuthority)?.hasServerSessionAuthority
      )) return;
      if (!fromCache) hasServerSnapshot = true;
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
    () => { if (subscribed) onError(); },
  );
  return () => {
    subscribed = false;
    unsubscribe();
  };
}

export function subscribeSessionEvents(
  sessionId: string,
  onEvents: (events: readonly SessionEvent[]) => void,
  onError: () => void = () => undefined,
  suppliedAuthority?: SessionSnapshotAuthority,
): Unsubscribe {
  let subscribed = true;
  let hasServerSnapshot = false;
  const unsubscribe = onSnapshot(
    query(
      collection(db(), `sessions/${sessionId}/events`),
      orderBy('createdAt', 'desc'),
      limit(30),
    ),
    (snapshot) => {
      if (!subscribed) return;
      const fromCache = snapshot.metadata?.fromCache === true;
      if (fromCache && (
        hasServerSnapshot ||
        projectionSessionAuthority(sessionId, suppliedAuthority)?.hasServerSessionAuthority
      )) return;
      if (!fromCache) hasServerSnapshot = true;
      onEvents(snapshot.docs.flatMap<SessionEvent>((event) => {
        const data = event.data();
        const eventId = parseEntityId('event', event.id);
        const eventSessionId = parseEntityId('session', sessionId);
        if (!eventId || !eventSessionId) return [];
        if (data.type === 'fullscreen-alert') return [{
          id: eventId,
          sessionId: eventSessionId,
          type: 'fullscreen-alert' as const,
          sourceRoleName: data.sourceRoleName as string,
          message: data.message as string,
          createdAt: iso(data.createdAt),
        }];
        if (data.type === 'maintenance') {
          const maintenance = parseMaintenanceEvent(eventId, eventSessionId, data, iso(data.createdAt));
          return maintenance ? [maintenance] : [];
        }
        if (
          data.type === 'timer-pause' &&
          (data.action === 'paused' || data.action === 'resumed') &&
          (data.window === 'restricted' || data.window === 'open') &&
          typeof data.turn === 'number' && Number.isSafeInteger(data.turn) && data.turn >= 1
        ) return [{
          id: eventId,
          sessionId: eventSessionId,
          type: 'timer-pause' as const,
          action: data.action,
          turn: data.turn,
          window: data.window,
          actorName: typeof data.actorName === 'string' ? data.actorName : 'GM',
          createdAt: iso(data.createdAt),
        }];
        if (data.type !== 'ship-confetti') return [];
        const shipId = parseEntityId('vessel', data.shipId);
        if (!shipId) return [];
        return [{
          id: eventId,
          sessionId: eventSessionId,
          type: 'ship-confetti' as const,
          shipId,
          shipName: data.shipName as string,
          actorName: data.actorName as string,
          actorRoleName: data.actorRoleName as string,
          createdAt: iso(data.createdAt),
        }];
      }));
    },
    () => { if (subscribed) onError(); },
  );
  return () => {
    subscribed = false;
    unsubscribe();
  };
}

export function subscribeDamageDraws(
  sessionId: string,
  onDraws: (draws: readonly DamageDraw[]) => void,
  onError: () => void = () => undefined,
  suppliedAuthority?: SessionSnapshotAuthority,
): Unsubscribe {
  let subscribed = true;
  let hasServerSnapshot = false;
  const unsubscribe = onSnapshot(
    query(
      collection(db(), `sessions/${sessionId}/damageDraws`),
      orderBy('createdAt', 'desc'),
      limit(30),
    ),
    (snapshot) => {
      if (!subscribed) return;
      const fromCache = snapshot.metadata?.fromCache === true;
      if (fromCache && (
        hasServerSnapshot ||
        projectionSessionAuthority(sessionId, suppliedAuthority)?.hasServerSessionAuthority
      )) return;
      if (!fromCache) hasServerSnapshot = true;
      onDraws(snapshot.docs.flatMap<DamageDraw>((draw) => {
        const data = draw.data();
        const drawId = parseEntityId('event', draw.id);
        const drawSessionId = parseEntityId('session', sessionId);
        const drawShipId = parseEntityId('vessel', data.shipId);
        if (!drawId || !drawSessionId || !drawShipId) return [];
        if (data.type === 'ship-destroyed') return [{
          id: drawId,
          sessionId: drawSessionId,
          type: 'ship-destroyed' as const,
          shipId: drawShipId,
          createdAt: iso(data.createdAt),
        }];
        if (data.type !== 'ship-damage') return [];
        return [{
          id: drawId,
          sessionId: drawSessionId,
          type: 'ship-damage' as const,
          shipId: drawShipId,
          card: data.card as string,
          systemId: data.systemId as string,
          systemName: data.systemName as string,
          recycled: data.recycled === true,
          createdAt: iso(data.createdAt),
        }];
      }));
    },
    () => { if (subscribed) onError(); },
  );
  return () => {
    subscribed = false;
    unsubscribe();
  };
}
