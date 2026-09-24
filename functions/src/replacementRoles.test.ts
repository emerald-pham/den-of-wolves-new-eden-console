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

  it('keeps extra-ship availability separate from the canonical core roster', () => {
    const smallShipStates = {
      'capybara-small': {
        id: 'capybara-small', hostShipId: 'aegis', dockingRevision: 1,
        population: 2_000, unrest: 0, cycle: { step: 0, revision: 0, results: {}, charges: [] },
      },
      warrior: {
        id: 'warrior', hostShipId: null, dockingRevision: 2,
        population: 2_000, unrest: 0, cycle: { step: 0, revision: 0, results: {}, charges: [] },
      },
    };
    expect(replacementRoleAvailable('capybara-small-captain', {
      activeVesselIds: ['aegis'], expansion: 'base', smallShipStates, capybaraEnabled: true,
    })).toBe(true);
    expect(replacementRoleAvailable('capybara-small-captain', {
      activeVesselIds: ['aegis'], expansion: 'capybara', smallShipStates, capybaraEnabled: true,
    })).toBe(false);
    expect(replacementRoleAvailable('warrior-captain', {
      activeVesselIds: ['aegis'], expansion: 'base', smallShipStates,
    })).toBe(false);
  });

  it('denies historical core role authority after replacement', () => {
    expect(replacementAuthorityAllowsRole('wolf-commander', 'admiral')).toBe(false);
    expect(replacementAuthorityAllowsRole('wolf-commander', 'wolf-commander')).toBe(true);
    expect(replacementAuthorityAllowsRole(null, 'admiral')).toBe(true);
  });
});
