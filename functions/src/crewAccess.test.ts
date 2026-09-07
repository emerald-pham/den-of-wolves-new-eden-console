import { expect, it } from 'vitest';
import { canOperateRole } from './crewAccess';
it('keeps own console writable, and other AEGIS consoles read-only with a full crew', () => {
  const crew = ['admiral', 'executive-officer', 'wing-commander'];
  expect(canOperateRole('wing-commander', 'wing-commander', crew)).toBe(true);
  expect(canOperateRole('wing-commander', 'admiral', crew)).toBe(false);
  expect(canOperateRole('wing-commander', 'admiral', ['wing-commander'])).toBe(true);
});
it('derives the complement for a different ship and never grants another ship authority', () => {
  expect(canOperateRole('capybara-captain', 'capybara-recycler', ['capybara-captain'])).toBe(true);
  expect(canOperateRole('capybara-captain', 'capybara-recycler', ['capybara-captain', 'capybara-recycler'])).toBe(false);
  expect(canOperateRole('capybara-captain', 'admiral', [])).toBe(false);
  expect(canOperateRole(undefined, 'admiral', [])).toBe(false);
  expect(canOperateRole('made-up', 'made-up', [])).toBe(false);
});

it('uses the live configured complement when checking relief authority', () => {
  const configuredRoles = ['dione-captain', 'dione-engineer'];
  expect(canOperateRole(
    'dione-captain',
    'dione-engineer',
    ['dione-captain'],
    configuredRoles,
  )).toBe(true);
  expect(canOperateRole(
    'dione-captain',
    'dione-engineer',
    ['dione-captain', 'dione-engineer'],
    configuredRoles,
  )).toBe(false);
});
