import { describe, expect, it } from 'vitest';
import { firstTurnWolfAttackComposition } from './wolfAttackComposition';
import {
  applyWolfFleetDamage,
  calculateWolfAttack,
  CORE_WOLF_TARGET_RING,
  EXPANDED_WOLF_TARGET_RING,
  isWolfCalculationReceipt,
  resolveWolfBoarding,
  resolveWolfRange,
  resolveWolfTargeting,
  shiftWolfTargetDie,
  wolfCombatRoster,
  type FleetCombatState,
  type WolfCombatShip,
  type WolfFleetTargetId,
  type WolfRandomInt,
} from './wolfCombatMath';
import { INITIAL_SHIP_SURVIVORS } from './shipPopulation';
import { startTurnPhase } from './turnZero';

function samples(values: readonly number[]): WolfRandomInt {
  let cursor = 0;
  return (upperBound) => {
    const value = values[cursor] ?? 0;
    cursor += 1;
    if (value < 0 || value >= upperBound) throw new Error(`sample ${value} is outside ${upperBound}`);
    return value;
  };
}

function firstTurnRoster(): ReturnType<typeof wolfCombatRoster> {
  const targeting = resolveWolfTargeting(firstTurnWolfAttackComposition(), {}, undefined, () => 0);
  return wolfCombatRoster(targeting);
}

function completeFleetState(): Record<WolfFleetTargetId, FleetCombatState> {
  return Object.fromEntries(CORE_WOLF_TARGET_RING.map(target => [target, {
    damage: { damagedSystemIds: [], destroyed: false },
    population: INITIAL_SHIP_SURVIVORS[target]!,
  }])) as Record<WolfFleetTargetId, FleetCombatState>;
}

describe('central Wolf combat math', () => {
  it('maps final targeting to the configured ring and keeps modifier order separate from staged choices', () => {
    const composition = firstTurnWolfAttackComposition();
    const random = samples([0, 5, ...Array.from({ length: 14 }, () => 0)]);
    const targeting = resolveWolfTargeting(composition, {
      commanderRerollIndexes: [0],
      targetShifts: { '1': -1 },
      commandAndControlRedirectIndex: 1,
    }, undefined, random);

    expect(targeting.modifierOrder).toEqual([
      'commander-reroll', 'target-shift', 'command-and-control-redirect',
    ]);
    expect(targeting.rolls[0]).toMatchObject({ initialDie: 1, rerollDie: 6, target: 'refinery-124' });
    expect(targeting.rolls[1]).toMatchObject({ initialDie: 1, target: 'aegis' });
    expect(targeting.rolls[2]).toMatchObject({ initialDie: 1, target: 'aegis' });
  });

  it('wraps target numbers without allowing an out-of-ring result', () => {
    expect(shiftWolfTargetDie(1, -1)).toBe(6);
    expect(shiftWolfTargetDie(6, 1)).toBe(1);
    expect(shiftWolfTargetDie(1, 7)).toBe(2);
  });

  it('uses expansion d8 result 7 for Capybara and rerolls result 8', () => {
    const composition = firstTurnWolfAttackComposition();
    const random = samples([6, 7, 0, ...Array.from({ length: 20 }, () => 0)]);
    const targeting = resolveWolfTargeting(composition, {}, EXPANDED_WOLF_TARGET_RING, random);

    expect(targeting.rolls[0]).toMatchObject({ initialDie: 7, target: 'capybara' });
    expect(targeting.rolls[1]).toMatchObject({ initialDie: 1, target: 'aegis', printedRerolls: [8] });
  });

  it('rolls range dice on the server, then requires a target for every generated hit', () => {
    const roster = firstTurnRoster();
    const wing = roster[0]!;
    const action = {
      actionId: 'missiles-medium', sourceId: 'aegis-missiles', range: 'medium-range' as const,
      dice: { sides: 6, count: 2, successAt: 5, damagePerSuccess: 1 }, maxTargets: 2,
    };
    const resolved = resolveWolfRange(
      'medium-range', [action], [{ actionId: action.actionId, targetInstanceIds: [wing.instanceId, roster[1]!.instanceId] }],
      roster, samples([4, 5, 0, 0]),
    );
    expect(resolved.receipt.dice[0]).toMatchObject({ rolls: [5, 6], successes: 2, damage: 2 });
    expect(resolved.receipt.damageByInstance).toEqual({ [wing.instanceId]: 1, [roster[1]!.instanceId]: 1 });
    expect(() => resolveWolfRange(
      'medium-range', [action], [], roster, samples([4, 5]),
    )).toThrow(/one target per generated hit/i);
  });

  it('enforces Short Range fighter-first priority and Battlestation immunity', () => {
    const roster = firstTurnRoster();
    const wing = roster[0]!;
    const transport = roster[10]!;
    const action = {
      actionId: 'pdl-short', sourceId: 'aegis-pdl', range: 'short-range' as const,
      dice: { sides: 6, count: 1, successAt: 2, damagePerSuccess: 1 }, maxTargets: 1,
    };
    expect(() => resolveWolfRange(
      'short-range', [action], [{ actionId: action.actionId, targetInstanceIds: [transport.instanceId] }],
      roster, samples([1, 1]),
    )).toThrow(/Fighter Wings first/i);

    const good = resolveWolfRange(
      'short-range', [action], [{ actionId: action.actionId, targetInstanceIds: [wing.instanceId] }],
      roster, samples([1, 1]),
    );
    expect(good.receipt.destroyedInstanceIds).toContain(wing.instanceId);

    const battlestation: WolfCombatShip = {
      instanceId: 'battlestation:0', shipId: 'wolf-battlestation', target: 'aegis',
      damageTaken: 0, destroyed: false,
    };
    expect(() => resolveWolfRange(
      'short-range', [action], [{ actionId: action.actionId, targetInstanceIds: [battlestation.instanceId] }],
      [battlestation], samples([1, 1]),
    )).toThrow(/Battlestation cannot take Short Range/i);
  });

  it('uses the catalog destruction effects and resolves boarding parties with server dice', () => {
    const roster = firstTurnRoster();
    const transport = roster[10]!;
    const action = {
      actionId: 'long-shot', sourceId: 'aegis-missiles', range: 'long-range' as const,
      fixedDamage: 2, maxTargets: 1,
    };
    const destroyed = resolveWolfRange(
      'long-range', [action], [{ actionId: action.actionId, targetInstanceIds: [transport.instanceId] }],
      roster, samples([0]),
    );
    expect(destroyed.receipt.destroyedInstanceIds).toContain(transport.instanceId);
    expect(destroyed.receipt.destructionDamageByTarget).toMatchObject({ aegis: 0 });

    const boarding = resolveWolfBoarding(roster, [{ target: 'aegis', securityTeams: 4 }], samples([0, 1, 3, 5]));
    expect(boarding[0]).toMatchObject({ boardingParties: 20, securityCasualties: 1, boarderCasualties: 2, damage: 18 });
  });

  it('rolls every selected boarding defence team and caps casualties only at remaining boarders', () => {
    const transport: WolfCombatShip = {
      instanceId: 'transport:0', shipId: 'wolf-assault-transport', target: 'aegis',
      damageTaken: 0, destroyed: false,
    };
    const boarding = resolveWolfBoarding(
      [transport],
      [{ target: 'aegis', securityTeams: 6 }],
      samples([0, 3, 3, 3, 3, 3]),
    );
    expect(boarding[0]).toMatchObject({
      boardingParties: 4,
      securityTeams: 6,
      rolls: [1, 4, 4, 4, 4, 4],
      securityCasualties: 1,
      boarderCasualties: 4,
      survivingBoardingParties: 0,
      damage: 0,
    });
  });

  it('reuses the existing damage deck and survivor-track casualty rules', () => {
    const result = applyWolfFleetDamage('aegis', 2, {
      damage: { damagedSystemIds: [], destroyed: false },
      population: INITIAL_SHIP_SURVIVORS.aegis!,
    }, () => 0);
    expect(result.draws).toHaveLength(2);
    expect(result.draws.every(draw => draw.destroyed === false)).toBe(true);
    expect(result.population).toBeLessThan(INITIAL_SHIP_SURVIVORS.aegis!);
  });

  it('returns one immutable receipt with server time, deadline, rolls, damage, and casualties', () => {
    const phase = startTurnPhase(1, 1_000);
    const receipt = calculateWolfAttack({
      requestId: 'attack-1', composition: firstTurnWolfAttackComposition(),
      phase: { ...phase, airspace: { ...phase.airspace, state: 'lifted' } }, now: 2_000,
      rangeActions: [], rangeAssignments: [], boardingDefence: [{ target: 'aegis', securityTeams: 0 }],
      fleetState: completeFleetState(),
      randomInt: () => 0,
    });
    expect(receipt).toMatchObject({
      type: 'wolf-combat-calculation', version: 1, requestId: 'attack-1',
      phase: { phase: 'coordination', serverTime: '1970-01-01T00:00:02.000Z', overrun: false },
    });
    expect(receipt.targeting.rolls).toHaveLength(15);
    expect(receipt.ranges).toEqual([]);
    expect(receipt.fleetDamage[0]).toMatchObject({ target: 'aegis', amount: 30, population: 750 });
    expect(receipt.fleetDamage[0]?.draws).toHaveLength(30);
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(Object.isFrozen(receipt.targeting.rolls)).toBe(true);
    expect(isWolfCalculationReceipt(receipt)).toBe(true);
    expect(isWolfCalculationReceipt({ ...receipt, phase: { ...receipt.phase, phase: 'bad' } })).toBe(false);
  });

  it('records a source-authorized overrun after the coordination deadline without inventing step timers', () => {
    const phase = startTurnPhase(1, 1_000);
    const receipt = calculateWolfAttack({
      requestId: 'attack-overrun', composition: firstTurnWolfAttackComposition(),
      phase: { ...phase, airspace: { ...phase.airspace, state: 'restricted' } },
      now: Date.parse(phase.openAirspaceEndsAt) + 1,
      rangeActions: [], rangeAssignments: [], boardingDefence: [{ target: 'aegis', securityTeams: 0 }],
      fleetState: completeFleetState(),
      randomInt: () => 0,
    });
    expect(receipt.phase).toMatchObject({ phase: 'team', overrun: true, deadlineAt: phase.openAirspaceEndsAt });
  });

  it('fails closed when an authoritative calculation input is omitted', () => {
    const phase = startTurnPhase(1, 1_000);
    const base = {
      requestId: 'attack-incomplete', composition: firstTurnWolfAttackComposition(), phase,
      rangeActions: [], rangeAssignments: [], boardingDefence: [{ target: 'aegis' as const, securityTeams: 0 }],
      fleetState: completeFleetState(), randomInt: () => 0,
    };
    expect(() => calculateWolfAttack({ ...base, rangeActions: undefined as never }))
      .toThrow(/rangeActions must be provided/i);
    expect(() => calculateWolfAttack({ ...base, boardingDefence: undefined as never }))
      .toThrow(/boardingDefence must be provided/i);
    const incompleteFleet = completeFleetState();
    delete incompleteFleet.aegis;
    expect(() => calculateWolfAttack({ ...base, fleetState: incompleteFleet as never }))
      .toThrow(/complete authoritative fleet combat state.*aegis/i);
  });

  it('keeps caller-owned range assignments mutable while freezing the returned receipt', () => {
    const phase = startTurnPhase(1, 1_000);
    const roster = firstTurnRoster();
    const assignmentTarget = roster[0]!.instanceId;
    const targetInstanceIds = [assignmentTarget];
    const assignment = { actionId: 'fixed-medium', targetInstanceIds };
    const receipt = calculateWolfAttack({
      requestId: 'attack-assignment-copy', composition: firstTurnWolfAttackComposition(),
      phase: { ...phase, airspace: { ...phase.airspace, state: 'lifted' } }, now: 2_000,
      rangeActions: [{ actionId: 'fixed-medium', sourceId: 'test', range: 'medium-range', fixedDamage: 1, maxTargets: 1 }],
      rangeAssignments: [assignment], boardingDefence: [{ target: 'aegis', securityTeams: 0 }],
      fleetState: completeFleetState(), randomInt: () => 0,
    });
    expect(Object.isFrozen(assignment)).toBe(false);
    expect(Object.isFrozen(targetInstanceIds)).toBe(false);
    expect(Object.isFrozen(receipt.ranges[0]?.assignments[0])).toBe(true);
    expect(Object.isFrozen(receipt.ranges[0]?.assignments[0]?.targetInstanceIds)).toBe(true);
    targetInstanceIds.push('caller-can-still-edit');
    expect(assignment.targetInstanceIds).toHaveLength(2);
  });
});
