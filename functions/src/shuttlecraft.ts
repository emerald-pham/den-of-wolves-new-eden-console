import { ROLE_OWNED_CRAFT_CATALOG, roleOwnedCraftForRoles } from './craftOwnership';
import { RESOURCE_IDS } from './resources';

const ROLE_OWNED_SHUTTLE_IDS: ReadonlySet<string> = new Set(
  ROLE_OWNED_CRAFT_CATALOG.filter((craft) => craft.kind === 'shuttle').map((craft) => craft.id),
);

/** Scrap is a printed cargo ledger on the two Capybara expansion shuttles. */
export const SCRAP_SHUTTLE_IDS = ['macaw', 'boa'] as const;

const CAPYBARA_EXPANSION_ROLE_IDS = ['capybara-captain', 'capybara-recycler'] as const;

/** Return only Scrap-capable shuttles whose Capybara roles are enabled. */
export function scrapShuttleIdsForRoles(activeRoleIds: readonly string[]): ReadonlySet<string> {
  const activeRoles = new Set(activeRoleIds);
  if (!CAPYBARA_EXPANSION_ROLE_IDS.every((roleId) => activeRoles.has(roleId))) return new Set();
  const enabledShuttleIds = new Set(roleOwnedCraftForRoles(activeRoleIds)
    .filter((craft) => craft.kind === 'shuttle')
    .map((craft) => craft.id));
  return new Set(SCRAP_SHUTTLE_IDS.filter((shuttleId) => enabledShuttleIds.has(shuttleId)));
}

/**
 * Parse server-owned shuttle cargo while keeping Scrap scoped to its printed
 * ledgers. Other cargo fields retain the existing projection rules.
 */
export function sanitizeShuttleCargo(
  value: unknown,
  activeRoleIds: readonly string[],
): Record<string, Record<string, number>> {
  const stored = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  const knownCargoIds: ReadonlySet<string> = new Set(RESOURCE_IDS);
  const scrapShuttleIds = scrapShuttleIdsForRoles(activeRoleIds);
  return Object.fromEntries(Object.entries(stored).flatMap(([shuttleId, cargo]) => {
    if (!isAuthorizedShuttleId(shuttleId) || typeof cargo !== 'object' || cargo === null || Array.isArray(cargo)) {
      return [];
    }
    const parsed = Object.fromEntries(Object.entries(cargo as Record<string, unknown>).flatMap(([resourceId, amount]) => {
      if (!knownCargoIds.has(resourceId) || typeof amount !== 'number' || !Number.isFinite(amount)) return [];
      if (resourceId === 'scrap' && !scrapShuttleIds.has(shuttleId)) return [];
      if (resourceId === 'scrap' && (!Number.isSafeInteger(amount) || amount < 0)) return [];
      return [[resourceId, amount]];
    }));
    return [[shuttleId, parsed]];
  }));
}

function isAuthorizedShuttleId(shuttleId: string): boolean {
  return ROLE_OWNED_SHUTTLE_IDS.has(shuttleId);
}

/**
 * Server-owned initial shuttle manifest. The Union craft are intentionally
 * absent from the default core roster: their printed sheets do not say
 * which optional Union pairing begins with each craft, so a facilitator
 * enables the paired Union role and establishes docking when it is in play.
 */
export const INITIAL_SHUTTLE_DOCKINGS = [
  { shuttleId: 'snn-press-shuttle', shipId: 'dione', dockedAt: 'SESSION START' },
  { shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'SESSION START' },
  { shuttleId: 'pallas', shipId: 'aegis', dockedAt: 'SESSION START' },
  { shuttleId: 'philia', shipId: 'dione', dockedAt: 'SESSION START' },
  { shuttleId: 'maliades', shipId: 'dione', dockedAt: 'SESSION START' },
  { shuttleId: 'highwall', shipId: 'icebreaker', dockedAt: 'SESSION START' },
  { shuttleId: 'blacksmith', shipId: 'icebreaker', dockedAt: 'SESSION START' },
  { shuttleId: 'macaw', shipId: 'capybara', dockedAt: 'SESSION START' },
  { shuttleId: 'boa', shipId: 'capybara', dockedAt: 'SESSION START' },
  { shuttleId: 'endeavour', shipId: 'shepherd', dockedAt: 'SESSION START' },
  { shuttleId: 'black-sheep', shipId: 'shepherd', dockedAt: 'SESSION START' },
  { shuttleId: 'hummingbird', shipId: 'quellon', dockedAt: 'SESSION START' },
  { shuttleId: 'condor', shipId: 'quellon', dockedAt: 'SESSION START' },
  { shuttleId: 'chacau', shipId: 'refinery-124', dockedAt: 'SESSION START' },
  { shuttleId: 'chepu', shipId: 'refinery-124', dockedAt: 'SESSION START' },
];

export const INITIAL_SHUTTLE_VISITS = INITIAL_SHUTTLE_DOCKINGS.map((docking) => ({
  id: docking.shuttleId === 'snn-press-shuttle'
    ? 'snn-initial-dione-docking'
    : `${docking.shuttleId}-initial-${docking.shipId}-docking`,
  shuttleId: docking.shuttleId,
  shipId: docking.shipId,
  action: 'docked' as const,
  occurredAt: 'SESSION START',
}));

/** Keep stored craft projections aligned with the vessels in the locked roster. */
export function activeShuttleDockingsForVessels(
  dockings: readonly typeof INITIAL_SHUTTLE_DOCKINGS[number][],
  activeVesselIds: readonly string[],
): readonly typeof INITIAL_SHUTTLE_DOCKINGS[number][] {
  const active = new Set(activeVesselIds);
  return dockings.filter((docking) =>
    docking.shuttleId === 'snn-press-shuttle' || active.has(docking.shipId));
}

/** Drop visit history for craft removed from the active vessel projection. */
export function activeShuttleVisitsForDockings<T extends { shuttleId: string }>(
  visits: readonly T[],
  dockings: readonly { shuttleId: string }[],
): readonly T[] {
  const shuttleIds = new Set(dockings.map((docking) => docking.shuttleId));
  return visits.filter((visit) => shuttleIds.has(visit.shuttleId));
}

/**
 * The Press shuttle is available independently of the core roster, but its
 * legal initial host follows the vessels that are actually locked into that
 * roster. Dione is not present in the 8–11 player presets, so those sessions
 * begin at Aegis; the 12+ presets that include a Dione role begin at Dione.
 */
export function initialShuttleDockingsForRoles(
  activeRoleIds: readonly string[],
): readonly typeof INITIAL_SHUTTLE_DOCKINGS[number][] {
  const enabledShuttleIds = new Set(roleOwnedCraftForRoles(activeRoleIds)
    .filter((craft) => craft.kind === 'shuttle')
    .map((craft) => craft.id));
  const initialHost = activeRoleIds.some((roleId) => roleId.startsWith('dione-'))
    ? 'dione'
    : 'aegis';
  const shipIsActive = (shipId: string): boolean => {
    if (shipId === 'aegis') {
      return activeRoleIds.some((roleId) =>
        roleId === 'admiral' || roleId === 'executive-officer' || roleId === 'wing-commander');
    }
    return activeRoleIds.some((roleId) => roleId.startsWith(`${shipId}-`));
  };
  return INITIAL_SHUTTLE_DOCKINGS
    .filter((docking) => enabledShuttleIds.has(docking.shuttleId) &&
      (docking.shuttleId === 'snn-press-shuttle' || shipIsActive(docking.shipId)))
    .map((docking) => docking.shuttleId === 'snn-press-shuttle'
      ? { ...docking, shipId: initialHost }
      : docking);
}

export function initialShuttleVisitsForDockings(
  dockings: readonly typeof INITIAL_SHUTTLE_DOCKINGS[number][],
) {
  return dockings.map((docking) => ({
    id: docking.shuttleId === 'snn-press-shuttle'
      ? `snn-initial-${docking.shipId}-docking`
      : `${docking.shuttleId}-initial-${docking.shipId}-docking`,
    shuttleId: docking.shuttleId,
    shipId: docking.shipId,
    action: 'docked' as const,
    occurredAt: 'SESSION START',
  }));
}
