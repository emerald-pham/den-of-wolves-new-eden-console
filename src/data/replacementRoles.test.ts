import { describe, expect, it } from 'vitest';
import { REPLACEMENT_ROLE_CATALOG, replacementRoleAvailableForSession } from './replacementRoles';

const aegis = ['aegis'];
const dockedGorgoneion = {
  id: 'gorgoneion', hostShipId: 'aegis', dockingRevision: 1,
  population: 1_000, unrest: 0,
  cycle: { step: 0, revision: 0, results: {}, charges: [] },
};
const gorgRole = REPLACEMENT_ROLE_CATALOG.find((role) => role.id === 'gorgoneion-captain')!;

function available(overrides: Record<string, unknown> = {}) {
  return replacementRoleAvailableForSession(gorgRole, {
    activeVesselIds: aegis,
    smallShipStates: { gorgoneion: dockedGorgoneion },
    expansion: 'base',
    capybaraEnabled: true,
    ...overrides,
  });
}

describe('GM replacement role presentation', () => {
  it('shows an extra-ship Captain after a valid host docking without adding the ship to the core roster', () => {
    expect(available()).toBe(true);
    expect(aegis).toEqual(['aegis']);
  });

  it.each([
    ['missing state', {}],
    ['never-docked state', { gorgoneion: { ...dockedGorgoneion, dockingRevision: 0 } }],
    ['undocked state', { gorgoneion: { ...dockedGorgoneion, hostShipId: null, dockingRevision: 2 } }],
    ['malformed revision', { gorgoneion: { ...dockedGorgoneion, dockingRevision: '1' } }],
    ['inactive host', { gorgoneion: { ...dockedGorgoneion, hostShipId: 'dione' } }],
    ['client-crafted marker', { gorgoneion: { ...dockedGorgoneion, admitted: true } }],
    ['unknown mixed state', { gorgoneion: dockedGorgoneion, future: dockedGorgoneion }],
  ])('hides the option for %s', (_label, smallShipStates) => {
    expect(available({ smallShipStates })).toBe(false);
  });

  it('does not infer extra-ship admission from an extra id in activeVesselIds', () => {
    expect(available({ activeVesselIds: ['aegis', 'gorgoneion'] })).toBe(false);
  });

  it('shows the other small ships when Capybara is disabled but hides base Capybara outside base mode', () => {
    expect(available({ expansion: 'none', capybaraEnabled: false })).toBe(true);
    const capybaraRole = REPLACEMENT_ROLE_CATALOG.find((role) => role.id === 'capybara-small-captain')!;
    const capybaraState = {
      id: 'capybara-small', hostShipId: 'aegis', dockingRevision: 1,
      population: 2_000, unrest: 0,
      cycle: { step: 0, revision: 0, results: {}, charges: [] },
    };
    expect(replacementRoleAvailableForSession(capybaraRole, {
      activeVesselIds: aegis, smallShipStates: { 'capybara-small': capybaraState },
      expansion: 'base', capybaraEnabled: true,
    })).toBe(true);
    expect(replacementRoleAvailableForSession(capybaraRole, {
      activeVesselIds: aegis, smallShipStates: { 'capybara-small': capybaraState },
      expansion: 'capybara', capybaraEnabled: true,
    })).toBe(false);
    expect(replacementRoleAvailableForSession(capybaraRole, {
      activeVesselIds: aegis, smallShipStates: { 'capybara-small': capybaraState },
      expansion: 'base', capybaraEnabled: false,
    })).toBe(false);
  });
});
