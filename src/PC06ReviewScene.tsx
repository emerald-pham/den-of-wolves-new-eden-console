import { useState } from 'react';
import GorgoneionRepairDronesView from '@/components/GorgoneionRepairDronesView';
import FleetGroupPanel from '@/components/FleetGroupPanel';
import AwayMissionLifecyclePanel from '@/components/AwayMissionLifecyclePanel';
import JumpDriveConsole from '@/components/JumpDriveConsole';
import SmallShipJumpPanel, { type SmallShipJumpPanelProjection } from '@/components/SmallShipJumpPanel';
import SameTableTradePanel, {
  type SameTableTradeBalances,
  type SameTableTradePanelProps,
} from '@/components/SameTableTradePanel';
import {
  GmScoutRevealPanel,
  ScoutResultPanel,
  type PrivateScoutResultView,
  type ScoutDiscoveryNoteView,
  type ScoutReportView,
} from '@/components/ScoutResultPanels';
import Voyage33MovementPanel, { type Voyage33MovementHost } from '@/components/Voyage33MovementPanel';
import aegis from '@/data/vessels/aegis';
import './PC06ReviewScene.css';

type ReviewStep = 'movement' | 'cargo' | 'scouting' | 'mission';
type MovementSampleState = 'ready' | 'pending' | 'denied' | 'recovered';
type MissionSampleState = 'assignment-ready' | 'resolved';

const STEPS: readonly { readonly id: ReviewStep; readonly label: string; readonly title: string; readonly prompt: string }[] = [
  {
    id: 'movement',
    label: '1 Movement',
    title: 'Move a vessel and account for its host',
    prompt: 'Can I choose a legal host route, review small-craft charge and arrival, and recover from a stale origin while keeping every sample separate from production?',
  },
  {
    id: 'cargo',
    label: '2 Cargo and trade',
    title: 'Keep ship stores, craft cargo, and held tokens distinct',
    prompt: 'Can I tell which craft is docked or carrying cargo, and can I follow an exact same-table offer through the recipient’s choice?',
  },
  {
    id: 'scouting',
    label: '3 Scouting',
    title: 'Read a group-local scout report',
    prompt: 'Can I identify this group’s location, pursuit, message, and scout result without seeing another group’s private report?',
  },
  {
    id: 'mission',
    label: '4 Away mission',
    title: 'Follow one mission through recovery',
    prompt: 'Can I follow one group’s private cards and choices through critical or failed results, overrun, reward custody, drop-off, and reconnect?',
  },
];

const MOVEMENT_HOSTS: readonly Voyage33MovementHost[] = [
  { shipId: 'dione', name: 'Dione', coordinate: '0101', fuel: 8, status: 'operational' },
  { shipId: 'shepherd', name: 'Shepherd', coordinate: '0101', fuel: 5, status: 'damaged' },
];

const DESTINATIONS = [
  { coordinate: '0102', label: 'Pallas', length: 'short' as const },
  { coordinate: '0202', label: 'Ceres', length: 'long' as const },
];

const START_LOCATION = { coordinate: '0101', label: 'Tycho' };
const MOVEMENT_STATE_COPY: Readonly<Record<MovementSampleState, string>> = {
  ready: 'READY SAMPLE // controls update this page only.',
  pending: 'PENDING SAMPLE // a prepared pending view; no request was sent.',
  denied: 'DENIED SAMPLE // a prepared denial view; no server decision occurred.',
  recovered: 'RECOVERED SAMPLE // refreshed display values; no retry or command was issued.',
};

const SCOUT_REQUEST = {
  requestId: 'pc06-scout-fleet-2',
  cycle: 4,
  entitlementId: 'hummingbird' as const,
  anchorShipId: 'starlight',
  targetCoordinate: '6798',
};

const SCOUT_RESULT: PrivateScoutResultView = {
  type: 'private-scout-result',
  sessionId: 'pc06-review-sample',
  requestId: SCOUT_REQUEST.requestId,
  requesterUid: 'pc06-participant-1',
  sourceId: 'hummingbird',
  cycle: 4,
  targetCoordinate: '6798',
  systemFact: { coordinate: '6798', code: 'L', title: 'Prepared L-site sample' },
};

const SCOUT_NOTE: ScoutDiscoveryNoteView = {
  type: 'player-discovery-note',
  id: 'pc06-scout-note-fleet-2',
  cycle: 4,
  targetCoordinate: '6798',
  systemFact: SCOUT_RESULT.systemFact,
  recordedAt: 'prepared local sample',
};

const INITIAL_TRADE_BALANCES: SameTableTradeBalances = {
  ore: 2,
  fuel: 2,
  food: 2,
  water: 1,
  materials: 4,
  securityTeams: 1,
};

const SMALL_CRAFT_ROUTES = [
  { coordinate: '5143', length: 'short' as const, fuelCost: 1 },
  { coordinate: '1413', length: 'medium' as const, fuelCost: 1 },
  { coordinate: '6798', length: 'long' as const, fuelCost: 2 },
];

const SMALL_CRAFT_TEAM_SAMPLE: SmallShipJumpPanelProjection = {
  viewer: 'captain',
  smallShipId: 'gorgoneion',
  hostShipId: 'aegis',
  currentCoordinate: '0000',
  movementRevision: 2,
  dockingRevision: 3,
  currentTurn: 4,
  phase: 'team',
  cycleRevision: 8,
  cycleStep: 4,
  cycleTurn: 4,
  cycleCharges: ['missile-array'],
  charged: false,
  hostFuel: 5,
  knownDestinations: SMALL_CRAFT_ROUTES,
  arrivalCoordinates: ['0000'],
};

const SMALL_CRAFT_MOVEMENT_SAMPLE: SmallShipJumpPanelProjection = {
  ...SMALL_CRAFT_TEAM_SAMPLE,
  phase: 'coordination',
  cycleCharges: ['missile-array', 'jump-drive'],
  charged: true,
};

function currentStepIndex(step: ReviewStep): number {
  return STEPS.findIndex((candidate) => candidate.id === step);
}

function MovementReview() {
  const [sampleState, setSampleState] = useState<MovementSampleState>('ready');
  const [phase, setPhase] = useState<'team' | 'coordination' | 'other'>('team');
  const [location, setLocation] = useState(START_LOCATION);
  const [host, setHost] = useState<Voyage33MovementHost | null>(null);
  const [result, setResult] = useState(
    'LOCAL REVIEW ONLY // Docking and jump choices update this prepared page sample. No production movement occurred.',
  );

  const outcome = sampleState === 'pending'
    ? { status: 'pending' as const, message: 'Synthetic pending sample. No request was sent.' }
    : sampleState === 'denied'
      ? { status: 'denied' as const, message: 'Synthetic denial sample. No server decision occurred.' }
      : { status: 'idle' as const };

  function selectState(next: MovementSampleState): void {
    setSampleState(next);
    if (next === 'ready') {
      setPhase('team');
      setLocation(START_LOCATION);
      setHost(null);
      setResult('LOCAL REVIEW ONLY // Ready sample restored. No production movement occurred.');
    } else if (next === 'recovered') {
      setPhase('other');
      setLocation({ coordinate: '0102', label: 'Pallas' });
      setHost({ ...MOVEMENT_HOSTS[0]!, coordinate: '0102', fuel: 7 });
      setResult('LOCAL REVIEW ONLY // Recovered sample shows Pallas and 7 host fuel. No retry was issued.');
    } else {
      setResult(`LOCAL REVIEW ONLY // ${MOVEMENT_STATE_COPY[next]}`);
    }
  }

  function dock(hostShipId: string): void {
    if (sampleState !== 'ready') return;
    const selectedHost = MOVEMENT_HOSTS.find(({ shipId }) => shipId === hostShipId);
    if (!selectedHost) return;
    setHost({ ...selectedHost, coordinate: location.coordinate });
    setPhase('coordination');
    setResult(`LOCAL REVIEW ONLY // ${selectedHost.name} is assigned as the prepared host. No docking command was sent.`);
  }

  function jump(destination: string): void {
    if (sampleState !== 'ready' || !host) return;
    const selectedDestination = DESTINATIONS.find(({ coordinate }) => coordinate === destination);
    if (!selectedDestination) return;
    const fuelCost = selectedDestination.length === 'long' ? 2 : 1;
    setLocation({ coordinate: selectedDestination.coordinate, label: selectedDestination.label });
    setHost({ ...host, coordinate: selectedDestination.coordinate, fuel: Math.max(0, host.fuel - fuelCost) });
    setResult(
      `LOCAL REVIEW ONLY // Sample jump to ${selectedDestination.label} uses ${fuelCost} host fuel. No production movement occurred.`,
    );
  }

  const legalDestinations = host
    ? DESTINATIONS.filter(({ length }) => host.fuel >= (length === 'long' ? 2 : 1))
    : [];

  return (
    <section className="pc06-review__workspace" aria-label="Movement and host fuel sample">
      <div className="pc06-review__sample-controls" role="group" aria-label="Movement sample states">
        {(['ready', 'pending', 'denied', 'recovered'] as const).map((state) => (
          <button
            className="cic-action-button"
            type="button"
            key={state}
            aria-pressed={sampleState === state}
            onClick={() => selectState(state)}
          >
            {state === 'recovered' ? 'Recovered view' : `${state[0]!.toUpperCase()}${state.slice(1)} sample`}
          </button>
        ))}
      </div>
      <p className="pc06-review__note" role="status" aria-label="Movement sample state">
        {MOVEMENT_STATE_COPY[sampleState]}
      </p>
      <Voyage33MovementPanel
        admitted={sampleState !== 'denied'}
        // The panel enables its controls only for `live`; this synthetic value does
        // not represent an open facilitator connection.
        connection="live"
        phase={phase}
        currentLocation={location}
        host={host}
        dockableHosts={MOVEMENT_HOSTS.map(({ shipId, name }) => ({ shipId, name }))}
        legalDestinations={legalDestinations}
        outcome={outcome}
        onDock={dock}
        onJump={jump}
      />
      <section className="pc06-review__panel cic-frame" aria-label="Blind-jump presentation sample">
        <header className="pc06-review__panel-heading">
          <div><p className="cic-overline">FLEET SHIP // PRESENTATION PREVIEW</p><h3>Jump Drive and blind mode</h3></div>
          <p>COORDINATE LOCK // LOCAL CONTROLS</p>
        </header>
        <p className="pc06-review__note">
          The production Jump Drive controls let you inspect digit editing and hidden-destination copy. The launch button stays disabled.
        </p>
        <div className="pc06-review__drive">
          <JumpDriveConsole
            shipId={aegis.id}
            shipName={aegis.name}
            currentCoordinate="0101"
            fuel={aegis.resources.fuel}
            jumpCosts={[
              aegis.printedStatistics.jumpCosts.short,
              aegis.printedStatistics.jumpCosts.medium,
              aegis.printedStatistics.jumpCosts.long,
            ]}
            charged
            damaged={false}
            upgraded={false}
            consoleLocked
            presentationOnly
          />
        </div>
      </section>
      <p className="pc06-review__result" role="status" aria-label="Movement sample result">{result}</p>
      <p className="pc06-review__note">
        Voyage 33-0 is a movement-panel example. Its LIVE link label is a synthetic control-enabling value; no facilitator connection is open. The listed host, fuel, and locations are synthetic, and local controls do not submit a jump.
      </p>
      <SmallCraftJumpReview />
    </section>
  );
}

type SmallCraftReviewState = 'team' | 'ready' | 'arrived' | 'stale' | 'recovered';

function SmallCraftJumpReview() {
  const [sampleState, setSampleState] = useState<SmallCraftReviewState>('team');
  const [projection, setProjection] = useState(SMALL_CRAFT_TEAM_SAMPLE);
  const [selectedDestination, setSelectedDestination] = useState('');
  const [result, setResult] = useState(
    'TEAM PHASE SAMPLE // Charge is available for the prepared cycle. Every control here is local-only.',
  );

  function showTeamSample(): void {
    setSampleState('team');
    setProjection({ ...SMALL_CRAFT_TEAM_SAMPLE, cycleCharges: [...(SMALL_CRAFT_TEAM_SAMPLE.cycleCharges ?? [])] });
    setSelectedDestination('');
    setResult('TEAM PHASE SAMPLE // Charge is available for the prepared cycle. Every control here is local-only.');
  }

  function showMovementSample(): void {
    setSampleState('ready');
    setProjection({ ...SMALL_CRAFT_MOVEMENT_SAMPLE, cycleCharges: [...(SMALL_CRAFT_MOVEMENT_SAMPLE.cycleCharges ?? [])] });
    setSelectedDestination('');
    setResult('MOVEMENT READY SAMPLE // The prepared Jump Drive is charged; choose a known route.');
  }

  function showStaleOriginSample(): void {
    setSampleState('stale');
    setProjection({ ...SMALL_CRAFT_MOVEMENT_SAMPLE, cycleCharges: [...(SMALL_CRAFT_MOVEMENT_SAMPLE.cycleCharges ?? [])] });
    setSelectedDestination('');
    setResult('STALE-ORIGIN SAMPLE // This prepared origin is old. Execute once to inspect refresh guidance; no command is sent.');
  }

  function chargeLocally(): void {
    if (sampleState !== 'team') return;
    setProjection((current) => ({
      ...current,
      phase: 'coordination',
      cycleCharges: [...(current.cycleCharges ?? []), 'jump-drive'],
      charged: true,
    }));
    setSampleState('ready');
    setResult('LOCAL SIMULATION // Charge ready for the movement sample. No production charge occurred.');
  }

  function jumpLocally(): void {
    const route = projection.knownDestinations?.find(({ coordinate }) => coordinate === selectedDestination);
    if (!route || projection.hostShipId === null || projection.currentCoordinate === null) return;
    if (sampleState === 'stale') {
      setResult('STALE-ORIGIN SAMPLE // The prepared origin changed before departure. Refresh the movement projection before choosing another route.');
      return;
    }
    if ((sampleState !== 'ready' && sampleState !== 'recovered') || (projection.hostFuel ?? -1) < route.fuelCost) return;
    setProjection((current) => ({
      ...current,
      hostShipId: null,
      hostFuel: null,
      currentCoordinate: route.coordinate,
      movementRevision: current.movementRevision + 1,
      dockingRevision: current.dockingRevision + 1,
      knownDestinations: [],
      arrivalCoordinates: [...(current.arrivalCoordinates ?? []), route.coordinate],
    }));
    setSampleState('arrived');
    const remainingHostFuel = (projection.hostFuel ?? 0) - route.fuelCost;
    setResult(`LOCAL SIMULATION // Spent ${route.fuelCost} host fuel; ${remainingHostFuel} remains on Aegis in this sample. Private arrival knowledge now includes ${route.coordinate}. The craft is detached. No production jump or fuel change occurred.`);
  }

  function refreshLocally(): void {
    if (sampleState === 'stale') {
      setProjection({
        ...SMALL_CRAFT_MOVEMENT_SAMPLE,
        currentCoordinate: '0101',
        movementRevision: 3,
        dockingRevision: 4,
        hostFuel: 4,
        cycleCharges: [...(SMALL_CRAFT_MOVEMENT_SAMPLE.cycleCharges ?? [])],
      });
      setSampleState('recovered');
      setSelectedDestination('');
      setResult('RECOVERED SAMPLE // The prepared current origin is 0101. No retry was issued.');
      return;
    }
    setResult('LOCAL REVIEW ONLY // Prepared movement sample refreshed locally. No server read was requested.');
  }

  return (
    <section className="pc06-review__workspace" aria-label="Small-craft Jump Drive review sample">
      <div className="pc06-review__sample-controls" role="group" aria-label="Small-craft Jump Drive sample states">
        <button className="cic-action-button" type="button" aria-pressed={sampleState === 'team'} onClick={showTeamSample}>
          Team / charge sample
        </button>
        <button className="cic-action-button" type="button" aria-pressed={sampleState === 'ready' || sampleState === 'recovered'} onClick={showMovementSample}>
          Movement ready sample
        </button>
        <button className="cic-action-button" type="button" aria-pressed={sampleState === 'stale'} onClick={showStaleOriginSample}>
          Stale-origin sample
        </button>
        <button className="cic-action-button" type="button" aria-pressed={sampleState === 'arrived'} onClick={showTeamSample}>
          Reset jump sample
        </button>
      </div>
      <p className="pc06-review__note" role="status" aria-label="Small-craft Jump Drive sample state">
        {sampleState === 'team' ? 'TEAM PHASE // synthetic charge-ready state.'
          : sampleState === 'ready' ? 'COORDINATION // synthetic charged movement-ready state.'
            : sampleState === 'arrived' ? 'ARRIVAL // synthetic detached craft and private Captain knowledge.'
              : sampleState === 'stale' ? 'STALE ORIGIN // synthetic revision conflict awaiting local refresh.'
                : 'RECOVERED VIEW // refreshed prepared values; no action was retried.'}
      </p>
      <SmallShipJumpPanel
        smallShipId="gorgoneion"
        projection={projection}
        accessibleName="Small-craft Jump Drive panel"
        authorityLabel="synthetic local sample"
        resultStatusLabel="Small-craft Jump Drive sample result"
        loading={false}
        busy={false}
        selectedDestination={selectedDestination}
        resultMessage={result}
        onDestinationChange={setSelectedDestination}
        onCharge={chargeLocally}
        onRetryCharge={() => setResult('LOCAL REVIEW ONLY // No pending charge request exists in this sample.')}
        onJump={jumpLocally}
        onRetryJump={() => setResult('LOCAL REVIEW ONLY // No request was issued, so nothing can be retried.')}
        onRefresh={refreshLocally}
      />
      <p className="pc06-review__note">
        This is a local simulation of the real Captain panel. Its injected callbacks only change prepared sample values; it imports no production movement action and makes no callable or Firestore request. Arrival knowledge shown above is illustrative, not multiplayer proof.
      </p>
    </section>
  );
}

function CargoAndTradeReview() {
  const [cargo, setCargo] = useState({ shipFood: 3, craftFood: 0, revision: 4 });
  const [cargoMessage, setCargoMessage] = useState(
    'PREPARED CARGO // Ship stores and craft cargo start as separate local sample values.',
  );
  const [balances, setBalances] = useState(INITIAL_TRADE_BALANCES);
  const [incomingOffers, setIncomingOffers] = useState<SameTableTradePanelProps['incomingOffers']>([
    { id: 'pc06-incoming-fuel', participantName: 'Juno Reyes', amounts: { fuel: 1 } },
  ]);
  const [outgoingOffers, setOutgoingOffers] = useState<SameTableTradePanelProps['outgoingOffers']>([]);
  const [tradeMessage, setTradeMessage] = useState('LOCAL REVIEW ONLY // Incoming and outgoing offers use prepared participant data.');

  function loadFood(): void {
    if (cargo.shipFood < 1) return;
    setCargo((current) => ({
      shipFood: current.shipFood - 1,
      craftFood: current.craftFood + 1,
      revision: current.revision + 1,
    }));
    setCargoMessage('LOCAL SIMULATION // One food moved to the craft sample. No production cargo transfer occurred.');
  }

  function restoreCargo(): void {
    setCargo({ shipFood: 3, craftFood: 0, revision: 4 });
    setCargoMessage('LOCAL REVIEW ONLY // Prepared cargo values restored. No server refresh was requested.');
  }

  function acceptOffer(offerId: string): void {
    const offer = incomingOffers.find(({ id }) => id === offerId);
    if (!offer) return;
    setBalances((current) => ({
      ...current,
      fuel: current.fuel + (offer.amounts.fuel ?? 0),
      ore: current.ore + (offer.amounts.ore ?? 0),
      food: current.food + (offer.amounts.food ?? 0),
      water: current.water + (offer.amounts.water ?? 0),
      materials: current.materials + (offer.amounts.materials ?? 0),
      securityTeams: current.securityTeams + (offer.amounts.securityTeams ?? 0),
    }));
    setIncomingOffers((current) => current.filter(({ id }) => id !== offerId));
    setTradeMessage('LOCAL REVIEW ONLY // The sample recipient accepted this exact offer. No live transfer occurred.');
  }

  function createOffer(request: Parameters<SameTableTradePanelProps['onCreateOffer']>[0]): void {
    const recipient = COUNTERPARTIES.find(({ id }) => id === request.recipientId);
    if (!recipient) return;
    setOutgoingOffers((current) => [
      ...current,
      {
        id: `pc06-local-offer-${current.length + 1}`,
        participantName: recipient.name,
        amounts: request.amounts,
        statusLabel: 'LOCAL SAMPLE ONLY // NOT SENT',
      },
    ]);
    setTradeMessage(`LOCAL REVIEW ONLY // Offer prepared for ${recipient.name}; held counts did not change.`);
  }

  return (
    <section className="pc06-review__trade-layout" aria-label="Cargo and same-table trade sample">
      <RepairDronesReview />
      <section className="pc06-review__panel cic-frame" aria-label="Small-craft cargo sample">
        <header className="pc06-review__panel-heading">
          <div><p className="cic-overline">CRAFT MANIFEST // LOCAL SAMPLE</p><h3>Capybara cargo</h3></div>
          <p>SHIP STORES REMAIN SEPARATE</p>
        </header>
        <dl className="pc06-review__readouts">
          <div><dt>Shepherd ship stores</dt><dd>Food {cargo.shipFood}</dd></div>
          <div><dt>Capybara cargo</dt><dd>Food {cargo.craftFood}</dd></div>
          <div><dt>Prepared cargo revision</dt><dd>{cargo.revision}</dd></div>
        </dl>
        <div className="pc06-review__sample-controls">
          <button className="cic-action-button" type="button" onClick={loadFood} disabled={cargo.shipFood < 1}>
            Load 1 food onto Capybara
          </button>
          <button className="cic-action-button" type="button" onClick={restoreCargo}>Restore prepared cargo values</button>
        </div>
        <p className="pc06-review__result" role="status">{cargoMessage}</p>
      </section>

      <section className="pc06-review__trade-panel" aria-label="Same-table trade sample">
        <p className="pc06-review__note">
          Personal held tokens use the production trade panel; the separate cargo readout above represents ship-to-craft inventory.
        </p>
        <SameTableTradePanel
          currentPlayerName="Captain Vale"
          balances={balances}
          counterparties={COUNTERPARTIES}
          incomingOffers={incomingOffers}
          outgoingOffers={outgoingOffers}
          statusMessage={tradeMessage}
          onCreateOffer={createOffer}
          onAcceptOffer={acceptOffer}
        />
        <p className="pc06-review__note">
          The callbacks change this browser page’s sample state only. No player inventory, ship store, or server record is changed.
        </p>
      </section>
    </section>
  );
}

function RepairDronesReview() {
  const [systemId, setSystemId] = useState('');
  const [repaired, setRepaired] = useState(false);
  const [stale, setStale] = useState(false);
  const [result, setResult] = useState('LOCAL SAMPLE // A charged Gorgoneion is docked at Aegis with 6 materials and one damaged Jump Drive.');
  return <section className="pc06-review__panel cic-frame" aria-label="Repair Drones review sample">
    <p className="pc06-review__note">The production repair presentation uses only sample values and local callbacks here. It opens no session or production action.</p>
    <GorgoneionRepairDronesView hostName="Aegis" hostDescription="Aegis"
      materials={repaired ? 3 : 6} isCaptain hostIsActive maintenanceReady coordinationOpen
      usedThisCycle={repaired} hostDestroyed={false} repairHistoryValid={!stale}
      eligibleSystems={repaired ? [] : [{ id: 'jump-drive', name: 'Jump Drive' }]}
      systemId={systemId} selectedName={systemId ? 'Jump Drive' : ''} pending={false}
      submitDisabled={repaired || stale || systemId !== 'jump-drive'} submitLabel="Repair one console"
      onChooseSystem={setSystemId} onSubmit={() => {
        if (repaired || stale || systemId !== 'jump-drive') return;
        setRepaired(true); setSystemId('');
        setResult('LOCAL SIMULATION // Jump Drive repaired; 3 materials remain. No production repair occurred.');
      }} />
    <div className="pc06-review__sample-controls">
      <button type="button" className="cic-action-button" onClick={() => {
        setRepaired(false); setStale(true); setSystemId('');
        setResult('COMPETING REPAIR SAMPLE // The host damage changed. Refresh before selecting a console.');
      }}>Competing repair sample</button>
      <button type="button" className="cic-action-button" disabled={!stale} onClick={() => {
        setStale(false); setRepaired(true); setSystemId('');
        setResult('LOCAL REFRESHED SAMPLE // This console was already repaired; 3 host materials remain.');
      }}>Refresh repair sample</button>
      <button type="button" className="cic-action-button" onClick={() => {
        setStale(false); setRepaired(false); setSystemId('');
        setResult('LOCAL SAMPLE RESTORED // No production state changed.');
      }}>Restore repair sample</button>
    </div>
    <p className="pc06-review__result" role="status" aria-label="Repair sample result">{result}</p>
  </section>;
}

const COUNTERPARTIES = [
  { id: 'juno-reyes', name: 'Juno Reyes' },
  { id: 'mara-chen', name: 'Mara Chen' },
] as const;

function ScoutingReview() {
  const [groupDraft, setGroupDraft] = useState('');
  const [groupNotes, setGroupNotes] = useState<readonly { id: string; actorUid: string; text: string; sentAt: string }[]>([]);
  const [resolved, setResolved] = useState(false);
  const [feedback, setFeedback] = useState('');
  const report: ScoutReportView = {
    requestId: SCOUT_REQUEST.requestId,
    cycle: SCOUT_REQUEST.cycle,
    entitlementId: SCOUT_REQUEST.entitlementId,
    targetCoordinate: SCOUT_REQUEST.targetCoordinate,
    status: resolved ? 'resolved' : 'pending',
    noteId: resolved ? SCOUT_NOTE.id : null,
  };

  return (
    <section className="pc06-review__workspace" aria-label="Group-local scouting sample">
      <dl className="pc06-review__readouts pc06-review__readouts--group">
        <div><dt>Fleet group</dt><dd>Fleet-2 // synthetic viewer</dd></div>
        <div><dt>Location</dt><dd>Chart B // 6798</dd></div>
        <div><dt>Pursuit</dt><dd>4 // prepared sample</dd></div>
        <div><dt>Group message</dt><dd>FLEET-2 // HOLD POSITION FOR SCOUT RESULT</dd></div>
      </dl>
      <div className="pc06-review__mission-layout">
        <GmScoutRevealPanel
          requests={resolved ? [] : [SCOUT_REQUEST]}
          onReveal={() => {
            setResolved(true);
            setFeedback('LOCAL REVIEW ONLY // Revealed the prepared Fleet-2 sample. No callable was invoked.');
          }}
          feedback={feedback}
        />
        <div className="pc06-review__scout-participant">
          <p className="pc06-review__note">Fleet-2 participant view // only its prepared result is supplied here.</p>
          <ScoutResultPanel report={report} result={resolved ? SCOUT_RESULT : null} note={resolved ? SCOUT_NOTE : null} />
        </div>
      </div>
      <FleetGroupPanel groupId="fleet-2" actorUid="pc06-participant-1" notes={groupNotes} draft={groupDraft} busy={false}
        notice="LOCAL REVIEW ONLY // Group notes update this prepared sample; no message is sent to a live session."
        onDraft={setGroupDraft} onSend={() => {
          setGroupNotes(notes => [...notes, { id: `sample-${notes.length}`, actorUid: 'pc06-participant-1',
            text: groupDraft.trim(), sentAt: '2026-09-30T12:00:00Z' }]); setGroupDraft('');
        }} onRefresh={() => undefined} />
      <section className="pc06-review__panel cic-frame" aria-label="Fleet 1 sample view">
        <header className="pc06-review__panel-heading">
          <div><p className="cic-overline">SEPARATE GROUP SAMPLE</p><h3>Fleet-1 projection</h3></div>
          <p>NO FLEET-2 RESULT LOADED</p>
        </header>
        <p>Fleet-1 // Chart A // 3145 // pursuit 1</p>
        <p>No Fleet-2 scout result is included in this sample view.</p>
      </section>
      <p className="pc06-review__result" role="status" aria-label="Scout sample state">
        {resolved
          ? 'LOCAL REVIEW ONLY // Group-local view illustration. It does not invoke a callable and is not a privacy proof.'
          : 'PENDING SAMPLE // The listed reveal button changes only the prepared local view.'}
      </p>
    </section>
  );
}

function AwayMissionReview() {
  const [sampleState, setSampleState] = useState<MissionSampleState>('assignment-ready');
  const [message, setMessage] = useState(
    'LOCAL REVIEW ONLY // Assignments and the prepared resolution below update this page only.',
  );
  const [recovered, setRecovered] = useState(false);
  const [droppedOffShipId, setDroppedOffShipId] = useState<string | null>(null);
  const isResolved = sampleState === 'resolved';
  const missionId = 'mission-pc06-fleet-2';
  const actorUid = 'pc06-participant-1';
  const publicState = {
    missionId,
    groupId: 'fleet-2',
    siteCode: '6798 // L',
    revision: isResolved ? 6 : 5,
    phase: isResolved ? 'resolved' : 'assignment-ready',
    status: isResolved ? 'resolved' as const : 'active' as const,
    overrun: isResolved,
    missionLeaderUid: actorUid,
    participantCount: 2,
    opportunities: [
      { id: 'explore', label: 'Explore the marked location' },
      { id: 'recover', label: 'Recover mission supplies' },
    ],
    requestCounts: [],
    outcomes: isResolved
      ? [
        { opportunityId: 'explore', total: 17, outcome: 'critical-success' },
        { opportunityId: 'recover', total: 0, outcome: 'failure' },
      ]
      : null,
    rewards: isResolved
      ? [
        { opportunityId: 'explore', resources: { materials: 2 } },
        { opportunityId: 'recover', resources: {} },
      ]
      : null,
    specialRewards: null,
    custody: {
      status: droppedOffShipId ? 'with-ship' : 'with-leader',
      holderUid: actorUid,
      shipId: droppedOffShipId,
    },
    legalDropOffShipIds: droppedOffShipId ? [] : ['aegis', 'shepherd'],
  };
  const privateState = {
    missionId,
    participantUid: actorUid,
    revision: isResolved ? 6 : 5,
    phase: isResolved ? 'resolved' : 'assignment-ready',
    cards: [
      { id: 'A♥', value: 10, status: isResolved ? 'assigned' as const : 'remaining' as const, opportunityId: isResolved ? 'explore' : null },
      { id: '4♣', value: 4, status: isResolved ? 'assigned' as const : 'remaining' as const, opportunityId: isResolved ? 'recover' : null },
    ],
  };
  const actions = {
    requestExtraCards: async () => undefined,
    distributeExtraCard: async () => undefined,
    openDiscards: async () => undefined,
    discardCard: async () => undefined,
    assignCards: async () => {
      setSampleState('resolved');
      setMessage('LOCAL REVIEW ONLY // Prepared assignments now show a synthetic result. No mission result was written.');
    },
    addFacilitatorCards: async () => undefined,
    resolve: async () => undefined,
    dropOff: async (shipId: string) => {
      setDroppedOffShipId(shipId);
      setMessage(`LOCAL REVIEW ONLY // Rewards shown at ${shipId.toUpperCase()} in the sample. No mission result was written.`);
    },
  };

  function restoreAssignmentSample(): void {
    setSampleState('assignment-ready');
    setRecovered(false);
    setDroppedOffShipId(null);
    setMessage('LOCAL REVIEW ONLY // Assignment sample restored. No server refresh was requested.');
  }

  return (
    <section className="pc06-review__workspace" aria-label="Away mission sample path">
      <dl className="pc06-review__readouts pc06-review__readouts--group">
        <div><dt>Fleet group</dt><dd>Fleet-2 // mission leader view</dd></div>
        <div><dt>Mission location</dt><dd>Chart B // 6798 // newly reached sample</dd></div>
        <div><dt>Participants</dt><dd>2 // this participant’s private hand only</dd></div>
        <div><dt>Mission custody</dt><dd>
          {droppedOffShipId
            ? `Rewards shown at ${droppedOffShipId.toUpperCase()} // local sample`
            : isResolved ? 'Mission Leader // rewards awaiting drop-off' : 'Mission Leader // assignments in progress'}
        </dd></div>
      </dl>
      <div className="pc06-review__sample-controls" role="group" aria-label="Away mission sample states">
        <button className="cic-action-button" type="button" aria-pressed={!isResolved} onClick={restoreAssignmentSample}>
          Assignment view
        </button>
        <button
          className="cic-action-button"
          type="button"
          aria-pressed={isResolved}
          onClick={() => {
            setSampleState('resolved');
            setMessage('LOCAL REVIEW ONLY // Prepared critical and failed outcomes are displayed. No result was written.');
          }}
        >
          Resolved view
        </button>
        <button
          className="cic-action-button"
          type="button"
          aria-pressed={recovered}
          onClick={() => {
            setRecovered(true);
            setMessage('LOCAL REVIEW ONLY // Reconnected view uses the current prepared revision and does not replay an action.');
          }}
        >
          Reconnect sample
        </button>
      </div>
      <div className="pc06-review__mission-surface">
        <AwayMissionLifecyclePanel
          actorUid={actorUid}
          isGm={false}
          isMissionLeader
          publicState={publicState}
          privateState={privateState}
          actions={actions}
        />
      </div>
      <p className="pc06-review__result" role="status" aria-label="Mission sample result">{message}</p>
      <p className="pc06-review__result" role="status" aria-label="Mission recovery sample">
        {recovered
          ? 'RECOVERED SAMPLE // revision shown above; no command was retried.'
          : `RECONNECT PREVIEW // current synthetic mission revision ${publicState.revision}.`}
      </p>
      <p className="pc06-review__note">
        The participant panel receives one sample hand for Fleet-2 only. This presentation does not demonstrate server privacy, mission resolution, or multiplayer recovery.
      </p>
    </section>
  );
}

export default function PC06ReviewScene() {
  const [step, setStep] = useState<ReviewStep>('movement');
  const selected = STEPS.find((candidate) => candidate.id === step) ?? STEPS[0]!;
  const stepIndex = currentStepIndex(step);

  function moveStep(offset: -1 | 1): void {
    const next = Math.min(STEPS.length - 1, Math.max(0, stepIndex + offset));
    setStep(STEPS[next]!.id);
  }

  return (
    <div className="pc06-review">
      <a className="pc06-review__skip" href="#pc06-review-content">Skip to review step</a>
      <header className="pc06-review__header">
        <div>
          <p>DEN OF WOLVES // NEW EDEN CONSOLE</p>
          <h1>PC06 // Vessel movement and away mission review</h1>
        </div>
        <div className="pc06-review__header-meta">
          <p>SINGLE SITTING // SYNTHETIC REVIEW</p>
          <a className="cic-text-button" href="/#/">Return to New Eden Console</a>
        </div>
      </header>
      <aside className="pc06-review__sample-banner" role="note" aria-label="Synthetic review boundary">
        Local-only simulation // controls update this page’s prepared sample state. No live session, callable, or Firestore write is used. This scene is not multiplayer proof.
      </aside>
      <nav className="pc06-review__steps" aria-label="PC06 review steps">
        {STEPS.map((candidate) => (
          <button
            className="cic-action-button"
            type="button"
            key={candidate.id}
            aria-pressed={step === candidate.id}
            aria-controls="pc06-review-content"
            onClick={() => setStep(candidate.id)}
          >
            {candidate.label}
          </button>
        ))}
      </nav>
      <main id="pc06-review-content" className="pc06-review__content" tabIndex={-1}>
        <section className="pc06-review__intro cic-frame" aria-label="Current owner check" aria-live="polite">
          <p className="cic-overline">OWNER CHECK // {selected.label.toUpperCase()}</p>
          <h2>{selected.title}</h2>
          <p>{selected.prompt}</p>
        </section>
        {step === 'movement' ? <MovementReview />
          : step === 'cargo' ? <CargoAndTradeReview />
            : step === 'scouting' ? <ScoutingReview />
              : <AwayMissionReview />}
        <nav className="pc06-review__step-controls" aria-label="Review navigation">
          <button className="cic-action-button" type="button" onClick={() => moveStep(-1)} disabled={stepIndex === 0}>
            Previous review step
          </button>
          <p>{stepIndex + 1} OF {STEPS.length} // ONE-SITTING OWNER CHECK</p>
          <button className="cic-action-button" type="button" onClick={() => moveStep(1)} disabled={stepIndex === STEPS.length - 1}>
            Next review step
          </button>
        </nav>
      </main>
      <footer className="pc06-review__footer">
        <span>PC06 PREPARED CHECKPOINT</span>
        <span>NO LIVE COMMANDS // NO MULTIPLAYER PROOF</span>
      </footer>
    </div>
  );
}
