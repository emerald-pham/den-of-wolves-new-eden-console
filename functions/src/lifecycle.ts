/** Server-owned lifecycle states for a session. */
export type LifecyclePhase =
  | 'lobby'
  | 'casting'
  | 'briefing'
  | 'active'
  | 'success'
  | 'failure'
  | 'debrief'
  | 'closed'
  | 'retained-empty';

const lifecyclePhases: readonly LifecyclePhase[] = [
  'lobby',
  'casting',
  'briefing',
  'active',
  'success',
  'failure',
  'debrief',
  'closed',
  'retained-empty',
];

/**
 * The only legal lifecycle edges. Terminal phases deliberately have no
 * outgoing edges; reopening a session must be modeled as a new session.
 */
export const LEGAL_LIFECYCLE_TRANSITIONS: Readonly<Record<LifecyclePhase, readonly LifecyclePhase[]>> = {
  lobby: ['casting', 'retained-empty', 'closed'],
  casting: ['lobby', 'briefing', 'retained-empty'],
  briefing: ['casting', 'active', 'retained-empty'],
  active: ['success', 'failure', 'debrief'],
  success: ['debrief', 'closed'],
  failure: ['debrief', 'closed'],
  debrief: ['closed'],
  closed: [],
  'retained-empty': [],
};

function isLifecyclePhase(value: string): value is LifecyclePhase {
  return lifecyclePhases.includes(value as LifecyclePhase);
}

/** Return whether a proposed edge is explicitly present in the policy. */
export function canTransitionLifecycle(from: LifecyclePhase, to: LifecyclePhase): boolean {
  if (!isLifecyclePhase(from) || !isLifecyclePhase(to)) return false;
  return LEGAL_LIFECYCLE_TRANSITIONS[from].includes(to);
}

/** Validate and return the destination for use inside a state transition. */
export function assertLifecycleTransition(
  from: LifecyclePhase,
  to: LifecyclePhase,
): LifecyclePhase {
  if (!isLifecyclePhase(from) || !isLifecyclePhase(to)) {
    throw new Error(`Unknown lifecycle phase: ${String(!isLifecyclePhase(from) ? from : to)}`);
  }
  if (!canTransitionLifecycle(from, to)) {
    throw new Error(`Illegal lifecycle transition: ${from} -> ${to}`);
  }
  return to;
}
