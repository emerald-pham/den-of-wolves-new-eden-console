import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { useSessionStore } from '@/store/useSessionStore';
import { captureSessionAuthority, hasFreshSessionAuthority, isCurrentSessionAuthority, requireFreshSessionAuthority } from './sessionMutationAuthority';
import { parseMaliadesState } from './maliadesLedger';
import { turnPhaseState } from './turnPhase';
import type { GameSession, MaliadesStateRecord } from '@/types/game';

export type MaliadesMediumChoice =
  | Readonly<{ kind: 'target-shift'; targetId: string; shift: -1 | 1; wolfRosterIndex?: number }>
  | Readonly<{ kind: 'attack'; targetId: string }>;

export interface MaliadesActionReply {
  readonly status: 'committed' | 'replayed';
  readonly sessionId: string;
  readonly requestId: string;
  readonly craftId: 'maliades';
  readonly cycle: number;
  readonly revision: number;
  readonly state: MaliadesStateRecord;
  readonly resolution: MaliadesStateRecord['medium'] | MaliadesStateRecord['short'];
}

export interface MaliadesRepairCommittedReply {
  readonly status: 'committed' | 'replayed';
  readonly sessionId: string;
  readonly requestId: string;
  readonly craftId: 'maliades';
  readonly cycle: number;
  readonly revision: number;
  readonly hostShipId: string;
  readonly damageRepaired: number;
  readonly materialsRemaining: number;
  readonly state: MaliadesStateRecord;
}

/** Client wire shape for a no-write stale CAS response from repairMaliades. */
export interface MaliadesRepairStaleReply {
  readonly status: 'stale';
  readonly sessionId: string;
  readonly requestId: string;
  readonly craftId: 'maliades';
  readonly expectedHostShipId: string;
  readonly damageToRepair: number;
  readonly expectedControlRevision: number;
  readonly currentControlRevision: number;
  readonly expectedRevision: number;
  readonly currentRevision: number;
  readonly expectedCycle: number;
  readonly currentCycle: number;
}

export type MaliadesRepairReply = MaliadesRepairCommittedReply | MaliadesRepairStaleReply;

function commandId(): string {
  return window.crypto.randomUUID();
}

function safeId(value: string): boolean {
  return /^[\w-]{1,128}$/.test(value);
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

interface MaliadesRepairAttemptAuthority {
  readonly sessionId: string;
  readonly uid: string;
  readonly role: string;
  readonly assignedRoleId: string | null | undefined;
  readonly activeConsoleRoleId: string | null | undefined;
  readonly fleetGroupId: string;
  readonly ownerUid: string;
  readonly expectedHostShipId: string;
  readonly expectedControlRevision: number;
}

function isSafeCounter(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function liveTeamPhase(session: GameSession): boolean {
  const cycle = session.currentTurn;
  const phase = turnPhaseState(session.turnPhase);
  if (!phase || !Number.isSafeInteger(cycle) || (cycle as number) < 1) return false;
  const teamEnds = Date.parse(phase.teamPhaseEndsAt);
  return session.phase === 'active' && phase.turn === cycle && phase.airspace.state === 'restricted' &&
    Number.isFinite(teamEnds) && Date.now() < teamEnds;
}

function currentMaliadesDockings(session: GameSession): readonly Record<string, unknown>[] | null {
  const raw = (session as unknown as Record<string, unknown>).shuttleDockings;
  if (!Array.isArray(raw) || raw.some((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return true;
    const docking = entry as Record<string, unknown>;
    return typeof docking.shuttleId !== 'string' || !docking.shuttleId.trim() ||
      typeof docking.shipId !== 'string' || !docking.shipId.trim() ||
      typeof docking.dockedAt !== 'string' || !docking.dockedAt.trim() ||
      docking.inTransit === true || docking.transit === true ||
      docking.status === 'in-transit' || docking.state === 'in-transit' ||
      docking.dockingState === 'in-transit';
  })) return null;
  return raw.filter((entry) => (entry as Record<string, unknown>).shuttleId === 'maliades') as Record<string, unknown>[];
}

function currentMaliadesRepairAuthorityMatches(attempt: MaliadesRepairAttemptAuthority): boolean {
  const current = useSessionStore.getState();
  const session = current.session as GameSession | undefined;
  const me = current.me;
  const control = session?.shuttleControl?.maliades;
  const dockings = session ? currentMaliadesDockings(session) : null;
  const activeVesselIds = session?.activeVesselIds;
  return hasFreshSessionAuthority() && session?.id === attempt.sessionId &&
    me?.sessionId === attempt.sessionId && me.uid === attempt.uid && me.role === attempt.role &&
    me.role === 'player' && me.assignedRoleId === attempt.assignedRoleId &&
    me.assignedRoleId === 'dione-engineer' && me.activeConsoleRoleId === attempt.activeConsoleRoleId &&
    me.activeConsoleRoleId === 'dione-engineer' && me.fleetGroupId === attempt.fleetGroupId &&
    session.phase === 'active' && liveTeamPhase(session) &&
    control?.shuttleId === 'maliades' && control.ownerRoleId === 'dione-engineer' &&
    control.ownerUid === attempt.ownerUid && control.holderUid === attempt.uid &&
    isSafeCounter(control.revision) && control.revision >= attempt.expectedControlRevision &&
    dockings !== null && dockings.length === 1 && dockings[0]?.shipId === attempt.expectedHostShipId &&
    Array.isArray(activeVesselIds) && activeVesselIds.every((shipId) => typeof shipId === 'string') &&
    activeVesselIds.includes(attempt.expectedHostShipId);
}

function parseStaleReply(
  value: unknown,
  expected: Readonly<{
    sessionId: string;
    requestId: string;
    expectedCycle: number;
    expectedControlRevision: number;
    expectedRevision: number;
    expectedHostShipId: string;
    damageToRepair: number;
  }>,
): MaliadesRepairStaleReply | undefined {
  const raw = record(value);
  const fields = [
    'status', 'sessionId', 'requestId', 'craftId', 'expectedHostShipId', 'damageToRepair',
    'expectedControlRevision', 'currentControlRevision', 'expectedRevision', 'currentRevision',
    'expectedCycle', 'currentCycle',
  ];
  if (!raw || Object.keys(raw).length !== fields.length || fields.some((field) => !Object.hasOwn(raw, field)) ||
      raw.status !== 'stale' || raw.sessionId !== expected.sessionId || raw.requestId !== expected.requestId ||
      raw.craftId !== 'maliades' || raw.expectedHostShipId !== expected.expectedHostShipId ||
      raw.damageToRepair !== expected.damageToRepair ||
      raw.expectedControlRevision !== expected.expectedControlRevision ||
      raw.expectedRevision !== expected.expectedRevision || raw.expectedCycle !== expected.expectedCycle ||
      !isSafeCounter(raw.currentControlRevision) || raw.currentControlRevision < expected.expectedControlRevision ||
      !isSafeCounter(raw.currentRevision) || raw.currentRevision < expected.expectedRevision ||
      !Number.isSafeInteger(raw.currentCycle) || (raw.currentCycle as number) < expected.expectedCycle ||
      (raw.currentControlRevision === expected.expectedControlRevision &&
        raw.currentRevision === expected.expectedRevision && raw.currentCycle === expected.expectedCycle)) return undefined;
  return raw as unknown as MaliadesRepairStaleReply;
}

function parseBaseReply(value: unknown, sessionId: string, requestId: string, expectedCycle: number, expectedRevision: number): Record<string, unknown> {
  const raw = record(value);
  if (!raw || (raw.status !== 'committed' && raw.status !== 'replayed') ||
      raw.sessionId !== sessionId || raw.requestId !== requestId || raw.craftId !== 'maliades' ||
      raw.cycle !== expectedCycle || raw.revision !== expectedRevision + 1) {
    throw new Error('The Maliades response was malformed. Refresh before acting again.');
  }
  const state = parseMaliadesState(raw.state);
  if (!state || !state.launched || state.revision !== expectedRevision + 1) {
    throw new Error('The Maliades response contained invalid authoritative state.');
  }
  return { ...raw, state };
}

export async function resolveMaliadesMedium(
  expectedCycle: number,
  expectedRevision: number,
  choices: readonly MaliadesMediumChoice[],
): Promise<MaliadesActionReply> {
  const { session, me } = useSessionStore.getState();
  if (!session || !me) throw new Error('Reconnect before operating Maliades.');
  requireFreshSessionAuthority();
  if (!Number.isSafeInteger(expectedCycle) || expectedCycle < 1 ||
      !Number.isSafeInteger(expectedRevision) || expectedRevision < 1 ||
      choices.length < 1 || choices.length > 2 ||
      choices.some(choice => !safeId(choice.targetId)) ||
      new Set(choices.map(choice => choice.targetId)).size !== choices.length ||
      choices.some(choice => choice.kind === 'target-shift' && choice.shift !== -1 && choice.shift !== 1)) {
    throw new Error('The Maliades Medium selection is invalid. Refresh the console and try again.');
  }
  throw new Error('Maliades range choices are not available for this attack.');
}

export async function resolveMaliadesShort(
  expectedCycle: number,
  expectedRevision: number,
  targetIds: readonly string[],
): Promise<MaliadesActionReply> {
  const { session, me } = useSessionStore.getState();
  if (!session || !me) throw new Error('Reconnect before operating Maliades.');
  requireFreshSessionAuthority();
  if (!Number.isSafeInteger(expectedCycle) || expectedCycle < 1 ||
      !Number.isSafeInteger(expectedRevision) || expectedRevision < 1 ||
      targetIds.length < 1 || targetIds.length > 2 || targetIds.some(id => !safeId(id)) ||
      new Set(targetIds).size !== targetIds.length) {
    throw new Error('The Maliades Short selection is invalid. Refresh the console and try again.');
  }
  throw new Error('Maliades range choices are not available for this attack.');
}

export async function repairMaliades(
  expectedCycle: number,
  expectedRevision: number,
  expectedHostShipId: string,
  damageToRepair: number,
): Promise<MaliadesRepairReply> {
  const { session, me } = useSessionStore.getState();
  if (!session || !me) throw new Error('Reconnect before repairing Maliades.');
  requireFreshSessionAuthority();
  if (!Number.isSafeInteger(expectedCycle) || expectedCycle < 1 ||
      !Number.isSafeInteger(expectedRevision) || expectedRevision < 1 ||
      !safeId(expectedHostShipId) || !Number.isSafeInteger(damageToRepair) ||
      damageToRepair < 1 || damageToRepair > 3) {
    throw new Error('The Maliades repair selection is invalid. Refresh the console and try again.');
  }
  const checkpoint = captureSessionAuthority(session.id, me.uid);
  const control = session.shuttleControl?.maliades;
  if (!control || control.shuttleId !== 'maliades' || control.ownerRoleId !== 'dione-engineer' ||
      control.holderUid !== me.uid || typeof control.ownerUid !== 'string' || !control.ownerUid.trim() ||
      !isSafeCounter(control.revision) || !liveTeamPhase(session as GameSession)) {
    throw new Error('The current Maliades holder, control revision, or Team Phase is unavailable.');
  }
  const attempt: MaliadesRepairAttemptAuthority = {
    sessionId: session.id, uid: me.uid, role: me.role,
    assignedRoleId: me.assignedRoleId, activeConsoleRoleId: me.activeConsoleRoleId,
    fleetGroupId: typeof me.fleetGroupId === 'string' ? me.fleetGroupId : '',
    ownerUid: control.ownerUid, expectedHostShipId, expectedControlRevision: control.revision,
  };
  if (!attempt.fleetGroupId.trim() || !currentMaliadesRepairAuthorityMatches(attempt)) {
    throw new Error('The current Maliades holder, fleet group, dock, or Team Phase is unavailable.');
  }
  const payload = {
    sessionId: session.id, requestId: commandId(), expectedCycle, expectedControlRevision: control.revision,
    expectedRevision, expectedHostShipId, damageToRepair,
  };
  const response = await httpsCallable<typeof payload, unknown>(functions(), 'repairMaliades')(payload);
  const rawValue = response.data;
  const stale = record(rawValue)?.status === 'stale'
    ? parseStaleReply(rawValue, payload)
    : undefined;
  if (record(rawValue)?.status === 'stale') {
    if (!stale) throw new Error('The Maliades repair stale response was malformed or mismatched.');
    if (!currentMaliadesRepairAuthorityMatches(attempt)) {
      throw new Error('Maliades repair authority or Team Phase changed while the request was pending.');
    }
    return stale;
  }
  const raw = parseBaseReply(rawValue, session.id, payload.requestId, expectedCycle, expectedRevision);
  if (typeof raw.hostShipId !== 'string' || raw.hostShipId !== expectedHostShipId ||
      raw.damageRepaired !== damageToRepair || !Number.isSafeInteger(raw.materialsRemaining) ||
      (raw.materialsRemaining as number) < 0) {
    throw new Error('The Maliades repair response was malformed.');
  }
  const reply = raw as unknown as MaliadesRepairReply;
  if (!isCurrentSessionAuthority(checkpoint)) return reply;
  return reply;
}
