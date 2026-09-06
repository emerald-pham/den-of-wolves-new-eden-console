#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

async function main() {
  const [mode, ...extraArguments] = process.argv.slice(2);
  const config = firebaseConfigPath();

  switch (mode) {
    case 'start':
      await run('npx', [
        '--yes',
        FIREBASE_TOOLS,
        'emulators:start',
        '--config',
        config,
        ...extraArguments,
      ]);
      return;
    case 'rules':
      if (extraArguments.length > 0) throw new Error('npm run test:rules does not accept arguments.');
      await run('npx', [
        '--yes',
        FIREBASE_TOOLS,
        'emulators:exec',
        '--config',
        config,
        '--project',
        RULES_PROJECT_ID,
        '--only',
        'firestore',
        'vitest run --project rules',
      ]);
      return;
    case 'functions':
      await run('npx', [
        '--yes',
        FIREBASE_TOOLS,
        'emulators:start',
        '--config',
        config,
        '--only',
        'functions,firestore',
        ...extraArguments,
      ]);
      return;
    case 'vite':
      if (!existsSync(localEnvironmentPath)) throw localSetupRequired();
      await run('npx', ['--no-install', 'vite', '--mode', 'emulators', ...extraArguments]);
      return;
    default:
      throw new Error('usage: run-emulator-command.mjs <start|rules|functions|vite>');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
