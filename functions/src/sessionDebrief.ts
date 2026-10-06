import type { DocumentReference, DocumentSnapshot, Transaction } from 'firebase-admin/firestore';
import { assertLifecycleTransition, type LifecyclePhase } from './lifecycle';

export type SessionDebriefSource = 'candidate' | 'final-cycle' | 'failure-review';
export type DebriefAudience = 'members' | 'gm';

export interface CandidateDebriefRequirement {
  readonly id: string;
  readonly status: 'met' | 'unmet';
}

export interface CandidateDebriefRoll {
  readonly id: string;
  readonly result: 'success' | 'failure';
  readonly audience: DebriefAudience;
  readonly face?: number;
}

export interface CandidateDebriefLoss {
  readonly shipId: string;
  readonly reason: string;
  readonly audience: DebriefAudience;
}

export interface CandidateDebriefCall {
  readonly id: string;
  readonly cycle: number;
  readonly audience: DebriefAudience;
}

export type CandidateDebriefPathAction =
  | 'ring-repair' | 'ring-passage' | 'sabotage-ring' | 'nebula-jump'
  | 'station-liberation' | 'contribute-reactor' | 'station-activation';
export type CandidateDebriefPathResult = 'completed' | 'crossed' | 'reached' | 'lost' | 'left-behind' | 'activated';
export interface CandidateDebriefPathStep {
  readonly action: CandidateDebriefPathAction;
  readonly result: CandidateDebriefPathResult;
  readonly audience: DebriefAudience;
  readonly shipId?: string;
  readonly fuelSpent?: number;
  readonly capacity?: number;
}

export interface CandidateDebriefGroupInput {
  readonly groupId: string;
  readonly requirements: readonly CandidateDebriefRequirement[];
  readonly rolls: readonly CandidateDebriefRoll[];
  readonly losses: readonly CandidateDebriefLoss[];
  readonly humanCalls: readonly CandidateDebriefCall[];
  readonly path?: readonly CandidateDebriefPathStep[];
}

export interface CandidateDebriefInput {
  readonly code: 'N' | 'O' | 'P';
  readonly groups: readonly CandidateDebriefGroupInput[];
}

/** Server-only transaction input. Outcomes and patch values must come from server calculations. */
export interface SessionDebriefInput {
  readonly source: SessionDebriefSource;
  readonly committedAt: string;
  readonly outcome?: unknown;
  readonly survivorOutcome?: unknown;
  readonly candidate?: CandidateDebriefInput;
  readonly sessionPatch?: Record<string, unknown>;
}

export interface CandidateDebriefGroup {
  readonly groupId: string;
  readonly requirements: readonly CandidateDebriefRequirement[];
  readonly rolls: readonly CandidateDebriefRoll[];
  readonly losses: readonly CandidateDebriefLoss[];
  readonly humanCalls: readonly CandidateDebriefCall[];
  readonly path?: readonly CandidateDebriefPathStep[];
}

export interface SessionDebriefSnapshot {
  readonly type: 'session-debrief';
  readonly version: 1;
  readonly source: SessionDebriefSource;
  readonly result: 'success' | 'failure' | 'completed';
  readonly cause: string;
  readonly cycle: number;
  readonly occurredAt: string;
  readonly committedAt: string;
  readonly outcome?: Record<string, unknown>;
  readonly survivorOutcome?: Record<string, unknown>;
  readonly candidate?: {
    readonly code: 'N' | 'O' | 'P';
    readonly groups: readonly CandidateDebriefGroup[];
  };
}

export interface SessionDebriefProjectionScope {
  readonly groupId: string;
  readonly vesselIds: readonly string[];
  /** Set only after a live GM instance has been checked in the same transaction. */
  readonly gm?: boolean;
}

export interface TerminalCommitResult {
  readonly committed: boolean;
  readonly snapshot: SessionDebriefSnapshot;
}

export interface CloseSessionResult {
  readonly closed: boolean;
  readonly snapshot: SessionDebriefSnapshot;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function safeId(value: unknown, maxLength = 80): value is string {
  return typeof value === 'string' && value.length <= maxLength && /^[\w-]+$/.test(value);
}

function isoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === new Date(value).toISOString();
}

function audience(value: unknown): value is DebriefAudience {
  return value === 'members' || value === 'gm';
}

function safeCandidateCode(value: unknown): value is 'N' | 'O' | 'P' {
  return value === 'N' || value === 'O' || value === 'P';
}

const PATH_RESULTS: Readonly<Record<CandidateDebriefPathAction, readonly CandidateDebriefPathResult[]>> = {
  'ring-repair': ['completed'], 'ring-passage': ['crossed'], 'sabotage-ring': ['completed'],
  'nebula-jump': ['reached', 'lost', 'left-behind'], 'station-liberation': ['completed'],
  'contribute-reactor': ['completed'], 'station-activation': ['activated'],
};

function parseCandidatePath(value: unknown): CandidateDebriefPathStep[] | undefined {
  if (!Array.isArray(value) || value.length > 200) return undefined;
  const steps: CandidateDebriefPathStep[] = [];
  for (const item of value) {
    const step = record(item);
    const allowed = ['action', 'result', 'audience', 'shipId', 'fuelSpent', 'capacity'];
    if (!step || Object.keys(step).some(key => !allowed.includes(key)) ||
        !Object.hasOwn(PATH_RESULTS, String(step.action)) ||
        !PATH_RESULTS[step.action as CandidateDebriefPathAction]?.includes(step.result as CandidateDebriefPathResult) ||
        !audience(step.audience) || step.shipId !== undefined && !safeId(step.shipId) ||
        step.fuelSpent !== undefined && (!Number.isSafeInteger(step.fuelSpent) || Number(step.fuelSpent) < 0 || Number(step.fuelSpent) > 1_000_000) ||
        step.capacity !== undefined && (!Number.isSafeInteger(step.capacity) || Number(step.capacity) < 0 || Number(step.capacity) > 1_000_000) ||
        ![3, 4, 5, 6].includes(Object.keys(step).length)) return undefined;
    steps.push({
      action: step.action as CandidateDebriefPathAction,
      result: step.result as CandidateDebriefPathResult,
      audience: step.audience,
      ...(step.shipId === undefined ? {} : { shipId: step.shipId }),
      ...(step.fuelSpent === undefined ? {} : { fuelSpent: Number(step.fuelSpent) }),
      ...(step.capacity === undefined ? {} : { capacity: Number(step.capacity) }),
    });
  }
  return steps;
}

function parseCandidateSummary(value: unknown): SessionDebriefSnapshot['candidate'] {
  const raw = record(value);
  if (!raw || Object.keys(raw).length !== 2 || Object.keys(raw).some(key => !['code', 'groups'].includes(key)) ||
      !safeCandidateCode(raw.code) || !Array.isArray(raw.groups) || raw.groups.length > 100) return undefined;
  const seenGroups = new Set<string>();
  const groups: CandidateDebriefGroup[] = [];
  for (const entry of raw.groups) {
    const group = record(entry);
    if (!group || ![5, 6].includes(Object.keys(group).length) ||
        Object.keys(group).some(key => !['groupId', 'requirements', 'rolls', 'losses', 'humanCalls', 'path'].includes(key)) ||
        !safeId(group.groupId) || seenGroups.has(group.groupId) ||
        !Array.isArray(group.requirements) || group.requirements.length > 50 ||
        !Array.isArray(group.rolls) || group.rolls.length > 50 ||
        !Array.isArray(group.losses) || group.losses.length > 100 ||
        !Array.isArray(group.humanCalls) || group.humanCalls.length > 50) return undefined;
    const path = group.path === undefined ? undefined : parseCandidatePath(group.path);
    if (group.path !== undefined && !path) return undefined;
    seenGroups.add(group.groupId);
    const requirements: CandidateDebriefRequirement[] = [];
    const requirementIds = new Set<string>();
    for (const item of group.requirements) {
      const requirement = record(item);
      if (!requirement || Object.keys(requirement).length !== 2 ||
          Object.keys(requirement).some(key => !['id', 'status'].includes(key)) ||
          !safeId(requirement.id) || requirementIds.has(requirement.id) ||
          requirement.status !== 'met' && requirement.status !== 'unmet') return undefined;
      requirementIds.add(requirement.id);
      requirements.push({ id: requirement.id, status: requirement.status });
    }
    const rolls: CandidateDebriefRoll[] = [];
    const rollIds = new Set<string>();
    for (const item of group.rolls) {
      const roll = record(item);
      if (!roll || Object.keys(roll).some(key => !['id', 'face', 'result', 'audience'].includes(key)) ||
          ![3, 4].includes(Object.keys(roll).length) || !safeId(roll.id) || rollIds.has(roll.id) ||
          roll.result !== 'success' && roll.result !== 'failure' || !audience(roll.audience) ||
          roll.face !== undefined && (!Number.isSafeInteger(roll.face) || Number(roll.face) < 1 || Number(roll.face) > 12)) return undefined;
      rollIds.add(roll.id);
      rolls.push({ id: roll.id, result: roll.result, audience: roll.audience,
        ...(roll.face === undefined ? {} : { face: Number(roll.face) }) });
    }
    const losses: CandidateDebriefLoss[] = [];
    const lossIds = new Set<string>();
    for (const item of group.losses) {
      const loss = record(item);
      if (!loss || Object.keys(loss).length !== 3 ||
          Object.keys(loss).some(key => !['shipId', 'reason', 'audience'].includes(key)) ||
          !safeId(loss.shipId) || lossIds.has(loss.shipId) || !safeId(loss.reason, 64) || !audience(loss.audience)) return undefined;
      lossIds.add(loss.shipId);
      losses.push({ shipId: loss.shipId, reason: loss.reason, audience: loss.audience });
    }
    const humanCalls: CandidateDebriefCall[] = [];
    const callIds = new Set<string>();
    for (const item of group.humanCalls) {
      const call = record(item);
      if (!call || Object.keys(call).length !== 3 ||
          Object.keys(call).some(key => !['id', 'cycle', 'audience'].includes(key)) ||
          !safeId(call.id) || callIds.has(call.id) || !Number.isSafeInteger(call.cycle) ||
          Number(call.cycle) < 0 || !audience(call.audience)) return undefined;
      callIds.add(call.id);
      humanCalls.push({ id: call.id, cycle: Number(call.cycle), audience: call.audience });
    }
    groups.push({ groupId: group.groupId, requirements, rolls, losses, humanCalls, ...(path ? { path } : {}) });
  }
  return { code: raw.code, groups };
}

function validCandidateOFailure(
  outcome: Record<string, unknown> | undefined,
  candidate: SessionDebriefSnapshot['candidate'],
  survivorOutcome: Record<string, unknown> | undefined,
): boolean {
  if (!outcome || outcome.result !== 'failure' || outcome.cause !== 'total-fleet-loss' ||
      !candidate || candidate.code !== 'O' || candidate.groups.length === 0 || !survivorOutcome ||
      outcome.cycle !== survivorOutcome.cycle || outcome.occurredAt !== survivorOutcome.occurredAt ||
      survivorOutcome.survivingShipPopulation !== 0 || !Array.isArray(survivorOutcome.survivingShipIds) ||
      survivorOutcome.survivingShipIds.length !== 0 || !Array.isArray(survivorOutcome.lostOrDestroyedShipIds) ||
      survivorOutcome.lostOrDestroyedShipIds.length === 0) return false;
  const lostShips = new Set(survivorOutcome.lostOrDestroyedShipIds as string[]);
  const candidateLosses = candidate.groups.flatMap(group => group.losses);
  return candidateLosses.length > 0 && candidateLosses.every(loss => lostShips.has(loss.shipId));
}

/** Strip untrusted or private server fields before an outcome can enter the public receipt. */
export function safeGameOutcome(value: unknown): Record<string, unknown> | undefined {
  const raw = record(value);
  if (!raw || raw.type !== 'game-outcome' || !['success', 'failure'].includes(String(raw.result)) ||
      !safeId(raw.cause, 64) || !Number.isSafeInteger(raw.cycle) || Number(raw.cycle) < 0 ||
      !isoTimestamp(raw.occurredAt)) return undefined;
  if (raw.cause === 'pursuit-limit' && raw.result === 'failure' &&
      Number.isSafeInteger(raw.navigationRevision) && Number(raw.navigationRevision) >= 1) {
    return { type: 'game-outcome', result: 'failure', cause: 'pursuit-limit', cycle: Number(raw.cycle),
      navigationRevision: Number(raw.navigationRevision), occurredAt: raw.occurredAt };
  }
  if (raw.cause === 'total-fleet-loss' && raw.result === 'failure') {
    return { type: 'game-outcome', result: 'failure', cause: 'total-fleet-loss', cycle: Number(raw.cycle), occurredAt: raw.occurredAt };
  }
  if (raw.cause === 'candidate-complete' && raw.result === 'success' && safeCandidateCode(raw.candidateCode)) {
    return { type: 'game-outcome', result: 'success', cause: 'candidate-complete',
      candidateCode: raw.candidateCode, cycle: Number(raw.cycle), occurredAt: raw.occurredAt };
  }
  return undefined;
}

export function safeSurvivorOutcome(value: unknown): Record<string, unknown> | undefined {
  const raw = record(value);
  const expected = [
    'type', 'cycle', 'occurredAt', 'fleetShipPopulation', 'survivingShipPopulation',
    'evacuatedPopulation', 'escapePodCapacity', 'lostPopulation', 'smallVesselPopulation',
    'admittedVesselPopulation', 'finalSurvivors', 'survivingShipIds', 'lostOrDestroyedShipIds',
  ];
  if (!raw || Object.keys(raw).length !== expected.length || Object.keys(raw).some(key => !expected.includes(key)) ||
      raw.type !== 'survivor-outcome' || !Number.isSafeInteger(raw.cycle) || Number(raw.cycle) < 0 ||
      !isoTimestamp(raw.occurredAt) || !Array.isArray(raw.survivingShipIds) ||
      !Array.isArray(raw.lostOrDestroyedShipIds)) return undefined;
  const numbers = [raw.fleetShipPopulation, raw.survivingShipPopulation, raw.evacuatedPopulation,
    raw.escapePodCapacity, raw.lostPopulation, raw.smallVesselPopulation, raw.admittedVesselPopulation, raw.finalSurvivors];
  if (numbers.some(number => !Number.isSafeInteger(number) || Number(number) < 0) ||
      raw.evacuatedPopulation !== undefined && Number(raw.evacuatedPopulation) > Number(raw.escapePodCapacity) ||
      Number(raw.fleetShipPopulation) !== Number(raw.survivingShipPopulation) + Number(raw.evacuatedPopulation) + Number(raw.lostPopulation) ||
      Number(raw.finalSurvivors) !== Number(raw.survivingShipPopulation) + Number(raw.evacuatedPopulation) +
        Number(raw.smallVesselPopulation) + Number(raw.admittedVesselPopulation)) return undefined;
  const survivingShipIds = raw.survivingShipIds.filter((id): id is string => safeId(id));
  const lostOrDestroyedShipIds = raw.lostOrDestroyedShipIds.filter((id): id is string => safeId(id));
  if (survivingShipIds.length !== raw.survivingShipIds.length ||
      lostOrDestroyedShipIds.length !== raw.lostOrDestroyedShipIds.length ||
      new Set([...survivingShipIds, ...lostOrDestroyedShipIds]).size !== survivingShipIds.length + lostOrDestroyedShipIds.length) return undefined;
  return {
    type: 'survivor-outcome', cycle: Number(raw.cycle), occurredAt: raw.occurredAt,
    fleetShipPopulation: Number(raw.fleetShipPopulation), survivingShipPopulation: Number(raw.survivingShipPopulation),
    evacuatedPopulation: Number(raw.evacuatedPopulation), escapePodCapacity: Number(raw.escapePodCapacity),
    lostPopulation: Number(raw.lostPopulation), smallVesselPopulation: Number(raw.smallVesselPopulation),
    admittedVesselPopulation: Number(raw.admittedVesselPopulation), finalSurvivors: Number(raw.finalSurvivors),
    survivingShipIds, lostOrDestroyedShipIds,
  };
}

function safePatch(source: SessionDebriefSource, value: unknown): Record<string, unknown> {
  const patch = record(value);
  if (!patch) return {};
  const allowed = source === 'candidate'
    ? new Set(['candidateVesselOutcomes'])
    : source === 'final-cycle'
      ? new Set(['currentTurn', 'turnPhase', 'turnState', 'turnStartAnnouncement', 'pendingTeamAnnouncements',
        'fleetTicker', 'maintenanceCycles', 'shuttleFuelled', 'pursuitGroups', 'singlePlayerDemo'])
      : new Set<string>();
  if (Object.keys(patch).some(key => !allowed.has(key))) throw new Error('Invalid session debrief patch.');
  return patch;
}

function sessionPhase(snapshot: DocumentSnapshot): LifecyclePhase {
  const phase = snapshot.get('phase');
  if (['lobby', 'casting', 'briefing', 'active', 'success', 'failure', 'debrief', 'closed', 'retained-empty'].includes(String(phase))) {
    return phase as LifecyclePhase;
  }
  throw new Error('Session lifecycle phase is unavailable.');
}

function comparable(value: SessionDebriefSnapshot): string {
  const { committedAt: _committedAt, ...rest } = value;
  void _committedAt;
  return JSON.stringify(rest);
}

function storedDebrief(value: unknown): SessionDebriefSnapshot | undefined {
  const raw = record(value);
  if (!raw || Object.keys(raw).some(key => ![
    'type', 'version', 'source', 'result', 'cause', 'cycle', 'occurredAt', 'committedAt',
    'outcome', 'survivorOutcome', 'candidate',
  ].includes(key)) || raw.type !== 'session-debrief' || raw.version !== 1 ||
      !['candidate', 'final-cycle', 'failure-review'].includes(String(raw.source)) ||
      !['success', 'failure', 'completed'].includes(String(raw.result)) || !safeId(raw.cause, 64) ||
      !Number.isSafeInteger(raw.cycle) || Number(raw.cycle) < 0 ||
      !isoTimestamp(raw.occurredAt) || !isoTimestamp(raw.committedAt)) return undefined;
  const outcome = raw.outcome === undefined ? undefined : safeGameOutcome(raw.outcome);
  const survivorOutcome = raw.survivorOutcome === undefined ? undefined : safeSurvivorOutcome(raw.survivorOutcome);
  const candidate = raw.candidate === undefined ? undefined : parseCandidateSummary(raw.candidate);
  if (raw.outcome !== undefined && !outcome || raw.survivorOutcome !== undefined && !survivorOutcome ||
      raw.candidate !== undefined && !candidate) return undefined;
  if (raw.source === 'candidate' && (!outcome || !candidate ||
      !(outcome.result === 'success' && outcome.cause === 'candidate-complete' && candidate.code === outcome.candidateCode ||
        validCandidateOFailure(outcome, candidate, survivorOutcome)))) return undefined;
  if (raw.source === 'final-cycle' && (raw.result !== 'completed' || outcome)) return undefined;
  return {
    type: 'session-debrief', version: 1, source: raw.source as SessionDebriefSource,
    result: raw.result as SessionDebriefSnapshot['result'], cause: raw.cause,
    cycle: Number(raw.cycle), occurredAt: raw.occurredAt, committedAt: raw.committedAt,
    ...(outcome ? { outcome } : {}), ...(survivorOutcome ? { survivorOutcome } : {}), ...(candidate ? { candidate } : {}),
  };
}

function buildSnapshot(snapshot: DocumentSnapshot, input: SessionDebriefInput): SessionDebriefSnapshot {
  if (!isoTimestamp(input.committedAt)) throw new Error('A committed debrief timestamp is required.');
  const candidate = input.candidate === undefined ? undefined : parseCandidateSummary(input.candidate);
  if (input.candidate !== undefined && !candidate) throw new Error('Candidate debrief details are malformed.');
  const rawOutcome = input.outcome ?? (input.source === 'failure-review' ? snapshot.get('gameOutcome') : undefined);
  const outcome = rawOutcome === undefined ? undefined : safeGameOutcome(rawOutcome);
  if (rawOutcome !== undefined && !outcome) throw new Error('The committed game outcome is malformed.');
  const rawSurvivorOutcome = input.survivorOutcome ?? snapshot.get('survivorOutcome');
  const survivorOutcome = rawSurvivorOutcome === undefined ? undefined : safeSurvivorOutcome(rawSurvivorOutcome);
  if (rawSurvivorOutcome !== undefined && !survivorOutcome) throw new Error('The committed survivor outcome is malformed.');
  if (input.source === 'candidate' && (!outcome || !candidate ||
      !(outcome.result === 'success' && outcome.cause === 'candidate-complete' && candidate.code === outcome.candidateCode ||
        validCandidateOFailure(outcome, candidate, survivorOutcome)))) {
    throw new Error('A candidate terminal result must include its authoritative explanation.');
  }
  if (input.source === 'final-cycle' && (outcome || !survivorOutcome)) throw new Error('Final-cycle debrief requires an authoritative survivor outcome.');
  if (input.source === 'failure-review' && (!outcome || outcome.result !== 'failure')) throw new Error('A failure debrief requires a committed server failure.');
  const cycle = outcome ? Number(outcome.cycle) : Number(survivorOutcome?.cycle);
  const occurredAt = outcome ? String(outcome.occurredAt) : String(survivorOutcome?.occurredAt);
  if (!Number.isSafeInteger(cycle) || cycle < 0 || !isoTimestamp(occurredAt)) throw new Error('Terminal cycle details are unavailable.');
  return {
    type: 'session-debrief', version: 1, source: input.source,
    result: outcome?.result === 'success' ? 'success' : outcome?.result === 'failure' ? 'failure' : 'completed',
    cause: outcome ? String(outcome.cause) : 'final-cycle', cycle, occurredAt, committedAt: input.committedAt,
    ...(outcome ? { outcome } : {}), ...(survivorOutcome ? { survivorOutcome } : {}), ...(candidate ? { candidate } : {}),
  };
}

/** Commit the one server-authored end state and immutable read model in the caller's transaction. */
export function commitTerminal(
  tx: Transaction,
  sessionRef: DocumentReference,
  sessionSnapshot: DocumentSnapshot,
  input: SessionDebriefInput,
): TerminalCommitResult {
  if (!sessionSnapshot.exists) throw new Error('Session does not exist.');
  const current = storedDebrief(sessionSnapshot.get('debriefSnapshot'));
  const next = buildSnapshot(sessionSnapshot, input);
  if (current) {
    if (comparable(current) !== comparable(next)) throw new Error('Conflicting immutable session debrief.');
    return { committed: false, snapshot: current };
  }
  const from = sessionPhase(sessionSnapshot);
  if (input.source === 'candidate' && from !== 'active' ||
      input.source === 'final-cycle' && from !== 'active' ||
      input.source === 'failure-review' && from !== 'failure' && from !== 'success' && from !== 'debrief') {
    throw new Error(`Cannot commit ${input.source} debrief from ${from}.`);
  }
  assertLifecycleTransition(from, 'debrief');
  const patch = safePatch(input.source, input.sessionPatch);
  const rawDemo = record(sessionSnapshot.get('fullGameDemo'));
  const fullGameDemo = rawDemo && Object.keys(rawDemo).length === 2 &&
    rawDemo.progression === 'manual' && (rawDemo.status === 'active' || rawDemo.status === 'complete')
    ? { status: 'complete', progression: 'manual' } : undefined;
  tx.update(sessionRef, {
    ...patch,
    phase: 'debrief',
    ...(next.outcome ? { gameOutcome: next.outcome } : {}),
    ...(next.survivorOutcome ? { survivorOutcome: next.survivorOutcome } : {}),
    debriefSnapshot: next,
    ...(fullGameDemo ? { fullGameDemo } : {}),
    updatedAt: new Date(),
  });
  return { committed: true, snapshot: next };
}

/** Close only a validated, already frozen debrief; retries preserve its original result byte-for-byte. */
export function closeSessionInTransaction(
  tx: Transaction,
  sessionRef: DocumentReference,
  sessionSnapshot: DocumentSnapshot,
): CloseSessionResult {
  if (!sessionSnapshot.exists) throw new Error('Session does not exist.');
  const snapshot = storedDebrief(sessionSnapshot.get('debriefSnapshot'));
  if (!snapshot) throw new Error('A committed debrief is required before closure.');
  const phase = sessionPhase(sessionSnapshot);
  if (phase === 'closed') return { closed: false, snapshot };
  assertLifecycleTransition(phase, 'closed');
  if (phase !== 'debrief') throw new Error('Only a debrief can be closed.');
  tx.update(sessionRef, { phase: 'closed', updatedAt: new Date() });
  return { closed: true, snapshot };
}

/** Parse and audience-filter the immutable snapshot for a current or historical member. */
export function sessionDebriefProjection(
  value: unknown,
  scope: SessionDebriefProjectionScope,
): Record<string, unknown> | undefined {
  const snapshot = storedDebrief(value);
  if (!snapshot) return undefined;
  const gm = scope.gm === true;
  const allowedShips = new Set(scope.vesselIds);
  const outcome = snapshot.outcome ? safeGameOutcome(snapshot.outcome) : undefined;
  const survivorOutcome = snapshot.survivorOutcome;
  const candidate = snapshot.candidate && (gm || scope.groupId !== 'gm')
    ? {
      code: snapshot.candidate.code,
      groups: snapshot.candidate.groups
        .filter(group => gm || group.groupId === scope.groupId)
        .map(group => ({
          ...(gm ? { groupId: group.groupId } : {}),
          requirements: group.requirements,
          rolls: group.rolls.filter(roll => gm || roll.audience === 'members')
            .map(({ id, face, result }) => ({ id, ...(face === undefined ? {} : { face }), result })),
          losses: group.losses.filter(loss => (gm || loss.audience === 'members') && allowedShips.has(loss.shipId))
            .map(({ shipId, reason }) => ({ shipId, reason })),
          humanCalls: group.humanCalls.filter(call => gm || call.audience === 'members')
            .map(({ id, cycle }) => ({ id, cycle })),
          ...(group.path ? { path: group.path.filter(step => gm || step.audience === 'members' &&
            (step.shipId === undefined || allowedShips.has(step.shipId)))
            .map(({ audience: _audience, ...step }) => { void _audience; return step; }) } : {}),
        })),
    }
    : undefined;
  return {
    type: snapshot.type, version: snapshot.version, source: snapshot.source,
    result: snapshot.result, cause: snapshot.cause,
    cycle: snapshot.cycle, occurredAt: snapshot.occurredAt, committedAt: snapshot.committedAt,
    ...(outcome ? { outcome } : {}),
    ...(survivorOutcome ? { survivorOutcome: {
      ...survivorOutcome,
      survivingShipIds: gm ? survivorOutcome.survivingShipIds : (survivorOutcome.survivingShipIds as string[]).filter(id => allowedShips.has(id)),
      lostOrDestroyedShipIds: gm ? survivorOutcome.lostOrDestroyedShipIds :
        (survivorOutcome.lostOrDestroyedShipIds as string[]).filter(id => allowedShips.has(id)),
    } } : {}),
    ...(candidate ? { candidate } : {}),
  };
}
