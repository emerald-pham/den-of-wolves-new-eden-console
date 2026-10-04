export type PresidentialElectionState = 'scheduled' | 'open' | 'tie-pending' | 'resolved' | 'no-winner';
export type PresidentialElectionVotingSystem = 'plurality' | 'majority';
export type PresidentialElectionPopulationWeighting = 'equal' | 'ship-population';
export type PresidentialElectionCampaignPolicy = 'open' | 'structured' | 'prohibited';
export type PresidentialElectionSupplyPolicy = 'prohibited' | 'facilitator-approved';
export type PresidentialElectionTiePolicy = 'current-office-remains' | 'facilitator-choice';

export interface PresidentialElectionPolicyProjection {
  readonly votingSystem: PresidentialElectionVotingSystem;
  readonly populationWeighting: PresidentialElectionPopulationWeighting;
  readonly openCycle: number;
  readonly closeCycle: number;
  readonly vicePresidentEnabled: boolean;
  readonly campaigning: PresidentialElectionCampaignPolicy;
  readonly supplyUse: PresidentialElectionSupplyPolicy;
  readonly campaignInstructions: string;
  readonly tieRule: PresidentialElectionTiePolicy;
}

export type PresidentialElectionPolicyInput = PresidentialElectionPolicyProjection & {
  readonly eligibleVoterUids: readonly string[];
};

export interface PresidentialElectionCandidateProjection {
  /** Per-election opaque candidate key; it is not a Firebase user id. */
  readonly id: string;
  readonly displayName: string;
}

export interface PresidentialElectionOfficeTallyProjection {
  readonly totalVotes: number;
  readonly totalWeight: number;
  readonly scores: Readonly<Record<string, number>>;
  readonly tiedCandidateIds: readonly string[];
  readonly winnerId?: string;
}

export interface PresidentialElectionTallyProjection {
  readonly president: PresidentialElectionOfficeTallyProjection;
  readonly vicePresident?: PresidentialElectionOfficeTallyProjection;
}

/** Member-readable procedure and result; secret ballots and voter-to-ship maps never enter this projection. */
export interface PresidentialElectionProjection {
  readonly type: 'presidential-election';
  readonly revision: number;
  readonly state: PresidentialElectionState;
  readonly policy: PresidentialElectionPolicyProjection;
  readonly candidates: readonly PresidentialElectionCandidateProjection[];
  readonly tally?: PresidentialElectionTallyProjection;
  readonly presidentCandidateId?: string;
  readonly vicePresidentCandidateId?: string;
  readonly pendingPresidentTie?: readonly string[];
  readonly pendingVicePresidentTie?: readonly string[];
  readonly decidedCycle?: number;
}

/** Elected offices are a session authority projection, separate from station seats and ship roles. */
export interface PresidentialOfficesProjection {
  readonly electionId: 'current';
  readonly revision: number;
  readonly presidentCandidateId: string;
  readonly presidentDisplayName: string;
  readonly vicePresidentCandidateId?: string;
  readonly vicePresidentDisplayName?: string;
  readonly decidedCycle: number;
}
