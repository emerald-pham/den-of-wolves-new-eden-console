import { useEffect, useMemo, useState } from 'react';
import { subscribeConnectedPlayers, subscribeShuttleDeparture } from '@/lib/firestore';
import { transferShuttleControl } from '@/lib/shuttleControlService';
import { beginShuttleTransit, requestShuttleDeparture } from '@/lib/shuttleDepartureService';
import { useSessionStore } from '@/store/useSessionStore';
import type { Player, ShuttleControlEntry, ShuttleMovementState } from '@/types/game';
import { findShip } from '@/data/ships';
import { dockingForShuttle, shuttleDestinationIsAllowed } from '@/data/shuttles';

interface Props {
  readonly control: ShuttleControlEntry;
}

export default function ShuttleControl({ control }: Props) {
  const session = useSessionStore((state) => state.session)!;
  const me = useSessionStore((state) => state.me)!;
  const [players, setPlayers] = useState<readonly Player[]>([]);
  const [targetUid, setTargetUid] = useState('');
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState('');
  const [destinationShipId, setDestinationShipId] = useState('');
  const [departure, setDeparture] = useState<ShuttleMovementState | null>(null);
  const canTransfer = me.role === 'gm' || me.uid === control.ownerUid;
  const canRequestDeparture = me.role === 'player' && me.uid === control.holderUid;
  const docking = dockingForShuttle(session, control.shuttleId);
  const destinations = (session.activeVesselIds ?? [])
    .filter((shipId) => shipId !== docking?.shipId && findShip(shipId) !== undefined &&
      shuttleDestinationIsAllowed(control.shuttleId, shipId));
  const departureWindowOpen = session.phase === 'active' &&
    session.turnPhase?.airspace.state === 'lifted' && !session.turnPhase.timerPause &&
    Date.now() < Date.parse(session.turnPhase.openAirspaceEndsAt);

  useEffect(() => subscribeConnectedPlayers(session.id, setPlayers), [session.id, me.fleetGroupId]);
  useEffect(() => subscribeShuttleDeparture(
    session.id,
    control.shuttleId,
    setDeparture,
  ), [control.shuttleId, me.fleetGroupId, session.id]);
  const holder = players.find((player) => player.uid === control.holderUid);
  const targets = useMemo(() => players.filter((player) =>
    player.role === 'player' && player.uid !== control.holderUid), [control.holderUid, players]);

  async function submit(action: 'handoff' | 'reclaim'): Promise<void> {
    if (pending) return;
    setPending(true);
    setStatus('');
    try {
      await transferShuttleControl(
        control.shuttleId,
        action,
        control.revision,
        action === 'handoff' ? targetUid : undefined,
      );
      setStatus(action === 'reclaim' ? 'Shuttle control reclaimed.' : 'Shuttle control handed off.');
      setTargetUid('');
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : 'Shuttle control transfer failed.');
    } finally {
      setPending(false);
    }
  }

  async function submitDeparture(): Promise<void> {
    if (pending || !destinationShipId || !session.turnPhase) return;
    setPending(true);
    setStatus('');
    try {
      await requestShuttleDeparture(
        control.shuttleId,
        destinationShipId,
        control.revision,
        session.turnPhase.turn,
      );
      setStatus(`Departure requested to ${findShip(destinationShipId)?.name ?? destinationShipId}.`);
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : 'Shuttle departure request failed.');
    } finally {
      setPending(false);
    }
  }

  async function submitTransit(): Promise<void> {
    if (pending || !departure || departure.status !== 'requested') return;
    setPending(true);
    setStatus('');
    try {
      await beginShuttleTransit(
        control.shuttleId,
        departure.requestId,
        control.revision,
        departure.cycle,
      );
      setStatus(`Transit begun to ${findShip(departure.destinationShipId)?.name ?? departure.destinationShipId}.`);
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : 'Shuttle transit failed.');
    } finally {
      setPending(false);
    }
  }

  return <section className="console-workspace__section shuttle-control" aria-label="Shuttle control">
    <p className="console-workspace__eyebrow">Custody // server authorised</p>
    <h3>Shuttle control</h3>
    <p>Current holder // {holder?.displayName ?? (control.holderUid === me.uid ? me.displayName : 'Connected player')}</p>
    {canTransfer && <>
      <label htmlFor={`shuttle-recipient-${control.shuttleId}`}>Hand off to</label>
      <select id={`shuttle-recipient-${control.shuttleId}`} value={targetUid}
        disabled={pending} onChange={(event) => setTargetUid(event.target.value)}>
        <option value="">Choose connected player</option>
        {targets.map((player) => <option value={player.uid} key={player.uid}>{player.displayName}</option>)}
      </select>
      <div className="console-workspace__actions">
        <button type="button" disabled={pending || !targetUid}
          onClick={() => void submit('handoff')}>Hand off control</button>
        {control.holderUid !== control.ownerUid && <button type="button" disabled={pending}
          onClick={() => void submit('reclaim')}>Reclaim control</button>}
      </div>
    </>}
    {canRequestDeparture && <section aria-label="Shuttle departure">
      <p className="console-workspace__eyebrow">Flight plan // server authorised</p>
      <h4>Request departure</h4>
      {departure?.status === 'in-transit' ? <p>
        In transit to {findShip(departure.destinationShipId)?.name ?? departure.destinationShipId}.
      </p> : departure ? <>
        <p>
          Departure requested to {findShip(departure.destinationShipId)?.name ?? departure.destinationShipId};
          ready to begin transit.
        </p>
        <div className="console-workspace__actions">
          <button type="button" disabled={pending || !departureWindowOpen}
            onClick={() => void submitTransit()}>Begin transit</button>
        </div>
        {!departureWindowOpen && <p>Transit may begin when airspace is open.</p>}
      </> : <>
        <label htmlFor={`shuttle-destination-${control.shuttleId}`}>Destination ship</label>
        <select id={`shuttle-destination-${control.shuttleId}`} value={destinationShipId}
          disabled={pending || !departureWindowOpen}
          onChange={(event) => setDestinationShipId(event.target.value)}>
          <option value="">Choose local ship</option>
          {destinations.map((shipId) => <option value={shipId} key={shipId}>
            {findShip(shipId)?.name ?? shipId}
          </option>)}
        </select>
        <div className="console-workspace__actions">
          <button type="button" disabled={pending || !departureWindowOpen || !destinationShipId}
            onClick={() => void submitDeparture()}>Request departure</button>
        </div>
        {!departureWindowOpen && <p>Departure requests open when airspace is open.</p>}
      </>}
    </section>}
    {status && <p role="status">{status}</p>}
  </section>;
}
