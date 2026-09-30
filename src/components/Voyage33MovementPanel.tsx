import type { ReactNode } from 'react';
import './Voyage33MovementPanel.css';

export type Voyage33MovementPhase = 'team' | 'coordination' | 'other';
export type Voyage33MovementConnection = 'live' | 'connecting' | 'offline';
export type Voyage33JumpLength = 'short' | 'medium' | 'long';

export interface Voyage33MovementHost {
  readonly shipId: string;
  readonly name: string;
  readonly coordinate: string;
  readonly fuel: number;
  readonly status: 'operational' | 'damaged' | 'destroyed' | 'unavailable';
}

export interface Voyage33MovementPanelProps {
  /** Current facilitator-authorized session projection. */
  readonly admitted: boolean;
  readonly connection: Voyage33MovementConnection;
  readonly phase: Voyage33MovementPhase;
  readonly currentLocation: { readonly coordinate: string; readonly label: string };
  readonly host: Voyage33MovementHost | null;
  /** Server-filtered choices that may host Voyage 33-0 at its current location. */
  readonly dockableHosts: readonly { readonly shipId: string; readonly name: string }[];
  /** Server-filtered legal destinations. The panel never constructs destinations. */
  readonly legalDestinations: readonly {
    readonly coordinate: string;
    readonly label: string;
    readonly length: Voyage33JumpLength;
  }[];
  readonly outcome:
    | { readonly status: 'idle' }
    | { readonly status: 'pending' | 'stale' | 'denied' | 'committed'; readonly message: string };
  readonly onDock: (hostShipId: string) => void;
  readonly onJump: (destination: string) => void;
}

const HOST_FUEL_COST: Readonly<Record<Voyage33JumpLength, number>> = {
  short: 1,
  medium: 1,
  long: 2,
};

const JUMP_LENGTH_LABEL: Readonly<Record<Voyage33JumpLength, string>> = {
  short: 'Short',
  medium: 'Medium',
  long: 'Long',
};

function connectionLabel(connection: Voyage33MovementConnection): string {
  switch (connection) {
    case 'live': return 'LIVE';
    case 'connecting': return 'CONNECTING';
    case 'offline': return 'OFFLINE';
  }
}

function hostStatusLabel(status: Voyage33MovementHost['status']): string {
  switch (status) {
    case 'operational': return 'Operational';
    case 'damaged': return 'Damaged';
    case 'destroyed': return 'Destroyed';
    case 'unavailable': return 'Unavailable';
  }
}

function disabledReason(action: 'dock' | 'jump', props: Voyage33MovementPanelProps): string | undefined {
  if (!props.admitted) return 'Voyage 33-0 is not admitted in this session.';
  if (props.connection !== 'live') return 'The facilitator connection is not live.';
  if (props.outcome.status === 'pending') return 'A Voyage 33-0 action is still pending.';
  if (action === 'dock' && props.phase !== 'team') return 'Host docking is available during Team Phase.';
  if (action === 'jump' && props.phase !== 'coordination') return 'Movement is available during Coordination Phase.';
  if (action === 'dock' && props.host) return 'Voyage 33-0 already has an assigned host.';
  if (action === 'jump' && !props.host) return 'Voyage 33-0 must dock with a host before it can move.';
  if (action === 'jump' && props.host?.status !== 'operational' && props.host?.status !== 'damaged') {
    return 'The current host is unavailable for Voyage 33-0 movement.';
  }
  if (action === 'jump' && props.host?.coordinate !== props.currentLocation.coordinate) {
    return 'Voyage 33-0 and its host must be at the same location before departure.';
  }
  return undefined;
}

function renderOutcome(outcome: Voyage33MovementPanelProps['outcome']): ReactNode {
  if (outcome.status === 'idle') return null;

  const label = outcome.status.toUpperCase();
  const className = `voyage33-movement__outcome voyage33-movement__outcome--${outcome.status}`;
  if (outcome.status === 'stale' || outcome.status === 'denied') {
    return <p className={className} role="alert" aria-live="assertive">{label} // {outcome.message}</p>;
  }
  return <p className={className} role="status" aria-live="polite">{label} // {outcome.message}</p>;
}

export default function Voyage33MovementPanel({
  admitted,
  connection,
  phase,
  currentLocation,
  host,
  dockableHosts,
  legalDestinations,
  outcome,
  onDock,
  onJump,
}: Voyage33MovementPanelProps) {
  const props = {
    admitted,
    connection,
    phase,
    currentLocation,
    host,
    dockableHosts,
    legalDestinations,
    outcome,
    onDock,
    onJump,
  };
  const dockDisabledReason = disabledReason('dock', props);
  const jumpDisabledReason = disabledReason('jump', props);
  const connectionText = connectionLabel(connection);

  return (
    <section className="voyage33-movement cic-frame" aria-labelledby="voyage33-movement-heading">
      <header className="voyage33-movement__header">
        <div>
          <p className="voyage33-movement__eyebrow">EXTRA VESSEL // FACILITATOR CONTROL</p>
          <h3 id="voyage33-movement-heading">Voyage 33-0 movement</h3>
        </div>
        <p className="voyage33-movement__connection" aria-label={`Facilitator connection ${connectionText}`}>
          LINK // {connectionText}
        </p>
      </header>

      <p className="voyage33-movement__identity">
        Voyage 33-0 is an extra ship, not a base small ship. Its jumps spend fuel from its docked host.
      </p>

      <div className="voyage33-movement__readouts">
        <div className="voyage33-movement__readout">
          <span className="voyage33-movement__label">Current location</span>
          <strong>{currentLocation.coordinate} // {currentLocation.label}</strong>
        </div>
        <div className="voyage33-movement__readout">
          <span className="voyage33-movement__label">Host state</span>
          {host ? (
            <strong>
              {host.name} // {host.coordinate} // {host.fuel} host fuel // {hostStatusLabel(host.status)}
            </strong>
          ) : (
            <strong>No host ship is assigned.</strong>
          )}
        </div>
      </div>

      <table className="voyage33-movement__costs" aria-label="Voyage 33-0 host fuel costs">
        <caption className="voyage33-movement__sr-only">Fuel taken from the docked host for each jump length.</caption>
        <tbody>
          {(['short', 'medium', 'long'] as const).map((length) => (
            <tr key={length}>
              <td>{JUMP_LENGTH_LABEL[length]} jump // {HOST_FUEL_COST[length]} host fuel</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="voyage33-movement__action" aria-label="Team-phase host docking">
        <h4>HOST DOCKING // TEAM PHASE</h4>
        {host ? (
          <p className="voyage33-movement__note">Host assignment is shown above. It cannot be changed while a host is assigned.</p>
        ) : dockableHosts.length > 0 ? (
          <div className="voyage33-movement__choices">
            {dockableHosts.map((candidate) => (
              <button
                className="cic-action-button"
                type="button"
                key={candidate.shipId}
                disabled={Boolean(dockDisabledReason)}
                aria-describedby={dockDisabledReason ? 'voyage33-dock-guidance' : undefined}
                onClick={() => onDock(candidate.shipId)}
              >
                Dock with {candidate.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="voyage33-movement__note">No eligible host is available at this location.</p>
        )}
        <p className="voyage33-movement__guidance" id="voyage33-dock-guidance">
          {dockDisabledReason ?? 'Choose a server-listed host during Team Phase.'}
        </p>
      </section>

      <section className="voyage33-movement__action" aria-label="Coordination-phase movement">
        <h4>JUMP MOVEMENT // COORDINATION PHASE</h4>
        {legalDestinations.length > 0 ? (
          <div className="voyage33-movement__choices">
            {legalDestinations.map((destination) => (
              <button
                className="cic-action-button"
                type="button"
                key={destination.coordinate}
                disabled={Boolean(jumpDisabledReason)}
                aria-describedby={jumpDisabledReason ? 'voyage33-jump-guidance' : undefined}
                onClick={() => onJump(destination.coordinate)}
              >
                Jump to {destination.label} // {destination.length} // {HOST_FUEL_COST[destination.length]} host fuel
              </button>
            ))}
          </div>
        ) : (
          <p className="voyage33-movement__note">No legal destinations are available in the current server state.</p>
        )}
        <p className="voyage33-movement__guidance" id="voyage33-jump-guidance">
          {jumpDisabledReason ?? 'Select only a legal destination supplied by the current server state.'}
        </p>
        <p className="voyage33-movement__note">The displayed location changes after the server confirms a committed jump.</p>
      </section>

      {renderOutcome(outcome)}
    </section>
  );
}
