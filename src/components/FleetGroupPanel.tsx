import { useEffect, useState } from 'react';
import { findVessel } from '@/data/ships';
import type { FleetGroupNavigationProjection, FleetGroupNote, FleetTaxiPayload, FleetTaxiShuttleId } from '@/lib/fleetGroupService';
import './FleetGroupWorkspace.css';

interface TaxiPlayer { readonly uid: string; readonly label: string }
const EMPTY_OPTIONS = [] as const;
interface Props {
  readonly groupId: string; readonly actorUid: string; readonly notes: readonly FleetGroupNote[];
  readonly draft: string; readonly busy: boolean; readonly notice: string;
  readonly navigation?: FleetGroupNavigationProjection | null;
  readonly scannedCoordinates?: readonly string[];
  readonly taxiDestinations?: readonly string[];
  readonly taxiShuttles?: readonly FleetTaxiShuttleId[];
  readonly taxiPlayers?: readonly TaxiPlayer[];
  readonly canShare?: boolean;
  readonly onDraft: (text: string) => void; readonly onSend: () => void; readonly onRefresh: () => void;
  readonly onConfirm?: () => void;
  readonly onShare?: (coordinate: string, recipients: 'all' | readonly string[]) => void;
  readonly onTaxi?: (input: Readonly<{ shuttleId: FleetTaxiShuttleId; targetShipId: string; payload: FleetTaxiPayload }>) => void;
}

function shipLabel(shipId: string): string {
  const vessel = findVessel(shipId);
  const label = vessel && 'shortName' in vessel && typeof vessel.shortName === 'string'
    ? vessel.shortName : vessel?.name ?? shipId;
  return label.toUpperCase();
}

export default function FleetGroupPanel({ groupId, actorUid, notes, draft, busy, notice, navigation = null,
  scannedCoordinates = EMPTY_OPTIONS, taxiDestinations = EMPTY_OPTIONS, taxiShuttles = EMPTY_OPTIONS,
  taxiPlayers = EMPTY_OPTIONS, canShare = false, onDraft, onSend, onRefresh,
  onConfirm, onShare, onTaxi }: Props) {
  const [coordinate, setCoordinate] = useState('');
  const [recipientShipIds, setRecipientShipIds] = useState<readonly string[]>([]);
  const [allRecipients, setAllRecipients] = useState(false);
  const [shuttleId, setShuttleId] = useState<FleetTaxiShuttleId | ''>('');
  const [destinationShipId, setDestinationShipId] = useState('');
  const [payloadKind, setPayloadKind] = useState<'players' | 'fuel'>('fuel');
  const [fuelUnits, setFuelUnits] = useState<1 | 2>(1);
  const [passengerUids, setPassengerUids] = useState<readonly string[]>([]);
  useEffect(() => {
    if (!scannedCoordinates.includes(coordinate)) setCoordinate(scannedCoordinates[0] ?? '');
    setRecipientShipIds(current => {
      const valid = current.filter(id => navigation?.ships.some(ship => ship.shipId === id));
      return valid.length === current.length ? current : valid;
    });
    if (!taxiShuttles.includes(shuttleId as FleetTaxiShuttleId)) setShuttleId(taxiShuttles[0] ?? '');
    if (!taxiDestinations.includes(destinationShipId)) setDestinationShipId(taxiDestinations[0] ?? '');
    setPassengerUids(current => {
      const valid = current.filter(uid => taxiPlayers.some(player => player.uid === uid));
      return valid.length === current.length ? current : valid;
    });
  }, [scannedCoordinates, navigation, taxiShuttles, taxiDestinations, taxiPlayers, coordinate, shuttleId, destinationShipId]);

  const ships = navigation?.ships ?? [];
  const shareRecipients = allRecipients ? 'all' : recipientShipIds;
  const shareReady = canShare && !!coordinate && (shareRecipients === 'all' || shareRecipients.length > 0) && ships.length > 0;
  const taxiReady = !!shuttleId && !!destinationShipId &&
    (payloadKind === 'fuel' || (passengerUids.length > 0 && passengerUids.length <= 2));
  const toggle = (items: readonly string[], value: string, set: (next: readonly string[]) => void) =>
    set(items.includes(value) ? items.filter(item => item !== value) : [...items, value]);

  return <section className="fleet-group-workspace" aria-label="Fleet group communication">
    <h2>Fleet group // {groupId}</h2>
    <p>Group notes and announcements stay with this fleet. The cycle and phase clock is shared across the session.</p>
    <section aria-label="Current fleet group position">
      <h3>Local group position</h3>
      {navigation ? <>
        <p>Position sample // {new Date(navigation.sampledAt).toLocaleTimeString()}</p>
        <ul aria-label="Current group ships">{navigation.ships.map(ship => <li key={ship.shipId}>
          {shipLabel(ship.shipId)} // {ship.coordinate}
        </li>)}</ul>
        {navigation.transits.length > 0 && <ul aria-label="Current group shuttle transits">{navigation.transits.map(transit =>
          <li key={transit.shuttleId}>{transit.shuttleId.toUpperCase()} in transit // {transit.destinationShipId} // sampled {new Date(transit.sampledAt).toLocaleTimeString()}</li>)}</ul>}
      </> : <p role="status">Current group positions are unavailable until a fresh server sample arrives.</p>}
    </section>
    <ul aria-label="Current group announcements">{notes.map(note => <li key={note.id}><p>{note.text}</p>
      <small>{note.actorUid === actorUid ? 'You' : 'Group participant'} // {new Date(note.sentAt).toLocaleTimeString()}</small></li>)}</ul>
    <label>Note to your fleet group<textarea maxLength={240} value={draft} onChange={event => onDraft(event.target.value)} disabled={busy} /></label>
    <div className="fleet-group-workspace__actions">
      <button type="button" disabled={busy || !draft.trim()} onClick={onSend}>Send group note</button>
      <button type="button" disabled={busy} onClick={onRefresh}>Refresh group notes</button>
      {onConfirm && <button type="button" disabled={busy} onClick={onConfirm}>Confirm separated fleet groups</button>}
    </div>
    {canShare && onShare && <section className="fleet-group-workspace__tool" aria-label="Share scanned system">
      <h3>Share a scanned system</h3>
      <p>Choose a coordinate known to your ship and one or more ships in this current group. Other groups and their locations stay hidden.</p>
      <label>Scanned system to share<select aria-label="Scanned system to share" value={coordinate} disabled={busy || scannedCoordinates.length === 0}
        onChange={event => setCoordinate(event.target.value)}>
        {scannedCoordinates.map(value => <option key={value} value={value}>{value}</option>)}
      </select></label>
      {ships.length > 0 ? <fieldset disabled={busy}>
        <legend>Ships that can receive this system</legend>
        <label><input type="checkbox" checked={allRecipients} onChange={event => setAllRecipients(event.target.checked)} />All ships in {groupId}</label>
        {!allRecipients && ships.map(ship => <label key={ship.shipId}>
          <input type="checkbox" aria-label={shipLabel(ship.shipId)} checked={recipientShipIds.includes(ship.shipId)}
            onChange={() => toggle(recipientShipIds, ship.shipId, setRecipientShipIds)} />{shipLabel(ship.shipId)}
        </label>)}
      </fieldset> : <p>Current group recipients are unavailable until a fresh server sample arrives.</p>}
      <button type="button" disabled={busy || !shareReady} onClick={() => onShare(coordinate, shareRecipients)}>
        Share scanned system
      </button>
    </section>}
    {onTaxi && taxiShuttles.length > 0 && <section className="fleet-group-workspace__tool" aria-label="Scout taxi transfer">
      <h3>Scout taxi // one round trip</h3>
      <p>One eligible shuttle attempt can carry up to two connected group members or one or two fuel units. The server checks current range, phase, shuttle authority, fuel, and membership before committing.</p>
      <label>Taxi shuttle<select aria-label="Taxi shuttle" value={shuttleId} disabled={busy} onChange={event => setShuttleId(event.target.value as FleetTaxiShuttleId)}>
        {taxiShuttles.map(id => <option key={id} value={id}>{id.toUpperCase()}</option>)}
      </select></label>
      <label>Taxi destination ship<select aria-label="Taxi destination ship" value={destinationShipId} disabled={busy || taxiDestinations.length === 0}
        onChange={event => setDestinationShipId(event.target.value)}>
        {taxiDestinations.map(id => <option key={id} value={id}>{shipLabel(id)}</option>)}
      </select></label>
      <label>Taxi payload<select aria-label="Taxi payload" value={payloadKind} disabled={busy}
        onChange={event => setPayloadKind(event.target.value as 'players' | 'fuel')}>
        <option value="fuel">Fuel</option><option value="players">Players</option>
      </select></label>
      {payloadKind === 'fuel' ? <label>Fuel units<select aria-label="Fuel units" value={fuelUnits} disabled={busy}
        onChange={event => setFuelUnits(Number(event.target.value) as 1 | 2)}><option value={1}>1 unit</option><option value={2}>2 units</option>
      </select></label> : <fieldset disabled={busy}>
        <legend>Connected members of this group</legend>
        {taxiPlayers.length ? taxiPlayers.map(player => <label key={player.uid}>
          <input type="checkbox" aria-label={player.label} checked={passengerUids.includes(player.uid)} disabled={!passengerUids.includes(player.uid) && passengerUids.length >= 2}
            onChange={() => toggle(passengerUids, player.uid, setPassengerUids)} />{player.label}
        </label>) : <p>No connected passengers are available in your current group.</p>}
      </fieldset>}
      <button type="button" disabled={busy || !taxiReady} onClick={() => onTaxi({ shuttleId: shuttleId as FleetTaxiShuttleId,
        targetShipId: destinationShipId, payload: payloadKind === 'fuel'
          ? { kind: 'fuel', units: fuelUnits } : { kind: 'players', playerUids: passengerUids } })}>
        Send scout taxi
      </button>
    </section>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}
