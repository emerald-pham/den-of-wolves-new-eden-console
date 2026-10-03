import {
  roleOwnedCraftForRoles,
  shuttleDockingsAreKnownAndUnique,
  shuttleDockingsAreParked,
  shuttleDockingsMatchActiveRoleOwnedSubset,
  shuttleHostIsAllowed,
} from './craftOwnership';
import { parseRetainedShuttles } from './retainedShuttles';
import { initialShuttleControl, parseShuttleControl, type ShuttleControlEntry, type ShuttleControlState } from './shuttleControl';

export type WolfBoardingShipId = 'aegis' | 'dione' | 'icebreaker' | 'quellon' | 'shepherd' | 'refinery-124' | 'capybara';

export interface WolfBoardingCraftAuthorityInput {
  readonly activeRoleIds: readonly string[];
  readonly activeVesselIds: readonly string[];
  readonly dockings: readonly Readonly<{ shuttleId: string; shipId: string; dockedAt: string }>[];
  readonly visits: readonly Readonly<{
    id: string; shuttleId: string; shipId: string; action: 'docked' | 'departed'; occurredAt: string;
  }>[];
  readonly control: unknown;
  readonly fuelled: unknown;
  readonly roleHolders: readonly Readonly<{ uid: string; roleId: string }>[];
  readonly playerUids: readonly string[];
  readonly retainedShuttles: unknown;
}

export interface WolfBoardingCraftAuthority {
  readonly shuttleId: string;
  readonly ownerRoleId: string;
  readonly ownerUid: string;
  readonly holderUid: string;
  readonly controlRevision: number;
  readonly hostShipId: WolfBoardingShipId;
  readonly fuelled: boolean;
  readonly pallasRerolls: boolean;
  readonly fuelledRelocation: boolean;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} authority is malformed.`);
  }
  return value as Record<string, unknown>;
}

function validateSupportVisitHistory(
  shuttleIds: ReadonlySet<string>,
  dockings: WolfBoardingCraftAuthorityInput['dockings'],
  visits: WolfBoardingCraftAuthorityInput['visits'],
  activeVesselIds: readonly string[],
  retained: ReturnType<typeof parseRetainedShuttles>,
): void {
  if (!Array.isArray(visits)) throw new Error('Shuttle visit history is unavailable.');
  const visitIds = new Set<string>();
  const latest = new Map<string, { action: 'docked' | 'departed'; shipId: string }>();
  for (const visit of visits) {
    if (!visit || typeof visit.id !== 'string' || visit.id.length === 0 || visitIds.has(visit.id) ||
        !shuttleIds.has(visit.shuttleId) || !activeVesselIds.includes(visit.shipId) ||
        (visit.action !== 'docked' && visit.action !== 'departed') ||
        typeof visit.occurredAt !== 'string' || !visit.occurredAt.trim()) {
      throw new Error('Shuttle visit history is malformed or unauthorized.');
    }
    visitIds.add(visit.id);
    const prior = latest.get(visit.shuttleId);
    if (!prior && visit.action !== 'docked' || prior &&
        (prior.action === visit.action || visit.action === 'departed' && prior.shipId !== visit.shipId)) {
      throw new Error('Shuttle visit history contains an impossible transition.');
    }
    latest.set(visit.shuttleId, { action: visit.action, shipId: visit.shipId });
  }
  const dockById = new Map(dockings.map((docking) => [docking.shuttleId, docking.shipId]));
  for (const shuttleId of shuttleIds) {
    const last = latest.get(shuttleId);
    const retainedShuttle = retained?.[shuttleId];
    const host = dockById.get(shuttleId);
    if (!last || (host !== undefined && (retainedShuttle !== undefined || last.action !== 'docked' || last.shipId !== host)) ||
        (host === undefined && retainedShuttle === undefined && last.action !== 'departed') ||
        (host === undefined && retainedShuttle !== undefined &&
          (last.action !== 'docked' || last.shipId !== retainedShuttle.destroyedHostShipId))) {
      throw new Error('Current boarding support location does not match its visit history.');
    }
  }
}

/** Resolve the printed support craft against current docking and custody without merging their ledgers. */
export function deriveWolfBoardingSupportCraft(
  input: WolfBoardingCraftAuthorityInput,
): readonly WolfBoardingCraftAuthority[] {
  if (!Array.isArray(input.activeRoleIds) || new Set(input.activeRoleIds).size !== input.activeRoleIds.length ||
      !Array.isArray(input.activeVesselIds) || new Set(input.activeVesselIds).size !== input.activeVesselIds.length ||
      !Array.isArray(input.dockings) || !Array.isArray(input.roleHolders) || !Array.isArray(input.playerUids)) {
    throw new Error('Wolf boarding craft authority is malformed.');
  }
  if (!shuttleDockingsAreKnownAndUnique(input.dockings) ||
      !shuttleDockingsAreParked(input.dockings, input.activeVesselIds) ||
      !shuttleDockingsMatchActiveRoleOwnedSubset(input.activeRoleIds, input.dockings)) {
    throw new Error('Wolf boarding craft dockings are malformed or unauthorized.');
  }
  const retained = parseRetainedShuttles(input.retainedShuttles);
  if (!retained) throw new Error('Retained shuttle authority is malformed.');
  const supportCraft = roleOwnedCraftForRoles(input.activeRoleIds)
    .filter((craft) => craft.kind === 'shuttle' && craft.boardingSupport !== undefined);
  const supportIds = new Set(supportCraft.map(({ id }) => id));
  validateSupportVisitHistory(supportIds, input.dockings, input.visits, input.activeVesselIds, retained);
  const dockById = new Map(input.dockings.map((docking) => [docking.shuttleId, docking.shipId]));
  const rawControl = input.control === undefined
    ? initialShuttleControl(supportCraft, input.roleHolders)
    : parseShuttleControl(input.control);
  if (!rawControl) throw new Error('Wolf boarding craft custody is malformed.');
  const fuelled = input.fuelled === undefined ? {} : requireRecord(input.fuelled, 'Shuttle fuel');
  if (Object.values(fuelled).some((value) => typeof value !== 'boolean')) {
    throw new Error('Shuttle fuel authority is malformed.');
  }
  const playerUids = new Set(input.playerUids);
  const result: WolfBoardingCraftAuthority[] = [];
  for (const craft of supportCraft) {
    const hostShipId = dockById.get(craft.id);
    if (!hostShipId || retained[craft.id] || !shuttleHostIsAllowed(craft.id, hostShipId)) continue;
    const entry = rawControl[craft.id];
    const roleOwners = input.roleHolders.filter(({ roleId }) => roleId === craft.ownerRoleId);
    if (!entry || entry.shuttleId !== craft.id || entry.ownerRoleId !== craft.ownerRoleId ||
        roleOwners.length !== 1 || entry.ownerUid !== roleOwners[0]?.uid ||
        !playerUids.has(entry.ownerUid) || !playerUids.has(entry.holderUid)) {
      throw new Error(`The printed owner or current holder for ${craft.id} is unavailable.`);
    }
    result.push({
      shuttleId: craft.id,
      ownerRoleId: craft.ownerRoleId,
      ownerUid: entry.ownerUid,
      holderUid: entry.holderUid,
      controlRevision: entry.revision,
      hostShipId: hostShipId as WolfBoardingShipId,
      fuelled: fuelled[craft.id] === true,
      pallasRerolls: craft.boardingSupport === 'security-teams+pallas-reroll+fuelled-relocation',
      fuelledRelocation: craft.boardingSupport === 'security-teams+pallas-reroll+fuelled-relocation' ||
        craft.boardingSupport === 'security-teams+fuelled-relocation',
    });
  }
  return Object.freeze(result.map((craft) => Object.freeze(craft)));
}

export function relocateWolfBoardingSupportCraft(input: Readonly<{
  authority: WolfBoardingCraftAuthority;
  targetShipId: WolfBoardingShipId | null;
  requestId: string;
  now: string;
  activeRoleIds: readonly string[];
  activeVesselIds: readonly string[];
  dockings: WolfBoardingCraftAuthorityInput['dockings'];
  visits: WolfBoardingCraftAuthorityInput['visits'];
  control: unknown;
  fuelled: unknown;
}>): Readonly<{
  status: 'stayed' | 'moved';
  dockings: readonly WolfBoardingCraftAuthorityInput['dockings'][number][];
  visits: readonly WolfBoardingCraftAuthorityInput['visits'][number][];
  control: ShuttleControlState;
  fuelled: Readonly<Record<string, boolean>>;
}> {
  const { authority } = input;
  if (!authority.fuelledRelocation) {
    throw new Error('Only Pallas or Chepu can relocate during Boarding.');
  }
  if (!/^[\w-]{1,128}$/.test(input.requestId) || !Number.isFinite(Date.parse(input.now))) {
    throw new Error('Boarding relocation needs a valid request ID and server time.');
  }
  if (!shuttleDockingsAreKnownAndUnique(input.dockings) ||
      !shuttleDockingsAreParked(input.dockings, input.activeVesselIds) ||
      !shuttleDockingsMatchActiveRoleOwnedSubset(input.activeRoleIds, input.dockings)) {
    throw new Error('The current shuttle location changed before relocation.');
  }
  const dockings = [...input.dockings];
  const dockingIndex = dockings.findIndex(({ shuttleId }) => shuttleId === authority.shuttleId);
  const control = parseShuttleControl(input.control);
  const entry = control?.[authority.shuttleId];
  const currentDocking = dockings[dockingIndex];
  const fuelled = requireRecord(input.fuelled, 'Shuttle fuel');
  if (Object.values(fuelled).some((value) => typeof value !== 'boolean')) {
    throw new Error('Shuttle fuel authority is malformed.');
  }
  const fuelledState = fuelled as Readonly<Record<string, boolean>>;
  if (!entry || !currentDocking || currentDocking.shipId !== authority.hostShipId ||
      entry.ownerRoleId !== authority.ownerRoleId || entry.ownerUid !== authority.ownerUid ||
      entry.holderUid !== authority.holderUid || entry.revision !== authority.controlRevision) {
    throw new Error('Boarding relocation is stale; refresh the current craft authority.');
  }
  if (input.targetShipId === null) {
    return { status: 'stayed', dockings, visits: [...input.visits], control, fuelled: { ...fuelledState } };
  }
  if (!authority.fuelled || fuelled[authority.shuttleId] !== true) {
    throw new Error('Only a currently fuelled Pallas or Chepu can relocate during Boarding.');
  }
  if (!input.activeVesselIds.includes(input.targetShipId) ||
      !shuttleHostIsAllowed(authority.shuttleId, input.targetShipId)) {
    throw new Error('Choose a legal active fleet host for this boarding shuttle.');
  }
  if (input.targetShipId === authority.hostShipId) {
    throw new Error('Choose another active ship or explicitly stay at the current host.');
  }
  const departedId = `wolf-board-${input.requestId}-departed`;
  const dockedId = `wolf-board-${input.requestId}-docked`;
  if (input.visits.some(({ id }) => id === departedId || id === dockedId)) {
    throw new Error('The boarding relocation visit is already present without its command receipt.');
  }
  dockings[dockingIndex] = {
    shuttleId: authority.shuttleId, shipId: input.targetShipId, dockedAt: input.now,
  };
  const movedControl: Record<string, ShuttleControlEntry> = { ...control };
  movedControl[authority.shuttleId] = { ...entry, revision: entry.revision + 1 };
  return {
    status: 'moved', dockings,
    visits: [
      ...input.visits,
      { id: departedId, shuttleId: authority.shuttleId, shipId: authority.hostShipId,
        action: 'departed', occurredAt: input.now },
      { id: dockedId, shuttleId: authority.shuttleId, shipId: input.targetShipId,
        action: 'docked', occurredAt: input.now },
    ],
    control: movedControl, fuelled: { ...fuelledState },
  };
}
