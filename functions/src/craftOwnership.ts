/**
 * The server-side starting ownership catalog for craft that are represented by
 * the current console. Ownership is a printed role fact, so this catalog never
 * stores a player UID or a mutable transfer pointer.
 */
export type RoleOwnedCraftKind = 'shuttle' | 'fighter-wing';

export interface RoleOwnedCraft {
  readonly id: string;
  readonly kind: RoleOwnedCraftKind;
  readonly ownerRoleId: string;
}

/**
 * Keep fighter wings separate from the shuttle manifest. They are still part
 * of the same server-owned role allowlist, but their later combat mechanics
 * belong to their vessel-specific prompts.
 */
export const ROLE_OWNED_CRAFT_CATALOG: readonly RoleOwnedCraft[] = [
  { id: 'snn-press-shuttle', kind: 'shuttle', ownerRoleId: 'press-officer' },
  { id: 'starlight', kind: 'shuttle', ownerRoleId: 'wing-commander' },
  { id: 'fighter-wing-alpha', kind: 'fighter-wing', ownerRoleId: 'wing-commander' },
  { id: 'fighter-wing-bravo', kind: 'fighter-wing', ownerRoleId: 'wing-commander' },
  { id: 'pallas', kind: 'shuttle', ownerRoleId: 'executive-officer' },
  { id: 'philia', kind: 'shuttle', ownerRoleId: 'dione-engineer' },
  { id: 'maliades', kind: 'shuttle', ownerRoleId: 'dione-engineer' },
  { id: 'highwall', kind: 'shuttle', ownerRoleId: 'icebreaker-miner' },
  { id: 'blacksmith', kind: 'shuttle', ownerRoleId: 'icebreaker-engineer' },
  { id: 'macaw', kind: 'shuttle', ownerRoleId: 'capybara-captain' },
  { id: 'boa', kind: 'shuttle', ownerRoleId: 'capybara-recycler' },
  { id: 'endeavour', kind: 'shuttle', ownerRoleId: 'shepherd-scientist' },
  { id: 'black-sheep', kind: 'shuttle', ownerRoleId: 'shepherd-engineer' },
  { id: 'hummingbird', kind: 'shuttle', ownerRoleId: 'quellon-explorer' },
  { id: 'condor', kind: 'shuttle', ownerRoleId: 'quellon-engineer' },
  { id: 'chacau', kind: 'shuttle', ownerRoleId: 'refinery-124-engineer' },
  { id: 'chepu', kind: 'shuttle', ownerRoleId: 'refinery-124-pdf-colonel' },
  { id: 'pdf-escort-fighter-wing', kind: 'fighter-wing', ownerRoleId: 'refinery-124-pdf-colonel' },
  { id: 'wobbly', kind: 'shuttle', ownerRoleId: 'joint-engineering-quellon-refinery' },
  { id: 'ally', kind: 'shuttle', ownerRoleId: 'joint-engineering-shepherd-icebreaker' },
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
  return left.id === right.id && left.kind === right.kind && left.ownerRoleId === right.ownerRoleId;
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
        sameRecord(record as unknown as RoleOwnedCraft, expected.roleOwnedCraft[index]!);
    });
}
