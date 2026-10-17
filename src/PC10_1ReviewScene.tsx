import { useState } from 'react';
import CandidateRevealPanel from '@/components/CandidateRevealPanel';
import { EndeavourEcmDeviceView, type EndeavourEcmDevicePresentation } from '@/components/EndeavourEcmDeviceView';
import EndeavourFieldUpgradeChoices from '@/components/EndeavourFieldUpgradeChoices';
import EndeavourResearchChoices from '@/components/EndeavourResearchChoices';
import EndeavourScienceDeviceChoices from '@/components/EndeavourScienceDeviceChoices';
import ExplorerRoutePlanner from '@/components/ExplorerRoutePlanner';
import HummingbirdHarvestChoices from '@/components/HummingbirdHarvestChoices';
import { ScoutResultPanel, type PrivateScoutResultView, type ScoutDiscoveryNoteView, type ScoutReportView } from '@/components/ScoutResultPanels';
import type { EndeavourFieldUpgradeOption } from '@/lib/endeavourFieldUpgradeService';
import type { EndeavourResearchFunding, EndeavourResearchWorkspace } from '@/lib/endeavourResearchService';
import type { GameSession, HummingbirdHarvest as HummingbirdHarvestState, Player } from '@/types/game';
import { APP_VERSION } from './version';
import './PC07ReviewScene.css';
import './PC10_1ReviewScene.css';

const STAMP = '2026-10-16T12:00:00.000Z';
const STEPS = [
  {
    label: '1 Scientist fieldwork',
    title: 'Research, build a device and recover a private report',
    copy: 'Inspect the prepared research and construction costs, then use the real Scientist controls against local sample state.',
  },
  {
    label: '2 Explorer fieldwork',
    title: 'Plan a known route and allocate the harvest',
    copy: 'Choose a destination from the known chart and allocate one prepared Hummingbird die to food; the other becomes water.',
  },
  {
    label: '3 Candidate preparation',
    title: 'Review entitled N/O/P preparation at Cycle 6',
    copy: 'Check the candidate identities and preparation guidance available to the prepared fleet group.',
  },
] as const;

const INITIAL_RESEARCH: EndeavourResearchWorkspace = {
  status: 'ready',
  sessionId: 'prepared-pc10-1',
  cycle: 5,
  researchRevision: 2,
  cadence: { cycle: 5, revision: 2, choices: [] },
  progress: { reactor: 1, 'jump-drive': 0 },
  tracks: [
    { trackId: 'reactor', name: 'Reactor', crossedBoxes: 1, totalBoxes: 5, currentMaterialCost: 8, complete: false },
    { trackId: 'jump-drive', name: 'Jump Drive', crossedBoxes: 0, totalBoxes: 5, currentMaterialCost: 14, complete: false },
  ],
  shepherdOre: 10,
  fieldUpgradeState: { upgradeRevision: 2, targetsUsedThisCycle: 0 },
  scienceDevices: {
    revision: 1,
    ecmBuilt: false,
    detectorBuilt: false,
    ecmUsed: false,
    shepherdMaterials: 10,
    buildCosts: { 'ecm-device': 10, 'wolf-agent-detector': 18 },
  },
};

const SCOUT_FACT: PrivateScoutResultView['systemFact'] = {
  coordinate: '8378', code: 'O', title: 'Deep Nebula',
};
const SCOUT_REPORT: ScoutReportView = {
  requestId: 'prepared-pc10-1-scout', cycle: 5, entitlementId: 'endeavour',
  targetCoordinate: '8378', status: 'resolved', noteId: 'prepared-pc10-1-scout-note',
};
const SCOUT_RESULT: PrivateScoutResultView = {
  type: 'private-scout-result', sessionId: 'prepared-pc10-1', requestId: SCOUT_REPORT.requestId,
  requesterUid: 'prepared-scientist', sourceId: 'endeavour', cycle: 5,
  targetCoordinate: '8378', systemFact: SCOUT_FACT,
};
const SCOUT_NOTE: ScoutDiscoveryNoteView = {
  type: 'player-discovery-note', id: 'prepared-pc10-1-scout-note', cycle: 5,
  targetCoordinate: '8378', systemFact: SCOUT_FACT, recordedAt: STAMP,
};

const INITIAL_HARVEST: HummingbirdHarvestState = {
  sessionId: 'prepared-pc10-1', ownerUid: 'prepared-explorer', turn: 5,
  hostShipId: 'quellon', revision: 2, status: 'pending', rolls: [2, 5],
  requestId: 'prepared-pc10-1-harvest', createdAt: STAMP,
};

const CANDIDATE_SESSION: Pick<GameSession, 'phase' | 'currentTurn' | 'currentGroupCandidateReveals'> = {
  phase: 'active',
  currentTurn: 6,
  currentGroupCandidateReveals: {
    groupId: 'prepared-fleet',
    revision: 3,
    candidateReveals: [
      { code: 'N', title: 'Ancient Jump Ring' },
      { code: 'O', title: 'Deep Nebula' },
      { code: 'P', title: 'Ancient Space Station' },
    ],
  },
};
const CANDIDATE_PLAYER: Pick<Player, 'role' | 'fleetGroupId'> = {
  role: 'player', fleetGroupId: 'prepared-fleet',
};

function advanceResearch(
  workspace: EndeavourResearchWorkspace,
  trackId: string,
  funding: EndeavourResearchFunding,
): EndeavourResearchWorkspace {
  const selected = workspace.tracks.find((track) => track.trackId === trackId);
  if (!selected || selected.complete || workspace.cadence.choices.some((choice) => choice.trackId === trackId)) {
    return workspace;
  }
  const crossedBoxes = selected.crossedBoxes + 1;
  const choices = [...workspace.cadence.choices, {
    trackId,
    funding,
    oreCost: funding === 'shepherd-ore' ? 5 as const : 0 as const,
  }];
  return {
    ...workspace,
    shepherdOre: funding === 'shepherd-ore' ? workspace.shepherdOre - 5 : workspace.shepherdOre,
    researchRevision: workspace.researchRevision + 1,
    cadence: { cycle: workspace.cycle, revision: workspace.cadence.revision + 1, choices },
    progress: { ...workspace.progress, [trackId]: crossedBoxes },
    tracks: workspace.tracks.map((track) => track.trackId === trackId
      ? {
          ...track,
          crossedBoxes,
          currentMaterialCost: track.currentMaterialCost === null
            ? null : Math.max(0, track.currentMaterialCost - 1),
          complete: crossedBoxes >= track.totalBoxes,
        }
      : track),
  };
}

function fieldUpgradeOptions(workspace: EndeavourResearchWorkspace): readonly EndeavourFieldUpgradeOption[] {
  const reactor = workspace.tracks.find((track) => track.trackId === 'reactor');
  const jumpDrive = workspace.tracks.find((track) => track.trackId === 'jump-drive');
  return [
    {
      shipId: 'aegis', shipName: 'AEGIS', systemId: 'reactor', systemName: 'Reactor',
      trackId: 'reactor', trackName: 'Reactor', materialCost: reactor?.currentMaterialCost ?? 8,
    },
    {
      shipId: 'dione', shipName: 'DIONE', systemId: 'jump-drive', systemName: 'Jump Drive',
      trackId: 'jump-drive', trackName: 'Jump Drive', materialCost: jumpDrive?.currentMaterialCost ?? 14,
    },
  ];
}

function ScientistReview() {
  const [workspace, setWorkspace] = useState(INITIAL_RESEARCH);
  const [selectedTrackId, setSelectedTrackId] = useState('jump-drive');
  const [researchNotice, setResearchNotice] = useState('PENDING SAMPLE // One local research choice awaits the Scientist.');
  const [deviceNotice, setDeviceNotice] = useState('');
  const [deviceError, setDeviceError] = useState('');
  const [selectedUpgradeKeys, setSelectedUpgradeKeys] = useState<readonly string[]>([]);
  const [targetsUsed, setTargetsUsed] = useState(0);
  const [upgradeNotice, setUpgradeNotice] = useState('');
  const [ecmState, setEcmState] = useState<EndeavourEcmDevicePresentation>({
    status: 'ready', groupId: 'prepared-fleet', pursuit: 8,
  });
  const options = fieldUpgradeOptions(workspace);
  const remaining = Math.max(0, 2 - targetsUsed);
  const purchaseDisabled = selectedUpgradeKeys.length === 0 ||
    selectedUpgradeKeys.length > remaining || remaining === 0;

  function advance(funding: EndeavourResearchFunding): void {
    setWorkspace((current) => advanceResearch(current, selectedTrackId, funding));
    setResearchNotice(`COMMITTED SAMPLE // LOCAL SIMULATION // ${funding === 'standard' ? 'Standard' : 'Shepherd ore'} research choice committed. No live state changed.`);
  }

  function buildDevice(deviceId: 'ecm-device' | 'wolf-agent-detector'): void {
    const devices = workspace.scienceDevices;
    const price = devices?.buildCosts[deviceId];
    if (!devices || price === null || price === undefined || devices.shepherdMaterials < price) {
      setDeviceError('LOCAL DENIED SAMPLE // Current prepared materials do not cover this construction cost.');
      setDeviceNotice('');
      return;
    }
    setWorkspace((current) => {
      const currentDevices = current.scienceDevices;
      if (!currentDevices) return current;
      return {
        ...current,
        scienceDevices: {
          ...currentDevices,
          revision: currentDevices.revision + 1,
          ecmBuilt: deviceId === 'ecm-device' || currentDevices.ecmBuilt,
          detectorBuilt: deviceId === 'wolf-agent-detector' || currentDevices.detectorBuilt,
          shepherdMaterials: currentDevices.shepherdMaterials - price,
        },
      };
    });
    setDeviceError('');
    setDeviceNotice(`LOCAL SIMULATION // ${deviceId === 'ecm-device' ? 'ECM Device' : 'Wolf Agent Detector'} built for ${price} materials.`);
  }

  function selectUpgrade(option: EndeavourFieldUpgradeOption, checked: boolean): void {
    const key = `${option.shipId}:${option.systemId}`;
    setSelectedUpgradeKeys((current) => checked
      ? [...new Set([...current, key])]
      : current.filter((candidate) => candidate !== key));
    setUpgradeNotice('');
  }

  function purchaseUpgrades(): void {
    if (purchaseDisabled) return;
    const count = selectedUpgradeKeys.length;
    setTargetsUsed((current) => current + count);
    setSelectedUpgradeKeys([]);
    setUpgradeNotice(`LOCAL SIMULATION // ${count} prepared field upgrade${count === 1 ? '' : 's'} installed on this page.`);
  }

  return <section className="pc10-1-review__workspace" aria-label="Prepared Scientist fieldwork">
    <div className="pc10-1-review__columns">
      <div className="cic-frame pc07-review__panel">
        <EndeavourResearchChoices
          workspace={workspace}
          selectedTrackId={selectedTrackId}
          liveTeamPhase
          notice={researchNotice}
          onSelectTrack={setSelectedTrackId}
          onAdvance={advance}
          onRefresh={() => setResearchNotice('PENDING SAMPLE // Prepared research state remains local to this review.')}
        />
      </div>
      <div>
        <p className="pc07-review__note" role="note" aria-label="Device denial sample">
          DENIED SAMPLE // Wolf Agent Detector costs 18 materials while this prepared Scientist has 10.
        </p>
        <EndeavourScienceDeviceChoices
          workspace={workspace}
          liveTeamPhase
          actionsEnabled
          busy={false}
          attempt={null}
          notice={deviceNotice}
          error={deviceError}
          sampleNote="Local sample controls only; the disabled cost remains visible for comparison."
          onBuild={buildDevice}
          onRetry={() => setDeviceNotice('PENDING SAMPLE // No live purchase request exists to retry.')}
        />
      </div>
      <div className="cic-frame pc07-review__panel">
        <p className="pc07-review__note">PENDING SAMPLE // Select an available target to review its actual field-upgrade cost.</p>
        <EndeavourFieldUpgradeChoices
          options={options}
          selectedKeys={selectedUpgradeKeys}
          remaining={remaining}
          showTargets
          selectionDisabled={remaining === 0}
          purchaseDisabled={purchaseDisabled}
          busy={false}
          purchaseLabel="Install selected console upgrades"
          onTargetChange={selectUpgrade}
          onPurchase={purchaseUpgrades}
          onRetryStale={() => setUpgradeNotice('DENIED SAMPLE // The prepared selection is no longer current.')}
          onRetryExact={() => setUpgradeNotice('PENDING SAMPLE // No live purchase request exists to retry.')}
          onRefresh={() => setUpgradeNotice('LOCAL SIMULATION // Prepared purchase costs refreshed.')}
        />
        {upgradeNotice && <p role="status">{upgradeNotice}</p>}
      </div>
      <div className="cic-frame pc07-review__panel">
        {workspace.scienceDevices?.ecmBuilt
          ? <EndeavourEcmDeviceView
              state={ecmState}
              onActivate={() => setEcmState({
                status: 'successful', groupId: 'prepared-fleet', pursuitBefore: 8, pursuitAfter: 5,
              })}
            />
          : <p>Build the prepared ECM Device above to see its service-free use and result controls.</p>}
      </div>
      <div className="cic-frame pc07-review__panel">
        <p className="pc07-review__note" role="note" aria-label="Recovered scout sample">
          RECOVERED SAMPLE // The same private report is available after the prepared page reloads.
        </p>
        <ScoutResultPanel report={SCOUT_REPORT} result={SCOUT_RESULT} note={SCOUT_NOTE} />
      </div>
    </div>
  </section>;
}

function ExplorerReview() {
  const [harvest, setHarvest] = useState(INITIAL_HARVEST);
  const [selectedFoodDieIndex, setSelectedFoodDieIndex] = useState<0 | 1 | null>(null);
  const [notice, setNotice] = useState('');

  function allocate(foodDieIndex: 0 | 1): void {
    if (harvest.status !== 'pending') return;
    const food = harvest.rolls[foodDieIndex];
    const water = harvest.rolls[foodDieIndex === 0 ? 1 : 0];
    setSelectedFoodDieIndex(foodDieIndex);
    setHarvest({
      ...harvest,
      revision: harvest.revision + 1,
      status: 'resolved',
      foodDieIndex,
      food,
      water,
      resolvedAt: STAMP,
    });
    setNotice('LOCAL SIMULATION // Sample allocation committed.');
  }

  return <section className="pc10-1-review__workspace" aria-label="Prepared Explorer fieldwork">
    <div className="pc10-1-review__columns">
      <ExplorerRoutePlanner
        currentCoordinate="0000"
        knownCoordinates={['0000', '5143']}
        knownSystems={{ 'system-01': '0000', 'system-02': '5143' }}
      />
      <div>
        <HummingbirdHarvestChoices
          view={{
            available: true,
            unavailableMessages: [],
            harvest,
            retryAttempt: null,
            selectedFoodDieIndex,
            busy: false,
            notice,
            error: '',
            sampleNote: harvest.status === 'pending'
              ? 'PENDING SAMPLE // Prepared two-die receipt; choose one die for food.'
              : 'COMMITTED SAMPLE // The prepared allocation result is shown below.',
          }}
          onRoll={() => setNotice('PENDING SAMPLE // The prepared roll is already available.')}
          onAllocate={allocate}
          onRetry={() => setNotice('PENDING SAMPLE // No live harvest request exists to retry.')}
        />
      </div>
    </div>
    <p className="pc07-review__note">LOCAL SIMULATION // This prepared route is a known-chart preview; movement still uses its normal ship control and server checks.</p>
  </section>;
}

function CandidatePreparationReview() {
  return <section className="pc10-1-review__workspace" aria-label="Prepared N/O/P candidate preparation">
    <CandidateRevealPanel
      session={CANDIDATE_SESSION}
      player={CANDIDATE_PLAYER}
      sessionSnapshotFreshness="server"
    />
    <p className="pc07-review__note">ENTITLED SAMPLE // Only the prepared fleet group's candidate names and printed preparation guidance are shown.</p>
  </section>;
}

export default function PC10_1ReviewScene() {
  const [index, setIndex] = useState(0);
  const step = STEPS[index]!;

  return <div className="pc07-review pc10-1-review">
    <a className="pc07-review__skip" href="#pc10-1-review-content">Skip to review workspace</a>
    <header className="pc07-review__header">
      <div>
        <p>New Eden Console // solo review // build {APP_VERSION}</p>
        <h1>PC10.1 // Scientist and Explorer fieldwork</h1>
      </div>
      <a className="cic-text-button" href="/#/">Return to station and console chooser</a>
    </header>
    <p className="pc07-review__boundary" role="note" aria-label="Prepared review boundary">
      Prepared review // No live session is connected or changed. Controls update synthetic local samples only. Gameplay evidence is recorded separately.
    </p>
    <nav className="pc07-review__steps" aria-label="PC10.1 review checks">
      {STEPS.map((item, position) => <button key={item.label} className="cic-action-button" type="button"
        aria-pressed={index === position} onClick={() => setIndex(position)}>{item.label}</button>)}
    </nav>
    <main id="pc10-1-review-content" className="pc07-review__content" tabIndex={-1}>
      <section className="pc07-review__intro cic-frame">
        <p>Check {index + 1} of {STEPS.length}</p>
        <h2>{step.title}</h2>
        <p>{step.copy}</p>
      </section>
      {index === 0 && <ScientistReview />}
      {index === 1 && <ExplorerReview />}
      {index === 2 && <CandidatePreparationReview />}
      <div className="pc07-review__step-controls">
        <button className="cic-action-button" type="button" aria-label="Previous review step" disabled={index === 0}
          onClick={() => setIndex((current) => Math.max(0, current - 1))}>Previous check</button>
        <p>{index + 1} / {STEPS.length} // prepared samples</p>
        <button className="cic-action-button" type="button" aria-label="Next review step" disabled={index === STEPS.length - 1}
          onClick={() => setIndex((current) => Math.min(STEPS.length - 1, current + 1))}>Next check</button>
      </div>
    </main>
    <footer className="pc07-review__footer">PC10.1 prepared solo review // gameplay evidence is recorded separately.</footer>
  </div>;
}
