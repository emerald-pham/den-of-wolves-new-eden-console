import { useEffect, useState } from 'react';
import { ORIGIN_GALACTIC_COORDINATE, SHIPS } from '@/data/ships';
import { activeFleetShipIds } from '@/data/roles';
import type { GameSession } from '@/types/game';
import { moveShipToLocation } from '@/lib/sessionService';
import Starmap, { type StarmapFleetMarker } from './Starmap';

interface Props {
  readonly session: GameSession;
}

/**
 * GM-only adapter for the reusable map instrument. It reads the authoritative
 * fleet coordinate snapshot and selected setup chart. Only node selection is local.
 */
export default function GmStarmapModule({ session }: Props) {
  const chart = session.setup?.chartId ?? session.chartId ?? 'A';
  const [selectedCoordinate, setSelectedCoordinate] = useState(ORIGIN_GALACTIC_COORDINATE);
  const [selectedShipId, setSelectedShipId] = useState('aegis');
  const [moving, setMoving] = useState(false);
  const [status, setStatus] = useState('Select a plotted ship and a printed system.');
  const activeShipIds = new Set(activeFleetShipIds(session.activeRoleIds, session.activeVesselIds));
  const fleetMarkers: readonly StarmapFleetMarker[] = SHIPS
    .filter((ship) =>
      activeShipIds.has(ship.id) &&
      (session.capybaraEnabled !== false || ship.id !== 'capybara') &&
      (session.dioneEnabled !== false || ship.id !== 'dione') &&
      session.shipDamage?.[ship.id]?.destroyed !== true,
    )
    .map((ship) => ({
      id: ship.id,
      label: ship.name,
      coordinate: session.shipGalacticCoordinates?.[ship.id] ?? ORIGIN_GALACTIC_COORDINATE,
      color: ship.color,
    }));

  useEffect(() => {
    const selected = fleetMarkers.find((marker) => marker.id === selectedShipId) ?? fleetMarkers[0];
    if (!selected) return;
    if (!fleetMarkers.some((marker) => marker.id === selectedShipId)) setSelectedShipId(selected.id);
    setSelectedCoordinate((current) => current === ORIGIN_GALACTIC_COORDINATE && selected.coordinate !== current
      ? selected.coordinate
      : current);
  }, [fleetMarkers, selectedShipId]);

  const selectedShip = fleetMarkers.find((marker) => marker.id === selectedShipId);
  const groupedMarkers = new Map<string, StarmapFleetMarker[]>();
  for (const marker of fleetMarkers) {
    const groupId = session.shipFleetGroupIds?.[marker.id];
    if (!groupId) continue;
    groupedMarkers.set(groupId, [...(groupedMarkers.get(groupId) ?? []), marker]);
  }
  const fleetGroups = [...groupedMarkers.entries()].sort(([left], [right]) =>
    left.localeCompare(right, undefined, { numeric: true }));
  const gameplayFrozen = ['success', 'failure', 'debrief', 'closed'].includes(session.phase);
  const canMove = Boolean(
    selectedShip && selectedCoordinate !== selectedShip.coordinate && !moving && !gameplayFrozen,
  );

  async function moveSelectedShip(): Promise<void> {
    if (!selectedShip || !canMove) return;
    setMoving(true);
    setStatus(`Moving ${selectedShip.label} // ${selectedShip.coordinate} → ${selectedCoordinate}`);
    try {
      const result = await moveShipToLocation(selectedShip.id, selectedCoordinate);
      if (result.status === 'stale') {
        setStatus('Movement rejected // the chart changed, review the live vessel position.');
        return;
      }
      setStatus(`${selectedShip.label} moved // stardate ${result.stardate}`);
    } catch {
      setStatus('Movement rejected // review the GM uplink and current chart fix.');
    } finally {
      setMoving(false);
    }
  }

  return (
    <section className="gm-console__module gm-starmap cic-frame" aria-label="GM starmap">
      <div className="gm-starmap__controls" aria-label="GM ship movement controls">
        <label>
          Ship to move
          <select
            aria-label="Ship to move"
            value={selectedShip?.id ?? ''}
            onChange={(event) => {
              const shipId = event.target.value;
              setSelectedShipId(shipId);
              setSelectedCoordinate(fleetMarkers.find((marker) => marker.id === shipId)?.coordinate ?? ORIGIN_GALACTIC_COORDINATE);
              setStatus('Select a printed destination on the map.');
            }}
          >
            {fleetMarkers.map((marker) => <option key={marker.id} value={marker.id}>{marker.label}</option>)}
          </select>
        </label>
        <button
          className="cic-action-button"
          type="button"
          disabled={!canMove}
          onClick={() => void moveSelectedShip()}
        >
          Move ship to location
        </button>
        <p role="status">{gameplayFrozen
          ? 'Endgame evaluation // ship movement is frozen.'
          : status}</p>
      </div>
      {fleetGroups.length > 0 && <section
        className="gm-starmap__groups"
        role="region"
        aria-label="GM fleet group status"
      >
        <header>
          <p className="cic-overline">SERVER-OWNED GROUP PROJECTION</p>
          <h3>Fleet groups</h3>
        </header>
        <p>Ordinary communications remain within each group.</p>
        <div className="gm-starmap__group-grid">
          {fleetGroups.map(([groupId, markers]) => {
            const coordinates = [...new Set(markers.map((marker) => marker.coordinate))];
            const location = coordinates.length === 1
              ? coordinates[0]
              : `LOCATION CONFLICT // ${coordinates.join(' // ')}`;
            const pursuit = session.pursuitGroups?.[groupId];
            return <section
              className="gm-starmap__group cic-frame"
              role="region"
              aria-label={`${groupId.toUpperCase()} status`}
              data-fleet-group-id={groupId}
              key={groupId}
            >
              <h4>{groupId.toUpperCase()}</h4>
              <dl>
                <div><dt>Ships</dt><dd>{markers.map((marker) => marker.label.toUpperCase()).join(' // ')}</dd></div>
                <div><dt>Current location</dt><dd>{location}</dd></div>
                <div><dt>Wolf pursuit</dt><dd>{pursuit === undefined ? 'Pursuit unavailable' : `${pursuit} / 10`}</dd></div>
              </dl>
            </section>;
          })}
        </div>
      </section>}
      <Starmap
        chart={chart}
        {...(session.organiserSites ? { organiserSites: session.organiserSites } : {})}
        {...(session.organiserSystems ? { knownSystems: session.organiserSystems } : {})}
        selectedCoordinate={selectedCoordinate}
        onSystemSelect={setSelectedCoordinate}
        fleetMarkers={fleetMarkers}
      />
    </section>
  );
}
