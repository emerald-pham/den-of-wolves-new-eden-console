import { useEffect, useMemo, useState } from 'react';
import { subscribeConnectedPlayers, subscribeShuttleDeparture } from '@/lib/firestore';
import { transferShuttleControl } from '@/lib/shuttleControlService';
import { beginShuttleTransit, requestShuttleDeparture } from '@/lib/shuttleDepartureService';
import { transferShuttleCargo } from '@/lib/shuttleCargoService';
import { useSessionStore } from '@/store/useSessionStore';
import type { Player, ShuttleControlEntry, ShuttleMovementState } from '@/types/game';
import { findShip } from '@/data/ships';
import { dockingForShuttle, SHUTTLECRAFT, shuttleDestinationIsAllowed } from '@/data/shuttles';
import { RESOURCE_DEFINITIONS, type ResourceId } from '@/data/resources';

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
  const [cargoResourceId, setCargoResourceId] = useState<ResourceId | ''>('');
  const [cargoAmount, setCargoAmount] = useState(1);
  const canTransfer = me.role === 'gm' || me.uid === control.ownerUid;
  const canRequestDeparture = me.role === 'player' && me.uid === control.holderUid;
  const docking = dockingForShuttle(session, control.shuttleId);
  const cargoTypes = SHUTTLECRAFT.find((shuttle) => shuttle.id === control.shuttleId)
    ?.cargoTransferTypes ?? [];
  const cargoAmountIsValid = Number.isSafeInteger(cargoAmount) && cargoAmount >= 1;
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

  async function submitCargo(direction: 'load' | 'unload'): Promise<void> {
    if (pending || !docking || !cargoResourceId || !Number.isSafeInteger(cargoAmount) || cargoAmount < 1) return;
    setPending(true);
    setStatus('');
    try {
      await transferShuttleCargo(
        control.shuttleId,
        cargoResourceId,
        direction,
        cargoAmount,
        control.revision,
      );
      setStatus(`${direction === 'load' ? 'Loaded' : 'Unloaded'} ${cargoAmount} ${RESOURCE_DEFINITIONS.find((resource) => resource.id === cargoResourceId)?.label ?? cargoResourceId}.`);
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : 'Shuttle cargo transfer failed.');
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
        <button className="cic-action-button" type="button" disabled={pending || !targetUid}
          onClick={() => void submit('handoff')}>Hand off control</button>
        {control.holderUid !== control.ownerUid && <button className="cic-action-button" type="button" disabled={pending}
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
          <button className="cic-action-button" type="button" disabled={pending || !departureWindowOpen}
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
          <button className="cic-action-button" type="button" disabled={pending || !departureWindowOpen || !destinationShipId}
            onClick={() => void submitDeparture()}>Request departure</button>
        </div>
        {!departureWindowOpen && <p>Departure requests open when airspace is open.</p>}
      </>}
    </section>}
    {canRequestDeparture && docking && cargoTypes.length > 0 && <section aria-label="Shuttle cargo transfer">
      <p className="console-workspace__eyebrow">Cargo // docked transfer</p>
      <h4>Transfer cargo</h4>
      <p>Docked at {findShip(docking.shipId)?.name ?? docking.shipId}.</p>
      <label htmlFor={`shuttle-cargo-resource-${control.shuttleId}`}>Resource</label>
      <select id={`shuttle-cargo-resource-${control.shuttleId}`} value={cargoResourceId}
        disabled={pending} onChange={(event) => setCargoResourceId(event.target.value as ResourceId)}>
        <option value="">Choose permitted cargo</option>
        {cargoTypes.map((resourceId) => <option value={resourceId} key={resourceId}>
          {RESOURCE_DEFINITIONS.find((resource) => resource.id === resourceId)?.label ?? resourceId}
        </option>)}
      </select>
      <label htmlFor={`shuttle-cargo-amount-${control.shuttleId}`}>Amount</label>
      <input id={`shuttle-cargo-amount-${control.shuttleId}`} type="number" min="1" step="1"
        value={cargoAmount} disabled={pending}
        onChange={(event) => setCargoAmount(Number(event.target.value))} />
      {cargoResourceId && <p>
        Host // {session.shipResources?.[docking.shipId]?.[cargoResourceId] ?? 0}
        {' // '}Shuttle // {session.shuttleCargo?.[control.shuttleId]?.[cargoResourceId] ?? 0}
      </p>}
      <div className="console-workspace__actions">
        <button className="cic-action-button" type="button" disabled={pending || !cargoResourceId || !cargoAmountIsValid}
          onClick={() => void submitCargo('load')}>Load shuttle</button>
        <button className="cic-action-button" type="button" disabled={pending || !cargoResourceId || !cargoAmountIsValid}
          onClick={() => void submitCargo('unload')}>Unload shuttle</button>
      </div>
    </section>}
    {status && <p role="status">{status}</p>}
  </section>;
}
