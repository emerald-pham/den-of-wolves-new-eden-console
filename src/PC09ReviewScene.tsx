import {useState} from 'react';
import {FighterWingCard} from '@/components/AegisConsoleWorkspace';
import GorgoneionRepairDronesView from '@/components/GorgoneionRepairDronesView';
import {WolfAttackDradisView} from '@/components/WolfAttackDradis';
import {WolfAttackStatusView} from '@/components/WolfAttackStatusPanel';
import {WolfAttackGmAftermathView, type WolfAttackGmAftermathViewModel} from '@/components/WolfAttackGmAftermathView';
import {PressDispatchDesk} from '@/components/PressDispatchDesk';
import {PressEventLogView} from '@/components/PressEventLog';
import {WolfAgentDetectorPanel, VipHostPanel, PdfFighterAcePanel} from '@/components/Pc09SpecialistPresenters';
import ArrestPosseCalculator from '@/components/ArrestPosseCalculator';
import {PresidentWorkspaceView} from '@/components/PresidentWorkspace';
import {PresidentialElectionWorkspaceView} from '@/components/PresidentialElectionWorkspace';
import {TeamStartFormalAnnouncementsView} from '@/components/TeamStartFormalAnnouncementsView';
import {CrisisReportContent} from '@/components/CrisisReportPanel';
import {AEGIS_ROLE_CONSOLES} from '@/data/aegisConsoles';
import type {ArrestPosseCalculation, GameSession, MaintenanceCycle, PressDispatch, WolfAttackMemberView} from '@/types/game';
import type {PresidentialElectionProjection} from '@/types/presidentialElection';
import {APP_VERSION} from './version';
import './PC07ReviewScene.css';
import './PC09ReviewScene.css';

const STAMP = '2026-10-04T12:00:00.000Z';
const STEPS = [
  {label: '1 Battle aftermath', title: 'Read the completed attack and prepare recovery', copy: 'Compare the entitled DRADIS result with repairs and fighter construction. Published bearings stay exact; unavailable bearings stay unknown.'},
  {label: '2 Crew, GM and Press', title: 'Keep each audience clear', copy: 'The crew receives its result. The facilitator retains cards, casualties and outstanding work. Press decides whether to publish its approved report.'},
  {label: '3 Investigation and arrest', title: 'Use a private report and a real attendance decision', copy: 'Try the detector and arrest calculator. A prepared attendance choice demonstrates the deadline; it supplies no evidence of physical attendance.'},
  {label: '4 Specialist and President', title: 'Commit a benefit or a bounded office action', copy: 'Record a hosted visit, use its one maintenance reroll, inspect the Fighter Ace choice, and spend one political capital on a presidential visit.'},
  {label: '5 Elections and crises', title: 'Read procedure, cast a ballot and announce the outcome', copy: 'Election policy precedes secret ballots. Formal Team announcements remain distinct from Press publication and private facilitator judgment.'},
] as const;

const MEMBER_SAMPLE: WolfAttackMemberView = {
  type: 'wolf-attack-member-view', schemaVersion: 1, sessionId: 'prepared-pc09', attackId: 'prepared-attack-7',
  turn: 7, revision: 12, status: 'resolved', phase: 'active', currentStep: 'resolved', range: null,
  deadlineAt: STAMP, serverTime: STAMP, visibility: 'members',
  redaction: ['composition', 'unresolved-dice', 'facilitator-notes', 'intervention-state'],
  results: [
    {range: 'short', sourceId: 'aegis-alpha-wing', targetId: 'prepared-contact-1', bearing: null,
      contactReference: 'Wolf contact 1', effect: 'Fighter hit', outcome: {damage: 1, destroyed: true}, serverTime: STAMP},
    {range: 'boarding', sourceId: 'wolf-boarding', targetId: 'aegis', bearing: null,
      contactReference: 'AEGIS', effect: 'Defence committed', outcome: {damage: 3, survivingBoardingParties: 0}, serverTime: STAMP},
  ],
};
const GM_SAMPLE: WolfAttackGmAftermathViewModel = {
  attackId: 'prepared-attack-7', turn: 7,
  damage: [{shipId: 'aegis', amount: 3, populationBefore: 10000, populationAfter: 9500, destroyed: false,
    damagedSystemIds: ['missile-launchers'],
    draws: [{card: '4♥', systemName: 'Missile Launchers', recycled: false, casualty: true, destroyed: false}]}],
  doctor: {selectedShipIds: ['aegis'], mitigated: [{shipId: 'aegis', casualtiesBefore: 1000,
    casualtiesAfter: 500, casualtiesPrevented: 500, foodSpent: 0, waterSpent: 0}]},
  scrapClaims: {aegis: {shuttleId: 'macaw', scrap: 1}}, returningInstanceIds: [],
  survivingWolfShips: [{instanceId: 'prepared-wolf-2', shipId: 'wolf-destroyer', target: 'aegis'}],
  pendingWork: {doctorShipIds: [], salvageAvailable: true, scrapShipIds: [],
    damagedSystems: [{shipId: 'aegis', systemIds: ['missile-launchers']}], survivingThreatInstanceIds: ['prepared-wolf-2']},
};

function AftermathReview() {
  const [repaired, setRepaired] = useState(false);
  const [systemId, setSystemId] = useState('');
  const [built, setBuilt] = useState(false);
  const maintenance: MaintenanceCycle = {step: 8, revision: built ? 3 : 2, turn: 8, results: {},
    charges: built ? ['fighter-bay-alpha'] : ['fighter-bay-alpha', 'construction-bay'], refuelled: []};
  return <section className="pc07-review__workspace" aria-label="Prepared battle recovery">
    <WolfAttackDradisView view={MEMBER_SAMPLE} visibleTargetIds={['aegis']} />
    <div className="pc09-review__columns">
      <GorgoneionRepairDronesView hostName="AEGIS" hostDescription="AEGIS // current prepared host" materials={repaired ? 2 : 5}
        isCaptain hostIsActive maintenanceReady coordinationOpen usedThisCycle={repaired} hostDestroyed={false} repairHistoryValid
        eligibleSystems={repaired ? [] : [{id: 'missile-launchers', name: 'Missile Launchers'}]} systemId={systemId}
        selectedName="Missile Launchers" pending={false} submitDisabled={repaired || systemId !== 'missile-launchers'}
        submitLabel="Repair one console // 3 materials" onChooseSystem={setSystemId} onSubmit={() => setRepaired(true)}
        statusMessage={repaired ? 'LOCAL SIMULATION // Console repaired; 3 materials spent once.' : 'LOCAL SAMPLE // One damaged console and five host materials.'} />
      <FighterWingCard craft={AEGIS_ROLE_CONSOLES['wing-commander'].craft[1]!}
        authoritativeDamage={{destroyed: false, damagedSystemIds: []}} constructionBayUpgraded={false}
        fighterWingCount={{count: built ? 4 : 3, revision: built ? 3 : 2}} materials={built ? 4 : 5}
        canBuild={!built} buildPending={false} onBuild={() => setBuilt(true)} hasServerSnapshot maintenance={maintenance}
        snapshotLabel="LOCAL SAMPLE // next Team phase" fighterCapacity={{standard: 4, upgraded: 6}} />
    </div>
    <p className="pc07-review__result" role="status">LOCAL SIMULATION // {repaired ? 'Repair committed.' : 'Repair pending.'} {built ? 'One fighter built; the charge is consumed.' : 'One construction charge available.'}</p>
  </section>;
}

function AudienceReview() {
  const [text, setText] = useState('');
  const [dispatches, setDispatches] = useState<PressDispatch[]>([]);
  const [notice, setNotice] = useState('LOCAL SAMPLE // Approved population report; publication is your choice.');
  return <section className="pc07-review__workspace" aria-label="Prepared audience boundaries">
    <WolfAttackStatusView view={MEMBER_SAMPLE} />
    <div className="pc09-review__columns">
      <WolfAttackGmAftermathView view={GM_SAMPLE} />
      <PressDispatchDesk operatorShort="SNN" dispatches={dispatches} text={text} authorized connectionReady
        sending={false} dismissingId={null} notice={notice} status="LOCAL SAMPLE"
        eventLog={<PressEventLogView entries={[{id: 'prepared-survivors', sourceId: 'prepared-attack-7', cycle: 7, recordedAt: STAMP,
          type: 'survivor-change', cause: 'ship-damage', vesselId: 'aegis', fromPopulation: 10000, toPopulation: 9500}]} status="Prepared report" />}
        onTextChange={setText} onPublish={() => {if (!text.trim()) return;
          setDispatches(current => [...current, {id: `prepared-dispatch-${current.length + 1}`, text: text.trim()}]);
          setText(''); setNotice('LOCAL SIMULATION // Dispatch published to the prepared audience.');}}
        onDismiss={id => {setDispatches(current => current.filter(item => item.id !== id)); setNotice('LOCAL SIMULATION // Prepared dispatch dismissed.');}} />
    </div>
    <p className="pc07-review__result" role="status" aria-label="Prepared audience result">{notice}</p>
  </section>;
}

function InvestigationReview() {
  const [testsUsed, setTestsUsed] = useState(1);
  const [reported, setReported] = useState(false);
  const [calculation, setCalculation] = useState<ArrestPosseCalculation | null>(null);
  return <section className="pc07-review__workspace pc09-review__columns" aria-label="Prepared investigation and arrest">
    <WolfAgentDetectorPanel cycle={7} testsUsed={testsUsed} targets={[{uid: 'prepared-alex', label: 'Alex'}]}
      report={reported ? {targetLabel: 'Alex', reportedLoyalty: 'wolf', cycle: 7} : null}
      onTest={async () => {setTestsUsed(current => Math.min(3, current + 1)); setReported(true);}} />
    <div className="pc07-review__panel cic-frame">
      <ArrestPosseCalculator targetOptions={[{uid: 'prepared-alex', label: 'Alex'}]} censusRevision={2} expectedRevision={2}
        calculation={calculation} expectedCycle={7} presentPlayerOptions={[{uid: 'prepared-bo', label: 'Bo'}, {uid: 'prepared-cam', label: 'Cam'}]}
        onCalculate={async (targetUid, defenders, adjustment) => {
          const sample: ArrestPosseCalculation = {type: 'arrest-posse-calculation', sessionId: 'prepared-pc09', revision: 3,
            requestId: 'prepared-count', targetUid, defenders, ...(adjustment ? {adjustment} : {}),
            requiredPlayers: Math.max(1, 2 + defenders + (adjustment ?? 0)), censusRevision: 2};
          setCalculation(sample); return sample;
        }} onResolve={async (targetUid, presentPlayerUids) => ({status: 'committed', type: 'arrest-posse-outcome', sessionId: 'prepared-pc09',
          requestId: 'prepared-attendance', turn: 7, revision: 4, targetUid, requiredPlayers: calculation?.requiredPlayers ?? 2,
          presentPlayers: presentPlayerUids.length,
          outcome: presentPlayerUids.length >= (calculation?.requiredPlayers ?? 2) ? 'arrested' : 'not-arrested', deadlineCycle: 8})} />
      <p className="pc07-review__note">LOCAL SIMULATION // The count and attendance use prepared people. An arrested prisoner requires a recorded resolution by next Team, cycle 8.</p>
    </div>
  </section>;
}

function SpecialistReview() {
  const [visit, setVisit] = useState<'unattested' | 'attested'>('unattested');
  const [reroll, setReroll] = useState(false);
  const [visitShip, setVisitShip] = useState('aegis');
  const [capital, setCapital] = useState(3);
  const [unrest, setUnrest] = useState(2);
  const [entries, setEntries] = useState<NonNullable<GameSession['presidentWorkspace']>['entries']>([]);
  const session = {id: 'prepared-pc09', currentTurn: 7, activeVesselIds: ['aegis', 'dione'], shipUnrest: {aegis: unrest, dione: 0},
    turnState: {currentTurn: 7, phase: 'coordination'}, turnPhase: {turn: 7, airspace: {state: 'lifted'}},
    politicalCapital: {balance: capital, revision: 3, entries: []}, presidentWorkspace: {revision: 2, entries}} as unknown as GameSession;
  return <section className="pc07-review__workspace" aria-label="Prepared specialists and office">
    <div className="pc09-review__columns">
      <VipHostPanel cycle={7} visitStatus={visit} currentShipId="dione"
        destinations={[{id: 'aegis', label: 'AEGIS'}, {id: 'icebreaker', label: 'Icebreaker'}]}
        grant={visit === 'attested' ? {shipLabel: visitShip === 'aegis' ? 'AEGIS' : 'Icebreaker', cycle: 7, status: reroll ? 'consumed' : 'available'} : null}
        onAttestVisit={async shipId => {setVisitShip(shipId); setVisit('attested');}}
        onReroll={async () => setReroll(true)} />
      <PdfFighterAcePanel attackId="prepared-attack-7" range="medium" fighterSources={[{id: 'pdf-escort-fighter-wing', label: 'PDF Escort Wing', fighters: 3}]}
        targets={[{id: 'prepared-contact-2', label: 'Wolf contact 2'}]}
        onCommit={async () => ({outcome: 'LOCAL SIMULATION // Prepared Medium hit committed; no live roll.', damage: 1})} />
    </div>
    <PresidentWorkspaceView session={session} live onChangePoliticalCapital={async () => {}}
      onPresidentialVisit={async () => {if (capital < 1 || unrest < 1) return; setCapital(current => current - 1); setUnrest(current => current - 1);}}
      onRecordPresidentAction={async (kind, copy) => setEntries(current => [...current, {id: `prepared-president-${current.length}`, kind,
        text: copy, cycle: 7, recordedAt: STAMP}])} />
    <p className="pc07-review__result" role="status">LOCAL SIMULATION // {capital} political capital; AEGIS unrest {unrest}. Hosted reroll and presidential visit are separate benefits.</p>
  </section>;
}

const ELECTION_SAMPLE: PresidentialElectionProjection = {
  type: 'presidential-election', revision: 2, state: 'open',
  policy: {votingSystem: 'plurality', populationWeighting: 'equal', openCycle: 7, closeCycle: 7,
    vicePresidentEnabled: true, campaigning: 'open', supplyUse: 'prohibited', campaignInstructions: 'Prepared table uses speeches; supplies are not spent.', tieRule: 'facilitator-choice'},
  candidates: [{id: 'candidate-ada', displayName: 'Ada'}, {id: 'candidate-bo', displayName: 'Bo'}, {id: 'candidate-cam', displayName: 'Cam'}],
};
function ElectionReview() {
  const [projection, setProjection] = useState(ELECTION_SAMPLE);
  return <section className="pc07-review__workspace" aria-label="Prepared election and crisis">
    <div className="pc09-review__columns">
      <PresidentialElectionWorkspaceView projection={projection} live currentUserUid="prepared-voter" isFacilitator={false}
        currentCycle={7} ballotSubmitted={projection.state !== 'open'}
        onConfigurePolicy={async () => {}} onResolveElection={async () => {}}
        onCastBallot={async ({presidentCandidateId, vicePresidentCandidateId}) => setProjection(current => ({...current,
          revision: current.revision + 1, state: 'resolved', presidentCandidateId,
          ...(vicePresidentCandidateId ? {vicePresidentCandidateId} : {}), decidedCycle: 7,
          tally: {president: {totalVotes: 1, totalWeight: 1, scores: {[presidentCandidateId]: 1}, tiedCandidateIds: [], winnerId: presidentCandidateId},
            ...(vicePresidentCandidateId ? {vicePresident: {totalVotes: 1, totalWeight: 1, scores: {[vicePresidentCandidateId]: 1}, tiedCandidateIds: [], winnerId: vicePresidentCandidateId}} : {})}}))} />
      <CrisisReportContent report={{sessionId: 'prepared-pc09', crisisId: 'prepared-vessel', state: 'resolved', revision: 4,
        title: 'Approaching Vessel', crisisKind: 'approaching-vessel',
        body: 'PUBLIC PREPARED REPORT // The fleet answered the hail. The facilitator recorded the response and timing before resolution. Private truth and pressure reasoning stay in the facilitator receipt.'}} />
    </div>
    <TeamStartFormalAnnouncementsView announcements={[
      {id: 'prepared-resolution', kind: 'binding-resolution', title: 'Approaching Vessel resolution', details: 'The fleet follows its recorded response at next Team.', decidedCycle: 7},
      ...(projection.state === 'resolved' ? [{id: 'prepared-election', kind: 'presidential-election' as const, title: 'Fleet leadership',
        details: `President: ${projection.candidates.find(candidate => candidate.id === projection.presidentCandidateId)?.displayName}. Vice President: ${projection.candidates.find(candidate => candidate.id === projection.vicePresidentCandidateId)?.displayName}.`, decidedCycle: 7}] : []),
    ]} />
    <p className="pc07-review__result" role="status">LOCAL SIMULATION // This one-ballot sample demonstrates the presenter, not a real electorate or server tally.</p>
  </section>;
}

export default function PC09ReviewScene() {
  const [index, setIndex] = useState(0);
  const step = STEPS[index]!;
  return <div className="pc07-review pc09-review">
    <a className="pc07-review__skip" href="#pc09-review-content">Skip to review workspace</a>
    <header className="pc07-review__header"><div><p>New Eden Console // solo review // build {APP_VERSION}</p>
      <h1>PC09 // Battle aftermath, deduction and crises</h1></div>
      <a className="cic-text-button" href="/#/">Return to station and console chooser</a></header>
    <p className="pc07-review__boundary" role="note" aria-label="Prepared review boundary">Prepared review // No live session writes. Controls change local samples only. Your live session is preserved. Gameplay evidence is recorded separately.</p>
    <nav className="pc07-review__steps" aria-label="PC09 review steps">{STEPS.map((item, position) => <button key={item.label} className="cic-action-button"
      type="button" aria-pressed={index === position} onClick={() => setIndex(position)}>{item.label}</button>)}</nav>
    <main id="pc09-review-content" className="pc07-review__content" tabIndex={-1}>
      <section className="pc07-review__intro cic-frame"><p>Check {index + 1} of {STEPS.length}</p><h2>{step.title}</h2><p>{step.copy}</p></section>
      {index === 0 && <AftermathReview />}{index === 1 && <AudienceReview />}{index === 2 && <InvestigationReview />}
      {index === 3 && <SpecialistReview />}{index === 4 && <ElectionReview />}
      <div className="pc07-review__step-controls">
        <button className="cic-action-button" type="button" aria-label="Previous review step" disabled={index === 0}
          onClick={() => setIndex(current => Math.max(0, current - 1))}>Previous check</button>
        <p>{index + 1} / {STEPS.length} // local samples</p>
        <button className="cic-action-button" type="button" aria-label="Next review step" disabled={index === STEPS.length - 1}
          onClick={() => setIndex(current => Math.min(STEPS.length - 1, current + 1))}>Next check</button>
      </div>
    </main><footer className="pc07-review__footer">PC09 prepared solo review // gameplay evidence is recorded separately.</footer>
  </div>;
}
