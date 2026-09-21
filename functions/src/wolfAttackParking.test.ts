import { expect, it } from 'vitest';
import {
  WOLF_ATTACK_HOST_TIE_ORDER,
  nearestWolfAttackHost,
} from './wolfAttackParking';

it('selects the ship nearest to the craft authoritative local transit position', () => {
  expect(nearestWolfAttackHost({ x: 0, y: 0, z: 0 }, [
    { shipId: 'refinery-124', position: { x: 5, y: 0, z: 0 } },
    { shipId: 'dione', position: { x: 1, y: 0, z: 0 } },
    { shipId: 'aegis', position: { x: 2, y: 0, z: 0 } },
  ])).toEqual({
    shipId: 'dione',
    position: { x: 1, y: 0, z: 0 },
    distanceSquared: 1,
    tiedHostIds: ['dione'],
  });
});

it('resolves exact equal distances by one explicit canonical vessel order', () => {
  expect(WOLF_ATTACK_HOST_TIE_ORDER).toEqual([
    'aegis', 'dione', 'icebreaker', 'capybara', 'shepherd', 'quellon', 'refinery-124',
  ]);
  const candidates = [
    { shipId: 'refinery-124', position: { x: 0, y: -1, z: 0 } },
    { shipId: 'dione', position: { x: -1, y: 0, z: 0 } },
    { shipId: 'aegis', position: { x: 1, y: 0, z: 0 } },
  ] as const;
  expect(nearestWolfAttackHost({ x: 0, y: 0, z: 0 }, candidates)).toEqual({
    shipId: 'aegis',
    position: { x: 1, y: 0, z: 0 },
    distanceSquared: 1,
    tiedHostIds: ['aegis', 'dione', 'refinery-124'],
  });
  expect(nearestWolfAttackHost({ x: 0, y: 0, z: 0 }, [...candidates].reverse())).toEqual(
    nearestWolfAttackHost({ x: 0, y: 0, z: 0 }, candidates),
  );
});

it('applies the same order when only expansion and later core hosts are tied', () => {
  expect(nearestWolfAttackHost({ x: 0, y: 0, z: 0 }, [
    { shipId: 'shepherd', position: { x: 1, y: 0, z: 0 } },
    { shipId: 'capybara', position: { x: 0, y: 1, z: 0 } },
    { shipId: 'quellon', position: { x: 0, y: 0, z: 1 } },
  ])).toMatchObject({ shipId: 'capybara', tiedHostIds: ['capybara', 'shepherd', 'quellon'] });
});

it.each([
  ['no candidates', { x: 0, y: 0, z: 0 }, []],
  ['invalid craft position', { x: Number.NaN, y: 0, z: 0 }, [{ shipId: 'aegis', position: { x: 0, y: 0, z: 0 } }]],
  ['unknown host', { x: 0, y: 0, z: 0 }, [{ shipId: 'wolf-ship', position: { x: 1, y: 0, z: 0 } }]],
  ['invalid host position', { x: 0, y: 0, z: 0 }, [{ shipId: 'aegis', position: { x: Infinity, y: 0, z: 0 } }]],
  ['overflowing distance', { x: -1e308, y: 0, z: 0 }, [{ shipId: 'aegis', position: { x: 1e308, y: 0, z: 0 } }]],
  ['duplicate host', { x: 0, y: 0, z: 0 }, [
    { shipId: 'aegis', position: { x: 0, y: 0, z: 0 } },
    { shipId: 'aegis', position: { x: 1, y: 0, z: 0 } },
  ]],
] as const)('rejects %s rather than inventing a parking result', (_label, position, candidates) => {
  expect(() => nearestWolfAttackHost(position, candidates)).toThrow();
});
