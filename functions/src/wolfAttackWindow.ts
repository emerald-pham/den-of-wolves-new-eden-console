export const WOLF_ATTACK_WINDOW_STATUSES = ['due', 'resolved', 'deferred'] as const;
export type WolfAttackWindowStatus = typeof WOLF_ATTACK_WINDOW_STATUSES[number];

export interface WolfAttackWindow {
  readonly status: WolfAttackWindowStatus;
  /** The numbered turn in which the facilitator should handle this window. */
  readonly turn: number;
  readonly revision: number;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Read the private facilitator marker without trusting malformed legacy data. */
export function wolfAttackWindowState(value: unknown): WolfAttackWindow | undefined {
  if (!record(value) || !WOLF_ATTACK_WINDOW_STATUSES.includes(value.status as WolfAttackWindowStatus)) {
    return undefined;
  }
  if (!Number.isSafeInteger(value.turn) || (value.turn as number) < 1) return undefined;
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 0) return undefined;
  return {
    status: value.status as WolfAttackWindowStatus,
    turn: value.turn as number,
    revision: value.revision as number,
  };
}
