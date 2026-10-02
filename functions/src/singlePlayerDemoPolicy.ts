export const DEMO_JUMP_UNAVAILABLE_MESSAGE = 'Jumps are unavailable in Demo mode.' as const;

export const DEMO_COMPLETE_RESULT = {
  status: 'complete',
  mode: 'demo',
  finalCycle: 1,
  title: 'Demo complete',
  message: 'Demo mode ends after Cycle 1.',
} as const;

export type DemoJumpDenial = {
  code: 'demo-jump-unavailable';
  message: typeof DEMO_JUMP_UNAVAILABLE_MESSAGE;
};

/**
 * Returns a denial for every jump in a Demo session. Call this from the
 * authoritative transaction after reading the session and before checking
 * replay, revision, actor, or jump-specific request state, and before writes.
 */
export function getSinglePlayerDemoJumpDenial(isDemoSession: boolean): DemoJumpDenial | null {
  if (!isDemoSession) return null;

  return {
    code: 'demo-jump-unavailable',
    message: DEMO_JUMP_UNAVAILABLE_MESSAGE,
  };
}

/**
 * Returns the terminal Demo result before a request could advance past Cycle 1.
 * Cycle 0 is setup and remains able to enter Cycle 1; malformed Demo cycle
 * state fails closed. Ordinary sessions are not constrained by this policy.
 */
export function getSinglePlayerDemoAdvanceBoundary(
  isDemoSession: boolean,
  currentTurn: unknown,
): typeof DEMO_COMPLETE_RESULT | null {
  if (!isDemoSession || currentTurn === 0) return null;
  return DEMO_COMPLETE_RESULT;
}

/** Public membership recovery carries only the recognized two-field marker. */
export function publicSinglePlayerDemoState(value: unknown): {
  readonly status: 'active' | 'complete'; readonly finalCycle: 1;
} | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const marker = value as Record<string, unknown>;
  if (Object.keys(marker).length !== 2 ||
      (marker.status !== 'active' && marker.status !== 'complete') || marker.finalCycle !== 1) return null;
  return { status: marker.status, finalCycle: 1 };
}
