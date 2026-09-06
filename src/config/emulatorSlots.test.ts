import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EMULATOR_SLOT_COUNT,
  emulatorEnvironmentForSlot,
  emulatorPortsForSlot,
  firebaseConfigForSlot,
} from '../../scripts/emulator-slots.js';

describe('local emulator slots', () => {
  it('provides 15 complete, non-overlapping Firebase port sets', () => {
    expect(EMULATOR_SLOT_COUNT).toBe(15);
    expect(emulatorPortsForSlot(0)).toEqual({
      auth: 9099,
      functions: 5001,
      firestore: 8080,
      firestoreWebsocket: 9300,
      hosting: 5000,
      ui: 4000,
      hub: 4400,
      logging: 4600,
    });
    expect(emulatorPortsForSlot(14)).toEqual({
      auth: 9239,
      functions: 5141,
      firestore: 8220,
      firestoreWebsocket: 9440,
      hosting: 5140,
      ui: 4140,
      hub: 4540,
      logging: 4740,
    });
    const allocatedPorts = Array.from({ length: EMULATOR_SLOT_COUNT }, (_, slot) => [
      ...Object.values(emulatorPortsForSlot(slot)),
      Number(emulatorEnvironmentForSlot(slot).VITE_DEV_SERVER_PORT),
    ]).flat();
    expect(new Set(allocatedPorts)).toHaveLength(allocatedPorts.length);
    expect(() => emulatorPortsForSlot(15)).toThrow(/0 through 14/);
  });

  it('makes Firebase and Vite use the same selected slot', () => {
    const baseConfig = JSON.parse(
      readFileSync(resolve(process.cwd(), 'firebase.json'), 'utf8'),
    ) as Record<string, unknown>;
    const configured = firebaseConfigForSlot(baseConfig, 14) as {
      emulators: Record<string, { enabled?: boolean; port?: number; websocketPort?: number }>;
    };

    expect(configured.emulators).toMatchObject({
      auth: { port: 9239 },
      functions: { port: 5141 },
      firestore: { port: 8220, websocketPort: 9440 },
      hosting: { port: 5140 },
      ui: { enabled: true, port: 4140 },
      hub: { port: 4540 },
      logging: { port: 4740 },
    });
    expect(emulatorEnvironmentForSlot(14)).toEqual({
      VITE_USE_EMULATORS: '1',
      VITE_FIREBASE_AUTH_EMULATOR_PORT: '9239',
      VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT: '5141',
      VITE_FIREBASE_FIRESTORE_EMULATOR_PORT: '8220',
      VITE_DEV_SERVER_PORT: '5187',
    });
  });

  it('pins every service in the default config and exposes the isolated commands', () => {
    const firebaseConfig = JSON.parse(readFileSync('firebase.json', 'utf8')) as {
      emulators: Record<string, { enabled?: boolean; port?: number; websocketPort?: number }>;
    };
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    const viteConfig = readFileSync('vite.config.ts', 'utf8');

    expect(firebaseConfig.emulators).toMatchObject({
      auth: { port: 9099 },
      functions: { port: 5001 },
      firestore: { port: 8080, websocketPort: 9300 },
      hosting: { port: 5000 },
      ui: { enabled: true, port: 4000 },
      hub: { port: 4400 },
      logging: { port: 4600 },
    });
    expect(packageJson.scripts['emulators:configure']).toContain(
      'configure-emulator-slot.mjs',
    );
    expect(packageJson.scripts.emulators).toContain('run-emulator-command.mjs');
    expect(packageJson.scripts.emulators).toContain('npm run build --prefix functions');
    expect(packageJson.scripts['dev:emulators']).toContain('run-emulator-command.mjs');
    expect(packageJson.scripts['test:rules']).toContain('run-emulator-command.mjs');
    expect(viteConfig).toContain('VITE_DEV_SERVER_PORT');
    expect(viteConfig).toContain('strictPort: true');
  });
});
