import { ROLE_OWNED_CRAFT_CATALOG, roleOwnedCraftForRoles, shuttleHostIsAllowed } from './craftOwnership';
import { catastropheEventIdForShip, parseCraftHostRepair, craftHostLossHasCurrentProof, type CraftHostRepair } from './shipDestruction';
import { initialShuttleVisitsForDockings } from './shuttlecraft';

/** Owner ruling 2026-10-15: an enabled craft never assigned to a player is
 * lost with its host. This terminal record grants no custody or ability. */
export interface LostShuttleEntry {
  readonly status: 'lost';
  readonly shuttleId: string;
  readonly ownerRoleId: string;
  readonly destroyedHostShipId: string;
  readonly cycle: number;
  readonly sourceId: string;
  readonly lostAt: string;
  readonly hostRepair?: CraftHostRepair;
}
export type LostShuttleState = Readonly<Record<string, LostShuttleEntry>>;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function parseLostShuttles(value: unknown): LostShuttleState | null {
  if (value === undefined) return {};
  if (!record(value)) return null;
  const result: Record<string, LostShuttleEntry> = {};
  const catalog = new Map(ROLE_OWNED_CRAFT_CATALOG.filter(craft => craft.kind === 'shuttle').map(craft => [craft.id, craft]));
  for (const [id, raw] of Object.entries(value)) {
    if (!record(raw) || Object.keys(raw).length !== (Object.hasOwn(raw, 'hostRepair') ? 8 : 7) ||
        Object.keys(raw).some(key => !['status','shuttleId','ownerRoleId','destroyedHostShipId','cycle','sourceId','lostAt','hostRepair'].includes(key)) ||
        raw.status !== 'lost' || raw.shuttleId !== id || typeof raw.ownerRoleId !== 'string' ||
        typeof raw.destroyedHostShipId !== 'string' || catalog.get(id)?.ownerRoleId !== raw.ownerRoleId ||
        !shuttleHostIsAllowed(id, raw.destroyedHostShipId) ||
        !Number.isSafeInteger(raw.cycle) || Number(raw.cycle) < 1 ||
        raw.sourceId !== catastropheEventIdForShip(raw.destroyedHostShipId) ||
        typeof raw.lostAt !== 'string' || !Number.isFinite(Date.parse(raw.lostAt)) ||
        Object.hasOwn(raw, 'hostRepair') && !parseCraftHostRepair(raw.hostRepair, String(raw.sourceId), String(raw.lostAt))) return null;
    result[id] = raw as unknown as LostShuttleEntry;
  }
  return result;
}

/** A never-assigned craft has only its canonical initial docking history.
 * Missing, moved, duplicate or foreign history is never proof of no owner. */
export function hasInitialOnlyShuttleHistory(shuttleId: string, host: string, visits: unknown): boolean {
  if (!Array.isArray(visits)) return false;
  const actual = visits.filter(visit => record(visit) && visit.shuttleId === shuttleId);
  const expected = initialShuttleVisitsForDockings([{ shuttleId, shipId: host, dockedAt: 'SESSION START' }])[0]!;
  return actual.length === 1 && record(actual[0]) &&
    Object.keys(actual[0]).length === Object.keys(expected).length &&
    Object.entries(expected).every(([key, value]) => actual[0][key] === value);
}

/** Validate terminal provenance before excluding a craft from any live manifest. */
export function validatedLostShuttles(value: unknown, context: Readonly<{
  activeRoleIds: readonly string[];
  activeVesselIds: readonly string[];
  currentCycle: number;
  shipDamage: unknown;
  vesselActionRevisions?: unknown;
  dockings: unknown;
  visits: unknown;
  control: unknown;
  retained: unknown;
  cargo?: unknown;
  fuelled?: unknown;
}>): LostShuttleState {
  const lost = parseLostShuttles(value);
  if (!lost) throw new Error('Lost shuttle history is malformed.');
  if (Object.keys(lost).length === 0) return lost;
  const enabled = new Map(roleOwnedCraftForRoles(context.activeRoleIds)
    .filter(craft => craft.kind === 'shuttle').map(craft => [craft.id, craft]));
  const maps = [context.control, context.retained, context.cargo, context.fuelled];
  if (!Array.isArray(context.dockings) || !record(context.shipDamage) || !record(context.control) ||
      maps.some(map => map !== undefined && !record(map))) throw new Error('Lost shuttle authority is malformed.');
  for (const [id, entry] of Object.entries(lost)) {
    if (enabled.get(id)?.ownerRoleId !== entry.ownerRoleId ||
        !context.activeVesselIds.includes(entry.destroyedHostShipId) ||
        !shuttleHostIsAllowed(id, entry.destroyedHostShipId) ||
        !craftHostLossHasCurrentProof(entry, context.shipDamage, context.vesselActionRevisions) ||
        !Number.isSafeInteger(context.currentCycle) || entry.cycle > context.currentCycle ||
        maps.some(map => record(map) && Object.hasOwn(map, id)) ||
        context.dockings.some(dock => record(dock) && dock.shuttleId === id) ||
        !hasInitialOnlyShuttleHistory(id, entry.destroyedHostShipId, context.visits)) {
      throw new Error('Lost shuttle history contradicts current manifest or custody.');
    }
  }
  return lost;
}
