/**
 * The server-side starting ownership catalog for craft that are represented by
 * the current console. Ownership is a printed role fact, so this catalog never
 * stores a player UID or a mutable transfer pointer.
 */
export type RoleOwnedCraftKind = 'shuttle' | 'fighter-wing';
export type CraftEnabledMode = 'standard' | 'gm-controlled';

export interface RoleOwnedCraft {
  readonly id: string;
  readonly kind: RoleOwnedCraftKind;
  readonly ownerRoleId: string;
  readonly enabledMode: CraftEnabledMode;
}

/**
 * Keep fighter wings separate from the shuttle manifest. They are still part
 * of the same server-owned role allowlist, but their later combat mechanics
 * belong to their vessel-specific prompts.
 */
export const ROLE_OWNED_CRAFT_CATALOG: readonly RoleOwnedCraft[] = [
  { id: 'snn-press-shuttle', kind: 'shuttle', ownerRoleId: 'press-officer', enabledMode: 'standard' },
  { id: 'starlight', kind: 'shuttle', ownerRoleId: 'wing-commander', enabledMode: 'standard' },
  { id: 'fighter-wing-alpha', kind: 'fighter-wing', ownerRoleId: 'wing-commander', enabledMode: 'standard' },
  { id: 'fighter-wing-bravo', kind: 'fighter-wing', ownerRoleId: 'wing-commander', enabledMode: 'standard' },
  { id: 'pallas', kind: 'shuttle', ownerRoleId: 'executive-officer', enabledMode: 'standard' },
  { id: 'philia', kind: 'shuttle', ownerRoleId: 'dione-engineer', enabledMode: 'standard' },
  { id: 'maliades', kind: 'shuttle', ownerRoleId: 'dione-engineer', enabledMode: 'standard' },
  { id: 'highwall', kind: 'shuttle', ownerRoleId: 'icebreaker-miner', enabledMode: 'standard' },
  { id: 'blacksmith', kind: 'shuttle', ownerRoleId: 'icebreaker-engineer', enabledMode: 'standard' },
  { id: 'macaw', kind: 'shuttle', ownerRoleId: 'capybara-captain', enabledMode: 'standard' },
  { id: 'boa', kind: 'shuttle', ownerRoleId: 'capybara-recycler', enabledMode: 'standard' },
  { id: 'endeavour', kind: 'shuttle', ownerRoleId: 'shepherd-scientist', enabledMode: 'standard' },
  { id: 'black-sheep', kind: 'shuttle', ownerRoleId: 'shepherd-engineer', enabledMode: 'standard' },
  { id: 'hummingbird', kind: 'shuttle', ownerRoleId: 'quellon-explorer', enabledMode: 'standard' },
  { id: 'condor', kind: 'shuttle', ownerRoleId: 'quellon-engineer', enabledMode: 'standard' },
  { id: 'chacau', kind: 'shuttle', ownerRoleId: 'refinery-124-engineer', enabledMode: 'standard' },
  { id: 'chepu', kind: 'shuttle', ownerRoleId: 'refinery-124-pdf-colonel', enabledMode: 'standard' },
  { id: 'pdf-escort-fighter-wing', kind: 'fighter-wing', ownerRoleId: 'refinery-124-pdf-colonel', enabledMode: 'standard' },
  { id: 'wobbly', kind: 'shuttle', ownerRoleId: 'joint-engineering-quellon-refinery', enabledMode: 'gm-controlled' },
  { id: 'ally', kind: 'shuttle', ownerRoleId: 'joint-engineering-shepherd-icebreaker', enabledMode: 'gm-controlled' },
];

/** Derive the immutable starting allowlist from the locked role roster. */
export function roleOwnedCraftForRoles(
  activeRoleIds: readonly string[],
): readonly RoleOwnedCraft[] {
  const activeRoles = new Set(activeRoleIds);
  return ROLE_OWNED_CRAFT_CATALOG.filter((craft) =>
    craft.ownerRoleId === 'press-officer' || activeRoles.has(craft.ownerRoleId));
}

/** Project only the craft entitled to one printed role. */
export function ownedCraftIdsForRole(
  roleId: string,
  activeRoleIds: readonly string[],
): readonly string[] {
  return roleOwnedCraftForRoles(activeRoleIds)
    .filter((craft) => craft.ownerRoleId === roleId)
    .map((craft) => craft.id);
}

export interface RoleOwnedCraftManifest {
  readonly type: 'role-owned-craft';
  readonly activeRoleIds: readonly string[];
  readonly vesselMode: string;
  readonly roleOwnedCraft: readonly RoleOwnedCraft[];
}

export interface CraftStartingManifestEntry extends RoleOwnedCraft {
  /** The authoritative host at setup/start; null is unresolved and not startable. */
  readonly startingHostId: string | null;
}

export interface CraftStartingManifest {
  readonly type: 'craft-starting-manifest';
  readonly activeRoleIds: readonly string[];
  readonly vesselMode: string;
  readonly entries: readonly CraftStartingManifestEntry[];
}

/** Printed host facts for the fighter wings that have no shuttle docking row. */
const PRINTED_FIGHTER_WING_HOSTS: Readonly<Record<string, string>> = {
  'fighter-wing-alpha': 'aegis',
  'fighter-wing-bravo': 'aegis',
  'pdf-escort-fighter-wing': 'refinery-124',
};

/**
 * Compose one exact-once starting tuple from the existing role catalog and
 * authoritative docking state. Standard craft require a docking row; a
 * GM-controlled craft is included only after an explicit docking exists.
 */
export function craftStartingManifestForSetup(
  activeRoleIds: readonly string[],
  vesselMode: string,
  shuttleDockings: readonly { shuttleId: string; shipId: string }[],
): CraftStartingManifest {
  const dockingHosts = new Map<string, string | null>();
  for (const docking of shuttleDockings) {
    if (!dockingHosts.has(docking.shuttleId)) dockingHosts.set(docking.shuttleId, docking.shipId);
    else dockingHosts.set(docking.shuttleId, null);
  }
  const entries = roleOwnedCraftForRoles(activeRoleIds)
    .filter((craft) => craft.enabledMode === 'standard' || dockingHosts.has(craft.id))
    .map((craft) => ({
    ...craft,
    startingHostId: craft.kind === 'fighter-wing'
      ? PRINTED_FIGHTER_WING_HOSTS[craft.id] ?? null
      : dockingHosts.get(craft.id) ?? null,
    }));
  return {
    type: 'craft-starting-manifest',
    activeRoleIds: [...activeRoleIds],
    vesselMode,
    entries,
  };
}

/** Reject unknown or duplicate current docking rows. */
export function shuttleDockingsAreKnownAndUnique(
  shuttleDockings: readonly { shuttleId: string; shipId: string }[],
): boolean {
  const knownShuttleIds = new Set(ROLE_OWNED_CRAFT_CATALOG
    .filter((craft) => craft.kind === 'shuttle')
    .map((craft) => craft.id));
  const seen = new Set<string>();
  for (const docking of shuttleDockings) {
    if (typeof docking !== 'object' || docking === null ||
        typeof docking.shuttleId !== 'string' || docking.shuttleId.length === 0 ||
        typeof docking.shipId !== 'string' || docking.shipId.length === 0 ||
        !knownShuttleIds.has(docking.shuttleId) || seen.has(docking.shuttleId)) return false;
    seen.add(docking.shuttleId);
  }
  return true;
}

/** Require every persisted docking row to describe a currently parked craft. */
export function shuttleDockingsAreParked(
  shuttleDockings: readonly unknown[],
  activeVesselIds: readonly string[],
): boolean {
  if (!shuttleDockingsAreKnownAndUnique(
    shuttleDockings as readonly { shuttleId: string; shipId: string }[],
  )) return false;
  const activeHosts = new Set(activeVesselIds);
  return shuttleDockings.every((docking) => {
    if (typeof docking !== 'object' || docking === null || Array.isArray(docking)) return false;
    const record = docking as Record<string, unknown>;
    return activeHosts.has(record.shipId as string) &&
      typeof record.dockedAt === 'string' && record.dockedAt.trim().length > 0 &&
      record.inTransit !== true && record.transit !== true &&
      record.status !== 'in-transit' && record.state !== 'in-transit' &&
      record.dockingState !== 'in-transit';
  });
}

/** Require one current docking row for every enabled role-owned shuttle. */
export function shuttleDockingsMatchRoleOwnedCraft(
  activeRoleIds: readonly string[],
  shuttleDockings: readonly { shuttleId: string; shipId: string }[],
): boolean {
  if (!shuttleDockingsAreKnownAndUnique(shuttleDockings)) return false;
  const seen = new Set(shuttleDockings.map((docking) => docking.shuttleId));
  const expected = new Set(roleOwnedCraftForRoles(activeRoleIds)
    .filter((craft) => craft.kind === 'shuttle')
    .filter((craft) => craft.enabledMode === 'standard' || seen.has(craft.id))
    .map((craft) => craft.id));
  return seen.size === expected.size && [...expected].every((craftId) => seen.has(craftId));
}

/** Validate the starting tuple before setup/start can perform any mutation. */
export function craftStartingManifestMatches(
  value: unknown,
  expected: CraftStartingManifest,
  activeVesselIds: readonly string[],
): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.type !== expected.type || candidate.vesselMode !== expected.vesselMode ||
      !Array.isArray(candidate.activeRoleIds) || !Array.isArray(candidate.entries)) return false;
  const activeRoleIds = candidate.activeRoleIds;
  const entries = candidate.entries;
  const activeHosts = new Set(activeVesselIds);
  const seen = new Set<string>();
  return activeRoleIds.length === expected.activeRoleIds.length &&
    activeRoleIds.every((roleId, index) => roleId === expected.activeRoleIds[index]) &&
    entries.length === expected.entries.length &&
    entries.every((entry, index) => {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return false;
      const record = entry as Record<string, unknown>;
      if (typeof record.id !== 'string' || seen.has(record.id) ||
          record.kind !== 'shuttle' && record.kind !== 'fighter-wing' ||
          typeof record.ownerRoleId !== 'string' ||
          record.enabledMode !== 'standard' && record.enabledMode !== 'gm-controlled' ||
          typeof record.startingHostId !== 'string' || record.startingHostId.length === 0 ||
          !activeHosts.has(record.startingHostId)) return false;
      seen.add(record.id);
      const expectedEntry = expected.entries[index];
      return expectedEntry !== undefined &&
        record.id === expectedEntry.id && record.kind === expectedEntry.kind &&
        record.ownerRoleId === expectedEntry.ownerRoleId &&
        record.enabledMode === expectedEntry.enabledMode &&
        record.startingHostId === expectedEntry.startingHostId;
    });
}

/** Permit a lobby manifest to carry an unresolved host until explicit setup state supplies it. */
export function craftStartingManifestHasUnresolvedHosts(
  value: unknown,
  expected: CraftStartingManifest,
): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.type !== expected.type || candidate.vesselMode !== expected.vesselMode ||
      !Array.isArray(candidate.activeRoleIds) || !Array.isArray(candidate.entries)) return false;
  const activeRoleIds = candidate.activeRoleIds;
  const entries = candidate.entries;
  let unresolved = false;
  const expectedById = new Map(expected.entries.map((entry) => [entry.id, entry]));
  const activeOptionalUnionIds = new Set(roleOwnedCraftForRoles(expected.activeRoleIds)
    .filter((craft) => craft.kind === 'shuttle' && craft.enabledMode === 'gm-controlled')
    .map((craft) => craft.id));
  const candidateIds = new Set<string>();
  const candidateMatchesExpected = entries.every((entry) => {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return false;
      const record = entry as Record<string, unknown>;
      if (typeof record.id !== 'string' || candidateIds.has(record.id)) return false;
      candidateIds.add(record.id);
      const expectedEntry = expectedById.get(record.id);
      const optionalUnionPlaceholder = expectedEntry === undefined &&
        activeOptionalUnionIds.has(record.id);
      if (expectedEntry === undefined && !optionalUnionPlaceholder) return false;
      const expectedCraft = expectedEntry ?? roleOwnedCraftForRoles(expected.activeRoleIds)
        .find((craft) => craft.id === record.id);
      if (expectedCraft === undefined || record.kind !== expectedCraft.kind ||
          record.ownerRoleId !== expectedCraft.ownerRoleId ||
          record.enabledMode !== expectedCraft.enabledMode) return false;
      if (record.startingHostId === null && expectedCraft.enabledMode === 'gm-controlled') {
        unresolved = true;
        return true;
      }
      return expectedEntry !== undefined && record.startingHostId === expectedEntry.startingHostId;
    });
  const expectedEntriesPresent = expected.entries.every((entry) => candidateIds.has(entry.id));
  return activeRoleIds.length === expected.activeRoleIds.length &&
    activeRoleIds.every((roleId, index) => roleId === expected.activeRoleIds[index]) &&
    candidateMatchesExpected && expectedEntriesPresent && unresolved;
}

export function roleOwnedCraftManifestForSetup(
  activeRoleIds: readonly string[],
  vesselMode: string,
): RoleOwnedCraftManifest {
  return {
    type: 'role-owned-craft',
    activeRoleIds: [...activeRoleIds],
    vesselMode,
    roleOwnedCraft: [...roleOwnedCraftForRoles(activeRoleIds)],
  };
}

function sameRecord(left: RoleOwnedCraft, right: RoleOwnedCraft): boolean {
  return left.id === right.id && left.kind === right.kind &&
    left.ownerRoleId === right.ownerRoleId && left.enabledMode === right.enabledMode;
}

/** Validate persisted server state before it is used as ownership authority. */
export function roleOwnedCraftManifestMatches(
  value: unknown,
  expected: RoleOwnedCraftManifest,
): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.type !== expected.type || candidate.vesselMode !== expected.vesselMode ||
      !Array.isArray(candidate.activeRoleIds) || !Array.isArray(candidate.roleOwnedCraft)) {
    return false;
  }
  const activeRoleIds = candidate.activeRoleIds;
  const craft = candidate.roleOwnedCraft;
  return activeRoleIds.length === expected.activeRoleIds.length &&
    activeRoleIds.every((roleId, index) => roleId === expected.activeRoleIds[index]) &&
    craft.length === expected.roleOwnedCraft.length &&
    craft.every((entry, index) => {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return false;
      const record = entry as Record<string, unknown>;
      return typeof record.id === 'string' &&
        (record.kind === 'shuttle' || record.kind === 'fighter-wing') &&
        typeof record.ownerRoleId === 'string' &&
        (record.enabledMode === 'standard' || record.enabledMode === 'gm-controlled') &&
        sameRecord(record as unknown as RoleOwnedCraft, expected.roleOwnedCraft[index]!);
    });
}
