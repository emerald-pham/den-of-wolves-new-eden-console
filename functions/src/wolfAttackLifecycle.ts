import {
  lockWolfRangeActions as lockCombatRangeActions,
  resolveLockedWolfRange as resolveCombatRange,
  type WolfCombatRange,
  type WolfFleetTargetId,
  type WolfRangeAction,
  type WolfRangeAssignment,
  type WolfRangeRollLock,
  type WolfCombatShip,
  type WolfRandomInt,
} from './wolfCombatMath';
import { WOLF_ATTACK_TARGET_IDS, type WolfAttackTargetId } from './wolfAttackPreparation';

export const WOLF_ATTACK_LIFECYCLE_STEPS = [
  'targeting', 'long-range', 'medium-range', 'short-range', 'boarding', 'resolved',
] as const;
export type WolfAttackLifecycleStep = typeof WOLF_ATTACK_LIFECYCLE_STEPS[number];

const NEXT_STEP: Readonly<Record<Exclude<WolfAttackLifecycleStep, 'resolved'>, WolfAttackLifecycleStep>> = {
  targeting: 'long-range',
  'long-range': 'medium-range',
  'medium-range': 'short-range',
  'short-range': 'boarding',
  boarding: 'resolved',
};

export function wolfAttackNextStep(step: WolfAttackLifecycleStep): WolfAttackLifecycleStep | null {
  return step === 'resolved' ? null : NEXT_STEP[step];
}

/** Only the existing base AEGIS Missile Launcher and PDL action policies enter PC07. */
export function aegisWolfRangeActions(input: Readonly<{
  range: WolfCombatRange;
  charges: readonly string[];
  damagedSystemIds: readonly string[];
  destroyed: boolean;
  upgrades: readonly string[];
}>): readonly WolfRangeAction[] {
  if (input.destroyed) return [];
  const charged = new Set(input.charges);
  const damaged = new Set(input.damagedSystemIds);
  const upgraded = new Set(input.upgrades);
  const actions: WolfRangeAction[] = [];

  if (charged.has('missile-launchers') && !damaged.has('missile-launchers')) {
    if (input.range === 'long-range') {
      actions.push({
        actionId: 'aegis-missile-launchers-long',
        sourceId: 'aegis-missile-launchers',
        range: input.range,
        fixedDamage: upgraded.has('missile-launchers') ? 3 : 2,
        maxTargets: 1,
      });
    } else if (input.range === 'medium-range') {
      const count = upgraded.has('missile-launchers') ? 5 : 4;
      actions.push({
        actionId: 'aegis-missile-launchers-medium',
        sourceId: 'aegis-missile-launchers',
        range: input.range,
        dice: { sides: 6, count, successAt: 5, damagePerSuccess: 1 },
        maxTargets: count,
      });
    }
  }

  if (charged.has('point-defence-lasers') && !damaged.has('point-defence-lasers')) {
    if (input.range === 'medium-range') {
      actions.push({
        actionId: 'aegis-point-defence-lasers-medium',
        sourceId: 'aegis-point-defence-lasers',
        range: input.range,
        dice: { sides: 6, count: 2, successAt: 4, damagePerSuccess: 1 },
        maxTargets: upgraded.has('point-defence-lasers') ? 3 : 2,
      });
    } else if (input.range === 'short-range') {
      actions.push({
        actionId: 'aegis-point-defence-lasers-short',
        sourceId: 'aegis-point-defence-lasers',
        range: input.range,
        dice: { sides: 6, count: 2, successAt: 2, damagePerSuccess: 1 },
        maxTargets: upgraded.has('point-defence-lasers') ? 3 : 2,
      });
    }
  }
  return actions;
}

/** Persist this result when the use/pass choice locks. It is never regenerated for target selection. */
export function lockWolfRangeActions(
  range: WolfCombatRange,
  selectedActions: readonly WolfRangeAction[],
  random: WolfRandomInt,
): WolfRangeRollLock {
  return lockCombatRangeActions(range, selectedActions, random);
}

export function wolfRangeTargetSlots(lock: WolfRangeRollLock): readonly Readonly<{
  actionId: string;
  requiredTargets: number;
}>[] {
  return lock.dice.map(({ actionId, successes }) => ({ actionId, requiredTargets: successes }));
}

export function resolveLockedWolfRange(input: Readonly<{
  range: WolfCombatRange;
  actions: readonly WolfRangeAction[];
  locked: WolfRangeRollLock;
  assignments: readonly WolfRangeAssignment[];
  roster: readonly WolfCombatShip[];
}>) {
  return resolveCombatRange(input);
}

export function validateWolfBoardingDefenceChoice(available: number, chosen: number): number {
  if (!Number.isSafeInteger(available) || available < 0 ||
      !Number.isSafeInteger(chosen) || chosen < 0 || chosen > available) {
    throw new Error('Choose a whole number within the available Security Teams total.');
  }
  return chosen;
}

/** The Gorgoneion projector subtracts two from the selected target's final aggregate attack damage. */
export function reduceWolfDamageForForceField(
  damageByTarget: Readonly<Record<string, number>>,
  protectedTarget: WolfFleetTargetId,
): Readonly<{ damageByTarget: Readonly<Record<string, number>>; prevented: number }> {
  const damage = damageByTarget[protectedTarget] ?? 0;
  if (!Number.isSafeInteger(damage) || damage < 0) {
    throw new Error('The Force Field target must have a non-negative final damage total.');
  }
  const prevented = Math.min(2, damage);
  return {
    damageByTarget: { ...damageByTarget, [protectedTarget]: damage - prevented },
    prevented,
  };
}

export function chooseWolfForceFieldTarget(input: Readonly<{
  charged: boolean;
  targetShipId: string | null;
  activeTargetIds: readonly string[];
}>): Readonly<{ status: 'protected'; targetShipId: WolfAttackTargetId } | { status: 'unavailable' }> {
  if (!input.charged) {
    if (input.targetShipId !== null) {
      throw new Error('The uncharged Force Field Projector cannot select a target.');
    }
    return { status: 'unavailable' };
  }
  if (input.targetShipId === null ||
      !(WOLF_ATTACK_TARGET_IDS as readonly string[]).includes(input.targetShipId) ||
      !input.activeTargetIds.includes(input.targetShipId)) {
    throw new Error('Choose one active fleet target for the charged Force Field Projector.');
  }
  return { status: 'protected', targetShipId: input.targetShipId as WolfAttackTargetId };
}
