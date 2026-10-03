import { describe, expect, it } from 'vitest';
import {
  aegisWolfRangeActions,
  boaWolfRangeActions,
  gorgoneionWolfRangeActions,
  highwallWolfRangeActions,
  lockWolfRangeActions,
  resolveLockedWolfRange,
  validateWolfBoardingDefenceChoice,
  wolfAttackNextStep,
} from './wolfAttackLifecycle';
import { wolfCombatRoster, resolveWolfTargeting } from './wolfCombatMath';
import { firstTurnWolfAttackComposition } from './wolfAttackComposition';

describe('resumable Wolf attack lifecycle primitives', () => {
  it('derives only charged, undamaged base AEGIS weapons and applies installed upgrades', () => {
    const actions = aegisWolfRangeActions({
      range: 'medium-range',
      charges: ['missile-launchers', 'point-defence-lasers'],
      damagedSystemIds: [],
      destroyed: false,
      upgrades: ['missile-launchers'],
    });

    expect(actions).toEqual([
      {
        actionId: 'aegis-missile-launchers-medium', sourceId: 'aegis-missile-launchers',
        range: 'medium-range', dice: { sides: 6, count: 5, successAt: 5, damagePerSuccess: 1 }, maxTargets: 5,
      },
      {
        actionId: 'aegis-point-defence-lasers-medium', sourceId: 'aegis-point-defence-lasers',
        range: 'medium-range', dice: { sides: 6, count: 2, successAt: 4, damagePerSuccess: 1 }, maxTargets: 2,
      },
    ]);
    expect(aegisWolfRangeActions({
      range: 'long-range', charges: ['missile-launchers'], damagedSystemIds: ['missile-launchers'],
      destroyed: false, upgrades: [],
    })).toEqual([]);
  });

  it('applies enriched warheads only to the current charged missile action', () => {
    expect(aegisWolfRangeActions({
      range: 'long-range', charges: ['missile-launchers'], damagedSystemIds: [], destroyed: false,
      upgrades: [], enrichedWarheads: true,
    })).toMatchObject([{ fixedDamage: 3 }]);
    expect(aegisWolfRangeActions({
      range: 'medium-range', charges: ['missile-launchers'], damagedSystemIds: [], destroyed: false,
      upgrades: ['missile-launchers'], enrichedWarheads: true,
    })).toMatchObject([{ dice: { count: 5, successAt: 4, damagePerSuccess: 1 } }]);
    expect(aegisWolfRangeActions({
      range: 'medium-range', charges: ['missile-launchers'], damagedSystemIds: [], destroyed: false,
      upgrades: [], enrichedWarheads: false,
    })).toMatchObject([{ dice: { count: 4, successAt: 5, damagePerSuccess: 1 } }]);
  });

  it('derives Gorgoneion, Highwall and Boa range actions from their own current prerequisites', () => {
    expect(gorgoneionWolfRangeActions({ range: 'medium-range', charged: true, damaged: false, destroyed: false })).toEqual([
      { actionId: 'gorgoneion-missile-array-medium', sourceId: 'gorgoneion-missile-array',
        range: 'medium-range', dice: { sides: 6, count: 3, successAt: 5, damagePerSuccess: 1 }, maxTargets: 3 },
    ]);
    expect(gorgoneionWolfRangeActions({ range: 'short-range', charged: true, damaged: false, destroyed: false }))
      .toMatchObject([{ dice: { count: 3, successAt: 4 } }]);
    expect(gorgoneionWolfRangeActions({ range: 'long-range', charged: false, damaged: false, destroyed: false })).toEqual([]);

    expect(highwallWolfRangeActions({ range: 'medium-range', fuelled: true, destroyed: false })).toEqual([
      { actionId: 'highwall-medium-range', sourceId: 'highwall', range: 'medium-range',
        dice: { sides: 6, count: 1, successAt: 5, damagePerSuccess: 3 }, maxTargets: 1 },
    ]);
    expect(highwallWolfRangeActions({ range: 'long-range', fuelled: true, destroyed: false })).toEqual([]);
    expect(highwallWolfRangeActions({ range: 'short-range', fuelled: false, destroyed: false })).toEqual([]);

    expect(boaWolfRangeActions({ range: 'short-range', scrapAvailable: 1, destroyed: false })).toEqual([
      { actionId: 'boa-short-range', sourceId: 'boa', range: 'short-range', fixedDamage: 1, maxTargets: 1 },
    ]);
    expect(boaWolfRangeActions({ range: 'short-range', scrapAvailable: 0, destroyed: false })).toEqual([]);
    expect(boaWolfRangeActions({ range: 'short-range', scrapAvailable: 1, destroyed: true })).toEqual([]);
  });

  it('locks all range dice before revealing only hit slots, then applies assignments without rerolling', () => {
    const actions = aegisWolfRangeActions({
      range: 'medium-range', charges: ['missile-launchers', 'point-defence-lasers'],
      damagedSystemIds: [], destroyed: false, upgrades: [],
    });
    let randomCalls = 0;
    const locked = lockWolfRangeActions('medium-range', actions, (upperBound) => {
      randomCalls += 1;
      return upperBound - 1;
    });
    expect(locked.dice.map(({ actionId, successes }) => ({ actionId, successes }))).toEqual([
      { actionId: 'aegis-missile-launchers-medium', successes: 4 },
      { actionId: 'aegis-point-defence-lasers-medium', successes: 2 },
    ]);
    expect(randomCalls).toBe(6);

    const roster = wolfCombatRoster(resolveWolfTargeting(firstTurnWolfAttackComposition(), {}, undefined, () => 0));
    const assignmentTargets = roster.slice(0, 6).map(({ instanceId }) => instanceId);
    const result = resolveLockedWolfRange({
      range: 'medium-range', actions, locked,
      assignments: [
        { actionId: actions[0]!.actionId, targetInstanceIds: assignmentTargets.slice(0, 4) },
        { actionId: actions[1]!.actionId, targetInstanceIds: assignmentTargets.slice(4, 6) },
      ],
      roster,
    });
    expect(randomCalls).toBe(6);
    expect(result.receipt.dice).toHaveLength(2);
    expect(result.receipt.damageByInstance).toEqual(Object.fromEntries(assignmentTargets.map((id) => [id, 1])));
  });

  it('enforces each printed step in order and validates the entitled boarding defence count', () => {
    expect(wolfAttackNextStep('targeting')).toBe('long-range');
    expect(wolfAttackNextStep('long-range')).toBe('medium-range');
    expect(wolfAttackNextStep('medium-range')).toBe('short-range');
    expect(wolfAttackNextStep('short-range')).toBe('boarding');
    expect(wolfAttackNextStep('boarding')).toBe('resolved');
    expect(wolfAttackNextStep('resolved')).toBeNull();
    expect(validateWolfBoardingDefenceChoice(4, 0)).toBe(0);
    expect(validateWolfBoardingDefenceChoice(4, 3)).toBe(3);
    expect(() => validateWolfBoardingDefenceChoice(4, 5)).toThrow(/available security teams/i);
    expect(() => validateWolfBoardingDefenceChoice(-1, 0)).toThrow(/available security teams/i);
  });
});
