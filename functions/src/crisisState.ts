export const CRISIS_STATES = [
  'draft',
  'delivered',
  'debated',
  'resolved',
  'escalated',
  'announced',
  'closed',
] as const;

export type CrisisStateName = (typeof CRISIS_STATES)[number];

/**
 * The facilitator advances a manually authored crisis through this durable
 * lifecycle. The product source defines the facilitator's delivery and
 * announcement responsibilities; it does not define automatic outcomes or
 * player decision mechanics, so every transition remains an explicit GM
 * action.
 */
export const CRISIS_TRANSITIONS: Readonly<Record<CrisisStateName, readonly CrisisStateName[]>> = {
  draft: ['delivered'],
  delivered: ['debated'],
  debated: ['resolved', 'escalated'],
  resolved: ['announced'],
  escalated: ['debated', 'resolved'],
  announced: ['closed'],
  closed: [],
};

export function isCrisisState(value: unknown): value is CrisisStateName {
  return typeof value === 'string' && (CRISIS_STATES as readonly string[]).includes(value);
}

export function canTransitionCrisis(
  from: CrisisStateName | undefined,
  to: CrisisStateName,
): boolean {
  return from === undefined ? to === 'draft' : CRISIS_TRANSITIONS[from].includes(to);
}
