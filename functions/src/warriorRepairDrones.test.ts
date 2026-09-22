import { describe, expect, it } from 'vitest';
import { emptySmallShipState } from './smallShip';
import { resolveWarriorRepairDrones } from './warriorRepairDrones';

const warriorState = {
  ...emptySmallShipState('warrior', 'icebreaker'),
  dockingRevision: 2,
  cycle: {
    step: 5,
    revision: 5,
    results: { '1': 'rations', '2': 'unrest', '3': 'riot', '4': 'reactor' },
    charges: ['repair-drones'],
    turn: 3,
    rationBonus: 0,
    chargingSkipped: false,
    startedAt: '2026-09-22T08:00:00.000Z',
  },
};

const base = {
  actorUid: 'warrior-captain-uid',
  activeRoleHolderUid: 'warrior-captain-uid',
  actorRoleId: 'warrior-captain',
  actorScope: 'player' as const,
  currentCycle: 3,
  expectedRevision: 0,
  turnPhase: { turn: 3, airspace: { state: 'lifted' } },
  activeVesselIds: ['icebreaker', 'warrior'],
  smallShipState: warriorState,
  hostResources: { ore: 0, fuel: 4, food: 11, water: 9, materials: 9, securityTeams: 2 },
  hostDamage: { damagedSystemIds: ['storage', 'reactor', 'jump-drive'], destroyed: false },
  systemIds: ['storage', 'reactor'],
  state: undefined,
};

describe('Warrior Repair Drones', () => {
  it('spends six host materials to repair two eligible consoles once in Coordination', () => {
    expect(resolveWarriorRepairDrones(base)).toEqual({
      hostShipId: 'icebreaker',
      repairedSystemIds: ['storage', 'reactor'],
      hostResources: { ...base.hostResources, materials: 3 },
      hostDamage: { damagedSystemIds: ['jump-drive'], destroyed: false },
      state: {
        cycle: 3,
        revision: 1,
        hostShipId: 'icebreaker',
        systemIds: ['storage', 'reactor'],
      },
    });
  });

  it('may spend the same six materials to repair exactly one console', () => {
    const result = resolveWarriorRepairDrones({ ...base, systemIds: ['storage'] });
    expect(result.hostResources.materials).toBe(3);
    expect(result.hostDamage.damagedSystemIds).toEqual(['reactor', 'jump-drive']);
    expect(result.repairedSystemIds).toEqual(['storage']);
  });

  it('resets on a later cycle while preserving monotonic revision', () => {
    const prior = { cycle: 2, revision: 2, hostShipId: 'aegis', systemIds: ['storage'] };
    expect(resolveWarriorRepairDrones({ ...base, expectedRevision: 2, state: prior }).state)
      .toEqual({
        cycle: 3,
        revision: 3,
        hostShipId: 'icebreaker',
        systemIds: ['storage', 'reactor'],
      });
  });

  it.each([
    ['wrong role', { actorRoleId: 'gorgoneion-captain' }, /Warrior Captain/i],
    ['foreign holder', { actorUid: 'other' }, /current Warrior Captain/i],
    ['facilitator scope', { actorScope: 'facilitator' }, /Warrior Captain/i],
    ['Team Phase', { turnPhase: { turn: 3, airspace: { state: 'restricted' } } }, /Coordination/i],
    ['missing phase', { turnPhase: undefined }, /phase.*unavailable/i],
    ['stale phase cycle', { turnPhase: { turn: 2, airspace: { state: 'lifted' } } }, /current cycle/i],
    ['missing active Warrior', { activeVesselIds: ['icebreaker'] }, /active Warrior/i],
    ['inactive host', { activeVesselIds: ['aegis', 'warrior'] }, /active eligible host/i],
    ['undocked craft', { smallShipState: emptySmallShipState('warrior') }, /docked host/i],
    ['wrong craft', { smallShipState: { ...emptySmallShipState('gorgoneion', 'icebreaker'), cycle: warriorState.cycle } }, /Warrior/i],
    ['stale charged maintenance', { smallShipState: { ...warriorState, cycle: { ...warriorState.cycle, turn: 2 } } }, /current completed Team maintenance/i],
    ['incomplete maintenance', { smallShipState: { ...warriorState, cycle: { ...warriorState.cycle, step: 4 } } }, /current completed Team maintenance/i],
    ['uncharged console', { smallShipState: { ...warriorState, cycle: { ...warriorState.cycle, charges: [] } } }, /must be charged/i],
    ['destroyed host', { hostDamage: { damagedSystemIds: ['storage'], destroyed: true } }, /destroyed/i],
    ['zero consoles', { systemIds: [] }, /one or two distinct damaged/i],
    ['three consoles', { systemIds: ['storage', 'reactor', 'jump-drive'] }, /one or two distinct damaged/i],
    ['duplicate console', { systemIds: ['storage', 'storage'] }, /one or two distinct damaged/i],
    ['undamaged console', { systemIds: ['storage', 'armour'] }, /one or two distinct damaged/i],
    ['unknown console', { systemIds: ['storage', 'invented'] }, /one or two distinct damaged/i],
    ['passive AEGIS armour', {
      activeVesselIds: ['aegis', 'warrior'],
      smallShipState: { ...warriorState, hostShipId: 'aegis' },
      hostResources: { ore: 0, fuel: 4, food: 8, water: 6, materials: 9, securityTeams: 9 },
      hostDamage: { damagedSystemIds: ['armoured-hull-i'], destroyed: false },
      systemIds: ['armoured-hull-i'],
    }, /one or two distinct damaged/i],
    ['insufficient materials', { hostResources: { ...base.hostResources, materials: 5 } }, /six host materials/i],
    ['stale revision', { expectedRevision: 1 }, /changed/i],
    ['same-cycle repeat', { expectedRevision: 1, state: { cycle: 3, revision: 1, hostShipId: 'icebreaker', systemIds: ['storage'] } }, /once per cycle/i],
    ['backward cycle', { expectedRevision: 1, state: { cycle: 4, revision: 1, hostShipId: 'icebreaker', systemIds: ['storage'] } }, /ahead/i],
  ] as const)('rejects %s without returning a mutation', (_label, patch, message) => {
    expect(() => resolveWarriorRepairDrones({ ...base, ...patch } as never)).toThrow(message);
  });

  it.each([
    ['rogue active vessel', { activeVesselIds: ['icebreaker', 'warrior', 'rogue-vessel'] }],
    ['duplicate active vessel', { activeVesselIds: ['icebreaker', 'warrior', 'warrior'] }],
    ['malformed ledger', { state: { cycle: 3, revision: 1, hostShipId: 'icebreaker', systemIds: ['storage'], extra: true } }],
    ['unreachable ledger revision', { expectedRevision: 99, state: { cycle: 1, revision: 99, hostShipId: 'icebreaker', systemIds: ['storage'] } }],
    ['unknown ledger console', { expectedRevision: 1, state: { cycle: 1, revision: 1, hostShipId: 'icebreaker', systemIds: ['invented'] } }],
    ['passive armour in ledger', { expectedRevision: 1, state: { cycle: 1, revision: 1, hostShipId: 'aegis', systemIds: ['armoured-hull-i'] } }],
    ['duplicate ledger console', { expectedRevision: 1, state: { cycle: 1, revision: 1, hostShipId: 'icebreaker', systemIds: ['storage', 'storage'] } }],
    ['duplicate damage', { hostDamage: { damagedSystemIds: ['storage', 'storage'], destroyed: false } }],
    ['unknown damage', { hostDamage: { damagedSystemIds: ['invented'], destroyed: false } }],
    ['extra damage field', { hostDamage: { damagedSystemIds: ['storage'], destroyed: false, extra: true } }],
    ['fractional materials', { hostResources: { ...base.hostResources, materials: 6.5 } }],
    ['malformed docking revision', { smallShipState: { ...warriorState, dockingRevision: -1 } }],
    ['overcharged Warrior', { smallShipState: { ...warriorState, cycle: { ...warriorState.cycle, charges: ['repair-drones', 'salvage-drones'] } } }],
  ] as const)('fails closed on %s', (_label, patch) => {
    expect(() => resolveWarriorRepairDrones({ ...base, ...patch } as never)).toThrow(/malformed/i);
  });
});
