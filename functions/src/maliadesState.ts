/**
 * Server-owned Maliades state transitions.
 *
 * Prompt 192 owns launch authority and Prompt 453 owns the production range
 * callables. This module deliberately accepts only the already-authorized
 * launch/fuel context and resolves the printed damage and dice rules without
 * deciding roles, docking, phase, target legality, or mission semantics.
 */

export type MaliadesRandomInt = (upperBound: number) => number;

export type MaliadesMediumChoice =
  | Readonly<{ kind: 'target-shift'; targetId: string; shift: -1 | 1; wolfRosterIndex?: number }>
  | Readonly<{ kind: 'attack'; targetId: string }>;

export interface MaliadesAttackIdentity {
  readonly attackId: string;
  readonly cycle: number;
}

export interface MaliadesMediumAttack {
  readonly targetId: string;
  readonly die: number;
  readonly hit: boolean;
  readonly selfDamage: number;
}

export interface MaliadesMediumResolution {
  readonly targetShift: Readonly<{ targetId: string; shift: -1 | 1 }> | null;
  readonly attack: MaliadesMediumAttack | null;
}

export interface MaliadesShortRoll {
  readonly targetId: string;
  readonly die: number;
  readonly hit: boolean;
  readonly selfDamage: number;
}

export interface MaliadesShortResolution {
  readonly rolls: readonly MaliadesShortRoll[];
  readonly selfDamage: number;
}

export interface MaliadesState {
  readonly revision: number;
  /** The current Wolf attack identity; damage survives across identities. */
  readonly attackId: string | null;
  readonly attackCycle: number | null;
  readonly launched: boolean;
  readonly damage: 0 | 1 | 2 | 3;
  readonly destroyed: boolean;
  readonly medium: MaliadesMediumResolution | null;
  readonly short: MaliadesShortResolution | null;
}

export interface MaliadesTransitionInput {
  readonly expectedRevision: unknown;
  readonly attackId?: unknown;
  readonly attackCycle?: unknown;
}

const MAX_DAMAGE = 3 as const;

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as RecordValue
    : undefined;
}

function exactKeys(value: RecordValue, keys: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function requireSafeInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer.`);
}

function requireExpectedRevision(input: MaliadesTransitionInput, state: MaliadesState): void {
  requireSafeInteger(input.expectedRevision, 'Maliades expected revision');
  if (input.expectedRevision !== state.revision) {
    throw new Error('Maliades state changed; refresh before acting.');
  }
  if (state.revision >= Number.MAX_SAFE_INTEGER) {
    throw new Error('Maliades revision cannot advance safely.');
  }
}

function requireTargetId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('A Maliades target is required.');
  }
}

function requireAttackIdentity(input: MaliadesTransitionInput): MaliadesAttackIdentity {
  requireTargetId(input.attackId);
  requireSafeInteger(input.attackCycle, 'Maliades attack cycle');
  if (input.attackCycle < 1) throw new Error('Maliades attack cycle must be positive.');
  return { attackId: input.attackId, cycle: input.attackCycle };
}

function requireCurrentAttack(state: MaliadesState, input: MaliadesTransitionInput): MaliadesAttackIdentity {
  const identity = requireAttackIdentity(input);
  if (state.attackId !== identity.attackId || state.attackCycle !== identity.cycle) {
    throw new Error('The Maliades state belongs to a different Wolf attack.');
  }
  return identity;
}

function requireRandomDie(random: MaliadesRandomInt): number {
  const sample = random(6);
  if (!Number.isSafeInteger(sample) || sample < 0 || sample >= 6) {
    throw new Error('The server randomness source returned an invalid Maliades die.');
  }
  return sample + 1;
}

function damageAfter(state: MaliadesState, added: number): 0 | 1 | 2 | 3 {
  requireSafeInteger(added, 'Maliades damage');
  if (added < 0 || added > MAX_DAMAGE) throw new Error('Maliades damage is outside the printed range.');
  return Math.min(MAX_DAMAGE, state.damage + added) as 0 | 1 | 2 | 3;
}

function freezeMedium(value: MaliadesMediumResolution | null): MaliadesMediumResolution | null {
  if (!value) return null;
  return Object.freeze({
    targetShift: value.targetShift ? Object.freeze({ ...value.targetShift }) : null,
    attack: value.attack ? Object.freeze({ ...value.attack }) : null,
  });
}

function freezeShort(value: MaliadesShortResolution | null): MaliadesShortResolution | null {
  if (!value) return null;
  return Object.freeze({
    rolls: Object.freeze(value.rolls.map((roll) => Object.freeze({ ...roll }))),
    selfDamage: value.selfDamage,
  });
}

function freezeState(value: MaliadesState): MaliadesState {
  return Object.freeze({
    ...value,
    medium: freezeMedium(value.medium),
    short: freezeShort(value.short),
  });
}

function parseMedium(value: unknown): MaliadesMediumResolution | null | undefined {
  if (value === null) return null;
  const raw = record(value);
  if (!raw || !exactKeys(raw, ['attack', 'targetShift'])) return undefined;

  let targetShift: MaliadesMediumResolution['targetShift'] = null;
  if (raw.targetShift !== null) {
    const shift = record(raw.targetShift);
    if (!shift || !exactKeys(shift, ['shift', 'targetId']) ||
        (shift.shift !== -1 && shift.shift !== 1)) return undefined;
    try { requireTargetId(shift.targetId); } catch { return undefined; }
    targetShift = { targetId: shift.targetId, shift: shift.shift };
  }

  let attack: MaliadesMediumResolution['attack'] = null;
  if (raw.attack !== null) {
    const result = record(raw.attack);
    if (!result || !exactKeys(result, ['die', 'hit', 'selfDamage', 'targetId']) ||
        typeof result.hit !== 'boolean') return undefined;
    try { requireTargetId(result.targetId); requireSafeInteger(result.die, 'Maliades Medium die'); } catch { return undefined; }
    const targetId = result.targetId as string;
    const die = result.die as number;
    const selfDamage = result.selfDamage as number;
    if (die < 1 || die > 6 ||
        !Number.isSafeInteger(selfDamage) ||
        selfDamage !== (die < 4 ? 1 : 0) ||
        result.hit !== (die >= 4)) return undefined;
    attack = {
      targetId,
      die,
      hit: result.hit,
      selfDamage,
    };
  }
  if (!targetShift && !attack) return undefined;
  if (targetShift && attack && targetShift.targetId === attack.targetId) return undefined;
  return { targetShift, attack };
}

function parseShort(value: unknown): MaliadesShortResolution | null | undefined {
  if (value === null) return null;
  const raw = record(value);
  if (!raw || !exactKeys(raw, ['rolls', 'selfDamage']) || !Array.isArray(raw.rolls) ||
      !Number.isSafeInteger(raw.selfDamage)) return undefined;
  const selfDamage = raw.selfDamage as number;
  if (selfDamage < 0) return undefined;
  if (raw.rolls.length < 1 || raw.rolls.length > 2) return undefined;
  const rolls: MaliadesShortRoll[] = [];
  for (const item of raw.rolls) {
    const roll = record(item);
    if (!roll || !exactKeys(roll, ['die', 'hit', 'selfDamage', 'targetId']) ||
        typeof roll.hit !== 'boolean') return undefined;
    try { requireTargetId(roll.targetId); requireSafeInteger(roll.die, 'Maliades Short die'); } catch { return undefined; }
    const targetId = roll.targetId as string;
    const die = roll.die as number;
    const rollSelfDamage = roll.selfDamage as number;
    if (die < 1 || die > 6 ||
        !Number.isSafeInteger(rollSelfDamage) || rollSelfDamage !== (die === 1 ? 1 : 0) ||
        roll.hit !== (die >= 2)) return undefined;
    rolls.push({ targetId, die, hit: roll.hit, selfDamage: rollSelfDamage });
  }
  if (new Set(rolls.map(({ targetId }) => targetId)).size !== rolls.length ||
      selfDamage !== rolls.reduce((sum, roll) => sum + roll.selfDamage, 0)) return undefined;
  return { rolls, selfDamage };
}

/** Parse persisted state and reject malformed or client-shaped state. */
export function parseMaliadesState(value: unknown): MaliadesState | null {
  if (value === undefined) return initialMaliadesState();
  const raw = record(value);
  const legacyShape = raw && exactKeys(raw, ['damage', 'destroyed', 'launched', 'medium', 'revision', 'short']);
  const currentShape = raw && exactKeys(raw, ['attackCycle', 'attackId', 'damage', 'destroyed', 'launched', 'medium', 'revision', 'short']);
  if (!raw || (!legacyShape && !currentShape) ||
      !Number.isSafeInteger(raw.revision) || !Number.isSafeInteger(raw.damage) ||
      typeof raw.launched !== 'boolean' || typeof raw.destroyed !== 'boolean') return null;
  const revision = raw.revision as number;
  const launched = raw.launched as boolean;
  const damage = raw.damage as 0 | 1 | 2 | 3;
  const destroyed = raw.destroyed as boolean;
  const attackId = currentShape ? raw.attackId : null;
  const attackCycle = currentShape ? raw.attackCycle : null;
  if (attackId !== null && (typeof attackId !== 'string' || !/^[\w-]{1,128}$/.test(attackId))) return null;
  if (attackCycle !== null && (!Number.isSafeInteger(attackCycle) || (attackCycle as number) < 1)) return null;
  if ((attackId === null) !== (attackCycle === null)) return null;
  if (revision < 0 || damage < 0 || damage > MAX_DAMAGE || destroyed !== (damage === MAX_DAMAGE)) return null;
  const medium = parseMedium(raw.medium);
  const short = parseShort(raw.short);
  if (medium === undefined || short === undefined || (!launched && (medium || short))) return null;
  // The launch transition is the only way to leave the immutable initial
  // state. Reject client-shaped snapshots that skip that transition or claim
  // extra revisions without a persisted resolution/repair history anchor.
  if (!launched && attackId === null && (revision !== 0 || damage !== 0 || destroyed)) return null;
  if (!launched && attackId !== null && (medium || short)) return null;
  if (launched && (attackId === null || attackCycle === null || revision < 1)) return null;
  if (revision === 1 && (damage !== 0 || medium || short)) return null;
  if (revision > 1 && !medium && !short && attackId === null) return null;
  return freezeState({
    revision,
    attackId: attackId as string | null,
    attackCycle: attackCycle as number | null,
    launched,
    damage,
    destroyed,
    medium,
    short,
  });
}

/** Create the server-owned initial state for the registered Maliades craft. */
export function initialMaliadesState(): MaliadesState {
  return freezeState({
    revision: 0,
    attackId: null,
    attackCycle: null,
    launched: false,
    damage: 0,
    destroyed: false,
    medium: null,
    short: null,
  });
}

/** Start a new declared Wolf attack while preserving accumulated durability. */
export function beginMaliadesAttack(
  state: MaliadesState,
  input: MaliadesTransitionInput & Readonly<{ attackId: string; attackCycle: number }>,
): MaliadesState {
  requireExpectedRevision(input, state);
  const identity = requireAttackIdentity(input);
  if (state.attackId === identity.attackId && state.attackCycle === identity.cycle) {
    throw new Error('The Maliades Wolf attack is already current.');
  }
  return freezeState({
    ...state,
    revision: state.revision + 1,
    attackId: identity.attackId,
    attackCycle: identity.cycle,
    launched: false,
    medium: null,
    short: null,
  });
}

/** Admit the craft after the caller has proved the registered launch authority. */
export function launchMaliades(
  state: MaliadesState,
  input: MaliadesTransitionInput & Readonly<{ launchAllowed: boolean; attackId: string; attackCycle: number }>,
): MaliadesState {
  requireExpectedRevision(input, state);
  const identity = requireAttackIdentity(input);
  if (state.attackId !== identity.attackId || state.attackCycle !== identity.cycle) {
    if (state.launched && state.attackId === null) {
      throw new Error('The previous Maliades attack identity is unavailable.');
    }
    state = freezeState({
      ...state,
      attackId: identity.attackId,
      attackCycle: identity.cycle,
      launched: false,
      medium: null,
      short: null,
    });
  }
  if (state.launched) throw new Error('Maliades is already launched for this Wolf attack.');
  if (state.destroyed) throw new Error('A destroyed Maliades cannot launch.');
  if (input.launchAllowed !== true) throw new Error('The authoritative Maliades launch check failed.');
  return freezeState({ ...state, revision: state.revision + 1, launched: true });
}

/** Repair a selected amount of damage after the caller has proved fuelled Team-phase docking. */
export function repairMaliades(
  state: MaliadesState,
  input: MaliadesTransitionInput & Readonly<{
    fuelled: boolean;
    damageToRepair: unknown;
    materialsAvailable: unknown;
  }>,
): Readonly<{ state: MaliadesState; materialsRemaining: number }> {
  requireExpectedRevision(input, state);
  if (state.destroyed) throw new Error('A destroyed Maliades cannot be repaired.');
  if (input.fuelled !== true) throw new Error('Fuel the Maliades before repairing it.');
  requireSafeInteger(input.damageToRepair, 'Maliades damage to repair');
  requireSafeInteger(input.materialsAvailable, 'Maliades materials');
  if (input.damageToRepair < 1 || input.damageToRepair > state.damage) {
    throw new Error('Choose a positive amount of existing Maliades damage to repair.');
  }
  if (input.materialsAvailable < input.damageToRepair) {
    throw new Error('Maliades repair requires one material per damage.');
  }
  const damage = (state.damage - input.damageToRepair) as 0 | 1 | 2 | 3;
  return Object.freeze({
    state: freezeState({ ...state, revision: state.revision + 1, damage, destroyed: false }),
    materialsRemaining: input.materialsAvailable - input.damageToRepair,
  });
}

/** Resolve one printed Medium choice, using only server-provided randomness for the optional attack die. */
export function resolveMaliadesMedium(
  state: MaliadesState,
  input: MaliadesTransitionInput & Readonly<{
    attackId: string; attackCycle: number;
    choices: readonly MaliadesMediumChoice[]; random: MaliadesRandomInt;
  }>,
): Readonly<{ state: MaliadesState; resolution: MaliadesMediumResolution }> {
  requireExpectedRevision(input, state);
  requireCurrentAttack(state, input);
  if (!state.launched) throw new Error('Launch Maliades before resolving Medium Range.');
  if (state.destroyed) throw new Error('A destroyed Maliades cannot resolve Medium Range.');
  if (state.medium) throw new Error('Maliades Medium Range has already resolved.');
  if (!Array.isArray(input.choices) || input.choices.length < 1 || input.choices.length > 2) {
    throw new Error('Maliades Medium Range allows one target shift and/or one attack.');
  }
  const targetShift = input.choices.find((choice) => choice.kind === 'target-shift');
  const attack = input.choices.find((choice) => choice.kind === 'attack');
  if (input.choices.some((choice) => choice.kind !== 'target-shift' && choice.kind !== 'attack') ||
      input.choices.filter((choice) => choice.kind === 'target-shift').length > 1 ||
      input.choices.filter((choice) => choice.kind === 'attack').length > 1 ||
      (targetShift && attack && targetShift.targetId === attack.targetId)) {
    throw new Error('Maliades Medium targets must be distinct and use one action of each kind at most.');
  }
  if (targetShift) {
    requireTargetId(targetShift.targetId);
    if (targetShift.shift !== -1 && targetShift.shift !== 1) throw new Error('Maliades target shift must be -1 or 1.');
  }
  let attackResult: MaliadesMediumAttack | undefined;
  let addedDamage = 0;
  if (attack) {
    requireTargetId(attack.targetId);
    const die = requireRandomDie(input.random);
    const hit = die >= 4;
    const selfDamage = hit ? 0 : 1;
    attackResult = { targetId: attack.targetId, die, hit, selfDamage };
    addedDamage = selfDamage;
  }
  const resolution: MaliadesMediumResolution = {
    targetShift: targetShift ? { targetId: targetShift.targetId, shift: targetShift.shift } : null,
    attack: attackResult ?? null,
  };
  const damage = damageAfter(state, addedDamage);
  return Object.freeze({
    state: freezeState({
      ...state,
      revision: state.revision + 1,
      damage,
      destroyed: damage === MAX_DAMAGE,
      medium: resolution,
    }),
    resolution: freezeMedium(resolution)!,
  });
}

/** Resolve the printed Short attack, including its server-owned self-risk. */
export function resolveMaliadesShort(
  state: MaliadesState,
  input: MaliadesTransitionInput & Readonly<{
    attackId: string; attackCycle: number;
    targetIds: readonly string[]; random: MaliadesRandomInt;
  }>,
): Readonly<{ state: MaliadesState; resolution: MaliadesShortResolution }> {
  requireExpectedRevision(input, state);
  requireCurrentAttack(state, input);
  if (!state.launched) throw new Error('Launch Maliades before resolving Short Range.');
  if (state.destroyed) throw new Error('A destroyed Maliades cannot resolve Short Range.');
  if (state.short) throw new Error('Maliades Short Range has already resolved.');
  if (!Array.isArray(input.targetIds) || input.targetIds.length < 1 || input.targetIds.length > 2) {
    throw new Error('Maliades Short Range allows up to two targets.');
  }
  input.targetIds.forEach(requireTargetId);
  if (new Set(input.targetIds).size !== input.targetIds.length) {
    throw new Error('Maliades Short Range targets must be distinct.');
  }
  const rolls = input.targetIds.map((targetId): MaliadesShortRoll => {
    const die = requireRandomDie(input.random);
    const hit = die >= 2;
    const selfDamage = die === 1 ? 1 : 0;
    return { targetId, die, hit, selfDamage };
  });
  const selfDamage = rolls.reduce((sum, roll) => sum + roll.selfDamage, 0);
  const damage = damageAfter(state, selfDamage);
  const resolution: MaliadesShortResolution = { rolls, selfDamage };
  return Object.freeze({
    state: freezeState({
      ...state,
      revision: state.revision + 1,
      damage,
      destroyed: damage === MAX_DAMAGE,
      short: resolution,
    }),
    resolution: freezeShort(resolution)!,
  });
}
