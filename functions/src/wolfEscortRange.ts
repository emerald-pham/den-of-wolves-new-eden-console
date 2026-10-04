/** PDF and Maliades choices join the shared range lock; no source draws early. */
import { parsePdfEscortWingState, resolvePdfEscortWingMedium, resolvePdfEscortWingShort,
  type PdfEscortWingState, type PdfEscortWingMediumAction } from './pdfEscortWingState';
import { parseMaliadesState, resolveMaliadesMedium, resolveMaliadesShort,
  type MaliadesState, type MaliadesMediumChoice } from './maliadesState';
import { wolfRangeFixedTargetInstanceIds, wolfTargetNumberForRangeSource, type WolfCombatRange, type WolfCombatShip, type WolfRangeAction,
  type WolfRangeRollLock, type WolfRangeTargetShiftChoice, type WolfTargetRing } from './wolfCombatMath';

export type WolfEscortSourceId = 'pdf-escort-fighter-wing' | 'maliades';
export type WolfEscortRange = 'medium-range' | 'short-range';
type Fields = Record<string, unknown>;
const record = (v: unknown): v is Fields => typeof v === 'object' && v !== null && !Array.isArray(v);
const exact = (v: Fields, keys: string[]) => JSON.stringify(Object.keys(v).sort()) === JSON.stringify(keys.sort());

export interface WolfEscortAppliedState {
  readonly pdfState?: PdfEscortWingState;
  readonly maliadesState?: MaliadesState;
  readonly losses: number;
  readonly selfDamage: number;
}
export interface WolfEscortRangeBundle {
  readonly status: 'not-applicable' | 'waiting' | 'unsupported' | 'ready';
  readonly actions?: readonly WolfRangeAction[];
  readonly actionTargets?: Readonly<Record<string, string>>;
  readonly shifts?: readonly WolfRangeTargetShiftChoice[];
  readonly automaticSourceIds?: readonly WolfEscortSourceId[];
  readonly sourceIds?: readonly WolfEscortSourceId[];
  readonly applyLocked?: (lock: WolfRangeRollLock) => WolfEscortAppliedState;
}

export function collectWolfEscortRange(input: Readonly<{
  attackId: string; turn: number; range: WolfCombatRange; roster: readonly WolfCombatShip[];
  ring: WolfTargetRing; pdf: unknown; maliades: unknown; choices: unknown;
  owners: Readonly<Record<WolfEscortSourceId, boolean>>;
}>): WolfEscortRangeBundle {
  if (input.range !== 'medium-range' && input.range !== 'short-range') return { status: 'not-applicable' };
  const range = input.range;
  const pdf = parsePdfEscortWingState(input.pdf);
  const maliades = parseMaliadesState(input.maliades);
  if (!pdf || !maliades || (input.choices !== undefined && !record(input.choices))) return { status: 'unsupported' };
  const all = record(input.choices) ? input.choices : {};
  if (Object.keys(all).some((key) => key !== 'medium-range' && key !== 'short-range') ||
      (all[range] !== undefined && !record(all[range]))) return { status: 'unsupported' };
  const byRange = record(all[range]) ? all[range] : {};
  if (Object.keys(byRange).some((key) => key !== 'pdf-escort-fighter-wing' && key !== 'maliades')) return { status: 'unsupported' };
  const pdfActive = pdf.attackId === input.attackId && pdf.attackCycle === input.turn && pdf.launched && pdf.fighters > 0;
  const maliadesActive = maliades.attackId === input.attackId && maliades.attackCycle === input.turn && maliades.launched && !maliades.destroyed;
  const sourceIds: WolfEscortSourceId[] = [];
  const automaticSourceIds: WolfEscortSourceId[] = [];
  const actions: WolfRangeAction[] = [];
  const actionTargets: Record<string, string> = {};
  const shifts: WolfRangeTargetShiftChoice[] = [];
  const legal = new Set(wolfRangeFixedTargetInstanceIds(range, input.roster));
  const pdfMedium: PdfEscortWingMediumAction[] = [];
  const maliadesMedium: MaliadesMediumChoice[] = [];
  let pdfShort: number[] = [];
  let maliadesShort: string[] = [];
  for (const sourceId of ['pdf-escort-fighter-wing', 'maliades'] as const) {
    const active = sourceId === 'maliades' ? maliadesActive : pdfActive;
    const resolved = sourceId === 'maliades'
      ? (range === 'medium-range' ? maliades.medium !== null : maliades.short !== null)
      : (range === 'medium-range' ? pdf.mediumResolved : pdf.shortResolved);
    const choice = byRange[sourceId];
    if (!active) {
      // A craft destroyed at Medium is legitimately absent at Short; a saved
      // Short decision for an absent/unlaunched craft is still corruption.
      if (choice !== undefined) return { status: 'unsupported' };
      continue;
    }
    if (resolved) return { status: 'unsupported' };
    sourceIds.push(sourceId);
    if (choice === undefined) {
      if (input.owners[sourceId]) return { status: 'waiting' };
      automaticSourceIds.push(sourceId);
      continue;
    }
    const role = sourceId === 'maliades' ? 'dione-engineer' : 'refinery-124-pdf-colonel';
    const choiceField = range === 'medium-range' ? 'actions' : sourceId === 'maliades' ? 'targetInstanceIds' : 'fighterIndexes';
    if (!record(choice) || !exact(choice, ['type', 'status', 'sourceId', 'range', 'attackId', 'turn',
      'revision', 'actorUid', 'actorRoleId', 'requestId', choiceField]) ||
      choice.type !== 'wolf-escort-range-action-choice' || choice.status !== 'committed' ||
      choice.sourceId !== sourceId || choice.range !== range || choice.attackId !== input.attackId || choice.turn !== input.turn ||
      choice.actorRoleId !== role || typeof choice.actorUid !== 'string' || !choice.actorUid ||
      typeof choice.requestId !== 'string' || !/^[\w-]{1,128}$/.test(choice.requestId) ||
      !Number.isSafeInteger(choice.revision) || (choice.revision as number) < 1 || !Array.isArray(choice[choiceField])) return { status: 'unsupported' };
    const raw = choice[choiceField] as unknown[];
    const combatSource = sourceId === 'maliades' ? 'maliades' : 'pdf-escort-wing';
    if (range === 'medium-range') {
      const seen = new Set<unknown>();
      let attackSeen = false;
      let shiftSeen = false;
      for (const item of raw) {
        if (!record(item) || typeof item.targetInstanceId !== 'string' || !legal.has(item.targetInstanceId) ||
            (item.kind !== 'attack' && item.kind !== 'target-shift')) return { status: 'unsupported' };
        const expected = ['kind', 'targetInstanceId', ...(sourceId === 'maliades' ? [] : ['fighterIndex']),
          ...(item.kind === 'target-shift' ? ['targetNumber', 'shift'] : [])];
        if (!exact(item, expected)) return { status: 'unsupported' };
        const rosterIndex = input.roster.findIndex(({ instanceId }) => instanceId === item.targetInstanceId);
        const index = sourceId === 'maliades' ? 0 : item.fighterIndex as number;
        if (sourceId !== 'maliades' && (!Number.isSafeInteger(index) || index < 0 || index >= pdf.fighters || seen.has(index))) return { status: 'unsupported' };
        if (sourceId === 'maliades' && (seen.has(item.targetInstanceId) ||
          (item.kind === 'attack' ? attackSeen : shiftSeen))) return { status: 'unsupported' };
        seen.add(sourceId === 'maliades' ? item.targetInstanceId : index);
        if (item.kind === 'target-shift') {
          if ((item.shift !== -1 && item.shift !== 1) || !Number.isSafeInteger(item.targetNumber) ||
              item.targetNumber !== wolfTargetNumberForRangeSource(combatSource, input.roster[rosterIndex]!.target, input.ring)) {
            return { status: 'unsupported' };
          }
          shiftSeen = true;
          shifts.push({ sourceId: combatSource, choiceIndex: index, rosterIndex, shift: item.shift });
          if (sourceId === 'maliades') maliadesMedium.push({ kind: 'target-shift', targetId: item.targetInstanceId, shift: item.shift });
          else pdfMedium.push({ kind: 'target-shift', fighterIndex: index, targetId: item.targetInstanceId,
            targetNumber: item.targetNumber as number, shift: item.shift });
        } else {
          attackSeen = true;
          const actionId = `${combatSource}-medium-${index}`;
          actions.push({ actionId, sourceId: combatSource, range,
            dice: { sides: 6, count: 1, successAt: sourceId === 'maliades' ? 4 : 5, damagePerSuccess: 1 }, maxTargets: 1 });
          actionTargets[actionId] = item.targetInstanceId;
          if (sourceId === 'maliades') maliadesMedium.push({ kind: 'attack', targetId: item.targetInstanceId });
          else pdfMedium.push({ kind: 'attack', fighterIndex: index, targetId: item.targetInstanceId });
        }
      }
    } else if (sourceId === 'maliades') {
      if (raw.length > 2 || new Set(raw).size !== raw.length || raw.some((id) => typeof id !== 'string' || !legal.has(id))) return { status: 'unsupported' };
      maliadesShort = raw as string[];
      maliadesShort.forEach((targetInstanceId, index) => {
        const actionId = `maliades-short-${index}`;
        actions.push({ actionId, sourceId: 'maliades', range, dice: { sides: 6, count: 1, successAt: 2, damagePerSuccess: 1 }, maxTargets: 1 });
        actionTargets[actionId] = targetInstanceId;
      });
    } else {
      if (raw.some((index, position) => !Number.isSafeInteger(index) || (index as number) < 0 ||
          (index as number) >= pdf.fighters || (position > 0 && (index as number) <= (raw[position - 1] as number)))) return { status: 'unsupported' };
      pdfShort = raw as number[];
      pdfShort.forEach((index) => actions.push({ actionId: `pdf-escort-wing-short-${index}`, sourceId: 'pdf-escort-wing', range,
        dice: { sides: 6, count: 1, successAt: 3, damagePerSuccess: 1 }, maxTargets: 1 }));
    }
  }
  if (sourceIds.length === 0) return { status: 'not-applicable' };
  return { status: 'ready', sourceIds, automaticSourceIds, actions, actionTargets, shifts,
    applyLocked: (lock) => {
      if (lock.range !== range) throw new Error('The escort locked range changed.');
      const dieFor = (actionId: string, successAt: number) => {
        const entries = lock.dice.filter((entry) => entry.actionId === actionId);
        const entry = entries[0];
        const die = entry?.rolls[0];
        if (entries.length !== 1 || !entry || entry.rolls.length !== 1 || !Number.isSafeInteger(die) || die! < 1 || die! > 6 ||
            entry.successes !== Number(die! >= successAt) || entry.damage !== Number(die! >= successAt)) {
          throw new Error('The locked escort die does not match the committed source choice.');
        }
        return die! - 1;
      };
      let pdfState: PdfEscortWingState | undefined;
      let maliadesState: MaliadesState | undefined;
      if (sourceIds.includes('pdf-escort-fighter-wing')) {
        let index = 0;
        const indexes = range === 'medium-range' ? pdfMedium.filter(({ kind }) => kind === 'attack').map(({ fighterIndex }) => fighterIndex) : pdfShort;
        const random = () => dieFor(`pdf-escort-wing-${range === 'medium-range' ? 'medium' : 'short'}-${indexes[index++]}`, range === 'medium-range' ? 5 : 3);
        pdfState = range === 'medium-range'
          ? resolvePdfEscortWingMedium(pdf, { expectedRevision: pdf.revision, actions: pdfMedium, random, targetRing: input.ring }).state
          : resolvePdfEscortWingShort(pdf, { expectedRevision: pdf.revision, fighterIndexes: pdfShort, random }).state;
      }
      if (sourceIds.includes('maliades')) {
        let index = 0;
        const random = () => dieFor(`maliades-${range === 'medium-range' ? 'medium' : 'short'}-${index++}`, range === 'medium-range' ? 4 : 2);
        const identity = { expectedRevision: maliades.revision, attackId: input.attackId, attackCycle: input.turn };
        maliadesState = range === 'medium-range'
          ? resolveMaliadesMedium(maliades, { ...identity, choices: maliadesMedium, random }).state
          : resolveMaliadesShort(maliades, { ...identity, targetIds: maliadesShort, random }).state;
      }
      return { ...(pdfState ? { pdfState } : {}), ...(maliadesState ? { maliadesState } : {}),
        losses: pdfState ? pdfState.losses - pdf.losses : 0,
        selfDamage: maliadesState ? maliadesState.damage - maliades.damage : 0 };
    } };
}
