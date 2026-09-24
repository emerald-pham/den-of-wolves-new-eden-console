import { describe, expect, it } from 'vitest';
import { advanceSmallShipMaintenance, emptySmallShipState } from './smallShip';
import { resolveGorgoneionRepairDrones } from './gorgoneionRepairDrones';

const base = {
  actorRoleId: 'gorgoneion-captain',
  actorScope: 'player' as const,
  currentCycle: 3,
  expectedRevision: 0,
  turnPhase: { turn: 3, airspace: { state: 'lifted' } },
  smallShipState: {
    ...emptySmallShipState('gorgoneion', 'aegis'),
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
  },
  hostResources: { ore: 0, fuel: 4, food: 8, water: 6, materials: 5, securityTeams: 9 },
  hostDamage: { damagedSystemIds: ['reactor', 'storage'], destroyed: false },
  systemId: 'reactor',
  state: undefined,
};

describe('Gorgoneion Repair Drones', () => {
  it('spends three host materials to repair one eligible console once in Coordination', () => {
    expect(resolveGorgoneionRepairDrones(base)).toEqual({
      hostShipId: 'aegis',
      repairedSystemId: 'reactor',
      hostResources: { ...base.hostResources, materials: 2 },
      hostDamage: { damagedSystemIds: ['storage'], destroyed: false },
      state: { cycle: 3, revision: 1, hostShipId: 'aegis', systemId: 'reactor' },
    });
  });

  it('repairs with the charge after the GM ends Team maintenance in the same cycle', () => {
    const ended = advanceSmallShipMaintenance({
      state: base.smallShipState,
      action: 'end',
      expectedRevision: 5,
      currentTurn: 3,
      hostResources: base.hostResources,
      rolls: [],
      now: '2026-09-22T08:05:00.000Z',
    });

    expect(ended.state.cycle).toMatchObject({
      step: 0, turn: 3, charges: ['repair-drones'], completedAt: '2026-09-22T08:05:00.000Z',
    });
    expect(resolveGorgoneionRepairDrones({ ...base, smallShipState: ended.state })).toMatchObject({
      hostShipId: 'aegis', repairedSystemId: 'reactor',
      hostResources: { materials: 2 },
      hostDamage: { damagedSystemIds: ['storage'], destroyed: false },
    });
  });

  it('resets on a later cycle while preserving monotonic revision', () => {
    const prior = { cycle: 2, revision: 2, hostShipId: 'dione', systemId: 'storage' };
    expect(resolveGorgoneionRepairDrones({ ...base, expectedRevision: 2, state: prior }).state)
      .toEqual({ cycle: 3, revision: 3, hostShipId: 'aegis', systemId: 'reactor' });
  });

  it.each([
    ['wrong role', { actorRoleId: 'warrior-captain' }, /Gorgoneion Captain/i],
    ['facilitator scope', { actorScope: 'facilitator' }, /Gorgoneion Captain/i],
    ['Team Phase', { turnPhase: { turn: 3, airspace: { state: 'restricted' } } }, /Coordination/i],
    ['missing phase', { turnPhase: undefined }, /phase.*unavailable/i],
    ['stale phase cycle', { turnPhase: { turn: 2, airspace: { state: 'lifted' } } }, /current cycle/i],
    ['undocked craft', { smallShipState: emptySmallShipState('gorgoneion') }, /docked host/i],
    ['wrong craft', { smallShipState: emptySmallShipState('warrior', 'aegis') }, /Gorgoneion/i],
    ['unknown host', { smallShipState: emptySmallShipState('gorgoneion', 'unknown') }, /eligible host/i],
    ['stale charged maintenance', {
      smallShipState: { ...base.smallShipState, cycle: { ...base.smallShipState.cycle, turn: 2 } },
    }, /current completed Team maintenance/i],
    ['incomplete maintenance', {
      smallShipState: { ...base.smallShipState, cycle: { ...base.smallShipState.cycle, step: 4 } },
    }, /current completed Team maintenance/i],
    ['uncharged Repair Drones', {
      smallShipState: { ...base.smallShipState, cycle: { ...base.smallShipState.cycle, charges: [] } },
    }, /must be charged/i],
    ['destroyed host', { hostDamage: { damagedSystemIds: ['reactor'], destroyed: true } }, /destroyed/i],
    ['undamaged console', { systemId: 'jump-drive' }, /damaged console/i],
    ['unknown console', { systemId: 'invented' }, /damaged console/i],
    ['passive AEGIS armour', {
      hostDamage: { damagedSystemIds: ['armoured-hull-i'], destroyed: false }, systemId: 'armoured-hull-i',
    }, /damaged console/i],
    ['insufficient materials', { hostResources: { ...base.hostResources, materials: 2 } }, /three host materials/i],
    ['stale revision', { expectedRevision: 1 }, /changed/i],
    ['same-cycle repeat', { expectedRevision: 1, state: { cycle: 3, revision: 1, hostShipId: 'aegis', systemId: 'storage' } }, /once per cycle/i],
    ['backward cycle', { expectedRevision: 1, state: { cycle: 4, revision: 1, hostShipId: 'aegis', systemId: 'storage' } }, /ahead/i],
  ] as const)('rejects %s without returning a mutation', (_label, patch, message) => {
    expect(() => resolveGorgoneionRepairDrones({ ...base, ...patch } as never)).toThrow(message);
  });

  it.each([
    ['malformed ledger', { state: { cycle: 3, revision: 1, hostShipId: 'aegis', systemId: 'reactor', extra: true } }],
    ['unreachable ledger revision', { expectedRevision: 99, state: { cycle: 1, revision: 99, hostShipId: 'aegis', systemId: 'reactor' } }],
    ['unknown ledger console', { expectedRevision: 1, state: { cycle: 1, revision: 1, hostShipId: 'aegis', systemId: 'invented-system' } }],
    ['duplicate damage', { hostDamage: { damagedSystemIds: ['reactor', 'reactor'], destroyed: false } }],
    ['unknown damage', { hostDamage: { damagedSystemIds: ['invented'], destroyed: false } }],
    ['extra damage authority', { hostDamage: { damagedSystemIds: ['reactor'], destroyed: false, extra: true } }],
    ['fractional materials', { hostResources: { ...base.hostResources, materials: 3.5 } }],
    ['malformed docking revision', { smallShipState: { ...base.smallShipState, dockingRevision: -1 } }],
    ['overcharged Gorgoneion', {
      smallShipState: {
        ...base.smallShipState,
        cycle: { ...base.smallShipState.cycle, charges: ['repair-drones', 'missile-array', 'force-field-projector'] },
      },
    }],
  ] as const)('fails closed on %s', (_label, patch) => {
    expect(() => resolveGorgoneionRepairDrones({ ...base, ...patch } as never)).toThrow(/malformed/i);
  });
});
