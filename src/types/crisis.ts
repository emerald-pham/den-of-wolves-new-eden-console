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
  readonly diseaseOutbreak?: DiseaseOutbreakDetails;
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

export const ZEALOTRY_RESPONSE_ACTIONS = ['leave', 'pressure', 'investigate', 'arrest'] as const;
export type ZealotryResponseAction = (typeof ZEALOTRY_RESPONSE_ACTIONS)[number];

/** Facilitator-only explicit response; it carries census context, never census identities. */
export interface ZealotryResponse {
  readonly sessionId: SessionId;
  readonly crisisId: string;
  readonly crisisRevision: number;
  readonly state: 'debated';
  readonly revision: number;
  readonly actions: readonly ZealotryResponseAction[];
  readonly customResponse?: string;
  readonly rationale: string;
  readonly loyaltyCensusRevision: number | null;
  readonly actorUid?: string;
  readonly updatedAt?: string;
}

/** Member-readable report; no facilitator notes or hidden decisions. */
export interface CrisisReport {
  readonly sessionId: string;
  readonly crisisId: string;
  readonly state: Exclude<CrisisStateName, 'draft'>;
  readonly revision: number;
  readonly title: string;
  readonly body: string;
  readonly crisisKind?: CrisisKind;
}

export type CivilUnrestGrievanceVisibility = 'private' | 'public';

export interface CivilUnrestGrievance {
  readonly sessionId: string;
  readonly crisisId: string;
  readonly shipId: string;
  readonly visibility: CivilUnrestGrievanceVisibility;
  readonly text: string;
  readonly revision: number;
  readonly crisisRevision: number;
}

export interface CivilUnrestPublicProjection {
  readonly sessionId: string;
  readonly crisisId: string;
  readonly state: Exclude<CrisisStateName, 'draft' | 'resolved' | 'announced' | 'closed'>;
  readonly revision: number;
  readonly grievances: readonly Pick<CivilUnrestGrievance, 'shipId' | 'text' | 'revision'>[];
}

export interface DiseaseOutbreakDetails {
  readonly affectedShipIds: readonly string[];
  readonly workRestrictions: string;
  readonly escalationRisk: string;
}

export function parseDiseaseOutbreak(value: unknown): DiseaseOutbreakDetails | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.affectedShipIds) || raw.affectedShipIds.length === 0 || raw.affectedShipIds.length > 20 ||
      raw.affectedShipIds.some(id => typeof id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(id)) ||
      new Set(raw.affectedShipIds).size !== raw.affectedShipIds.length ||
      typeof raw.workRestrictions !== 'string' || !raw.workRestrictions.trim() || raw.workRestrictions.trim().length > 1000 ||
      typeof raw.escalationRisk !== 'string' || !raw.escalationRisk.trim() || raw.escalationRisk.trim().length > 1000) return null;
  return { affectedShipIds: [...raw.affectedShipIds] as string[], workRestrictions: raw.workRestrictions.trim(), escalationRisk: raw.escalationRisk.trim() };
}
