import { describe, expect, it } from 'vitest';
import { recommendedRoleIds } from './rolePresets';

describe('recommended player-count role presets', () => {
  it('uses the Joint Engineering Union only in the low-count matrix presets', () => {
    expect(recommendedRoleIds(8)).toEqual(expect.arrayContaining([
      'joint-engineering-quellon-refinery',
      'joint-engineering-shepherd-icebreaker',
    ]));
    expect(recommendedRoleIds(18)).not.toContain('joint-engineering-quellon-refinery');
  });

  it('keeps Capybara for 20+ and combines Capybara with Press at 21', () => {
    expect(recommendedRoleIds(19)).toContain('press-officer');
    expect(recommendedRoleIds(19)).not.toContain('capybara-captain');
    expect(recommendedRoleIds(20)).toEqual(expect.arrayContaining([
      'capybara-captain', 'capybara-recycler',
    ]));
    expect(recommendedRoleIds(20)).not.toContain('press-officer');
    expect(recommendedRoleIds(21)).toEqual(expect.arrayContaining([
      'capybara-captain', 'capybara-recycler', 'press-officer',
    ]));
  });
});
