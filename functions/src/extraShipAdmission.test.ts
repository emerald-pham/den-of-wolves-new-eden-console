import { describe, expect, it } from 'vitest';
import { isExtraShipAdmitted, publicSmallShipStatesForSession } from './extraShipAdmission';
import { emptySmallShipState, type SmallShipId } from './smallShip';

const CORE_VESSELS = ['aegis'] as const;

function dockedState(id: SmallShipId) {
  return { ...emptySmallShipState(id, 'aegis'), dockingRevision: 1 };
}

function admission(
  id: SmallShipId,
  smallShipStates: unknown,
  overrides: Record<string, unknown> = {},
): boolean {
  return isExtraShipAdmitted({
    smallShipId: id,
    activeVesselIds: CORE_VESSELS,
    smallShipStates,
    expansion: 'base',
    capybaraEnabled: true,
    ...overrides,
  });
}

describe('server-owned extra-ship admission', () => {
  it('projects no optional states when any sibling has an unknown or malformed shape', () => {
    const valid = dockedState('gorgoneion');
    const malformedSibling = { ...dockedState('warrior'), admitted: true };
    expect(publicSmallShipStatesForSession({
      activeVesselIds: CORE_VESSELS,
      smallShipStates: { gorgoneion: valid, warrior: malformedSibling },
      expansion: 'base',
      capybaraEnabled: true,
    })).toEqual({});
    expect(publicSmallShipStatesForSession({
      activeVesselIds: CORE_VESSELS,
      smallShipStates: { gorgoneion: valid, 'future-ship': valid },
      expansion: 'base',
      capybaraEnabled: true,
    })).toEqual({});
  });

  it('projects the complete valid state map without changing the core roster', () => {
    const coreVessels = [...CORE_VESSELS];
    expect(publicSmallShipStatesForSession({
      activeVesselIds: coreVessels,
      smallShipStates: { gorgoneion: dockedState('gorgoneion') },
      expansion: 'base',
      capybaraEnabled: true,
    })).toEqual({ gorgoneion: dockedState('gorgoneion') });
    expect(coreVessels).toEqual(['aegis']);
  });

  it.each([
    ['missing persisted core roster', undefined],
    ['malformed persisted core roster', ['aegis', 'gorgoneion']],
    ['duplicate persisted core roster', ['aegis', 'aegis']],
  ])('does not project an admitted ship with a %s', (_label, activeVesselIds) => {
    const state = dockedState('gorgoneion');
    expect(publicSmallShipStatesForSession({
      activeVesselIds,
      smallShipStates: { gorgoneion: state },
      expansion: 'base',
      capybaraEnabled: true,
    })).toEqual({});
    expect(isExtraShipAdmitted({
      activeVesselIds,
      smallShipStates: { gorgoneion: state },
      smallShipId: 'gorgoneion',
      expansion: 'base',
      capybaraEnabled: true,
    })).toBe(false);
  });

  it.each(['gorgoneion', 'capybara-small', 'warrior', 'vulcan'] as const)(
    'admits docked %s separately from the canonical core roster', (id) => {
      const coreVessels = [...CORE_VESSELS];
      expect(isExtraShipAdmitted({
        smallShipId: id,
        activeVesselIds: coreVessels,
        smallShipStates: { [id]: dockedState(id) },
        expansion: 'base',
        capybaraEnabled: true,
      })).toBe(true);
      expect(coreVessels).toEqual(['aegis']);
      expect(coreVessels).not.toContain(id);
    },
  );

  it('does not admit an absent state, an empty state, or a never-docked state', () => {
    expect(admission('gorgoneion', {})).toBe(false);
    expect(admission('gorgoneion', { gorgoneion: emptySmallShipState('gorgoneion') })).toBe(false);
    expect(admission('gorgoneion', { gorgoneion: emptySmallShipState('gorgoneion', 'aegis') })).toBe(false);
  });

  it('does not admit a valid but undocked state after a historical docking', () => {
    const undocked = { ...emptySmallShipState('warrior'), dockingRevision: 2 };
    expect(admission('warrior', { warrior: undocked })).toBe(false);
  });

  it.each([
    ['malformed docking revision', { ...dockedState('gorgoneion'), dockingRevision: '1' }],
    ['negative docking revision', { ...dockedState('gorgoneion'), dockingRevision: -1 }],
    ['missing host', { ...dockedState('gorgoneion'), hostShipId: undefined }],
    ['unknown host', { ...dockedState('gorgoneion'), hostShipId: 'unlisted-ship' }],
    ['wrong state identity', { ...dockedState('gorgoneion'), id: 'warrior' }],
    ['client-shaped admission marker', { ...dockedState('gorgoneion'), admitted: true }],
  ])('fails closed for %s', (_case, state) => {
    expect(admission('gorgoneion', { gorgoneion: state })).toBe(false);
  });

  it('requires the recorded host to remain in the canonical active core fleet', () => {
    expect(admission('gorgoneion', {
      gorgoneion: { ...dockedState('gorgoneion'), hostShipId: 'dione' },
    })).toBe(false);
    expect(admission('gorgoneion', { gorgoneion: dockedState('gorgoneion') }, {
      activeVesselIds: ['aegis', 'aegis'],
    })).toBe(false);
    expect(admission('gorgoneion', { gorgoneion: dockedState('gorgoneion') }, {
      activeVesselIds: ['aegis', 'unlisted-ship'],
    })).toBe(false);
    expect(admission('gorgoneion', { gorgoneion: dockedState('gorgoneion') }, {
      activeVesselIds: ['gorgoneion'],
    })).toBe(false);
  });

  it('rejects unknown mixed state maps instead of treating them as extra ships', () => {
    expect(admission('gorgoneion', {
      gorgoneion: dockedState('gorgoneion'),
      'future-ship': dockedState('gorgoneion'),
    })).toBe(false);
    expect(admission('gorgoneion', null)).toBe(false);
  });

  it('admits base Capybara only in enabled base mode', () => {
    const states = { 'capybara-small': dockedState('capybara-small') };
    expect(admission('capybara-small', states)).toBe(true);
    expect(admission('capybara-small', states, { expansion: 'capybara' })).toBe(false);
    expect(admission('capybara-small', states, { expansion: 'unknown' })).toBe(false);
    expect(admission('capybara-small', states, { capybaraEnabled: false })).toBe(false);
    expect(admission('capybara-small', states, { capybaraEnabled: 'false' })).toBe(false);
  });

  it('rejects a mixed Capybara mode in the core roster or small-ship state', () => {
    expect(admission('gorgoneion', { gorgoneion: dockedState('gorgoneion') }, {
      activeVesselIds: ['aegis', 'capybara'], expansion: 'base',
    })).toBe(false);
    expect(admission('gorgoneion', { gorgoneion: dockedState('gorgoneion') }, {
      activeVesselIds: ['aegis', 'capybara'], expansion: 'capybara', capybaraEnabled: false,
    })).toBe(false);
    expect(admission('gorgoneion', {
      gorgoneion: dockedState('gorgoneion'),
      'capybara-small': { ...dockedState('capybara-small') },
    }, { expansion: 'capybara' })).toBe(false);
  });

  it('allows other docked small ships when the session disables Capybara', () => {
    expect(admission('gorgoneion', { gorgoneion: dockedState('gorgoneion') }, {
      expansion: 'none', capybaraEnabled: false,
    })).toBe(true);
  });
});
