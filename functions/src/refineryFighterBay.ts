import { chargeableConsoleIds, parseMaintenanceCycle } from './maintenance';
import { SHIP_DAMAGE_DECKS, type ShipDamageState } from './shipDamage';
import {
  ROLE_OWNED_CRAFT_CATALOG,
  type BattleTableCraftActionRegistration,
} from './craftOwnership';
import { activeVesselIdsForRoles } from './gameSetup';
import { isValidRoleConfiguration } from './roleConfiguration';

const SHIP_ID = 'refinery-124' as const;
const CONSOLE_ID = 'fighter-bay' as const;
const DAMAGE_CARD = '8♦' as const;
const CRAFT_ID = 'pdf-escort-fighter-wing' as const;
const OWNER_ROLE_ID = 'refinery-124-pdf-colonel' as const;

export interface RefineryFighterBayAttackAuthority {
  readonly status: string;
  readonly currentStep: string;
  readonly turn: number;
  readonly revision: number;
  readonly battleTableCraftActions: readonly BattleTableCraftActionRegistration[];
  readonly launchedCraftIds: readonly string[];
}

export interface RefineryFighterBayLaunchAuthorization {
  readonly type: 'refinery-fighter-bay-launch-authorization';
  readonly shipId: typeof SHIP_ID;
  readonly consoleId: typeof CONSOLE_ID;
  readonly damageCard: typeof DAMAGE_CARD;
  readonly craftId: typeof CRAFT_ID;
  readonly ownerRoleId: typeof OWNER_ROLE_ID;
  readonly cycle: number;
  readonly attackRevision: number;
}

function canonicalUniqueStrings(value: readonly string[], label: string): void {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string') ||
      new Set(value).size !== value.length) {
    throw new Error(`The ${label} authority is malformed.`);
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(value).every((key) => allowedSet.has(key));
}

/**
 * Resolve the immutable authorization consumed by the later P.D.F. Escort Wing
 * launch transaction. This function never mutates the attack or session state.
 */
export function authorizeRefineryFighterBayLaunch(input: Readonly<{
  actorRoleId: string;
  activeRoleIds: readonly string[];
  activeVesselIds: readonly string[];
  maintenanceCycle: unknown;
  damage: ShipDamageState;
  attack: RefineryFighterBayAttackAuthority;
  requestedCraftId?: string;
}>): RefineryFighterBayLaunchAuthorization {
  canonicalUniqueStrings(input.activeRoleIds, 'active-role');
  canonicalUniqueStrings(input.activeVesselIds, 'active-vessel');
  if (!isValidRoleConfiguration(input.activeRoleIds)) {
    throw new Error('The active-role authority is not a valid printed configuration.');
  }
  const expectedVesselIds = new Set(activeVesselIdsForRoles(input.activeRoleIds));
  if (expectedVesselIds.size !== input.activeVesselIds.length ||
      input.activeVesselIds.some((vesselId) => !expectedVesselIds.has(vesselId))) {
    throw new Error('The active-vessel authority does not match the active roles.');
  }
  if (input.actorRoleId !== OWNER_ROLE_ID) {
    throw new Error('Only the active P.D.F. Colonel can launch the Refinery fighter wing.');
  }
  if (!input.activeRoleIds.includes(OWNER_ROLE_ID) || !input.activeVesselIds.includes(SHIP_ID)) {
    throw new Error('The P.D.F. Colonel or Refinery 124 is not active.');
  }
  if (input.requestedCraftId !== undefined && input.requestedCraftId !== CRAFT_ID) {
    throw new Error('The Refinery Fighter Bay authorizes only the P.D.F. Escort Wing.');
  }

  const attack = input.attack;
  if (!attack || attack.status !== 'declared') {
    throw new Error('A launch requires an active Wolf attack.');
  }
  if (attack.currentStep !== 'targeting') {
    throw new Error('The Refinery Fighter Bay launch window is closed.');
  }
  if (!Number.isSafeInteger(attack.turn) || attack.turn < 1 ||
      !Number.isSafeInteger(attack.revision) || attack.revision < 1) {
    throw new Error('The Wolf attack authority is malformed.');
  }
  if (!Array.isArray(attack.battleTableCraftActions) ||
      !Array.isArray(attack.launchedCraftIds)) {
    throw new Error('The Wolf attack craft authority is malformed.');
  }
  const actionIds = attack.battleTableCraftActions.map((action) => action.craftId);
  canonicalUniqueStrings(actionIds, 'battle-table craft');
  canonicalUniqueStrings(attack.launchedCraftIds, 'launched-craft');
  const canonicalBattleCraft = new Map(ROLE_OWNED_CRAFT_CATALOG
    .filter((craft) => craft.wolfAttackRole === 'battle-table')
    .map((craft) => [craft.id, craft]));
  if (attack.battleTableCraftActions.some((action) => {
    const raw = record(action);
    const canonical = raw && typeof raw.craftId === 'string'
      ? canonicalBattleCraft.get(raw.craftId) : undefined;
    return !raw || !exactKeys(raw, ['craftId', 'kind', 'ownerRoleId']) || !canonical ||
      raw.kind !== canonical.kind || raw.ownerRoleId !== canonical.ownerRoleId;
  })) {
    throw new Error('The battle-table craft authority is malformed.');
  }
  if (attack.launchedCraftIds.some((craftId) => !actionIds.includes(craftId))) {
    throw new Error('The launched-craft authority is malformed.');
  }
  const registrations = attack.battleTableCraftActions.filter((action) =>
    action.craftId === CRAFT_ID && action.kind === 'fighter-wing' &&
    action.ownerRoleId === OWNER_ROLE_ID);
  if (registrations.length !== 1 ||
      attack.battleTableCraftActions.some((action) => action.craftId === CRAFT_ID &&
        (action.kind !== 'fighter-wing' || action.ownerRoleId !== OWNER_ROLE_ID))) {
    throw new Error('The attack lacks the exact P.D.F. Escort Wing registration.');
  }
  if (attack.launchedCraftIds.includes(CRAFT_ID)) {
    throw new Error('The P.D.F. Escort Wing is already launched.');
  }

  const rawCycle = record(input.maintenanceCycle);
  const rawResults = record(rawCycle?.results);
  const rawCharges = rawCycle?.charges;
  const rawRefuelled = rawCycle?.refuelled;
  const allowedCycleKeys = [
    'step', 'revision', 'results', 'charges', 'refuelled', 'turn', 'rationBonus',
    'startedAt', 'completedAt', 'damageDrawId',
  ];
  const allowedResultKeys = new Set(['1', '2', '3', '4', '5', '6', '7']);
  const allowedCharges = new Set(chargeableConsoleIds(SHIP_ID));
  const knownShuttleIds = new Set(ROLE_OWNED_CRAFT_CATALOG
    .filter((craft) => craft.kind === 'shuttle')
    .map((craft) => craft.id));
  if (!rawCycle || !exactKeys(rawCycle, allowedCycleKeys) || !rawResults ||
      Object.entries(rawResults).some(([key, value]) =>
        !allowedResultKeys.has(key) || typeof value !== 'string') ||
      !Array.isArray(rawCharges) || rawCharges.some((charge) =>
        typeof charge !== 'string' || !allowedCharges.has(charge)) ||
      new Set(rawCharges).size !== rawCharges.length ||
      !Array.isArray(rawRefuelled) || rawRefuelled.some((craftId) =>
        typeof craftId !== 'string' || !knownShuttleIds.has(craftId)) ||
      new Set(rawRefuelled).size !== rawRefuelled.length) {
    throw new Error('The Refinery maintenance authority is malformed.');
  }
  const cycle = parseMaintenanceCycle(rawCycle);
  if (!cycle || cycle.turn !== attack.turn) {
    throw new Error('The Refinery Fighter Bay charge is not from the current cycle.');
  }
  if (cycle.step !== 0 || typeof cycle.completedAt !== 'string' ||
      cycle.completedAt.length === 0 || Number.isNaN(Date.parse(cycle.completedAt)) ||
      typeof cycle.results['5'] !== 'string' ||
      !cycle.results['5'].startsWith('Reactor powered up.') ||
      cycle.results['7'] !== 'Maintenance cycle complete.') {
    throw new Error('Complete maintenance before launching the P.D.F. Escort Wing.');
  }
  if (!chargeableConsoleIds(SHIP_ID).includes(CONSOLE_ID) || !cycle.charges.includes(CONSOLE_ID)) {
    throw new Error('Charge the Refinery 8♦ Fighter Bay before launching.');
  }

  const damage = input.damage;
  const knownDamageIds = new Set((SHIP_DAMAGE_DECKS[SHIP_ID] ?? []).map((card) => card.systemId));
  if (!damage || typeof damage.destroyed !== 'boolean' || !Array.isArray(damage.damagedSystemIds) ||
      damage.damagedSystemIds.some((id) => typeof id !== 'string' || !knownDamageIds.has(id)) ||
      new Set(damage.damagedSystemIds).size !== damage.damagedSystemIds.length) {
    throw new Error('The Refinery damage authority is malformed.');
  }
  if (damage.destroyed) throw new Error('A destroyed Refinery 124 cannot launch a fighter wing.');
  if (damage.damagedSystemIds.includes(CONSOLE_ID)) {
    throw new Error('The damaged Refinery 8♦ Fighter Bay cannot launch a fighter wing.');
  }

  return Object.freeze({
    type: 'refinery-fighter-bay-launch-authorization',
    shipId: SHIP_ID,
    consoleId: CONSOLE_ID,
    damageCard: DAMAGE_CARD,
    craftId: CRAFT_ID,
    ownerRoleId: OWNER_ROLE_ID,
    cycle: attack.turn,
    attackRevision: attack.revision,
  });
}
