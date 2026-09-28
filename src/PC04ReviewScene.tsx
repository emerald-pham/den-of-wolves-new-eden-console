import { useState } from 'react';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import FleetGroupContext from '@/components/FleetGroupContext';
import AwayMissionStartPanel from '@/components/AwayMissionStartPanel';
import { AwayMissionParticipantPanel } from '@/components/AwayMissionDiscardPanel';
import { FleetRoster } from '@/routes/SessionMode';
import { CONSOLE_ROLES } from '@/data/roles';
import type { AwayMissionStartReply, StartAwayMissionOptions } from '@/lib/sessionService';
import './PC04ReviewScene.css';

type Step = 'entry' | 'copy' | 'mission' | 'split' | 'recovery';
type SplitState = 'whole' | 'split' | 'taxi' | 'rejoin';

const STEPS: readonly { readonly id: Step; readonly label: string; readonly intro: string }[] = [
  { id: 'entry', label: '1 Enter once', intro: 'Use one early console catalog. Ordinary players enter a station; the authenticated GM joins through Role Select.' },
  { id: 'copy', label: '2 Read the console', intro: 'Check the CIC typography, current console wording, and exact default fleet alert.' },
  { id: 'mission', label: '3 Follow a mission', intro: 'Follow one group-bound mission from recorded team choice through private hand and automatic procedure log.' },
  { id: 'split', label: '4 Follow a split', intro: 'Keep group locations, rosters, pursuit, communications, and the scout-taxi exception distinct.' },
  { id: 'recovery', label: '5 Recover safely', intro: 'Compare stale, replay, and lost-acknowledgement states without repeating a committed procedure.' },
];

const RED_ALERT = 'RED ALERT // WOLF ATTACK IMMINENT ALL HANDS TO BATTLE STATIONS. NON-CREW MUST SHELTER IN PLACE UNTIL ALERT LIFTED';

const REVIEW_SEATS = [
  {
    id: 'admiral', sessionId: 'pc04-review', roleId: 'admiral', label: 'AEGIS // Admiral',
    factionId: 'aegis', status: 'claimed', holderUid: 'review-player', claimedAt: 'prepared',
  },
  {
    id: 'dione-engineer', sessionId: 'pc04-review', roleId: 'dione-engineer', label: 'Dione // Engineer',
    factionId: 'dione', status: 'open', holderUid: null, claimedAt: null,
  },
  {
    id: 'shepherd-scientist', sessionId: 'pc04-review', roleId: 'shepherd-scientist', label: 'Shepherd // Scientist',
    factionId: 'shepherd', status: 'claimed', holderUid: 'other-player', claimedAt: 'prepared',
  },
] as const;

const REVIEW_MISSION_SESSION = {
  id: 'pc04-review', name: 'PC04 // PREPARED REVIEW', phase: 'active', currentTurn: 4,
  turnLimit: 6, setupRevision: 12, chartId: 'A', chartSelectionLocked: true,
  activeRoleIds: ['dione-engineer', 'wing-commander'],
  turnPhase: {
    turn: 4, teamPhaseEndsAt: '2026-09-28T16:00:00.000Z',
    openAirspaceEndsAt: '2026-09-28T16:10:00.000Z',
    airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
  },
  turnState: {
    currentTurn: 4, maxTurn: 6, phase: 'coordination', phaseRevision: 12,
    startedAt: '2026-09-28T16:00:00.000Z', endsAt: '2026-09-28T16:10:00.000Z',
  },
} as const;

const REVIEW_MISSION_PLAYERS = [
  {
    uid: 'dione-engineer-player', displayName: 'Dione Engineer', role: 'player', connected: true,
    assignedRoleId: 'dione-engineer', fleetGroupId: 'fleet-2',
  },
  {
    uid: 'wing-commander-player', displayName: 'AEGIS Wing Commander', role: 'player', connected: true,
    assignedRoleId: 'wing-commander', fleetGroupId: 'fleet-2',
  },
] as const;

const REVIEW_MISSION_OPPORTUNITY = {
  type: 'mission-opportunity', status: 'available', sessionId: 'pc04-review',
  id: 'arrival-fleet-2-A-6798', groupId: 'fleet-2', chart: 'A', coordinate: '6798',
  siteCode: 'L', sourceShipId: 'starlight', sourceTransitionId: 'jump-entry-cycle-4', sourceCycle: 4,
} as const;

const REVIEW_MISSION_RECEIPT = {
  type: 'away-mission-start-snapshot', sessionId: 'pc04-review',
  opportunityId: 'arrival-fleet-2-A-5143', missionId: 'mission-arrival-fleet-2-A-5143',
  groupId: 'fleet-2', chart: 'A', coordinate: '5143', siteCode: 'L',
  sourceShipId: 'starlight', sourceTransitionId: 'jump-entry-cycle-3', sourceCycle: 3,
  missionLeader: { uid: 'dione-engineer-player', roleId: 'dione-engineer' },
  actorUid: 'review-gm', instanceId: 'pc04-review-bridge', requestId: 'pc04-mission-prior',
  source: {
    assumptionId: 'PC04-A1',
    playerGuide: 'Player’s Guide v1.1, printed pp. 14–15',
    facilitatorGuide: 'Facilitator’s Guide v1.1, printed pp. 13–17',
    a4CardPack: 'Home Printing A4 double-sided v1.1',
    ruleId: 'new-location-mission-with-team-selected-leader',
  },
  inputs: {
    expectedSetupRevision: 12, expectedPhaseRevision: 11, expectedCycle: 3,
    availableCarrierCraftIds: ['starlight'],
    participantSnapshots: [
      { uid: 'dione-engineer-player', roleId: 'dione-engineer' },
      { uid: 'wing-commander-player', roleId: 'wing-commander' },
    ],
    missionLeaderUid: 'dione-engineer-player',
  },
  modifiers: [], outcome: 'started',
  stateDelta: { missionSnapshotCreated: true, participantHandCount: 2, participantPointerCount: 2 },
  revisions: { setup: 12, phase: { cycle: 3, phase: 'coordination', revision: 11 } },
  replay: { status: 'committed', requestId: 'pc04-mission-prior' },
  recovery: { next: 'Exact replay returns this receipt without a second deal.' },
  createdAt: '2026-09-28T16:00:00.000Z',
} as const;

async function submitPreparedMissionStart(options: StartAwayMissionOptions): Promise<AwayMissionStartReply> {
  return {
    status: 'committed', sessionId: options.sessionId, requestId: options.requestId,
    opportunityId: options.opportunityId, snapshotId: options.opportunityId,
    missionId: `mission-${options.opportunityId}`, groupId: options.groupId,
    coordinate: options.coordinate, sourceCycle: options.sourceCycle,
    participantCount: options.participantUids.length, missionLeaderUid: options.missionLeaderUid,
    expectedSetupRevision: options.expectedSetupRevision,
    expectedPhaseRevision: options.expectedPhaseRevision,
    expectedCycle: options.expectedCycle,
  };
}

function PreparedStationPreview() {
  const { pathname } = useLocation();
  const roleId = pathname.split('/').at(-1);
  const role = CONSOLE_ROLES.find((candidate) => candidate.id === roleId);
  const station = pathname === '/roles' ? 'GM join // Role Select' : role?.name ?? 'Station overview';
  return <section className="pc04-review__station-preview cic-frame" aria-label="Prepared station preview">
    <p className="cic-overline">LOCAL REVIEW ROUTE // NO LIVE COMMAND</p>
    <h3>{station}</h3>
    <p>This production catalog route is prepared locally. It makes no station claim and does not transfer authority.</p>
    <Link className="cic-text-button" to="/console">Return to stations and consoles</Link>
  </section>;
}

function EntryCheck() {
  return <section className="pc04-review__panel cic-frame" role="region" aria-label="Prepared unified console entry">
    <header className="pc04-review__panel-heading">
      <div><p className="cic-overline">SINGLE EARLY SCREEN</p><h2>Console and station entry</h2></div>
      <p>PLAYER PATH // NO SECOND ROLE CHOICE</p>
    </header>
    <MemoryRouter initialEntries={['/console']}>
      <Routes>
        <Route path="/console" element={<FleetRoster
          session={{ phase: 'lobby' } as never}
          player={{ role: 'player', fleetGroupId: 'fleet-2' } as never}
          sessionName="PC04 // PREPARED ENTRY"
          capybaraEnabled={false}
          dioneEnabled
          pressEnabled={false}
          pressClaimed={false}
          activeRoleIds={['admiral', 'dione-engineer', 'shepherd-scientist']}
          activeVesselIds={['aegis', 'dione', 'shepherd']}
          isGm={false}
          gmJoinAvailable
          sessionSnapshotFreshness="server"
          seats={REVIEW_SEATS as never}
          viewerUid="review-player"
          activeConsoleRoleId="admiral"
          replacementRoleId={null}
        />} />
        <Route path="*" element={<PreparedStationPreview />} />
      </Routes>
    </MemoryRouter>
    <p className="pc04-review__note">The production station catalog is rendered here. Only the authenticated facilitator link enters Role Select.</p>
  </section>;
}

function CopyCheck() {
  return <section className="pc04-review__panel cic-frame" role="region" aria-label="Prepared typography and copy check">
    <header className="pc04-review__panel-heading">
      <div><p className="cic-overline">MANDATORY TYPOGRAPHY GATE</p><h2>CIC console contract</h2></div>
      <p>DISPLAY // MONO // READOUT</p>
    </header>
    <div className="pc04-review__type-grid">
      <section className="pc04-review__type-sample pc04-review__type-sample--display">
        <p>Display face</p><h3>DRADIS CONTACT PLOT</h3><strong>WOLF VECTOR // 02</strong>
      </section>
      <section className="pc04-review__type-sample pc04-review__type-sample--mono">
        <p>Mono face</p><h3>CONSOLE READOUT</h3><strong>FLEET-2 // 6798 // PURSUIT 07</strong>
      </section>
    </div>
    <blockquote className="pc04-review__alert">{RED_ALERT}</blockquote>
    <p className="pc04-review__procedure-copy">UPGRADES AND PROCEDURE OUTCOMES ARE TRACKED AT THE CONSOLE</p>
    <p className="pc04-review__note">Rendered browser checks compare the candidate against the intended CIC tokens. PC01 is the strongest known-good reference, not permission to preserve an outlier.</p>
  </section>;
}

function MissionCheck() {
  const [discarded, setDiscarded] = useState(false);
  const pointer = {
    sessionId: 'pc04-review', participantUid: 'dione-engineer-player',
    missionId: 'mission-arrival-fleet-2-A-6798', handId: 'hand-dione-engineer',
    phase: 'discarding', revision: discarded ? 2 : 1, discarded,
    groupId: 'fleet-2', chart: 'A', coordinate: '6798', siteCode: 'L', sourceCycle: 4,
    participantCount: 2, missionLeaderUid: 'dione-engineer-player', missionLeaderRoleId: 'dione-engineer',
  } as const;
  const hand = {
    sessionId: 'pc04-review', participantUid: 'dione-engineer-player',
    missionId: 'mission-arrival-fleet-2-A-6798', handId: 'hand-dione-engineer',
    cardId: 'A♥', rank: 'A', suit: 'hearts', value: 10, discarded,
  } as const;
  return <div className="pc04-review__mission-layout">
    <div className="pc04-review__panel">
      <p className="pc04-review__note">Production mission controls with a local prepared command boundary. No callable or live session is used.</p>
      <AwayMissionStartPanel
        session={REVIEW_MISSION_SESSION as never}
        players={REVIEW_MISSION_PLAYERS as never}
        instanceId="pc04-review-bridge"
        isGm
        preparedOpportunities={[REVIEW_MISSION_OPPORTUNITY] as never}
        preparedReceipts={[REVIEW_MISSION_RECEIPT] as never}
        submitMissionStart={submitPreparedMissionStart}
      />
    </div>
    <div className="pc04-review__panel">
      <p className="pc04-review__note">Entitled-participant view. Only this prepared card is rendered; the local discard changes no session state.</p>
      <AwayMissionParticipantPanel
        pointers={[pointer] as never}
        hands={[hand] as never}
        discardCard={async () => setDiscarded(true)}
      />
    </div>
  </div>;
}

function SplitCheck() {
  const [state, setState] = useState<SplitState>('split');
  const readout: Record<SplitState, string> = {
    whole: 'Whole fleet sample // one group // one location // one pursuit value',
    split: 'Split sample // independent groups, locations, pursuit values, and ordinary communication audiences',
    taxi: 'Scout taxi sample // separate authority path // range check // two players or two fuel',
    rejoin: 'Pending rejoin sample // pursuit values remain separate // no invented merge',
  };
  return <section className="pc04-review__panel cic-frame" role="region" aria-label="Prepared split fleet">
    <header className="pc04-review__panel-heading">
      <div><p className="cic-overline">GROUP-LOCAL STATE</p><h2>Split-fleet status</h2></div>
      <p>Ordinary communications remain within each group.</p>
    </header>
    <div className="pc04-review__controls" role="group" aria-label="Prepared split states">
      {([
        ['whole', 'Whole fleet'], ['split', 'Split'], ['taxi', 'Scout taxi'], ['rejoin', 'Pending rejoin'],
      ] as const).map(([id, label]) => <button
        className="cic-action-button" type="button" key={id}
        aria-pressed={state === id} onClick={() => setState(id)}
      >{label}</button>)}
    </div>
    <p className="pc04-review__result" role="status" aria-label="Prepared split state">{readout[state]}</p>
    <div className="pc04-review__group-grid">
      <section role="region" aria-label="FLEET-1 status">
        <FleetGroupContext groupId="fleet-1" currentCoordinate="5143" vesselIds={['aegis', 'quellon']} pursuitValue={4} />
      </section>
      <section role="region" aria-label="FLEET-2 status">
        <FleetGroupContext groupId="fleet-2" currentCoordinate="6798" vesselIds={['dione', 'shepherd']} pursuitValue={7} />
      </section>
    </div>
    <p className="pc04-review__note">The pending-rejoin sample deliberately keeps both pursuit values. No review control performs a split, taxi move, or merge.</p>
  </section>;
}

function RecoveryCheck() {
  return <section className="pc04-review__panel cic-frame" role="region" aria-label="Prepared PC04 recovery">
    <header className="pc04-review__panel-heading">
      <div><p className="cic-overline">FAIL CLOSED // EXACT REPLAY</p><h2>Recovery boundary</h2></div>
      <p>NO DUPLICATE PROCEDURE</p>
    </header>
    <div className="pc04-review__recovery-grid">
      <article><h3>Stale revision</h3><p>Stale revision // refresh the current group and mission snapshot before another choice.</p></article>
      <article><h3>Lost acknowledgement</h3><p>Lost acknowledgement // retry the same request identity and recover its committed receipt.</p></article>
      <article><h3>Authority changed</h3><p>GM instance, participant, group, coordinate, cycle, or craft changed // no mutation.</p></article>
      <article><h3>Private state</h3><p>Reconnect restores only the entitled hand and current group projection.</p></article>
    </div>
    <button className="cic-action-button" type="button" disabled>Repeat automated mission start</button>
  </section>;
}

export default function PC04ReviewScene() {
  const [step, setStep] = useState<Step>('entry');
  const selected = STEPS.find((candidate) => candidate.id === step) ?? STEPS[0]!;
  return <div className="pc04-review">
    <a className="pc04-review__skip" href="#pc04-review-content">Skip to review step</a>
    <header className="pc04-review__header">
      <div><p>DEN OF WOLVES // NEW EDEN CONSOLE</p><h1>PC04 // Exploration and split-fleet map</h1></div>
      <p className="pc04-review__mode">SINGLE FACILITATOR // SYNTHETIC REVIEW</p>
    </header>
    <aside className="pc04-review__sample-banner" aria-label="Synthetic sample notice">
      Prepared synthetic states // no live session writes. Authority, privacy, and production-play evidence remain separate gates.
    </aside>
    <nav className="pc04-review__steps" aria-label="PC04 review steps">
      {STEPS.map((candidate) => <button
        type="button" key={candidate.id} aria-pressed={step === candidate.id}
        onClick={() => setStep(candidate.id)}
      >{candidate.label}</button>)}
    </nav>
    <main id="pc04-review-content" className="pc04-review__content" tabIndex={-1}>
      <section className="pc04-review__intro cic-frame" aria-label="Current review step">
        <p className="cic-overline">OWNER CHECK // {selected.label.toUpperCase()}</p>
        <p>{selected.intro}</p>
      </section>
      {step === 'entry' ? <EntryCheck />
        : step === 'copy' ? <CopyCheck />
          : step === 'mission' ? <MissionCheck />
            : step === 'split' ? <SplitCheck />
              : <RecoveryCheck />}
    </main>
    <footer className="pc04-review__footer">
      <span>PC04 PREPARED CHECKPOINT</span><span>NO LIVE COMMANDS</span>
    </footer>
  </div>;
}
