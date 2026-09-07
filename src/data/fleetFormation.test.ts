import { describe, expect, it } from 'vitest';
import { FLEET_FORMATION, fleetOriginFor, fleetViewFrom } from './fleetFormation';

describe('the initial fleet formation', () => {
  it('locks seven ships into one loose 3D bubble around AEGIS', () => {
    expect(FLEET_FORMATION).toEqual({
      aegis: { x: 0, y: 0, z: 0 },
      dione: { x: -0.32, y: 0.18, z: 0.22 },
      icebreaker: { x: 0.26, y: -0.12, z: 0.28 },
      capybara: { x: -0.08, y: -0.31, z: 0.12 },
      shepherd: { x: 0.34, y: 0.24, z: -0.16 },
      quellon: { x: -0.28, y: -0.08, z: -0.26 },
      'refinery-124': { x: 0.09, y: 0.32, z: 0.31 },
    });
  });

  it('rebases every contact around the joined ship without changing formation', () => {
    const fromAegis = fleetViewFrom('aegis');
    const fromQuellon = fleetViewFrom('quellon');

    expect(fromAegis.map(({ id }) => id)).not.toContain('aegis');
    expect(fromQuellon.map(({ id }) => id)).not.toContain('quellon');
    expect(fromQuellon.find(({ id }) => id === 'aegis')).toMatchObject({
      x: 0.28, y: 0.08, z: 0.26,
    });
    expect(fromQuellon.find(({ id }) => id === 'dione')).toMatchObject({
      x: -0.04, y: 0.26, z: 0.48,
    });
  });

  it('exposes the selected ship origin for ship-relative DRADIS calculations', () => {
    expect(fleetOriginFor('aegis')).toEqual(FLEET_FORMATION.aegis);
    expect(fleetOriginFor('capybara')).toEqual(FLEET_FORMATION.capybara);
    expect(fleetOriginFor('missing-ship')).toEqual(FLEET_FORMATION.aegis);
  });

  it('renders Shepherd as a white DRADIS contact', () => {
    expect(fleetViewFrom('aegis').find(({ id }) => id === 'shepherd')).toMatchObject({
      color: 'var(--cic-dradis-white)',
    });
  });

  it('marks every fleet contact to suppress its range indicator independently of DRADIS coordinates', () => {
    const contacts = fleetViewFrom('aegis');

    expect(contacts.map(({ combatRange }) => combatRange)).toEqual(
      Array(contacts.length).fill('short'),
    );
    expect(contacts.map(({ showCombatRange }) => showCombatRange)).toEqual(
      Array(contacts.length).fill(false),
    );
    expect(contacts.find(({ id }) => id === 'dione')).toMatchObject({
      x: -0.32, y: 0.18, z: 0.22,
    });
  });

  it('removes Capybara from DRADIS when the GM disables it', () => {
    expect(fleetViewFrom('aegis', false).map(({ id }) => id)).not.toContain('capybara');
  });

  it('removes Dione from DRADIS when the GM disables it', () => {
    expect(fleetViewFrom('aegis', true, {}, false).map(({ id }) => id)).not.toContain('dione');
  });

  it('keeps DRADIS geometry fixed while hiding ships in other galactic systems', () => {
    const coordinates = {
      aegis: '0000',
      dione: '0000',
      icebreaker: '0042',
    };
    const originView = fleetViewFrom('aegis', true, coordinates);

    expect(originView.find((contact) => contact.id === 'dione')).toMatchObject({
      x: -0.32, y: 0.18, z: 0.22,
    });
    expect(originView.some((contact) => contact.id === 'icebreaker')).toBe(false);
    expect(fleetViewFrom('icebreaker', true, coordinates)).toHaveLength(0);
  });
});
