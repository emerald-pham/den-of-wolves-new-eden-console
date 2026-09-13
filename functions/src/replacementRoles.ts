/**
 * Replacement roles are a separate catalog from the printed core roster.
 * They are adjudicated by a live GM after an explicit eligibility decision;
 * they never become casting seats or loyalty-card holders.
 */

export const REPLACEMENT_ELIGIBILITY_REASONS = [
  'dead',
  'arrested',
  'removed',
  'late',
] as const;

export type ReplacementEligibilityReason = typeof REPLACEMENT_ELIGIBILITY_REASONS[number];

export type ReplacementRoleKind = 'role' | 'extra-ship';

export interface ReplacementRoleDefinition {
  readonly id: string;
  readonly name: string;
  readonly vesselName: string;
  readonly kind: ReplacementRoleKind;
  /** A replacement role never claims a core seat. */
  readonly vesselId?: string;
  /** The base small-ship Capybara brief is distinct from the expansion. */
  readonly baseVesselOnly?: boolean;
}

export const REPLACEMENT_ROLE_CATALOG: readonly ReplacementRoleDefinition[] = [
  { id: 'wolf-commander', name: 'Wolf Commander', vesselName: 'Wolf Armada', kind: 'role' },
  { id: 'comms-officer', name: 'Comms Officer', vesselName: 'AEGIS', kind: 'role', vesselId: 'aegis' },
  { id: 'vip-host', name: 'VIP Host', vesselName: 'Dione', kind: 'role', vesselId: 'dione' },
  { id: 'commissar', name: 'Commissar', vesselName: 'Icebreaker', kind: 'role', vesselId: 'icebreaker' },
  { id: 'rosal-militia-leader', name: 'Rosal Militia Leader', vesselName: 'Shepherd', kind: 'role', vesselId: 'shepherd' },
  { id: 'doctor', name: 'Doctor', vesselName: 'Quellon', kind: 'role', vesselId: 'quellon' },
  { id: 'pdf-fighter-ace', name: 'P.D.F. Fighter Ace', vesselName: 'Refinery 124', kind: 'role', vesselId: 'refinery-124' },
  { id: 'gorgoneion-captain', name: 'Gorgoneion Captain', vesselName: 'I.C.S.S. Gorgoneion', kind: 'extra-ship', vesselId: 'gorgoneion' },
  { id: 'capybara-small-captain', name: 'Capybara Captain // base small ship', vesselName: 'S.A.N.S. Capybara', kind: 'extra-ship', vesselId: 'capybara-small', baseVesselOnly: true },
  { id: 'warrior-captain', name: 'Warrior Captain', vesselName: 'RSS Warrior', kind: 'extra-ship', vesselId: 'warrior' },
  { id: 'vulcan-captain', name: 'Vulcan Captain', vesselName: 'Vulcan', kind: 'extra-ship', vesselId: 'vulcan' },
];

export function replacementRoleFor(roleId: string): ReplacementRoleDefinition | undefined {
  return REPLACEMENT_ROLE_CATALOG.find((role) => role.id === roleId);
}

export function isReplacementEligibilityReason(value: unknown): value is ReplacementEligibilityReason {
  return (REPLACEMENT_ELIGIBILITY_REASONS as readonly unknown[]).includes(value);
}

export function replacementRoleAvailable(
  roleId: string,
  options: { readonly activeVesselIds: readonly string[]; readonly expansion: string },
): boolean {
  const role = replacementRoleFor(roleId);
  if (!role) return false;
  if (role.baseVesselOnly && options.expansion === 'capybara') return false;
  if (role.kind === 'extra-ship') return role.vesselId !== undefined &&
    options.activeVesselIds.includes(role.vesselId);
  return role.vesselId === undefined || options.activeVesselIds.includes(role.vesselId);
}

/** Historical core assignments never grant authority after replacement. */
export function replacementAuthorityAllowsRole(
  replacementRoleId: unknown,
  requestedRoleId: string,
): boolean {
  return typeof replacementRoleId !== 'string' || replacementRoleId === requestedRoleId;
}
