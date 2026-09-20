import type { WolfAttackPreparation } from './wolfAttackPreparation';

/** The declaration boundary owns only the first printed attack step. */
export const WOLF_ATTACK_DECLARATION_STEP = 'targeting' as const;
export type WolfAttackDeclarationStep = typeof WOLF_ATTACK_DECLARATION_STEP;

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
  /** Only these printed range-combat craft receive battle-table actions. */
  readonly battleTableCraftActions: readonly {
    readonly craftId: string;
    readonly kind: 'shuttle' | 'fighter-wing';
    readonly ownerRoleId: string;
  }[];
  readonly parkedShuttleDockings: readonly {
    readonly shuttleId: string;
    readonly shipId: string;
    readonly dockedAt: string;
  }[];
  /** Hidden GM state: targeting rolls remain outside member-readable events. */
  readonly calculationReceipt: unknown;
  /** Server-owned consumed roster indexes; each may be used at most once. */
  readonly commanderRerollIndexes: readonly number[];
  readonly preparation: WolfAttackPreparation;
  readonly actorUid: string;
  readonly declaredAt: string;
  readonly announcementId: string;
}
