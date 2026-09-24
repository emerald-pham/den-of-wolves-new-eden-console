import type { RoleId, VesselId } from '@/types/identifiers';
import { SHIPS, SMALL_SHIPS } from '@/data/ships';

export const REPLACEMENT_ELIGIBILITY_REASONS = [
  'dead', 'arrested', 'removed', 'late',
] as const;

export type ReplacementEligibilityReason = typeof REPLACEMENT_ELIGIBILITY_REASONS[number];

export interface ReplacementRoleDefinition {
  readonly id: RoleId;
  readonly name: string;
  readonly vesselName: string;
  readonly kind: 'role' | 'extra-ship';
  readonly vesselId?: VesselId;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isPresentedSmallShipState(
  value: unknown,
  id: string,
  activeVesselIds: ReadonlySet<string>,
): boolean {
  const rootKeys = ['id', 'hostShipId', 'dockingRevision', 'population', 'unrest', 'cycle'];
  const cycleKeys = [
    'step', 'revision', 'results', 'charges', 'turn', 'rationBonus',
    'chargingSkipped', 'startedAt', 'completedAt',
  ];
  if (!isRecord(value)) return false;
  const cycle = value.cycle;
  const maxPopulation = SMALL_SHIPS.find((ship) => ship.id === id)?.printedStatistics.population ?? 0;
  if (!isRecord(cycle) || !hasOnlyKeys(value, rootKeys) || value.id !== id ||
      (value.hostShipId !== null && typeof value.hostShipId !== 'string') ||
      !Number.isSafeInteger(value.dockingRevision) || (value.dockingRevision as number) < 0 ||
      !Number.isSafeInteger(value.population) || (value.population as number) < 0 ||
      (value.population as number) > maxPopulation || !Number.isSafeInteger(value.unrest) ||
      (value.unrest as number) < 0 || (value.unrest as number) > 10 ||
      !hasOnlyKeys(cycle, cycleKeys) ||
      !Number.isSafeInteger(cycle.step) || (cycle.step as number) < 0 ||
      (cycle.step as number) > 5 || !Number.isSafeInteger(cycle.revision) ||
      (cycle.revision as number) < 0 || !isRecord(cycle.results) ||
      Object.entries(cycle.results).some(([key, result]) => !/^[1-5]$/.test(key) || typeof result !== 'string') ||
      !Array.isArray(cycle.charges) || cycle.charges.some((charge) => typeof charge !== 'string')) {
    return false;
  }
  if (value.hostShipId !== null &&
      (value.dockingRevision === 0 || !activeVesselIds.has(value.hostShipId as string))) return false;
  if (cycle.turn !== undefined && (!Number.isSafeInteger(cycle.turn) || (cycle.turn as number) < 0)) return false;
  if (cycle.rationBonus !== undefined &&
      (typeof cycle.rationBonus !== 'number' || !Number.isFinite(cycle.rationBonus))) return false;
  if (cycle.chargingSkipped !== undefined && typeof cycle.chargingSkipped !== 'boolean') return false;
  return ['startedAt', 'completedAt'].every((key) => cycle[key] === undefined || typeof cycle[key] === 'string');
}

function isPresentedDockedSmallShip(
  value: unknown,
  id: string,
  activeVesselIds: ReadonlySet<string>,
): boolean {
  return isPresentedSmallShipState(value, id, activeVesselIds) && typeof value === 'object' &&
    value !== null && (value as Record<string, unknown>).hostShipId !== null;
}

export interface PresentedSmallShipStateMapOptions {
  readonly activeVesselIds: unknown;
  readonly smallShipStates: unknown;
  readonly expansion?: unknown;
  readonly capybaraEnabled?: unknown;
}

function presentedSmallShipStateMap(options: PresentedSmallShipStateMapOptions): {
  readonly activeVesselIds: Set<string>;
  readonly states: Record<string, unknown>;
} | undefined {
  const coreIds = new Set<string>(SHIPS.map((ship) => ship.id));
  const smallShipIds = new Set<string>(SMALL_SHIPS.map((ship) => ship.id));
  const persisted = options.activeVesselIds;
  const states = options.smallShipStates;
  const expansion = options.expansion ?? 'base';
  if (!Array.isArray(persisted) || persisted.length === 0 ||
      persisted.some((id) => typeof id !== 'string' || !coreIds.has(id)) ||
      new Set(persisted).size !== persisted.length || !isRecord(states) ||
      Object.keys(states).some((id) => !smallShipIds.has(id)) ||
      (expansion !== 'base' && expansion !== 'capybara' && expansion !== 'none') ||
      (options.capybaraEnabled !== undefined && typeof options.capybaraEnabled !== 'boolean')) return undefined;

  const capybaraEnabled = options.capybaraEnabled !== false;
  if ((persisted.includes('capybara') && (expansion !== 'capybara' || !capybaraEnabled)) ||
      (expansion === 'capybara' && !capybaraEnabled) ||
      (Object.hasOwn(states, 'capybara-small') && (expansion !== 'base' || !capybaraEnabled))) return undefined;

  const activeVesselIds = new Set(persisted as string[]);
  for (const [id, state] of Object.entries(states)) {
    if (!isPresentedSmallShipState(state, id, activeVesselIds)) return undefined;
  }
  return { activeVesselIds, states };
}

/** Full-map presentation check shared with session hydration so sanitizing cannot widen admission. */
export function isPresentedSmallShipStateMapValid(options: PresentedSmallShipStateMapOptions): boolean {
  return presentedSmallShipStateMap(options) !== undefined;
}

/** Presentation-only mirror of the server admission rule for GM role options. */
export function replacementRoleAvailableForSession(
  role: ReplacementRoleDefinition,
  options: {
    readonly activeVesselIds: unknown;
    readonly smallShipStates: unknown;
    readonly expansion?: unknown;
    readonly capybaraEnabled?: unknown;
  },
): boolean {
  if (role.kind === 'role') {
    return role.vesselId === undefined ||
      Array.isArray(options.activeVesselIds) && options.activeVesselIds.includes(role.vesselId);
  }
  if (!role.vesselId) return false;
  const parsed = presentedSmallShipStateMap(options);
  if (!parsed || !SMALL_SHIPS.some((ship) => ship.id === role.vesselId)) return false;
  const expansion = options.expansion ?? 'base';
  const capybaraEnabled = options.capybaraEnabled !== false;
  if (role.vesselId === 'capybara-small' && (expansion !== 'base' || !capybaraEnabled)) return false;
  return isPresentedDockedSmallShip(parsed.states[role.vesselId], role.vesselId, parsed.activeVesselIds);
}
