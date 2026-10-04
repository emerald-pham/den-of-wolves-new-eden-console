import type { WolfAttackParkingDecision } from './wolfAttackParking';
import type { PStationRepeatContext, WolfWingCarryoverReceipt } from './wolfAttackCarryover';
import {
  WOLF_ATTACK_TARGET_IDS,
  type WolfAttackCompositionKind,
  type WolfAttackPreparation,
} from './wolfAttackPreparation';
import { organiserSitesForChart, type ChartId } from './starChartLookup';
import { wolfShipForId, type WolfShipId } from './wolfShipCatalog';
import type { WolfAttackWindow } from './wolfAttackWindow';

/** The declaration boundary owns only the first printed attack step. */
export const WOLF_ATTACK_DECLARATION_STEP = 'targeting' as const;
export type WolfAttackDeclarationStep = typeof WOLF_ATTACK_DECLARATION_STEP;
export const WOLF_ATTACK_PARKING_RELEASE = 'normal-movement-reopened' as const;

export type WolfFighterLaunchChoiceSourceId =
  | 'fighter-wing-alpha'
  | 'fighter-wing-bravo'
  | 'pdf-escort-fighter-wing'
  | 'maliades';

export interface WolfFighterLaunchChoiceRecord {
  readonly sourceId: WolfFighterLaunchChoiceSourceId;
  readonly status: 'launched' | 'passed' | 'unavailable';
  readonly turn: number;
  readonly attackId: string;
  readonly revision: number;
  readonly actorUid: string;
  readonly actorRoleId: string;
  readonly requestId: string;
  readonly reason?: string;
}

/** Private, atomic once-per-cycle Commander dial identity carried to finalization. */
export interface WolfCommanderCycleAttackMarker {
  readonly type: 'wolf-commander-cycle-attack';
  readonly cycle: number;
  readonly ledgerId: string;
  readonly groupId: string;
  readonly targetGroupPursuit: number;
  readonly navigationRevision: number;
  readonly commanderUid: string;
  readonly attackNumber: number;
  readonly parentAttackId?: string;
  readonly parentAttackNumber?: number;
  readonly parentTurn?: number;
  readonly requestId: string;
}

/** Private server state created by the atomic declaration transaction. */
export interface WolfAttackStageState {
  readonly type: 'wolf-attack-state';
  readonly status: 'declared';
  /** Stable identity for this declared attack; range actions bind to it. */
  readonly attackId: string;
  readonly turn: number;
  /** One first attack plus at most two facilitator-selected repeat attacks. */
  readonly attackNumber?: number;
  /** Immutable chain link when this attack consumes a prior finalized attack. */
  readonly previousAttackId?: string;
  /** Returned surviving Wings mapped to the prepared, attack-scoped roster. */
  readonly carryover?: WolfWingCarryoverReceipt;
  /** The selected independent pursuit scope is private attack authority. */
  readonly targetGroupId?: string;
  readonly targetGroupVesselIds?: readonly string[];
  readonly threatSiteCode?: WolfAttackCompositionKind;
  readonly threatSourceId?: string;
  readonly pStationSequence?: Readonly<{
    type: 'p-station-sequence';
    sequenceId: string;
    groupId: string;
    chart: ChartId;
    coordinate: string;
    stationId: 'P';
    sourceTransitionId: string;
    sourceCycle: number;
    attackNumber: number;
  }>;
  readonly commanderCycleAttack?: WolfCommanderCycleAttackMarker;
  readonly revision: number;
  readonly preparationRevision: number;
  readonly currentStep: WolfAttackDeclarationStep;
  readonly deadlineAt: string;
  readonly airspaceLocked: true;
  readonly parkedCraftIds: readonly string[];
  /** Surviving craft keep these hosts until the ordinary movement authority reopens. */
  readonly parkingReleaseCondition: typeof WOLF_ATTACK_PARKING_RELEASE;
  /** Only these printed range-combat craft receive battle-table actions. */
  readonly battleTableCraftActions: readonly {
    readonly craftId: string;
    readonly kind: 'shuttle' | 'fighter-wing';
    readonly ownerRoleId: string;
  }[];
  /** Craft admitted to the battle table by their own authoritative launch action. */
  readonly launchedCraftIds: readonly string[];
  /** Durable per-source launch/pass/unavailable decisions made during targeting. */
  readonly fighterLaunchChoices: Readonly<Partial<Record<WolfFighterLaunchChoiceSourceId, WolfFighterLaunchChoiceRecord>>>;
  readonly parkedShuttleDockings: readonly {
    readonly shuttleId: string;
    readonly shipId: string;
    readonly dockedAt: string;
  }[];
  /** Server-recorded nearest-host choice for every represented shuttle. */
  readonly parkingDecisions: readonly WolfAttackParkingDecision[];
  /** Hidden GM state: targeting rolls remain outside member-readable events. */
  readonly calculationReceipt: unknown;
  /** Current Gorgoneion Captain's source-printed pre-target choice, if available. */
  readonly forceFieldChoice?: unknown;
  /** Hidden Maliades effects committed against this exact attack. */
  readonly maliadesRangeEffects: unknown;
  /** Server-owned consumed roster indexes; each may be used at most once. */
  readonly commanderRerollIndexes: readonly number[];
  readonly preparation: WolfAttackPreparation;
  readonly actorUid: string;
  readonly declaredAt: string;
  readonly announcementId: string;
}

/**
 * A missing attack permits the normal phase clock. Once attack state exists,
 * only an explicit facilitator-resolved state may release ordinary movement;
 * malformed or older unresolved documents remain locked.
 */
export function wolfAttackBlocksNormalMovement(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return true;
  const state = value as Record<string, unknown>;
  return state.status !== 'resolved' || state.airspaceLocked !== false ||
    state.parkingReleaseCondition !== WOLF_ATTACK_PARKING_RELEASE;
}

export interface WolfPStationRepeatPlanRevisions {
  readonly windowRevision: number;
  readonly preparationRevision: number;
}

export type WolfPStationRepeatFinalizationPlan = Readonly<{
  status: 'stopped';
  sequenceId: string;
  groupId: string;
  attackId: string;
  attackNumber: number;
  turn: number;
}> | Readonly<{
  status: 'repeat';
  sequenceId: string;
  context: PStationRepeatContext;
  targetGroupId: string;
  threatSourceId: string;
  turn: number;
  nextAttackNumber: number;
  sourceInstanceIds: readonly string[];
  survivors: readonly Readonly<{ instanceId: string; shipId: WolfShipId }>[];
  window: Omit<WolfAttackWindow, 'revision'> & Readonly<{ revision: number }>;
  preparation: WolfAttackPreparation;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}

/**
 * Build the immutable next-window/restaging plan for a finalized P Station
 * attack. The finalizer may apply the returned window and preparation in the
 * same Firestore transaction that records the final receipt. Survivor order
 * comes only from that receipt; clients never supply or reconstruct the force.
 */
export function pStationRepeatPlanForFinalization(
  stateValue: unknown,
  receiptValue: unknown,
  revisions: WolfPStationRepeatPlanRevisions,
): WolfPStationRepeatFinalizationPlan | undefined {
  if (!isRecord(stateValue)) return undefined;
  const rawSequence = stateValue.pStationSequence;
  if (stateValue.threatSiteCode !== 'P' && rawSequence === undefined) return undefined;
  if (!isRecord(rawSequence) || !isRecord(receiptValue) ||
      !hasExactKeys(rawSequence, [
        'type', 'sequenceId', 'groupId', 'chart', 'coordinate', 'stationId', 'sourceTransitionId',
        'sourceCycle', 'attackNumber',
      ]) || rawSequence.type !== 'p-station-sequence' || rawSequence.stationId !== 'P' ||
      typeof rawSequence.sequenceId !== 'string' || typeof rawSequence.groupId !== 'string' ||
      !/^fleet-[1-9][0-9]*$/.test(rawSequence.groupId) ||
      (rawSequence.chart !== 'A' && rawSequence.chart !== 'B' && rawSequence.chart !== 'C') ||
      typeof rawSequence.coordinate !== 'string' || !/^\d{4}$/.test(rawSequence.coordinate) ||
      organiserSitesForChart(rawSequence.chart as ChartId)[rawSequence.coordinate]?.code !== 'P' ||
      typeof rawSequence.sourceTransitionId !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(rawSequence.sourceTransitionId) ||
      rawSequence.sequenceId !== `wolf-p-station-${rawSequence.sourceTransitionId}` ||
      !Number.isSafeInteger(rawSequence.sourceCycle) || (rawSequence.sourceCycle as number) < 1 ||
      stateValue.status !== 'resolved' || stateValue.currentStep !== 'resolved' ||
      typeof stateValue.attackId !== 'string' ||
      !/^wolf-attack-[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(stateValue.attackId) ||
      !Number.isSafeInteger(stateValue.turn) || stateValue.turn !== rawSequence.sourceCycle ||
      !Number.isSafeInteger(stateValue.attackNumber ?? 1) ||
      rawSequence.attackNumber !== (stateValue.attackNumber ?? 1) ||
      stateValue.targetGroupId !== rawSequence.groupId || stateValue.threatSiteCode !== 'P' ||
      stateValue.threatSourceId !== `arrival-${rawSequence.sourceTransitionId}` ||
      !Number.isSafeInteger(revisions.windowRevision) || revisions.windowRevision < 0 ||
      !Number.isSafeInteger(revisions.preparationRevision) || revisions.preparationRevision < 0 ||
      !Array.isArray(receiptValue.survivingWolfShips) || receiptValue.survivingWolfShips.length > 24) {
    throw new Error('The finalized P Station survivor record is not bound to its attack sequence.');
  }

  const survivors: Array<Readonly<{ instanceId: string; shipId: WolfShipId }>> = [];
  const seen = new Set<string>();
  for (const rawShip of receiptValue.survivingWolfShips) {
    if (!isRecord(rawShip) || !hasExactKeys(rawShip, ['instanceId', 'shipId', 'target']) ||
        typeof rawShip.shipId !== 'string' || typeof rawShip.instanceId !== 'string' ||
        typeof rawShip.target !== 'string' || !(WOLF_ATTACK_TARGET_IDS as readonly string[]).includes(rawShip.target)) {
      throw new Error('The finalized P Station survivor record is malformed.');
    }
    const ship = wolfShipForId(rawShip.shipId);
    if (!ship || !new RegExp(`^(0|[1-9]\\d*):${ship.id}$`).test(rawShip.instanceId) || seen.has(rawShip.instanceId)) {
      throw new Error('The finalized P Station survivor identities are malformed.');
    }
    seen.add(rawShip.instanceId);
    survivors.push({ instanceId: rawShip.instanceId, shipId: ship.id });
  }

  const sequenceId = rawSequence.sequenceId;
  const groupId = rawSequence.groupId;
  const attackId = stateValue.attackId;
  const attackNumber = (stateValue.attackNumber ?? 1) as number;
  const turn = stateValue.turn as number;
  if (survivors.length === 0) {
    return {
      status: 'stopped', sequenceId, groupId, attackId, attackNumber, turn,
    };
  }

  const threatSourceId = `arrival-${rawSequence.sourceTransitionId}`;
  const nextAttackNumber = attackNumber + 1;
  const context: PStationRepeatContext = {
    type: 'p-station-repeat',
    sequenceId,
    groupId,
    chart: rawSequence.chart as ChartId,
    coordinate: rawSequence.coordinate,
    stationId: 'P',
    sourceTransitionId: rawSequence.sourceTransitionId,
    sourceCycle: rawSequence.sourceCycle as number,
    parentAttackId: attackId,
    parentAttackNumber: attackNumber,
    parentTurn: turn,
    nextAttackNumber,
  };
  const preparation: WolfAttackPreparation = {
    turn,
    shipIds: survivors.map(({ shipId }) => shipId),
    targetMode: 'pre-rolled',
    targetAssignments: [],
    modifiers: [],
    notes: '',
    revision: revisions.preparationRevision + 1,
    compositionKind: 'p-station-repeat',
    targetGroupId: groupId,
  };
  const window: WolfAttackWindow = {
    status: 'due',
    turn,
    revision: revisions.windowRevision + 1,
    targetGroupId: groupId,
    threatSiteCode: 'P',
    threatSourceId,
  };
  return {
    status: 'repeat', sequenceId, context, targetGroupId: groupId, threatSourceId, turn,
    nextAttackNumber, sourceInstanceIds: survivors.map(({ instanceId }) => instanceId), survivors,
    window, preparation,
  };
}
