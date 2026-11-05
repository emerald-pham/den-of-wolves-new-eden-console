import type { GameSession, Player } from '@/types/game';
import { useSessionStore } from '@/store/useSessionStore';
import { phaseForSession } from './turnPhase';
import {
  captureSessionAuthority,
  isCurrentSessionAuthority,
  requireFreshSessionAuthority,
  type SessionAuthorityCheckpoint,
} from './sessionMutationAuthority';

const QUELLON_EXPLORER = 'quellon-explorer';

export interface HummingbirdHarvestAuthority {
  readonly sessionId: string;
  readonly uid: string;
  readonly turn: number;
  readonly hostShipId: string;
  readonly checkpoint: SessionAuthorityCheckpoint;
  readonly identityHydrationRevision: number;
  readonly connectionGeneration: Player['connectionGeneration'];
  readonly seatId: Player['seatId'];
  readonly fleetGroupId: Player['fleetGroupId'];
  readonly assignedRoleId: Player['assignedRoleId'];
  readonly dockedAt: string | undefined;
  readonly phaseContext: string;
}

function isCounter(value: unknown, min = 0): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min;
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[\w-]{1,128}$/.test(value);
}

function uniqueHummingbirdHost(session: GameSession): string | undefined {
  const dockings = Array.isArray(session.shuttleDockings) ? session.shuttleDockings : [];
  const rows = dockings.filter((row) => row.shuttleId === 'hummingbird');
  if (rows.length !== 1) return undefined;
  const hostShipId = rows[0]?.shipId;
  return typeof hostShipId === 'string' && hostShipId.length > 0 ? hostShipId : undefined;
}

export function captureHummingbirdHarvestAuthority(): HummingbirdHarvestAuthority {
  requireFreshSessionAuthority();
  const state = useSessionStore.getState();
  const session = state.session;
  const me = state.me;
  const hostShipId = session ? uniqueHummingbirdHost(session) : undefined;
  const turn = session?.currentTurn ?? 1;
  const phase = session ? phaseForSession(session) : undefined;
  if (!session || !me || me.sessionId !== session.id || !isIdentifier(me.uid)) {
    throw new Error('Reconnect before operating Hummingbird harvesting.');
  }
  if (me.role !== 'player' || me.activeConsoleRoleId !== QUELLON_EXPLORER ||
      typeof me.replacementRoleId === 'string' || me.replacementStatus != null ||
      session.activeRoleIds?.includes(QUELLON_EXPLORER) !== true) {
    throw new Error('The active Quellon Explorer console is required.');
  }
  if (session.phase !== 'active' || !isCounter(turn, 1) ||
      !hostShipId || session.activeVesselIds?.includes(hostShipId) !== true ||
      session.activeVesselIds.includes('quellon') !== true ||
      session.shuttleFuelled?.hummingbird !== true ||
      phase?.airspace.state !== 'lifted') {
    throw new Error('Hummingbird harvesting is unavailable in the current live session.');
  }
  const checkpoint = captureSessionAuthority(session.id, me.uid);
  if (!checkpoint) throw new Error('Reconnect before operating Hummingbird harvesting.');
  return {
    sessionId: session.id, uid: me.uid, turn, hostShipId, checkpoint,
    identityHydrationRevision: state.identityHydrationRevision,
    connectionGeneration: me.connectionGeneration, seatId: me.seatId,
    fleetGroupId: me.fleetGroupId, assignedRoleId: me.assignedRoleId,
    dockedAt: session.shuttleDockings?.find(row => row.shuttleId === 'hummingbird')?.dockedAt,
    phaseContext: JSON.stringify([phase, session.turnState]),
  };
}

/** Private receipts reconcile by their own revision; they never patch the public session. */
export function isCurrentHummingbirdHarvestAuthority(expected: HummingbirdHarvestAuthority): boolean {
  try {
    const current = captureHummingbirdHarvestAuthority();
    const completeLease = isCounter(expected.connectionGeneration, 1) &&
      isIdentifier(expected.seatId) && isIdentifier(expected.fleetGroupId);
    return current.sessionId === expected.sessionId && current.uid === expected.uid &&
      current.turn === expected.turn && current.hostShipId === expected.hostShipId &&
      current.dockedAt === expected.dockedAt && current.phaseContext === expected.phaseContext &&
      current.identityHydrationRevision === expected.identityHydrationRevision &&
      current.connectionGeneration === expected.connectionGeneration && current.seatId === expected.seatId &&
      current.fleetGroupId === expected.fleetGroupId && current.assignedRoleId === expected.assignedRoleId &&
      current.checkpoint.authority === expected.checkpoint.authority &&
      current.checkpoint.version >= expected.checkpoint.version &&
      // Legacy identities lack a verifiable lease. Keep their strict public
      // snapshot guard rather than broadening delayed private-reply acceptance.
      (completeLease || isCurrentSessionAuthority(expected.checkpoint));
  } catch {
    return false;
  }
}
