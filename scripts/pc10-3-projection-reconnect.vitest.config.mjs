// Vitest project for the PC10.3 L2 projection-reconnect proofs. These tests run
// the real client listeners from src/lib against Auth, Firestore and Functions
// emulators, so they are kept out of the default unit/rules/functions projects.
// Run them through `node scripts/test-pc10-3-projection-reconnect.emulator.mjs`.
import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

const required = [
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_AUTH_EMULATOR_PORT',
  'VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT',
  'VITE_FIREBASE_FIRESTORE_EMULATOR_PORT',
];
for (const name of required) {
  if (!/^[\w-]+$/.test(process.env[name] ?? '')) {
    throw new Error(`${name} is required; run node scripts/test-pc10-3-projection-reconnect.emulator.mjs.`);
  }
}

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  test: {
    name: 'pc10-3-projection-reconnect',
    root: fileURLToPath(new URL('..', import.meta.url)),
    environment: 'node',
    include: ['tests/reconnect/**/*.emulator.test.ts'],
    fileParallelism: false,
    testTimeout: 90_000,
    hookTimeout: 90_000,
    env: {
      VITE_USE_EMULATORS: '1',
      ...Object.fromEntries(required.map((name) => [name, process.env[name]])),
    },
  },
});
