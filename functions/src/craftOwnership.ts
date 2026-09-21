/**
 * The server-side starting ownership catalog for craft that are represented by
 * the current console. Ownership is a printed role fact, so this catalog never
 * stores a player UID or a mutable transfer pointer.
 */
export type RoleOwnedCraftKind = 'shuttle' | 'fighter-wing';
export type CraftEnabledMode = 'standard' | 'gm-controlled';
export type WolfAttackCraftRole = 'battle-table' | 'park-only';

export interface RoleOwnedCraft {
  readonly id: string;
  readonly kind: RoleOwnedCraftKind;
  readonly ownerRoleId: string;
  readonly enabledMode: CraftEnabledMode;
  readonly wolfAttackRole: WolfAttackCraftRole;
}

/**
 * Keep fighter wings separate from the shuttle manifest. They are still part
 * of the same server-owned role allowlist, but their later combat mechanics
 * belong to their vessel-specific prompts.
 */
export const ROLE_OWNED_CRAFT_CATALOG: readonly RoleOwnedCraft[] = [
  { id: 'snn-press-shuttle', kind: 'shuttle', ownerRoleId: 'press-officer', enabledMode: 'standard', wolfAttackRole: 'park-only' },
  { id: 'starlight', kind: 'shuttle', ownerRoleId: 'wing-commander', enabledMode: 'standard', wolfAttackRole: 'park-only' },
  { id: 'fighter-wing-alpha', kind: 'fighter-wing', ownerRoleId: 'wing-commander', enabledMode: 'standard', wolfAttackRole: 'battle-table' },
  { id: 'fighter-wing-bravo', kind: 'fighter-wing', ownerRoleId: 'wing-commander', enabledMode: 'standard', wolfAttackRole: 'battle-table' },
  { id: 'pallas', kind: 'shuttle', ownerRoleId: 'executive-officer', enabledMode: 'standard', wolfAttackRole: 'park-only' },
  { id: 'philia', kind: 'shuttle', ownerRoleId: 'dione-engineer', enabledMode: 'standard', wolfAttackRole: 'park-only' },
  { id: 'maliades', kind: 'shuttle', ownerRoleId: 'dione-engineer', enabledMode: 'standard', wolfAttackRole: 'battle-table' },
  { id: 'highwall', kind: 'shuttle', ownerRoleId: 'icebreaker-miner', enabledMode: 'standard', wolfAttackRole: 'battle-table' },
  { id: 'blacksmith', kind: 'shuttle', ownerRoleId: 'icebreaker-engineer', enabledMode: 'standard', wolfAttackRole: 'park-only' },
  { id: 'macaw', kind: 'shuttle', ownerRoleId: 'capybara-captain', enabledMode: 'standard', wolfAttackRole: 'park-only' },
  { id: 'boa', kind: 'shuttle', ownerRoleId: 'capybara-recycler', enabledMode: 'standard', wolfAttackRole: 'battle-table' },
  { id: 'endeavour', kind: 'shuttle', ownerRoleId: 'shepherd-scientist', enabledMode: 'standard', wolfAttackRole: 'park-only' },
  { id: 'black-sheep', kind: 'shuttle', ownerRoleId: 'shepherd-engineer', enabledMode: 'standard', wolfAttackRole: 'park-only' },
  { id: 'hummingbird', kind: 'shuttle', ownerRoleId: 'quellon-explorer', enabledMode: 'standard', wolfAttackRole: 'park-only' },
  { id: 'condor', kind: 'shuttle', ownerRoleId: 'quellon-engineer', enabledMode: 'standard', wolfAttackRole: 'park-only' },
  { id: 'chacau', kind: 'shuttle', ownerRoleId: 'refinery-124-engineer', enabledMode: 'standard', wolfAttackRole: 'park-only' },
  { id: 'chepu', kind: 'shuttle', ownerRoleId: 'refinery-124-pdf-colonel', enabledMode: 'standard', wolfAttackRole: 'park-only' },
  { id: 'pdf-escort-fighter-wing', kind: 'fighter-wing', ownerRoleId: 'refinery-124-pdf-colonel', enabledMode: 'standard', wolfAttackRole: 'battle-table' },
  { id: 'wobbly', kind: 'shuttle', ownerRoleId: 'joint-engineering-quellon-refinery', enabledMode: 'gm-controlled', wolfAttackRole: 'park-only' },
  { id: 'ally', kind: 'shuttle', ownerRoleId: 'joint-engineering-shepherd-icebreaker', enabledMode: 'gm-controlled', wolfAttackRole: 'park-only' },
];

export interface BattleTableCraftActionRegistration {
  readonly craftId: string;
  readonly kind: RoleOwnedCraftKind;
  readonly ownerRoleId: string;
}

/** Register only printed range-combat craft for later battle-table actions. */
export function battleTableCraftActionsForParkedCraft(
  parkedCraftIds: readonly string[],
): readonly BattleTableCraftActionRegistration[] {
  if (new Set(parkedCraftIds).size !== parkedCraftIds.length) {
    throw new Error('Parked craft IDs must be unique.');
  }
  const catalog = new Map(ROLE_OWNED_CRAFT_CATALOG.map((craft) => [craft.id, craft]));
  const parked = parkedCraftIds.map((craftId) => {
    const craft = catalog.get(craftId);
    if (!craft) throw new Error('Parked craft contains an unknown craft ID.');
    return craft;
  });
  return parked.filter((craft) => craft.wolfAttackRole === 'battle-table')
    .map((craft) => ({
      craftId: craft.id,
      kind: craft.kind,
      ownerRoleId: craft.ownerRoleId,
    }));
}

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

/** Union craft may move only between the two ships assigned to their owner role. */
const UNION_CRAFT_HOSTS: Readonly<Record<string, readonly string[]>> = {
  wobbly: ['quellon', 'refinery-124'],
  ally: ['shepherd', 'icebreaker'],
};

export function shuttleHostIsAllowed(craftId: string, shipId: string | null | undefined): boolean {
  if (!shipId) return false;
  const restrictedHosts = UNION_CRAFT_HOSTS[craftId];
  return restrictedHosts === undefined || restrictedHosts.includes(shipId);
}

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
    .filter((craft) => craft.enabledMode === 'standard' ||
      shuttleHostIsAllowed(craft.id, dockingHosts.get(craft.id)))
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
  if (shuttleDockings.some((docking) =>
    !shuttleHostIsAllowed(docking.shuttleId, docking.shipId))) return false;
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
        (record.wolfAttackRole === undefined ||
          record.wolfAttackRole === expectedEntry.wolfAttackRole) &&
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
          record.enabledMode !== expectedCraft.enabledMode ||
          (record.wolfAttackRole !== undefined &&
            record.wolfAttackRole !== expectedCraft.wolfAttackRole)) return false;
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
    left.ownerRoleId === right.ownerRoleId && left.enabledMode === right.enabledMode &&
    (left.wolfAttackRole === undefined || left.wolfAttackRole === right.wolfAttackRole);
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
