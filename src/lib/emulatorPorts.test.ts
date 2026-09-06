import { describe, expect, it } from 'vitest';
import { resolveEmulatorPorts } from './emulatorPorts';

describe('local emulator ports', () => {
  it('keeps the standard Firebase ports when no worktree overrides exist', () => {
    expect(resolveEmulatorPorts({})).toEqual({ auth: 9099, functions: 5001, firestore: 8080 });
  });

  it('accepts a complete worktree-specific client port set', () => {
    expect(resolveEmulatorPorts({
      VITE_FIREBASE_AUTH_EMULATOR_PORT: '9109',
      VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT: '5011',
      VITE_FIREBASE_FIRESTORE_EMULATOR_PORT: '8090',
    })).toEqual({ auth: 9109, functions: 5011, firestore: 8090 });
  });

  it('falls back safely when an override is not a valid TCP port', () => {
    expect(resolveEmulatorPorts({ VITE_FIREBASE_AUTH_EMULATOR_PORT: 'not-a-port' }).auth)
      .toBe(9099);
  });
});
