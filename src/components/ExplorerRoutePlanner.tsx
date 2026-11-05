import { useMemo, useState } from 'react';
import { planKnownExplorerRoute } from '@/lib/explorerRoutePlanning';
import type { ShipNavigationLogEntry } from '@/types/game';
import './ExplorerRoutePlanner.css';

/** Current ship state the route estimate reads; the Jump Drive callable still decides. */
export interface ExplorerJumpReadiness {
  readonly shipName: string;
  readonly fuel: number;
  /** Printed short, medium and long costs before any upgrade discount. */
  readonly jumpCosts: readonly number[];
  readonly upgraded: boolean;
  readonly charged: boolean;
  readonly damaged: boolean;
  readonly jumpedThisCycle: boolean;
  /** True only for a live, server-fresh session snapshot. */
  readonly current: boolean;
}

interface Props {
  readonly currentCoordinate: string;
  /** Undefined until the entitled chart projection arrives. */
  readonly knownCoordinates: readonly string[] | undefined;
  readonly knownSystems: Readonly<Record<string, string>> | undefined;
  readonly readiness?: ExplorerJumpReadiness | undefined;
  /** Server-owned navigation log for the planner's own ship. */
  readonly navigationEntries?: readonly ShipNavigationLogEntry[] | undefined;
  /** Scopes the locally remembered destination to one session and ship. */
  readonly planKey?: string | undefined;
}

const LENGTHS = ['SHORT', 'MEDIUM', 'LONG'] as const;
const PLAN_STORAGE_PREFIX = 'dow.explorerRoutePlan.';

function readPlan(planKey: string | undefined): string {
  if (!planKey) return '';
  try {
    const stored = window.sessionStorage.getItem(`${PLAN_STORAGE_PREFIX}${planKey}`);
    return stored && /^\d{4}$/.test(stored) ? stored : '';
  } catch {
    return '';
  }
}

function writePlan(planKey: string | undefined, destination: string): void {
  if (!planKey) return;
  try {
    if (destination) window.sessionStorage.setItem(`${PLAN_STORAGE_PREFIX}${planKey}`, destination);
    else window.sessionStorage.removeItem(`${PLAN_STORAGE_PREFIX}${planKey}`);
  } catch {
    // The plan is a local convenience; the committed position stays server-owned.
  }
}

function readinessMessages(readiness: ExplorerJumpReadiness, cost: number | undefined): readonly string[] {
  if (!readiness.current) {
    return ['Live ship state unavailable // reconnect before relying on fuel, charge or jump eligibility.'];
  }
  const blockers: string[] = [];
  if (readiness.jumpedThisCycle) {
    blockers.push(`${readiness.shipName} already jumped this cycle // plan the next jump for the next cycle.`);
  } else {
    if (!readiness.charged) blockers.push('Jump Drive not charged this cycle // charge it during maintenance.');
    if (cost !== undefined && readiness.fuel < cost) {
      blockers.push(`Fuel may be short // ${readiness.fuel} held; up to ${cost} required.`);
    }
  }
  if (readiness.damaged) blockers.push('Jump Drive damaged // the jump may fail.');
  if (blockers.length > 0) return blockers;
  return ['Jump Drive charged // commit the jump from Ship systems → Jump Drive control.'];
}

export default function ExplorerRoutePlanner({
  currentCoordinate,
  knownCoordinates,
  knownSystems,
  readiness,
  navigationEntries = [],
  planKey,
}: Props) {
  const [selectedDestination, setSelectedDestination] = useState(() => readPlan(planKey));
  const projectionAvailable = knownCoordinates !== undefined && knownSystems !== undefined;
  const destinations = useMemo(() => [...new Set(knownCoordinates ?? [])]
    .filter((coordinate) => coordinate !== currentCoordinate &&
      Object.values(knownSystems ?? {}).includes(coordinate))
    .sort(), [currentCoordinate, knownCoordinates, knownSystems]);
  const arrived = projectionAvailable && selectedDestination !== '' && selectedDestination === currentCoordinate;
  const destination = destinations.includes(selectedDestination) ? selectedDestination : '';
  const route = destination
    ? planKnownExplorerRoute(currentCoordinate, destination, knownCoordinates ?? [], knownSystems ?? {})
    : null;
  // The server measures the shortest printed route, which may pass unknown
  // systems, so the known route gives only the upper bound of one jump.
  const lengthIndex = route ? Math.min(route.length - 2, 2) : undefined;
  const cost = readiness && lengthIndex !== undefined
    ? Math.max(0, (readiness.jumpCosts[lengthIndex] ?? 0) - (readiness.upgraded ? 1 : 0))
    : undefined;
  const lastJump = [...navigationEntries].reverse().find((entry) => entry.type === 'self-jump');
  const shipName = readiness?.shipName ?? 'ship';

  function choose(value: string): void {
    setSelectedDestination(value);
    writePlan(planKey, value);
  }

  return (
    <section className="console-workspace__section shuttle-control explorer-route-planner"
      aria-label="Explorer route planner">
      <h3>Route planner</h3>
      <p className="explorer-route-planner__guidance">
        Choose a system in your current chart projection to see the shortest route through known systems.
      </p>
      <label>
        Known route destination
        <select value={destination} onChange={(event) => choose(event.target.value)}>
          <option value="">Choose a known destination</option>
          {destinations.map((coordinate) => (
            <option value={coordinate} key={coordinate}>{coordinate}</option>
          ))}
        </select>
      </label>
      {arrived ? (
        <p className="explorer-route-planner__result" role="status" aria-live="polite">
          Arrived // {currentCoordinate} is the committed position of the {shipName}.
        </p>
      ) : route ? (
        <p className="explorer-route-planner__result" role="status" aria-live="polite">
          Planned route // {route.join(' → ')} // {route.length - 1} {route.length === 2 ? 'jump' : 'jumps'}
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
      {route && readiness?.current && cost !== undefined && lengthIndex !== undefined && (
        <p className="explorer-route-planner__estimate" role="note" aria-label="Jump estimate">
          One jump // {LENGTHS[lengthIndex]} at most // up to {cost} fuel // {readiness.shipName} holds {readiness.fuel}
        </p>
      )}
      {readiness && (route || arrived) && (
        <ul className="explorer-route-planner__readiness" aria-label="Jump readiness">
          {readinessMessages(readiness, cost).map((message) => <li key={message}>{message}</li>)}
        </ul>
      )}
      <p className="explorer-route-planner__committed" role="note" aria-label="Committed movement">
        {!projectionAvailable
          ? 'Committed movement unavailable until the live chart projection arrives.'
          : lastJump
            ? lastJump.navigationalError
              ? `Last committed movement // navigational error // ${lastJump.origin} → ${lastJump.destination} // stardate ${lastJump.stardate}`
              : `Last committed jump // ${lastJump.origin} → ${lastJump.destination} // stardate ${lastJump.stardate}`
            : `No jump committed yet // position ${currentCoordinate}.`}
      </p>
      <p className="explorer-route-planner__guidance">
        Planning only // movement remains with the ship's Jump Drive and its current server checks.
      </p>
    </section>
  );
}
