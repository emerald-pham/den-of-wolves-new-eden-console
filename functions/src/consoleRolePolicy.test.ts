import { describe, expect, it } from 'vitest';
import { canSelectConsoleRole, disconnectedRoleState } from './consoleRolePolicy';

describe('canSelectConsoleRole', () => {
  it('lets a player take or resume one command role', () => {
    expect(canSelectConsoleRole(null, 'admiral', false, false)).toBe(true);
    expect(canSelectConsoleRole('admiral', 'admiral', false, false)).toBe(true);
  });

  it('requires a non-GM to release before changing command roles', () => {
    expect(canSelectConsoleRole('admiral', 'wing-commander', false, false)).toBe(false);
  });

  it('lets a GM move directly between command roles', () => {
    expect(canSelectConsoleRole('admiral', 'wing-commander', true, false)).toBe(true);
  });

  it('rejects a command role already held by another connected player', () => {
    expect(canSelectConsoleRole(null, 'admiral', false, true)).toBe(false);
    expect(canSelectConsoleRole(null, 'admiral', true, true)).toBe(false);
  });
});

describe('disconnectedRoleState', () => {
  it('returns a player to the unassigned role state', () => {
    expect(disconnectedRoleState()).toEqual({
      role: 'player',
      activeConsoleRoleId: null,
    });
  });
});
