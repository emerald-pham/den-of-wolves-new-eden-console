import { isWolfCalculationReceipt } from './wolfCombatMath';
import type { WolfAttackPreparation } from './wolfAttackPreparation';
import { wolfShipForId } from './wolfShipCatalog';
import { organiserSitesForChart, type ChartId } from './starChartLookup';

export interface ResolvedWolfAttackForCarryover {
  readonly state: Readonly<Record<string, unknown>>;
  readonly attackId: string;
  readonly turn: number;
  readonly attackNumber: number;
  readonly returningInstanceIds: readonly string[];
}

export interface PStationRepeatContext {
  readonly type: 'p-station-repeat';
  readonly sequenceId: string;
  readonly groupId: string;
  readonly chart: ChartId;
  readonly coordinate: string;
  readonly stationId: 'P';
  readonly sourceTransitionId: string;
  readonly sourceCycle: number;
  readonly parentAttackId: string;
  readonly parentAttackNumber: number;
  readonly parentTurn: number;
  readonly nextAttackNumber: number;
}

export interface ResolvedPStationRepeat extends ResolvedWolfAttackForCarryover {
  readonly repeatContext: PStationRepeatContext;
  readonly survivingShips: readonly Readonly<{ instanceId: string; shipId: string }>[];
}

export interface WolfWingCarryoverReceipt {
  readonly sourceAttackId: string;
  readonly sourceTurn: number;
  readonly sourceInstanceIds: readonly string[];
  /** New attack-scoped instance IDs occupying the returned Wings' prepared slots. */
  readonly rosterInstanceIds: readonly string[];
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameValue(left: unknown, right: unknown): boolean {
  try {
    const stable = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(stable);
      if (record(value)) return Object.fromEntries(
        Object.keys(value).sort().map((key) => [key, stable(value[key])]),
      );
      return value;
    };
    return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
  } catch {
    return false;
  }
}

function returningShipForInstanceId(value: unknown): Readonly<{ instanceId: string; shipId: string }> | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^(0|[1-9]\d*):(wolf-[a-z-]+)$/.exec(value);
  if (!match || !Number.isSafeInteger(Number(match[1]))) return undefined;
  const ship = wolfShipForId(match[2]!);
  return ship?.returnRule.kind === 'next-attack'
    ? { instanceId: value, shipId: ship.id }
    : undefined;
}

function isReturningInstanceId(value: unknown): value is string {
  return returningShipForInstanceId(value) !== undefined;
}

/**
 * A new attack may consume returns only from the immutable finalization record
 * for the current attack. The audit comparison protects the carryover list
 * from edits to the live projection and keeps legacy in-progress attacks
 * compatible when their finalizer did not persist combatRoster.
 */
function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}

function parsePStationSequence(value: unknown): Readonly<{
  type: 'p-station-sequence'; sequenceId: string; groupId: string; chart: ChartId;
  coordinate: string; stationId: 'P'; sourceTransitionId: string; sourceCycle: number; attackNumber: number;
}> | undefined {
  if (!record(value) || !hasExactKeys(value, ['type', 'sequenceId', 'groupId', 'chart', 'coordinate', 'stationId',
    'sourceTransitionId', 'sourceCycle', 'attackNumber']) || value.type !== 'p-station-sequence' ||
      typeof value.sourceTransitionId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value.sourceTransitionId) ||
      value.sequenceId !== `wolf-p-station-${value.sourceTransitionId}` ||
      typeof value.groupId !== 'string' || !value.groupId.trim() ||
      (value.chart !== 'A' && value.chart !== 'B' && value.chart !== 'C') ||
      typeof value.coordinate !== 'string' || !/^\d{4}$/.test(value.coordinate) || value.stationId !== 'P' ||
      organiserSitesForChart(value.chart as ChartId)[value.coordinate]?.code !== value.stationId ||
      !Number.isSafeInteger(value.sourceCycle) || (value.sourceCycle as number) < 1 ||
      !Number.isSafeInteger(value.attackNumber) || (value.attackNumber as number) < 1) return undefined;
  return value as unknown as ReturnType<typeof parsePStationSequence>;
}

function parsePStationRepeatContext(value: unknown): PStationRepeatContext | undefined {
  if (!record(value) || !hasExactKeys(value, ['type', 'sequenceId', 'groupId', 'chart', 'coordinate', 'stationId',
    'sourceTransitionId', 'sourceCycle', 'parentAttackId', 'parentAttackNumber', 'parentTurn', 'nextAttackNumber']) ||
      value.type !== 'p-station-repeat' || typeof value.sequenceId !== 'string' ||
      typeof value.groupId !== 'string' || !value.groupId.trim() ||
      (value.chart !== 'A' && value.chart !== 'B' && value.chart !== 'C') ||
      typeof value.coordinate !== 'string' || !/^\d{4}$/.test(value.coordinate) || value.stationId !== 'P' ||
      organiserSitesForChart(value.chart as ChartId)[value.coordinate]?.code !== value.stationId ||
      typeof value.sourceTransitionId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value.sourceTransitionId) ||
      value.sequenceId !== `wolf-p-station-${value.sourceTransitionId}` ||
      !Number.isSafeInteger(value.sourceCycle) || (value.sourceCycle as number) < 1 ||
      typeof value.parentAttackId !== 'string' || !/^wolf-attack-[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value.parentAttackId) ||
      !Number.isSafeInteger(value.parentAttackNumber) || (value.parentAttackNumber as number) < 1 ||
      !Number.isSafeInteger(value.parentTurn) || (value.parentTurn as number) < 1 ||
      !Number.isSafeInteger(value.nextAttackNumber) || value.nextAttackNumber !== (value.parentAttackNumber as number) + 1) {
    return undefined;
  }
  return value as unknown as PStationRepeatContext;
}

function samePStationIdentity(
  sequence: NonNullable<ReturnType<typeof parsePStationSequence>>,
  context: PStationRepeatContext,
): boolean {
  return sequence.sequenceId === context.sequenceId && sequence.groupId === context.groupId &&
    sequence.chart === context.chart && sequence.coordinate === context.coordinate &&
    sequence.stationId === context.stationId && sequence.sourceTransitionId === context.sourceTransitionId &&
    sequence.sourceCycle === context.sourceCycle &&
    sequence.attackNumber === context.parentAttackNumber;
}

function pStationSurvivors(
  state: Readonly<Record<string, unknown>>,
  receipt: Record<string, unknown>,
  returningInstanceIds: readonly string[],
): readonly Readonly<{ instanceId: string; shipId: string }>[] | undefined {
  if (!Array.isArray(state.combatRoster) || !Array.isArray(receipt.ranges) || !Array.isArray(receipt.survivingWolfShips)) {
    return undefined;
  }
  const roster: Array<Readonly<{ instanceId: string; shipId: string; target: string; destroyed: boolean }>> = [];
  const rosterIds = new Set<string>();
  for (const value of state.combatRoster) {
    if (!record(value) || typeof value.instanceId !== 'string' || typeof value.shipId !== 'string' ||
        typeof value.target !== 'string' || typeof value.destroyed !== 'boolean') return undefined;
    const match = /^(0|[1-9]\d*):(wolf-[a-z-]+)$/.exec(value.instanceId);
    const catalog = match ? wolfShipForId(match[2]!) : undefined;
    if (!catalog || catalog.id !== value.shipId || rosterIds.has(value.instanceId)) return undefined;
    rosterIds.add(value.instanceId);
    roster.push({ instanceId: value.instanceId, shipId: value.shipId, target: value.target, destroyed: value.destroyed });
  }

  const destroyedByRanges = new Set<string>();
  for (const range of receipt.ranges) {
    if (!record(range) || !Array.isArray(range.destroyedInstanceIds)) return undefined;
    for (const value of range.destroyedInstanceIds) {
      const match = typeof value === 'string' ? /^(0|[1-9]\d*):(wolf-[a-z-]+)$/.exec(value) : undefined;
      if (!match || !wolfShipForId(match[2]!) || !rosterIds.has(value) || destroyedByRanges.has(value)) return undefined;
      destroyedByRanges.add(value);
    }
  }
  const rosterDestroyed = roster.filter(({ destroyed }) => destroyed).map(({ instanceId }) => instanceId).sort();
  if (!sameValue([...destroyedByRanges].sort(), rosterDestroyed)) return undefined;
  const survivors = roster.filter(({ destroyed }) => !destroyed);
  const survivorRows = survivors.map(({ instanceId, shipId, target }) => ({ instanceId, shipId, target }));
  if (!sameValue(receipt.survivingWolfShips, survivorRows)) return undefined;
  const expectedReturns = survivors.flatMap(({ instanceId, shipId }) =>
    wolfShipForId(shipId)?.returnRule.kind === 'next-attack' ? [instanceId] : []);
  if (!sameValue(expectedReturns, returningInstanceIds)) return undefined;
  return survivors.map(({ instanceId, shipId }) => ({ instanceId, shipId }));
}

/**
 * A new attack may consume returns only from the immutable finalization record
 * for the current attack. P Station repeats are allowed in the same cycle only
 * through a server-owned sequence context bound to the prior finalization.
 */
export function resolvedWolfAttackForCarryover(
  stateValue: unknown,
  finalizationAuditValue: unknown,
  currentTurn: number,
): ResolvedWolfAttackForCarryover;
export function resolvedWolfAttackForCarryover(
  stateValue: unknown,
  finalizationAuditValue: unknown,
  currentTurn: number,
  repeatContext: PStationRepeatContext,
): ResolvedPStationRepeat;
export function resolvedWolfAttackForCarryover(
  stateValue: unknown,
  finalizationAuditValue: unknown,
  currentTurn: number,
  repeatContext?: unknown,
): ResolvedWolfAttackForCarryover | ResolvedPStationRepeat {
  if (!record(stateValue) || !record(finalizationAuditValue)) {
    throw new Error('The previous Wolf attack is not a verifiable finalized attack.');
  }
  const state = stateValue;
  const attackId = state.attackId;
  const turn = state.turn;
  const revision = state.revision;
  const receipt = state.calculationReceipt;
  const audit = finalizationAuditValue;
  const repeatWasRequested = repeatContext !== undefined;
  const parsedContext = repeatWasRequested ? parsePStationRepeatContext(repeatContext) : undefined;
  if (state.type !== 'wolf-attack-state' || state.status !== 'resolved' || state.currentStep !== 'resolved' ||
      state.airspaceLocked !== false || state.parkingReleaseCondition !== 'normal-movement-reopened' ||
      typeof attackId !== 'string' || !/^wolf-attack-[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(attackId) ||
      state.announcementId !== attackId || !Number.isSafeInteger(turn) || (turn as number) < 1 ||
      !Number.isSafeInteger(revision) || (revision as number) < 1 ||
      !Number.isSafeInteger(currentTurn) ||
      (repeatWasRequested ? currentTurn !== turn : currentTurn <= (turn as number)) ||
      typeof state.resolvedAt !== 'string' || !Number.isFinite(Date.parse(state.resolvedAt)) ||
      typeof state.finalizationRequestId !== 'string' ||
      state.finalizationRequestId !== `wolf-final-${attackId}` || !isWolfCalculationReceipt(receipt) ||
      receipt.phase.turn !== turn || receipt.requestId !== state.finalizationRequestId ||
      audit.type !== 'wolf-attack-finalization' || audit.actorUid !== 'server' ||
      audit.attackId !== attackId || audit.turn !== turn || audit.revision !== revision ||
      audit.requestId !== state.finalizationRequestId || !sameValue(audit.receipt, receipt) ||
      !Array.isArray(audit.rangeReceipts) || !sameValue(audit.rangeReceipts, receipt.ranges) ||
      (state.rangeReceipts !== undefined && !sameValue(state.rangeReceipts, audit.rangeReceipts))) {
    throw new Error('The previous Wolf attack is not a verifiable finalized attack.');
  }

  const attackNumber = state.attackNumber === undefined ? 1 : state.attackNumber;
  if (!Number.isSafeInteger(attackNumber) || (attackNumber as number) < 1) {
    throw new Error('The previous Wolf attack count is malformed.');
  }
  let pStationRepeat: ResolvedPStationRepeat | undefined;
  if (repeatWasRequested) {
    const sequence = parsePStationSequence(state.pStationSequence);
    const auditedSequence = parsePStationSequence(audit.pStationSequence);
    if (!parsedContext || !sequence || !auditedSequence || !sameValue(sequence, auditedSequence) ||
        !samePStationIdentity(sequence, parsedContext) || parsedContext.parentAttackId !== attackId ||
        parsedContext.parentAttackNumber !== attackNumber || parsedContext.parentTurn !== turn ||
        parsedContext.parentTurn !== currentTurn || parsedContext.sourceCycle !== currentTurn ||
        sequence.sourceCycle !== currentTurn || sequence.attackNumber !== attackNumber) {
      throw new Error('The previous Wolf attack is not a verifiable P Station repeat.');
    }
    const survivors = pStationSurvivors(state, receipt as unknown as Record<string, unknown>, receipt.returningInstanceIds);
    if (!survivors) throw new Error('The previous Wolf attack is not a verifiable P Station survivor manifest.');
    pStationRepeat = {
      state, attackId, turn: turn as number, attackNumber: attackNumber as number,
      returningInstanceIds: [...receipt.returningInstanceIds], repeatContext: parsedContext, survivingShips: survivors,
    };
  } else if ((attackNumber as number) > 3) {
    throw new Error('The previous Wolf attack count is malformed.');
  }
  if ((attackNumber as number) === 1) {
    if (state.previousAttackId !== undefined || state.carryover !== undefined || audit.carryover !== undefined ||
        (audit.attackNumber !== undefined && audit.attackNumber !== 1) || audit.previousAttackId !== undefined) {
      throw new Error('The previous Wolf attack chain is malformed.');
    }
  } else {
    const carryover = state.carryover;
    if (typeof state.previousAttackId !== 'string' || state.previousAttackId === attackId ||
        !record(carryover) || carryover.sourceAttackId !== state.previousAttackId ||
        !Number.isSafeInteger(carryover.sourceTurn) || (carryover.sourceTurn as number) < 1 ||
        (pStationRepeat ? (carryover.sourceTurn as number) > (turn as number) :
          (carryover.sourceTurn as number) >= (turn as number)) ||
        !Array.isArray(carryover.sourceInstanceIds) ||
        !carryover.sourceInstanceIds.every(isReturningInstanceId) ||
        new Set(carryover.sourceInstanceIds).size !== carryover.sourceInstanceIds.length ||
        !Array.isArray(carryover.rosterInstanceIds) ||
        !carryover.rosterInstanceIds.every(isReturningInstanceId) ||
        new Set(carryover.rosterInstanceIds).size !== carryover.rosterInstanceIds.length ||
        carryover.sourceInstanceIds.length !== carryover.rosterInstanceIds.length ||
        audit.attackNumber !== attackNumber || audit.previousAttackId !== state.previousAttackId ||
        !sameValue(audit.carryover, carryover)) {
      throw new Error('The previous Wolf attack chain is malformed.');
    }
  }

  const rangeOrder = ['long-range', 'medium-range', 'short-range'];
  if (receipt.ranges.length !== rangeOrder.length ||
      receipt.ranges.some((range, index) => !record(range) || range.range !== rangeOrder[index])) {
    throw new Error('The previous Wolf attack is not a verifiable finalized attack.');
  }

  const returningInstanceIds = receipt.returningInstanceIds;
  if (!returningInstanceIds.every(isReturningInstanceId) ||
      new Set(returningInstanceIds).size !== returningInstanceIds.length) {
    throw new Error('The previous Wolf attack return manifest is malformed.');
  }
  if (Array.isArray(state.combatRoster)) {
    if (state.combatRoster.some((ship) => !record(ship) || typeof ship.instanceId !== 'string' ||
        typeof ship.shipId !== 'string' || typeof ship.destroyed !== 'boolean')) {
      throw new Error('The previous Wolf attack roster is malformed.');
    }
    const rosterReturns = state.combatRoster
      .filter((ship) => record(ship) && ship.destroyed === false && isReturningInstanceId(ship.instanceId))
      .map((ship) => (ship as Record<string, unknown>).instanceId);
    if (!sameValue(rosterReturns, returningInstanceIds)) {
      throw new Error('The previous Wolf attack is not a verifiable finalized attack.');
    }
  }

  if (pStationRepeat) return pStationRepeat;
  return {
    state,
    attackId,
    turn: turn as number,
    attackNumber: attackNumber as number,
    returningInstanceIds: [...returningInstanceIds],
  };
}

/** Bind the previous attack's surviving card identities to the next prepared roster. */
export function wolfWingCarryoverForPreparation(
  preparation: WolfAttackPreparation,
  previous: ResolvedWolfAttackForCarryover,
): WolfWingCarryoverReceipt {
  const preparedSlots = new Map<string, number[]>();
  preparation.shipIds.forEach((shipId, rosterIndex) => {
    if (!preparedSlots.has(shipId)) preparedSlots.set(shipId, []);
    preparedSlots.get(shipId)!.push(rosterIndex);
  });
  const claimedByShip = new Map<string, number>();
  const rosterInstanceIds = previous.returningInstanceIds.map((sourceInstanceId) => {
    const returnedShip = returningShipForInstanceId(sourceInstanceId);
    if (!returnedShip) throw new Error('The previous Wolf attack return manifest is malformed.');
    const slots = preparedSlots.get(returnedShip.shipId) ?? [];
    const offset = claimedByShip.get(returnedShip.shipId) ?? 0;
    const rosterIndex = slots[offset];
    if (rosterIndex === undefined) {
      const label = (wolfShipForId(returnedShip.shipId)?.label ?? returnedShip.shipId).replace(/^Wolf /, '');
      throw new Error(`The next scheduled composition must include every surviving ${label} from the previous attack.`);
    }
    claimedByShip.set(returnedShip.shipId, offset + 1);
    return `${rosterIndex}:${returnedShip.shipId}`;
  });
  if (rosterInstanceIds.length !== previous.returningInstanceIds.length) {
    throw new Error('The next scheduled composition must include every surviving returning ship from the previous attack.');
  }
  return {
    sourceAttackId: previous.attackId,
    sourceTurn: previous.turn,
    sourceInstanceIds: [...previous.returningInstanceIds],
    rosterInstanceIds,
  };
}
