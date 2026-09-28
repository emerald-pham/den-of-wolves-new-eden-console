import { expect, it } from 'vitest';
import { captainRoleForShip, isShipInMutiny, mutinyAfterUnrestChange, resolveShipMutiny } from './mutiny';

it('routes every printed full-ship captain role, including the AEGIS Admiral', () => {
  expect(captainRoleForShip('aegis')).toBe('admiral');
  expect(captainRoleForShip('dione')).toBe('dione-captain');
  expect(captainRoleForShip('capybara')).toBe('capybara-captain');
  expect(captainRoleForShip('unknown')).toBeUndefined();
});

it('holds a ship at unrest 8 and preserves that lock after unrelated GM reduction', () => {
  const active = mutinyAfterUnrestChange(undefined, 7, 8, '2026-09-28T12:00:00.000Z');
  expect(active).toMatchObject({ status: 'active', revision: 1, triggerUnrest: 8 });
  expect(isShipInMutiny(active, 8)).toBe(true);
  expect(isShipInMutiny(active, 7)).toBe(true);
  expect(isShipInMutiny(undefined, 8)).toBe(true);
  expect(mutinyAfterUnrestChange(active, 8, 7, 'later')).toEqual(active);
  expect(mutinyAfterUnrestChange(undefined, 8, 7, 'legacy')).toMatchObject({
    status: 'active', revision: 1, triggerUnrest: 8,
  });
});

it('lets an explicit captain recovery record a chosen 1–3 reduction, then retriggers on later unrest gain', () => {
  const active = mutinyAfterUnrestChange(undefined, 7, 10, 'first');
  const resolved = resolveShipMutiny(active, 10, 1, 'old', 'new', 'recovery-1', 'second');
  expect(resolved.unrest).toBe(9);
  expect(resolved.mutiny).toMatchObject({ status: 'resolved', revision: 2,
    oldCaptainUid: 'old', newCaptainUid: 'new', reduction: 1 });
  expect(isShipInMutiny(resolved.mutiny, 9)).toBe(false);
  const retriggered = mutinyAfterUnrestChange(resolved.mutiny, 9, 10, 'third');
  expect(retriggered).toMatchObject({ status: 'active', revision: 3 });
  expect(isShipInMutiny(retriggered, 10)).toBe(true);
});

it('rejects automatic or malformed recovery and never treats an alert acknowledgement as recovery', () => {
  expect(() => resolveShipMutiny(undefined, 7, 2, 'old', 'new', 'req', 'now')).toThrow(/mutiny/);
  expect(() => resolveShipMutiny(undefined, 8, 0, 'old', 'new', 'req', 'now')).toThrow(/reduction/);
  expect(() => resolveShipMutiny(undefined, 8, 4, 'old', 'new', 'req', 'now')).toThrow(/reduction/);
  expect(() => resolveShipMutiny(undefined, 8, 2, 'same', 'same', 'req', 'now')).toThrow(/captain/);
});
