import { describe, expect, it, vi } from 'vitest';
import { EXPANDED_WOLF_TARGET_RING } from './wolfCombatMath';
import {
  authorizePdfEscortWingMission,
  beginPdfEscortWingAttack,
  initialPdfEscortWingState,
  launchPdfEscortWing,
  parsePdfEscortWingState,
  resolvePdfEscortWingMedium,
  resolvePdfEscortWingShort,
  shiftPdfEscortTargetNumber,
} from './pdfEscortWingState';

function dice(...values: number[]): (upperBound: number) => number {
  let index = 0;
  return (upperBound) => {
    const value = values[index++];
    if (value === undefined) throw new Error('The test ran out of dice.');
    if (value < 1 || value > upperBound) throw new Error(`Unexpected die ${value}.`);
    return value - 1;
  };
}

function launched() {
  return launchPdfEscortWing(beginPdfEscortWingAttack(initialPdfEscortWingState(), {
    expectedRevision: 0, attackId: 'wolf-attack-1', attackCycle: 1,
  }), {
    expectedRevision: 0,
    launchAllowed: true,
    bayCharged: true,
    bayDamaged: false,
  });
}

describe('authoritative PDF Escort Wing state', () => {
  it('persists an explicit whole-wing Medium pass without entropy or fighter losses', () => {
    const random = vi.fn(() => { throw new Error('A pass cannot draw dice.'); });
    const state = launched();
    const resolved = resolvePdfEscortWingMedium(state, { expectedRevision: state.revision, actions: [], random });
    expect(resolved).toMatchObject({ state: { mediumResolved: true, fighters: 4, losses: 0 }, attacks: [], targetShifts: [] });
    expect(parsePdfEscortWingState(resolved.state)).toEqual(resolved.state);
    expect(random).not.toHaveBeenCalled();
    expect(() => resolvePdfEscortWingMedium(resolved.state, { expectedRevision: resolved.state.revision, actions: [], random }))
      .toThrow(/already resolved/i);
  });
  it('starts as an immutable four-fighter wing with independent fuel-free mission metadata', () => {
    const state = initialPdfEscortWingState();
    expect(state).toMatchObject({
      type: 'pdf-escort-fighter-wing-state',
      revision: 0,
      wingId: 'pdf-escort-fighter-wing',
      capacity: 4,
      fighters: 4,
      launched: false,
      losses: 0,
      mission: { eligible: true, requiresFuel: false, bonuses: { searchAndRescue: 2, salvage: 1 } },
    });
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.mission)).toBe(true);
  });

  it('enforces the launch requirement and rejects stale or replayed launch transitions', () => {
    const initial = beginPdfEscortWingAttack(initialPdfEscortWingState(), {
      expectedRevision: 0, attackId: 'wolf-attack-1', attackCycle: 1,
    });
    expect(() => launchPdfEscortWing(initial, {
      expectedRevision: 0, launchAllowed: false, bayCharged: true, bayDamaged: false,
    })).toThrow(/launch check/i);
    expect(() => launchPdfEscortWing(initial, {
      expectedRevision: 0, launchAllowed: true, bayCharged: false, bayDamaged: false,
    })).toThrow(/Charge/i);
    expect(() => launchPdfEscortWing(initial, {
      expectedRevision: 0, launchAllowed: true, bayCharged: true, bayDamaged: true,
    })).toThrow(/damaged/i);
    const state = launched();
    expect(() => launchPdfEscortWing(state, {
      expectedRevision: 0, launchAllowed: true, bayCharged: true, bayDamaged: false,
    })).toThrow(/changed/i);
    expect(() => launchPdfEscortWing(state, {
      expectedRevision: 1, launchAllowed: true, bayCharged: true, bayDamaged: false,
    })).toThrow(/already launched/i);
  });

  it('resets per-attack launch actions while preserving surviving fighters and cumulative losses', () => {
    const initial = beginPdfEscortWingAttack(initialPdfEscortWingState(), {
      expectedRevision: 0, attackId: 'wolf-attack-1', attackCycle: 1,
    });
    const firstAttack = resolvePdfEscortWingShort(launchPdfEscortWing(initial, {
      expectedRevision: 0, launchAllowed: true, bayCharged: true, bayDamaged: false,
    }), {
      expectedRevision: 1, fighterIndexes: [0, 1, 2, 3], random: dice(1, 2, 3, 4),
    }).state;
    const nextAttack = beginPdfEscortWingAttack(firstAttack, {
      expectedRevision: firstAttack.revision, attackId: 'wolf-attack-2', attackCycle: 2,
    });

    expect(nextAttack).toMatchObject({
      attackId: 'wolf-attack-2', attackCycle: 2, revision: firstAttack.revision + 1,
      fighters: 2, losses: 2, launched: false,
      mediumResolved: false, mediumActionFighterIndexes: [],
      shortResolved: false, shortRollFighterIndexes: [],
    });
    expect(() => beginPdfEscortWingAttack(nextAttack, {
      expectedRevision: nextAttack.revision, attackId: 'wolf-attack-3', attackCycle: 2,
    })).toThrow(/cycle must advance/i);
  });

  it('resets a PDF attack for the exact same-cycle P Station repeat and preserves fighter losses', () => {
    const first = beginPdfEscortWingAttack(initialPdfEscortWingState(), {
      expectedRevision: 0, attackId: 'wolf-attack-parent', attackCycle: 1,
    });
    const damaged = resolvePdfEscortWingShort(launchPdfEscortWing(first, {
      expectedRevision: 0, launchAllowed: true, bayCharged: true, bayDamaged: false,
    }), {
      expectedRevision: 1, fighterIndexes: [0, 1, 2, 3], random: dice(1, 2, 5, 6),
    }).state;
    const context = {
      type: 'p-station-repeat', sequenceId: 'wolf-p-station-navigation-parent', groupId: 'fleet-1',
      chart: 'B', coordinate: '1964', stationId: 'P', sourceTransitionId: 'navigation-parent',
      sourceCycle: 1, parentAttackId: 'wolf-attack-parent', parentAttackNumber: 1,
      parentTurn: 1, nextAttackNumber: 2,
    } as const;

    const repeated = beginPdfEscortWingAttack(damaged, {
      expectedRevision: damaged.revision, attackId: 'wolf-attack-repeat', attackCycle: 1,
      pStationRepeatContext: context,
    } as never);

    expect(repeated).toMatchObject({
      attackId: 'wolf-attack-repeat', attackCycle: 1, revision: damaged.revision + 1,
      fighters: 2, losses: 2, launched: false,
      mediumResolved: false, mediumActionFighterIndexes: [],
      shortResolved: false, shortRollFighterIndexes: [],
    });
  });

  it.each([
    ['missing P context', undefined],
    ['wrong parent attack', {
      type: 'p-station-repeat', sequenceId: 'wolf-p-station-navigation-parent', groupId: 'fleet-1',
      chart: 'B', coordinate: '1964', stationId: 'P', sourceTransitionId: 'navigation-parent',
      sourceCycle: 1, parentAttackId: 'wolf-attack-somewhere-else', parentAttackNumber: 1,
      parentTurn: 1, nextAttackNumber: 2,
    }],
    ['wrong source sequence', {
      type: 'p-station-repeat', sequenceId: 'wolf-p-station-navigation-other', groupId: 'fleet-1',
      chart: 'B', coordinate: '1964', stationId: 'P', sourceTransitionId: 'navigation-parent',
      sourceCycle: 1, parentAttackId: 'wolf-attack-parent', parentAttackNumber: 1,
      parentTurn: 1, nextAttackNumber: 2,
    }],
    ['wrong next attack number', {
      type: 'p-station-repeat', sequenceId: 'wolf-p-station-navigation-parent', groupId: 'fleet-1',
      chart: 'B', coordinate: '1964', stationId: 'P', sourceTransitionId: 'navigation-parent',
      sourceCycle: 1, parentAttackId: 'wolf-attack-parent', parentAttackNumber: 1,
      parentTurn: 1, nextAttackNumber: 3,
    }],
  ])('rejects same-cycle PDF reinitialization with %s', (_label, pStationRepeatContext) => {
    const prior = beginPdfEscortWingAttack(initialPdfEscortWingState(), {
      expectedRevision: 0, attackId: 'wolf-attack-parent', attackCycle: 1,
    });
    expect(() => beginPdfEscortWingAttack(prior, {
      expectedRevision: prior.revision, attackId: 'wolf-attack-repeat', attackCycle: 1,
      ...(pStationRepeatContext === undefined ? {} : { pStationRepeatContext }),
    } as never)).toThrow(/cycle must advance|P Station repeat context/i);
  });

  it('resolves independent Medium target shifts and attacks at the printed threshold', () => {
    const result = resolvePdfEscortWingMedium(launched(), {
      expectedRevision: 1,
      actions: [
        { fighterIndex: 0, kind: 'target-shift', targetId: 'wolf-1', targetNumber: 1, shift: -1 },
        { fighterIndex: 1, kind: 'attack', targetId: 'wolf-2' },
        { fighterIndex: 2, kind: 'attack', targetId: 'wolf-3' },
      ],
      random: dice(5, 4),
    });
    expect(result.targetShifts).toEqual([{
      fighterIndex: 0, targetId: 'wolf-1', targetNumber: 1, shift: -1, shiftedTargetNumber: 0,
    }]);
    expect(result.attacks).toEqual([
      { fighterIndex: 1, targetId: 'wolf-2', die: 5, hit: true },
      { fighterIndex: 2, targetId: 'wolf-3', die: 4, hit: false },
    ]);
    expect(result.state).toMatchObject({ revision: 2, launched: true, fighters: 4, losses: 0, mediumResolved: true });
    expect(() => resolvePdfEscortWingMedium(result.state, {
      expectedRevision: 2, actions: [{ fighterIndex: 0, kind: 'attack', targetId: 'wolf-4' }], random: dice(5),
    })).toThrow(/already resolved/i);
  });

  it('enforces the four-fighter cap and one-action-per-fighter boundaries', () => {
    expect(() => resolvePdfEscortWingMedium(launched(), {
      expectedRevision: 1,
      actions: [
        { fighterIndex: 0, kind: 'attack', targetId: 'a' },
        { fighterIndex: 0, kind: 'attack', targetId: 'b' },
      ],
      random: dice(5, 5),
    })).toThrow(/only one/i);
    expect(() => resolvePdfEscortWingMedium(launched(), {
      expectedRevision: 1,
      actions: Array.from({ length: 5 }, (_, fighterIndex) => ({
        fighterIndex, kind: 'attack' as const, targetId: `wolf-${fighterIndex}`,
      })),
      random: dice(5, 5, 5, 5, 5),
    })).toThrow(/exceeds/i);
    expect(shiftPdfEscortTargetNumber(6, 1)).toBe(7);
    expect(shiftPdfEscortTargetNumber(1, -1)).toBe(0);
    expect(shiftPdfEscortTargetNumber(0, -1)).toBe(5);
    expect(shiftPdfEscortTargetNumber(7, 1)).toBe(2);
    expect(() => shiftPdfEscortTargetNumber(-1, -1)).toThrow(/0 through 7/i);
    expect(() => shiftPdfEscortTargetNumber(8, 1)).toThrow(/0 through 7/i);
  });

  it('resolves Short attacks at 3+ and records one loss for each 1 or 2', () => {
    const result = resolvePdfEscortWingShort(launched(), {
      expectedRevision: 1,
      fighterIndexes: [0, 1, 2, 3],
      random: dice(1, 2, 3, 6),
    });
    expect(result.rolls).toEqual([
      { fighterIndex: 0, die: 1, hit: false, destroyed: true },
      { fighterIndex: 1, die: 2, hit: false, destroyed: true },
      { fighterIndex: 2, die: 3, hit: true, destroyed: false },
      { fighterIndex: 3, die: 6, hit: true, destroyed: false },
    ]);
    expect(result).toMatchObject({ losses: 2, state: { revision: 2, fighters: 2, losses: 2, shortResolved: true } });
    expect(() => resolvePdfEscortWingShort(result.state, {
      expectedRevision: 2, fighterIndexes: [0], random: dice(3),
    })).toThrow(/already resolved/i);
  });

  it('allows an explicit Short Range pass without rolling or losing a fighter', () => {
    const random = vi.fn(dice());
    const result = resolvePdfEscortWingShort(launched(), {
      expectedRevision: 1, fighterIndexes: [], random,
    });

    expect(result).toMatchObject({ losses: 0, rolls: [], state: {
      revision: 2, fighters: 4, losses: 0, shortResolved: true, shortRollFighterIndexes: [],
    } });
    expect(random).not.toHaveBeenCalled();
    expect(parsePdfEscortWingState(result.state)).toEqual(result.state);
  });

  it('uses the full configured target ring when the expansion target is active', () => {
    expect(shiftPdfEscortTargetNumber(1, -1, EXPANDED_WOLF_TARGET_RING)).toBe(7);
    expect(shiftPdfEscortTargetNumber(7, 1, EXPANDED_WOLF_TARGET_RING)).toBe(1);
    expect(resolvePdfEscortWingMedium(launched(), {
      expectedRevision: 1,
      targetRing: EXPANDED_WOLF_TARGET_RING,
      actions: [{ fighterIndex: 0, kind: 'target-shift', targetId: 'wolf-1', targetNumber: 1, shift: -1 }],
      random: dice(),
    }).targetShifts).toEqual([{
      fighterIndex: 0, targetId: 'wolf-1', targetNumber: 1, shift: -1, shiftedTargetNumber: 7,
    }]);
  });

  it('keeps mission participation fuel-free and independent of launch or combat state', () => {
    const initial = initialPdfEscortWingState();
    expect(authorizePdfEscortWingMission(initial, { missionAllowed: true, fuelRequired: false })).toEqual({
      type: 'pdf-escort-fighter-wing-mission-authorization',
      wingId: 'pdf-escort-fighter-wing',
      requiresFuel: false,
      bonuses: { searchAndRescue: 2, salvage: 1 },
    });
    expect(() => authorizePdfEscortWingMission(initial, { missionAllowed: true, fuelRequired: true })).toThrow(/fuel-free/i);
    expect(() => authorizePdfEscortWingMission(initial, { missionAllowed: false, fuelRequired: false })).toThrow(/mission check/i);
    const launchedState = launched();
    expect(authorizePdfEscortWingMission(launchedState, { missionAllowed: true, fuelRequired: false }).requiresFuel).toBe(false);
    expect(launchedState.mission).toEqual(initial.mission);
  });

  it('round-trips canonical state and fails closed on malformed or replay-shaped state', () => {
    const state = resolvePdfEscortWingShort(launched(), {
      expectedRevision: 1, fighterIndexes: [0, 1, 2, 3], random: dice(1, 3, 1, 3),
    }).state;
    expect(parsePdfEscortWingState(state)).toEqual(state);
    expect(Object.isFrozen(parsePdfEscortWingState(state))).toBe(true);
    expect(parsePdfEscortWingState({ ...state, fighters: 4 })).toBeNull();
    expect(parsePdfEscortWingState({ ...state, losses: 0 })).toBeNull();
    expect(parsePdfEscortWingState({ ...state, capacity: 6 })).toBeNull();
    expect(parsePdfEscortWingState({ ...state, mediumResolved: true })).toBeNull();
    expect(parsePdfEscortWingState({ ...initialPdfEscortWingState(), launched: true })).toBeNull();
    expect(parsePdfEscortWingState({ ...state, unexpected: true })).toBeNull();
  });
});
