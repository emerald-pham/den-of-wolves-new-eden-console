import { useId } from 'react';
import './SmallShipJumpPanel.css';

export interface SmallShipJumpPanelDestination {
  readonly coordinate: string;
  readonly length: 'short' | 'medium' | 'long';
  readonly fuelCost: number;
}

export interface SmallShipJumpPanelProjection {
  readonly viewer: 'captain' | 'gm';
  readonly smallShipId: 'gorgoneion' | 'capybara-small';
  readonly hostShipId: string | null;
  readonly currentCoordinate: string | null;
  readonly movementRevision: number;
  readonly dockingRevision: number;
  readonly currentTurn: number;
  readonly phase: string;
  readonly cycleRevision?: number;
  readonly cycleStep?: number;
  readonly cycleTurn?: number | null;
  readonly cycleCharges?: readonly string[];
  readonly charged?: boolean;
  readonly hostFuel?: number | null;
  readonly knownDestinations?: readonly SmallShipJumpPanelDestination[];
  readonly arrivalCoordinates?: readonly string[];
}

export interface SmallShipJumpPanelProps {
  readonly smallShipId: 'gorgoneion' | 'capybara-small';
  readonly projection?: SmallShipJumpPanelProjection | undefined;
  readonly accessibleName?: string;
  readonly authorityLabel?: string;
  readonly resultStatusLabel?: string;
  readonly loading: boolean;
  readonly busy: boolean;
  readonly selectedDestination: string;
  readonly pendingJump?: boolean;
  readonly pendingCharge?: boolean;
  readonly error?: string;
  readonly resultMessage?: string;
  readonly onDestinationChange: (coordinate: string) => void;
  readonly onCharge: () => void;
  readonly onRetryCharge: () => void;
  readonly onJump: () => void;
  readonly onRetryJump: () => void;
  readonly onRefresh: () => void;
}

function vesselName(smallShipId: SmallShipJumpPanelProps['smallShipId']): string {
  return smallShipId === 'gorgoneion' ? 'Gorgoneion' : 'Base Capybara';
}

export default function SmallShipJumpPanel({
  smallShipId,
  projection,
  accessibleName = 'Small-craft Jump Drive workspace',
  authorityLabel = 'server authority',
  resultStatusLabel = 'Jump Drive action result',
  loading,
  busy,
  selectedDestination,
  pendingJump = false,
  pendingCharge = false,
  error = '',
  resultMessage = '',
  onDestinationChange,
  onCharge,
  onRetryCharge,
  onJump,
  onRetryJump,
  onRefresh,
}: SmallShipJumpPanelProps) {
  const id = useId();
  const destinations = projection?.knownDestinations ?? [];
  const destination = destinations.find((choice) => choice.coordinate === selectedDestination);
  const hasHostFuel = destination !== undefined && (projection?.hostFuel ?? -1) >= destination.fuelCost;
  const charges = projection?.cycleCharges ?? [];
  const canCharge = projection?.viewer === 'captain' && projection.hostShipId !== null &&
    projection.phase === 'team' && projection.cycleStep === 4 &&
    projection.cycleTurn === projection.currentTurn && projection.charged === false &&
    Number.isSafeInteger(projection.cycleRevision) && charges.length < 2 && !charges.includes('jump-drive');
  const canJump = projection?.viewer === 'captain' && projection.phase === 'coordination' &&
    projection.hostShipId !== null && projection.currentCoordinate !== null && projection.charged === true &&
    destination !== undefined && hasHostFuel && Number.isSafeInteger(projection.cycleRevision);

  return (
    <section className="console-workspace extra-ship-workspace__procedure small-ship-jump-panel" aria-label={accessibleName}>
      <header className="console-workspace__header">
        <p className="eyebrow">{vesselName(smallShipId)} // Jump Drive // {authorityLabel}</p>
        <h3>Small-craft FTL procedure</h3>
      </header>
      <p>
        Charge during Team Phase, then jump during Coordination. Route choices come only from this Captain’s known chart nodes.
        Host fuel is spent only after the server validates the route and confirms it remains known to this Captain. The host pays 1 / 1 / 2 fuel for a short / medium / long jump.
      </p>
      <p id={`${id}-jump-help`}>A successful jump consumes the Jump Drive charge; the craft may make only one jump per cycle. Successful jump detaches the craft at its arrival coordinate. Re-docking requires an active host at that same coordinate.</p>
      {loading && <p className="console-workspace__status" role="status">Loading current server movement projection…</p>}
      {error && <p className="console-workspace__error" role="alert">{error}</p>}
      {resultMessage && <p className="console-workspace__status" role="status" aria-label={resultStatusLabel}>{resultMessage}</p>}
      {projection && projection.viewer === 'gm' && (
        <p>Facilitator movement projection: {projection.currentCoordinate ?? 'coordinate unavailable'} // revision {projection.movementRevision}.</p>
      )}
      {projection && projection.viewer === 'captain' && (
        <>
          <dl className="console-workspace__telemetry">
            <div><dt>Current coordinate</dt><dd>{projection.currentCoordinate ?? 'Unavailable'}</dd></div>
            <div><dt>Docked host</dt><dd>{projection.hostShipId ?? 'Detached'}</dd></div>
            <div><dt>Host fuel</dt><dd>{projection.hostFuel ?? 'No docked host'}</dd></div>
            <div><dt>Cycle / phase</dt><dd>{projection.currentTurn} // {projection.phase}</dd></div>
            <div><dt>Jump Drive</dt><dd>{projection.charged ? 'Charged this cycle' : 'Not charged this cycle'}</dd></div>
          </dl>
          <p id={`${id}-charge-help`}>The Captain charges the drive at maintenance step 4 during Team Phase, while docked. It occupies one of the craft’s two console charge slots.</p>
          {canCharge && (
            <button type="button" className="console-workspace__button" disabled={busy || pendingCharge} aria-describedby={`${id}-charge-help`} onClick={onCharge}>
              Charge Jump Drive
            </button>
          )}
          {(pendingCharge || pendingJump) && <p id={`${id}-retry-help`}>Retry the same saved action to confirm its outcome. An already recorded action returns its result without spending again.</p>}
          {pendingCharge && (
            <button type="button" className="console-workspace__button" disabled={busy} aria-describedby={`${id}-retry-help`} onClick={onRetryCharge}>
              Retry exact charge
            </button>
          )}
          {projection.hostShipId && projection.currentCoordinate && (
            <label>
              Known destination
              <select
                value={selectedDestination}
                disabled={busy || pendingJump || projection.phase !== 'coordination' || projection.charged !== true}
                onChange={(event) => onDestinationChange(event.currentTarget.value)}
              >
                <option value="">Select a known destination</option>
                {destinations.map((choice) => (
                  <option key={choice.coordinate} value={choice.coordinate}>
                    {choice.coordinate} // {choice.length} // {choice.fuelCost} host fuel
                  </option>
                ))}
              </select>
            </label>
          )}
          {projection.hostShipId === null && (
            <p>The craft is independent at its recorded arrival coordinate. Ask the facilitator to dock it with a co-located active host before its next jump.</p>
          )}
          {destination && !hasHostFuel && <p role="alert">The current host fuel ledger cannot fund this route.</p>}
          <button type="button" className="console-workspace__button" disabled={!canJump || busy || pendingJump} aria-describedby={`${id}-jump-help`} onClick={onJump}>
            Execute jump
          </button>
          {pendingJump && (
            <button type="button" className="console-workspace__button" disabled={busy} aria-describedby={`${id}-retry-help`} onClick={onRetryJump}>
              Retry exact jump
            </button>
          )}
          <button type="button" className="console-workspace__button" disabled={busy} onClick={onRefresh}>
            Refresh movement projection
          </button>
          <details>
            <summary>Arrival knowledge recorded for this Captain</summary>
            <p>{projection.arrivalCoordinates?.length ? projection.arrivalCoordinates.join(' // ') : 'No private jump arrivals recorded.'}</p>
          </details>
        </>
      )}
    </section>
  );
}
