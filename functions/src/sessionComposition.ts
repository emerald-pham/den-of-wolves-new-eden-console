import type { CanonicalSessionSetup } from './gameSetup';
import {
  INITIAL_SHIP_RESOURCES,
  INITIAL_SHIP_UNREST,
  type ShipResourceInventories,
} from './resources';
import {
  INITIAL_SHIP_SURVIVORS,
} from './shipPopulation';
import {
  initialShuttleDockingsForRoles,
  initialShuttleVisitsForDockings,
} from './shuttlecraft';

type ShuttleDocking = ReturnType<typeof initialShuttleDockingsForRoles>[number];
type ShuttleVisit = ReturnType<typeof initialShuttleVisitsForDockings>[number];

/** Select one immutable setup's fleet data from the shared source catalogs. */
export function activeVesselRecord<T>(
  source: Readonly<Record<string, T>>,
  activeVesselIds: readonly string[],
): Record<string, T> {
  return Object.fromEntries(
    [...new Set(activeVesselIds)]
      .filter((vesselId) => Object.prototype.hasOwnProperty.call(source, vesselId))
      .map((vesselId) => [vesselId, source[vesselId]!]),
  );
}

export interface InitialSessionComposition {
  readonly shipResources: ShipResourceInventories;
  readonly shipUnrest: Readonly<Record<string, number>>;
  readonly shipSurvivors: Readonly<Record<string, number>>;
  readonly shuttleDockings: readonly ShuttleDocking[];
  readonly shuttleVisitLog: readonly ShuttleVisit[];
}

/**
 * Compose the starting data once from the canonical setup tuple.
 *
 * The source catalogs intentionally contain every vessel definition. A lobby
 * receives only the vessels selected by its locked roster, so expansion-only
 * Capybara stores and craft cannot appear in base or no-Capybara sessions.
 */
export function initialSessionComposition(
  setup: Pick<CanonicalSessionSetup, 'activeRoleIds' | 'activeVesselIds'>,
): InitialSessionComposition {
  const activeVesselIds = [...new Set(setup.activeVesselIds)];
  const shipResources = activeVesselRecord(INITIAL_SHIP_RESOURCES, activeVesselIds);
  const shipUnrest = activeVesselRecord(INITIAL_SHIP_UNREST, activeVesselIds);
  const shipSurvivors = activeVesselRecord(INITIAL_SHIP_SURVIVORS, activeVesselIds);
  const shuttleDockings = [...initialShuttleDockingsForRoles(setup.activeRoleIds)];
  return {
    shipResources,
    shipUnrest,
    shipSurvivors,
    shuttleDockings,
    shuttleVisitLog: initialShuttleVisitsForDockings(shuttleDockings),
  };
}
