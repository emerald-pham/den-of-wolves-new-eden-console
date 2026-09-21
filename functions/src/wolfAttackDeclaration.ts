import type { WolfAttackPreparation } from './wolfAttackPreparation';
import type { WolfAttackParkingDecision } from './wolfAttackParking';

/** The declaration boundary owns only the first printed attack step. */
export const WOLF_ATTACK_DECLARATION_STEP = 'targeting' as const;
export type WolfAttackDeclarationStep = typeof WOLF_ATTACK_DECLARATION_STEP;
export const WOLF_ATTACK_PARKING_RELEASE = 'normal-movement-reopened' as const;

/** Private server state created by the atomic declaration transaction. */
export interface WolfAttackStageState {
  readonly type: 'wolf-attack-state';
  readonly status: 'declared';
  readonly turn: number;
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
  readonly parkedShuttleDockings: readonly {
    readonly shuttleId: string;
    readonly shipId: string;
    readonly dockedAt: string;
  }[];
  /** Server-recorded nearest-host choice for every represented shuttle. */
  readonly parkingDecisions: readonly WolfAttackParkingDecision[];
  /** Hidden GM state: targeting rolls remain outside member-readable events. */
  readonly calculationReceipt: unknown;
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
