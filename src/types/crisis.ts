import type { SessionId } from './identifiers';

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

export const CRISIS_TRANSITIONS: Readonly<Record<CrisisStateName, readonly CrisisStateName[]>> = {
  draft: ['delivered'],
  delivered: ['debated'],
  debated: ['resolved', 'escalated'],
  resolved: ['announced'],
  escalated: ['debated', 'resolved'],
  announced: ['closed'],
  closed: [],
};

export interface CrisisStateProjection {
  readonly sessionId: SessionId;
  readonly crisisId: string;
  readonly state: CrisisStateName;
  readonly revision: number;
  readonly title: string;
  readonly details: string;
  readonly updatedAt?: string;
}

export function isCrisisState(value: unknown): value is CrisisStateName {
  return typeof value === 'string' && (CRISIS_STATES as readonly string[]).includes(value);
}

export function nextCrisisStates(
  current: CrisisStateProjection | null,
): readonly CrisisStateName[] {
  if (!current) return ['draft'];
  // A closed record remains the audit anchor for the prior crisis, while the
  // next facilitator-authored crisis starts a fresh lifecycle.
  return current.state === 'closed' ? ['draft'] : CRISIS_TRANSITIONS[current.state];
}
