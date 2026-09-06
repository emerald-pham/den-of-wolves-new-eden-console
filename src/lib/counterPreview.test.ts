import { describe, expect, it } from 'vitest';
import {
  COUNTER_COMMAND_COALESCE_MS,
  previewPopulationChange,
  previewResourceChange,
  previewUnrestChange,
} from './counterPreview';

describe('counter command previews', () => {
  it('uses a short coalescing window for rapid controls', () => {
    expect(COUNTER_COMMAND_COALESCE_MS).toBe(250);
  });

  it('keeps every ordered resource step in the local preview', () => {
    expect(previewResourceChange(0, [1, 1, -1])).toEqual({
      amount: 1,
      appliedSteps: [1, 1, -1],
      alertRaised: false,
    });
  });

  it('stops the unrest preview at its alert threshold instead of cancelling it out', () => {
    expect(previewUnrestChange(7, [1, -1])).toEqual({
      amount: 8,
      appliedSteps: [1],
      alertRaised: true,
    });
  });

  it('stops the population preview at its printed threshold', () => {
    expect(previewPopulationChange('capybara', 16_000, [-1, -1])).toEqual({
      amount: 15_000,
      appliedSteps: [-1],
      alertRaised: true,
    });
  });
});
