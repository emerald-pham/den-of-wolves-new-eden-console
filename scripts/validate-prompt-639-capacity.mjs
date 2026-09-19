#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const evidencePath = process.argv[2] ?? process.env.P639_EVIDENCE_PATH ?? '/tmp/p639-browser-capacity.json';
const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const results = evidence?.results;
const allowedPostRunPaths = new Set([
  'docs/CAPACITY_60_BROWSER_PROOF.md',
  'docs/IMPLEMENTATION_PLAN.md',
  'docs/IMPLEMENTATION_PROGRESS.md',
  'docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md',
  'docs/audits/p639-60-browser-capacity.json',
  'docs/implementation-prompts.json',
]);

assert.equal(evidence.prompt, '639', 'Evidence is not for Prompt 639.');
assert.equal(evidence.status, 'passed', 'The 60-browser exercise did not pass its thresholds.');
assert.equal(evidence.sourceTreeClean, true, 'The capacity command did not attest to a clean tracked source tree.');
let testedCommitIsAncestor = false;
try {
  execFileSync('git', ['merge-base', '--is-ancestor', evidence.testedSourceCommit, head]);
  testedCommitIsAncestor = true;
} catch { /* Assert below with a precise error. */ }
assert.equal(testedCommitIsAncestor, true, 'The tested source commit is not an ancestor of the checked-out commit.');
const postRunChanges = evidence.testedSourceCommit === head ? [] : execFileSync(
  'git',
  ['diff', '--name-only', `${evidence.testedSourceCommit}..${head}`],
  { encoding: 'utf8' },
).trim().split('\n').filter(Boolean);
assert.deepEqual(
  postRunChanges.filter((path) => !allowedPostRunPaths.has(path)),
  [],
  'Runtime, harness, thresholds, dependencies, or configuration changed after the measured commit.',
);
assert.equal(evidence.environment?.kind, 'isolated-local-firebase-emulator', 'The exercise was not isolated.');
assert.equal(evidence.environment?.isolation?.authCleared, true, 'The Auth Emulator was not reset before the run.');
assert.equal(evidence.environment?.isolation?.firestoreCleared, true, 'The Firestore Emulator was not reset before the run.');
assert.equal(evidence.environment?.isolation?.firestoreEmptyAfterReset, true, 'Firestore was not verified empty before the run.');
assert.ok(Number.isSafeInteger(evidence.environment?.isolation?.slot), 'No reserved emulator slot was recorded.');
assert.ok(evidence.environment?.isolation?.reservationAgeMs <= 600_000, 'The emulator reservation was not fresh at run start.');
assert.equal(evidence.environment?.isolation?.reservationOwnerAlive, true, 'The reservation owner was not live at run start.');
assert.equal(evidence.environment?.isolation?.emulatorChildAlive, true, 'The emulator process was not live at run start.');
for (const emulator of ['auth', 'functions', 'firestore']) {
  assert.ok(evidence.environment?.isolation?.hubEmulators?.some(({ name }) => name === emulator),
    `Firebase hub verification did not include ${emulator}.`);
}
assert.equal(evidence.scenario?.closureRun, true, 'Smoke evidence cannot close Prompt 639.');
assert.equal(evidence.scenario?.clientCount, 60, 'The exercise did not run 60 browser pages.');
assert.equal(evidence.scenario?.identityCount, 20, 'The exercise did not run 20 independent identities.');
assert.equal(evidence.scenario?.tabsPerIdentity, 3, 'The exercise did not run three tabs per identity.');
assert.ok(evidence.scenario?.durationMs >= 900_000, 'The exercise ran for less than 15 minutes.');
assert.equal(evidence.browser?.engine, 'chromium', 'The exercise did not use real Chromium pages.');
assert.equal(evidence.browser?.contexts, 20, 'The exercise did not isolate the 20 browser identities.');
assert.equal(evidence.browser?.pages, 60, 'The browser page count is incomplete.');
assert.ok(results?.heartbeat?.attempts > 0, 'No production-cadence heartbeat attempts were recorded.');
assert.ok(results?.heartbeat?.coverage >= evidence.thresholds.heartbeatCoverageMin, 'Heartbeat coverage is incomplete.');
assert.equal(
  results?.heartbeat?.window?.policy,
  'started-at-or-after-run-start-and-completed-at-or-before-run-end',
  'Heartbeat accounting was not restricted to the declared run window.',
);
assert.ok(results?.gmLeaseRenewals?.attempts >= 90, 'GM-instance lease-renewal coverage is incomplete.');
assert.equal(results?.gmLeaseRenewals?.errors, 0, 'GM-instance lease renewal failed.');
assert.equal(results?.listeners?.subscriptions, 120, 'The two-listener-per-page load is incomplete.');
assert.ok(results?.listeners?.deliveries > 0, 'No listener deliveries were recorded.');
assert.ok(results?.actions?.races >= evidence.thresholds.actionRacesMin, 'Concurrent action coverage is incomplete.');
assert.ok(results?.actions?.contentionCount >= results.actions.races, 'Contention receipts are incomplete.');
assert.equal(results?.reconnect?.restoredPages, 3, 'The three-page identity did not reconnect.');
assert.match(results?.transientNextCall?.unavailable?.injected?.code ?? '', /unavailable/i);
assert.match(results?.transientNextCall?.throttled?.injected?.code ?? '', /resource-exhausted/i);
assert.ok(results?.transientNextCall?.unavailable?.nextCallMs <= evidence.thresholds.transientNextCallMsMax);
assert.ok(results?.transientNextCall?.throttled?.nextCallMs <= evidence.thresholds.transientNextCallMsMax);
assert.ok(results?.usage?.browserCallableAttempts > 0, 'Browser callable usage is missing.');
assert.ok(results?.usage?.nodeCallableAttempts > 0, 'Coordinator callable usage is missing.');
assert.ok(results?.usage?.listenerDocumentDeliveries > 0, 'Listener usage is missing.');
assert.equal(results?.cost?.actualUsd, 0, 'Local emulator cost must remain explicit.');
assert.match(results?.cost?.basis ?? '', /Local Firebase Emulator/i);
assert.ok(Object.values(results?.thresholdResults ?? {}).every(Boolean), 'One or more capacity thresholds failed.');

const serialized = JSON.stringify(evidence);
for (const forbidden of ['sessionId', 'requestId', 'joinCode', 'targetUid', 'uid']) {
  assert.equal(serialized.includes(forbidden), false, `Capacity evidence contains forbidden identifier field ${forbidden}.`);
}

console.log(`P639 capacity evidence passed: ${results.heartbeat.attempts} heartbeats, ${results.listeners.deliveries} listener deliveries, ${results.actions.races} action races.`);
