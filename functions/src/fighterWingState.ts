import {
  FIGHTER_WING_CAPACITY,
  type FighterWingId,
} from './fighterWings';

/**
 * A server-owned source of bounded entropy. Production callers must provide
 * the server random source; tests may inject a deterministic implementation.
 */
export type FighterWingRandomInt = (upperBound: number) => number;

export type FighterMediumAction =
  | {
    readonly fighterIndex: number;
    readonly kind: 'target-shift';
    readonly targetId: string;
    readonly targetNumber: number;
    readonly shift: -1 | 1;
  }
  | {
    readonly fighterIndex: number;
    readonly kind: 'attack';
    readonly targetId: string;
  };

export interface FighterWingState {
  readonly wingId: FighterWingId;
  readonly fighters: number;
  readonly capacity: 4 | 6;
  readonly launched: boolean;
  readonly launchedFighterCount: number;
  readonly mediumResolved: boolean;
  readonly mediumActionFighterIndexes: readonly number[];
  readonly shortResolved: boolean;
  readonly shortRollFighterIndexes: readonly number[];
  readonly losses: number;
}

export interface FighterMediumAttackResult {
  readonly fighterIndex: number;
  readonly targetId: string;
  readonly die: number;
  readonly hit: boolean;
}

export interface FighterMediumTargetShiftResult {
  readonly fighterIndex: number;
  readonly targetId: string;
  readonly targetNumber: number;
  readonly shift: -1 | 1;
  readonly shiftedTargetNumber: number;
}

export interface FighterMediumResolution {
  readonly state: FighterWingState;
  readonly attacks: readonly FighterMediumAttackResult[];
  readonly targetShifts: readonly FighterMediumTargetShiftResult[];
}

export interface FighterShortRollResult {
  readonly fighterIndex: number;
  readonly die: number;
  readonly hit: boolean;
  readonly destroyed: boolean;
}

export interface FighterShortResolution {
  readonly state: FighterWingState;
  readonly rolls: readonly FighterShortRollResult[];
  readonly losses: number;
}

function requireSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be an integer.`);
}

function requireNonNegativeInteger(value: number, label: string): void {
  requireSafeInteger(value, label);
  if (value < 0) throw new Error(`${label} must be non-negative.`);
}

function requireTargetId(targetId: string): void {
  if (typeof targetId !== 'string' || targetId.trim().length === 0) {
    throw new Error('The fighter target is required.');
  }
}

function validateRandomSample(random: FighterWingRandomInt): number {
  const sample = random(6);
  if (!Number.isSafeInteger(sample) || sample < 0 || sample >= 6) {
    throw new Error('The server randomness source returned an invalid sample.');
  }
  return sample + 1;
}

function validateActionIndexes(
  actions: readonly { readonly fighterIndex: number }[],
  fighterCount: number,
  label: string,
): void {
  if (!Array.isArray(actions)) throw new Error(`The ${label} action list is malformed.`);
  const indexes = actions.map(({ fighterIndex }) => fighterIndex);
  if (new Set(indexes).size !== indexes.length) {
    throw new Error(`A fighter may have only one ${label} action.`);
  }
  indexes.forEach((fighterIndex) => {
    requireSafeInteger(fighterIndex, `${label} fighter index`);
    if (fighterIndex < 0 || fighterIndex >= fighterCount) {
      throw new Error(`The ${label} fighter index exceeds this wing's fighters.`);
    }
  });
}

function freezeState(state: FighterWingState): FighterWingState {
  return Object.freeze({
    ...state,
    mediumActionFighterIndexes: Object.freeze([...state.mediumActionFighterIndexes]),
    shortRollFighterIndexes: Object.freeze([...state.shortRollFighterIndexes]),
  });
}

/** Create an independent Alpha or Bravo state for one attack. */
export function initialFighterWingState(
  wingId: FighterWingId,
  fighters: number,
  capacity: 4 | 6 = FIGHTER_WING_CAPACITY.standard,
): FighterWingState {
  if (capacity !== FIGHTER_WING_CAPACITY.standard && capacity !== FIGHTER_WING_CAPACITY.upgraded) {
    throw new Error('The fighter-wing capacity is invalid.');
  }
  requireNonNegativeInteger(fighters, 'Fighter count');
  if (fighters > capacity) throw new Error('The fighter count exceeds this wing\'s capacity.');
  return freezeState({
    wingId,
    fighters,
    capacity,
    launched: false,
    launchedFighterCount: 0,
    mediumResolved: false,
    mediumActionFighterIndexes: [],
    shortResolved: false,
    shortRollFighterIndexes: [],
    losses: 0,
  });
}

/**
 * Mark one wing as launched after the caller has checked attack authority.
 * The state transition still enforces the printed bay charge/damage rule.
 */
export function launchFighterWing(
  state: FighterWingState,
  input: Readonly<{ bayCharged: boolean; bayDamaged: boolean }>,
): FighterWingState {
  if (state.launched) throw new Error('This fighter wing is already launched.');
  if (state.fighters < 1) throw new Error('A wing without fighters cannot launch.');
  if (input.bayDamaged) throw new Error('A damaged Fighter Bay cannot launch this wing.');
  if (!input.bayCharged) throw new Error('Charge the Fighter Bay before launching this wing.');
  return freezeState({
    ...state,
    launched: true,
    launchedFighterCount: state.fighters,
  });
}

/** Apply one printed ±1 target-number shift, including 0/7 wrap endpoints. */
export function shiftFighterTargetNumber(targetNumber: number, shift: -1 | 1): number {
  requireSafeInteger(targetNumber, 'The fighter target number');
  if (targetNumber < 1 || targetNumber > 6) {
    throw new Error('The fighter target number must be from 1 through 6.');
  }
  if (shift !== -1 && shift !== 1) throw new Error('The fighter target shift must be -1 or 1.');
  return targetNumber + shift;
}

/** Resolve at most one Medium action for each committed fighter in one wing. */
export function resolveFighterWingMedium(
  state: FighterWingState,
  actions: readonly FighterMediumAction[],
  random: FighterWingRandomInt,
): FighterMediumResolution {
  if (!state.launched) throw new Error('Launch this fighter wing before resolving Medium Range.');
  if (state.mediumResolved) throw new Error('Medium Range has already resolved for this wing.');
  validateActionIndexes(actions, state.launchedFighterCount, 'Medium Range');

  const attacks: FighterMediumAttackResult[] = [];
  const targetShifts: FighterMediumTargetShiftResult[] = [];
  actions.forEach((action) => {
    requireTargetId(action.targetId);
    if (action.kind === 'target-shift') {
      targetShifts.push({
        fighterIndex: action.fighterIndex,
        targetId: action.targetId,
        targetNumber: action.targetNumber,
        shift: action.shift,
        shiftedTargetNumber: shiftFighterTargetNumber(action.targetNumber, action.shift),
      });
      return;
    }
    const die = validateRandomSample(random);
    attacks.push({
      fighterIndex: action.fighterIndex,
      targetId: action.targetId,
      die,
      hit: die >= 5,
    });
  });
  return {
    state: freezeState({
      ...state,
      mediumResolved: true,
      mediumActionFighterIndexes: actions.map(({ fighterIndex }) => fighterIndex),
    }),
    attacks,
    targetShifts,
  };
}

/** Resolve at most one Short Range roll for each committed fighter in a wing. */
export function resolveFighterWingShort(
  state: FighterWingState,
  fighterIndexes: readonly number[],
  random: FighterWingRandomInt,
): FighterShortResolution {
  if (!state.launched) throw new Error('Launch this fighter wing before resolving Short Range.');
  if (!state.mediumResolved) throw new Error('Resolve Medium Range before Short Range.');
  if (state.shortResolved) throw new Error('Short Range has already resolved for this wing.');
  const indexes = fighterIndexes.map((fighterIndex) => ({ fighterIndex }));
  validateActionIndexes(indexes, state.launchedFighterCount, 'Short Range');

  const rolls = indexes.map(({ fighterIndex }): FighterShortRollResult => {
    const die = validateRandomSample(random);
    return { fighterIndex, die, hit: die >= 3, destroyed: die <= 2 };
  });
  const losses = rolls.filter(({ destroyed }) => destroyed).length;
  return {
    state: freezeState({
      ...state,
      fighters: state.fighters - losses,
      shortResolved: true,
      shortRollFighterIndexes: [...fighterIndexes],
      losses: state.losses + losses,
    }),
    rolls,
    losses,
  };
}
