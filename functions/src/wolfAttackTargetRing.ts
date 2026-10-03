import { CORE_WOLF_TARGET_RING, EXPANDED_WOLF_TARGET_RING, type WolfTargetRing } from './wolfCombatMath';

export interface WolfAttackTargetSetup {
  readonly playerCount: number;
  readonly expansion: 'base' | 'capybara' | 'none';
}

/**
 * Build the canonical printed-order ring from admitted active full vessels.
 * The only valid core omission is Dione in a base/none roster with fewer than
 * twelve players. Full Capybara uses the seven-target expansion ring and keeps
 * Dione; small Capybara is not a fleet target.
 */
export function configuredWolfAttackTargetRing(
  activeVesselIds: readonly string[],
  setup: WolfAttackTargetSetup,
): WolfTargetRing {
  if (!Array.isArray(activeVesselIds) || new Set(activeVesselIds).size !== activeVesselIds.length ||
      !Number.isSafeInteger(setup.playerCount) || setup.playerCount < 8 || setup.playerCount > 20 ||
      !['base', 'capybara', 'none'].includes(setup.expansion)) {
    throw new Error('The active fleet target vessels must be a unique list.');
  }
  const permittedTargets = new Set<string>(EXPANDED_WOLF_TARGET_RING);
  if (activeVesselIds.some((shipId) => !permittedTargets.has(shipId))) {
    throw new Error('The active fleet contains an unsupported target vessel.');
  }
  const requiredCoreTargets = CORE_WOLF_TARGET_RING.filter((shipId) => shipId !== 'dione');
  if (requiredCoreTargets.some((shipId) => !activeVesselIds.includes(shipId))) {
    throw new Error('Wolf targeting requires the configured active fleet vessels.');
  }
  const hasDione = activeVesselIds.includes('dione');
  const hasCapybara = activeVesselIds.includes('capybara');
  if (hasCapybara && !hasDione || setup.expansion === 'capybara' && !hasDione) {
    throw new Error('Dione is required in the full Capybara fleet target ring.');
  }
  if (setup.expansion === 'capybara' && !hasCapybara) {
    throw new Error('The full Capybara target must be active in expansion mode.');
  }
  if (setup.playerCount < 12 && hasDione || setup.playerCount >= 12 && !hasDione) {
    throw new Error('Dione is required only for configured rosters of twelve or more players.');
  }
  if (setup.playerCount >= 19 && setup.expansion !== 'capybara' ||
      setup.expansion === 'capybara' && setup.playerCount < 19 ||
      hasCapybara && (setup.playerCount < 19 || setup.expansion !== 'capybara')) {
    throw new Error('Full Capybara targeting requires the configured 19- or 20-player expansion fleet.');
  }
  const canonicalRing: readonly string[] = activeVesselIds.includes('capybara')
    ? EXPANDED_WOLF_TARGET_RING
    : CORE_WOLF_TARGET_RING;
  return canonicalRing.filter((shipId) => activeVesselIds.includes(shipId)) as WolfTargetRing;
}
