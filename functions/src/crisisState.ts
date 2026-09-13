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

export const CRISIS_KINDS = [
  'custom', 'approaching-vessel', 'disease-outbreak', 'religious-zealotry',
  'civil-unrest', 'presidential-election',
] as const;
export type CrisisKind = (typeof CRISIS_KINDS)[number];
export function isCrisisKind(value: unknown): value is CrisisKind {
  return typeof value === 'string' && (CRISIS_KINDS as readonly string[]).includes(value);
}

/** Configuration requirements, not automatic crisis consequences. */
export function crisisConfigurationBlocker(kind: CrisisKind, configuration: {
  readonly presidentEnabled: boolean;
  readonly universalArbourEnabled: boolean;
}): string | null {
  if (kind === 'presidential-election' && !configuration.presidentEnabled) {
    return 'This crisis requires the President role. Record a facilitator override to adapt it.';
  }
  if (kind === 'religious-zealotry' && !configuration.universalArbourEnabled) {
    return 'This crisis requires Universal Arbour loyalties. Record a facilitator override to adapt it.';
  }
  return null;
}

/** Public facts paraphrased from the authorized Approaching Vessel crisis card. */
export const APPROACHING_VESSEL_REPORT = {
  title: 'Approaching vessel',
  body: 'An exhausted pilot from a Gliese scout reported a larger ship approaching and urgently needing help. The pilot stopped communicating and was later found dead, apparently from hunger and exhaustion. The approaching ship’s population, needs and potential value remain unknown. Crew concerns include pressure on supplies, disease and hostile intent; the report could also be false. The scout activated a location beacon, which could increase Wolf attack risk if the fleet stays here.',
} as const;
