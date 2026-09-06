import { populationChange } from './shipPopulation';
import { nextResourceAmount, unrestChange } from './resources';

export type CounterStep = -1 | 1;

export interface CounterBatchResult {
  readonly amount: number;
  readonly appliedSteps: readonly CounterStep[];
  readonly alertRaised: boolean;
}

/**
 * Apply each click in order. A threshold is a game event, so it is never
 * reduced to the arithmetic net of a fast click sequence.
 */
export function applyResourceSteps(
  current: number,
  steps: readonly CounterStep[],
): CounterBatchResult {
  return {
    amount: steps.reduce((amount, step) => nextResourceAmount(amount, step), current),
    appliedSteps: [...steps],
    alertRaised: false,
  };
}

export function applyUnrestSteps(
  current: number,
  steps: readonly CounterStep[],
  alertPending: boolean,
): CounterBatchResult {
  let amount = current;
  const appliedSteps: CounterStep[] = [];
  for (const step of steps) {
    const result = unrestChange(amount, step, alertPending);
    if (result.kind === 'blocked') {
      throw new Error('The GM unrest alert must be dismissed first.');
    }
    amount = result.amount;
    appliedSteps.push(step);
    if (result.kind === 'overflow') {
      return { amount, appliedSteps, alertRaised: true };
    }
  }
  return { amount, appliedSteps, alertRaised: false };
}

export function applyPopulationSteps(
  shipId: string,
  current: number,
  steps: readonly CounterStep[],
  alertPending: boolean,
): CounterBatchResult {
  let amount = current;
  const appliedSteps: CounterStep[] = [];
  for (const step of steps) {
    const result = populationChange(shipId, amount, step, alertPending);
    amount = result.amount;
    appliedSteps.push(step);
    if (result.alertRaised) {
      return { amount, appliedSteps, alertRaised: true };
    }
  }
  return { amount, appliedSteps, alertRaised: false };
}
