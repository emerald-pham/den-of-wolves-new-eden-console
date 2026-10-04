import { useEffect, useState, type FormEvent } from 'react';
import type {
  PresidentialElectionCampaignPolicy,
  PresidentialElectionPolicyInput,
  PresidentialElectionPopulationWeighting,
  PresidentialElectionProjection,
  PresidentialElectionSupplyPolicy,
  PresidentialElectionTiePolicy,
  PresidentialElectionVotingSystem,
} from '@/types/presidentialElection';
import { useSessionStore } from '@/store/useSessionStore';
import { castPresidentialBallot, configurePresidentialElection, resolvePresidentialElection } from '@/lib/presidentialElectionService';

export type { PresidentialElectionPolicyInput } from '@/types/presidentialElection';

export interface PresidentialElectionWorkspaceViewProps {
  readonly projection: PresidentialElectionProjection | null;
  readonly live: boolean;
  readonly currentUserUid: string | null;
  readonly isFacilitator: boolean;
  readonly currentCycle: number;
  readonly ballotSubmitted: boolean;
  /** Roster IDs are supplied only to the facilitator's policy editor. */
  readonly facilitatorVoters?: readonly { readonly uid: string; readonly displayName: string }[];
  readonly onConfigurePolicy: (policy: PresidentialElectionPolicyInput) => Promise<void>;
  readonly onCastBallot: (ballot: { readonly presidentCandidateId: string; readonly vicePresidentCandidateId?: string }) => Promise<void>;
  readonly onResolveElection: (decision?: { readonly presidentCandidateId?: string; readonly vicePresidentCandidateId?: string;
    readonly confirmVicePresidentVacancy?: boolean }) => Promise<void>;
}

const VOTING_SYSTEMS: readonly PresidentialElectionVotingSystem[] = ['plurality', 'majority'];
const WEIGHTING: readonly PresidentialElectionPopulationWeighting[] = ['equal', 'ship-population'];
const CAMPAIGNING: readonly PresidentialElectionCampaignPolicy[] = ['open', 'structured', 'prohibited'];
const SUPPLY: readonly PresidentialElectionSupplyPolicy[] = ['prohibited', 'facilitator-approved'];
const TIES: readonly PresidentialElectionTiePolicy[] = ['current-office-remains', 'facilitator-choice'];

function label(value: string): string {
  return value.replaceAll('-', ' ').replace(/\b\w/g, character => character.toUpperCase());
}

function vicePresidentVacancyExplanation(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const details = (error as { readonly details?: unknown }).details;
  if (!details || typeof details !== 'object' || Array.isArray(details)) return undefined;
  const value = details as Record<string, unknown>;
  return value.resolutionRequired === 'vice-president-vacancy' && typeof value.explanation === 'string'
    ? value.explanation : undefined;
}

/** Actual policy, secret-ballot and outcome content with injected local/live actions. */
export function PresidentialElectionWorkspaceView({
  projection, live, currentUserUid, isFacilitator, currentCycle, ballotSubmitted, facilitatorVoters = [],
  onConfigurePolicy, onCastBallot, onResolveElection,
}: PresidentialElectionWorkspaceViewProps) {
  const [eligibleVoterUids, setEligibleVoterUids] = useState<string[]>([]);
  const [openCycle, setOpenCycle] = useState(1);
  const [closeCycle, setCloseCycle] = useState(1);
  const [votingSystem, setVotingSystem] = useState<PresidentialElectionVotingSystem>('plurality');
  const [populationWeighting, setPopulationWeighting] = useState<PresidentialElectionPopulationWeighting>('equal');
  const [vicePresidentEnabled, setVicePresidentEnabled] = useState(false);
  const [campaigning, setCampaigning] = useState<PresidentialElectionCampaignPolicy>('prohibited');
  const [supplyUse, setSupplyUse] = useState<PresidentialElectionSupplyPolicy>('prohibited');
  const [campaignInstructions, setCampaignInstructions] = useState('No fleet supplies may be used.');
  const [tieRule, setTieRule] = useState<PresidentialElectionTiePolicy>('current-office-remains');
  const [presidentChoice, setPresidentChoice] = useState('');
  const [vicePresidentChoice, setVicePresidentChoice] = useState('');
  const [ballotPresident, setBallotPresident] = useState('');
  const [ballotVicePresident, setBallotVicePresident] = useState('');
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState('');
  const [vacancyExplanation, setVacancyExplanation] = useState('');
  const [locallySubmitted, setLocallySubmitted] = useState(false);

  useEffect(() => { setVacancyExplanation(''); }, [projection?.revision, projection?.state]);

  const candidates = projection?.candidates ?? [];
  const eligibleCandidates = candidates.filter(candidate => candidate.id !== ballotPresident);
  const ballotWindowOpen = Boolean(projection && currentCycle >= projection.policy.openCycle &&
    currentCycle <= projection.policy.closeCycle && (projection.state === 'open' || projection.state === 'scheduled'));
  const canCast = live && ballotWindowOpen && Boolean(currentUserUid) && !ballotSubmitted && !locallySubmitted &&
    Boolean(ballotPresident) && (!projection?.policy.vicePresidentEnabled || Boolean(ballotVicePresident));

  async function configure(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!live || !isFacilitator || pending || eligibleVoterUids.length < 2 ||
        (vicePresidentEnabled && eligibleVoterUids.length < 3)) return;
    setPending(true); setStatus('');
    try {
      await onConfigurePolicy({
        eligibleVoterUids, votingSystem, populationWeighting, openCycle, closeCycle,
        vicePresidentEnabled, campaigning, supplyUse, campaignInstructions, tieRule,
      });
      setStatus('Election procedure fixed before ballots open.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Election procedure was not saved.');
    } finally { setPending(false); }
  }

  async function cast(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!canCast || pending) return;
    setPending(true); setStatus('');
    try {
      await onCastBallot({ presidentCandidateId: ballotPresident,
        ...(projection?.policy.vicePresidentEnabled ? { vicePresidentCandidateId: ballotVicePresident } : {}) });
      setBallotPresident(''); setBallotVicePresident(''); setLocallySubmitted(true); setStatus('Secret ballot accepted once.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Ballot was not accepted.');
    } finally { setPending(false); }
  }

  async function resolve(confirmVicePresidentVacancy = false): Promise<void> {
    if (!live || !isFacilitator || pending || !projection ||
        !['tie-pending','scheduled','open'].includes(projection.state)) return;
    setPending(true); setStatus('');
    try {
      await onResolveElection({
        ...(presidentChoice ? { presidentCandidateId: presidentChoice } : {}),
        ...(vicePresidentChoice ? { vicePresidentCandidateId: vicePresidentChoice } : {}),
        ...(confirmVicePresidentVacancy ? { confirmVicePresidentVacancy: true } : {}),
      });
      setVacancyExplanation('');
      setStatus('Recorded election outcome committed.');
    } catch (error) {
      const explanation = vicePresidentVacancyExplanation(error);
      if (explanation) setVacancyExplanation(explanation);
      setStatus(error instanceof Error ? error.message : 'Election outcome was not committed.');
    } finally { setPending(false); }
  }

  return <section className="presidential-election-workspace console-workspace__section" aria-label="Presidential election">
    <header>
      <p>Dione executive channel // Secret ballot</p>
      <h3>Presidential election</h3>
      <p>Facilitator policy is fixed before voting. Ballots are private, submitted once, and tallied by the server.</p>
    </header>
    {projection ? <>
      <section aria-label="Election procedure">
        <h4>{label(projection.state)}</h4>
        <dl>
          <div><dt>Voting system</dt><dd>{label(projection.policy.votingSystem)}</dd></div>
          <div><dt>Population weighting</dt><dd>{label(projection.policy.populationWeighting)}</dd></div>
          <div><dt>Voting cycles</dt><dd>{projection.policy.openCycle}–{projection.policy.closeCycle}</dd></div>
          <div><dt>Vice President</dt><dd>{projection.policy.vicePresidentEnabled ? 'Included' : 'Not included'}</dd></div>
          <div><dt>Campaigning</dt><dd>{label(projection.policy.campaigning)}</dd></div>
          <div><dt>Supply use</dt><dd>{label(projection.policy.supplyUse)}</dd></div>
          <div><dt>Tie rule</dt><dd>{label(projection.policy.tieRule)}</dd></div>
        </dl>
        <p>{projection.policy.campaignInstructions}</p>
      </section>
      <section aria-label="Election candidates">
        <h4>Candidates</h4>
        <ul>{candidates.map(candidate => <li key={candidate.id}>{candidate.displayName}</li>)}</ul>
      </section>
      {ballotWindowOpen && <form aria-label="Secret election ballot" onSubmit={event => void cast(event)}>
        <label htmlFor="presidential-ballot-president">President</label>
        <select id="presidential-ballot-president" value={ballotPresident} disabled={!live || pending}
          onChange={event => setBallotPresident(event.target.value)}>
          <option value="">Choose a candidate</option>
          {candidates.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.displayName}</option>)}
        </select>
        {projection.policy.vicePresidentEnabled && <>
          <label htmlFor="presidential-ballot-vice">Vice President</label>
          <select id="presidential-ballot-vice" value={ballotVicePresident} disabled={!live || pending}
            onChange={event => setBallotVicePresident(event.target.value)}>
            <option value="">Choose a different candidate</option>
            {eligibleCandidates.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.displayName}</option>)}
          </select>
        </>}
        <button type="submit" disabled={!canCast || pending}>{pending ? 'Submitting…' : 'Submit secret ballot'}</button>
      </form>}
      {ballotSubmitted && <p role="status">Your secret ballot is recorded. It cannot be changed.</p>}
      {!ballotSubmitted && locallySubmitted && <p role="status">Your secret ballot is recorded. It cannot be changed.</p>}
      {!ballotWindowOpen && ['scheduled','open'].includes(projection.state) &&
        <p role="status">Ballots open during cycles {projection.policy.openCycle}–{projection.policy.closeCycle}.</p>}
      {projection.tally && <section aria-label="Auditable election tally">
        <h4>Committed aggregate tally</h4>
        {projection.vicePresidentOutcome === 'runner-up-pending' && <p role="status">
          The President led both ballots. The next eligible distinct candidate on the independent Vice President ballot is tied; the configured tie rule must resolve that office before assignment.
        </p>}
        {([
          ['President', projection.tally.president],
          ...(projection.tally.vicePresident ? [['Vice President', projection.tally.vicePresident] as const] : []),
        ] as const)
          .map(([office, tally]) => <article key={office}>
            <h5>{office}</h5><p>{tally.totalVotes} ballots // weight {tally.totalWeight}</p>
            <ul>{Object.entries(tally.scores).map(([candidateId, score]) => <li key={candidateId}>
              {candidates.find(candidate => candidate.id === candidateId)?.displayName ?? 'Candidate'} // {score}
            </li>)}</ul>
            {tally.winnerId && <p>Selected: {candidates.find(candidate => candidate.id === tally.winnerId)?.displayName ?? 'Candidate'}</p>}
          </article>)}
        {projection.state === 'tie-pending' && isFacilitator && <div aria-label="Facilitator tie decisions">
          {projection.pendingPresidentTie && <label>President tie choice
            <select value={presidentChoice} onChange={event => setPresidentChoice(event.target.value)}>
              <option value="">Choose from tied candidates</option>
              {projection.pendingPresidentTie.map(id => <option key={id} value={id}>{candidates.find(candidate => candidate.id === id)?.displayName ?? 'Candidate'}</option>)}
            </select>
          </label>}
          {projection.pendingVicePresidentTie && <label>Vice President tie choice
            <select value={vicePresidentChoice} onChange={event => setVicePresidentChoice(event.target.value)}>
              <option value="">Choose from tied candidates</option>
              {projection.pendingVicePresidentTie.map(id => <option key={id} value={id}>{candidates.find(candidate => candidate.id === id)?.displayName ?? 'Candidate'}</option>)}
            </select>
          </label>}
          <button type="button" disabled={!live || pending || Boolean(projection.pendingPresidentTie && !presidentChoice) ||
            Boolean(projection.pendingVicePresidentTie && !vicePresidentChoice)} onClick={() => void resolve()}>
            {pending ? 'Committing…' : 'Commit tie decision'}
          </button>
        </div>}
      </section>}
      {['scheduled','open'].includes(projection.state) && isFacilitator && currentCycle >= projection.policy.closeCycle &&
        <button type="button" disabled={!live || pending} onClick={() => void resolve()}>
          {pending ? 'Calculating…' : 'Calculate and resolve election'}
        </button>}
      {vacancyExplanation && isFacilitator && projection.policy.vicePresidentEnabled &&
        ['scheduled','open','tie-pending'].includes(projection.state) && <section aria-label="Vice President vacancy decision">
        <p role="alert">{vacancyExplanation}</p>
        <p>No office assignment was written. Record a vacant Vice President office only if that is the current facilitator’s decision.</p>
        <button type="button" disabled={!live || pending} onClick={() => void resolve(true)}>
          {pending ? 'Recording…' : 'Confirm Vice President office vacant'}
        </button>
      </section>}
      {projection.state === 'resolved' && <p role="status">
        President: {candidates.find(candidate => candidate.id === projection.presidentCandidateId)?.displayName ?? 'Selected'}
        {projection.policy.vicePresidentEnabled && (projection.vicePresidentOutcome === 'vacant'
          ? ' // Vice President office recorded vacant by explicit facilitator decision'
          : ` // Vice President: ${candidates.find(candidate => candidate.id === projection.vicePresidentCandidateId)?.displayName ?? 'No winner'}`)}
      </p>}
      {projection.vicePresidentOutcome === 'runner-up' && <p role="status">
        The President led both office ballots. The Vice President is the next eligible distinct candidate on the independent Vice President ballot.
      </p>}
    </> : <>
      {isFacilitator ? <form aria-label="Configure election procedure" onSubmit={event => void configure(event)}>
        <fieldset><legend>Eligible voters</legend>
          {facilitatorVoters.map(voter => <label key={voter.uid}>
            <input type="checkbox" checked={eligibleVoterUids.includes(voter.uid)} disabled={!live || pending}
              onChange={event => setEligibleVoterUids(current => event.target.checked
                ? [...current, voter.uid] : current.filter(uid => uid !== voter.uid))} />
            {voter.displayName}
          </label>)}
          <p>{eligibleVoterUids.length} selected. Ship-population weighting requires one eligible voter per ship.</p>
        </fieldset>
        <label>Voting system<select value={votingSystem} onChange={event => setVotingSystem(event.target.value as PresidentialElectionVotingSystem)}>{VOTING_SYSTEMS.map(value => <option key={value} value={value}>{label(value)}</option>)}</select></label>
        <label>Population weighting<select value={populationWeighting} onChange={event => setPopulationWeighting(event.target.value as PresidentialElectionPopulationWeighting)}>{WEIGHTING.map(value => <option key={value} value={value}>{label(value)}</option>)}</select></label>
        <label>Open cycle<input type="number" min={1} value={openCycle} onChange={event => setOpenCycle(Number(event.target.value))} /></label>
        <label>Close cycle<input type="number" min={openCycle} value={closeCycle} onChange={event => setCloseCycle(Number(event.target.value))} /></label>
        <label><input type="checkbox" checked={vicePresidentEnabled} onChange={event => setVicePresidentEnabled(event.target.checked)} /> Elect a Vice President</label>
        <label>Campaigning<select value={campaigning} onChange={event => setCampaigning(event.target.value as PresidentialElectionCampaignPolicy)}>{CAMPAIGNING.map(value => <option key={value} value={value}>{label(value)}</option>)}</select></label>
        <label>Supply use<select value={supplyUse} onChange={event => setSupplyUse(event.target.value as PresidentialElectionSupplyPolicy)}>{SUPPLY.map(value => <option key={value} value={value}>{label(value)}</option>)}</select></label>
        <label>Campaign instructions<textarea maxLength={1200} value={campaignInstructions} onChange={event => setCampaignInstructions(event.target.value)} /></label>
        <label>Tie rule<select value={tieRule} onChange={event => setTieRule(event.target.value as PresidentialElectionTiePolicy)}>{TIES.map(value => <option key={value} value={value}>{label(value)}</option>)}</select></label>
        <button type="submit" disabled={!live || pending || eligibleVoterUids.length < 2 ||
          (vicePresidentEnabled && eligibleVoterUids.length < 3) || closeCycle < openCycle || !campaignInstructions.trim()}>
          {pending ? 'Saving…' : 'Fix procedure before ballots'}
        </button>
      </form> : <p role="status">The facilitator has not published an election procedure.</p>}
    </>}
    {!live && <p role="status">Election actions require a fresh live session.</p>}
    <p role="status" aria-live="polite">{status}</p>
  </section>;
}

export default function PresidentialElectionWorkspace() {
  const session = useSessionStore(state => state.session);
  const me = useSessionStore(state => state.me);
  const connection = useSessionStore(state => state.connection);
  const freshness = useSessionStore(state => state.sessionSnapshotFreshness);
  const live = connection === 'live' && freshness === 'server';
  return <PresidentialElectionWorkspaceView projection={session?.presidentialElection ?? null} live={live}
    currentUserUid={me?.uid ?? null} isFacilitator={false} currentCycle={session?.currentTurn ?? 1}
    ballotSubmitted={session?.currentMemberBallotSubmitted === true} facilitatorVoters={[]}
    onConfigurePolicy={configurePresidentialElection} onCastBallot={castPresidentialBallot}
    onResolveElection={resolvePresidentialElection} />;
}
