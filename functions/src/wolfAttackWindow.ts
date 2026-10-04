export const WOLF_ATTACK_WINDOW_STATUSES = ['due', 'resolved', 'deferred'] as const;
export type WolfAttackWindowStatus = typeof WOLF_ATTACK_WINDOW_STATUSES[number];
export type WolfAttackThreatSiteCode = 'L' | 'M' | 'P' | 'commander';

export interface WolfAttackWindow {
  readonly status: WolfAttackWindowStatus;
  /** The numbered turn in which the facilitator should handle this window. */
  readonly turn: number;
  readonly revision: number;
  /** Server-selected group whose independent pursuit is used for this attack. */
  readonly targetGroupId?: string;
  /** Source-defined continuing-pressure or Commander dial selected for the window. */
  readonly threatSiteCode?: WolfAttackThreatSiteCode;
  /** Immutable GM-only pressure schedule that caused a base or Station attack. */
  readonly threatSourceId?: string;
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
  const targetGroupId = value.targetGroupId;
  const threatSiteCode = value.threatSiteCode;
  const threatSourceId = value.threatSourceId;
  if (targetGroupId !== undefined &&
      (typeof targetGroupId !== 'string' || !/^fleet-[1-9][0-9]*$/.test(targetGroupId))) return undefined;
  if (threatSiteCode !== undefined &&
      (threatSiteCode !== 'L' && threatSiteCode !== 'M' && threatSiteCode !== 'P' && threatSiteCode !== 'commander')) {
    return undefined;
  }
  if ((threatSiteCode !== undefined && targetGroupId === undefined) ||
      ((threatSiteCode === 'L' || threatSiteCode === 'M' || threatSiteCode === 'P') &&
        (typeof threatSourceId !== 'string' || !/^arrival-[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(threatSourceId))) ||
      (threatSourceId !== undefined &&
        (typeof threatSourceId !== 'string' || !/^arrival-[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(threatSourceId)))) {
    return undefined;
  }
  return {
    status: value.status as WolfAttackWindowStatus,
    turn: value.turn as number,
    revision: value.revision as number,
    ...(typeof targetGroupId === 'string' ? { targetGroupId } : {}),
    ...(threatSiteCode !== undefined ? { threatSiteCode } : {}),
    ...(typeof threatSourceId === 'string' ? { threatSourceId } : {}),
  };
}
