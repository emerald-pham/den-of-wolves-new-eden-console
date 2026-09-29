import { httpsCallable } from 'firebase/functions';
import type { GameSession, HummingbirdHarvest } from '@/types/game';
import { functions } from './firebase';
import {
  captureSessionAuthority,
  isCurrentSessionAuthority,
  requireFreshSessionAuthority,
  type SessionAuthorityCheckpoint,
} from './sessionMutationAuthority';
import { phaseForSession } from './turnPhase';
import { useSessionStore } from '@/store/useSessionStore';

const QUELLON_EXPLORER = 'quellon-explorer';

export interface HummingbirdHarvestCommandReply {
  readonly status: 'committed' | 'replayed' | 'stale';
  readonly sessionId: string;
  readonly requestId: string;
  readonly harvest: HummingbirdHarvest;
  readonly actorUid: string;
  readonly actorRoleId: string;
  readonly vesselId: 'hummingbird';
  readonly hostShipId: string;
  readonly turn: number;
  readonly phase: 'active';
  readonly revision: number;
  readonly idempotencyKey: string;
  readonly auditId: string;
}

export type HummingbirdHarvestCommandResult = HummingbirdHarvestCommandReply | undefined;

interface HummingbirdAuthority {
  readonly sessionId: string;
  readonly uid: string;
  readonly turn: number;
  readonly hostShipId: string;
  readonly checkpoint: SessionAuthorityCheckpoint;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function activeAuthority(): HummingbirdAuthority {
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
  return { sessionId: session.id, uid: me.uid, turn, hostShipId, checkpoint };
}

function authorityIsCurrent(expected: HummingbirdAuthority): boolean {
  if (!isCurrentSessionAuthority(expected.checkpoint)) return false;
  try {
    const current = activeAuthority();
    return current.sessionId === expected.sessionId && current.uid === expected.uid &&
      current.turn === expected.turn && current.hostShipId === expected.hostShipId;
  } catch {
    return false;
  }
}

function parseHarvest(value: unknown, authority: HummingbirdAuthority): HummingbirdHarvest | undefined {
  if (!isRecord(value) || value.sessionId !== authority.sessionId || value.ownerUid !== authority.uid ||
      value.turn !== authority.turn || value.hostShipId !== authority.hostShipId ||
      !isCounter(value.revision, 1) || !isIdentifier(value.requestId) ||
      typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt)) ||
      !Array.isArray(value.rolls) || value.rolls.length !== 2 ||
      !value.rolls.every((die) => isCounter(die, 1) && die <= 6)) {
    return undefined;
  }
  const rolls = value.rolls as [number, number];
  if (value.status === 'pending') {
    return {
      sessionId: authority.sessionId,
      ownerUid: authority.uid,
      turn: authority.turn,
      hostShipId: authority.hostShipId as HummingbirdHarvest['hostShipId'],
      revision: value.revision,
      status: 'pending',
      rolls,
      requestId: value.requestId,
      createdAt: value.createdAt,
    };
  }
  if (value.status !== 'resolved' || (value.foodDieIndex !== 0 && value.foodDieIndex !== 1) ||
      value.food !== rolls[value.foodDieIndex] || value.water !== rolls[value.foodDieIndex === 0 ? 1 : 0] ||
      typeof value.resolvedAt !== 'string' || !Number.isFinite(Date.parse(value.resolvedAt))) {
    return undefined;
  }
  return {
    sessionId: authority.sessionId,
    ownerUid: authority.uid,
    turn: authority.turn,
    hostShipId: authority.hostShipId as HummingbirdHarvest['hostShipId'],
    revision: value.revision,
    status: 'resolved',
    rolls,
    foodDieIndex: value.foodDieIndex,
    food: value.food,
    water: value.water,
    requestId: value.requestId,
    createdAt: value.createdAt,
    resolvedAt: value.resolvedAt,
  };
}

function parseReply(
  value: unknown,
  authority: HummingbirdAuthority,
  requestId: string,
  expectedRevision: number,
): HummingbirdHarvestCommandReply {
  const invalid = () => new Error('The current Hummingbird harvest state could not be verified. Reconnect and retry.');
  if (!isRecord(value) ||
      (value.status !== 'committed' && value.status !== 'replayed' && value.status !== 'stale') ||
      value.sessionId !== authority.sessionId || value.requestId !== requestId ||
      value.actorUid !== authority.uid || value.actorRoleId !== QUELLON_EXPLORER ||
      value.vesselId !== 'hummingbird' || value.hostShipId !== authority.hostShipId ||
      value.turn !== authority.turn || value.phase !== 'active' ||
      !isCounter(value.revision, 1) || !isIdentifier(value.idempotencyKey) ||
      value.idempotencyKey !== requestId || value.auditId !== `hummingbird-harvest-${requestId}` ||
      value.revision < expectedRevision ||
      (value.status === 'stale' && value.revision <= expectedRevision)) {
    throw invalid();
  }
  const harvest = parseHarvest(value.harvest, authority);
  if (!harvest || harvest.revision !== value.revision) throw invalid();
  return {
    status: value.status,
    sessionId: authority.sessionId,
    requestId,
    harvest,
    actorUid: authority.uid,
    actorRoleId: QUELLON_EXPLORER,
    vesselId: 'hummingbird',
    hostShipId: authority.hostShipId,
    turn: authority.turn,
    phase: 'active',
    revision: value.revision,
    idempotencyKey: requestId,
    auditId: `hummingbird-harvest-${requestId}`,
  };
}

function commandId(): string {
  return window.crypto.randomUUID();
}

async function invokeHarvestCommand<Payload extends {
  readonly sessionId: string;
  readonly expectedRevision: number;
  readonly requestId: string;
}>(
  authority: HummingbirdAuthority,
  name: 'rollHummingbirdHarvest' | 'allocateHummingbirdHarvest',
  payload: Payload,
): Promise<HummingbirdHarvestCommandResult> {
  if (payload.sessionId !== authority.sessionId || !isIdentifier(payload.requestId) ||
      !isCounter(payload.expectedRevision)) {
    throw new Error('The current Hummingbird harvest request could not be verified.');
  }
  const response = await httpsCallable<Payload, unknown>(functions(), name)(payload);
  // A listener or identity change may beat the callable reply. Its private
  // state must not replace a newer snapshot or cross the current actor boundary.
  if (!authorityIsCurrent(authority)) return undefined;
  return parseReply(response.data, authority, payload.requestId, payload.expectedRevision);
}

export function rollHummingbirdHarvest(
  expectedRevision: number,
  requestId = commandId(),
): Promise<HummingbirdHarvestCommandResult> {
  const authority = activeAuthority();
  return invokeHarvestCommand(authority, 'rollHummingbirdHarvest', {
    sessionId: authority.sessionId, expectedRevision, requestId,
  });
}

export function allocateHummingbirdHarvest(
  expectedRevision: number,
  foodDieIndex: 0 | 1,
  requestId = commandId(),
): Promise<HummingbirdHarvestCommandResult> {
  const authority = activeAuthority();
  if (foodDieIndex !== 0 && foodDieIndex !== 1) {
    throw new Error('Choose which Hummingbird die becomes food.');
  }
  return invokeHarvestCommand(authority, 'allocateHummingbirdHarvest', {
    sessionId: authority.sessionId, expectedRevision, foodDieIndex, requestId,
  });
}
