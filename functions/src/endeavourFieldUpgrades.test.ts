import { describe, expect, it } from 'vitest';
import {
  ENDEAVOUR_FUELLED_UPGRADE_LIMIT,
  ENDEAVOUR_UNFUELLED_UPGRADE_LIMIT,
  parseEndeavourFieldUpgradeState,
  resolveEndeavourFieldUpgrades,
} from './endeavourFieldUpgrades';

const target = (shipId: string, systemId: string) => ({ shipId, systemId });

const base = {
  currentCycle: 3,
  expectedRevision: 0,
  fuelled: false,
  targets: [target('shepherd', 'advanced-hydroponics'), target('quellon', 'water-production-ii')],
  materialsByShip: { shepherd: 18, quellon: 18 },
  researchProgress: {},
  state: undefined,
} as const;

describe('Endeavour field upgrades', () => {
  it('charges each target ship at the shared current cost without advancing private research', () => {
    const result = resolveEndeavourFieldUpgrades(base);

    expect(result.appliedTargets).toEqual([
      { shipId: 'shepherd', systemId: 'advanced-hydroponics', trackId: 'advanced-hydroponics', materialCost: 18, crossedBox: 0 },
      { shipId: 'quellon', systemId: 'water-production-ii', trackId: 'water-production', materialCost: 18, crossedBox: 0 },
    ]);
    expect(result.materialsByShip).toEqual({ shepherd: 0, quellon: 0 });
    expect(result).not.toHaveProperty('researchProgress');
    expect(base.researchProgress).toEqual({});
  });

  it('uses shared current research rather than target-ship research or a client cost', () => {
    const result = resolveEndeavourFieldUpgrades({
      ...base,
      targets: [target('shepherd', 'reactor'), target('aegis', 'reactor')],
      materialsByShip: { shepherd: 7, aegis: 7 },
      researchProgress: { reactor: 1 },
    });

    expect(result.appliedTargets).toEqual([
      { shipId: 'shepherd', systemId: 'reactor', trackId: 'reactor', materialCost: 7, crossedBox: 1 },
      { shipId: 'aegis', systemId: 'reactor', trackId: 'reactor', materialCost: 7, crossedBox: 1 },
    ]);
    expect(result.materialsByShip).toEqual({ shepherd: 0, aegis: 0 });
    expect(result).not.toHaveProperty('researchProgress');
  });

  it('does not partially spend a prior target when a later target is underfunded', () => {
    expect(() => resolveEndeavourFieldUpgrades({
      ...base,
      materialsByShip: { shepherd: 18, quellon: 17 },
    })).toThrow(/enough materials/);
    expect(base.materialsByShip).toEqual({ shepherd: 18, quellon: 18 });
  });

  it('allows two targets unfuelled and four targets when fuelled', () => {
    expect(ENDEAVOUR_UNFUELLED_UPGRADE_LIMIT).toBe(2);
    expect(ENDEAVOUR_FUELLED_UPGRADE_LIMIT).toBe(4);
    const fourTargets = [
      target('aegis', 'reactor'), target('dione', 'reactor'),
      target('icebreaker', 'mining-drone-control'), target('refinery-124', 'fuel-refinery'),
    ];
    const materialsByShip = { aegis: 8, dione: 8, icebreaker: 18, 'refinery-124': 14 };
    expect(resolveEndeavourFieldUpgrades({
      ...base, fuelled: true, targets: fourTargets, materialsByShip,
    }).appliedTargets).toHaveLength(4);
    expect(() => resolveEndeavourFieldUpgrades({
      ...base, targets: [...fourTargets, target('shepherd', 'advanced-hydroponics')], materialsByShip,
    })).toThrow(/at most 2/);
  });

  it('counts sequential calls toward the same cycle limit', () => {
    const first = resolveEndeavourFieldUpgrades({
      ...base,
      targets: [target('shepherd', 'advanced-hydroponics')],
      materialsByShip: { shepherd: 36 },
    });
    const second = resolveEndeavourFieldUpgrades({
      currentCycle: 3,
      expectedRevision: first.state.revision,
      fuelled: true,
      targets: [target('shepherd', 'advanced-hydroponics-ii')],
      materialsByShip: first.materialsByShip,
      researchProgress: { 'advanced-hydroponics': 0 },
      state: first.state,
    });
    expect(second.appliedTargets[0]).toMatchObject({ materialCost: 18, crossedBox: 0 });
    expect(second.state.targets).toHaveLength(2);
  });

  it('rejects duplicate targets, unknown consoles, and malformed ledgers', () => {
    expect(() => resolveEndeavourFieldUpgrades({
      ...base, targets: [target('shepherd', 'advanced-hydroponics'), target('shepherd', 'advanced-hydroponics')],
    })).toThrow(/distinct/);
    expect(() => resolveEndeavourFieldUpgrades({
      ...base, targets: [target('shepherd', 'storage')], materialsByShip: { shepherd: 1 },
    })).toThrow(/canonical/);
    expect(() => resolveEndeavourFieldUpgrades({
      ...base, researchProgress: { unknown: 1 },
    })).toThrow(/unknown.*track/i);
    expect(parseEndeavourFieldUpgradeState({
      cycle: 3, revision: 1, targets: [{ shipId: 'shepherd', systemId: 'storage', trackId: 'storage', materialCost: 1, crossedBox: 0 }],
    })).toBeNull();
    expect(parseEndeavourFieldUpgradeState({
      cycle: 3, revision: 1,
      targets: [{ shipId: 'shepherd', systemId: 'advanced-hydroponics', trackId: 'advanced-hydroponics', materialCost: 18, crossedBox: 99 }],
    })).toBeNull();
  });

  it('rejects stale and replayed revisions before any new calculation', () => {
    const first = resolveEndeavourFieldUpgrades({
      ...base,
      targets: [target('shepherd', 'advanced-hydroponics')],
      materialsByShip: { shepherd: 18 },
    });
    expect(() => resolveEndeavourFieldUpgrades({
      ...base,
      targets: [target('quellon', 'water-production-ii')],
      materialsByShip: { quellon: 18 },
      state: first.state,
    })).toThrow(/changed; refresh/);
    expect(() => resolveEndeavourFieldUpgrades({
      ...base,
      expectedRevision: first.state.revision,
      targets: [target('quellon', 'water-production-ii')],
      materialsByShip: { quellon: 18 },
      state: { ...first.state, revision: first.state.revision + 1 },
    })).toThrow(/changed; refresh/);
  });

  it('starts a new cycle with a fresh target budget while retaining a monotonic revision', () => {
    const prior = {
      cycle: 2,
      revision: 7,
      targets: [{ shipId: 'shepherd', systemId: 'advanced-hydroponics', trackId: 'advanced-hydroponics', materialCost: 18, crossedBox: 0 }],
    } as const;
    const result = resolveEndeavourFieldUpgrades({
      currentCycle: 3,
      expectedRevision: 7,
      fuelled: false,
      targets: [target('quellon', 'water-production-ii')],
      materialsByShip: { quellon: 18 },
      researchProgress: {},
      state: prior,
    });
    expect(result.state).toMatchObject({ cycle: 3, revision: 8, targets: expect.any(Array) });
    expect(result.state.targets).toHaveLength(1);
  });
});
