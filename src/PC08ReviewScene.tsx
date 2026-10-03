import {useMemo, useState} from 'react';
import ShipPlot from '@/components/ShipPlot';
import {WolfRangeActionPanelView} from '@/components/WolfRangeActionPanel';
import {AegisFighterWingLaunchPanelView, type AegisFighterWingLaunchViews} from '@/components/AegisFighterWingLaunchPanel';
import {PdfEscortWingLaunchPanelView} from '@/components/PdfEscortWingReference';
import {DioneMaliadesLaunchPanelView} from '@/components/DioneMaliadesLaunch';
import {DioneMaliadesRangeActionPanelView} from '@/components/DioneMaliadesRangeActions';
import {WolfFighterRangeActionPanelView, type WolfFighterRangeActionView} from '@/components/WolfFighterRangeActionPanel';
import {WolfBoardingDefencePanelView} from '@/components/WolfBoardingDefencePanel';
import {WolfBoardingSupportChoicePanelView, WolfBoardingCommanderChoicePanelView, WolfBoardingMilitiaChoicePanelView,
  WolfBoardingRerollChoicePanelView, WolfBoardingCommanderRulingPanelView} from '@/components/WolfBoardingChoicePanels';
import {WolfAttackStatusView} from '@/components/WolfAttackStatusPanel';
import type {LocalDradisNavigation} from '@/components/localDradisContacts';
import type {WolfAttackMemberView, WolfAttackTargetId, WolfBoardingDefenceChoiceView, WolfRangeActionChoiceView} from '@/types/game';
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
    ships: ['aegis', 'icebreaker', 'refinery-124', ...(sample === 'rejoined' ? ['dione', 'shepherd'] : [])].map(shipId =>
      ({shipId, fleetGroupId: 'fleet-1', coordinate: '3145'})),
    dockedShuttles: [
      ...(sample === 'travelling' ? [] : [{shuttleId: 'starlight', fleetGroupId: 'fleet-1', hostShipId: sample === 'docked' ? 'aegis' : 'icebreaker'}]),
      {shuttleId: 'pallas', fleetGroupId: 'fleet-1', hostShipId: 'aegis'},
      {shuttleId: 'boa', fleetGroupId: 'fleet-1', hostShipId: 'icebreaker'},
      {shuttleId: 'chepu', fleetGroupId: 'fleet-1', hostShipId: 'refinery-124'},
      ...(sample === 'rejoined' ? [{shuttleId: 'maliades', fleetGroupId: 'fleet-1', hostShipId: 'dione'}] : []),
    ],
    dockedFighterWings: [
      {wingId: 'fighter-wing-alpha', fleetGroupId: 'fleet-1', hostShipId: 'aegis'},
      {wingId: 'fighter-wing-bravo', fleetGroupId: 'fleet-1', hostShipId: 'aegis'},
      {wingId: 'pdf-escort-fighter-wing', fleetGroupId: 'fleet-1', hostShipId: 'refinery-124'},
    ],
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
  const [launches, setLaunches] = useState<Record<string, 'launched' | 'passed'>>({});
  const [range, setRange] = useState<'medium-range' | 'short-range'>('medium-range');
  const [maliadesDamage, setMaliadesDamage] = useState(0);
  const [message, setMessage] = useState('LOCAL SAMPLE // Wings keep their own choices and fighter counts.');
  const [committed, setCommitted] = useState<Record<string, boolean>>({});
  const wingId = wing === 'Alpha' ? 'fighter-wing-alpha' : wing === 'Bravo' ? 'fighter-wing-bravo' : wing === 'Maliades' ? 'maliades' : 'pdf-escort-fighter-wing';
  function commitLaunch(id: string, label: string, status: 'launched' | 'passed') {
    setLaunches(current => ({...current, [id]: status}));
    setMessage(`LOCAL SIMULATION // ${label} ${status === 'launched' ? 'launched independently' : 'passed launch for this attack'}.`);
  }
  const launchViews: AegisFighterWingLaunchViews = Object.fromEntries((['fighter-wing-alpha', 'fighter-wing-bravo'] as const).map(id => [id, {
    type: 'aegis-fighter-wing-launch-view', sessionId: 'prepared-pc08', attackId: 'prepared-attack', turn: 2, revision: 4,
    wingId: id, wingRevision: 1, fighters: counts[id === 'fighter-wing-alpha' ? 'Alpha' : 'Bravo'], launched: launches[id] === 'launched',
    eligible: !launches[id], ...(launches[id] ? {choiceStatus: launches[id], reason: launches[id] === 'launched' ? 'already-launched' : 'passed'} : {}),
  }]));
  const view: WolfFighterRangeActionView = {type: 'wolf-fighter-range-action-view', sessionId: 'prepared-pc08', attackId: 'prepared-attack',
    turn: 2, revision: 4, wingId, wingLabel: wing === 'PDF Escort Wing' ? wing : `Fighter Wing ${wing}`, range,
    choiceStatus: committed[`${wing}:${range}`] ? 'committed' : 'pending', launched: launches[wingId] === 'launched',
    fighters: Array.from({length: counts[wing] ?? 0}, (_, fighterIndex) => ({fighterIndex})),
    targets: [{instanceId: 'local-wolf-1', label: 'Local contact 1', targetNumber: 6}, {instanceId: 'local-wolf-2', label: 'Local contact 2', targetNumber: 1}]};
  return <section className="pc07-review__workspace pc07-review__choice-examples" aria-label="Prepared fleet fighter choices">
    <div className="pc07-review__controls">{Object.keys(counts).map(name => <button key={name} className="cic-action-button"
      type="button" aria-pressed={name === wing} onClick={() => setWing(name)}>{name} sample</button>)}
      <button className="cic-action-button" type="button" disabled={range !== 'short-range' || !view.launched || (counts[wing] ?? 0) === 0} onClick={() => {
        if (wing === 'Maliades') {
          const damage = Math.min(3, maliadesDamage + 1); setMaliadesDamage(damage);
          setCounts(current => ({...current, Maliades: damage === 3 ? 0 : 1}));
          setMessage(`LOCAL SIMULATION // Maliades has ${damage}/3 damage. Other wings retain their counts.`);
        } else {
          setCounts(current => ({...current, [wing]: Math.max(0, current[wing]! - 1)}));
          setMessage(`LOCAL SIMULATION // One prepared ${wing} loss. Other wings retain their counts.`);
        }
      }}>Show Short Range loss sample</button>
      <button className="cic-action-button" type="button" onClick={() => setRange('medium-range')}>Medium Range sample</button>
      <button className="cic-action-button" type="button" onClick={() => setRange('short-range')}>Short Range sample</button>
    </div>
    <div className="pc07-review__panel cic-frame"><h3>{wing} // prepared state</h3><dl className="pc08-review__readouts">
      {Object.entries(counts).map(([name, count]) => <div key={name}><dt>{name}</dt><dd>{count} {name === 'Maliades' ? 'craft' : 'fighters'} remain</dd></div>)}
    </dl></div>
    <AegisFighterWingLaunchPanelView views={launchViews}
      onLaunch={id => commitLaunch(id, id === 'fighter-wing-alpha' ? 'Alpha' : 'Bravo', 'launched')}
      onPass={id => commitLaunch(id, id === 'fighter-wing-alpha' ? 'Alpha' : 'Bravo', 'passed')} />
    {wing === 'PDF Escort Wing' && <PdfEscortWingLaunchPanelView canRead view={{type: 'pdf-escort-wing-launch-view',
      sessionId: 'prepared-pc08', turn: 2, revision: 4, wingRevision: 1,
      launched: launches[wingId] === 'launched', eligible: !launches[wingId] && counts[wing]! > 0,
      ...(launches[wingId] ? {choiceStatus: launches[wingId]} : {})}}
      onLaunch={() => commitLaunch(wingId, wing, 'launched')} onPass={() => commitLaunch(wingId, wing, 'passed')} />}
    {wing === 'Maliades' && <DioneMaliadesLaunchPanelView writable view={{type: 'dione-maliades-launch-view',
      sessionId: 'prepared-pc08', turn: 2, revision: 4, launched: launches[wingId] === 'launched',
      eligible: !launches[wingId] && maliadesDamage < 3, ...(launches[wingId] ? {choiceStatus: launches[wingId]} : {})}}
      onLaunch={() => commitLaunch(wingId, wing, 'launched')} onPass={() => commitLaunch(wingId, wing, 'passed')} />}
    {wing === 'Maliades' ? <>
      <section className="pc07-review__panel cic-frame" aria-label="Prepared Maliades condition">
        <h3>Maliades condition</h3><p>{maliadesDamage}/3 damage. {maliadesDamage === 3 ? 'Destroyed.' : 'One craft; fighter losses do not remove it.'}</p>
        <p>Repair is a separate fuelled Team-phase action: one host material per damage.</p>
      </section>
      <DioneMaliadesRangeActionPanelView writable view={{type: 'dione-maliades-range-action-view',
        sessionId: 'prepared-pc08', attackId: 'prepared-attack', turn: 2, revision: 4, range,
        choiceStatus: committed[`${wing}:${range}`] ? 'committed' : 'pending',
        damage: maliadesDamage, destroyed: maliadesDamage === 3, launched: launches[wingId] === 'launched', targets: view.targets}}
        onResolveMedium={choices => {
          setCommitted(current => ({...current, [`${wing}:${range}`]: true}));
          const summary = choices.map(choice => {
            const target = view.targets.find(target => target.instanceId === choice.targetInstanceId)?.label ?? choice.targetInstanceId;
            return choice.kind === 'target-shift' ? `target shift ${choice.shift === 1 ? '+1' : '−1'} on ${target}` : `attack on ${target}`;
          }).join('; ');
          setMessage(summary ? `LOCAL SIMULATION // Maliades Medium choice committed: ${summary}.` : 'LOCAL SIMULATION // Maliades passed Medium Range.');
        }} onResolveShort={targetIds => {
          setCommitted(current => ({...current, [`${wing}:${range}`]: true}));
          setMessage(targetIds.length ? `LOCAL SIMULATION // Maliades Short Range choice committed: ${targetIds.map(id => view.targets.find(target => target.instanceId === id)?.label ?? id).join(', ')}.`
            : 'LOCAL SIMULATION // Maliades passed Short Range.');
        }} />
    </> : <WolfFighterRangeActionPanelView key={`${wing}:${range}`} view={view}
      onResolveMedium={actions => {setCommitted(current => ({...current, [`${wing}:${range}`]: true}));
        setMessage(actions.length
          ? `LOCAL SIMULATION // ${wing} choice committed: ${actions.length} independent fighter actions recorded.`
          : `LOCAL SIMULATION // ${wing} passed Medium Range.`);}}
      onResolveShort={indexes => {setCommitted(current => ({...current, [`${wing}:${range}`]: true}));
        setMessage(indexes.length > 0
          ? `LOCAL SIMULATION // ${wing} Short Range choice committed: fighters ${indexes.map(index => index + 1).join(', ')} selected.`
          : `LOCAL SIMULATION // ${wing} passed Short Range.`);}} />}
    <p className="pc07-review__result" role="status" aria-label="Prepared fighter result">{message}</p>
  </section>;
}

function BoardingReview() {
  const [view, setView] = useState(SAMPLE_BOARDING);
  const [sample, setSample] = useState('Crew');
  const [choices, setChoices] = useState<Record<string, boolean>>({});
  const [commanderChoice, setCommanderChoice] = useState<WolfAttackTargetId | null>(null);
  const [pallasChoice, setPallasChoice] = useState<WolfAttackTargetId | null>(null);
  const [militiaChoice, setMilitiaChoice] = useState({securityTeams: 0, militiaDoubleTeams: false, militiaFrontLineDice: 0});
  const [rulingChoice, setRulingChoice] = useState('');
  const [message, setMessage] = useState('LOCAL SAMPLE // Current host, support and available teams are prepared; no live relocation or roll.');
  function commit(choice: string) {
    setChoices(current => ({...current, [sample]: true}));
    setMessage(`LOCAL SIMULATION // ${choice} This prepared receipt is retained; no live cost, roll or ruling is applied.`);
  }
  return <section className="pc07-review__workspace pc07-review__choice-examples" aria-label="Prepared boarding choices">
    <p className="pc07-review__note">Support uses its actual owner, current dock and fuel. Deterministic party counts, dice and damage resolve automatically after genuine choices.
      The Wolf Commander’s incomplete printed consequence remains an explicit privately audited facilitator ruling.</p>
    <div className="pc07-review__controls">{['Crew', 'Commander', 'Support', 'Militia', 'AEGIS reroll', 'Pallas reroll', 'Ruling'].map(name =>
      <button className="cic-action-button" key={name} type="button" aria-pressed={sample === name} onClick={() => setSample(name)}>{name} sample</button>)}</div>
    {sample === 'Crew' && <WolfBoardingDefencePanelView view={view} onChoose={securityTeams => {
      setView({...view, revision: view.revision + 1, choiceStatus: 'committed', chosenSecurityTeams: securityTeams});
      setMessage(`LOCAL SIMULATION // ${securityTeams} Security Teams committed. The prepared choice is retained; this scene does not roll defence or draw damage.`);
    }} />}
    {sample === 'Commander' && <WolfBoardingCommanderChoicePanelView view={{type: 'wolf-boarding-commander-choice-view',
      status: choices[sample] ? 'committed' : 'pending', targets: [{targetShipId: 'aegis', boardingParties: 4}],
      ...(choices[sample] ? {selectedTargetId: commanderChoice} : {})}} onChoose={target => {setCommanderChoice(target); commit(target ? 'The Commander added two parties at the chosen target.' : 'The Commander passed.');}} />}
    {sample === 'Support' && <div className="pc08-review__boarding-support">
      <WolfBoardingSupportChoicePanelView view={{type: 'wolf-boarding-support-choice-view', craftId: 'pallas', currentHostId: 'aegis',
        fuelled: true, legalHostIds: ['aegis', 'dione'], status: choices[sample] ? 'committed' : 'pending',
        ...(choices[sample] ? {selectedHostId: pallasChoice} : {})}} onChoose={target => {setPallasChoice(target); commit(target ? 'Fuelled Pallas moved to its chosen host.' : 'Pallas stayed at its host.');}} />
      <WolfBoardingSupportChoicePanelView view={{type: 'wolf-boarding-support-choice-view', craftId: 'chepu', currentHostId: 'refinery-124',
        fuelled: false, legalHostIds: ['refinery-124'], status: choices.Chepu ? 'committed' : 'pending',
        ...(choices.Chepu ? {selectedHostId: null} : {})}} onChoose={() => {
          setChoices(current => ({...current, Chepu: true}));
          setMessage('LOCAL SIMULATION // Chepu stayed at Refinery 124; its choice is retained independently from Pallas.');
        }} />
    </div>}
    {sample === 'Militia' && <WolfBoardingMilitiaChoicePanelView view={{type: 'wolf-boarding-militia-choice-view', targetShipId: 'aegis',
      status: choices[sample] ? 'committed' : 'pending', boardingParties: 4, availableSecurityTeams: 3, maxFrontLineDice: 3, doubleDiceAvailable: true,
      ...(choices[sample] ? {selectedSecurityTeams: militiaChoice.securityTeams, ...militiaChoice} : {})}} onChoose={choice => {setMilitiaChoice(choice); commit(`${choice.securityTeams} Security Teams, ${choice.militiaDoubleTeams ? 'two dice per team' : 'one die per team'}, ${choice.militiaFrontLineDice} front-line dice committed.`);}} />}
    {(sample === 'AEGIS reroll' || sample === 'Pallas reroll') && <WolfBoardingRerollChoicePanelView key={sample} view={{type: 'wolf-boarding-reroll-choice-view',
      source: sample === 'AEGIS reroll' ? 'aegis' : 'pallas', status: choices[sample] ? 'committed' : 'pending', maxRerolls: 3,
      dice: [{targetShipId: 'aegis', dieIndex: 0, value: 1}, {targetShipId: 'aegis', dieIndex: 1, value: 4}], alreadyRerolled: []}}
      onChoose={dice => commit(`${sample === 'AEGIS reroll' ? 'AEGIS' : 'Pallas'} chose ${dice.length} indexed dice from its separate allowance.`)} />}
    {sample === 'Ruling' && <WolfBoardingCommanderRulingPanelView view={{type: 'wolf-boarding-commander-ruling-view', targetShipId: 'aegis',
      status: choices[sample] ? 'committed' : 'pending', condition: 'All Commander-led parties were lost. The printed consequence is incomplete; a facilitator ruling is required.',
      ...(choices[sample] ? {rulingText: rulingChoice} : {})}} onChoose={text => {setRulingChoice(text); commit('The prepared facilitator ruling was recorded privately.');}} />}
    <p className="pc07-review__result" role="status" aria-label="Prepared boarding result">{message}</p>
    <button className="cic-action-button" type="button" onClick={() => {setView(SAMPLE_BOARDING); setChoices({}); setMessage('LOCAL SAMPLE RESTORED // No shared state changed.');}}>Restore defence sample</button>
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
