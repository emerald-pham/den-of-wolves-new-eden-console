#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EMULATOR_SLOT_COUNT,
  emulatorEnvironmentForSlot,
  emulatorPortsForSlot,
  firebaseConfigForSlot,
  vitePortForSlot,
} from './emulator-slots.js';
import {
  coordinationFilePath,
  releaseConfiguredEmulatorSlot,
  reserveAvailableConfiguredEmulatorSlot,
} from './emulator-resource-registry.mjs';

const defaultRepositoryDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function usage() {
  return `usage: npm run emulators:configure -- <slot 0-${EMULATOR_SLOT_COUNT - 1}|auto>`;
}

function parseSlot(args) {
  if (args.length !== 1 || !/^\d+$/.test(args[0] ?? '')) {
    if (args.length === 1 && args[0] === 'auto') return undefined;
    throw new Error(usage());
  }

  const slot = Number(args[0]);
  if (!Number.isSafeInteger(slot) || slot < 0 || slot >= EMULATOR_SLOT_COUNT) {
    throw new Error(usage());
  }
  return slot;
}

async function writeAtomically(path, content) {
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, content, 'utf8');
  await rename(temporaryPath, path);
}

async function readOptional(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    throw error;
  }
}

/** Undo only the local files this run replaced and nobody has changed since. */
async function restoreLocalFiles(writes) {
  for (const { path, content, previous } of writes) {
    if ((await readOptional(path)) !== content) continue;
    if (previous === undefined) await unlink(path).catch((error) => { if (error?.code !== 'ENOENT') throw error; });
    else await writeAtomically(path, previous);
  }
}

/**
 * Reserve a complete row for this worktree and write its ignored local
 * configuration. `coordinationPath`, `portCheck` and `write` are seams for
 * isolated fixtures; the CLI uses the shared registry and real port checks.
 */
export async function configureEmulatorSlot({
  slot,
  repositoryDirectory = defaultRepositoryDirectory,
  coordinationPath = coordinationFilePath(),
  portCheck,
  write = writeAtomically,
} = {}) {
  const localFirebaseConfigPath = resolve(repositoryDirectory, 'firebase.local.json');
  const localEnvironmentPath = resolve(repositoryDirectory, '.env.emulators.local');
  const configuration = await reserveAvailableConfiguredEmulatorSlot({
    filePath: coordinationPath,
    preferredSlot: slot,
    worktree: repositoryDirectory,
    availableSlots: slot === undefined
      ? Array.from({ length: EMULATOR_SLOT_COUNT }, (_, candidate) => candidate)
      : [slot],
    portsForSlot: (candidate) => [
      ...Object.values(emulatorPortsForSlot(candidate)),
      vitePortForSlot(candidate),
    ],
    ...(portCheck ? { portCheck } : {}),
  });
  const selectedSlot = configuration.slot;
  const writes = [];

  try {
    const previous = new Map(await Promise.all(
      [localFirebaseConfigPath, localEnvironmentPath].map(async (path) => [path, await readOptional(path)]),
    ));
    const baseConfig = JSON.parse(
      await readFile(resolve(repositoryDirectory, 'firebase.json'), 'utf8'),
    );
    const localConfig = firebaseConfigForSlot(baseConfig, selectedSlot);
    const environment = emulatorEnvironmentForSlot(selectedSlot);
    const environmentText = `${Object.entries(environment)
      .map(([name, value]) => `${name}=${value}`)
      .join('\n')}\n`;

    writes.push(
      { path: localFirebaseConfigPath, content: `${JSON.stringify(localConfig, null, 2)}\n`, previous: previous.get(localFirebaseConfigPath) },
      { path: localEnvironmentPath, content: environmentText, previous: previous.get(localEnvironmentPath) },
    );
    // Settle every write before any restore so none lands after it.
    const results = await Promise.allSettled(writes.map(({ path, content }) => write(path, content)));
    const failure = results.find((result) => result.status === 'rejected');
    if (failure) throw failure.reason;
  } catch (error) {
    try {
      await restoreLocalFiles(writes);
    } finally {
      await releaseConfiguredEmulatorSlot(configuration, coordinationPath);
    }
    throw error;
  }

  return { configuration, localFirebaseConfigPath, localEnvironmentPath, coordinationPath };
}

async function main() {
  const slot = parseSlot(process.argv.slice(2));
  const { configuration, localFirebaseConfigPath, localEnvironmentPath, coordinationPath } =
    await configureEmulatorSlot({ slot });

  console.log(`Configured emulator slot ${configuration.slot}.`);
  console.log(`  Firebase: ${localFirebaseConfigPath}`);
  console.log(`  Vite:     ${localEnvironmentPath}`);
  console.log(`  Shared coordination: ${coordinationPath}`);
  console.log('Run npm run coordination:status to inspect local worktree ownership.');
  console.log('Run npm run emulators, npm run dev:emulators, or npm run test:rules.');
}

function invokedDirectly() {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
