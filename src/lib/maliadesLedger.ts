import type { MaliadesStateRecord } from '@/types/game';

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as RecordValue : undefined;
}

function exactKeys(value: RecordValue, keys: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function safeTarget(value: unknown): value is string {
  return typeof value === 'string' && /^[\w-]{1,128}$/.test(value);
}

function parseMedium(value: unknown): MaliadesStateRecord['medium'] | undefined {
  if (value === null) return null;
  const raw = record(value);
  if (!raw || !exactKeys(raw, ['attack', 'targetShift'])) return undefined;
  let targetShift: NonNullable<MaliadesStateRecord['medium']>['targetShift'] = null;
  if (raw.targetShift !== null) {
    const shift = record(raw.targetShift);
    if (!shift || !exactKeys(shift, ['shift', 'targetId']) ||
        !safeTarget(shift.targetId) || (shift.shift !== -1 && shift.shift !== 1)) return undefined;
    targetShift = { targetId: shift.targetId, shift: shift.shift };
  }
  let attack: NonNullable<MaliadesStateRecord['medium']>['attack'] = null;
  if (raw.attack !== null) {
    const result = record(raw.attack);
    if (!result || !exactKeys(result, ['die', 'hit', 'selfDamage', 'targetId']) ||
        !safeTarget(result.targetId) || typeof result.hit !== 'boolean' ||
        !Number.isSafeInteger(result.die) || (result.die as number) < 1 || (result.die as number) > 6 ||
        !Number.isSafeInteger(result.selfDamage) ||
        result.selfDamage !== ((result.die as number) < 4 ? 1 : 0) ||
        result.hit !== ((result.die as number) >= 4)) return undefined;
    attack = {
      targetId: result.targetId,
      die: result.die as number,
      hit: result.hit,
      selfDamage: result.selfDamage as number,
    };
  }
  if (!targetShift && !attack) return undefined;
  if (targetShift && attack && targetShift.targetId === attack.targetId) return undefined;
  return { targetShift, attack };
}

function parseShort(value: unknown): MaliadesStateRecord['short'] | undefined {
  if (value === null) return null;
  const raw = record(value);
  if (!raw || !exactKeys(raw, ['rolls', 'selfDamage']) || !Array.isArray(raw.rolls) ||
      !Number.isSafeInteger(raw.selfDamage) || (raw.selfDamage as number) < 0 ||
      raw.rolls.length < 1 || raw.rolls.length > 2) return undefined;
  const rolls = raw.rolls.map((item) => {
    const roll = record(item);
    if (!roll || !exactKeys(roll, ['die', 'hit', 'selfDamage', 'targetId']) ||
        !safeTarget(roll.targetId) || typeof roll.hit !== 'boolean' ||
        !Number.isSafeInteger(roll.die) || (roll.die as number) < 1 || (roll.die as number) > 6 ||
        !Number.isSafeInteger(roll.selfDamage) ||
        roll.selfDamage !== ((roll.die as number) === 1 ? 1 : 0) ||
        roll.hit !== ((roll.die as number) >= 2)) return undefined;
    return {
      targetId: roll.targetId as string,
      die: roll.die as number,
      hit: roll.hit as boolean,
      selfDamage: roll.selfDamage as number,
    };
  });
  if (rolls.some((roll) => roll === undefined)) return undefined;
  const parsed = rolls as NonNullable<MaliadesStateRecord['short']>['rolls'];
  if (new Set(parsed.map(({ targetId }) => targetId)).size !== parsed.length ||
      (raw.selfDamage as number) !== parsed.reduce((sum, roll) => sum + roll.selfDamage, 0)) return undefined;
  return { rolls: parsed, selfDamage: raw.selfDamage as number };
}

/** Parse the public Maliades projection and fail closed on client-shaped state. */
export function parseMaliadesState(value: unknown): MaliadesStateRecord | undefined {
  if (value === undefined) return {
    revision: 0, attackId: null, attackCycle: null,
    launched: false, damage: 0, destroyed: false, medium: null, short: null,
  };
  const raw = record(value);
  const legacyShape = raw && exactKeys(raw, ['damage', 'destroyed', 'launched', 'medium', 'revision', 'short']);
  const currentShape = raw && exactKeys(raw, ['attackCycle', 'attackId', 'damage', 'destroyed', 'launched', 'medium', 'revision', 'short']);
  if (!raw || (!legacyShape && !currentShape) ||
      !Number.isSafeInteger(raw.revision) || (raw.revision as number) < 0 ||
      !Number.isSafeInteger(raw.damage) || (raw.damage as number) < 0 || (raw.damage as number) > 3 ||
      typeof raw.launched !== 'boolean' || typeof raw.destroyed !== 'boolean' ||
      raw.destroyed !== ((raw.damage as number) === 3)) return undefined;
  const attackId = currentShape ? raw.attackId : null;
  const attackCycle = currentShape ? raw.attackCycle : null;
  if (attackId !== null && (typeof attackId !== 'string' || !safeTarget(attackId))) return undefined;
  if (attackCycle !== null && (!Number.isSafeInteger(attackCycle) || (attackCycle as number) < 1)) return undefined;
  if ((attackId === null) !== (attackCycle === null)) return undefined;
  const medium = parseMedium(raw.medium);
  const short = parseShort(raw.short);
  if (medium === undefined || short === undefined ||
      (!raw.launched && attackId === null && (raw.revision !== 0 || raw.damage !== 0 || raw.destroyed || medium || short)) ||
      (!raw.launched && attackId !== null && (medium || short)) ||
      (raw.launched && (attackId === null || attackCycle === null || (raw.revision as number) < 1)) ||
      (raw.revision === 1 && (raw.damage !== 0 || medium || short)) ||
      ((raw.revision as number) > 1 && !medium && !short && attackId === null)) return undefined;
  return {
    revision: raw.revision as number,
    attackId: attackId as string | null,
    attackCycle: attackCycle as number | null,
    launched: raw.launched,
    damage: raw.damage as 0 | 1 | 2 | 3,
    destroyed: raw.destroyed,
    medium,
    short,
  };
}
