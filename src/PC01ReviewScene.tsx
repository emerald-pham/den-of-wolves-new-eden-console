import { useState } from 'react';
import EndeavourFieldUpgradeChoices from '@/components/EndeavourFieldUpgradeChoices';
import {
  EndeavourEcmDeviceView,
  type EndeavourEcmDevicePresentation,
} from '@/components/EndeavourEcmDeviceView';
import EndeavourResearchChoices from '@/components/EndeavourResearchChoices';
import ShipNavigationMap from '@/components/ShipNavigationMap';
import Starmap from '@/components/Starmap';
import {
  GmScoutRevealPanel,
  ScoutResultPanel,
  type PendingScoutRequestView,
  type ScoutDiscoveryNoteView,
  type ScoutReportView,
  type PrivateScoutResultView,
} from '@/components/ScoutResultPanels';
import type { EndeavourResearchFunding, EndeavourResearchWorkspace } from '@/lib/endeavourResearchService';
import type { EndeavourFieldUpgradeOption } from '@/lib/endeavourFieldUpgradeService';
import './PC01ReviewScene.css';

type ReviewPerspective = 'scientist' | 'gm' | 'second-ship';
type ScientistArea = 'research' | 'coordination' | 'ecm' | 'scout' | 'map';
type PurchaseScenario = 'available' | 'unavailable' | 'refreshed';

const INITIAL_RESEARCH: EndeavourResearchWorkspace = {
  status: 'ready',
  sessionId: 'pc01-sample-session',
  cycle: 3,
  researchRevision: 2,
  cadence: { cycle: 3, revision: 2, choices: [] },
  progress: { reactor: 1, 'jump-drive': 0 },
  tracks: [
    { trackId: 'reactor', name: 'Reactor', crossedBoxes: 1, totalBoxes: 5, currentMaterialCost: 8, complete: false },
    { trackId: 'jump-drive', name: 'Jump Drive', crossedBoxes: 0, totalBoxes: 5, currentMaterialCost: 14, complete: false },
  ],
  shepherdOre: 10,
  fieldUpgradeState: { upgradeRevision: 2, targetsUsedThisCycle: 0 },
};

const SAMPLE_REQUEST: PendingScoutRequestView = {
  requestId: 'pc01-sample-scout',
  cycle: 3,
  entitlementId: 'endeavour',
  anchorShipId: 'shepherd',
  targetCoordinate: '8378',
};

const SAMPLE_REPORT_ID = 'pc01-sample-scout';
const SAMPLE_NOTE_ID = 'pc01-sample-note';
const SAMPLE_FACT: PrivateScoutResultView['systemFact'] = {
  coordinate: '8378',
  code: 'O',
  title: 'Deep Nebula',
};

const GM_SYSTEMS = { 'system-17': '8378' };
const GM_SITES = {
  '8378': {
    code: 'O',
    name: 'Deep Nebula',
    candidate: false,
    summary: 'Synthetic chart site for the PC01 review scene.',
  },
};

const SHIP_SYSTEMS = {
  'system-01': '0000',
  'system-02': '5143',
  'system-17': '8378',
};

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

function nextResearchWorkspace(
  workspace: EndeavourResearchWorkspace,
  trackId: string,
  funding: EndeavourResearchFunding,
): EndeavourResearchWorkspace {
  const selected = workspace.tracks.find((track) => track.trackId === trackId);
  if (!selected || selected.complete || workspace.cadence.choices.some((choice) => choice.trackId === trackId)) {
    return workspace;
  }
  const crossedBoxes = selected.crossedBoxes + 1;
  return {
    ...workspace,
    researchRevision: workspace.researchRevision + 1,
    cadence: {
      ...workspace.cadence,
      revision: workspace.cadence.revision + 1,
      choices: [...workspace.cadence.choices, {
        trackId,
        funding,
        oreCost: funding === 'shepherd-ore' ? 5 : 0,
      }],
    },
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

function reportForState(resolved: boolean): ScoutReportView {
  return {
    requestId: SAMPLE_REPORT_ID,
    cycle: SAMPLE_REQUEST.cycle,
    entitlementId: 'endeavour',
    targetCoordinate: SAMPLE_REQUEST.targetCoordinate,
    status: resolved ? 'resolved' : 'pending',
    noteId: resolved ? SAMPLE_NOTE_ID : null,
  };
}

const SAMPLE_NOTE: ScoutDiscoveryNoteView = {
  type: 'player-discovery-note',
  id: SAMPLE_NOTE_ID,
  cycle: SAMPLE_REQUEST.cycle,
  targetCoordinate: SAMPLE_REQUEST.targetCoordinate,
  systemFact: SAMPLE_FACT,
  recordedAt: '2099-01-01T00:00:00.000Z',
};

export default function PC01ReviewScene() {
  const [perspective, setPerspective] = useState<ReviewPerspective>('scientist');
  const [scientistArea, setScientistArea] = useState<ScientistArea>('research');
  const [researchWorkspace, setResearchWorkspace] = useState(INITIAL_RESEARCH);
  const [selectedTrackId, setSelectedTrackId] = useState('reactor');
  const [researchNotice, setResearchNotice] = useState('');
  const [purchaseScenario, setPurchaseScenario] = useState<PurchaseScenario>('available');
  const [selectedUpgradeKeys, setSelectedUpgradeKeys] = useState<readonly string[]>([]);
  const [targetsUsed, setTargetsUsed] = useState(0);
  const [purchaseNotice, setPurchaseNotice] = useState('');
  const [purchaseError, setPurchaseError] = useState('');
  const [ecmState, setEcmState] = useState<EndeavourEcmDevicePresentation>({
    status: 'ready', groupId: 'fleet-1', pursuit: 8,
  });
  const [reportResolved, setReportResolved] = useState(false);
  const [gmSelectedCoordinate, setGmSelectedCoordinate] = useState(SAMPLE_REQUEST.targetCoordinate);
  const [gmFeedback, setGmFeedback] = useState('');

  const options = fieldUpgradeOptions(researchWorkspace);
  const purchaseAligned = purchaseScenario !== 'unavailable';
  const purchaseLimit = 2;
  const remainingPurchases = Math.max(0, purchaseLimit - targetsUsed);
  const purchaseDisabled = !purchaseAligned || selectedUpgradeKeys.length === 0 ||
    selectedUpgradeKeys.length > remainingPurchases || remainingPurchases === 0;
  const resolvedScoutResult: PrivateScoutResultView | null = reportResolved ? {
    type: 'private-scout-result',
    sessionId: 'pc01-sample-session',
    requestId: SAMPLE_REPORT_ID,
    requesterUid: 'sample-scientist',
    sourceId: 'endeavour',
    cycle: SAMPLE_REQUEST.cycle,
    targetCoordinate: SAMPLE_REQUEST.targetCoordinate,
    systemFact: SAMPLE_FACT,
  } : null;

  function chooseResearch(funding: EndeavourResearchFunding): void {
    setResearchWorkspace((current) => nextResearchWorkspace(current, selectedTrackId, funding));
    setResearchNotice('Sample research choice recorded. No live session was changed.');
  }

  function choosePurchaseScenario(scenario: PurchaseScenario): void {
    setPurchaseScenario(scenario);
    setPurchaseNotice('');
    setPurchaseError(scenario === 'unavailable'
      ? 'Sample purchase unavailable. Research pricing changed; refresh current Scientist state.'
      : '');
  }

  function refreshPurchaseSample(): void {
    setPurchaseScenario('refreshed');
    setPurchaseError('');
    setPurchaseNotice('Sample purchase state refreshed. No live session was queried.');
  }

  function updateUpgradeSelection(option: EndeavourFieldUpgradeOption, checked: boolean): void {
    const key = `${option.shipId}:${option.systemId}`;
    setSelectedUpgradeKeys((current) => checked
      ? [...new Set([...current, key])]
      : current.filter((candidate) => candidate !== key));
    setPurchaseNotice('');
    setPurchaseError('');
  }

  function purchaseSampleUpgrades(): void {
    if (purchaseDisabled) return;
    setTargetsUsed((current) => current + selectedUpgradeKeys.length);
    setSelectedUpgradeKeys([]);
    setPurchaseError('');
    setPurchaseNotice(`Sample purchase successful. Installed ${selectedUpgradeKeys.length} console${selectedUpgradeKeys.length === 1 ? '' : 's'}. No live session was changed.`);
  }

  function completeSampleEcm(): void {
    if (ecmState.status !== 'working') return;
    setEcmState({
      status: 'successful', groupId: ecmState.groupId,
      pursuitBefore: ecmState.pursuit, pursuitAfter: Math.max(0, ecmState.pursuit - 3),
    });
  }

  function markSampleEcmSpent(): void {
    if (ecmState.status !== 'successful') return;
    setEcmState({ ...ecmState, status: 'spent' });
  }

  function revealSampleScout(requestId: string): void {
    if (requestId !== SAMPLE_REPORT_ID || gmSelectedCoordinate !== SAMPLE_REQUEST.targetCoordinate) {
      setGmFeedback('Select the requested chart coordinate before revealing this sample report.');
      return;
    }
    setReportResolved(true);
    setGmFeedback('Sample report revealed. The private result is prepared for the Endeavour Scientist only.');
  }

  return (
    <div className="pc01-review">
      <a className="pc01-review__skip" href="#pc01-review-content">Skip to review scene</a>
      <header className="pc01-review__header">
        <div>
          <p className="cic-overline">Prepared playtest // PC01</p>
          <h1>PC01 // Shepherd science station</h1>
          <p>One sitting through research, upgrades, ECM, scouting, and ship map knowledge.</p>
        </div>
        <label className="pc01-review__perspective" htmlFor="pc01-review-perspective">
          <span>Review perspective</span>
          <select
            id="pc01-review-perspective"
            value={perspective}
            onChange={(event) => setPerspective(event.currentTarget.value as ReviewPerspective)}
          >
            <option value="scientist">Scientist // Endeavour</option>
            <option value="gm">Facilitator // GM</option>
            <option value="second-ship">Second ship // AEGIS</option>
          </select>
        </label>
      </header>

      <aside className="pc01-review__sample-banner" aria-label="Synthetic sample notice">
        <strong>SAMPLE ONLY</strong>
        <span>No live session is connected. Buttons change this page's sample state only; no session data is written.</span>
      </aside>

      {perspective === 'scientist' && <nav className="pc01-review__steps" aria-label="Scientist review areas">
        {([
          ['research', 'Team research'],
          ['coordination', 'Coordination upgrades'],
          ['ecm', 'ECM Device'],
          ['scout', 'Scout report'],
          ['map', 'My ship map'],
        ] as const).map(([area, label]) => <button
          key={area}
          className="cic-action-button"
          type="button"
          aria-pressed={scientistArea === area}
          onClick={() => setScientistArea(area)}
        >
          {label}
        </button>)}
      </nav>}

      <main id="pc01-review-content" className="pc01-review__content" tabIndex={-1}>
        {perspective === 'scientist' && <>
          <p className="pc01-review__view-label">Viewing as // Scientist at Endeavour</p>
          {scientistArea === 'research' && <section className="pc01-review__workspace" aria-labelledby="pc01-research-heading">
            <div className="pc01-review__intro">
              <p className="cic-overline">Team phase // sample state</p>
              <h2 id="pc01-research-heading">Endeavour research</h2>
              <p>Review current progress and the next field-upgrade price, then make one local sample choice.</p>
            </div>
            <EndeavourResearchChoices
              workspace={researchWorkspace}
              selectedTrackId={selectedTrackId}
              liveTeamPhase
              notice={researchNotice}
              onSelectTrack={setSelectedTrackId}
              onAdvance={chooseResearch}
              onRefresh={() => setResearchNotice('Sample Scientist research state refreshed.')}
            />
          </section>}

          {scientistArea === 'coordination' && <section className="pc01-review__workspace" aria-labelledby="pc01-upgrades-heading">
            <div className="pc01-review__intro">
              <p className="cic-overline">Coordination // sample purchase state</p>
              <h2 id="pc01-upgrades-heading">Endeavour field upgrades</h2>
              <p>Target options use the current research prices shown above. Sample actions update this page only.</p>
              <label className="pc01-review__scenario" htmlFor="pc01-field-upgrade-state">
                <span>Field-upgrade sample state</span>
                <select
                  id="pc01-field-upgrade-state"
                  value={purchaseScenario}
                  onChange={(event) => choosePurchaseScenario(event.currentTarget.value as PurchaseScenario)}
                >
                  <option value="available">Available purchase</option>
                  <option value="unavailable">Unavailable // research price changed</option>
                  <option value="refreshed" disabled>Refreshed sample state</option>
                </select>
              </label>
              <p>Cycle purchases: {targetsUsed} of {purchaseLimit} consoles used. Choose up to {remainingPurchases} more.</p>
              {purchaseNotice && <p role="status">{purchaseNotice}</p>}
              {purchaseError && <p role="alert">{purchaseError}</p>}
              {purchaseScenario === 'unavailable' && <p>
                The current price projection must be refreshed before a purchase can be reviewed.
              </p>}
            </div>
            <section className="console-workspace__section endeavour-field-upgrade-panel"
              aria-label="Endeavour field-upgrade purchase controls" aria-busy="false">
              <p className="console-workspace__eyebrow">Private Scientist workspace // sample only</p>
              <EndeavourFieldUpgradeChoices
                options={options}
                selectedKeys={selectedUpgradeKeys}
                remaining={remainingPurchases}
                showTargets={purchaseAligned}
                selectionDisabled={!purchaseAligned || remainingPurchases === 0}
                purchaseDisabled={purchaseDisabled}
                busy={false}
                purchaseLabel="Purchase sample upgrades"
                refreshLabel="Refresh sample Scientist state"
                onTargetChange={updateUpgradeSelection}
                onPurchase={purchaseSampleUpgrades}
                onRetryStale={() => undefined}
                onRetryExact={() => undefined}
                onRefresh={refreshPurchaseSample}
              />
            </section>
          </section>}

          {scientistArea === 'ecm' && <section className="pc01-review__workspace" aria-labelledby="pc01-ecm-heading">
            <div className="pc01-review__intro">
              <p className="cic-overline">Prepared sample // research complete</p>
              <h2 id="pc01-ecm-heading">Endeavour ECM Device</h2>
              <p>Use the device view, then finish the sample receipt and inspect the spent state. This is local-only.</p>
            </div>
            <EndeavourEcmDeviceView
              state={ecmState}
              {...(ecmState.status === 'ready' ? {
                onActivate: () => setEcmState({ status: 'working', groupId: 'fleet-1', pursuit: 8 }),
              } : {})}
              recentSuccess={{ pursuitBefore: 8, pursuitAfter: 5 }}
            />
            {ecmState.status === 'working' && <button className="cic-action-button" type="button"
              onClick={completeSampleEcm}>Complete sample ECM activation</button>}
            {ecmState.status === 'successful' && <button className="cic-action-button" type="button"
              onClick={markSampleEcmSpent}>Mark sample ECM device spent</button>}
          </section>}

          {scientistArea === 'scout' && <section className="pc01-review__workspace" aria-labelledby="pc01-scout-heading">
            <div className="pc01-review__intro">
              <p className="cic-overline">Endeavour // prepared request</p>
              <h2 id="pc01-scout-heading">Scout request and private result</h2>
              <p>Sample request {SAMPLE_REQUEST.targetCoordinate} is already pending review. Switch to GM to reveal it, then return here for the Scientist result and saved note.</p>
            </div>
            <ScoutResultPanel
              report={reportForState(reportResolved)}
              result={resolvedScoutResult}
              note={reportResolved ? SAMPLE_NOTE : null}
            />
          </section>}

          {scientistArea === 'map' && <section className="pc01-review__workspace" aria-labelledby="pc01-ship-map-heading">
            <div className="pc01-review__intro">
              <p className="cic-overline">Ship-owned projection // sample only</p>
              <h2 id="pc01-ship-map-heading">Endeavour ship map</h2>
              <p>After reveal, this ship knows the scanned coordinate. The chart site's private description remains with the facilitator.</p>
            </div>
            <ShipNavigationMap
              shipId="endeavour"
              shipName="ENDEAVOUR"
              currentCoordinate="5143"
              visitedCoordinates={['0000']}
              knownCoordinates={reportResolved ? ['0000', '5143', SAMPLE_REQUEST.targetCoordinate] : ['0000', '5143']}
              knownSystems={SHIP_SYSTEMS}
            />
          </section>}
        </>}

        {perspective === 'gm' && <section className="pc01-review__gm" aria-labelledby="pc01-gm-heading">
          <div className="pc01-review__intro">
            <p className="cic-overline">Facilitator // synthetic chart fixture</p>
            <h2 id="pc01-gm-heading">GM scout reveal</h2>
            <p>Select the sample chart coordinate, then reveal the queued Endeavour request. The chart fact is only mounted in this GM view.</p>
          </div>
          <div className="pc01-review__gm-grid">
            <section className="pc01-review__chart" aria-label="GM scout chart">
              <Starmap
                chart="A"
                selectedCoordinate={gmSelectedCoordinate}
                onSystemSelect={setGmSelectedCoordinate}
                knownSystems={GM_SYSTEMS}
                organiserSites={GM_SITES}
              />
            </section>
            <GmScoutRevealPanel
              requests={reportResolved ? [] : [SAMPLE_REQUEST]}
              onReveal={revealSampleScout}
              feedback={gmFeedback}
            />
          </div>
        </section>}

        {perspective === 'second-ship' && <section className="pc01-review__workspace" aria-labelledby="pc01-second-ship-heading">
          <div className="pc01-review__intro">
            <p className="cic-overline">Second ship // AEGIS</p>
            <h2 id="pc01-second-ship-heading">Ship-limited navigation view</h2>
            <p>AEGIS keeps its own fixes. Endeavour's scanned coordinate is absent from the map's accessible text and node data.</p>
          </div>
          <ShipNavigationMap
            shipId="aegis"
            shipName="AEGIS"
            currentCoordinate="5143"
            visitedCoordinates={['0000']}
            knownCoordinates={['0000', '5143']}
            knownSystems={SHIP_SYSTEMS}
          />
        </section>}
      </main>

      <footer className="pc01-review__footer">
        <p>Prepared UI review only // costs, rules, and server behavior are verified in separate gameplay tests.</p>
        <a className="cic-text-button" href="/">Return to console landing</a>
      </footer>
    </div>
  );
}
