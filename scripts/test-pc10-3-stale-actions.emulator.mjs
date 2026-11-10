#!/usr/bin/env node
// PC10.3 T1 stale-action reconciliation proof (#102: T1.1 #250, T1.2 #251; P620).
//
// Ordinary Web SDK player clients race compiled production callables on this
// worktree's own Auth/Functions/Firestore emulator row:
//   - submitCivilUnrestGrievance: generic `stale-revision` error + live listener;
//   - transferShuttleCargoCommand: request-bound stale envelope + member read.
// Run with `node scripts/test-pc10-3-stale-actions.emulator.mjs` after
// `npm run emulators:configure -- auto`. Set PC10_3_STALE_EVIDENCE_PATH to also
// write the JSON evidence record outside the repository.
// Reusable helpers live in scripts/pc10-3-stale-action-proof.mjs (see its header).
// Evidence class: local emulator with local fixture actors; not deployed gameplay.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emulatorPortsForSlot, emulatorSlotForConfig, vitePortForSlot } from './emulator-slots.js';
import { runWithReservation } from './run-emulator-command.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const self = 'node scripts/test-pc10-3-stale-actions.emulator.mjs';
const project = 'demo-dow-pc10-3-stale-actions';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  execFileSync('npm', ['run', 'build', '--prefix', 'functions'], { cwd: repository, stdio: 'inherit' });
  const configPath = resolve(repository, 'firebase.local.json');
  const slot = emulatorSlotForConfig(JSON.parse(await readFile(configPath, 'utf8')));
  if (slot === undefined) throw new Error('Configure a recognized isolated emulator slot.');
  await runWithReservation({ slot, kind: 'pc10-3-stale-actions', command: self,
    ports: [...Object.values(emulatorPortsForSlot(slot)), vitePortForSlot(slot)],
    args: ['--yes', 'firebase-tools@15.29.0', 'emulators:exec', '--config', configPath,
      '--project', project, '--only', 'auth,functions,firestore', self] });
} else {
  process.chdir(repository);
  process.env.VITE_FIREBASE_PROJECT_ID = project;
  const {
    createStaleActionFixture, openCivilUnrestCrisis, openCoordinationPhase,
    proveGrievanceStaleRace, proveCargoStaleRace,
  } = await import('./pc10-3-stale-action-proof.mjs');
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim();
  // Eight printed seats: the Icebreaker Miner and the Shepherd/Icebreaker Union
  // engineer share the Icebreaker Civil Unrest team; the Quellon Explorer owns
  // the Hummingbird shuttle.
  const fixture = await createStaleActionFixture({
    sdkRoles: ['icebreaker-miner', 'joint-engineering-shepherd-icebreaker', 'quellon-explorer'],
  });
  const { f, clients } = fixture;
  let failure;
  const evidence = { sourceCommit, project, nodeVersion: process.version,
    evidenceClass: 'local emulator; compiled callables; Web SDK clients with local anonymous Auth',
    sessionId: f.sessionId, surfaces: [] };
  try {
    assert.equal(f.heartbeatFailures.length, 0);
    const crisis = await openCivilUnrestCrisis(f);
    evidence.surfaces.push(await proveGrievanceStaleRace({ f, crisis, shipId: 'icebreaker',
      first: clients['icebreaker-miner'], second: clients['joint-engineering-shepherd-icebreaker'] }));
    evidence.fixtureDisclosure = [await openCoordinationPhase(f)];
    evidence.surfaces.push(await proveCargoStaleRace({ f, shuttleId: 'hummingbird',
      owner: clients['quellon-explorer'], holder: clients['icebreaker-miner'] }));
    evidence.result = 'passed';
  } catch (error) {
    failure = error;
    evidence.result = 'failed';
    evidence.failure = String(error?.message ?? error);
  } finally {
    await fixture.cleanup().catch(error => { failure ??= error; });
  }
  console.log(JSON.stringify(evidence, null, 2));
  if (process.env.PC10_3_STALE_EVIDENCE_PATH) {
    await writeFile(process.env.PC10_3_STALE_EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
  }
  if (failure) throw failure;
  // Web SDK transports can keep the event loop alive after termination.
  process.exit(0);
}
