import { describe, expect, it } from 'vitest';
import { FLEET_FORMATION, fleetViewFrom } from './fleetFormation';

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

  it('renders Shepherd as a white DRADIS contact', () => {
    expect(fleetViewFrom('aegis').find(({ id }) => id === 'shepherd')).toMatchObject({
      color: 'var(--cic-dradis-white)',
    });
  });

  it('removes Capybara from DRADIS when the GM disables it', () => {
    expect(fleetViewFrom('aegis', false).map(({ id }) => id)).not.toContain('capybara');
  });
});
