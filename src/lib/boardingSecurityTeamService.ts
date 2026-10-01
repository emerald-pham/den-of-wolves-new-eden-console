import { httpsCallable } from 'firebase/functions';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, GmInstance, Player } from '@/types/game';
import { functions } from './firebase';
import {
  captureSessionAuthority,
  hasFreshSessionAuthority,
  isCurrentSessionAuthority,
  requireFreshSessionAuthority,
} from './sessionMutationAuthority';

type Data = Record<string, unknown>;

export interface BoardingSecurityTeamShipLocation {
  readonly shipId: string;
  readonly shipSecurityTeams: number;
  readonly boardingEligibleTeams: number;
}

export interface BoardingSecurityTeamShuttleLocation {
  readonly shuttleId: string;
  readonly securityTeams: number;
  readonly location: 'docked' | 'undocked';
  readonly currentHostShipId: string | null;
}

export interface BoardingSecurityTeamLocationProjection {
  readonly status: 'ready';
  readonly sessionId: string;
  readonly actorUid: string;
  readonly gmInstanceId: string;
  readonly cycle: number;
  readonly ships: readonly BoardingSecurityTeamShipLocation[];
  readonly shuttles: readonly BoardingSecurityTeamShuttleLocation[];
  readonly totals: Readonly<{
    shipStoredSecurityTeams: number;
    aboardDockedShuttleSecurityTeams: number;
    boardingEligibleTotal: number;
    shuttleCount: number;
  }>;
}

function isRecord(value: unknown): value is Data {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Data, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function identifier(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function sum(values: readonly number[]): number | undefined {
  let total = 0;
  for (const value of values) {
    if (!isCount(value) || total > Number.MAX_SAFE_INTEGER - value) return undefined;
    total += value;
  }
  return total;
}

function expectedSharedStateKey(session: GameSession): string {
  return JSON.stringify([
    session.id,
    session.phase,
    session.currentTurn,
    session.activeRoleIds,
    session.activeVesselIds,
    session.setup,
    session.shipDamage,
    session.shipResources,
    session.shuttleCargo,
    session.shuttleDockings,
    session.shuttleControl,
    session.retainedShuttles,
    session.shuttleVisitLog,
  ]);
}

function parseProjection(
  value: unknown,
  expected: Readonly<{
    session: GameSession;
    actorUid: string;
    gmInstanceId: string;
    cycle: number;
  }>,
): BoardingSecurityTeamLocationProjection | null {
  if (!isRecord(value) || !exactKeys(value, [
    'status', 'sessionId', 'actorUid', 'gmInstanceId', 'cycle', 'ships', 'shuttles', 'totals',
  ]) || value.status !== 'ready' || value.sessionId !== expected.session.id ||
      value.actorUid !== expected.actorUid || value.gmInstanceId !== expected.gmInstanceId ||
      value.cycle !== expected.cycle || !Array.isArray(value.ships) ||
      !Array.isArray(value.shuttles) || !isRecord(value.totals) ||
      !exactKeys(value.totals, [
        'shipStoredSecurityTeams', 'aboardDockedShuttleSecurityTeams',
        'boardingEligibleTotal', 'shuttleCount',
      ])) return null;

  const vesselIds = expected.session.activeVesselIds;
  if (!Array.isArray(vesselIds) || vesselIds.length === 0 ||
      value.ships.length !== vesselIds.length ||
      value.ships.some((entry, index) => !isRecord(entry) ||
        !exactKeys(entry, ['shipId', 'shipSecurityTeams', 'boardingEligibleTeams']) ||
        entry.shipId !== vesselIds[index] || !identifier(entry.shipId) ||
        !isCount(entry.shipSecurityTeams) || !isCount(entry.boardingEligibleTeams) ||
        entry.boardingEligibleTeams < entry.shipSecurityTeams)) return null;

  const shipIds = new Set(vesselIds as readonly string[]);
  const ships = value.ships.map((entry) => ({
    shipId: (entry as Data).shipId as string,
    shipSecurityTeams: (entry as Data).shipSecurityTeams as number,
    boardingEligibleTeams: (entry as Data).boardingEligibleTeams as number,
  }));
  if (!Array.isArray(value.shuttles) || value.shuttles.some((entry) =>
    !isRecord(entry) || !exactKeys(entry, [
      'shuttleId', 'securityTeams', 'location', 'currentHostShipId',
    ]) || !identifier(entry.shuttleId) || !isCount(entry.securityTeams) ||
    (entry.location === 'docked'
      ? typeof entry.currentHostShipId !== 'string' || !shipIds.has(entry.currentHostShipId)
      : entry.location !== 'undocked' || entry.currentHostShipId !== null))) return null;
  const shuttleIds = value.shuttles.map((entry) => (entry as Data).shuttleId as string);
  if (new Set(shuttleIds).size !== shuttleIds.length) return null;
  const shuttles = value.shuttles.map((entry) => ({
    shuttleId: (entry as Data).shuttleId as string,
    securityTeams: (entry as Data).securityTeams as number,
    location: (entry as Data).location as 'docked' | 'undocked',
    currentHostShipId: (entry as Data).currentHostShipId as string | null,
  }));

  for (const ship of ships) {
    const aboard = sum(shuttles.filter((shuttle) =>
      shuttle.location === 'docked' && shuttle.currentHostShipId === ship.shipId)
      .map((shuttle) => shuttle.securityTeams));
    if (aboard === undefined || ship.boardingEligibleTeams !== ship.shipSecurityTeams + aboard ||
        !Number.isSafeInteger(ship.shipSecurityTeams + aboard)) return null;
  }
  const shipStoredSecurityTeams = sum(ships.map((ship) => ship.shipSecurityTeams));
  const aboardDockedShuttleSecurityTeams = sum(shuttles
    .filter((shuttle) => shuttle.location === 'docked').map((shuttle) => shuttle.securityTeams));
  const boardingEligibleTotal = sum(ships.map((ship) => ship.boardingEligibleTeams));
  if (shipStoredSecurityTeams === undefined || aboardDockedShuttleSecurityTeams === undefined ||
      boardingEligibleTotal === undefined ||
      value.totals.shipStoredSecurityTeams !== shipStoredSecurityTeams ||
      value.totals.aboardDockedShuttleSecurityTeams !== aboardDockedShuttleSecurityTeams ||
      value.totals.boardingEligibleTotal !== boardingEligibleTotal ||
      value.totals.shuttleCount !== shuttles.length) return null;

  return {
    status: 'ready',
    sessionId: expected.session.id,
    actorUid: expected.actorUid,
    gmInstanceId: expected.gmInstanceId,
    cycle: expected.cycle,
    ships,
    shuttles,
    totals: {
      shipStoredSecurityTeams,
      aboardDockedShuttleSecurityTeams,
      boardingEligibleTotal,
      shuttleCount: shuttles.length,
    },
  };
}

function requireGmContext(): Readonly<{
  session: GameSession;
  me: Player;
  instance: GmInstance;
  cycle: number;
  sharedStateKey: string;
}> {
  const { session, me, gmInstance } = useSessionStore.getState();
  if (!session || !me || !gmInstance) {
    throw new Error('An active GM instance is required to inspect security-team locations.');
  }
  if (me.role !== 'gm' || me.sessionId !== session.id ||
      gmInstance.sessionId !== session.id || gmInstance.uid !== me.uid ||
      !identifier(gmInstance.id)) {
    throw new Error('The current live GM identity changed. Reconnect and refresh.');
  }
  if (session.phase !== 'active' || !Number.isSafeInteger(session.currentTurn) ||
      (session.currentTurn ?? 0) < 1) {
    throw new Error('Security-team locations are available only for a fresh active session.');
  }
  requireFreshSessionAuthority();
  return {
    session,
    me,
    instance: gmInstance,
    cycle: session.currentTurn!,
    sharedStateKey: expectedSharedStateKey(session),
  };
}

function sameGmContext(
  expected: ReturnType<typeof requireGmContext>,
): boolean {
  const current = useSessionStore.getState();
  return current.session?.id === expected.session.id &&
    current.me?.uid === expected.me.uid && current.me?.role === 'gm' &&
    current.me.sessionId === expected.session.id &&
    current.gmInstance?.id === expected.instance.id &&
    current.gmInstance.sessionId === expected.session.id &&
    current.gmInstance.uid === expected.me.uid &&
    current.session?.currentTurn === expected.cycle &&
    current.session !== null && current.session !== undefined &&
    expectedSharedStateKey(current.session) === expected.sharedStateKey;
}

export async function getBoardingSecurityTeamLocations(): Promise<BoardingSecurityTeamLocationProjection> {
  const expected = requireGmContext();
  if (!hasFreshSessionAuthority()) {
    throw new Error('Reconnect until the live session state returns before reading locations.');
  }
  const checkpoint = captureSessionAuthority(expected.session.id, expected.me.uid);
  const payload = { sessionId: expected.session.id, instanceId: expected.instance.id };
  const value = (await httpsCallable<typeof payload, unknown>(
    functions(), 'getBoardingSecurityTeamLocations',
  )(payload)).data;
  if (!isCurrentSessionAuthority(checkpoint) || !sameGmContext(expected)) {
    throw new Error('GM authority changed while security-team locations were loading. Refresh.');
  }
  const projection = parseProjection(value, {
    session: expected.session,
    actorUid: expected.me.uid,
    gmInstanceId: expected.instance.id,
    cycle: expected.cycle,
  });
  if (!projection) throw new Error('The security-team location reply is malformed or stale. Refresh.');
  return projection;
}
