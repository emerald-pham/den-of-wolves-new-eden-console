import { FIGHTER_WING_IDS, type FighterWingId } from './fighterWings';
import type { WolfRandomInt } from './wolfCombatMath';

export interface AegisFighterWingCombatState {
  readonly type: 'aegis-fighter-wing-combat-state';
  readonly attackId: string;
  readonly cycle: number;
  readonly revision: number;
  readonly wings: Readonly<Record<FighterWingId, Readonly<{
    fighters: number;
    launched: boolean;
    mediumResolved: boolean;
    shortResolved: boolean;
    losses: number;
  }>>>;
}

export type AegisFighterWingMediumAction = Readonly<{
  fighterIndex: number;
  targetInstanceId: string;
}> & (
  | Readonly<{ kind: 'attack' }>
  | Readonly<{ kind: 'target-shift'; targetNumber: number; shift: -1 | 1 }>
);

export interface AegisFighterWingMediumResolution {
  readonly state: AegisFighterWingCombatState;
  readonly targetShifts: readonly Readonly<{
    fighterIndex: number;
    targetInstanceId: string;
    from: number;
    to: number;
  }>[];
  readonly attacks: readonly Readonly<{
    fighterIndex: number;
    targetInstanceId: string;
    die: number;
    hit: boolean;
    damage: number;
  }>[];
}

export interface AegisFighterWingShortResolution {
  readonly state: AegisFighterWingCombatState;
  readonly rolls: readonly Readonly<{
    fighterIndex: number;
    die: number;
    hit: boolean;
    destroyed: boolean;
  }>[];
  readonly losses: number;
}

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as RecordValue : undefined;
}

function safeInteger(value: unknown, label: string, minimum = 0): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new Error(`${label} must be a safe integer no smaller than ${minimum}.`);
  }
}

function freezeState(value: AegisFighterWingCombatState): AegisFighterWingCombatState {
  const wings = (Object.fromEntries(FIGHTER_WING_IDS.map((wingId) =>
    [wingId, Object.freeze({ ...value.wings[wingId] })])) as unknown as
      Record<FighterWingId, AegisFighterWingCombatState['wings'][FighterWingId]>);
  return Object.freeze({ ...value, wings: Object.freeze(wings) });
}

function validateIdentity(state: AegisFighterWingCombatState, input: Readonly<{
  expectedRevision: unknown;
  attackId: unknown;
  cycle: unknown;
}>): void {
  safeInteger(input.expectedRevision, 'Expected fighter-wing revision');
  safeInteger(input.cycle, 'Current Wolf attack cycle', 1);
  if (input.expectedRevision !== state.revision) throw new Error('Fighter-wing state changed; refresh before acting.');
  if (input.attackId !== state.attackId || input.cycle !== state.cycle) {
    throw new Error('The fighter-wing state belongs to a different Wolf attack.');
  }
  if (state.revision >= Number.MAX_SAFE_INTEGER) throw new Error('Fighter-wing revision cannot advance safely.');
}

function validateWing(state: AegisFighterWingCombatState, wingId: unknown): asserts wingId is FighterWingId {
  const validWingId = typeof wingId === 'string' ? FIGHTER_WING_IDS.find((id) => id === wingId) : undefined;
  if (!validWingId) {
    throw new Error('Unknown AEGIS fighter wing.');
  }
  const wing = state.wings[validWingId];
  safeInteger(wing.fighters, 'Current fighter count');
  safeInteger(wing.losses, 'Current fighter losses');
  if (typeof wing.launched !== 'boolean' || typeof wing.mediumResolved !== 'boolean' ||
      typeof wing.shortResolved !== 'boolean') throw new Error('Fighter-wing state is malformed.');
}

function validateIndexes(indexes: readonly number[], fighters: number, label: string): void {
  if (new Set(indexes).size !== indexes.length) throw new Error(`${label} may use each fighter only once.`);
  indexes.forEach((index) => {
    safeInteger(index, `${label} fighter index`);
    if (index >= fighters) throw new Error(`${label} includes a fighter that is no longer available.`);
  });
}

function die(random: WolfRandomInt): number {
  const value = random(6);
  if (!Number.isSafeInteger(value) || value < 0 || value >= 6) {
    throw new Error('The server randomness source returned an invalid fighter die.');
  }
  return value + 1;
}

export function initialAegisFighterWingAttack(input: Readonly<{
  attackId: string;
  cycle: number;
  counts: Readonly<Record<FighterWingId, number>>;
}>): AegisFighterWingCombatState {
  if (typeof input.attackId !== 'string' || input.attackId.trim().length === 0) {
    throw new Error('A Wolf attack ID is required for fighter-wing combat.');
  }
  safeInteger(input.cycle, 'Current Wolf attack cycle', 1);
  const wings = Object.fromEntries(FIGHTER_WING_IDS.map((wingId) => {
    const fighters = input.counts[wingId];
    safeInteger(fighters, `${wingId} fighter count`);
    if (fighters > 6) throw new Error(`${wingId} exceeds the printed six-fighter capacity.`);
    return [wingId, { fighters, launched: false, mediumResolved: false, shortResolved: false, losses: 0 }];
  })) as AegisFighterWingCombatState['wings'];
  return freezeState({
    type: 'aegis-fighter-wing-combat-state', attackId: input.attackId, cycle: input.cycle,
    revision: 0, wings,
  });
}

export function parseAegisFighterWingCombatState(value: unknown): AegisFighterWingCombatState | null {
  const raw = record(value);
  if (!raw || Object.keys(raw).sort().join(',') !== 'attackId,cycle,revision,type,wings' ||
      raw.type !== 'aegis-fighter-wing-combat-state' || typeof raw.attackId !== 'string' || !raw.attackId.trim() ||
      !Number.isSafeInteger(raw.cycle) || (raw.cycle as number) < 1 ||
      !Number.isSafeInteger(raw.revision) || (raw.revision as number) < 0) return null;
  const rawWings = record(raw.wings);
  if (!rawWings || Object.keys(rawWings).sort().join(',') !== [...FIGHTER_WING_IDS].sort().join(',')) return null;
  const wings = {} as Record<FighterWingId, AegisFighterWingCombatState['wings'][FighterWingId]>;
  for (const wingId of FIGHTER_WING_IDS) {
    const wing = record(rawWings[wingId]);
    if (!wing || Object.keys(wing).sort().join(',') !== 'fighters,launched,losses,mediumResolved,shortResolved' ||
        !Number.isSafeInteger(wing.fighters) || (wing.fighters as number) < 0 || (wing.fighters as number) > 6 ||
        !Number.isSafeInteger(wing.losses) || (wing.losses as number) < 0 ||
        typeof wing.launched !== 'boolean' || typeof wing.mediumResolved !== 'boolean' ||
        typeof wing.shortResolved !== 'boolean') return null;
    wings[wingId] = {
      fighters: wing.fighters as number, launched: wing.launched,
      mediumResolved: wing.mediumResolved, shortResolved: wing.shortResolved, losses: wing.losses as number,
    };
  }
  try {
    const state = freezeState({
      type: raw.type, attackId: raw.attackId, cycle: raw.cycle as number,
      revision: raw.revision as number, wings,
    });
    return state.wings[FIGHTER_WING_IDS[0]].losses <= 6 && state.wings[FIGHTER_WING_IDS[1]].losses <= 6
      ? state : null;
  } catch { return null; }
}

export function launchAegisFighterWing(
  state: AegisFighterWingCombatState,
  input: Readonly<{
    expectedRevision: unknown; attackId: unknown; cycle: unknown; wingId: FighterWingId;
    bayCharged: boolean; bayDamaged: boolean;
  }>,
): AegisFighterWingCombatState {
  validateIdentity(state, input);
  validateWing(state, input.wingId);
  const wing = state.wings[input.wingId];
  if (wing.launched) throw new Error('This fighter wing is already launched for the current Wolf attack.');
  if (wing.fighters < 1) throw new Error('A fighter wing without fighters cannot launch.');
  if (input.bayDamaged) throw new Error('A damaged Fighter Bay cannot launch its fighter wing.');
  if (!input.bayCharged) throw new Error('Charge this Fighter Bay before launching its fighter wing.');
  return freezeState({
    ...state, revision: state.revision + 1,
    wings: { ...state.wings, [input.wingId]: { ...wing, launched: true } },
  });
}

export function resolveAegisFighterWingMedium(
  state: AegisFighterWingCombatState,
  input: Readonly<{
    expectedRevision: unknown; attackId: unknown; cycle: unknown; wingId: FighterWingId;
    targetRingLength: number; actions: readonly AegisFighterWingMediumAction[]; random: WolfRandomInt;
  }>,
): AegisFighterWingMediumResolution {
  validateIdentity(state, input);
  validateWing(state, input.wingId);
  const wing = state.wings[input.wingId];
  if (!wing.launched) throw new Error('Launch this fighter wing before resolving Medium Range.');
  if (wing.mediumResolved) throw new Error('This fighter wing has already resolved Medium Range.');
  safeInteger(input.targetRingLength, 'Wolf target-ring length', 2);
  if (input.targetRingLength > 8) throw new Error('The Wolf target-ring length is outside the printed range.');
  if (!Array.isArray(input.actions)) throw new Error('Fighter Medium actions must be a list.');
  validateIndexes(input.actions.map(({ fighterIndex }) => fighterIndex), wing.fighters, 'Medium Range');
  const targetShifts: Array<{ fighterIndex: number; targetInstanceId: string; from: number; to: number }> = [];
  const attacks: Array<{ fighterIndex: number; targetInstanceId: string; die: number; hit: boolean; damage: number }> = [];
  for (const action of input.actions) {
    if (typeof action.targetInstanceId !== 'string' || !action.targetInstanceId.trim()) {
      throw new Error('Every fighter Medium action requires a current Wolf contact.');
    }
    if (action.kind === 'target-shift') {
      safeInteger(action.targetNumber, 'Current Wolf target number', 1);
      if (action.targetNumber > input.targetRingLength || (action.shift !== -1 && action.shift !== 1)) {
        throw new Error('The fighter target shift is outside the current Wolf target ring.');
      }
      targetShifts.push({
        fighterIndex: action.fighterIndex, targetInstanceId: action.targetInstanceId,
        from: action.targetNumber,
        to: ((action.targetNumber - 1 + action.shift + input.targetRingLength) % input.targetRingLength) + 1,
      });
    } else if (action.kind === 'attack') {
      const rolled = die(input.random);
      const hit = rolled >= 5;
      attacks.push({ fighterIndex: action.fighterIndex, targetInstanceId: action.targetInstanceId,
        die: rolled, hit, damage: hit ? 1 : 0 });
    } else {
      throw new Error('Fighter Medium action must be either a target shift or an attack.');
    }
  }
  const next = freezeState({
    ...state, revision: state.revision + 1,
    wings: { ...state.wings, [input.wingId]: { ...wing, mediumResolved: true } },
  });
  return Object.freeze({ state: next,
    targetShifts: Object.freeze(targetShifts.map((value) => Object.freeze(value))),
    attacks: Object.freeze(attacks.map((value) => Object.freeze(value))),
  });
}

export function resolveAegisFighterWingShort(
  state: AegisFighterWingCombatState,
  input: Readonly<{
    expectedRevision: unknown; attackId: unknown; cycle: unknown; wingId: FighterWingId;
    fighterIndexes: readonly number[]; random: WolfRandomInt;
  }>,
): AegisFighterWingShortResolution {
  validateIdentity(state, input);
  validateWing(state, input.wingId);
  const wing = state.wings[input.wingId];
  if (!wing.launched) throw new Error('Launch this fighter wing before resolving Short Range.');
  if (wing.shortResolved) throw new Error('This fighter wing has already resolved Short Range.');
  if (!Array.isArray(input.fighterIndexes)) throw new Error('Short Range fighter indexes must be a list.');
  validateIndexes(input.fighterIndexes, wing.fighters, 'Short Range');
  const rolls = input.fighterIndexes.map((fighterIndex) => {
    const rolled = die(input.random);
    return Object.freeze({ fighterIndex, die: rolled, hit: rolled >= 3, destroyed: rolled <= 2 });
  });
  const losses = rolls.filter(({ destroyed }) => destroyed).length;
  const nextWing = {
    ...wing, fighters: wing.fighters - losses, losses: wing.losses + losses, shortResolved: true,
  };
  return Object.freeze({
    state: freezeState({ ...state, revision: state.revision + 1,
      wings: { ...state.wings, [input.wingId]: nextWing } }),
    rolls: Object.freeze(rolls), losses,
  });
}
