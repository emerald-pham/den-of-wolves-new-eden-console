import { parseCandidateCraftReservations } from './candidateAvailability';
import { HttpsError } from 'firebase-functions/v2/https';
import type { Transaction } from 'firebase-admin/firestore';
import { boardingSecurityTeamAuthority } from './boardingSecurityTeams';
import { parseShuttleTransitAuthority, type ShuttleTransitState } from './shuttleTransit';

type Data = Record<string, unknown>;

export interface BoardingSecurityTeamCallableSnapshot {
  readonly exists: boolean;
  readonly id: string;
  get(field: string): unknown;
  data(): unknown;
}

export interface BoardingSecurityTeamCallableDatabase {
  doc(path: string): unknown;
  runTransaction<T>(work: (transaction: unknown) => Promise<T>): Promise<T>;
}

export interface BoardingSecurityTeamCallableRequest {
  readonly auth?: { readonly uid: string } | null;
  readonly data?: unknown;
}

export interface BoardingSecurityTeamCallableDependencies {
  readonly db: BoardingSecurityTeamCallableDatabase;
  readonly requireUid: (auth: { readonly uid: string } | undefined) => string;
  readonly requireFacilitatorInstance: (
    transaction: Transaction,
    sessionId: string,
    uid: string,
    instanceId: string,
  ) => Promise<{ readonly session: BoardingSecurityTeamCallableSnapshot }>;
}

export interface BoardingSecurityTeamLocationsReply {
  readonly status: 'ready';
  readonly sessionId: string;
  readonly actorUid: string;
  readonly gmInstanceId: string;
  readonly cycle: number;
  readonly ships: readonly Readonly<{
    shipId: string;
    shipSecurityTeams: number;
    boardingEligibleTeams: number;
  }>[];
  readonly shuttles: readonly Readonly<{
    shuttleId: string;
    securityTeams: number;
    location: 'docked' | 'undocked';
    currentHostShipId: string | null;
  }>[];
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

function invalid(message: string): never {
  throw new HttpsError('invalid-argument', message);
}

function failClosed(message = 'Security-team location authority is incomplete or malformed.'): never {
  throw new HttpsError('failed-precondition', message);
}

function safeSegment(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128 ||
      value.trim() !== value || value.includes('/')) {
    return invalid(`${label} is invalid.`);
  }
  return value;
}

function parseRequest(value: unknown): Readonly<{ sessionId: string; instanceId: string }> {
  if (!isRecord(value) || Object.keys(value).length !== 2 ||
      !Object.hasOwn(value, 'sessionId') || !Object.hasOwn(value, 'instanceId')) {
    return invalid('The security-team location request is malformed.');
  }
  return {
    sessionId: safeSegment(value.sessionId, 'Session ID'),
    instanceId: safeSegment(value.instanceId, 'GM instance ID'),
  };
}

function safeTotal(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0 || total > Number.MAX_SAFE_INTEGER - value) {
      return failClosed();
    }
    total += value;
  }
  return total;
}

/** Read the existing strict policy through the active facilitator's live lease. */
export function createBoardingSecurityTeamCallable(
  dependencies: BoardingSecurityTeamCallableDependencies,
) {
  return async function getBoardingSecurityTeamLocations(
    request: BoardingSecurityTeamCallableRequest,
  ): Promise<BoardingSecurityTeamLocationsReply> {
    const actorUid = dependencies.requireUid(request.auth ?? undefined);
    const { sessionId, instanceId } = parseRequest(request.data);

    return dependencies.db.runTransaction(async (rawTransaction) => {
      const transaction = rawTransaction as Transaction;
      const facilitator = await dependencies.requireFacilitatorInstance(
        transaction, sessionId, actorUid, instanceId,
      );
      const session = facilitator.session;
      if (!session.exists || session.id !== sessionId) {
        throw new HttpsError('not-found', 'No such session.');
      }
      if (session.get('phase') !== 'active') {
        return failClosed('Security-team locations are available only in an active session.');
      }
      const cycle = session.get('currentTurn');
      if (!Number.isSafeInteger(cycle) || (cycle as number) < 1) {
        return failClosed('The active session cycle is unavailable.');
      }
      const documentReader = transaction as unknown as {
        get(reference: unknown): Promise<BoardingSecurityTeamCallableSnapshot>;
      };
      const manifestSnapshot = await documentReader.get(dependencies.db.doc(`sessions/${sessionId}/craftOwnership/manifest`));
      if (!manifestSnapshot.exists || !isRecord(manifestSnapshot.data())) {
        return failClosed('The starting craft manifest is unavailable.');
      }
      const manifest = manifestSnapshot.data() as Data;
      let authority;
      try {
        const starting = manifest.startingCraft;
        const dockings = session.get('shuttleDockings');
        const visits = session.get('shuttleVisitLog');
        const retained = session.get('retainedShuttles');
        const consumed = Object.keys(parseCandidateCraftReservations(session.get('candidateCraftReservations')));
        if (!isRecord(starting) || !Array.isArray(starting.entries) ||
            !Array.isArray(dockings) || !Array.isArray(visits)) return failClosed();
        const inTransit: Record<string, ShuttleTransitState> = {};
        for (const entry of starting.entries) {
          if (!isRecord(entry) || entry.kind !== 'shuttle') continue;
          if (typeof entry.id !== 'string' || !/^[\w-]{1,128}$/.test(entry.id)) return failClosed();
          const shuttleId = entry.id;
          const latest = visits.filter(value => isRecord(value) && value.shuttleId === shuttleId).at(-1);
          if (consumed.includes(shuttleId) ||
              dockings.some(value => isRecord(value) && value.shuttleId === shuttleId) ||
              isRecord(retained) && Object.hasOwn(retained, shuttleId) ||
              !isRecord(latest) || latest.action !== 'docked') continue;
          // Normal transit removes the dock; arrival later appends both visits.
          // Require the existing server-owned movement and private integrity chain.
          const [movement, chain] = await Promise.all([
            documentReader.get(dependencies.db.doc(`sessions/${sessionId}/shuttleDepartures/${shuttleId}`)),
            documentReader.get(dependencies.db.doc(`sessions/${sessionId}/shuttleTransitChains/${shuttleId}`)),
          ]);
          const parsed = movement.exists && movement.id === shuttleId
            ? parseShuttleTransitAuthority(movement.data(), chain.exists ? chain.data() : undefined, shuttleId)
            : null;
          if (!parsed || chain.exists && chain.id !== shuttleId) return failClosed();
          inTransit[shuttleId] = parsed.transit;
        }
        authority = boardingSecurityTeamAuthority({
          consumedShuttleIds: consumed,
          inTransitShuttles: inTransit,
          currentCycle: cycle,
          activeRoleIds: session.get('activeRoleIds'),
          activeVesselIds: session.get('activeVesselIds'),
          vesselMode: manifest.vesselMode,
          startingCraftManifest: manifest.startingCraft,
          shuttleVisitLog: session.get('shuttleVisitLog'),
          retainedShuttles: session.get('retainedShuttles'),
          shuttleControl: session.get('shuttleControl'),
          shipDamage: session.get('shipDamage'),
          shipResources: session.get('shipResources'),
          // New sessions materialize this map lazily; the existing authority
          // treats absent per-shuttle cargo as zero and rejects malformed maps.
          shuttleCargo: session.get('shuttleCargo') === undefined ? {} : session.get('shuttleCargo'),
          shuttleDockings: session.get('shuttleDockings'),
        });
      } catch {
        return failClosed();
      }

      const activeVesselIds = session.get('activeVesselIds');
      const startingCraft = manifest.startingCraft;
      if (!Array.isArray(activeVesselIds) || activeVesselIds.some((id) => typeof id !== 'string') ||
          !isRecord(startingCraft) || !Array.isArray(startingCraft.entries)) {
        return failClosed();
      }
      const dockings = session.get('shuttleDockings');
      if (!Array.isArray(dockings)) return failClosed();
      const currentHostByShuttle = new Map<string, string>();
      for (const value of dockings) {
        if (!isRecord(value) || typeof value.shuttleId !== 'string' || typeof value.shipId !== 'string') {
          return failClosed();
        }
        currentHostByShuttle.set(value.shuttleId, value.shipId);
      }

      const ships = activeVesselIds.map((shipId) => ({
        shipId,
        shipSecurityTeams: authority.shipSecurityTeams[shipId]!,
        boardingEligibleTeams: authority.boardingSecurityTeamsByHost[shipId]!,
      }));
      const shuttles = startingCraft.entries.flatMap((entry) => {
        if (!isRecord(entry) || entry.kind !== 'shuttle' || typeof entry.id !== 'string') return [];
        const currentHostShipId = currentHostByShuttle.get(entry.id) ?? null;
        return [{
          shuttleId: entry.id,
          securityTeams: authority.shuttleSecurityTeams[entry.id]!,
          location: currentHostShipId ? 'docked' as const : 'undocked' as const,
          currentHostShipId,
        }];
      });
      const totals = {
        shipStoredSecurityTeams: safeTotal(ships.map((ship) => ship.shipSecurityTeams)),
        aboardDockedShuttleSecurityTeams: safeTotal(shuttles
          .filter((shuttle) => shuttle.location === 'docked')
          .map((shuttle) => shuttle.securityTeams)),
        boardingEligibleTotal: safeTotal(ships.map((ship) => ship.boardingEligibleTeams)),
        shuttleCount: shuttles.length,
      };
      return Object.freeze({
        status: 'ready' as const,
        sessionId,
        actorUid,
        gmInstanceId: instanceId,
        cycle: cycle as number,
        ships: Object.freeze(ships.map((ship) => Object.freeze(ship))),
        shuttles: Object.freeze(shuttles.map((shuttle) => Object.freeze(shuttle))),
        totals: Object.freeze(totals),
      });
    });
  };
}
