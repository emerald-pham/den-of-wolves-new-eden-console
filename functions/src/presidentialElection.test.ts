import { expect, it } from 'vitest';
import {
  calculateElectionTally,
  normalizeElectionPolicy,
  resolveElectionWinner,
  type ElectionPolicy,
} from './presidentialElection';

const input = {
  eligibleVoterUids: ['u1', 'u2', 'u3'],
  votingSystem: 'plurality',
  populationWeighting: 'ship-population',
  openCycle: 3,
  closeCycle: 4,
  vicePresidentEnabled: true,
  campaigning: 'structured',
  supplyUse: 'prohibited',
  campaignInstructions: 'Two short speeches; no fleet stores may be used.',
  tieRule: 'facilitator-choice',
} as const;

const voters = [
  { uid: 'u1', shipId: 'dione' },
  { uid: 'u2', shipId: 'icebreaker' },
  { uid: 'u3', shipId: 'shepherd' },
] as const;

it('normalizes explicit election policy without accepting client-computed voter weights', () => {
  expect(normalizeElectionPolicy(input, voters, 2)).toEqual({
    eligibleVoterUids: ['u1', 'u2', 'u3'],
    votingSystem: 'plurality',
    populationWeighting: 'ship-population',
    openCycle: 3,
    closeCycle: 4,
    vicePresidentEnabled: true,
    campaigning: 'structured',
    supplyUse: 'prohibited',
    campaignInstructions: 'Two short speeches; no fleet stores may be used.',
    tieRule: 'facilitator-choice',
    voterShipIds: { u1: 'dione', u2: 'icebreaker', u3: 'shepherd' },
  });
  expect(normalizeElectionPolicy({ ...input, voterWeights: { u1: 10_000_000 } }, voters, 2)).toBeNull();
});

it('rejects ineligible voters, duplicate ship representatives under population weighting, and invalid timing', () => {
  expect(normalizeElectionPolicy({ ...input, eligibleVoterUids: ['u1', 'missing'] }, voters, 2)).toBeNull();
  expect(normalizeElectionPolicy(input, [voters[0], { uid: 'u2', shipId: 'dione' }, voters[2]], 2)).toBeNull();
  expect(normalizeElectionPolicy({ ...input, closeCycle: 2 }, voters, 2)).toBeNull();
  expect(normalizeElectionPolicy({ ...input, supplyUse: 'facilitator-approved', campaignInstructions: '' }, voters, 2)).toBeNull();
});

it('counts private ballots once with server-derived population weights for both offices', () => {
  const policy = normalizeElectionPolicy(input, voters, 2) as ElectionPolicy;
  const tally = calculateElectionTally({
    policy,
    ballots: [
      { voterUid: 'u1', presidentUid: 'u2', vicePresidentUid: 'u3' },
      { voterUid: 'u2', presidentUid: 'u2', vicePresidentUid: 'u1' },
      { voterUid: 'u3', presidentUid: 'u3', vicePresidentUid: 'u3' },
    ],
    shipPopulations: { dione: 20_000, icebreaker: 50_000, shepherd: 30_000 },
  });
  expect(tally).toEqual({
    president: { totalVotes: 3, totalWeight: 100_000, scores: { u2: 70_000, u3: 30_000 }, tiedCandidates: [], winnerUid: 'u2' },
    vicePresident: { totalVotes: 3, totalWeight: 100_000, scores: { u1: 50_000, u3: 50_000 }, tiedCandidates: ['u1', 'u3'] },
  });
  expect(tally).not.toHaveProperty('ballots');
});

it('uses the recorded voting system and configured GM tie choice without exposing ballot identities', () => {
  const policy = normalizeElectionPolicy({ ...input, votingSystem: 'majority', populationWeighting: 'equal' }, voters, 2) as ElectionPolicy;
  const tally = calculateElectionTally({
    policy,
    ballots: [
      { voterUid: 'u1', presidentUid: 'u2', vicePresidentUid: 'u3' },
      { voterUid: 'u2', presidentUid: 'u3', vicePresidentUid: 'u1' },
      { voterUid: 'u3', presidentUid: 'u1', vicePresidentUid: 'u3' },
    ],
    shipPopulations: { dione: 20_000, icebreaker: 50_000, shepherd: 30_000 },
  });
  expect(tally.president).toMatchObject({ totalVotes: 3, totalWeight: 3, tiedCandidates: ['u1', 'u2', 'u3'] });
  expect(resolveElectionWinner(tally.president, 'u2', policy.tieRule)).toEqual({ status: 'winner', winnerUid: 'u2', source: 'current-office-remains' });
  expect(resolveElectionWinner(tally.president, 'u2', 'facilitator-choice')).toEqual({
    status: 'tie-pending', candidateUids: ['u1', 'u2', 'u3'],
  });
  expect(resolveElectionWinner(tally.president, undefined, policy.tieRule, 'u3')).toEqual({
    status: 'winner', winnerUid: 'u3', source: 'facilitator-tie-choice',
  });
  expect(resolveElectionWinner(tally.president, 'u1', 'current-office-remains')).toEqual({
    status: 'winner', winnerUid: 'u1', source: 'current-office-remains',
  });
});
