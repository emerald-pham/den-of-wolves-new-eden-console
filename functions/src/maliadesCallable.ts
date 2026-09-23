import { randomInt } from 'node:crypto';
import { FieldValue, getFirestore, type DocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { boundCoreConsoleRole } from './consoleRolePolicy';
import { commandReceiptDisposition, type CommandFingerprint } from './commandIdempotency';
import { commandError } from './commandErrors';
import { EventVisibility, buildAuthoritativeEventEnvelope } from './eventEnvelope';
import { buildPrivacySafeEventRecord } from './eventRedaction';
import { fleetGroupRecord } from './fleetGroups';
import { CALLABLE_RUNTIME_OPTIONS } from './runtimeOptions';
import { isPresenceStale } from './sessionLifecycle';
import { parseShuttleControl } from './shuttleControl';
import { shuttleDockingsAreParked } from './craftOwnership';
import { turnPhaseState } from './turnZero';
import { serviceRechargeDamageState, serviceRechargeResourceState } from './serviceShuttleRecharge';
import { isResourceShipId } from './resources';
import { SHIP_DAMAGE_DECKS } from './shipDamage';
import {
  shiftWolfTargetDie,
  wolfTargetForDie,
  type WolfTargetingReceipt,
} from './wolfCombatMath';
import { parseWolfTargetingReceipt } from './wolfCommanderRerolls';
import {
  parseMaliadesState,
  repairMaliades as repairMaliadesState,
  resolveMaliadesMedium as resolveMaliadesMediumState,
  resolveMaliadesShort as resolveMaliadesShortState,
  type MaliadesMediumChoice,
} from './maliadesState';

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireUid(auth: { uid?: string } | undefined): string {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'Sign in before using Maliades.');
  return auth.uid;
}

function activePlayer(player: DocumentSnapshot): boolean {
  if (!player.exists || player.get('connected') !== true || player.get('kickedAt') != null) return false;
  const lastSeenAt = player.get('lastSeenAt');
  return lastSeenAt === undefined ||
    (lastSeenAt instanceof Date && !isPresenceStale(lastSeenAt, new Date())) ||
    (typeof lastSeenAt?.toDate === 'function' && !isPresenceStale(lastSeenAt.toDate(), new Date()));
}

function requireDioneEngineer(player: DocumentSnapshot, uid: string): void {
  if (!activePlayer(player) || player.get('role') !== 'player' ||
      player.get('activeConsoleRoleId') !== 'dione-engineer' ||
      boundCoreConsoleRole(player.get('assignedRoleId'), player.get('seatId')) !== 'dione-engineer' ||
      player.id !== uid || (player.get('escapeState') !== undefined && player.get('escapeState') !== null)) {
    throw new HttpsError('permission-denied', 'Only the active Dione Engineer may use Maliades.');
  }
}

function exactCommandRequest(raw: unknown, kind: 'medium' | 'short' | 'repair'): Readonly<{
  sessionId: string; requestId: string; expectedCycle: number; expectedRevision: number;
  choices?: readonly MaliadesMediumChoice[]; targetIds?: readonly string[]; expectedHostShipId?: string;
  damageToRepair?: number;
}> {
  const allowed = kind === 'medium'
    ? ['sessionId', 'requestId', 'expectedCycle', 'expectedRevision', 'choices']
    : kind === 'short'
      ? ['sessionId', 'requestId', 'expectedCycle', 'expectedRevision', 'targetIds']
      : ['sessionId', 'requestId', 'expectedCycle', 'expectedRevision', 'expectedHostShipId', 'damageToRepair'];
  if (!isRecord(raw) || Object.keys(raw).length !== allowed.length ||
      Object.keys(raw).some((key) => !allowed.includes(key)) ||
      typeof raw.sessionId !== 'string' || !/^[\w-]{1,128}$/.test(raw.sessionId) ||
      typeof raw.requestId !== 'string' || !/^[\w-]{1,128}$/.test(raw.requestId) ||
      !Number.isSafeInteger(raw.expectedCycle) || (raw.expectedCycle as number) < 1 ||
      !Number.isSafeInteger(raw.expectedRevision) || (raw.expectedRevision as number) < 0) {
    throw new HttpsError('invalid-argument', `Invalid Maliades ${kind} request.`);
  }
  if (kind === 'medium') {
    if (!Array.isArray(raw.choices) || raw.choices.length < 1 || raw.choices.length > 2 ||
        raw.choices.some((value) => {
          if (!isRecord(value) || (value.kind !== 'attack' && value.kind !== 'target-shift') ||
              typeof value.targetId !== 'string' || !/^[\w-]{1,128}$/.test(value.targetId)) return true;
          return value.kind === 'target-shift'
            ? (value.shift !== -1 && value.shift !== 1) ||
              (Object.keys(value).length !== 2 && Object.keys(value).length !== 3) ||
              (value.wolfRosterIndex !== undefined &&
                (!Number.isSafeInteger(value.wolfRosterIndex) || (value.wolfRosterIndex as number) < 0))
            : Object.keys(value).length !== 2;
        })) throw new HttpsError('invalid-argument', 'Invalid Maliades Medium choice.');
    const choices = [...raw.choices as MaliadesMediumChoice[]].sort((left, right) =>
      `${left.kind}:${left.targetId}:${'shift' in left ? left.shift : ''}`.localeCompare(
        `${right.kind}:${right.targetId}:${'shift' in right ? right.shift : ''}`));
    return {
      sessionId: raw.sessionId, requestId: raw.requestId,
      expectedCycle: raw.expectedCycle as number, expectedRevision: raw.expectedRevision as number, choices,
    };
  }
  if (kind === 'short') {
    if (!Array.isArray(raw.targetIds) || raw.targetIds.length < 1 || raw.targetIds.length > 2 ||
        raw.targetIds.some((id) => typeof id !== 'string' || !/^[\w-]{1,128}$/.test(id)) ||
        new Set(raw.targetIds).size !== raw.targetIds.length) {
      throw new HttpsError('invalid-argument', 'Invalid Maliades Short target list.');
    }
    return {
      sessionId: raw.sessionId, requestId: raw.requestId,
      expectedCycle: raw.expectedCycle as number, expectedRevision: raw.expectedRevision as number,
      targetIds: [...raw.targetIds as string[]],
    };
  }
  if (typeof raw.expectedHostShipId !== 'string' || !isResourceShipId(raw.expectedHostShipId) ||
      !Number.isSafeInteger(raw.damageToRepair) || (raw.damageToRepair as number) < 1 ||
      (raw.damageToRepair as number) > 3) {
    throw new HttpsError('invalid-argument', 'Invalid Maliades repair request.');
  }
  return {
    sessionId: raw.sessionId, requestId: raw.requestId,
    expectedCycle: raw.expectedCycle as number, expectedRevision: raw.expectedRevision as number,
    expectedHostShipId: raw.expectedHostShipId, damageToRepair: raw.damageToRepair as number,
  };
}

function fingerprintFor(
  action: string, uid: string, request: ReturnType<typeof exactCommandRequest>,
): CommandFingerprint {
  const payload: Record<string, string | number | readonly string[]> = { expectedCycle: request.expectedCycle };
  if (request.choices) payload.choices = request.choices.map(choice =>
    choice.kind === 'target-shift'
      ? `target-shift:${choice.targetId}:${choice.shift}:${choice.wolfRosterIndex ?? ''}`
      : `attack:${choice.targetId}`);
  if (request.targetIds) payload.targetIds = request.targetIds;
  if (request.expectedHostShipId) payload.hostShipId = request.expectedHostShipId;
  if (request.damageToRepair !== undefined) payload.damageToRepair = request.damageToRepair;
  return {
    action, sessionId: request.sessionId, requestId: request.requestId, actorUid: uid,
    instanceId: null, expectedRevision: request.expectedRevision, payload,
  };
}

function replay<T>(receipt: DocumentSnapshot, fingerprint: CommandFingerprint, label: string, valid: (value: unknown) => value is T): T | undefined {
  if (!receipt.exists) return undefined;
  const disposition = commandReceiptDisposition(receipt.get('fingerprint'), fingerprint);
  if (disposition.kind === 'foreign-actor') throw new HttpsError('permission-denied', `This ${label} request belongs to a different actor.`);
  if (disposition.kind === 'collision') throw new HttpsError('failed-precondition', `This ${label} request id is bound to a different command.`);
  const result = receipt.get('result');
  if (!valid(result)) throw new HttpsError('failed-precondition', `This ${label} request has no replayable result.`);
  return result;
}

type MaliadesWolfTargetShift = Readonly<{
  rosterIndex: number;
  shift: -1 | 1;
  fromDie: number;
  toDie: number;
  fromTarget: string;
  toTarget: string;
}>;

type MaliadesWolfRangeEffects = Readonly<{
  attackId: string;
  cycle: number;
  medium: Readonly<{
    targetShifts: readonly MaliadesWolfTargetShift[];
    damageByTarget: Readonly<Record<string, number>>;
  }> | null;
  short: Readonly<{
    damageByTarget: Readonly<Record<string, number>>;
  }> | null;
}>;

function parseRangeDamage(value: unknown): Readonly<Record<string, number>> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value);
  if (entries.some(([target, amount]) => !/^[\w-]{1,128}$/.test(target) ||
      !Number.isSafeInteger(amount) || (amount as number) < 1)) return undefined;
  return Object.fromEntries(entries.map(([target, amount]) => [target, amount as number]));
}

function parseWolfRangeEffects(value: unknown, attackId: string, cycle: number): MaliadesWolfRangeEffects | undefined {
  if (!isRecord(value) || value.attackId !== attackId || value.cycle !== cycle ||
      !('medium' in value) || !('short' in value)) return undefined;
  let medium: MaliadesWolfRangeEffects['medium'] = null;
  if (value.medium !== null) {
    const raw = isRecord(value.medium) ? value.medium : undefined;
    if (!raw || !Array.isArray(raw.targetShifts)) return undefined;
    const targetShifts = raw.targetShifts.map((item): MaliadesWolfTargetShift | undefined => {
      if (!isRecord(item) || !Number.isSafeInteger(item.rosterIndex) || (item.rosterIndex as number) < 0 ||
          (item.shift !== -1 && item.shift !== 1) ||
          !Number.isSafeInteger(item.fromDie) || !Number.isSafeInteger(item.toDie) ||
          typeof item.fromTarget !== 'string' || typeof item.toTarget !== 'string') return undefined;
      return {
        rosterIndex: item.rosterIndex as number,
        shift: item.shift,
        fromDie: item.fromDie as number,
        toDie: item.toDie as number,
        fromTarget: item.fromTarget,
        toTarget: item.toTarget,
      };
    });
    const damageByTarget = parseRangeDamage(raw.damageByTarget);
    if (targetShifts.some((shift): shift is undefined => shift === undefined) ||
        new Set(targetShifts.map((shift) => shift?.rosterIndex)).size !== targetShifts.length ||
        !damageByTarget) return undefined;
    medium = { targetShifts: targetShifts as MaliadesWolfTargetShift[], damageByTarget };
  }
  let short: MaliadesWolfRangeEffects['short'] = null;
  if (value.short !== null) {
    const raw = isRecord(value.short) ? value.short : undefined;
    const damageByTarget = raw && parseRangeDamage(raw.damageByTarget);
    if (!raw || !damageByTarget) return undefined;
    short = { damageByTarget };
  }
  return { attackId, cycle, medium, short };
}

function attackIdentity(state: DocumentSnapshot, cycle: number): string {
  const attackId = state.get('attackId') ?? state.get('announcementId');
  if (typeof attackId !== 'string' || !/^[\w-]{1,128}$/.test(attackId)) {
    throw commandError('failed-precondition', 'The active Wolf attack identity is unavailable.', 'conflict');
  }
  const stateTurn = state.get('turn');
  if (stateTurn !== cycle) {
    throw commandError('failed-precondition', 'The active Wolf attack belongs to a different cycle.', 'stale-revision');
  }
  return attackId;
}

function addRangeDamage(
  existing: Readonly<Record<string, number>>,
  targetIds: readonly string[],
): Readonly<Record<string, number>> {
  const next: Record<string, number> = { ...existing };
  targetIds.forEach((targetId) => { next[targetId] = (next[targetId] ?? 0) + 1; });
  return next;
}

function applyMaliadesTargetShift(
  targeting: WolfTargetingReceipt,
  choice: Extract<MaliadesMediumChoice, { kind: 'target-shift' }>,
): Readonly<{ targeting: WolfTargetingReceipt; effect: MaliadesWolfTargetShift }> {
  const candidates = targeting.rolls.filter((roll) =>
    roll.target === choice.targetId && !roll.modifiers.includes('target-shift') &&
    !roll.modifiers.includes('command-and-control-redirect') &&
    (choice.wolfRosterIndex === undefined || roll.rosterIndex === choice.wolfRosterIndex));
  if (candidates.length !== 1) {
    throw new Error(candidates.length === 0
      ? 'The selected Wolf target number is unavailable for this attack.'
      : 'Select one Wolf target number; the submitted target is ambiguous.');
  }
  const selected = candidates[0]!;
  const toDie = shiftWolfTargetDie(selected.finalDie, choice.shift, targeting.ring);
  const toTarget = wolfTargetForDie(toDie, targeting.ring);
  const nextRolls = targeting.rolls.map((roll) => roll.rosterIndex !== selected.rosterIndex
    ? roll
    : {
      ...roll,
      shiftedDie: toDie,
      finalDie: toDie,
      target: toTarget,
      modifiers: [...roll.modifiers, 'target-shift'] as typeof roll.modifiers,
    });
  return {
    targeting: { ...targeting, rolls: nextRolls },
    effect: {
      rosterIndex: selected.rosterIndex,
      shift: choice.shift,
      fromDie: selected.finalDie,
      toDie,
      fromTarget: selected.target,
      toTarget,
    },
  };
}

function requireLiveWolfAction(
  session: DocumentSnapshot,
  state: DocumentSnapshot,
  cycle: number,
  kind: 'medium' | 'short',
): Readonly<{
  attackId: string;
  targetRing: readonly string[];
  targeting: WolfTargetingReceipt;
  effects: MaliadesWolfRangeEffects;
}> {
  if (!session.exists || session.get('phase') !== 'active') {
    throw commandError('failed-precondition', 'Maliades is available only during active gameplay.', 'invalid-phase');
  }
  const phase = turnPhaseState(session.get('turnPhase'));
  if (!phase || phase.turn !== cycle || phase.airspace.state !== 'restricted') {
    throw commandError('failed-precondition', 'Maliades range actions require the live Wolf attack airspace lock.', 'invalid-phase');
  }
  const turn = state.get('turn');
  const launched = state.get('launchedCraftIds');
  const expectedStep = kind === 'medium' ? 'medium-range' : 'short-range';
  if (!state.exists || state.get('type') !== 'wolf-attack-state' || state.get('status') !== 'declared' ||
      state.get('currentStep') !== expectedStep || state.get('airspaceLocked') !== true || turn !== cycle ||
      !Number.isSafeInteger(state.get('revision')) || !Array.isArray(launched) || !launched.includes('maliades')) {
    throw commandError('failed-precondition', 'The active Wolf attack cannot accept this Maliades action.', 'conflict');
  }
  const attackId = attackIdentity(state, cycle);
  const receipt = isRecord(state.get('calculationReceipt')) ? state.get('calculationReceipt') as RecordValue : undefined;
  const targeting = receipt ? parseWolfTargetingReceipt(receipt.targeting) : undefined;
  const effects = parseWolfRangeEffects(state.get('maliadesRangeEffects'), attackId, cycle);
  const ring: Set<string> | undefined = targeting ? new Set<string>(targeting.ring) : undefined;
  const effectDamageTargets = effects
    ? [
      ...(effects.medium ? Object.keys(effects.medium.damageByTarget) : []),
      ...(effects.short ? Object.keys(effects.short.damageByTarget) : []),
    ]
    : [];
  const shifts = effects?.medium?.targetShifts ?? [];
  if (!targeting || !effects || !ring || effectDamageTargets.some((target) => !ring.has(target)) ||
      shifts.some((shift) => !ring.has(shift.fromTarget) || !ring.has(shift.toTarget) ||
        shift.rosterIndex >= targeting.rolls.length || shift.fromDie < 1 || shift.fromDie > targeting.ring.length ||
        shift.toDie < 1 || shift.toDie > targeting.ring.length ||
        targeting.rolls[shift.rosterIndex]?.target !== shift.toTarget)) {
    throw commandError('failed-precondition', 'The authoritative Wolf target ring is unavailable.', 'conflict');
  }
  return { attackId, targetRing: targeting.ring, targeting, effects };
}

function requireMaliadesControl(session: DocumentSnapshot, uid: string): void {
  const control = parseShuttleControl(session.get('shuttleControl'))?.maliades;
  if (!control || control.shuttleId !== 'maliades' || control.ownerRoleId !== 'dione-engineer' || control.holderUid !== uid) {
    throw new HttpsError('permission-denied', 'Only the current Dione Engineer holding Maliades may use this action.');
  }
}

function isActionReply(value: unknown, fingerprint: CommandFingerprint): value is RecordValue {
  return isRecord(value) && (value.status === 'committed' || value.status === 'replayed') &&
    value.sessionId === fingerprint.sessionId && value.requestId === fingerprint.requestId &&
    value.craftId === 'maliades' && Number.isSafeInteger(value.cycle) &&
    value.cycle === fingerprint.payload.expectedCycle && Number.isSafeInteger(value.revision) &&
    value.revision === (fingerprint.expectedRevision as number) + 1;
}

function resultWithReplay(result: RecordValue): RecordValue {
  return { ...result, status: 'replayed' };
}

async function runMaliadesRangeAction(
  request: { data?: unknown; auth?: { uid?: string } },
  kind: 'medium' | 'short',
): Promise<RecordValue> {
  const uid = requireUid(request.auth);
  const command = exactCommandRequest(request.data, kind);
  const fingerprint = fingerprintFor(`maliades-${kind}`, uid, command);
  const db = getFirestore();
  const sessionRef = db.doc(`sessions/${command.sessionId}`);
  const actorRef = db.doc(`sessions/${command.sessionId}/players/${uid}`);
  const stateRef = db.doc(`sessions/${command.sessionId}/wolfAttackState/current`);
  const receiptRef = db.doc(`sessions/${command.sessionId}/commandReceipts/${command.requestId}`);
  const eventRef = db.doc(`sessions/${command.sessionId}/events/maliades-${kind}-${command.requestId}`);
  return db.runTransaction(async (tx: Transaction): Promise<RecordValue> => {
    const [session, actor, wolfState, receipt, event] = await Promise.all([
      tx.get(sessionRef), tx.get(actorRef), tx.get(stateRef), tx.get(receiptRef), tx.get(eventRef),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    requireDioneEngineer(actor, uid);
    const prior = replay(receipt, fingerprint, `Maliades ${kind}`, (value): value is RecordValue => isActionReply(value, fingerprint));
    if (prior) return resultWithReplay(prior);
    if (event.exists) throw new HttpsError('failed-precondition', `This Maliades ${kind} request already has an event receipt.`);
    const liveWolf = requireLiveWolfAction(session, wolfState, command.expectedCycle, kind);
    requireMaliadesControl(session, uid);
    const state = parseMaliadesState(session.get('maliadesState'));
    if (!state || !state.launched) throw commandError('failed-precondition', 'Maliades launch state is unavailable; refresh the current Wolf attack.', 'conflict');
    if (state.attackId !== liveWolf.attackId || state.attackCycle !== command.expectedCycle) {
      throw commandError('failed-precondition', 'Maliades is not launched for the current Wolf attack.', 'stale-revision');
    }
    if (state.revision !== command.expectedRevision) throw commandError('failed-precondition', 'Maliades state changed; refresh before acting.', 'stale-revision');
    const requestedTargets = kind === 'medium'
      ? command.choices!.map((choice) => choice.targetId)
      : [...command.targetIds!];
    if (requestedTargets.some((targetId) => !liveWolf.targetRing.includes(targetId))) {
      throw commandError('failed-precondition', 'Choose only targets in the authoritative Wolf target ring.', 'conflict');
    }
    let next: ReturnType<typeof resolveMaliadesMediumState> | ReturnType<typeof resolveMaliadesShortState>;
    try {
      next = kind === 'medium'
        ? resolveMaliadesMediumState(state, {
          expectedRevision: command.expectedRevision,
          attackId: liveWolf.attackId,
          attackCycle: command.expectedCycle,
          choices: command.choices!,
          random: (upperBound) => randomInt(upperBound),
        })
        : resolveMaliadesShortState(state, {
          expectedRevision: command.expectedRevision,
          attackId: liveWolf.attackId,
          attackCycle: command.expectedCycle,
          targetIds: command.targetIds!,
          random: (upperBound) => randomInt(upperBound),
        });
    } catch (cause) {
      throw commandError('failed-precondition', cause instanceof Error ? cause.message : `Maliades ${kind} was rejected.`, 'conflict');
    }
    const result: RecordValue = {
      status: 'committed', sessionId: command.sessionId, requestId: command.requestId,
      craftId: 'maliades', cycle: command.expectedCycle, revision: next.state.revision,
      state: next.state, resolution: next.resolution,
    };
    const currentReceipt = isRecord(wolfState.get('calculationReceipt'))
      ? wolfState.get('calculationReceipt') as RecordValue : undefined;
    const currentEffects = liveWolf.effects;
    let nextTargeting = liveWolf.targeting;
    let mediumEffects = currentEffects.medium;
    let shortEffects = currentEffects.short;
    let shiftEffectForEventValue: MaliadesWolfTargetShift | null = null;
    if (kind === 'medium') {
      const targetShift = command.choices!.find((choice) => choice.kind === 'target-shift');
      let shiftEffect: MaliadesWolfTargetShift | undefined;
      if (targetShift) {
        try {
          const shifted = applyMaliadesTargetShift(nextTargeting, targetShift);
          nextTargeting = shifted.targeting;
          shiftEffect = shifted.effect;
        } catch (cause) {
          throw commandError(
            'failed-precondition',
            cause instanceof Error ? cause.message : 'The Wolf target-number shift was rejected.',
            'conflict',
          );
        }
        shiftEffectForEventValue = shiftEffect ?? null;
      }
      const mediumResolution = next.resolution as ReturnType<typeof resolveMaliadesMediumState>['resolution'];
      const attackTarget = mediumResolution.attack?.targetId;
      const damageByTarget = attackTarget && mediumResolution.attack?.hit
        ? addRangeDamage(currentEffects.medium?.damageByTarget ?? {}, [attackTarget])
        : { ...(currentEffects.medium?.damageByTarget ?? {}) };
      mediumEffects = {
        targetShifts: shiftEffect ? [shiftEffect] : [],
        damageByTarget,
      };
    } else {
      const shortResolution = next.resolution as ReturnType<typeof resolveMaliadesShortState>['resolution'];
      const hitTargets = shortResolution.rolls
        .filter((roll) => roll.hit)
        .map((roll) => roll.targetId);
      shortEffects = {
        damageByTarget: addRangeDamage(currentEffects.short?.damageByTarget ?? {}, hitTargets),
      };
    }
    if (!currentReceipt) {
      throw commandError('failed-precondition', 'The authoritative Wolf calculation receipt is unavailable.', 'conflict');
    }
    const nextWolfRevision = wolfState.get('revision');
    if (!Number.isSafeInteger(nextWolfRevision) || (nextWolfRevision as number) >= Number.MAX_SAFE_INTEGER) {
      throw commandError('failed-precondition', 'The authoritative Wolf attack revision is malformed.', 'conflict');
    }
    const nextEffects: MaliadesWolfRangeEffects = {
      attackId: liveWolf.attackId,
      cycle: command.expectedCycle,
      medium: mediumEffects,
      short: shortEffects,
    };
    const nextWolfState = {
      revision: (nextWolfRevision as number) + 1,
      calculationReceipt: kind === 'medium'
        ? { ...currentReceipt, targeting: nextTargeting }
        : currentReceipt,
      maliadesRangeEffects: nextEffects,
      updatedAt: FieldValue.serverTimestamp(),
    };
    tx.update(sessionRef, { maliadesState: next.state, updatedAt: FieldValue.serverTimestamp() });
    tx.update(stateRef, nextWolfState);
    tx.set(eventRef, buildPrivacySafeEventRecord({
      type: `maliades-${kind}`,
      envelope: buildAuthoritativeEventEnvelope({
        sessionId: command.sessionId, actorUid: uid, actorRoleId: 'dione-engineer', turn: command.expectedCycle,
        phase: 'active', type: `maliades-${kind}`, requestId: command.requestId,
        revision: next.state.revision, serverTime: new Date(), visibility: EventVisibility.Member,
      }),
      payload: kind === 'medium'
        ? {
          craftId: 'maliades', cycle: command.expectedCycle, revision: next.state.revision,
          ...next.resolution,
          targetDamageByTarget: mediumEffects?.damageByTarget ?? {},
          targetNumberShift: shiftEffectForEventValue,
        }
        : {
          craftId: 'maliades', cycle: command.expectedCycle, revision: next.state.revision,
          ...next.resolution,
          targetDamageByTarget: shortEffects?.damageByTarget ?? {},
          damage: next.state.damage, destroyed: next.state.destroyed,
        },
      createdAt: FieldValue.serverTimestamp(),
    }));
    tx.set(receiptRef, { fingerprint, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
}

export const resolveMaliadesMedium = onCall(CALLABLE_RUNTIME_OPTIONS, async request =>
  runMaliadesRangeAction(request, 'medium'));

export const resolveMaliadesShort = onCall(CALLABLE_RUNTIME_OPTIONS, async request =>
  runMaliadesRangeAction(request, 'short'));

export const repairMaliades = onCall(CALLABLE_RUNTIME_OPTIONS, async request => {
  const uid = requireUid(request.auth);
  const command = exactCommandRequest(request.data, 'repair');
  const fingerprint = fingerprintFor('maliades-repair', uid, command);
  const db = getFirestore();
  const sessionRef = db.doc(`sessions/${command.sessionId}`);
  const actorRef = db.doc(`sessions/${command.sessionId}/players/${uid}`);
  const receiptRef = db.doc(`sessions/${command.sessionId}/commandReceipts/${command.requestId}`);
  const eventRef = db.doc(`sessions/${command.sessionId}/events/maliades-repair-${command.requestId}`);
  return db.runTransaction(async (tx: Transaction): Promise<RecordValue> => {
    const [session, actor, receipt, event] = await Promise.all([
      tx.get(sessionRef), tx.get(actorRef), tx.get(receiptRef), tx.get(eventRef),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    requireDioneEngineer(actor, uid);
    const prior = replay(receipt, fingerprint, 'Maliades repair', (value): value is RecordValue => isActionReply(value, fingerprint));
    if (prior) return resultWithReplay(prior);
    if (event.exists) throw new HttpsError('failed-precondition', 'This Maliades repair request already has an event receipt.');
    const currentCycle = session.get('currentTurn');
    if (session.get('phase') !== 'active' || currentCycle !== command.expectedCycle) {
      throw commandError('failed-precondition', 'The Coordination cycle changed; refresh before repairing Maliades.', 'stale-revision');
    }
    const phase = turnPhaseState(session.get('turnPhase'));
    const teamEnds = phase ? Date.parse(phase.teamPhaseEndsAt) : Number.NaN;
    if (!phase || phase.turn !== command.expectedCycle || phase.airspace.state !== 'restricted' ||
        !Number.isFinite(teamEnds) || Date.now() >= teamEnds) {
      throw commandError('failed-precondition', 'Maliades repair is available only during the live Team Phase.', 'invalid-phase');
    }
    requireMaliadesControl(session, uid);
    const control = parseShuttleControl(session.get('shuttleControl'))?.maliades;
    const fuelled = isRecord(session.get('shuttleFuelled')) && session.get('shuttleFuelled')!.maliades === true;
    const dockings = session.get('shuttleDockings');
    const activeVessels = session.get('activeVesselIds');
    const groupId = actor.get('fleetGroupId');
    const groupSnapshot = typeof groupId === 'string' ? await tx.get(db.doc(`sessions/${command.sessionId}/fleetGroups/${groupId}`)) : undefined;
    const group = groupSnapshot?.exists ? fleetGroupRecord(groupSnapshot.data()) : undefined;
    if (!control || !fuelled || !Array.isArray(activeVessels) || activeVessels.some((id) => typeof id !== 'string') ||
        !Array.isArray(dockings) || !shuttleDockingsAreParked(dockings, activeVessels as string[]) ||
        !group || group.id !== groupId || !group.memberUids.includes(uid)) {
      throw commandError('failed-precondition', 'The authoritative Maliades repair state is unavailable.', 'conflict');
    }
    const expectedHostShipId = command.expectedHostShipId;
    const damageToRepair = command.damageToRepair;
    if (!expectedHostShipId || damageToRepair === undefined) {
      throw commandError('invalid-argument', 'Maliades repair host and damage are required.', 'malformed-input');
    }
    const maliadesDockings = dockings.filter((docking) => isRecord(docking) && docking.shuttleId === 'maliades');
    if (maliadesDockings.length !== 1 || maliadesDockings[0]!.shipId !== expectedHostShipId ||
        !group.vesselIds.includes(expectedHostShipId)) {
      throw commandError('failed-precondition', 'Maliades must be docked at the expected host in its holder’s fleet group.', 'conflict');
    }
    const state = parseMaliadesState(session.get('maliadesState'));
    const damage = serviceRechargeDamageState(session.get('shipDamage'), expectedHostShipId);
    const resources = serviceRechargeResourceState(session.get('shipResources'), expectedHostShipId);
    const deck = SHIP_DAMAGE_DECKS[expectedHostShipId];
    if (!state || !state.launched || !damage || !resources || !deck) {
      throw commandError('failed-precondition', 'The authoritative Maliades repair state is unavailable.', 'conflict');
    }
    if (state.revision !== command.expectedRevision) throw commandError('failed-precondition', 'Maliades state changed; refresh before repairing.', 'stale-revision');
    let next: ReturnType<typeof repairMaliadesState>;
    try {
      next = repairMaliadesState(state, {
        expectedRevision: command.expectedRevision, fuelled: true,
        damageToRepair, materialsAvailable: resources.materials,
      });
    } catch (cause) {
      throw commandError('failed-precondition', cause instanceof Error ? cause.message : 'Maliades repair was rejected.', 'conflict');
    }
    const result: RecordValue = {
      status: 'committed', sessionId: command.sessionId, requestId: command.requestId,
      craftId: 'maliades', cycle: command.expectedCycle, revision: next.state.revision,
      hostShipId: expectedHostShipId, damageRepaired: damageToRepair,
      materialsRemaining: next.materialsRemaining, state: next.state,
    };
    tx.update(sessionRef, {
      maliadesState: next.state,
      [`shipResources.${expectedHostShipId}.materials`]: next.materialsRemaining,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(eventRef, buildPrivacySafeEventRecord({
      type: 'maliades-repair',
      envelope: buildAuthoritativeEventEnvelope({
        sessionId: command.sessionId, actorUid: uid, actorRoleId: 'dione-engineer', turn: command.expectedCycle,
        phase: 'active', type: 'maliades-repair', requestId: command.requestId,
        revision: next.state.revision, serverTime: new Date(), visibility: EventVisibility.Member,
      }),
      payload: {
        craftId: 'maliades', hostShipId: expectedHostShipId,
        damageRepaired: damageToRepair, materialsSpent: damageToRepair,
        damage: next.state.damage, destroyed: next.state.destroyed,
      },
      createdAt: FieldValue.serverTimestamp(),
    }));
    tx.set(receiptRef, { fingerprint, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});
