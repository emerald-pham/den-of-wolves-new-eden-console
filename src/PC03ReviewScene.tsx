import { useState, type ComponentProps, type ComponentType } from 'react';
import { MemoryRouter } from 'react-router-dom';
import FleetRoleConsoleTemplate from '@/components/FleetRoleConsoleTemplate';
import JumpDriveConsole from '@/components/JumpDriveConsole';
import ResourceIcon from '@/components/ResourceIcon';
import ShipNavigationWorkspace from '@/components/ShipNavigationWorkspace';
import ShuttleConsoleTemplate from '@/components/ShuttleConsoleTemplate';
import { RESOURCE_DEFINITIONS } from '@/data/resources';
import aegis from '@/data/vessels/aegis';
import blackSheep from '@/data/vessels/black-sheep';
import philia from '@/data/vessels/philia';
import type { ShipNavigationLogEntry } from '@/types/game';
import './PC03ReviewScene.css';

type JumpDrivePresentationProps = ComponentProps<typeof JumpDriveConsole> & { readonly presentationOnly: true };
const JumpDrivePresentation = JumpDriveConsole as ComponentType<JumpDrivePresentationProps>;

type ShuttlePreviewOperation = {
  readonly actionLabel: string;
  readonly status: 'pending' | 'stale' | 'committed' | 'unavailable';
  readonly message: string;
};
type ShuttlePreviewSnapshot = {
  readonly holderLabel: string;
  readonly locationLabel: string;
  readonly movement: ShuttlePreviewOperation;
  readonly cargo?: ShuttlePreviewOperation;
  readonly service?: ShuttlePreviewOperation;
};
type ShuttleTemplatePreviewProps = ComponentProps<typeof ShuttleConsoleTemplate> & { readonly controlPreview: ShuttlePreviewSnapshot };
const ShuttleTemplatePreview = ShuttleConsoleTemplate as ComponentType<ShuttleTemplatePreviewProps>;

type Step = 'chart' | 'drive' | 'shuttle' | 'stores' | 'recovery';
type StationPage = 'systems' | 'navigation';
type DriveState = 'ready' | 'uncharged' | 'fuel-starved' | 'damaged' | 'integrity-locked' | 'pending' | 'committed' | 'stale';
type ShuttleState = 'docked' | 'departing' | 'transit' | 'retargeted' | 'airspace-closed' | 'arrived';
type StoresState = 'stocked' | 'depleted';
type ServiceState = 'ready' | 'undocked' | 'used' | 'wrong-phase' | 'pending' | 'committed';
type CargoState = 'available' | 'empty' | 'pending' | 'committed' | 'stale';

const STEPS: readonly { readonly id: Step; readonly label: string; readonly intro: string }[] = [
  { id: 'chart', label: 'Chart and return', intro: 'Start at the assigned Admiral station, open Navigation, read the ship fix and log, then return through Systems to the fleet board.' },
  { id: 'drive', label: 'Jump Drive', intro: 'Compare prepared readiness, pending, result, and stale states. Edit and lock sample coordinates locally; launch remains disabled.' },
  { id: 'shuttle', label: 'Shuttle route', intro: 'Follow a prepared service shuttle through docking, departure, retargeting, airspace, transit, and arrival.' },
  { id: 'stores', label: 'Stores and service', intro: 'Keep ship stores, shuttle cargo, repair, and recharge status distinct while reviewing prepared outcomes.' },
  { id: 'recovery', label: 'Reconnect', intro: 'Compare cached and recovered sample views, then confirm the scene never repeats a prepared action.' },
];

const SAMPLE_CURRENT_COORDINATE = '5143';
const SAMPLE_KNOWN_COORDINATES = ['0000', SAMPLE_CURRENT_COORDINATE] as const;
const SAMPLE_KNOWN_SYSTEMS = { 'system-01': '0000', 'system-02': SAMPLE_CURRENT_COORDINATE } as const;
const SAMPLE_NAVIGATION_LOG: readonly ShipNavigationLogEntry[] = [{
  id: 'pc03-sample-navigation',
  shipId: 'aegis',
  type: 'self-jump',
  origin: '0000',
  destination: SAMPLE_CURRENT_COORDINATE,
  occurredAt: '2026-09-28T12:00:00.000Z',
  stardate: '2026.271.120000',
}];

const DRIVE_STATES: readonly { readonly id: DriveState; readonly label: string; readonly readout: string }[] = [
  { id: 'ready', label: 'Ready', readout: 'PREPARED // DRIVE READY // NO LIVE DEPARTURE' },
  { id: 'uncharged', label: 'Not charged', readout: 'BLOCKED SAMPLE // DRIVE NOT CHARGED' },
  { id: 'fuel-starved', label: 'Fuel starved', readout: 'BLOCKED SAMPLE // INSUFFICIENT DISPLAYED FUEL FOR THIS PREPARED ATTEMPT' },
  { id: 'damaged', label: 'Damaged', readout: 'BLOCKED SAMPLE // DRIVE DAMAGED' },
  { id: 'integrity-locked', label: 'Integrity locked', readout: 'BLOCKED SAMPLE // DRIVE INTEGRITY LOCKED' },
  { id: 'pending', label: 'Pending', readout: 'PENDING SAMPLE // WAIT FOR A RESULT' },
  { id: 'committed', label: 'Committed', readout: 'COMMITTED SAMPLE RESULT // READ BEFORE ANY RETRY' },
  { id: 'stale', label: 'Stale reply', readout: 'STALE SAMPLE // REFRESH THE SAMPLE BEFORE RETRY' },
];

const SHUTTLE_STATES: readonly { readonly id: ShuttleState; readonly label: string; readonly readout: string; readonly host: string; readonly destination: string }[] = [
  { id: 'docked', label: 'Docked', readout: 'DOCKED SAMPLE // CURRENT HOST SHEPHERD', host: 'shepherd', destination: 'Shepherd' },
  { id: 'departing', label: 'Departing', readout: 'PENDING SAMPLE // DEPARTURE VIEW ONLY', host: 'shepherd', destination: 'AEGIS' },
  { id: 'transit', label: 'In transit', readout: 'IN TRANSIT SAMPLE // DESTINATION AEGIS', host: '', destination: 'AEGIS' },
  { id: 'retargeted', label: 'Retargeted', readout: 'RETARGETED SAMPLE // CURRENT DESTINATION AEGIS', host: '', destination: 'AEGIS' },
  { id: 'airspace-closed', label: 'Airspace closed', readout: 'BLOCKED SAMPLE // AIRSPACE CLOSED // NO DEPARTURE SENT', host: 'shepherd', destination: 'Shepherd' },
  { id: 'arrived', label: 'Arrived', readout: 'ARRIVAL SAMPLE // CURRENT HOST AEGIS', host: 'aegis', destination: 'AEGIS' },
];

const SERVICE_STATES: readonly { readonly id: ServiceState; readonly label: string; readonly readout: string }[] = [
  { id: 'ready', label: 'Ready host', readout: 'ELIGIBLE SAMPLE // PREPARED HOST AND SERVICE STATE' },
  { id: 'undocked', label: 'Undocked host', readout: 'BLOCKED SAMPLE // CURRENT DOCK IS REQUIRED' },
  { id: 'used', label: 'Already used', readout: 'BLOCKED SAMPLE // SERVICE ALREADY USED IN THIS PREPARED VIEW' },
  { id: 'wrong-phase', label: 'Wrong phase', readout: 'BLOCKED SAMPLE // PREPARED PHASE DOES NOT MATCH' },
  { id: 'pending', label: 'Pending service', readout: 'PENDING SAMPLE // WAIT FOR THE PREPARED RESULT' },
  { id: 'committed', label: 'Committed service', readout: 'COMMITTED SAMPLE RESULT // NO SECOND SERVICE SENT' },
];

const CARGO_STATES: readonly { readonly id: CargoState; readonly label: string; readonly readout: string }[] = [
  { id: 'available', label: 'Cargo available', readout: 'AVAILABLE SAMPLE // CARGO TYPE LIST ONLY' },
  { id: 'empty', label: 'Cargo empty', readout: 'EMPTY SAMPLE // NO TRANSFER SENT' },
  { id: 'pending', label: 'Cargo pending', readout: 'PENDING SAMPLE // WAIT FOR THE PREPARED RESULT' },
  { id: 'committed', label: 'Cargo committed', readout: 'COMMITTED SAMPLE RESULT // NO SECOND MOVE SENT' },
  { id: 'stale', label: 'Cargo stale', readout: 'STALE SAMPLE // REFRESH BEFORE REVIEWING ANOTHER MOVE' },
];

const SHUTTLE_MOVEMENT: Record<ShuttleState, ShuttlePreviewOperation> = {
  docked: { actionLabel: 'Depart shuttle', status: 'unavailable', message: 'Docked sample. No departure is requested.' },
  departing: { actionLabel: 'Depart shuttle', status: 'pending', message: 'Departure pending in this prepared sample.' },
  transit: { actionLabel: 'View destination', status: 'committed', message: 'Prepared transit sample. Destination AEGIS.' },
  retargeted: { actionLabel: 'Retarget shuttle', status: 'committed', message: 'Prepared retarget result. Current destination AEGIS.' },
  'airspace-closed': { actionLabel: 'Depart shuttle', status: 'unavailable', message: 'Airspace is closed in this sample. No departure is requested.' },
  arrived: { actionLabel: 'Confirm arrival', status: 'committed', message: 'Prepared arrival sample at AEGIS.' },
};

function sampleDocking(host: string, dockedAt: string) {
  return host ? { shuttleId: blackSheep.id, shipId: host, dockedAt } : undefined;
}

function PreparedShipStation({
  page,
  onPageChange,
  onReturnToFleet,
  onOpenDrive,
}: {
  readonly page: StationPage;
  readonly onPageChange: (page: StationPage) => void;
  readonly onReturnToFleet: () => void;
  readonly onOpenDrive: () => void;
}) {
  const { short, medium, long } = aegis.printedStatistics.jumpCosts;
  return <section className="pc03-review__station" aria-label="Prepared assigned station">
    <FleetRoleConsoleTemplate
      shipName={aegis.name}
      roleName="Admiral"
      title={page === 'navigation' ? 'Navigation' : 'Ship systems'}
      galacticCoordinate={SAMPLE_CURRENT_COORDINATE}
      fuel={aegis.resources.fuel}
      reactorCapacity={aegis.printedStatistics.reactorCapacity}
      jumpCosts={[short, medium, long]}
      pages={[{ id: 'systems', label: 'Systems' }, { id: 'navigation', label: 'Navigation' }]}
      activePage={page}
      onPageChange={onPageChange}
    >
      {page === 'navigation' ? <ShipNavigationWorkspace
        shipId={aegis.id}
        shipName={aegis.name}
        currentCoordinate={SAMPLE_CURRENT_COORDINATE}
        entries={SAMPLE_NAVIGATION_LOG}
        knownCoordinates={SAMPLE_KNOWN_COORDINATES}
        knownSystems={SAMPLE_KNOWN_SYSTEMS}
      /> : <section className="pc03-review__systems cic-frame" aria-label="Prepared ship systems">
        <p className="cic-overline">Assigned station // AEGIS Admiral</p>
        <h3>Ship systems</h3>
        <p>Current ship fix // {SAMPLE_CURRENT_COORDINATE}</p>
        <p>Resource stores and this station’s instruments remain on the ship console below the selected workspace.</p>
        <button className="cic-action-button" type="button" onClick={onOpenDrive}>Review Jump Drive states</button>
        <button className="cic-action-button" type="button" onClick={onReturnToFleet}>Return to Fleet Board</button>
      </section>}
    </FleetRoleConsoleTemplate>
  </section>;
}

function DrivePreview({ state, onStateChange }: {
  readonly state: DriveState;
  readonly onStateChange: (state: DriveState) => void;
}) {
  const selected = DRIVE_STATES.find((candidate) => candidate.id === state) ?? DRIVE_STATES[0]!;
  const costs = aegis.printedStatistics.jumpCosts;
  const fuel = state === 'fuel-starved' ? 1 : aegis.resources.fuel;
  return <section className="pc03-review__panel cic-frame" aria-label="Jump Drive preview">
    <p className="cic-overline">SAMPLE ONLY // READ-ONLY JUMP CONTROL</p>
    <h3>AEGIS // Jump Drive</h3>
    <div className="pc03-review__controls" role="group" aria-label="Prepared Jump Drive states">
      {DRIVE_STATES.map((candidate) => <button
        className="cic-action-button"
        type="button"
        aria-pressed={candidate.id === state}
        key={candidate.id}
        onClick={() => onStateChange(candidate.id)}
      >{candidate.label}</button>)}
    </div>
    <p role="status" aria-label="Prepared drive outcome">{selected.readout}</p>
    <section className="pc03-review__drive-control" role="region" aria-label="Jump Drive sample control">
      <JumpDrivePresentation
        shipId={aegis.id}
        shipName={aegis.name}
        currentCoordinate={SAMPLE_CURRENT_COORDINATE}
        fuel={fuel}
        jumpCosts={[costs.short, costs.medium, costs.long]}
        charged={state !== 'uncharged'}
        damaged={state === 'damaged'}
        upgraded={false}
        consoleLocked
        presentationOnly
      />
    </section>
    <p className="pc03-review__note">The production inputs are visible for review; every control that could lock, charge, or launch is disabled in this scene.</p>
  </section>;
}

function ShuttlePreview({ state, onStateChange, onReturn }: {
  readonly state: ShuttleState;
  readonly onStateChange: (state: ShuttleState) => void;
  readonly onReturn: () => void;
}) {
  const selected = SHUTTLE_STATES.find((candidate) => candidate.id === state) ?? SHUTTLE_STATES[0]!;
  const docking = sampleDocking(selected.host, 'SAMPLE ONLY');
  const atShepherd = selected.host === 'shepherd';
  const controlPreview: ShuttlePreviewSnapshot = {
    holderLabel: `${atShepherd ? 'Shepherd Engineer' : 'AEGIS Engineer'} // sample holder`,
    locationLabel: atShepherd ? `Docked // ${selected.destination}` : `In transit // ${selected.destination}`,
    movement: SHUTTLE_MOVEMENT[state],
  };
  return <section className="pc03-review__panel" aria-label="Prepared shuttle route">
    <div className="pc03-review__controls" role="group" aria-label="Prepared shuttle states">
      {SHUTTLE_STATES.map((candidate) => <button
        className="cic-action-button"
        type="button"
        aria-pressed={candidate.id === state}
        key={candidate.id}
        onClick={() => onStateChange(candidate.id)}
      >{candidate.label}</button>)}
    </div>
    <p role="status" aria-label="Prepared shuttle outcome">{selected.readout}</p>
    <section className="pc03-review__shuttle" role="region" aria-label="Black Sheep shuttle console preview">
      <p className="cic-overline">SAMPLE ONLY // NO SHUTTLE ACTION</p>
      <button className="cic-text-button" type="button" onClick={onReturn}>Return to owning station</button>
      <ShuttleTemplatePreview
        shuttle={blackSheep}
        captainName="Shepherd Engineer"
        canLeave={false}
        docking={docking}
        fuelled={atShepherd && state !== 'airspace-closed'}
        controlPreview={controlPreview}
      />
      <dl className="pc03-review__shuttle-data">
        <div><dt>Prepared destination</dt><dd>{selected.destination}</dd></div>
        <div><dt>Airspace sample</dt><dd>{state === 'airspace-closed' ? 'Closed // no departure sent' : 'Open sample state'}</dd></div>
        <div><dt>Movement sample</dt><dd>{selected.label}</dd></div>
      </dl>
    </section>
  </section>;
}

function StoresPreview({
  stockState,
  onStockChange,
  serviceState,
  onServiceChange,
  cargoState,
  onCargoChange,
}: {
  readonly stockState: StoresState;
  readonly onStockChange: (state: StoresState) => void;
  readonly serviceState: ServiceState;
  readonly onServiceChange: (state: ServiceState) => void;
  readonly cargoState: CargoState;
  readonly onCargoChange: (state: CargoState) => void;
}) {
  const service = SERVICE_STATES.find((candidate) => candidate.id === serviceState) ?? SERVICE_STATES[0]!;
  const cargo = CARGO_STATES.find((candidate) => candidate.id === cargoState) ?? CARGO_STATES[0]!;
  const resources = stockState === 'stocked'
    ? aegis.resources
    : { ore: 0, fuel: 0, food: 0, water: 0, materials: 0, securityTeams: 0 };
  const cargoLabels = (blackSheep.cargoTransferTypes ?? []).map((resourceId) =>
    RESOURCE_DEFINITIONS.find((resource) => resource.id === resourceId)?.label ?? resourceId,
  );
  const repairSummary = philia.operations.find((operation) => operation.name === 'Repair')?.effect ?? 'Repair details unavailable';
  const rechargeSummary = blackSheep.operations.find((operation) => operation.name === 'Recharge')?.effect ?? 'Recharge details unavailable';
  return <section className="pc03-review__panel cic-frame" aria-label="Stores and service preview">
    <p className="cic-overline">SAMPLE ONLY // NO CARGO OR SERVICE MUTATION</p>
    <div className="pc03-review__controls" role="group" aria-label="Prepared stores and service states">
      <button className="cic-action-button" type="button" aria-pressed={stockState === 'stocked'} onClick={() => onStockChange('stocked')}>Stocked</button>
      <button className="cic-action-button" type="button" aria-pressed={stockState === 'depleted'} onClick={() => onStockChange('depleted')}>Depleted</button>
      {SERVICE_STATES.map((candidate) => <button
        className="cic-action-button"
        type="button"
        aria-pressed={candidate.id === serviceState}
        key={candidate.id}
        onClick={() => onServiceChange(candidate.id)}
      >{candidate.label}</button>)}
      {CARGO_STATES.map((candidate) => <button
        className="cic-action-button"
        type="button"
        aria-pressed={candidate.id === cargoState}
        key={candidate.id}
        onClick={() => onCargoChange(candidate.id)}
      >{candidate.label}</button>)}
    </div>
    <div className="pc03-review__inventory-grid">
      <section className="pc03-review__inventory cic-frame" role="region" aria-label="AEGIS resource stores">
        <p className="cic-overline">AEGIS // Ship stores // {stockState.toUpperCase()} SAMPLE</p>
        <ul>{RESOURCE_DEFINITIONS.map((resource) => {
          const amount = resources[resource.id];
          if (amount === undefined) return null;
          return <li key={resource.id} aria-label={`${resource.label}: ${amount}`}>
            <span className="resource-label"><ResourceIcon id={resource.id} label={resource.label} /><span>{resource.label}</span></span>
            <strong>{amount}</strong>
          </li>;
        })}</ul>
      </section>
      <section className="pc03-review__inventory cic-frame" role="region" aria-label="Black Sheep shuttle cargo">
        <p className="cic-overline">BLACK SHEEP // Cargo transfer types</p>
        <p role="status" aria-label="Prepared cargo outcome">{cargo.readout}</p>
        <ul>{cargoLabels.map((label) => <li key={label}>{label}</li>)}</ul>
        <p>These are the craft’s listed cargo types; no sample quantity or transfer is applied.</p>
      </section>
    </div>
    <section className="pc03-review__service cic-frame" role="region" aria-label="Prepared service sample">
      <p className="cic-overline">CURRENT HOST AND SERVICE // PREPARED VIEW</p>
      <p role="status" aria-label="Prepared service outcome">{service.readout}</p>
      <div className="pc03-review__service-grid">
        <article><h3>{philia.shortName} // Repair</h3><p>{repairSummary}</p><button className="cic-action-button" type="button" disabled>Repair sample</button></article>
        <article><h3>{blackSheep.shortName} // Recharge</h3><p>{rechargeSummary}</p><button className="cic-action-button" type="button" disabled>Recharge sample</button></article>
      </div>
      <p>Service buttons stay disabled. Prepared status changes do not call the production command.</p>
    </section>
  </section>;
}

function RecoveryPreview({ recovered, onRecover }: { readonly recovered: boolean; readonly onRecover: () => void }) {
  const status = recovered ? 'RECOVERED SAMPLE SNAPSHOT // CURRENT SAMPLE VALUES RESTORED' : 'STALE SAMPLE VIEWS // APPLY THE PREPARED RECONNECT SNAPSHOT TO REVIEW RECOVERY';
  const freshness = recovered ? 'Prepared snapshot refreshed locally' : 'Cached sample // current authority not represented';
  return <section className="pc03-review__panel cic-frame" aria-label="Stale and reconnect samples">
    <p className="cic-overline">SAMPLE ONLY // NO RECONNECT OR REFRESH REQUEST</p>
    <h3>Stale and reconnect samples</h3>
    <p role="status" aria-label="Prepared reconnect result">{status}</p>
    <div className="pc03-review__recovery-grid">
      {[
        ['Navigation sample', `Cached ship fix // ${SAMPLE_CURRENT_COORDINATE}`],
        ['Jump Drive sample', recovered ? 'Prepared drive state // READY' : 'Stale reply // refresh before retry'],
        ['Shuttle sample', recovered ? 'Prepared host // Shepherd' : 'Host update stale // verify current docking'],
        ['Ship stores sample', recovered ? 'Prepared AEGIS stores // sample only' : 'Store read stale // verify current sample'],
        ['Cargo and service sample', recovered ? 'Prepared result // no duplicate action' : 'Pending or committed state // do not repeat'],
      ].map(([label, detail]) => <section className="pc03-review__recovery-card cic-frame" role="region" aria-label={label} key={label}>
        <h4>{label}</h4><p>{detail}</p><p>{freshness}</p>
      </section>)}
    </div>
    <div className="pc03-review__disabled-actions" aria-label="Duplicate sample actions">
      <button className="cic-action-button" type="button" disabled>Retry sample jump</button>
      <button className="cic-action-button" type="button" disabled>Repeat sample cargo move</button>
      <button className="cic-action-button" type="button" disabled>Repeat sample repair</button>
    </div>
    {!recovered && <button className="cic-action-button" type="button" onClick={onRecover}>Apply prepared reconnect snapshot</button>}
  </section>;
}

export default function PC03ReviewScene() {
  const [step, setStep] = useState<Step>('chart');
  const [stationRoute, setStationRoute] = useState<'station' | 'fleet'>('station');
  const [stationPage, setStationPage] = useState<StationPage>('systems');
  const [driveState, setDriveState] = useState<DriveState>('ready');
  const [shuttleState, setShuttleState] = useState<ShuttleState>('docked');
  const [stockState, setStockState] = useState<StoresState>('stocked');
  const [serviceState, setServiceState] = useState<ServiceState>('ready');
  const [cargoState, setCargoState] = useState<CargoState>('available');
  const [recovered, setRecovered] = useState(false);
  const currentStep = STEPS.find((candidate) => candidate.id === step) ?? STEPS[0]!;

  function selectStep(next: Step): void {
    setStep(next);
    if (next === 'chart') {
      setStationPage('systems');
      setStationRoute('station');
    }
  }

  function selectDrive(next: DriveState): void { setDriveState(next); }
  function selectShuttle(next: ShuttleState): void { setShuttleState(next); }
  function selectStock(next: StoresState): void { setStockState(next); }
  function selectService(next: ServiceState): void { setServiceState(next); }
  function selectCargo(next: CargoState): void { setCargoState(next); }

  return <MemoryRouter initialEntries={['/pc03-review']}>
    <div className="pc03-review">
      <a className="pc03-review__skip" href="#pc03-review-content">Skip to review step</a>
      <header className="pc03-review__header">
        <div>
          <p className="cic-overline">Prepared playtest // PC03</p>
          <h1>PC03 // Navigation and shuttle controls</h1>
          <p>One facilitator, one sitting, and no connected players.</p>
        </div>
        <p className="pc03-review__mode">Single facilitator // synthetic review</p>
      </header>
      <aside className="pc03-review__sample-banner" aria-label="Synthetic sample notice">
        <strong>SAMPLE ONLY</strong>
        <span>No live session is connected. Every selector changes this preview only; no jump, shuttle, cargo, or service request is sent.</span>
      </aside>
      <nav className="pc03-review__steps" aria-label="PC03 review steps">
        {STEPS.map((candidate, index) => <button
          className="cic-action-button"
          type="button"
          aria-pressed={step === candidate.id}
          key={candidate.id}
          onClick={() => selectStep(candidate.id)}
        >{index + 1}. {candidate.label}</button>)}
      </nav>
      {step === 'shuttle' ? <div id="pc03-review-content" className="pc03-review__content" tabIndex={-1}>
        <section className="pc03-review__intro cic-frame" aria-label="Current review step">
          <p className="cic-overline">Step {STEPS.indexOf(currentStep) + 1} of {STEPS.length} // SAMPLE ONLY</p>
          <h2>{currentStep.label}</h2><p>{currentStep.intro}</p>
        </section>
        <ShuttlePreview
          state={shuttleState}
          onStateChange={selectShuttle}
          onReturn={() => { setStep('chart'); setStationPage('systems'); setStationRoute('station'); }}
        />
      </div> : <main id="pc03-review-content" className="pc03-review__content" tabIndex={-1}>
        <section className="pc03-review__intro cic-frame" aria-label="Current review step">
          <p className="cic-overline">Step {STEPS.indexOf(currentStep) + 1} of {STEPS.length} // SAMPLE ONLY</p>
          <h2>{currentStep.label}</h2><p>{currentStep.intro}</p>
        </section>
        {step === 'chart' && (stationRoute === 'fleet'
          ? <section className="pc03-review__fleet cic-frame" role="region" aria-label="Prepared fleet board">
            <p className="cic-overline">SAMPLE ONLY // FLEET BOARD</p>
            <h3>AEGIS // Admiral assigned station</h3>
            <button className="cic-action-button" type="button" onClick={() => { setStationRoute('station'); setStationPage('systems'); }}>Return to assigned station</button>
          </section>
          : <>
          <PreparedShipStation
            page={stationPage}
            onPageChange={setStationPage}
            onOpenDrive={() => selectStep('drive')}
            onReturnToFleet={() => setStationRoute('fleet')}
          />
        </>)}
        {step === 'drive' && <DrivePreview state={driveState} onStateChange={selectDrive} />}
        {step === 'stores' && <StoresPreview
          stockState={stockState} onStockChange={selectStock}
          serviceState={serviceState} onServiceChange={selectService}
          cargoState={cargoState} onCargoChange={selectCargo}
        />}
        {step === 'recovery' && <RecoveryPreview recovered={recovered} onRecover={() => setRecovered(true)} />}
      </main>}
      <footer className="pc03-review__footer">
        <p>Review the labels and return paths only. Game authority, costs, and live outcomes are outside this prepared scene.</p>
        <p>Responsive review // phone, desktop, short landscape, reduced motion</p>
      </footer>
    </div>
  </MemoryRouter>;
}
