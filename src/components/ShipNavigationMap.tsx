import { useMemo } from 'react';
import { ORIGIN_GALACTIC_COORDINATE } from '@/data/ships';
import { visitedCoordinates } from '@/lib/navigationLog';
import type { ShipNavigationLogEntry } from '@/types/game';
import Starmap from './Starmap';

interface Props {
  readonly shipId: string;
  readonly shipName: string;
  readonly currentCoordinate: string;
  readonly navigationEntries?: readonly ShipNavigationLogEntry[];
  readonly visitedCoordinates?: readonly string[];
}

/**
 * Player-safe chart view: topology and the ship's own route only. The GM's
 * A/B/C site overlay is intentionally not mounted in this instrument.
 */
export default function ShipNavigationMap({
  shipId,
  shipName,
  currentCoordinate,
  navigationEntries = [],
  visitedCoordinates: explicitVisited,
}: Props) {
  const visited = useMemo(
    () => explicitVisited ?? visitedCoordinates(navigationEntries, currentCoordinate),
    [currentCoordinate, explicitVisited, navigationEntries],
  );

  return (
    <Starmap
      chart="A"
      mode="ship"
      selectedCoordinate={currentCoordinate || ORIGIN_GALACTIC_COORDINATE}
      visitedCoordinates={visited}
      fleetMarkers={[{
        id: `${shipId}-current-fix`,
        label: shipName,
        coordinate: currentCoordinate || ORIGIN_GALACTIC_COORDINATE,
        color: 'var(--ship-accent)',
      }]}
      className="starmap--ship"
    />
  );
}
