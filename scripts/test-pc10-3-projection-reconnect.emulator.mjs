#!/usr/bin/env node
// PC10.3 L2 (#243-#246): workflow projection reconnect proofs. The returning
// member is the app's own client stack (src/lib Auth, Functions and Firestore
// listeners) against Auth, Firestore and Functions emulators; other actors call
// the built callables over HTTP with Auth-emulator tokens. Initial session
// state is a local fixture; this is not deployed gameplay.
// Run with `node scripts/test-pc10-3-projection-reconnect.emulator.mjs` after
// `npm run emulators:configure -- auto`. Extra arguments go to Vitest.
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emulatorPortsForSlot, emulatorSlotForConfig, vitePortForSlot } from './emulator-slots.js';
import { runWithReservation } from './run-emulator-command.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectId = 'demo-dow-pc10-3-projections';
const configPath = resolve(repository, 'firebase.local.json');
const vitestArguments = process.argv.slice(2).filter((argument) => /^[\w./:=-]+$/.test(argument));
if (vitestArguments.length !== process.argv.length - 2) throw new Error('Unsupported Vitest argument.');

execFileSync('npm', ['run', 'build', '--prefix', 'functions'], { cwd: repository, stdio: 'inherit' });
const slot = emulatorSlotForConfig(JSON.parse(await readFile(configPath, 'utf8')));
if (slot === undefined) throw new Error('Configure a recognized isolated emulator slot.');
const ports = emulatorPortsForSlot(slot);
process.env.VITE_FIREBASE_PROJECT_ID = projectId;
process.env.VITE_FIREBASE_AUTH_EMULATOR_PORT = String(ports.auth);
process.env.VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT = String(ports.functions);
process.env.VITE_FIREBASE_FIRESTORE_EMULATOR_PORT = String(ports.firestore);
const command = ['npx', '--no-install', 'vitest', 'run', '--config',
  'scripts/pc10-3-projection-reconnect.vitest.config.mjs', ...vitestArguments].join(' ');
await runWithReservation({ slot, kind: 'pc10-3-projection-reconnect',
  command: 'node scripts/test-pc10-3-projection-reconnect.emulator.mjs',
  ports: [...Object.values(ports), vitePortForSlot(slot)],
  args: ['--yes', 'firebase-tools@15.29.0', 'emulators:exec', '--config', configPath, '--project', projectId,
    '--only', 'auth,firestore,functions', command] });
