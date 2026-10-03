import { useState } from 'react';
import { WolfForceFieldChoicePanelView } from '@/components/WolfForceFieldChoicePanel';
import { WolfRangeActionPanelView } from '@/components/WolfRangeActionPanel';
import { WolfBoardingDefencePanelView } from '@/components/WolfBoardingDefencePanel';
import { WolfCommanderTargetingPanelView } from '@/components/WolfCommanderTargetingPanel';
import { AegisCommandAndControlPanelView } from '@/components/AegisCommandAndControlPanel';
import GmWolfDecisionSummary from '@/components/GmWolfDecisionSummary';
import type {
  AegisCommandAndControlView, WolfCommanderTargetingView, Player, WolfAttackDecisionSummary, WolfAttackTargetId, WolfBoardingDefenceChoiceView,
  WolfForceFieldChoiceView, WolfRangeActionChoiceView,
} from '@/types/game';

const deadline = '2026-10-03T12:10:00.000Z';
const baseCommander: WolfCommanderTargetingView = {
  type: 'wolf-commander-targeting-view', sessionId: 'prepared-pc07', turn: 2, revision: 3,
  currentStep: 'targeting', rerollsFinalized: false,
  rolls: [
    { rosterIndex: 0, shipId: 'wolf-fighter-wing', die: 2, target: 'dione' },
    { rosterIndex: 1, shipId: 'wolf-assault-transport', die: 5, target: 'shepherd' },
  ], eligibleRerollIndexes: [0, 1], rerolledIndexes: [],
};
const baseCnc: AegisCommandAndControlView = {
  type: 'aegis-command-and-control-view', sessionId: 'prepared-pc07', turn: 2, revision: 4,
  eligible: true, commanderAssigned: true, rerollsFinalized: true,
  targets: [{ rosterIndex: 0, shipId: 'wolf-fighter-wing' }, { rosterIndex: 1, shipId: 'wolf-assault-transport' }],
};
const baseCaptain: WolfForceFieldChoiceView = {
  type: 'wolf-force-field-choice-view', sessionId: 'prepared-pc07', turn: 2, revision: 2,
  attackId: 'prepared-choices', hostShipId: 'aegis', dockingRevision: 1, fleetGroupId: 'fleet-1',
  choiceStatus: 'pending', targetShipIds: ['aegis', 'dione', 'refinery-124'], deadlineAt: deadline,
};
const baseRange: WolfRangeActionChoiceView = {
  type: 'wolf-range-action-choice-view', sessionId: 'prepared-pc07', turn: 2, revision: 4,
  currentStep: 'medium-range', range: 'medium-range', choiceStatus: 'pending', deadlineAt: deadline,
  eligibleActions: [
    { actionId: 'missile-medium', sourceId: 'aegis-missile-launchers', range: 'medium-range' },
    { actionId: 'pdl-medium', sourceId: 'aegis-point-defence-lasers', range: 'medium-range' },
  ], hitSlots: [], contacts: [
    { contactId: 'local-contact-1', targetShipId: 'aegis', available: true },
    { contactId: 'local-contact-2', targetShipId: 'dione', available: true },
  ],
};
const baseBoarding: WolfBoardingDefenceChoiceView = {
  type: 'wolf-boarding-defence-choice-view', sessionId: 'prepared-pc07', turn: 2, revision: 6,
  targetShipId: 'aegis', boardingParties: 2, availableSecurityTeams: 3,
  choiceStatus: 'pending', deadlineAt: deadline,
};
const players: readonly Player[] = [{ uid: 'prepared-eo', displayName: 'Prepared EO',
  sessionId: 'prepared-pc07', role: 'player', seatId: null, joinedAt: deadline }];

export default function PC07AttackChoicesReview() {
  const [commander, setCommander] = useState(baseCommander);
  const [cnc, setCnc] = useState(baseCnc);
  const [captain, setCaptain] = useState(baseCaptain);
  const [range, setRange] = useState(baseRange);
  const [boarding, setBoarding] = useState(baseBoarding);
  const [current, setCurrent] = useState(true);
  const [result, setResult] = useState('Local callbacks only. No game command is sent.');
  const summary: WolfAttackDecisionSummary = {
    commander: { status: 'committed', actors: [] },
    commandAndControl: { status: 'passed', actors: [] },
    forceField: captain.choiceStatus === 'selected'
      ? { status: 'selected', targetShipId: captain.targetShipId ?? null }
      : { status: captain.choiceStatus === 'passed' ? 'passed' : 'pending' },
    range: { range: 'medium-range', status: range.choiceStatus,
      actors: [{ uid: 'prepared-eo', connected: false }], actionCount: 2 },
  };
  const restore = () => {
    setCommander(baseCommander); setCnc(baseCnc);
    setCaptain(baseCaptain); setRange(baseRange); setBoarding(baseBoarding); setCurrent(true);
    setResult('Prepared examples restored. No shared game state changed.');
  };
  const chooseCaptain = (targetShipId: WolfAttackTargetId | null) => {
    setCaptain({ ...baseCaptain, revision: 3,
      choiceStatus: targetShipId ? 'selected' : 'passed', targetShipId });
    setResult(targetShipId ? `Local Captain choice: ${targetShipId.toUpperCase()}.` : 'Local Captain pass.');
  };
  return <section className="pc07-review__workspace pc07-review__choice-examples" aria-label="Actual prepared attack choices">
    <h3>Try the player and GM controls</h3>
    <p className="pc07-review__note" role="note" aria-label="Prepared choice examples">
      Independent local examples // Captain before targeting; Commander rerolls; optional EO redirect; range actions; crew during Boarding.
      These use the actual presenters with prepared data. They do not calculate or commit a game result.
    </p>
    <div className="pc07-review__controls">
      <button className="cic-action-button" type="button" onClick={restore}>Restore choice examples</button>
      <button className="cic-action-button" type="button" onClick={() => setRange({ ...baseRange,
        revision: 5, choiceStatus: 'targets-required', hitSlots: [{ actionId: 'missile-medium', count: 3 }] })}>
        Show locked hit targets sample
      </button>
      <button className="cic-action-button" type="button" onClick={() => setCurrent(false)}>Offline decision summary sample</button>
    </div>
    <WolfForceFieldChoicePanelView view={captain} onChoose={chooseCaptain} onPass={() => chooseCaptain(null)} />
    <WolfCommanderTargetingPanelView view={commander} onReroll={(_turn, _revision, indexes) => {
      setCommander({ ...commander, revision: commander.revision + 1,
        eligibleRerollIndexes: commander.eligibleRerollIndexes.filter(index => !indexes.includes(index)),
        rerolledIndexes: [...commander.rerolledIndexes, ...indexes] });
      setResult(`Local Commander reroll: ${indexes.length} die. No native roll or game command.`);
    }} onFinish={() => {
      setCommander({ ...commander, revision: commander.revision + 1, rerollsFinalized: true });
      setResult('Local Commander finish. No native game command.');
    }} />
    <AegisCommandAndControlPanelView view={cnc} onRedirect={(_turn, _revision, index) => {
      const target = cnc.targets.find(candidate => candidate.rosterIndex === index);
      if (!target) return;
      setCnc({ ...cnc, revision: cnc.revision + 1, eligible: false, reason: 'already-used',
        targets: [], redirectedShipId: target.shipId });
      setResult('Local C&C redirect. No native targeting changed.');
    }} onPass={() => {
      setCnc({ ...cnc, revision: cnc.revision + 1, eligible: false, reason: 'passed', targets: [] });
      setResult('Local C&C pass. No native target was redirected.');
    }} />
    <WolfRangeActionPanelView view={range} onUseActions={actions => {
      setResult(`Local range actions: ${actions.length}. Charge remains available in its printed later range.`);
      setRange({ ...baseRange, revision: 5, choiceStatus: 'targets-required',
        hitSlots: actions.map(actionId => ({ actionId, count: 3 })) });
    }} onPass={() => { setRange({ ...range, choiceStatus: 'committed' }); setResult('Local range pass. Charge retained.'); }}
      onAssignTargets={assignments => {
        const chosen = assignments.reduce((count, assignment) => count + assignment.contactIds.length, 0);
        const generated = range.hitSlots.reduce((count, slot) => count + slot.count, 0);
        setRange({ ...range, choiceStatus: 'committed' });
        setResult(`Prepared assignment: ${chosen} local contacts; ${generated - chosen} hit unused. No native result written.`);
      }} />
    <WolfBoardingDefencePanelView view={boarding} onChoose={chosenSecurityTeams => {
      setBoarding({ ...baseBoarding, revision: 7, choiceStatus: 'committed', chosenSecurityTeams });
      setResult(`Local defence choice: ${chosenSecurityTeams} Security Teams. No damage calculation or native write.`);
    }} />
    <GmWolfDecisionSummary summary={summary} currentStep="medium-range" players={players} available={current} />
    <p className="pc07-review__result" role="status" aria-label="Prepared choice callback result">{result}</p>
  </section>;
}
