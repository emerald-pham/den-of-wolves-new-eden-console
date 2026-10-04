import { isWolfCalculationReceipt } from './wolfCombatMath';
import type { WolfAttackPreparation } from './wolfAttackPreparation';
import { wolfShipForId } from './wolfShipCatalog';

export interface ResolvedWolfAttackForCarryover {
  readonly state: Readonly<Record<string, unknown>>;
  readonly attackId: string;
  readonly turn: number;
  readonly attackNumber: number;
  readonly returningInstanceIds: readonly string[];
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
export function resolvedWolfAttackForCarryover(
  stateValue: unknown,
  finalizationAuditValue: unknown,
  currentTurn: number,
): ResolvedWolfAttackForCarryover {
  if (!record(stateValue) || !record(finalizationAuditValue)) {
    throw new Error('The previous Wolf attack is not a verifiable finalized attack.');
  }
  const state = stateValue;
  const attackId = state.attackId;
  const turn = state.turn;
  const revision = state.revision;
  const receipt = state.calculationReceipt;
  const audit = finalizationAuditValue;
  if (state.type !== 'wolf-attack-state' || state.status !== 'resolved' || state.currentStep !== 'resolved' ||
      state.airspaceLocked !== false || state.parkingReleaseCondition !== 'normal-movement-reopened' ||
      typeof attackId !== 'string' || !/^wolf-attack-[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(attackId) ||
      state.announcementId !== attackId || !Number.isSafeInteger(turn) || (turn as number) < 1 ||
      !Number.isSafeInteger(revision) || (revision as number) < 1 ||
      !Number.isSafeInteger(currentTurn) || currentTurn <= (turn as number) ||
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
  if (!Number.isSafeInteger(attackNumber) || (attackNumber as number) < 1 || (attackNumber as number) > 3) {
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
        (carryover.sourceTurn as number) >= (turn as number) ||
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
