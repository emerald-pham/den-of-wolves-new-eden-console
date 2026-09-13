import { describe, expect, it } from 'vitest';
import {
  replacementAuthorityAllowsRole,
  replacementRoleAvailable,
  replacementRoleFor,
} from './replacementRoles';

describe('replacement role authority', () => {
  it('keeps the source-defined role catalog separate from core seats', () => {
    expect(replacementRoleFor('wolf-commander')).toMatchObject({ kind: 'role' });
    expect(replacementRoleFor('capybara-small-captain')).toMatchObject({
      kind: 'extra-ship', baseVesselOnly: true, vesselId: 'capybara-small',
    });
    expect(replacementRoleFor('capybara-captain')).toBeUndefined();
  });

  it('keeps base Capybara distinct from the expansion and requires an active vessel', () => {
    expect(replacementRoleAvailable('capybara-small-captain', {
      activeVesselIds: ['capybara-small'], expansion: 'base',
    })).toBe(true);
    expect(replacementRoleAvailable('capybara-small-captain', {
      activeVesselIds: ['capybara-small'], expansion: 'capybara',
    })).toBe(false);
    expect(replacementRoleAvailable('warrior-captain', {
      activeVesselIds: [], expansion: 'base',
    })).toBe(false);
  });

  it('denies historical core role authority after replacement', () => {
    expect(replacementAuthorityAllowsRole('wolf-commander', 'admiral')).toBe(false);
    expect(replacementAuthorityAllowsRole('wolf-commander', 'wolf-commander')).toBe(true);
    expect(replacementAuthorityAllowsRole(null, 'admiral')).toBe(true);
  });
});
