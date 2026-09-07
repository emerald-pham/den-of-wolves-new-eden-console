#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  emulatorPortsForSlot,
  emulatorSlotForConfig,
  firebaseConfigForSlot,
  vitePortForSlot,
} from './emulator-slots.js';
import {
  coordinationFilePath,
  releaseEmulatorSlot,
  reserveAvailableEmulatorSlot,
  reserveEmulatorSlot,
} from './emulator-resource-registry.mjs';

const repositoryDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const localFirebaseConfigPath = resolve(repositoryDirectory, 'firebase.local.json');
const localEnvironmentPath = resolve(repositoryDirectory, '.env.emulators.local');
const FIREBASE_TOOLS = 'firebase-tools@15.29.0';
const RULES_PROJECT_ID = 'dow-new-eden-rules-test';

function localSetupRequired() {
  return new Error(
    'No firebase.local.json exists for this worktree. Claim a free slot, then run ' +
      'npm run emulators:configure -- <slot>.',
  );
}

function firebaseConfigPath() {
  if (existsSync(localFirebaseConfigPath)) return localFirebaseConfigPath;
  if (process.env.CI) return resolve(repositoryDirectory, 'firebase.json');
  throw localSetupRequired();
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function configuredSlot(configPath) {
  return emulatorSlotForConfig(await readJson(configPath)) ?? 0;
}

function firebasePorts(slot) {
  return Object.values(emulatorPortsForSlot(slot));
}

function completeSlotPorts(slot) {
  return [...firebasePorts(slot), vitePortForSlot(slot)];
}

function run(command, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: repositoryDirectory,
      stdio: 'inherit',
    });
    child.once('error', rejectPromise);
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`${command} exited with ${signal ?? `code ${code ?? 1}`}.`));
    });
  });
}

async function runWithReservation({ slot, kind, command, ports, args }) {
  const filePath = coordinationFilePath();
  const reservation = await reserveEmulatorSlot({
    filePath,
    slot,
    worktree: repositoryDirectory,
    kind,
    command,
    ports,
  });

  try {
    await run('npx', args);
  } finally {
    await releaseEmulatorSlot(reservation, filePath);
  }
}

async function temporaryRulesConfig(slot) {
  const baseConfig = await readJson(resolve(repositoryDirectory, 'firebase.json'));
  const config = firebaseConfigForSlot(baseConfig, slot);
  const firestore = config.firestore && typeof config.firestore === 'object'
    ? config.firestore
    : {};
  config.firestore = {
    ...firestore,
    rules: resolve(repositoryDirectory, 'firestore.rules'),
    indexes: resolve(repositoryDirectory, 'firestore.indexes.json'),
  };

  const configPath = resolve(
    repositoryDirectory,
    '.firebase',
    `firebase.rules-test-${process.pid}-${randomUUID()}.json`,
  );
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return configPath;
}

async function runRules(configPath) {
  const preferredSlot = await configuredSlot(configPath);
  const filePath = coordinationFilePath();
  const reservation = await reserveAvailableEmulatorSlot({
    filePath,
    preferredSlot,
    worktree: repositoryDirectory,
    kind: 'rules',
    command: 'npm run test:rules',
    portsForSlot: completeSlotPorts,
  });

  let rulesConfigPath;
  try {
    rulesConfigPath = await temporaryRulesConfig(reservation.slot);
    await run('npx', [
      '--yes',
      FIREBASE_TOOLS,
      'emulators:exec',
      '--config',
      rulesConfigPath,
      '--project',
      RULES_PROJECT_ID,
      '--only',
      'firestore',
      'vitest run --project rules',
    ]);
  } finally {
    if (rulesConfigPath) await unlink(rulesConfigPath).catch(() => undefined);
    await releaseEmulatorSlot(reservation, filePath);
  }
}

async function main() {
  const [mode, ...extraArguments] = process.argv.slice(2);
  const config = firebaseConfigPath();
  const slot = await configuredSlot(config);

  switch (mode) {
    case 'start':
      await runWithReservation({
        slot,
        kind: 'emulators',
        command: 'npm run emulators',
        ports: firebasePorts(slot),
        args: [
          '--yes',
          FIREBASE_TOOLS,
          'emulators:start',
          '--config',
          config,
          ...extraArguments,
        ],
      });
      return;
    case 'rules':
      if (extraArguments.length > 0) throw new Error('npm run test:rules does not accept arguments.');
      await runRules(config);
      return;
    case 'functions':
      await runWithReservation({
        slot,
        kind: 'functions',
        command: 'npm run functions',
        ports: firebasePorts(slot),
        args: [
          '--yes',
          FIREBASE_TOOLS,
          'emulators:start',
          '--config',
          config,
          '--only',
          'functions,firestore',
          ...extraArguments,
        ],
      });
      return;
    case 'vite':
      if (!existsSync(localEnvironmentPath)) throw localSetupRequired();
      await runWithReservation({
        slot,
        kind: 'vite',
        command: 'npm run dev:emulators',
        ports: [vitePortForSlot(slot)],
        args: ['--no-install', 'vite', '--mode', 'emulators', ...extraArguments],
      });
      return;
    default:
      throw new Error('usage: run-emulator-command.mjs <start|rules|functions|vite>');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
