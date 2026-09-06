import { populationTrackForShip } from '@/data/shipPopulation';

/** A short pause absorbs a rapid click run without making a control feel delayed. */
export const COUNTER_COMMAND_COALESCE_MS = 250;

export type CounterStep = -1 | 1;

export interface CounterPreview {
  readonly amount: number;
  /** The ordered operations that can safely reach the server in this batch. */
  readonly appliedSteps: readonly CounterStep[];
  /** A threshold must remain visible even when a following click would net it out. */
  readonly alertRaised: boolean;
}

export function previewResourceChange(
  current: number,
  steps: readonly CounterStep[],
): CounterPreview {
  return {
    amount: steps.reduce((amount, step) => Math.max(0, amount + step), current),
    appliedSteps: [...steps],
    alertRaised: false,
  };
}

export function previewUnrestChange(
  current: number,
  steps: readonly CounterStep[],
): CounterPreview {
  let amount = current;
  const appliedSteps: CounterStep[] = [];
  for (const step of steps) {
    if (amount === 7 && step === 1) {
      appliedSteps.push(step);
      return { amount: 8, appliedSteps, alertRaised: true };
    }
    amount = Math.max(0, Math.min(10, amount + step));
    appliedSteps.push(step);
  }
  return { amount, appliedSteps, alertRaised: false };
}

export function previewPopulationChange(
  shipId: string,
  current: number,
  steps: readonly CounterStep[],
): CounterPreview {
  const track = populationTrackForShip(shipId);
  if (!track) return { amount: current, appliedSteps: [], alertRaised: false };
  let amount = current;
  const appliedSteps: CounterStep[] = [];
  for (const step of steps) {
    const currentIndex = track.steps.indexOf(amount);
    const next = track.steps[currentIndex - step];
    if (next === undefined) break;
    amount = next;
    appliedSteps.push(step);
    if (track.thresholds.includes(amount)) {
      return { amount, appliedSteps, alertRaised: true };
    }
  }
  return { amount, appliedSteps, alertRaised: false };
}
