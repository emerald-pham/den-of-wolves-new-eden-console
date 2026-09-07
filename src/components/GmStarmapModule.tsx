import { useEffect, useState } from 'react';
import { ORIGIN_GALACTIC_COORDINATE, SHIPS } from '@/data/ships';
import type { StarChartId } from '@/data/starChart';
import type { GameSession } from '@/types/game';
import { moveShipToLocation } from '@/lib/sessionService';
import Starmap, { type StarmapFleetMarker } from './Starmap';

interface Props {
  readonly session: GameSession;
}

/**
 * GM-only adapter for the reusable map instrument. It reads the authoritative
 * fleet coordinate snapshot but keeps chart choice and node selection local
 * until the session has an explicit shared chart-selection field.
 */
export default function GmStarmapModule({ session }: Props) {
  const [chart, setChart] = useState<StarChartId>('A');
  const [selectedCoordinate, setSelectedCoordinate] = useState(ORIGIN_GALACTIC_COORDINATE);
  const [selectedShipId, setSelectedShipId] = useState('aegis');
  const [moving, setMoving] = useState(false);
  const [status, setStatus] = useState('Select a plotted ship and a printed system.');
  const fleetMarkers: readonly StarmapFleetMarker[] = SHIPS
    .filter((ship) =>
      (session.capybaraEnabled !== false || ship.id !== 'capybara') &&
      (session.dioneEnabled !== false || ship.id !== 'dione'),
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
  const canMove = Boolean(selectedShip && selectedCoordinate !== selectedShip.coordinate && !moving);

  async function moveSelectedShip(): Promise<void> {
    if (!selectedShip || !canMove) return;
    setMoving(true);
    setStatus(`Moving ${selectedShip.label} // ${selectedShip.coordinate} → ${selectedCoordinate}`);
    try {
      const result = await moveShipToLocation(selectedShip.id, selectedCoordinate);
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
        <p role="status">{status}</p>
      </div>
      <Starmap
        chart={chart}
        onChartChange={setChart}
        selectedCoordinate={selectedCoordinate}
        onSystemSelect={setSelectedCoordinate}
        fleetMarkers={fleetMarkers}
      />
    </section>
  );
}
