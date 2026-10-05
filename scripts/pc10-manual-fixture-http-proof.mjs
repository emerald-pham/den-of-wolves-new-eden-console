import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createPc07AuthenticatedSession } from './pc07-authenticated-session.mjs';

const path = process.env.PC10_MANUAL_FIXTURE_EVIDENCE_PATH;
assert.ok(path, 'Use an external evidence path.');
assert.match(process.env.VITE_FIREBASE_PROJECT_ID ?? '', /^demo-[a-z0-9-]+$/);
const evidence = { type: 'pc10-fresh-manual-native-fixture',
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  runtimeIndexSha256: createHash('sha256').update(await readFile('functions/lib/index.js')).digest('hex'),
  actualAuthenticatedActors: 9, actualBrowserContexts: 0, humanDevices: 0,
  adminGameplayWrites: false, calls: [], checks: {} };
let fixture;
async function accepted(actor, name, data = {}) {
  const response = await fixture.call(actor, name, { sessionId: fixture.sessionId, ...data });
  evidence.calls.push({ name, status: response.status, resultStatus: response.result?.status ?? null });
  assert.equal(response.status, 200, `${name}: ${response.error?.status ?? 'failed'}`);
  return response.result;
}
try {
  fixture = await createPc07AuthenticatedSession('PC10 fresh manual fixture acceptance', 8, {
    keepAlive: true, fullGameManual: true, chartId: 'B', turnLimit: 8,
  });
  const before = await fixture.session.get();
  assert.deepEqual(before.get('fullGameDemo'), { status: 'active', progression: 'manual' });
  assert.equal(before.get('chartId'), 'B', 'Choose the normal chart at actual setup, without a later Admin patch.');
  assert.equal(before.get('turnLimit'), 8);
  assert.equal(before.get('currentTurn'), 1);
  assert.equal(before.get('turnPhase').progression, 'manual');
  assert.equal(before.get('turnPhase').airspace.state, 'restricted');
  const payload = { instanceId: fixture.instanceId, expectedTurn: 1, requestId: randomUUID() };
  const phase = await accepted(fixture.gm, 'advanceFullGameDemoPhase', payload);
  const replay = await accepted(fixture.gm, 'advanceFullGameDemoPhase', payload);
  assert.deepEqual(replay, { ...phase, status: 'replayed' });
  assert.equal((await fixture.session.get()).get('turnPhase').airspace.state, 'lifted');
  const ordinary = await fixture.call(fixture.players[0], 'advanceFullGameDemoPhase', {
    sessionId: fixture.sessionId, ...payload, requestId: randomUUID(),
  });
  assert.equal(ordinary.error?.status, 'PERMISSION_DENIED');
  const advance = { instanceId: fixture.instanceId, expectedTurn: 1, requestId: randomUUID() };
  const next = await accepted(fixture.gm, 'advanceTurn', advance);
  assert.equal((await fixture.session.get()).get('currentTurn'), 2);
  assert.deepEqual(await accepted(fixture.gm, 'advanceTurn', advance), next);
  assert.equal((await fixture.session.get()).get('turnPhase').progression, 'manual');
  evidence.checks = { ordinarySetupChartAndLimit: true, preparedBeforeOrdinaryAdmission: true,
    fullManualStart: true, genuineGmManualPhaseAndCycleAdvance: true,
    exactPhaseAndCycleRetryStable: true, ordinaryActorCannotAdvance: true };
  evidence.status = 'passed';
} catch (error) {
  evidence.status = 'failed'; evidence.message = error.message; process.exitCode = 1;
} finally {
  if (fixture) { await fixture.cleanup(); await fixture.db.terminate(); }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ status: evidence.status, path, checks: evidence.checks }));
}
