/** The server-owned phases in which an action may be attempted. */
export type ActionPhase = 'team' | 'coordination';

/** The server-recognized scope of the actor attempting an action. */
export type ActorScope = 'player' | 'facilitator' | 'system';

/** The bounded action vocabulary covered by this metadata foundation. */
export type ActionId =
  | 'maintenance'
  | 'charge'
  | 'fuel'
  | 'repair'
  | 'transfer'
  | 'jump'
  | 'movement'
  | 'scouting'
  | 'research'
  | 'press';

export type ActionMetadata = Readonly<{
  actorScope: readonly ActorScope[];
  requiredPhase: ActionPhase;
}>;

/**
 * Declarative server metadata for the Team and Coordination action families.
 * Callables should consult this registry before mutating authoritative state.
 */
export const ACTION_METADATA: Readonly<Record<ActionId, ActionMetadata>> = {
  maintenance: { actorScope: ['player', 'facilitator'], requiredPhase: 'team' },
  charge: { actorScope: ['player', 'facilitator'], requiredPhase: 'team' },
  fuel: { actorScope: ['player', 'facilitator'], requiredPhase: 'team' },
  repair: { actorScope: ['player', 'facilitator'], requiredPhase: 'team' },
  transfer: { actorScope: ['player', 'facilitator'], requiredPhase: 'team' },
  jump: { actorScope: ['player', 'facilitator'], requiredPhase: 'coordination' },
  movement: { actorScope: ['player', 'facilitator'], requiredPhase: 'coordination' },
  scouting: { actorScope: ['player', 'facilitator'], requiredPhase: 'coordination' },
  research: { actorScope: ['player', 'facilitator'], requiredPhase: 'coordination' },
  press: { actorScope: ['facilitator', 'system'], requiredPhase: 'coordination' },
};

export type NormalizedActionPhase = ActionPhase | 'unknown';

type LegacyTurnPhaseRecord = {
  readonly airspace?: { readonly state?: unknown };
  readonly state?: unknown;
};

function isRecord(value: unknown): value is LegacyTurnPhaseRecord {
  return typeof value === 'object' && value !== null;
}

/**
 * Converts current and legacy Firestore turnPhase shapes to the server phase.
 * Missing or malformed state is deliberately unknown, never permissive.
 */
export function phaseFromTurnPhase(turnPhase: unknown): NormalizedActionPhase {
  if (!isRecord(turnPhase)) return 'unknown';

  const nestedState = isRecord(turnPhase.airspace) ? turnPhase.airspace.state : undefined;
  const state = nestedState === undefined ? turnPhase.state : nestedState;

  if (state === 'restricted') return 'team';
  if (state === 'lifted') return 'coordination';
  return 'unknown';
}

export type ActionAuthorizationInput = Readonly<{
  action: ActionId;
  actorScope: ActorScope;
  turnPhase: unknown;
}>;

export type ActionAuthorizationDecision =
  | Readonly<{
      allowed: true;
      action: ActionId;
      phase: ActionPhase;
      reason: 'allowed';
    }>
  | Readonly<{
      allowed: false;
      action: ActionId;
      phase: NormalizedActionPhase;
      reason: 'actor-scope-denied' | 'unknown-phase' | 'wrong-phase';
    }>;

/**
 * Explicit server-side action gate. Every non-allowed result has a stable
 * reason so callers can reject consistently and tests can assert the policy.
 */
export function decideActionAuthorization(
  input: ActionAuthorizationInput,
): ActionAuthorizationDecision {
  const metadata = ACTION_METADATA[input.action];
  const phase = phaseFromTurnPhase(input.turnPhase);

  if (phase === 'unknown') {
    return { allowed: false, action: input.action, phase, reason: 'unknown-phase' };
  }

  if (phase !== metadata.requiredPhase) {
    return { allowed: false, action: input.action, phase, reason: 'wrong-phase' };
  }

  if (!metadata.actorScope.includes(input.actorScope)) {
    return { allowed: false, action: input.action, phase, reason: 'actor-scope-denied' };
  }

  return { allowed: true, action: input.action, phase, reason: 'allowed' };
}
