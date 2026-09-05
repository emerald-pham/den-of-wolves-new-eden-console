import { describe, expect, it } from 'vitest';
import { DEFAULT_ACTIVE_ROLE_IDS, ROLE_IDS, recommendedRoleIds } from './roleConfiguration';

describe('role configuration', () => {
  it('keeps union roles off by default and allows every known role', () => {
    expect(ROLE_IDS).toContain('joint-engineering-quellon-refinery');
    expect(DEFAULT_ACTIVE_ROLE_IDS).not.toContain('joint-engineering-quellon-refinery');
  });

  it('configures the extended player presets', () => {
    expect(recommendedRoleIds(19)).toContain('press-officer');
    expect(recommendedRoleIds(20)).toContain('capybara-recycler');
    expect(recommendedRoleIds(21)).toEqual(expect.arrayContaining([
      'press-officer', 'capybara-captain', 'capybara-recycler',
    ]));
  });
});
