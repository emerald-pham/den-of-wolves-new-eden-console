import {parseMaliadesState} from './maliadesState';

/** Current craft operation and use markers; private targets and dice are absent. */
export interface MaliadesOperationalView {
  readonly type: 'maliades-operational-view';
  readonly revision: number;
  readonly attackId: string | null;
  readonly attackCycle: number | null;
  readonly launched: boolean;
  readonly damage: 0 | 1 | 2 | 3;
  readonly destroyed: boolean;
  readonly mediumResolved: boolean;
  readonly shortResolved: boolean;
}

const FIELDS = ['type', 'revision', 'attackId', 'attackCycle', 'launched', 'damage',
  'destroyed', 'mediumResolved', 'shortResolved'] as const;

/** The allowlist is reused when a member DTO is filtered again by the client. */
export function parseMaliadesOperationalView(value: unknown): MaliadesOperationalView | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).length !== FIELDS.length || FIELDS.some(field => !Object.hasOwn(raw, field)) ||
      raw.type !== 'maliades-operational-view' ||
      !Number.isSafeInteger(raw.revision) || Number(raw.revision) < 0 ||
      !Number.isSafeInteger(raw.damage) || Number(raw.damage) < 0 || Number(raw.damage) > 3 ||
      typeof raw.launched !== 'boolean' || typeof raw.destroyed !== 'boolean' ||
      typeof raw.mediumResolved !== 'boolean' || typeof raw.shortResolved !== 'boolean' ||
      raw.destroyed !== (raw.damage === 3) ||
      (raw.attackId !== null && (typeof raw.attackId !== 'string' || !/^[\w-]{1,128}$/.test(raw.attackId))) ||
      (raw.attackCycle !== null && (!Number.isSafeInteger(raw.attackCycle) || Number(raw.attackCycle) < 1)) ||
      (raw.attackId === null) !== (raw.attackCycle === null) ||
      (!raw.launched && (raw.mediumResolved || raw.shortResolved)) ||
      (raw.launched && (raw.attackId === null || Number(raw.revision) < 1)) ||
      (raw.attackId === null && (raw.revision !== 0 || raw.damage !== 0 || raw.launched || raw.mediumResolved || raw.shortResolved)) ||
      (raw.revision === 1 && (raw.damage !== 0 || raw.mediumResolved || raw.shortResolved))) return undefined;
  return Object.freeze(Object.fromEntries(FIELDS.map(field => [field, raw[field]])) as unknown as MaliadesOperationalView);
}

/** Publish validated current state while retaining detailed results privately. */
export function maliadesOperationalView(value: unknown): MaliadesOperationalView | undefined {
  if (value === undefined) return undefined;
  const publicView = parseMaliadesOperationalView(value);
  if (publicView) return publicView;
  const state = parseMaliadesState(value);
  if (!state) return undefined;
  return Object.freeze({
    type: 'maliades-operational-view', revision: state.revision,
    attackId: state.attackId, attackCycle: state.attackCycle,
    launched: state.launched, damage: state.damage, destroyed: state.destroyed,
    mediumResolved: state.medium !== null, shortResolved: state.short !== null,
  });
}
