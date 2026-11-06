/**
 * Wire shapes for the Boa mission-reclamation callables. Dependency-free so the
 * web client can import it without pulling server modules into its program.
 */
export interface BoaMissionReclamationTaskOpportunity {
  readonly id: string;
  readonly description: string;
  readonly difficulty: number | null;
  readonly criticalThreshold: number | null;
}

export interface BoaMissionReclamationWorkspaceOpportunity {
  readonly missionOpportunityId: string;
  readonly groupId: string;
  readonly chart: string;
  readonly coordinate: string;
  readonly siteCode: string;
  readonly siteName: string;
  readonly sourceCycle: number;
  readonly taskOpportunities: readonly BoaMissionReclamationTaskOpportunity[];
  readonly choiceRevision: number;
  readonly selectedTaskOpportunityId?: string;
}

export interface BoaMissionReclamationWorkspaceReply {
  readonly status: 'available';
  readonly sessionId: string;
  readonly actorUid: string;
  readonly groupId: string;
  readonly hostShipId: string;
  readonly controlRevision: number;
  readonly cycle: number;
  readonly opportunities: readonly BoaMissionReclamationWorkspaceOpportunity[];
}

export interface BoaMissionReclamationChoiceReply {
  readonly status: 'committed' | 'replayed';
  readonly sessionId: string;
  readonly requestId: string;
  readonly missionOpportunityId: string;
  readonly taskOpportunityId: string;
  readonly choiceRevision: number;
}

/**
 * Halve the difficulty of the printed Boa reclamation opportunity, rounding
 * an odd difficulty up (owner decision, 2026-11-05; PRODUCT_MILESTONE_ASSUMPTIONS
 * PC10.2-C2). With integer card totals this is equivalent to comparing
 * against the exact half-point. The printed critical threshold is unchanged;
 * the reward replacement (one Scrap, no critical bonus) happens in rewards.
 */
export function halvedBoaReclamationDifficulty(difficulty: number): number {
  return Math.ceil(difficulty / 2);
}
