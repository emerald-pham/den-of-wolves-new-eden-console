import { expect, it } from 'vitest';
import { collectWolfEscortRange } from './wolfEscortRange';
import { beginPdfEscortWingAttack, initialPdfEscortWingState, launchPdfEscortWing } from './pdfEscortWingState';
import { initialMaliadesState, launchMaliades } from './maliadesState';
import { CORE_WOLF_TARGET_RING, lockWolfRangeActions, resolveWolfTargeting, wolfCombatRoster, wolfRangeFixedTargetInstanceIds } from './wolfCombatMath';
import { firstTurnWolfAttackComposition } from './wolfAttackComposition';

const attackId = 'escort-attack-1';
const roster = wolfCombatRoster(resolveWolfTargeting(firstTurnWolfAttackComposition(), {}, undefined, () => 0));
const pdf = launchPdfEscortWing(beginPdfEscortWingAttack(initialPdfEscortWingState(), {
  expectedRevision: 0, attackId, attackCycle: 1,
}), { expectedRevision: 0, launchAllowed: true, bayCharged: true, bayDamaged: false });
const maliades = launchMaliades(initialMaliadesState(), { expectedRevision: 0, attackId, attackCycle: 1, launchAllowed: true });
const context = { attackId, turn: 1, range: 'medium-range' as const, roster, ring: CORE_WOLF_TARGET_RING,
  pdf, maliades, owners: { 'pdf-escort-fighter-wing': true, maliades: true } };
const marker = (sourceId: string, extra: object, range = 'medium-range') => ({
  type: 'wolf-escort-range-action-choice', status: 'committed', sourceId, range,
  attackId, turn: 1, revision: 5, actorUid: sourceId === 'maliades' ? 'engineer' : 'colonel',
  actorRoleId: sourceId === 'maliades' ? 'dione-engineer' : 'refinery-124-pdf-colonel', requestId: `escort-${sourceId}-1`, ...extra,
});

it('admits pre-roll Short targets only from live Wings, then admits other live nonimmune contacts when no Wing remains', () => {
  expect(wolfRangeFixedTargetInstanceIds('short-range', roster)).toEqual(roster.slice(0, 10).map(({ instanceId }) => instanceId));
  expect(wolfRangeFixedTargetInstanceIds('medium-range', roster)).toEqual(roster.map(({ instanceId }) => instanceId));
  const afterWings = roster.map((ship) => ship.shipId === 'wolf-fighter-wing' ? { ...ship, destroyed: true } : ship);
  expect(wolfRangeFixedTargetInstanceIds('short-range', afterWings)).toEqual(roster.slice(10).map(({ instanceId }) => instanceId));
});

it('waits for both assigned escort owners even while their consoles are disconnected', () => {
  expect(collectWolfEscortRange({ ...context, choices: undefined })).toEqual({ status: 'waiting' });
  expect(collectWolfEscortRange({ ...context, choices: { 'medium-range': {
    maliades: marker('maliades', { actions: [] }),
  } } })).toEqual({ status: 'waiting' });
});

it('combines distinct Medium sources and applies precisely the locked dice to Maliades durability', () => {
  const choices = { 'medium-range': {
    'pdf-escort-fighter-wing': marker('pdf-escort-fighter-wing', { actions: [
      { fighterIndex: 0, kind: 'attack', targetInstanceId: roster[0]!.instanceId },
      { fighterIndex: 1, kind: 'target-shift', targetInstanceId: roster[1]!.instanceId, targetNumber: 1, shift: -1 },
    ] }),
    maliades: marker('maliades', { actions: [{ kind: 'attack', targetInstanceId: roster[2]!.instanceId }] }),
  } };
  const bundle = collectWolfEscortRange({ ...context, choices });
  expect(bundle.status).toBe('ready');
  expect(bundle.shifts).toEqual([{ sourceId: 'pdf-escort-wing', choiceIndex: 1, rosterIndex: 1, shift: -1 }]);
  expect(bundle.actions?.map(({ sourceId, dice }) => [sourceId, dice?.successAt])).toEqual([
    ['pdf-escort-wing', 5], ['maliades', 4],
  ]);
  let index = 0;
  const lock = lockWolfRangeActions('medium-range', bundle.actions!, () => [4, 0][index++]!);
  const applied = bundle.applyLocked!(lock);
  expect(applied.pdfState).toMatchObject({ mediumResolved: true, fighters: 4, losses: 0 });
  expect(applied.maliadesState).toMatchObject({ damage: 1, destroyed: false, medium: { attack: { die: 1, hit: false } } });
  expect(applied.selfDamage).toBe(1);
  expect(bundle.applyLocked!(lock)).toEqual(applied);
});

it('uses the same Short rolls for PDF hit/loss and Maliades hit/self-damage, including destruction at three', () => {
  const choices = { 'short-range': {
    'pdf-escort-fighter-wing': marker('pdf-escort-fighter-wing', { fighterIndexes: [0, 2] }, 'short-range'),
    maliades: marker('maliades', { targetInstanceIds: [roster[1]!.instanceId, roster[2]!.instanceId] }, 'short-range'),
  } };
  const bundle = collectWolfEscortRange({ ...context, range: 'short-range', maliades: { ...maliades, revision: 2, damage: 2 }, choices });
  expect(bundle.status).toBe('ready');
  let index = 0;
  const lock = lockWolfRangeActions('short-range', bundle.actions!, () => [0, 2, 0, 5][index++]!);
  expect(bundle.applyLocked!(lock)).toMatchObject({
    pdfState: { fighters: 3, losses: 1, shortResolved: true, shortRollFighterIndexes: [0, 2] },
    maliadesState: { damage: 3, destroyed: true, short: { selfDamage: 1 } }, losses: 1, selfDamage: 1,
  });
});

it('audits unavailable owners as zero-action passes and never invents a die', () => {
  const bundle = collectWolfEscortRange({ ...context, choices: undefined,
    owners: { 'pdf-escort-fighter-wing': false, maliades: false } });
  expect(bundle.status).toBe('ready');
  expect(bundle.automaticSourceIds).toEqual(['pdf-escort-fighter-wing', 'maliades']);
  expect(bundle.actions).toEqual([]);
  const lock = lockWolfRangeActions('medium-range', [], () => { throw new Error('No pass dice.'); });
  expect(bundle.applyLocked!(lock)).toMatchObject({ pdfState: { mediumResolved: true },
    maliadesState: { medium: { attack: null, targetShift: null }, damage: 0 }, losses: 0, selfDamage: 0 });
});

it('rejects malformed private choices, invalid targets, duplicated fighters and locked entropy drift', () => {
  const passes = { maliades: marker('maliades', { actions: [] }),
    'pdf-escort-fighter-wing': marker('pdf-escort-fighter-wing', { actions: [] }) };
  expect(collectWolfEscortRange({ ...context, choices: { 'medium-range': { ...passes,
    maliades: { ...passes.maliades, attackId: 'other-attack' } } } }).status).toBe('unsupported');
  expect(collectWolfEscortRange({ ...context, choices: { 'medium-range': { ...passes,
    maliades: marker('maliades', { actions: [{ kind: 'attack', targetInstanceId: 'missing' }] }) } } }).status).toBe('unsupported');
  const bundle = collectWolfEscortRange({ ...context, choices: { 'medium-range': { ...passes,
    maliades: marker('maliades', { actions: [{ kind: 'attack', targetInstanceId: roster[0]!.instanceId }] }) } } });
  const lock = lockWolfRangeActions('medium-range', bundle.actions!, () => 0);
  expect(() => bundle.applyLocked!({ ...lock, dice: [] })).toThrow(/locked/i);
});

it.each(['pdf-escort-fighter-wing', 'maliades'] as const)(
  'rejects a %s shift marker whose stored number contradicts its current target', (sourceId) => {
    const sourcePasses = { maliades: marker('maliades', { actions: [] }),
      'pdf-escort-fighter-wing': marker('pdf-escort-fighter-wing', { actions: [] }) };
    const action = { ...(sourceId === 'maliades' ? {} : { fighterIndex: 0 }),
      kind: 'target-shift', targetInstanceId: roster[0]!.instanceId, targetNumber: 1, shift: 1 };
    const choices = (targetNumber: number) => ({ 'medium-range': { ...sourcePasses,
      [sourceId]: marker(sourceId, { actions: [{ ...action, targetNumber }] }) } });
    expect(collectWolfEscortRange({ ...context, choices: choices(1) }).status).toBe('ready');
    expect(collectWolfEscortRange({ ...context, choices: choices(2) }).status).toBe('unsupported');
  },
);
