import { expect, it } from 'vitest';
import { isSessionRoute, restoreSessionRoute } from './sessionRoute';

it('restores an authenticated replacement workspace route', () => {
  expect(isSessionRoute('/replacement/doctor')).toBe(true);
  expect(restoreSessionRoute('/replacement/doctor')).toBe('/replacement/doctor');
});

it('does not treat a replacement-looking public path as authenticated', () => {
  expect(isSessionRoute('/replacement')).toBe(false);
  expect(restoreSessionRoute('/replacement')).toBe('/roles');
});
