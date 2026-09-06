#!/usr/bin/env node
import { readFile, rename, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EMULATOR_SLOT_COUNT,
  emulatorEnvironmentForSlot,
  emulatorPortsForSlot,
  firebaseConfigForSlot,
} from './emulator-slots.js';

const repositoryDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const localFirebaseConfigPath = resolve(repositoryDirectory, 'firebase.local.json');
const localEnvironmentPath = resolve(repositoryDirectory, '.env.emulators.local');

function usage() {
  return `usage: npm run emulators:configure -- <slot 0-${EMULATOR_SLOT_COUNT - 1}>`;
}

function parseSlot(args) {
  if (args.length !== 1 || !/^\d+$/.test(args[0] ?? '')) {
    throw new Error(usage());
  }

  const slot = Number(args[0]);
  if (!Number.isSafeInteger(slot) || slot < 0 || slot >= EMULATOR_SLOT_COUNT) {
    throw new Error(usage());
  }
  return slot;
}

function verifyPortIsFree(service, port) {
  return new Promise((resolvePromise, rejectPromise) => {
    const server = createServer();
    server.once('error', (error) => {
      rejectPromise(
        new Error(
          `Cannot claim ${service} port ${port}: ${error.message}. Choose another emulator slot.`,
        ),
      );
    });
    server.listen({ host: '127.0.0.1', port }, () => {
      server.close((error) => {
        if (error) rejectPromise(error);
        else resolvePromise();
      });
    });
  });
}

async function writeAtomically(path, content) {
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, content, 'utf8');
  await rename(temporaryPath, path);
}

async function main() {
  const slot = parseSlot(process.argv.slice(2));
  const ports = emulatorPortsForSlot(slot);
  await Promise.all(
    Object.entries(ports).map(([service, port]) => verifyPortIsFree(service, port)),
  );

  const baseConfig = JSON.parse(
    await readFile(resolve(repositoryDirectory, 'firebase.json'), 'utf8'),
  );
  const localConfig = firebaseConfigForSlot(baseConfig, slot);
  const environment = emulatorEnvironmentForSlot(slot);
  const environmentText = `${Object.entries(environment)
    .map(([name, value]) => `${name}=${value}`)
    .join('\n')}\n`;

  await Promise.all([
    writeAtomically(localFirebaseConfigPath, `${JSON.stringify(localConfig, null, 2)}\n`),
    writeAtomically(localEnvironmentPath, environmentText),
  ]);

  console.log(`Configured emulator slot ${slot}.`);
  console.log(`  Firebase: ${localFirebaseConfigPath}`);
  console.log(`  Vite:     ${localEnvironmentPath}`);
  console.log('Run npm run emulators, npm run dev:emulators, or npm run test:rules.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
