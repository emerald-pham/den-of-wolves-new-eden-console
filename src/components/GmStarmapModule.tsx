import { useState } from 'react';
import { ORIGIN_GALACTIC_COORDINATE, SHIPS } from '@/data/ships';
import type { StarChartId } from '@/data/starChart';
import type { GameSession } from '@/types/game';
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

  return (
    <section className="gm-console__module gm-starmap cic-frame" aria-label="GM starmap">
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
