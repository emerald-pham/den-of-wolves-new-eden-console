export const ELECTION_VOTING_SYSTEMS = ['plurality', 'majority'] as const;
export const ELECTION_POPULATION_WEIGHTINGS = ['equal', 'ship-population'] as const;
export const ELECTION_CAMPAIGN_POLICIES = ['open', 'structured', 'prohibited'] as const;
export const ELECTION_SUPPLY_POLICIES = ['prohibited', 'facilitator-approved'] as const;
export const ELECTION_TIE_POLICIES = ['current-office-remains', 'facilitator-choice'] as const;

export type ElectionVotingSystem = (typeof ELECTION_VOTING_SYSTEMS)[number];
export type ElectionPopulationWeighting = (typeof ELECTION_POPULATION_WEIGHTINGS)[number];
export type ElectionCampaignPolicy = (typeof ELECTION_CAMPAIGN_POLICIES)[number];
export type ElectionSupplyPolicy = (typeof ELECTION_SUPPLY_POLICIES)[number];
export type ElectionTiePolicy = (typeof ELECTION_TIE_POLICIES)[number];

export interface ElectionEligibleVoter {
  readonly uid: string;
  readonly shipId: string;
}

export interface ElectionPolicy {
  readonly eligibleVoterUids: readonly string[];
  readonly voterShipIds: Readonly<Record<string, string>>;
  readonly votingSystem: ElectionVotingSystem;
  readonly populationWeighting: ElectionPopulationWeighting;
  readonly openCycle: number;
  readonly closeCycle: number;
  readonly vicePresidentEnabled: boolean;
  readonly campaigning: ElectionCampaignPolicy;
  readonly supplyUse: ElectionSupplyPolicy;
  readonly campaignInstructions: string;
  readonly tieRule: ElectionTiePolicy;
}

export interface ElectionBallot {
  readonly voterUid: string;
  readonly presidentUid: string;
  readonly vicePresidentUid?: string;
}

export interface ElectionOfficeTally {
  readonly totalVotes: number;
  readonly totalWeight: number;
  readonly scores: Readonly<Record<string, number>>;
  readonly tiedCandidates: readonly string[];
  readonly winnerUid?: string;
}

export interface ElectionTally {
  readonly president: ElectionOfficeTally;
  readonly vicePresident?: ElectionOfficeTally;
}

export type ElectionWinnerDecision =
  | { readonly status: 'winner'; readonly winnerUid: string; readonly source: 'vote' | 'current-office-remains' | 'facilitator-tie-choice' }
  | { readonly status: 'tie-pending'; readonly candidateUids: readonly string[] }
  | { readonly status: 'no-winner' };

export type ElectionVicePresidentDecision =
  | { readonly status: 'winner'; readonly winnerUid: string; readonly source: 'vote' | 'current-office-remains' | 'facilitator-tie-choice' | 'vp-ballot-runner-up' }
  | { readonly status: 'tie-pending'; readonly candidateUids: readonly string[]; readonly source: 'vote' | 'vp-ballot-runner-up' }
  | { readonly status: 'no-winner' }
  | { readonly status: 'vacancy-required' }
  | { readonly status: 'conflict-pending'; readonly candidateUids: readonly string[]; readonly reason: 'incumbent-would-hold-both-offices' | 'incumbent-not-eligible-for-vp-runner-up' };

const POLICY_KEYS = new Set([
  'eligibleVoterUids', 'votingSystem', 'populationWeighting', 'openCycle', 'closeCycle',
  'vicePresidentEnabled', 'campaigning', 'supplyUse', 'campaignInstructions', 'tieRule',
]);

/** Normalize facilitator policy while deriving the electorate's ship mapping on the server. */
export function normalizeElectionPolicy(
  value: unknown,
  eligibleVoterShips: readonly ElectionEligibleVoter[],
  currentCycle: number,
): ElectionPolicy | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).some((key) => !POLICY_KEYS.has(key)) ||
      !Array.isArray(raw.eligibleVoterUids) || raw.eligibleVoterUids.length < 2 ||
      raw.eligibleVoterUids.length > 300 ||
      raw.eligibleVoterUids.some((uid) => typeof uid !== 'string' || !/^[\w-]{1,128}$/.test(uid)) ||
      new Set(raw.eligibleVoterUids).size !== raw.eligibleVoterUids.length ||
      !(ELECTION_VOTING_SYSTEMS as readonly unknown[]).includes(raw.votingSystem) ||
      !(ELECTION_POPULATION_WEIGHTINGS as readonly unknown[]).includes(raw.populationWeighting) ||
      !Number.isSafeInteger(raw.openCycle) || Number(raw.openCycle) < Math.max(1, currentCycle) ||
      !Number.isSafeInteger(raw.closeCycle) || Number(raw.closeCycle) < Number(raw.openCycle) ||
      typeof raw.vicePresidentEnabled !== 'boolean' ||
      !(ELECTION_CAMPAIGN_POLICIES as readonly unknown[]).includes(raw.campaigning) ||
      !(ELECTION_SUPPLY_POLICIES as readonly unknown[]).includes(raw.supplyUse) ||
      typeof raw.campaignInstructions !== 'string' || !raw.campaignInstructions.trim() ||
      raw.campaignInstructions.length > 1200 ||
      !(ELECTION_TIE_POLICIES as readonly unknown[]).includes(raw.tieRule)) return null;

  const eligibleByUid = new Map(eligibleVoterShips.map((voter) => [voter.uid, voter.shipId]));
  const uids = raw.eligibleVoterUids as string[];
  if (uids.some((uid) => !eligibleByUid.has(uid))) return null;
  const voterShipIds = Object.fromEntries(uids.map((uid) => [uid, eligibleByUid.get(uid)!]));
  if (raw.populationWeighting === 'ship-population' && new Set(Object.values(voterShipIds)).size !== uids.length) {
    // One eligible representative per ship avoids multiplying a ship's population by its crew count.
    return null;
  }
  return {
    eligibleVoterUids: [...uids], voterShipIds,
    votingSystem: raw.votingSystem as ElectionVotingSystem,
    populationWeighting: raw.populationWeighting as ElectionPopulationWeighting,
    openCycle: Number(raw.openCycle), closeCycle: Number(raw.closeCycle),
    vicePresidentEnabled: raw.vicePresidentEnabled,
    campaigning: raw.campaigning as ElectionCampaignPolicy,
    supplyUse: raw.supplyUse as ElectionSupplyPolicy,
    campaignInstructions: raw.campaignInstructions.trim(),
    tieRule: raw.tieRule as ElectionTiePolicy,
  };
}

function tallyOffice(
  policy: ElectionPolicy,
  ballots: readonly ElectionBallot[],
  shipPopulations: Readonly<Record<string, number>>,
  office: 'president' | 'vicePresident',
): ElectionOfficeTally {
  const scores: Record<string, number> = {};
  let totalWeight = 0;
  let totalVotes = 0;
  const eligible = new Set(policy.eligibleVoterUids);
  const seen = new Set<string>();
  for (const ballot of ballots) {
    if (!eligible.has(ballot.voterUid) || seen.has(ballot.voterUid)) {
      throw new Error('Election ballots must be unique and belong to an eligible voter.');
    }
    seen.add(ballot.voterUid);
    const candidateUid = office === 'president' ? ballot.presidentUid : ballot.vicePresidentUid;
    if (candidateUid === undefined) {
      if (office === 'vicePresident') throw new Error('A configured Vice President ballot is required.');
      continue;
    }
    if (!eligible.has(candidateUid) || (office === 'vicePresident' && candidateUid === ballot.presidentUid)) {
      throw new Error('Election ballots must name eligible, distinct office candidates.');
    }
    const voterShipId = policy.voterShipIds[ballot.voterUid];
    if (!voterShipId) throw new Error('The voter has no server-derived ship mapping.');
    const population = shipPopulations[voterShipId];
    if (policy.populationWeighting === 'ship-population' &&
        (typeof population !== 'number' || !Number.isSafeInteger(population) || population < 1)) {
      throw new Error('A current positive ship population is required for this election policy.');
    }
    const weight = policy.populationWeighting === 'equal' ? 1 : Number(population);
    scores[candidateUid] = (scores[candidateUid] ?? 0) + weight;
    totalWeight += weight;
    totalVotes += 1;
  }
  const maximum = Math.max(0, ...Object.values(scores));
  if (totalVotes === 0) {
    return { totalVotes, totalWeight, scores: {}, tiedCandidates: [] };
  }
  const tiedCandidates = Object.keys(scores).filter((uid) => scores[uid] === maximum).sort();
  const hasMajority = policy.votingSystem === 'plurality' || maximum > totalWeight / 2;
  const winnerUid = hasMajority && tiedCandidates.length === 1 ? tiedCandidates[0] : undefined;
  return {
    totalVotes,
    totalWeight,
    scores: Object.fromEntries(Object.entries(scores).sort(([left], [right]) => left.localeCompare(right))),
    tiedCandidates: winnerUid ? [] : tiedCandidates,
    ...(winnerUid ? { winnerUid } : {}),
  };
}

/** Server-only arithmetic; return totals and candidates, never ballot identities. */
export function calculateElectionTally(input: Readonly<{
  policy: ElectionPolicy;
  ballots: readonly ElectionBallot[];
  shipPopulations: Readonly<Record<string, number>>;
}>): ElectionTally {
  return {
    president: tallyOffice(input.policy, input.ballots, input.shipPopulations, 'president'),
    ...(input.policy.vicePresidentEnabled
      ? { vicePresident: tallyOffice(input.policy, input.ballots, input.shipPopulations, 'vicePresident') }
      : {}),
  };
}

export function resolveElectionWinner(
  tally: ElectionOfficeTally,
  currentHolderUid: string | undefined,
  tieRule: ElectionTiePolicy,
  facilitatorChoice?: string,
): ElectionWinnerDecision {
  if (tally.winnerUid) return { status: 'winner', winnerUid: tally.winnerUid, source: 'vote' };
  if (tally.totalVotes === 0) return { status: 'no-winner' };
  if (tieRule === 'current-office-remains') {
    return currentHolderUid
      ? { status: 'winner', winnerUid: currentHolderUid, source: 'current-office-remains' }
      : { status: 'no-winner' };
  }
  if (facilitatorChoice && tally.tiedCandidates.includes(facilitatorChoice)) {
    return { status: 'winner', winnerUid: facilitatorChoice, source: 'facilitator-tie-choice' };
  }
  return { status: 'tie-pending', candidateUids: tally.tiedCandidates };
}

/**
 * Resolve the VP ballot independently. If its unique leader also wins President,
 * the next positive-scoring VP-ballot candidate is the distinct office choice.
 * Runner-up ties still use the election's preconfigured tie rule; no arbitrary
 * score ordering ever chooses between tied candidates.
 */
export function resolveVicePresidentElection(
  tally: ElectionOfficeTally,
  presidentWinnerUid: string | undefined,
  currentVicePresidentUid: string | undefined,
  tieRule: ElectionTiePolicy,
  facilitatorChoice?: string,
  eligibleCandidateUids: readonly string[] = Object.keys(tally.scores),
): ElectionVicePresidentDecision {
  const ordinary = resolveElectionWinner(tally, currentVicePresidentUid, tieRule, facilitatorChoice);
  if (!presidentWinnerUid || tally.winnerUid !== presidentWinnerUid) {
    return ordinary.status === 'tie-pending' ? { ...ordinary, source: 'vote' } : ordinary;
  }

  const eligible = new Set(eligibleCandidateUids);
  const runnersUp = Object.entries(tally.scores)
    .filter(([uid, score]) => uid !== presidentWinnerUid && score > 0 && eligible.has(uid));
  if (runnersUp.length === 0) return { status: 'vacancy-required' };
  const highestScore = Math.max(...runnersUp.map(([, score]) => score));
  const candidateUids = runnersUp.filter(([, score]) => score === highestScore)
    .map(([uid]) => uid).sort((left, right) => left.localeCompare(right));
  if (candidateUids.length === 1) {
    return { status: 'winner', winnerUid: candidateUids[0]!, source: 'vp-ballot-runner-up' };
  }

  if (tieRule === 'current-office-remains') {
    if (!currentVicePresidentUid) return { status: 'no-winner' };
    if (currentVicePresidentUid === presidentWinnerUid) {
      return { status: 'conflict-pending', candidateUids, reason: 'incumbent-would-hold-both-offices' };
    }
    if (!eligible.has(currentVicePresidentUid)) {
      return { status: 'conflict-pending', candidateUids, reason: 'incumbent-not-eligible-for-vp-runner-up' };
    }
    return { status: 'winner', winnerUid: currentVicePresidentUid, source: 'current-office-remains' };
  }
  if (facilitatorChoice && candidateUids.includes(facilitatorChoice)) {
    return { status: 'winner', winnerUid: facilitatorChoice, source: 'facilitator-tie-choice' };
  }
  return { status: 'tie-pending', candidateUids, source: 'vp-ballot-runner-up' };
}
