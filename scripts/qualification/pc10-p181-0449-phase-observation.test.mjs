import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { pc11MemberReadiness } from './pc11-normal-start-adapter.mjs';

const proofPath = fileURLToPath(new URL('../pc10-starlight-movement-scout-ui-proof.mjs', import.meta.url));
const proofSource = await readFile(proofPath, 'utf8');
const nativeEntry = proofSource.indexOf('export async function runP181StarlightMovementScoutNative(');
assert.ok(nativeEntry >= 0, 'Bind the actual P181 native consumer entry.');

function actualRegion(startText, endText) {
  const start = proofSource.indexOf(startText, nativeEntry);
  const end = proofSource.indexOf(endText, start);
  assert.ok(start > nativeEntry && end > start, `Bind actual P181 consumer source: ${startText}`);
  return proofSource.slice(start, end);
}

const boundedBody = actualRegion('  const bounded = async', '\n  let adminRequire');
const fullActorWaitBody = actualRegion('  const waitForFullActor = async', '\n  const readGmRecoveryPending');
const postClearStationWaitBody = actualRegion(
  "        station = await waitForFullActor(wingCommander, 'Original Wing Commander Cycle 1 station authority', value =>",
  '        const gmReady = await waitForGm(deadlineAt, { active: true });');
const timingStart = proofSource.indexOf('export const P181_NATIVE_TIMING = Object.freeze(');
const timingEnd = proofSource.indexOf('\n});', timingStart);
assert.ok(timingStart >= 0 && timingEnd > timingStart, 'Bind the committed original timing object.');
const nativeTiming = runInNewContext(`(() => { ${proofSource.slice(timingStart, timingEnd + 4).replace(/^export /, '')}
  return P181_NATIVE_TIMING;
})()`);

// Execute the actual bounded wait and actual post-clear caller predicate with
// inert source-shaped DTOs. No provider, browser, Auth, server or network is
// loaded or started, and the original finite operation timeout stays intact.
function actualPostClearStationWait(members) {
  let now = 10, reads = 0;
  const timers = new Set();
  const context = {
    assert, Promise, JSON, P181_NATIVE_TIMING: nativeTiming,
    Date: { now: () => now },
    sessionId: 'controlled-normal-session',
    admittedAuth: { uidHash: 'controlled-original-wing-hash' },
    P181_NORMAL_SETUP: { wingCommanderRoleId: 'wing-commander' },
    wingCommander: { controlled: true },
    setTimeout: callback => { const timer = { callback }; timers.add(timer); return timer; },
    clearTimeout: timer => timers.delete(timer),
    rememberProofFailure: () => {},
    pc11MemberReadiness,
    readFullActor: async () => {
      const member = members[Math.min(reads, members.length - 1)];
      reads++;
      return member;
    },
    delay: async milliseconds => { now += Math.max(1, milliseconds); },
  };
  const bounded = runInNewContext(`(() => { ${boundedBody}; return bounded; })()`, context);
  context.bounded = bounded;
  const waitForFullActor = runInNewContext(
    `(() => { ${fullActorWaitBody}; return waitForFullActor; })()`, context);
  context.waitForFullActor = waitForFullActor;
  const execute = runInNewContext(`async () => {
    let station;
    const deadlineAt = 1_000;
    ${postClearStationWaitBody}
    return station;
  }`, context);
  return { execute, reads: () => reads, timers };
}

function stationMember(phase, cycle, changes = {}) {
  return {
    hasAuth: true, sameActor: true, uidHash: 'controlled-original-wing-hash',
    sessionId: 'controlled-normal-session', meSessionId: 'controlled-normal-session',
    profileRoleId: null, profileSessionId: null, playerRole: 'player',
    connected: true, kicked: false, escapeLocked: false,
    replacementRoleId: null, replacementStatus: null, fullGameDemo: null,
    currentOwnPlayerConfirmed: true, connectionGeneration: 3,
    identityHydrationRevision: 3, connection: 'live', freshness: 'server',
    sdkHasServerAuthority: true, sdkResumePending: false, invalidFields: [],
    phase, cycle, setupConfirmed: true,
    assignedRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander',
    seatId: 'wing-commander', currentCanonicalSeatOwned: true,
    memberScopeMatches: true, ...changes,
  };
}

test('P181 post-clear source wait does not return a station-ready casting/Cycle 0 tuple', async () => {
  const stale = stationMember('casting', 0);
  const active = stationMember('active', 1);
  const consumer = actualPostClearStationWait([stale, active]);
  const preparedWing = await consumer.execute();

  assert.equal(preparedWing.phase, 'active',
    'After ordinary production start and briefing clear, wait for the original station to reach active/Cycle 1.');
  assert.equal(preparedWing.cycle, 1);
  assert.equal(consumer.reads(), 2, 'The actual source wait must continue past the first casting/Cycle 0 observation.');
  assert.equal(preparedWing, active);
});

test('P181 post-clear source wait does not return active/Cycle 1 while SDK resume is pending', async () => {
  const pending = stationMember('active', 1, { sdkResumePending: true });
  const settled = stationMember('active', 1);
  const consumer = actualPostClearStationWait([pending, settled]);
  const preparedWing = await consumer.execute();

  assert.equal(preparedWing.sdkResumePending, false,
    'The active station handoff waits until the original App SDK resume fence has settled.');
  assert.equal(preparedWing, settled);
  assert.equal(consumer.reads(), 2);
});

test('P181 post-clear phase wait preserves its original same-session live seat and server-authority gates', async () => {
  const active = stationMember('active', 1);
  const negativeControls = [
    ['foreign actor', { uidHash: 'controlled-foreign-wing-hash' }],
    ['foreign session', { sessionId: 'controlled-foreign-session', meSessionId: 'controlled-foreign-session' }],
    ['cached connection', { connection: 'cache', freshness: 'cache' }],
    ['missing server SDK authority', { sdkHasServerAuthority: false }],
    ['revoked member', { connected: false, kicked: true }],
    ['wrong role/console/seat', { assignedRoleId: 'admiral', activeConsoleRoleId: 'admiral', seatId: 'admiral' }],
    ['withdrawn canonical seat', { currentCanonicalSeatOwned: false }],
    ['foreign member scope', { memberScopeMatches: false }],
  ];

  for (const [label, change] of negativeControls) {
    const rejected = stationMember('active', 1, change);
    const consumer = actualPostClearStationWait([rejected, active]);
    const preparedWing = await consumer.execute();
    assert.equal(preparedWing, active, `${label} must not qualify as the post-clear original station.`);
    assert.equal(consumer.reads(), 2, `${label} must be rejected by the actual source readiness wait.`);
  }

  const positive = actualPostClearStationWait([active]);
  assert.equal(await positive.execute(), active, 'A settled original active/Cycle 1 station remains accepted.');
  assert.equal(positive.reads(), 1, 'The caller returns the accepted tuple without an extra baseline read.');
});
