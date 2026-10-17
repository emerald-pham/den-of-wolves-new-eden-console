import { useMemo, useState } from 'react';
import { planKnownExplorerRoute } from '@/lib/explorerRoutePlanning';
import './ExplorerRoutePlanner.css';

interface Props {
  readonly currentCoordinate: string;
  readonly knownCoordinates: readonly string[];
  readonly knownSystems: Readonly<Record<string, string>>;
}

export default function ExplorerRoutePlanner({
  currentCoordinate,
  knownCoordinates,
  knownSystems,
}: Props) {
  const [selectedDestination, setSelectedDestination] = useState('');
  const destinations = useMemo(() => [...new Set(knownCoordinates)]
    .filter((coordinate) => coordinate !== currentCoordinate &&
      Object.values(knownSystems).includes(coordinate))
    .sort(), [currentCoordinate, knownCoordinates, knownSystems]);
  const destination = destinations.includes(selectedDestination) ? selectedDestination : '';
  const route = destination
    ? planKnownExplorerRoute(currentCoordinate, destination, knownCoordinates, knownSystems)
    : null;

  return (
    <section className="console-workspace__section shuttle-control explorer-route-planner"
      aria-label="Explorer route planner">
      <h3>Route planner</h3>
      <p className="explorer-route-planner__guidance">
        Choose a system in your current chart projection to see the shortest route through known systems.
      </p>
      <label>
        Known route destination
        <select value={destination} onChange={(event) => setSelectedDestination(event.target.value)}>
          <option value="">Choose a known destination</option>
          {destinations.map((coordinate) => (
            <option value={coordinate} key={coordinate}>{coordinate}</option>
          ))}
        </select>
      </label>
      {route ? (
        <p className="explorer-route-planner__result" role="status" aria-live="polite">
          Planned route // {route.join(' → ')} // {route.length - 1} jumps
        </p>
      ) : destination ? (
        <p className="explorer-route-planner__result" role="status" aria-live="polite">
          No fully known route is available from the current chart projection.
        </p>
      ) : (
        <p className="explorer-route-planner__result" role="status" aria-live="polite">
          {destinations.length > 0
            ? `Current position // ${currentCoordinate} // ${destinations.length} known destination${destinations.length === 1 ? '' : 's'}.`
            : 'No other known destination is available in the current chart projection.'}
        </p>
      )}
      <p className="explorer-route-planner__guidance">
        Planning only // movement remains with the ship's Jump Drive and its current server checks.
      </p>
    </section>
  );
}
