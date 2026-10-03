import { useState } from 'react';
import { WolfForceFieldChoicePanelView } from '@/components/WolfForceFieldChoicePanel';
import { WolfRangeActionPanelView } from '@/components/WolfRangeActionPanel';
import { WolfBoardingDefencePanelView } from '@/components/WolfBoardingDefencePanel';
import GmWolfDecisionSummary from '@/components/GmWolfDecisionSummary';
import type {
  Player, WolfAttackDecisionSummary, WolfAttackTargetId, WolfBoardingDefenceChoiceView,
  WolfForceFieldChoiceView, WolfRangeActionChoiceView,
} from '@/types/game';

const deadline = '2026-10-03T12:10:00.000Z';
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
      Independent local examples // Captain before targeting; EO during Medium Range; crew during Boarding.
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
