/**
 * Server-owned state for the P.D.F. Escort Fighter Wing.
 *
 * Prompt 273 owns the immutable registration facts. Prompt 231 owns the
 * authoritative Fighter Bay launch gate. This module owns only the mutable
 * wing state and printed combat resolutions, so a future callable can compose
 * those already-authorized boundaries without making the mission path depend
 * on a charged or launched wing.
 */

export type PdfEscortWingRandomInt = (upperBound: number) => number;

export type PdfEscortWingMediumAction =
  | Readonly<{
      fighterIndex: number;
      kind: 'target-shift';
      targetId: string;
      targetNumber: number;
      shift: -1 | 1;
    }>
  | Readonly<{
      fighterIndex: number;
      kind: 'attack';
      targetId: string;
    }>;

export interface PdfEscortWingMissionContract {
  readonly eligible: true;
  readonly requiresFuel: false;
  readonly bonuses: Readonly<{
    readonly searchAndRescue: 2;
    readonly salvage: 1;
  }>;
}

export interface PdfEscortWingState {
  readonly type: 'pdf-escort-fighter-wing-state';
  readonly revision: number;
  readonly wingId: 'pdf-escort-fighter-wing';
  readonly capacity: 4;
  readonly fighters: number;
  readonly launched: boolean;
  readonly mediumResolved: boolean;
  readonly mediumActionFighterIndexes: readonly number[];
  readonly shortResolved: boolean;
  readonly shortRollFighterIndexes: readonly number[];
  readonly losses: number;
  readonly mission: PdfEscortWingMissionContract;
}

export interface PdfEscortWingMediumAttackResult {
  readonly fighterIndex: number;
  readonly targetId: string;
  readonly die: number;
  readonly hit: boolean;
}

export interface PdfEscortWingMediumTargetShiftResult {
  readonly fighterIndex: number;
  readonly targetId: string;
  readonly targetNumber: number;
  readonly shift: -1 | 1;
  readonly shiftedTargetNumber: number;
}

export interface PdfEscortWingMediumResolution {
  readonly state: PdfEscortWingState;
  readonly attacks: readonly PdfEscortWingMediumAttackResult[];
  readonly targetShifts: readonly PdfEscortWingMediumTargetShiftResult[];
}

export interface PdfEscortWingShortRollResult {
  readonly fighterIndex: number;
  readonly die: number;
  readonly hit: boolean;
  readonly destroyed: boolean;
}

export interface PdfEscortWingShortResolution {
  readonly state: PdfEscortWingState;
  readonly rolls: readonly PdfEscortWingShortRollResult[];
  readonly losses: number;
}

export interface PdfEscortWingMissionAuthorization {
  readonly type: 'pdf-escort-fighter-wing-mission-authorization';
  readonly wingId: 'pdf-escort-fighter-wing';
  readonly requiresFuel: false;
  readonly bonuses: PdfEscortWingMissionContract['bonuses'];
}

const CAPACITY = 4 as const;

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as RecordValue
    : undefined;
}

function exactKeys(value: RecordValue, keys: readonly string[]): boolean {
  const expected = [...keys].sort();
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify(expected);
}

function requireSafeInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer.`);
}

function requireTargetId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('A PDF Escort Wing target is required.');
  }
}

function validateRandomSample(random: PdfEscortWingRandomInt): number {
  const sample = random(6);
  if (!Number.isSafeInteger(sample) || sample < 0 || sample >= 6) {
    throw new Error('The server randomness source returned an invalid PDF Escort Wing die.');
  }
  return sample + 1;
}

function validateIndexes(
  indexes: readonly number[],
  fighterCount: number,
  label: string,
): void {
  if (!Array.isArray(indexes) || indexes.length > fighterCount) {
    throw new Error(`The PDF Escort Wing ${label} action count exceeds its fighters.`);
  }
  if (new Set(indexes).size !== indexes.length) {
    throw new Error(`A PDF Escort Wing fighter may have only one ${label} action.`);
  }
  indexes.forEach((fighterIndex) => {
    requireSafeInteger(fighterIndex, `PDF Escort Wing ${label} fighter index`);
    if (fighterIndex < 0 || fighterIndex >= fighterCount) {
      throw new Error(`The PDF Escort Wing ${label} fighter index exceeds its fighters.`);
    }
  });
}

function missionContract(): PdfEscortWingMissionContract {
  return Object.freeze({
    eligible: true,
    requiresFuel: false,
    bonuses: Object.freeze({ searchAndRescue: 2, salvage: 1 }),
  });
}

function freezeState(value: PdfEscortWingState): PdfEscortWingState {
  return Object.freeze({
    ...value,
    mediumActionFighterIndexes: Object.freeze([...value.mediumActionFighterIndexes]),
    shortRollFighterIndexes: Object.freeze([...value.shortRollFighterIndexes]),
    mission: Object.freeze({
      ...value.mission,
      bonuses: Object.freeze({ ...value.mission.bonuses }),
    }),
  });
}

function freezeMediumResults(
  value: PdfEscortWingMediumResolution,
): PdfEscortWingMediumResolution {
  return Object.freeze({
    state: value.state,
    attacks: Object.freeze(value.attacks.map((attack) => Object.freeze({ ...attack }))),
    targetShifts: Object.freeze(value.targetShifts.map((shift) => Object.freeze({ ...shift }))),
  });
}

function freezeShortResults(
  value: PdfEscortWingShortResolution,
): PdfEscortWingShortResolution {
  return Object.freeze({
    state: value.state,
    rolls: Object.freeze(value.rolls.map((roll) => Object.freeze({ ...roll }))),
    losses: value.losses,
  });
}

function parseMission(value: unknown): PdfEscortWingMissionContract | undefined {
  const raw = record(value);
  const bonuses = record(raw?.bonuses);
  if (!raw || !exactKeys(raw, ['bonuses', 'eligible', 'requiresFuel']) ||
      raw.eligible !== true || raw.requiresFuel !== false || !bonuses ||
      !exactKeys(bonuses, ['salvage', 'searchAndRescue']) ||
      bonuses.searchAndRescue !== 2 || bonuses.salvage !== 1) return undefined;
  return missionContract();
}

/**
 * Parse the exact server-owned state shape. Unknown keys and client-shaped
 * values fail closed; an omitted state means the registered wing has not yet
 * acted.
 */
export function parsePdfEscortWingState(value: unknown): PdfEscortWingState | null {
  if (value === undefined) return initialPdfEscortWingState();
  const raw = record(value);
  if (!raw || !exactKeys(raw, [
    'capacity', 'fighters', 'launched', 'losses', 'mediumActionFighterIndexes',
    'mediumResolved', 'mission', 'revision', 'shortResolved',
    'shortRollFighterIndexes', 'type', 'wingId',
  ]) || raw.type !== 'pdf-escort-fighter-wing-state' ||
      raw.wingId !== 'pdf-escort-fighter-wing' || raw.capacity !== CAPACITY ||
      !Number.isSafeInteger(raw.revision) || !Number.isSafeInteger(raw.fighters) ||
      !Number.isSafeInteger(raw.losses) || typeof raw.launched !== 'boolean' ||
      typeof raw.mediumResolved !== 'boolean' || typeof raw.shortResolved !== 'boolean' ||
      !Array.isArray(raw.mediumActionFighterIndexes) ||
      !Array.isArray(raw.shortRollFighterIndexes)) return null;

  const revision = raw.revision as number;
  const fighters = raw.fighters as number;
  const losses = raw.losses as number;
  const launched = raw.launched as boolean;
  const mediumResolved = raw.mediumResolved as boolean;
  const shortResolved = raw.shortResolved as boolean;
  const mediumIndexes = raw.mediumActionFighterIndexes;
  const shortIndexes = raw.shortRollFighterIndexes;
  if (revision < 0 || fighters < 0 || fighters > CAPACITY ||
      losses < 0 || losses > CAPACITY || losses !== CAPACITY - fighters ||
      mediumIndexes.some((index) => !Number.isSafeInteger(index)) ||
      shortIndexes.some((index) => !Number.isSafeInteger(index)) ||
      new Set(mediumIndexes).size !== mediumIndexes.length ||
      new Set(shortIndexes).size !== shortIndexes.length ||
      mediumIndexes.some((index) => index < 0 || index >= CAPACITY) ||
      shortIndexes.some((index) => index < 0 || index >= CAPACITY) ||
      mediumResolved !== (mediumIndexes.length > 0) ||
      shortResolved !== (shortIndexes.length > 0) ||
      (launched && revision < 1) ||
      (!launched && revision !== 0) ||
      (!launched && (fighters !== CAPACITY || losses !== 0 || mediumResolved || shortResolved))) {
    return null;
  }
  const mission = parseMission(raw.mission);
  if (!mission) return null;
  return freezeState({
    type: 'pdf-escort-fighter-wing-state',
    revision,
    wingId: 'pdf-escort-fighter-wing',
    capacity: CAPACITY,
    fighters,
    launched,
    mediumResolved,
    mediumActionFighterIndexes: [...mediumIndexes] as number[],
    shortResolved,
    shortRollFighterIndexes: [...shortIndexes] as number[],
    losses,
    mission,
  });
}

/** Create immutable state for the registered four-fighter wing. */
export function initialPdfEscortWingState(): PdfEscortWingState {
  return freezeState({
    type: 'pdf-escort-fighter-wing-state',
    revision: 0,
    wingId: 'pdf-escort-fighter-wing',
    capacity: CAPACITY,
    fighters: CAPACITY,
    launched: false,
    mediumResolved: false,
    mediumActionFighterIndexes: [],
    shortResolved: false,
    shortRollFighterIndexes: [],
    losses: 0,
    mission: missionContract(),
  });
}

function requireExpectedRevision(
  state: PdfEscortWingState,
  expectedRevision: unknown,
): void {
  requireSafeInteger(expectedRevision, 'PDF Escort Wing expected revision');
  if (expectedRevision !== state.revision) {
    throw new Error('PDF Escort Wing state changed; refresh before acting.');
  }
  if (state.revision >= Number.MAX_SAFE_INTEGER) {
    throw new Error('PDF Escort Wing revision cannot advance safely.');
  }
}

/**
 * Launch only after Prompt 231's role, attack-window, charge, and damage
 * checks have succeeded. Mission eligibility deliberately is not consulted.
 */
export function launchPdfEscortWing(
  state: PdfEscortWingState,
  input: Readonly<{
    expectedRevision: unknown;
    launchAllowed: boolean;
    bayCharged: boolean;
    bayDamaged: boolean;
  }>,
): PdfEscortWingState {
  requireExpectedRevision(state, input.expectedRevision);
  if (state.launched) throw new Error('The PDF Escort Wing is already launched.');
  if (state.fighters < 1) throw new Error('A PDF Escort Wing without fighters cannot launch.');
  if (input.launchAllowed !== true) throw new Error('The authoritative PDF Escort Wing launch check failed.');
  if (input.bayDamaged) throw new Error('A damaged Fighter Bay cannot launch the PDF Escort Wing.');
  if (!input.bayCharged) throw new Error('Charge the Fighter Bay before launching the PDF Escort Wing.');
  return freezeState({ ...state, revision: state.revision + 1, launched: true });
}

/** Apply the printed ±1 target shift with the 1↔6 range wraparound. */
export function shiftPdfEscortTargetNumber(targetNumber: number, shift: -1 | 1): number {
  requireSafeInteger(targetNumber, 'The PDF Escort Wing target number');
  if (targetNumber < 1 || targetNumber > 6) {
    throw new Error('The PDF Escort Wing target number must be from 1 through 6.');
  }
  if (shift !== -1 && shift !== 1) throw new Error('The PDF Escort Wing target shift must be -1 or 1.');
  if (targetNumber === 1 && shift === -1) return 6;
  if (targetNumber === 6 && shift === 1) return 1;
  return targetNumber + shift;
}

/** Resolve each committed fighter's one printed Medium action. */
export function resolvePdfEscortWingMedium(
  state: PdfEscortWingState,
  input: Readonly<{
    expectedRevision: unknown;
    actions: readonly PdfEscortWingMediumAction[];
    random: PdfEscortWingRandomInt;
  }>,
): PdfEscortWingMediumResolution {
  requireExpectedRevision(state, input.expectedRevision);
  if (!state.launched) throw new Error('Launch the PDF Escort Wing before resolving Medium Range.');
  if (state.mediumResolved) throw new Error('PDF Escort Wing Medium Range has already resolved.');
  if (!Array.isArray(input.actions) || input.actions.length < 1) {
    throw new Error('PDF Escort Wing Medium Range requires at least one fighter action.');
  }
  const indexes = input.actions.map((action) => action.fighterIndex);
  validateIndexes(indexes, state.fighters, 'Medium Range');
  const attacks: PdfEscortWingMediumAttackResult[] = [];
  const targetShifts: PdfEscortWingMediumTargetShiftResult[] = [];
  input.actions.forEach((action) => {
    requireTargetId(action.targetId);
    if (action.kind === 'target-shift') {
      targetShifts.push({
        fighterIndex: action.fighterIndex,
        targetId: action.targetId,
        targetNumber: action.targetNumber,
        shift: action.shift,
        shiftedTargetNumber: shiftPdfEscortTargetNumber(action.targetNumber, action.shift),
      });
      return;
    }
    if (action.kind !== 'attack') throw new Error('The PDF Escort Wing Medium action is malformed.');
    const die = validateRandomSample(input.random);
    attacks.push({ fighterIndex: action.fighterIndex, targetId: action.targetId, die, hit: die >= 5 });
  });
  const result: PdfEscortWingMediumResolution = {
    state: freezeState({
      ...state,
      revision: state.revision + 1,
      mediumResolved: true,
      mediumActionFighterIndexes: [...indexes],
    }),
    attacks,
    targetShifts,
  };
  return freezeMediumResults(result);
}

/** Resolve up to one printed Short die per remaining fighter. */
export function resolvePdfEscortWingShort(
  state: PdfEscortWingState,
  input: Readonly<{
    expectedRevision: unknown;
    fighterIndexes: readonly number[];
    random: PdfEscortWingRandomInt;
  }>,
): PdfEscortWingShortResolution {
  requireExpectedRevision(state, input.expectedRevision);
  if (!state.launched) throw new Error('Launch the PDF Escort Wing before resolving Short Range.');
  if (state.shortResolved) throw new Error('PDF Escort Wing Short Range has already resolved.');
  if (!Array.isArray(input.fighterIndexes) || input.fighterIndexes.length < 1) {
    throw new Error('PDF Escort Wing Short Range requires at least one fighter roll.');
  }
  validateIndexes(input.fighterIndexes, state.fighters, 'Short Range');
  const rolls = input.fighterIndexes.map((fighterIndex): PdfEscortWingShortRollResult => {
    const die = validateRandomSample(input.random);
    return { fighterIndex, die, hit: die >= 3, destroyed: die <= 2 };
  });
  const losses = rolls.filter((roll) => roll.destroyed).length;
  const result: PdfEscortWingShortResolution = {
    state: freezeState({
      ...state,
      revision: state.revision + 1,
      fighters: state.fighters - losses,
      shortResolved: true,
      shortRollFighterIndexes: [...input.fighterIndexes],
      losses: state.losses + losses,
    }),
    rolls,
    losses,
  };
  return freezeShortResults(result);
}

/**
 * Admit the wing to an away mission after the mission caller has checked its
 * own participant/leader rules. The PDF wing's printed mission contract never
 * consumes Fighter Bay charge or mission fuel, and it remains independent of
 * launch/combat state.
 */
export function authorizePdfEscortWingMission(
  state: PdfEscortWingState,
  input: Readonly<{ missionAllowed: boolean; fuelRequired: boolean }>,
): PdfEscortWingMissionAuthorization {
  if (input.missionAllowed !== true) {
    throw new Error('The authoritative PDF Escort Wing mission check failed.');
  }
  if (input.fuelRequired !== false || state.mission.requiresFuel !== false) {
    throw new Error('The PDF Escort Wing away mission is fuel-free.');
  }
  return Object.freeze({
    type: 'pdf-escort-fighter-wing-mission-authorization',
    wingId: state.wingId,
    requiresFuel: false,
    bonuses: Object.freeze({ ...state.mission.bonuses }),
  });
}
