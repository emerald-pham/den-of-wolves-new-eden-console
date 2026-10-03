import {useMemo, useState} from 'react';
import ShipPlot from '@/components/ShipPlot';
import {WolfRangeActionPanelView} from '@/components/WolfRangeActionPanel';
import {WolfBoardingDefencePanelView} from '@/components/WolfBoardingDefencePanel';
import {WolfAttackStatusView} from '@/components/WolfAttackStatusPanel';
import type {LocalDradisNavigation} from '@/components/localDradisContacts';
import type {WolfAttackMemberView, WolfBoardingDefenceChoiceView, WolfRangeActionChoiceView} from '@/types/game';
import {APP_VERSION} from './version';
import './PC07ReviewScene.css';
import './PC08ReviewScene.css';

const STEPS = [
  {label: '1 DRADIS and shuttles', title: 'See the current local fleet', prompt: 'Compare docked, travelling, parked and rejoined prepared contacts. Use Zoom and check that complete names remain readable.'},
  {label: '2 Weapons', title: 'Choose an available range action', prompt: 'Use the actual range controls with a prepared hit. Try a damaged action, a pass and a committed target. All results here are local simulations.'},
  {label: '3 Fleet fighters', title: 'Keep each wing and craft distinct', prompt: 'Compare independent fighter samples and losses. Review their current choice through the real range presenter.'},
  {label: '4 Boarding defence', title: 'Make the crew’s defence choice', prompt: 'Choose Security Teams through the actual crew control. Review the prepared support and ruling boundaries, then the local committed outcome.'},
  {label: '5 Results and recovery', title: 'Recover the same committed outcome', prompt: 'Compare the real result presenter before and after a prepared disconnect. The receipt stays visible and a retry does not invent another roll.'},
] as const;
const STAMP = '2026-10-03T12:00:00.000Z';
const DEADLINE = '2026-10-03T12:10:00.000Z';
const SAMPLE_RANGE: WolfRangeActionChoiceView = {
  type: 'wolf-range-action-choice-view', sessionId: 'prepared-pc08', turn: 2, revision: 4,
  currentStep: 'medium-range', range: 'medium-range', choiceStatus: 'pending', deadlineAt: DEADLINE,
  eligibleActions: [{actionId: 'missile-medium', sourceId: 'aegis-missile-launchers', range: 'medium-range'}],
  hitSlots: [], contacts: [{contactId: 'local-contact-1', targetShipId: 'aegis', available: true}],
};
const SAMPLE_BOARDING: WolfBoardingDefenceChoiceView = {
  type: 'wolf-boarding-defence-choice-view', sessionId: 'prepared-pc08', turn: 2, revision: 6,
  targetShipId: 'aegis', boardingParties: 4, availableSecurityTeams: 3,
  choiceStatus: 'pending', deadlineAt: DEADLINE,
};

function DradisReview() {
  const [sample, setSample] = useState<'docked' | 'travelling' | 'parked' | 'rejoined'>('docked');
  const [current, setCurrent] = useState(true);
  const sampledAt = useMemo(() => new Date().toISOString(), []);
  const projection: LocalDradisNavigation = {
    groupId: 'fleet-1', navigationRevision: 3, fleetPartitionRevision: sample === 'rejoined' ? 3 : 2, sampledAt,
    ships: ['aegis', 'icebreaker', ...(sample === 'rejoined' ? ['dione', 'shepherd'] : [])].map(shipId =>
      ({shipId, fleetGroupId: 'fleet-1', coordinate: '3145'})),
    transits: sample === 'travelling' ? [{shuttleId: 'starlight', fleetGroupId: 'fleet-1', sampledAt,
      currentPosition: {x: 0.08, y: 0.04, z: 0.02}, destinationShipId: 'icebreaker', arrivesAt: DEADLINE}] : [],
  };
  return <section className="pc07-review__workspace" aria-label="Prepared DRADIS and shuttle samples">
    <div className="pc07-review__controls">
      {(['docked', 'travelling', 'parked', 'rejoined'] as const).map(state => <button key={state} type="button"
        className="cic-action-button" aria-pressed={state === sample} onClick={() => setSample(state)}>{state} sample</button>)}
      <button type="button" className="cic-action-button" onClick={() => setCurrent(false)}>Cached connection sample</button>
      <button type="button" className="cic-action-button" onClick={() => setCurrent(true)}>Current server sample</button>
    </div>
    <p className="pc07-review__note">LOCAL SAMPLE // {sample === 'rejoined' ? 'A committed rejoin includes each local ship once.' : 'Only Fleet-1’s current co-located ships are shown.'}
      {' '}{sample === 'travelling' ? 'Starlight uses a prepared position sample.' : 'Docked and parked craft fold into their hosts.'}</p>
    <div className="pc07-review__plot gm-dradis">
      <ShipPlot hostile={false} aboard viewerId="aegis" requireLocalAuthority
        localNavigation={current ? projection : undefined} showGmEffects={false} layout="gm" />
    </div>
  </section>;
}

function WeaponsReview() {
  const [view, setView] = useState(SAMPLE_RANGE);
  const [message, setMessage] = useState('LOCAL SAMPLE // A prepared Medium Range hit; no dice are rolled in this tour.');
  return <section className="pc07-review__workspace pc07-review__choice-examples" aria-label="Prepared weapon choices">
    <div className="pc07-review__controls">
      <button type="button" className="cic-action-button" onClick={() => {setView(SAMPLE_RANGE); setMessage('LOCAL SAMPLE RESTORED // No shared state changed.');}}>Restore weapon sample</button>
      <button type="button" className="cic-action-button" onClick={() => {setView({...SAMPLE_RANGE, revision: 5, eligibleActions: []}); setMessage('DAMAGED SAMPLE // No charged, undamaged action is available.');}}>Damaged weapon sample</button>
    </div>
    <WolfRangeActionPanelView view={view} onUseActions={actions => {
      setView({...view, revision: view.revision + 1, choiceStatus: 'targets-required', hitSlots: actions.map(actionId => ({actionId, count: 1}))});
      setMessage('LOCAL SIMULATION // The prepared hit is locked; choosing its target will not roll again.');
    }} onPass={() => {setView({...view, choiceStatus: 'committed'}); setMessage('LOCAL SIMULATION // Pass committed; charge retained.');}}
      onAssignTargets={() => {setView({...view, choiceStatus: 'committed'}); setMessage('LOCAL SIMULATION // Target committed. The prepared receipt records one hit; no live damage or resources changed.');}} />
    <p className="pc07-review__result" role="status" aria-label="Prepared weapon result">{message}</p>
  </section>;
}

function FightersReview() {
  const [wing, setWing] = useState('Alpha');
  const [counts, setCounts] = useState<Record<string, number>>({Alpha: 4, Bravo: 4, 'PDF Escort Wing': 4, Maliades: 1});
  const [message, setMessage] = useState('LOCAL SAMPLE // Wings keep their own choices and fighter counts.');
  const [committed, setCommitted] = useState<Record<string, boolean>>({});
  const view: WolfRangeActionChoiceView = {...SAMPLE_RANGE, choiceStatus: committed[wing] ? 'committed' : 'pending',
    eligibleActions: [{actionId: `prepared-${wing}`, sourceId: `${wing.toLowerCase().replaceAll(' ', '-')}-combat`, range: 'medium-range'}]};
  return <section className="pc07-review__workspace pc07-review__choice-examples" aria-label="Prepared fleet fighter choices">
    <div className="pc07-review__controls">{Object.keys(counts).map(name => <button key={name} className="cic-action-button"
      type="button" aria-pressed={name === wing} onClick={() => setWing(name)}>{name} sample</button>)}
      <button className="cic-action-button" type="button" onClick={() => {
        setCounts(current => ({...current, [wing]: Math.max(0, current[wing]! - 1)}));
        setMessage(`LOCAL SIMULATION // One prepared ${wing} loss. Other wings retain their counts.`);
      }}>Show Short Range loss sample</button>
    </div>
    <div className="pc07-review__panel cic-frame"><h3>{wing} // prepared state</h3><dl className="pc08-review__readouts">
      {Object.entries(counts).map(([name, count]) => <div key={name}><dt>{name}</dt><dd>{count} {name === 'Maliades' ? 'craft' : 'fighters'} remain</dd></div>)}
    </dl></div>
    <WolfRangeActionPanelView key={wing} view={view} onUseActions={() => {setCommitted(current => ({...current, [wing]: true})); setMessage(`LOCAL SIMULATION // ${wing} choice committed in this prepared example.`);}}
      onPass={() => {setCommitted(current => ({...current, [wing]: true})); setMessage(`LOCAL SIMULATION // ${wing} passed this prepared range.`);}} onAssignTargets={() => {}} />
    <p className="pc07-review__result" role="status" aria-label="Prepared fighter result">{message}</p>
  </section>;
}

function BoardingReview() {
  const [view, setView] = useState(SAMPLE_BOARDING);
  const [message, setMessage] = useState('LOCAL SAMPLE // Current host, support and available teams are prepared; no live relocation or roll.');
  return <section className="pc07-review__workspace pc07-review__choice-examples" aria-label="Prepared boarding choices">
    <p className="pc07-review__note">Support uses its actual owner, current dock and fuel. Deterministic party counts, dice and damage resolve automatically after genuine choices.
      The Wolf Commander’s incomplete printed consequence remains an explicit privately audited facilitator ruling.</p>
    <WolfBoardingDefencePanelView view={view} onChoose={securityTeams => {
      setView({...view, revision: view.revision + 1, choiceStatus: 'committed', chosenSecurityTeams: securityTeams});
      setMessage(`LOCAL SIMULATION // ${securityTeams} Security Teams committed. The prepared choice is retained; this scene does not roll defence or draw damage.`);
    }} />
    <p className="pc07-review__result" role="status" aria-label="Prepared boarding result">{message}</p>
    <button className="cic-action-button" type="button" onClick={() => {setView(SAMPLE_BOARDING); setMessage('LOCAL SAMPLE RESTORED // No shared state changed.');}}>Restore defence sample</button>
  </section>;
}

function ResultsReview() {
  const [message, setMessage] = useState('LOCAL SAMPLE // Completed results and surviving-wing carryover are already committed in this prepared example.');
  const view: WolfAttackMemberView = {
    type: 'wolf-attack-member-view', schemaVersion: 1, sessionId: 'prepared-pc08', attackId: 'prepared-attack',
    turn: 2, revision: 9, status: 'resolved', phase: 'active', currentStep: 'resolved', range: null,
    deadlineAt: DEADLINE, serverTime: STAMP, visibility: 'members',
    redaction: ['composition', 'unresolved-dice', 'facilitator-notes', 'intervention-state'],
    results: [{range: 'short', sourceId: 'AEGIS', targetId: 'prepared-local-target', bearing: null,
      contactReference: 'LOCAL CONTACT 1', effect: 'range-result', outcome: {damage: 1, destroyed: true}, serverTime: STAMP},
    {range: 'boarding', sourceId: 'DEFENCE', targetId: 'aegis', bearing: null,
      contactReference: 'AEGIS', effect: 'boarding-result', outcome: {damage: 0, survivingBoardingParties: 0}, serverTime: STAMP}],
  };
  return <section className="pc07-review__workspace" aria-label="Prepared result recovery">
    <div className="pc07-review__controls">
      <button className="cic-action-button" type="button" onClick={() => setMessage('OFFLINE SAMPLE // Committed results and remaining time are preserved; fresh choices await current authority.')}>Offline sample</button>
      <button className="cic-action-button" type="button" onClick={() => setMessage('RECONNECTED SAMPLE // The same committed results return. No second cost, loss or roll is applied.')}>Reconnect sample</button>
    </div>
    <WolfAttackStatusView view={view} />
    <p className="pc07-review__result" role="status" aria-label="Prepared recovery result">{message}</p>
  </section>;
}

export default function PC08ReviewScene() {
  const [index, setIndex] = useState(0);
  const step = STEPS[index]!;
  return <div className="pc07-review pc08-review">
    <a className="pc07-review__skip" href="#pc08-review-content">Skip to review workspace</a>
    <header className="pc07-review__header"><div><p>New Eden Console // solo review // build {APP_VERSION}</p><h1>PC08 // Weapons, fighters and boarding</h1></div>
      <a className="cic-text-button" href="/#/">Return to station and console chooser</a></header>
    <p className="pc07-review__boundary" role="note" aria-label="Prepared review boundary">Prepared review // No live session writes. Controls change local samples only. Your live session is preserved. Gameplay evidence is recorded separately in the checkpoint report.</p>
    <nav className="pc07-review__steps" aria-label="PC08 review steps">{STEPS.map((item, position) => <button key={item.label} className="cic-action-button" type="button"
      aria-pressed={index === position} onClick={() => setIndex(position)}>{item.label}</button>)}</nav>
    <main id="pc08-review-content" className="pc07-review__content" tabIndex={-1}>
      <section className="pc07-review__intro cic-frame"><p>Check {index + 1} of {STEPS.length}</p><h2>{step.title}</h2><p>{step.prompt}</p></section>
      {index === 0 && <DradisReview />}{index === 1 && <WeaponsReview />}{index === 2 && <FightersReview />}{index === 3 && <BoardingReview />}{index === 4 && <ResultsReview />}
      <div className="pc07-review__step-controls">
        <button className="cic-action-button" type="button" aria-label="Previous review step" disabled={index === 0} onClick={() => setIndex(current => Math.max(0, current - 1))}>Previous check</button>
        <p>{index + 1} / {STEPS.length} // local samples</p>
        <button className="cic-action-button" type="button" aria-label="Next review step" disabled={index === STEPS.length - 1} onClick={() => setIndex(current => Math.min(STEPS.length - 1, current + 1))}>Next check</button>
      </div>
    </main><footer className="pc07-review__footer">PC08 prepared solo review // gameplay evidence is recorded separately.</footer>
  </div>;
}
