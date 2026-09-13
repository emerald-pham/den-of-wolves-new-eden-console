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
  readonly crisisKind?: CrisisKind;
  readonly configurationOverride?: string;
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

export const CRISIS_KINDS = ['custom', 'approaching-vessel', 'disease-outbreak', 'religious-zealotry', 'civil-unrest', 'presidential-election'] as const;
export type CrisisKind = (typeof CRISIS_KINDS)[number];
export function isCrisisKind(value: unknown): value is CrisisKind {
  return typeof value === 'string' && (CRISIS_KINDS as readonly string[]).includes(value);
}
export const CRISIS_KIND_LABELS: Readonly<Record<CrisisKind, string>> = {
  custom: 'Custom crisis',
  'approaching-vessel': 'Approaching Vessel',
  'disease-outbreak': 'Disease Outbreak',
  'religious-zealotry': 'Religious Zealotry',
  'civil-unrest': 'Civil Unrest',
  'presidential-election': 'Presidential Election',
};

/** Member-readable report; no facilitator notes or hidden decisions. */
export interface CrisisReport {
  readonly sessionId: string;
  readonly crisisId: string;
  readonly state: Exclude<CrisisStateName, 'draft'>;
  readonly revision: number;
  readonly title: string;
  readonly body: string;
}
