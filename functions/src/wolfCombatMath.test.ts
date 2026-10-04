import { describe, expect, it } from 'vitest';
import { firstTurnWolfAttackComposition } from './wolfAttackComposition';
import {
  applyWolfFleetDamage,
  calculateWolfAttack,
  finalizeWolfAttack,
  CORE_WOLF_TARGET_RING,
  EXPANDED_WOLF_TARGET_RING,
  isWolfCalculationReceipt,
  lockWolfBoardingDefenceRolls,
  resolveWolfBoarding,
  resolveWolfRange,
  resolveWolfRangeTargetShifts,
  resolveLockedWolfRange,
  replayWolfRangeTargetSnapshot,
  resolveWolfTargeting,
  applyWolfRangeTargetShift,
  shiftWolfTargetDie,
  wolfTargetForRangeTargetNumber,
  wolfTargetNumberForRangeSource,
  wolfCombatRoster,
  type FleetCombatState,
  type WolfCombatShip,
  type WolfBoardingDefence,
  type WolfFleetTargetId,
  type WolfRandomInt,
  type WolfTargetingReceipt,
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
  it('replays independent range shifts in canonical order without mutating targeting or allowing client-provided die faces', () => {
    const targeting = resolveWolfTargeting(
      firstTurnWolfAttackComposition(), { commandAndControlRedirectIndex: 0 }, CORE_WOLF_TARGET_RING, () => 0,
    );
    const roster = wolfCombatRoster(targeting);
    const currentDice = targeting.rolls.map((roll) => roll.modifiers.includes('command-and-control-redirect')
      ? wolfTargetNumberForRangeSource('aegis-alpha-wing', roll.target, targeting.ring)
      : roll.finalDie);
    const result = resolveWolfRangeTargetShifts({
      roster, currentDice, ring: targeting.ring,
      choices: [
        { sourceId: 'aegis-bravo-wing', choiceIndex: 0, rosterIndex: 0, shift: 1 },
        { sourceId: 'aegis-alpha-wing', choiceIndex: 0, rosterIndex: 0, shift: 1 },
      ],
    });

    expect(result.targetShifts).toEqual([
      { sourceId: 'aegis-alpha-wing', choiceIndex: 0, rosterIndex: 0, shift: 1, fromDie: 1, toDie: 2 },
      { sourceId: 'aegis-bravo-wing', choiceIndex: 0, rosterIndex: 0, shift: 1, fromDie: 2, toDie: 3 },
    ]);
    expect(result.currentDice[0]).toBe(3);
    expect(result.roster[0]?.target).toBe('icebreaker');
    expect(replayWolfRangeTargetSnapshot(
      roster.map(({ instanceId, target }) => ({ instanceId, target })), result.targetShifts, targeting.ring,
    )[0]?.target).toBe('icebreaker');
    expect(roster[0]?.target).toBe('aegis');
    expect(targeting.rolls[0]?.target).toBe('aegis');
  });

  it('shares six-target endpoint wraparound across fighters and normalizes endpoints for later shifts', () => {
    expect(applyWolfRangeTargetShift('pdf-escort-wing', 1, -1, CORE_WOLF_TARGET_RING)).toBe(0);
    expect(wolfTargetForRangeTargetNumber('pdf-escort-wing', 0, CORE_WOLF_TARGET_RING)).toBe('refinery-124');
    expect(applyWolfRangeTargetShift('aegis-alpha-wing', 6, 1, CORE_WOLF_TARGET_RING)).toBe(7);
    expect(wolfTargetForRangeTargetNumber('maliades', 7, CORE_WOLF_TARGET_RING)).toBe('aegis');
    expect(wolfTargetNumberForRangeSource('pdf-escort-wing', 'aegis', CORE_WOLF_TARGET_RING)).toBe(1);

    const targeting = resolveWolfTargeting(firstTurnWolfAttackComposition(), {}, CORE_WOLF_TARGET_RING, () => 0);
    const result = resolveWolfRangeTargetShifts({
      roster: wolfCombatRoster(targeting), currentDice: targeting.rolls.map(({ finalDie }) => finalDie),
      ring: CORE_WOLF_TARGET_RING,
      choices: [
        { sourceId: 'aegis-bravo-wing', choiceIndex: 0, rosterIndex: 0, shift: 1 },
        { sourceId: 'aegis-alpha-wing', choiceIndex: 0, rosterIndex: 0, shift: -1 },
      ],
    });
    expect(result.targetShifts).toEqual([
      { sourceId: 'aegis-alpha-wing', choiceIndex: 0, rosterIndex: 0, shift: -1, fromDie: 1, toDie: 0 },
      { sourceId: 'aegis-bravo-wing', choiceIndex: 0, rosterIndex: 0, shift: 1, fromDie: 0, toDie: 7 },
    ]);
    expect(result.roster[0]?.target).toBe('aegis');
  });

  it('uses all seven configured targets for wraparound when Capybara is in the Wolf target ring', () => {
    expect(applyWolfRangeTargetShift('aegis-alpha-wing', 1, -1, EXPANDED_WOLF_TARGET_RING)).toBe(7);
    expect(wolfTargetForRangeTargetNumber('aegis-bravo-wing', 7, EXPANDED_WOLF_TARGET_RING)).toBe('capybara');
    expect(applyWolfRangeTargetShift('pdf-escort-wing', 7, 1, EXPANDED_WOLF_TARGET_RING)).toBe(1);
  });

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

  it('caps excess range hits at distinct live contacts and records the unused hits', () => {
    const onlyContact: WolfCombatShip = {
      instanceId: 'transport:only-contact', shipId: 'wolf-assault-transport', target: 'aegis',
      damageTaken: 0, destroyed: false,
    };
    const action = {
      actionId: 'missiles-medium-overflow', sourceId: 'aegis-missiles', range: 'medium-range' as const,
      dice: { sides: 6, count: 2, successAt: 5, damagePerSuccess: 1 }, maxTargets: 2,
    };
    const resolved = resolveWolfRange(
      'medium-range', [action],
      [{ actionId: action.actionId, targetInstanceIds: [onlyContact.instanceId] }],
      [onlyContact], samples([4, 5]),
    );

    expect(resolved.receipt.dice[0]).toMatchObject({ rolls: [5, 6], successes: 2, damage: 2 });
    expect(resolved.receipt.assignments).toEqual([
      { actionId: action.actionId, targetInstanceIds: [onlyContact.instanceId] },
    ]);
    expect(resolved.receipt.damageByInstance).toEqual({ [onlyContact.instanceId]: 1 });
    expect(resolved.receipt.unusedHitsByAction).toEqual([{ actionId: action.actionId, count: 1 }]);
  });

  it('records successful hits as unused when no live legal contact remains', () => {
    const onlyBattlestation: WolfCombatShip = {
      instanceId: 'battlestation:no-short-target', shipId: 'wolf-battlestation', target: 'aegis',
      damageTaken: 0, destroyed: false,
    };
    const action = {
      actionId: 'pdl-short-no-contact', sourceId: 'aegis-pdl', range: 'short-range' as const,
      dice: { sides: 6, count: 1, successAt: 2, damagePerSuccess: 1 }, maxTargets: 1,
    };
    const resolved = resolveWolfRange(
      'short-range', [action], [{ actionId: action.actionId, targetInstanceIds: [] }],
      [onlyBattlestation], samples([1]),
    );

    expect(resolved.receipt.dice[0]).toMatchObject({ rolls: [2], successes: 1, damage: 1 });
    expect(resolved.receipt.assignments).toEqual([{ actionId: action.actionId, targetInstanceIds: [] }]);
    expect(resolved.receipt.damageByInstance).toEqual({});
    expect(resolved.receipt.unusedHitsByAction).toEqual([{ actionId: action.actionId, count: 1 }]);
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

  it('assigns a second Short Range hit to a Transport once the only live Wing is lethally covered', () => {
    const wing: WolfCombatShip = {
      instanceId: 'short-wing:0', shipId: 'wolf-fighter-wing', target: 'aegis', damageTaken: 0, destroyed: false,
    };
    const transport: WolfCombatShip = {
      instanceId: 'short-transport:0', shipId: 'wolf-assault-transport', target: 'aegis', damageTaken: 0, destroyed: false,
    };
    const battlestation: WolfCombatShip = {
      instanceId: 'short-station:0', shipId: 'wolf-battlestation', target: 'aegis', damageTaken: 0, destroyed: false,
    };
    const action = {
      actionId: 'short-two-hits', sourceId: 'gorgoneion-missile-array', range: 'short-range' as const,
      dice: { sides: 6, count: 2, successAt: 2, damagePerSuccess: 1 }, maxTargets: 2,
    };
    const result = resolveWolfRange(
      'short-range', [action], [{ actionId: action.actionId, targetInstanceIds: [wing.instanceId, transport.instanceId] }],
      [wing, transport, battlestation], samples([1, 1]),
    );

    expect(result.receipt.assignments).toEqual([
      { actionId: action.actionId, targetInstanceIds: [wing.instanceId, transport.instanceId] },
    ]);
    expect(result.receipt.damageByInstance).toEqual({ [wing.instanceId]: 1, [transport.instanceId]: 1 });
    expect(result.receipt.destroyedInstanceIds).toContain(wing.instanceId);
    expect(result.receipt.destroyedInstanceIds).not.toContain(transport.instanceId);
    expect(result.receipt.unusedHitsByAction).toEqual([]);
    expect(result.receipt.damageByInstance).not.toHaveProperty(battlestation.instanceId);
  });

  it('keeps all assigned Short hits on Wings until every live Wing is lethally covered', () => {
    const wings: WolfCombatShip[] = ['alpha', 'bravo'].map((id) => ({
      instanceId: `short-wing:${id}`, shipId: 'wolf-fighter-wing', target: 'aegis', damageTaken: 0, destroyed: false,
    }));
    const transport: WolfCombatShip = {
      instanceId: 'short-transport:uncovered', shipId: 'wolf-assault-transport', target: 'aegis', damageTaken: 0, destroyed: false,
    };
    const action = {
      actionId: 'short-insufficient-wing-coverage', sourceId: 'gorgoneion-missile-array', range: 'short-range' as const,
      dice: { sides: 6, count: 2, successAt: 2, damagePerSuccess: 1 }, maxTargets: 2,
    };
    expect(() => resolveWolfRange(
      'short-range', [action], [{ actionId: action.actionId, targetInstanceIds: [wings[0]!.instanceId, transport.instanceId] }],
      [...wings, transport], samples([1, 1]),
    )).toThrow(/Fighter Wings first/i);
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

  it('applies Medium target shifts before that range destruction consequences while preserving Long targets', () => {
    const roster: WolfCombatShip[] = [
      { instanceId: '0:wolf-fighter-wing', shipId: 'wolf-fighter-wing', target: 'aegis', damageTaken: 0, destroyed: false },
      { instanceId: '1:wolf-cruiser', shipId: 'wolf-cruiser', target: 'aegis', damageTaken: 0, destroyed: false },
      { instanceId: '2:wolf-battlestation', shipId: 'wolf-battlestation', target: 'aegis', damageTaken: 0, destroyed: false },
    ];
    const cruiserIndex = 1;
    const stationIndex = 2;
    const longAction = {
      actionId: 'long-range-battlestation-destroyed', sourceId: 'aegis-missile-launchers',
      range: 'long-range' as const, fixedDamage: 6, maxTargets: 1,
    };
    const long = resolveLockedWolfRange({
      range: 'long-range', actions: [longAction],
      locked: { range: 'long-range', dice: [{
        actionId: longAction.actionId, sourceId: longAction.sourceId, range: 'long-range',
        rolls: [], successes: 1, damage: 6, damagePerHit: 6,
      }] },
      assignments: [{ actionId: longAction.actionId, targetInstanceIds: [roster[stationIndex]!.instanceId] }],
      roster,
    });
    const mediumAction = {
      actionId: 'medium-range-cruiser-destroyed', sourceId: 'aegis-missile-launchers',
      range: 'medium-range' as const, fixedDamage: 3, maxTargets: 1,
    };
    const medium = resolveLockedWolfRange({
      range: 'medium-range', actions: [mediumAction],
      locked: { range: 'medium-range', dice: [{
        actionId: mediumAction.actionId, sourceId: mediumAction.sourceId, range: 'medium-range',
        rolls: [], successes: 1, damage: 3, damagePerHit: 3,
      }] },
      assignments: [{ actionId: mediumAction.actionId, targetInstanceIds: [roster[cruiserIndex]!.instanceId] }],
      roster: long.roster,
      targetShiftPlan: {
        choices: [{ sourceId: 'aegis-alpha-wing', choiceIndex: 0, rosterIndex: cruiserIndex, shift: 1 }],
        ring: CORE_WOLF_TARGET_RING,
      },
    });

    expect(long.receipt.targetSnapshot).toHaveLength(roster.length);
    expect(long.receipt.targetSnapshot[stationIndex]).toEqual({ instanceId: roster[stationIndex]!.instanceId, target: 'aegis' });
    expect(long.receipt.destroyedInstanceIds).toContain(roster[stationIndex]!.instanceId);
    expect(long.receipt.destructionDamageByTarget).toMatchObject({ aegis: 3, dione: 0 });
    expect(medium.receipt.targetSnapshot[cruiserIndex]).toEqual({ instanceId: roster[cruiserIndex]!.instanceId, target: 'aegis' });
    expect(medium.receipt.targetShifts).toEqual([{
      sourceId: 'aegis-alpha-wing', choiceIndex: 0, rosterIndex: cruiserIndex,
      shift: 1, fromDie: 1, toDie: 2,
    }]);
    expect(medium.receipt.destroyedInstanceIds).toContain(roster[cruiserIndex]!.instanceId);
    expect(medium.receipt.destructionDamageByTarget).toMatchObject({ aegis: 0, dione: 1 });
    expect(medium.roster[cruiserIndex]?.target).toBe('dione');
    expect(medium.roster[stationIndex]?.target).toBe('aegis');

    const short = resolveLockedWolfRange({
      range: 'short-range', actions: [], locked: { range: 'short-range', dice: [] },
      assignments: [], roster: medium.roster,
    });
    const targeting: WolfTargetingReceipt = {
      ring: CORE_WOLF_TARGET_RING,
      modifierOrder: ['commander-reroll', 'target-shift', 'command-and-control-redirect'],
      rolls: ['wolf-fighter-wing', 'wolf-cruiser', 'wolf-battlestation'].map((shipId, rosterIndex) => ({
        rosterIndex, shipId: shipId as WolfTargetingReceipt['rolls'][number]['shipId'],
        initialDie: 1, finalDie: 1, target: 'aegis', modifiers: [],
      })),
    };
    const finalized = finalizeWolfAttack({
      requestId: 'shifted-medium-finalization', targeting, roster: short.roster,
      ranges: [long.receipt, medium.receipt, short.receipt], phase: startTurnPhase(1, 1_000), now: 2_000,
      targetRing: CORE_WOLF_TARGET_RING, boardingDefence: [], forceFieldTargetId: null,
      fleetState: completeFleetState(), randomInt: () => 0,
    });
    expect(finalized.fleetDamage).toEqual(expect.arrayContaining([
      expect.objectContaining({ target: 'aegis', amount: 4 }),
      expect.objectContaining({ target: 'dione', amount: 1 }),
    ]));
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

  it('adds the Commander party bonus before the chosen target rolls defence', () => {
    const boarding = resolveWolfBoarding(
      firstTurnRoster(),
      [{ target: 'aegis', securityTeams: 0, commanderLed: true } as unknown as WolfBoardingDefence],
      samples([]),
    );

    expect(boarding[0]).toMatchObject({
      target: 'aegis', boardingParties: 22, commanderBonus: 2,
      survivingBoardingParties: 22, damage: 22,
    });
  });

  it('resolves Militia double-team dice and front-line risk as separate logged outcomes', () => {
    const boarding = resolveWolfBoarding(
      firstTurnRoster(),
      [{ target: 'aegis', securityTeams: 2, availableSecurityTeams: 2,
        militiaDoubleTeams: true, militiaFrontLineDice: 2 } as unknown as WolfBoardingDefence],
      samples([0, 3, 3, 5, 0, 3]),
    );

    expect(boarding[0]).toMatchObject({
      rolls: [1, 4, 4, 6, 1, 4], securityCasualties: 2,
      boarderCasualties: 4, survivingBoardingParties: 16,
      frontLineDice: 2, militiaLeaderKilled: true,
    });
  });

  it('keeps AEGIS and Pallas reroll grants independent and applies a shared die sequentially', () => {
    const first = resolveWolfBoarding(
      firstTurnRoster(),
      [{ target: 'aegis', securityTeams: 4, pallasRerollAvailable: true,
        rerolls: [
          { source: 'aegis', dieIndexes: [0, 1, 2] },
          { source: 'pallas', dieIndexes: [3] },
        ] } as unknown as WolfBoardingDefence],
      samples([0, 0, 0, 0, 5, 5, 5, 5]),
    );
    expect(first[0]).toMatchObject({ rolls: [6, 6, 6, 6], boarderCasualties: 4 });
    expect(first[0]?.rerolls).toEqual([
      { source: 'aegis', dieIndexes: [0, 1, 2], rolls: [6, 6, 6] },
      { source: 'pallas', dieIndexes: [3], rolls: [6] },
    ]);
    const sequential = resolveWolfBoarding(
      firstTurnRoster(),
      [{ target: 'aegis', securityTeams: 1, pallasRerollAvailable: true,
        rerolls: [
          { source: 'aegis', dieIndexes: [0], rolls: [4] },
          { source: 'pallas', dieIndexes: [0], rolls: [6] },
        ] } as unknown as WolfBoardingDefence],
      samples([0]),
    );
    expect(sequential[0]?.rolls).toEqual([6]);
    expect(sequential[0]?.rerolls).toEqual([
      { source: 'aegis', dieIndexes: [0], rolls: [4] },
      { source: 'pallas', dieIndexes: [0], rolls: [6] },
    ]);
    expect(() => resolveWolfBoarding(
      firstTurnRoster(),
      [{ target: 'aegis', securityTeams: 1, pallasRerollAvailable: true,
        rerolls: [{ source: 'aegis', dieIndexes: [0, 0] }] } as unknown as WolfBoardingDefence],
      samples([0, 4]),
    )).toThrow(/duplicate/i);
  });

  it('locks server defence dice once and applies the persisted reroll outcomes without drawing again', () => {
    const transport: WolfCombatShip = {
      instanceId: 'locked-transport', shipId: 'wolf-assault-transport', target: 'aegis',
      damageTaken: 0, destroyed: false,
    };
    const locked = lockWolfBoardingDefenceRolls(
      [transport],
      [{ target: 'aegis', securityTeams: 2, availableSecurityTeams: 2,
        commanderLed: true, militiaDoubleTeams: true, militiaFrontLineDice: 1 }],
      samples([0, 1, 2, 3, 4]),
    );
    let unexpectedDraw = false;
    const resolved = resolveWolfBoarding([transport], [{
      ...locked[0]!,
      rerolls: [{ source: 'aegis', dieIndexes: [0], rolls: [6] }],
    }], () => { unexpectedDraw = true; throw new Error('finalization redrew a locked die'); });

    expect(locked[0]?.lockedRolls).toEqual([1, 2, 3, 4, 5]);
    expect(resolved[0]?.rolls).toEqual([6, 2, 3, 4, 5]);
    expect(resolved[0]?.rerolls).toEqual([{ source: 'aegis', dieIndexes: [0], rolls: [6] }]);
    expect(unexpectedDraw).toBe(false);
  });

  it('keeps expanded Capybara destruction, boarding, and fleet damage in the configured ring', () => {
    const battlestation: WolfCombatShip = {
      instanceId: 'expanded-battlestation:0', shipId: 'wolf-battlestation', target: 'capybara',
      damageTaken: 0, destroyed: false,
    };
    const destroyed = resolveWolfRange('long-range', [{
      actionId: 'expanded-long-shot', sourceId: 'aegis-missiles', range: 'long-range',
      fixedDamage: 6, maxTargets: 1,
    }], [{ actionId: 'expanded-long-shot', targetInstanceIds: [battlestation.instanceId] }],
    [battlestation], samples([]));
    expect(destroyed.receipt.destructionDamageByTarget.capybara).toBe(3);

    const transport: WolfCombatShip = {
      instanceId: 'expanded-transport:0', shipId: 'wolf-assault-transport', target: 'capybara',
      damageTaken: 0, destroyed: false,
    };
    const boarding = resolveWolfBoarding([transport], [{ target: 'capybara', securityTeams: 0 }], samples([]));
    expect(boarding).toEqual([expect.objectContaining({
      target: 'capybara', boardingParties: 4, survivingBoardingParties: 4, damage: 4,
    })]);

    const fleetDamage = applyWolfFleetDamage('capybara', destroyed.receipt.destructionDamageByTarget.capybara, {
      damage: { damagedSystemIds: [], destroyed: false }, population: INITIAL_SHIP_SURVIVORS.capybara!,
    }, () => 0);
    expect(fleetDamage).toMatchObject({ target: 'capybara', amount: 3, population: 16_000 });
  });

  it('finalizes committed ranges without rerolls and applies the pre-target Force Field to final damage', () => {
    const fullTargeting = resolveWolfTargeting(firstTurnWolfAttackComposition(), {}, undefined, () => 0);
    const selectedTransport = fullTargeting.rolls.find(({ shipId }) => shipId === 'wolf-assault-transport')!;
    const targeting = { ...fullTargeting, rolls: [{ ...selectedTransport, rosterIndex: 0 }] };
    const roster = wolfCombatRoster(targeting);
    const ranges = (['long-range', 'medium-range', 'short-range'] as const).map((range) => ({
      range, targetSnapshot: roster.map(({ instanceId, target }) => ({ instanceId, target })),
      dice: [], assignments: [], targetShifts: [], unusedHitsByAction: [], damageByInstance: {}, destroyedInstanceIds: [],
      destructionDamageByTarget: Object.fromEntries(EXPANDED_WOLF_TARGET_RING.map((target) => [target, 0])),
    }));
    let randomCalls = 0;
    const phase = startTurnPhase(1, 1_000);
    const resolved = finalizeWolfAttack({
      requestId: 'attack-final', targeting, roster, ranges,
      boardingDefence: [{ target: 'aegis', securityTeams: 1 }],
      forceFieldTargetId: 'aegis', targetRing: CORE_WOLF_TARGET_RING,
      phase, now: 2_000, fleetState: completeFleetState(),
      randomInt: (upperBound) => { randomCalls += 1; return upperBound === 6 ? 3 : 0; },
    });

    expect(resolved).toMatchObject({
      type: 'wolf-combat-calculation', requestId: 'attack-final',
      ranges: [{ range: 'long-range' }, { range: 'medium-range' }, { range: 'short-range' }],
      boarding: [{ target: 'aegis', boardingParties: 4, securityTeams: 1, rolls: [4],
        boarderCasualties: 1, survivingBoardingParties: 3, damage: 3 }],
      fleetDamage: [expect.objectContaining({ target: 'aegis', amount: 1 })],
    });
    expect(randomCalls).toBe(2); // one defense die and one post-Force-Field damage draw
    expect(Object.isFrozen(resolved)).toBe(true);
  });

  it('preserves a wholly legacy in-progress attack without target snapshots or shifts', () => {
    const fullTargeting = resolveWolfTargeting(firstTurnWolfAttackComposition(), {}, undefined, () => 0);
    const selectedTransport = fullTargeting.rolls.find(({ shipId }) => shipId === 'wolf-assault-transport')!;
    const targeting = { ...fullTargeting, rolls: [{ ...selectedTransport, rosterIndex: 0 }] };
    const roster = wolfCombatRoster(targeting);
    const currentRanges = (['long-range', 'medium-range', 'short-range'] as const).map((range) => ({
      range, targetSnapshot: roster.map(({ instanceId, target }) => ({ instanceId, target })),
      dice: [], assignments: [], targetShifts: [], unusedHitsByAction: [], damageByInstance: {}, destroyedInstanceIds: [],
      destructionDamageByTarget: Object.fromEntries(EXPANDED_WOLF_TARGET_RING.map((target) => [target, 0])),
    }));
    const legacyRanges = currentRanges.map((range) => {
      const { targetSnapshot, targetShifts, ...legacy } = range;
      void targetSnapshot;
      void targetShifts;
      return legacy;
    }) as unknown as typeof currentRanges;
    const phase = startTurnPhase(1, 1_000);

    const resolved = finalizeWolfAttack({
      requestId: 'attack-legacy-final', targeting, roster, ranges: legacyRanges,
      boardingDefence: [{ target: 'aegis', securityTeams: 0 }],
      forceFieldTargetId: null, targetRing: CORE_WOLF_TARGET_RING, phase, now: 2_000,
      fleetState: completeFleetState(), randomInt: () => 0,
    });

    expect(resolved.type).toBe('wolf-combat-calculation');
    expect(resolved.ranges).toEqual([
      expect.objectContaining({ range: 'long-range' }),
      expect.objectContaining({ range: 'medium-range' }),
      expect.objectContaining({ range: 'short-range' }),
    ]);
  });

  it('continues an attack when deployment left a legacy Long receipt before new Medium and Short snapshots', () => {
    const fullTargeting = resolveWolfTargeting(firstTurnWolfAttackComposition(), {}, undefined, () => 0);
    const selectedTransport = fullTargeting.rolls.find(({ shipId }) => shipId === 'wolf-assault-transport')!;
    const targeting = { ...fullTargeting, rolls: [{ ...selectedTransport, rosterIndex: 0 }] };
    const roster = wolfCombatRoster(targeting);
    const ranges = (['long-range', 'medium-range', 'short-range'] as const).map((range) => ({
      range, targetSnapshot: roster.map(({ instanceId, target }) => ({ instanceId, target })),
      dice: [], assignments: [], targetShifts: [], unusedHitsByAction: [], damageByInstance: {}, destroyedInstanceIds: [],
      destructionDamageByTarget: Object.fromEntries(EXPANDED_WOLF_TARGET_RING.map((target) => [target, 0])),
    }));
    const { targetSnapshot, targetShifts, ...legacyLong } = ranges[0]!;
    void targetSnapshot;
    void targetShifts;
    const prefixRanges = [legacyLong, ranges[1]!, ranges[2]!] as unknown as typeof ranges;

    const resolved = finalizeWolfAttack({
      requestId: 'attack-legacy-prefix', targeting, roster, ranges: prefixRanges,
      boardingDefence: [{ target: 'aegis', securityTeams: 0 }],
      forceFieldTargetId: null, targetRing: CORE_WOLF_TARGET_RING, phase: startTurnPhase(1, 1_000), now: 2_000,
      fleetState: completeFleetState(), randomInt: () => 0,
    });
    expect(resolved.type).toBe('wolf-combat-calculation');
    expect(resolved.ranges.map(({ range }) => range)).toEqual(['long-range', 'medium-range', 'short-range']);
  });

  it('rejects a legacy receipt after snapshot-backed range progress and rejects snapshot-less shifts', () => {
    const fullTargeting = resolveWolfTargeting(firstTurnWolfAttackComposition(), {}, undefined, () => 0);
    const selectedTransport = fullTargeting.rolls.find(({ shipId }) => shipId === 'wolf-assault-transport')!;
    const targeting = { ...fullTargeting, rolls: [{ ...selectedTransport, rosterIndex: 0 }] };
    const roster = wolfCombatRoster(targeting);
    const ranges = (['long-range', 'medium-range', 'short-range'] as const).map((range) => ({
      range, targetSnapshot: roster.map(({ instanceId, target }) => ({ instanceId, target })),
      dice: [], assignments: [], targetShifts: [], unusedHitsByAction: [], damageByInstance: {}, destroyedInstanceIds: [],
      destructionDamageByTarget: Object.fromEntries(EXPANDED_WOLF_TARGET_RING.map((target) => [target, 0])),
    }));
    const { targetSnapshot, targetShifts: _targetShifts, ...legacyShort } = ranges[2]!;
    void targetSnapshot;
    void _targetShifts;
    const reverseRanges = [ranges[0]!, ranges[1]!, legacyShort] as unknown as typeof ranges;
    const common = {
      requestId: 'attack-reverse-range-receipts', targeting, roster,
      boardingDefence: [{ target: 'aegis' as const, securityTeams: 0 }],
      forceFieldTargetId: null, targetRing: CORE_WOLF_TARGET_RING, phase: startTurnPhase(1, 1_000), now: 2_000,
      fleetState: completeFleetState(), randomInt: () => 0,
    };

    expect(() => finalizeWolfAttack({ ...common, ranges: reverseRanges })).toThrow(/malformed|out of order/i);
    expect(() => finalizeWolfAttack({ ...common, ranges: [
      ranges[0]!, { ...ranges[1]!, targetSnapshot: undefined, targetShifts: [{ sourceId: 'maliades',
        choiceIndex: 0, rosterIndex: 0, shift: 1, fromDie: 1, toDie: 2 }] }, ranges[2]!,
    ] as unknown as typeof ranges })).toThrow(/malformed|out of order/i);
  });

  it('calculates complete attack receipts over a configured five- or seven-target ring', () => {
    const baseState = completeFleetState();
    const phase = startTurnPhase(1, 1_000);
    const liftedPhase = { ...phase, airspace: { ...phase.airspace, state: 'lifted' as const } };
    const smallRing = ['aegis', 'icebreaker', 'quellon', 'shepherd', 'refinery-124'] as const;
    const smallState = Object.fromEntries(smallRing.map((target) => [target, baseState[target]]));
    const small = calculateWolfAttack({
      requestId: 'attack-small-ring', composition: firstTurnWolfAttackComposition(),
      phase: liftedPhase, now: 2_000,
      targetRing: smallRing,
      rangeActions: [], rangeAssignments: [], boardingDefence: [{ target: 'aegis', securityTeams: 0 }],
      fleetState: smallState,
      randomInt: () => 0,
    } as Parameters<typeof calculateWolfAttack>[0]);
    expect(small.targeting.ring).toEqual(smallRing);
    expect(small.targeting.rolls.every((roll) => roll.target !== 'dione')).toBe(true);

    const expandedState = {
      ...baseState,
      capybara: { damage: { damagedSystemIds: [], destroyed: false }, population: INITIAL_SHIP_SURVIVORS.capybara! },
    };
    const expandedComposition = firstTurnWolfAttackComposition();
    const longActions = expandedComposition.shipIds.slice(0, -1).map((shipId, index) => ({
      actionId: `expanded-kill-${index}`, sourceId: 'test-aegis-action', range: 'long-range' as const,
      fixedDamage: shipId === 'wolf-fighter-wing' ? 1 : 2, maxTargets: 1,
    }));
    const expanded = calculateWolfAttack({
      requestId: 'attack-expanded-ring', composition: expandedComposition,
      phase: liftedPhase, now: 2_000,
      targetRing: EXPANDED_WOLF_TARGET_RING,
      rangeActions: longActions,
      rangeAssignments: longActions.map((action, index) => ({
        actionId: action.actionId, targetInstanceIds: [`${index}:${expandedComposition.shipIds[index]}`],
      })),
      boardingDefence: [{ target: 'capybara', securityTeams: 0 }],
      fleetState: expandedState,
      randomInt: (upperBound) => upperBound === 8 ? 6 : 0,
    } as Parameters<typeof calculateWolfAttack>[0]);
    expect(expanded.targeting.ring).toEqual(EXPANDED_WOLF_TARGET_RING);
    expect(expanded.boarding).toEqual([expect.objectContaining({
      target: 'capybara', boardingParties: 4, survivingBoardingParties: 4, damage: 4,
    })]);
    expect(expanded.fleetDamage).toEqual(expect.arrayContaining([
      expect.objectContaining({ target: 'capybara', amount: 4 }),
    ]));
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

  it('rejects an unruled second Capybara draw after its last card', () => {
    const damagedSystemIds = [
      'storage', 'advanced-hydroponics', 'reactor', 'water-production',
      'jump-drive', 'shuttle-bay',
    ];
    const damage = { damagedSystemIds, destroyed: false };
    expect(() => applyWolfFleetDamage('capybara', 2, {
      damage,
      population: INITIAL_SHIP_SURVIVORS.capybara!,
    }, () => 0)).toThrow('facilitator ruling required');
    expect(damage).toEqual({ damagedSystemIds, destroyed: false });
  });

  it('routes a required combat draw from an exhausted Capybara deck to destruction', () => {
    const damage = {
      damagedSystemIds: [
        'storage', 'advanced-hydroponics', 'reactor', 'water-production',
        'jump-drive', 'shuttle-bay', 'scrap-refinery',
      ],
      destroyed: false,
    };
    const result = applyWolfFleetDamage('capybara', 1, {
      damage,
      population: INITIAL_SHIP_SURVIVORS.capybara!,
    }, () => 0, { exhaustedDeckPolicy: 'destroy' });

    expect(result).toMatchObject({
      amount: 1,
      draws: [{ destroyed: true, casualty: false }],
      state: { damagedSystemIds: damage.damagedSystemIds, destroyed: true },
    });
    expect(damage.destroyed).toBe(false);
  });

  it('publishes every surviving Wolf ship and its resolved target in the private final receipt', () => {
    const targeting = resolveWolfTargeting(firstTurnWolfAttackComposition(), {}, EXPANDED_WOLF_TARGET_RING, () => 0);
    const roster = wolfCombatRoster(targeting);
    const ranges = (['long-range', 'medium-range', 'short-range'] as const).map((range) => ({
      range, targetSnapshot: roster.map(({ instanceId, target }) => ({ instanceId, target })),
      dice: [], assignments: [], targetShifts: [], unusedHitsByAction: [], damageByInstance: {}, destroyedInstanceIds: [],
      destructionDamageByTarget: Object.fromEntries(EXPANDED_WOLF_TARGET_RING.map((target) => [target, 0])),
    }));
    const receipt = finalizeWolfAttack({
      requestId: 'attack-survivors', targeting, roster, ranges,
      targetRing: EXPANDED_WOLF_TARGET_RING,
      boardingDefence: [...new Set(roster.filter(({ shipId }) => shipId === 'wolf-assault-transport')
        .map(({ target }) => target))].map((target) => ({ target, securityTeams: 0 })),
      forceFieldTargetId: null, phase: startTurnPhase(1, 1_000), now: 2_000, fleetState: {
        ...completeFleetState(),
        capybara: { damage: { damagedSystemIds: [], destroyed: false }, population: INITIAL_SHIP_SURVIVORS.capybara! },
      }, randomInt: () => 0,
    });

    expect(receipt).toMatchObject({
      survivingWolfShips: roster.filter(({ destroyed }) => !destroyed)
        .map(({ instanceId, shipId, target }) => ({ instanceId, shipId, target })),
    });
  });

  it('persists combat deck exhaustion as a destroyed fleet result in the final calculation receipt', () => {
    const fullTargeting = resolveWolfTargeting(
      firstTurnWolfAttackComposition(), {}, EXPANDED_WOLF_TARGET_RING, () => 0,
    );
    const wing = fullTargeting.rolls.find(({ shipId }) => shipId === 'wolf-fighter-wing')!;
    const targeting = { ...fullTargeting, rolls: [{ ...wing, rosterIndex: 0, target: 'capybara' as const }] };
    const roster = wolfCombatRoster(targeting);
    const ranges = (['long-range', 'medium-range', 'short-range'] as const).map((range) => ({
      range, targetSnapshot: roster.map(({ instanceId, target }) => ({ instanceId, target })),
      dice: [], assignments: [], targetShifts: [], unusedHitsByAction: [], damageByInstance: {}, destroyedInstanceIds: [],
      destructionDamageByTarget: Object.fromEntries(EXPANDED_WOLF_TARGET_RING.map((target) => [target, 0])),
    }));
    const capybaraDamage = {
      damagedSystemIds: [
        'storage', 'advanced-hydroponics', 'reactor', 'water-production',
        'jump-drive', 'shuttle-bay', 'scrap-refinery',
      ],
      destroyed: false,
    };
    const fleetState = {
      ...completeFleetState(),
      capybara: { damage: capybaraDamage, population: INITIAL_SHIP_SURVIVORS.capybara! },
    };
    const phase = startTurnPhase(1, 1_000);
    const receipt = finalizeWolfAttack({
      requestId: 'attack-capybara-exhaustion', targeting, roster, ranges,
      targetRing: EXPANDED_WOLF_TARGET_RING, boardingDefence: [], forceFieldTargetId: null,
      phase, now: 2_000, fleetState, randomInt: () => 0,
    });

    expect(receipt.fleetDamage).toEqual([expect.objectContaining({
      target: 'capybara', amount: 1, state: { damagedSystemIds: capybaraDamage.damagedSystemIds, destroyed: true },
      draws: [{ destroyed: true, casualty: false }],
    })]);
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
