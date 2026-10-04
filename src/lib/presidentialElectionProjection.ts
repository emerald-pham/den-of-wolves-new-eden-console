import type {
  PresidentialElectionProjection,
  PresidentialElectionOfficeTallyProjection,
  PresidentialOfficesProjection,
} from '@/types/presidentialElection';

const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;

function candidateId(value: unknown, candidates: ReadonlySet<string>): value is string {
  return typeof value === 'string' && candidates.has(value);
}

function tallyOffice(value: unknown, candidates: ReadonlySet<string>): PresidentialElectionOfficeTallyProjection | undefined {
  const raw = object(value);
  if (!raw || Object.keys(raw).some(key => !['totalVotes','totalWeight','scores','tiedCandidateIds','winnerId'].includes(key)) ||
      !Number.isSafeInteger(raw.totalVotes) || Number(raw.totalVotes) < 0 || Number(raw.totalVotes) > 300 ||
      !Number.isSafeInteger(raw.totalWeight) || Number(raw.totalWeight) < 0 || !object(raw.scores) ||
      !Array.isArray(raw.tiedCandidateIds) || raw.tiedCandidateIds.some(id => !candidateId(id, candidates)) ||
      new Set(raw.tiedCandidateIds).size !== raw.tiedCandidateIds.length ||
      (raw.winnerId !== undefined && !candidateId(raw.winnerId, candidates))) return undefined;
  const scores: Record<string, number> = {};
  for (const [id, score] of Object.entries(object(raw.scores)!)) {
    if (!candidates.has(id) || !Number.isSafeInteger(score) || Number(score) < 0) return undefined;
    scores[id] = Number(score);
  }
  return {
    totalVotes: Number(raw.totalVotes), totalWeight: Number(raw.totalWeight), scores,
    tiedCandidateIds: [...raw.tiedCandidateIds as string[]],
    ...(raw.winnerId === undefined ? {} : { winnerId: raw.winnerId as string }),
  };
}

/** Parse only the member-safe election projection; secret voter mappings never fit this shape. */
export function parsePresidentialElectionProjection(value: unknown): PresidentialElectionProjection | undefined {
  const raw = object(value);
  if (!raw || raw.type !== 'presidential-election' || Object.keys(raw).some(key => ![
    'type','revision','state','policy','candidates','tally','presidentCandidateId','vicePresidentCandidateId',
    'pendingPresidentTie','pendingVicePresidentTie','vicePresidentOutcome','decidedCycle',
  ].includes(key)) || !Number.isSafeInteger(raw.revision) || Number(raw.revision) < 1 ||
      !['scheduled','open','tie-pending','resolved','no-winner'].includes(String(raw.state)) ||
      !Array.isArray(raw.candidates) || raw.candidates.length < 2 || raw.candidates.length > 300) return undefined;
  const candidates = raw.candidates.flatMap(value => {
    const candidate = object(value);
    return candidate && Object.keys(candidate).length === 2 && typeof candidate.id === 'string' &&
      /^candidate-[\w-]{1,128}$/.test(candidate.id) && typeof candidate.displayName === 'string' &&
      candidate.displayName.trim() && candidate.displayName.length <= 40
      ? [{ id: candidate.id, displayName: candidate.displayName.trim() }] : [];
  });
  const candidateIds = new Set(candidates.map(candidate => candidate.id));
  if (candidates.length !== raw.candidates.length || candidateIds.size !== candidates.length) return undefined;
  const policy = object(raw.policy);
  if (!policy || Object.keys(policy).length !== 9 || Object.keys(policy).some(key => ![
    'votingSystem','populationWeighting','openCycle','closeCycle','vicePresidentEnabled','campaigning','supplyUse',
    'campaignInstructions','tieRule',
  ].includes(key)) || !['plurality','majority'].includes(String(policy.votingSystem)) ||
      !['equal','ship-population'].includes(String(policy.populationWeighting)) ||
      !Number.isSafeInteger(policy.openCycle) || Number(policy.openCycle) < 1 ||
      !Number.isSafeInteger(policy.closeCycle) || Number(policy.closeCycle) < Number(policy.openCycle) ||
      typeof policy.vicePresidentEnabled !== 'boolean' || !['open','structured','prohibited'].includes(String(policy.campaigning)) ||
      !['prohibited','facilitator-approved'].includes(String(policy.supplyUse)) ||
      typeof policy.campaignInstructions !== 'string' || !policy.campaignInstructions.trim() || policy.campaignInstructions.length > 1200 ||
      !['current-office-remains','facilitator-choice'].includes(String(policy.tieRule))) return undefined;
  const idList = (value: unknown): readonly string[] | undefined => Array.isArray(value) && value.length <= 300 &&
    value.every(id => candidateId(id, candidateIds)) && new Set(value).size === value.length ? [...value] as string[] : undefined;
  let tally: PresidentialElectionProjection['tally'];
  if (raw.tally !== undefined) {
    const value = object(raw.tally), president = tallyOffice(value?.president, candidateIds);
    const vicePresident = value?.vicePresident === undefined ? undefined : tallyOffice(value.vicePresident, candidateIds);
    if (!value || Object.keys(value).some(key => key !== 'president' && key !== 'vicePresident') || !president ||
        (value.vicePresident !== undefined && !vicePresident) || Boolean(policy.vicePresidentEnabled) !== Boolean(value.vicePresident)) return undefined;
    tally = { president, ...(vicePresident ? { vicePresident } : {}) };
  }
  const pendingPresidentTie = raw.pendingPresidentTie === undefined ? undefined : idList(raw.pendingPresidentTie);
  const pendingVicePresidentTie = raw.pendingVicePresidentTie === undefined ? undefined : idList(raw.pendingVicePresidentTie);
  const sharedBallotLeader = Boolean(tally?.president.winnerId &&
    tally.president.winnerId === tally.vicePresident?.winnerId);
  const viceOutcome = raw.vicePresidentOutcome;
  const validViceOutcome = viceOutcome === undefined || (viceOutcome === 'runner-up' &&
    raw.state === 'resolved' && policy.vicePresidentEnabled === true &&
    typeof raw.presidentCandidateId === 'string' && typeof raw.vicePresidentCandidateId === 'string' &&
    raw.presidentCandidateId !== raw.vicePresidentCandidateId && sharedBallotLeader) || (viceOutcome === 'runner-up-pending' && raw.state === 'tie-pending' &&
    policy.vicePresidentEnabled === true && sharedBallotLeader &&
    pendingVicePresidentTie !== undefined && pendingVicePresidentTie.length >= 2 &&
    raw.vicePresidentCandidateId === undefined) || (viceOutcome === 'vacant' &&
    raw.state === 'resolved' && policy.vicePresidentEnabled === true &&
    typeof raw.presidentCandidateId === 'string' && raw.vicePresidentCandidateId === undefined && sharedBallotLeader);
  if ((raw.pendingPresidentTie !== undefined && !pendingPresidentTie) ||
      (raw.pendingVicePresidentTie !== undefined && !pendingVicePresidentTie) ||
      !validViceOutcome ||
      (raw.presidentCandidateId !== undefined && !candidateId(raw.presidentCandidateId, candidateIds)) ||
      (raw.vicePresidentCandidateId !== undefined && !candidateId(raw.vicePresidentCandidateId, candidateIds)) ||
      (raw.decidedCycle !== undefined && (!Number.isSafeInteger(raw.decidedCycle) || Number(raw.decidedCycle) < 1))) return undefined;
  return {
    type: 'presidential-election', revision: Number(raw.revision), state: raw.state as PresidentialElectionProjection['state'],
    policy: {
      votingSystem: policy.votingSystem as PresidentialElectionProjection['policy']['votingSystem'],
      populationWeighting: policy.populationWeighting as PresidentialElectionProjection['policy']['populationWeighting'],
      openCycle: Number(policy.openCycle), closeCycle: Number(policy.closeCycle),
      vicePresidentEnabled: policy.vicePresidentEnabled, campaigning: policy.campaigning as PresidentialElectionProjection['policy']['campaigning'],
      supplyUse: policy.supplyUse as PresidentialElectionProjection['policy']['supplyUse'],
      campaignInstructions: policy.campaignInstructions.trim(), tieRule: policy.tieRule as PresidentialElectionProjection['policy']['tieRule'],
    }, candidates, ...(tally ? { tally } : {}),
    ...(typeof raw.presidentCandidateId === 'string' ? { presidentCandidateId: raw.presidentCandidateId } : {}),
    ...(typeof raw.vicePresidentCandidateId === 'string' ? { vicePresidentCandidateId: raw.vicePresidentCandidateId } : {}),
    ...(pendingPresidentTie ? { pendingPresidentTie } : {}), ...(pendingVicePresidentTie ? { pendingVicePresidentTie } : {}),
    ...(typeof raw.vicePresidentOutcome === 'string' ? { vicePresidentOutcome: raw.vicePresidentOutcome as NonNullable<PresidentialElectionProjection['vicePresidentOutcome']> } : {}),
    ...(raw.decidedCycle === undefined ? {} : { decidedCycle: Number(raw.decidedCycle) }),
  };
}

export function parsePresidentialOfficesProjection(value: unknown): PresidentialOfficesProjection | undefined {
  const raw = object(value);
  if (!raw || Object.keys(raw).some(key => ![
    'electionId','revision','presidentCandidateId','presidentDisplayName','vicePresidentCandidateId','vicePresidentDisplayName','vicePresidentVacant','decidedCycle',
  ].includes(key)) || raw.electionId !== 'current' || !Number.isSafeInteger(raw.revision) || Number(raw.revision) < 1 ||
      typeof raw.presidentCandidateId !== 'string' || !/^candidate-[\w-]{1,128}$/.test(raw.presidentCandidateId) ||
      typeof raw.presidentDisplayName !== 'string' || !raw.presidentDisplayName.trim() || raw.presidentDisplayName.length > 40 ||
      (raw.vicePresidentCandidateId !== undefined && (typeof raw.vicePresidentCandidateId !== 'string' || !/^candidate-[\w-]{1,128}$/.test(raw.vicePresidentCandidateId))) ||
      (raw.vicePresidentDisplayName !== undefined && (typeof raw.vicePresidentDisplayName !== 'string' || !raw.vicePresidentDisplayName.trim() || raw.vicePresidentDisplayName.length > 40)) ||
      (raw.vicePresidentVacant !== undefined && raw.vicePresidentVacant !== true) ||
      (raw.vicePresidentVacant === true && (raw.vicePresidentCandidateId !== undefined || raw.vicePresidentDisplayName !== undefined)) ||
      Number.isSafeInteger(raw.decidedCycle) === false || Number(raw.decidedCycle) < 1) return undefined;
  return { electionId: 'current', revision: Number(raw.revision), presidentCandidateId: raw.presidentCandidateId,
    presidentDisplayName: raw.presidentDisplayName.trim(),
    ...(typeof raw.vicePresidentCandidateId === 'string' ? { vicePresidentCandidateId: raw.vicePresidentCandidateId,
      ...(typeof raw.vicePresidentDisplayName === 'string' ? { vicePresidentDisplayName: raw.vicePresidentDisplayName.trim() } : {}) } : {}),
    ...(raw.vicePresidentVacant === true ? { vicePresidentVacant: true } : {}),
    decidedCycle: Number(raw.decidedCycle) };
}
