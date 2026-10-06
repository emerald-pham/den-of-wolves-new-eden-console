import assert from 'node:assert/strict';
import test from 'node:test';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createFixtureHeartbeatController } from './fixture-heartbeats.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const now = 1_790_000_000_000;
const roles = ['admiral', 'executive-officer', 'wing-commander', 'dione-captain', 'dione-engineer',
  'dione-president', 'icebreaker-captain', 'icebreaker-engineer', 'icebreaker-miner',
  'shepherd-captain', 'shepherd-engineer', 'shepherd-scientist', 'quellon-captain',
  'quellon-engineer', 'quellon-explorer', 'refinery-124-captain', 'refinery-124-engineer',
  'refinery-124-pdf-colonel', 'capybara-captain', 'capybara-recycler'];
const originalSessionId = 'native-original-session';
const deferred = () => { let resolve; const promise = new Promise(value => { resolve = value; }); return { promise, resolve }; };

function fixtureTable(onExpiredSnapshot) {
  const actors = [{ roleId: 'gm', actor: { localId: 'native-original-gm' } },
    ...roles.map((roleId, index) => ({ roleId, actor: { localId: `native-original-core-${index}` } })),
    { roleId: 'press-officer', actor: { localId: 'native-original-press' } }];
  const source = new Map(actors.map(({ actor }) => [actor.localId,
    { uid: actor.localId, sessionId: originalSessionId, connected: true, lastSeenAt: now }]));
  const instance = { id: 'native-original-gm-instance', uid: actors[0].actor.localId,
    sessionId: originalSessionId, connected: true, lastSeenAt: now };
  const calls = [], offlineCalls = [];
  let snapshotCount = 0;
  const snapshot = (id, value) => {
    const data = { ...value };
    if (typeof data.lastSeenAt === 'number') { const milliseconds = data.lastSeenAt; data.lastSeenAt = { toMillis: () => milliseconds }; }
    return { id, exists: true, ref: { path: `sessions/${originalSessionId}/players/${id}` }, get: field => data[field] };
  };
  const fixture = {
    project: 'demo-native-natural-lease', config: { firestorePort: 18090 },
    sessionId: originalSessionId, instanceId: instance.id,
    gm: actors[0].actor, players: actors.slice(1, 21).map(value => value.actor),
    press: actors[21].actor, roles, heartbeatFailures: [],
    stopHeartbeats: async () => {}, restartHeartbeats: () => assert.fail('An incomplete natural proof cannot restart fixture timers.'),
    session: {
      get: async () => snapshot(originalSessionId, { phase: 'active', currentTurn: 1,
        turnPhase: { turn: 1, teamPhaseEndsAt: new Date(now + 300_000).toISOString(),
          openAirspaceEndsAt: new Date(now + 600_000).toISOString(),
          airspace: { state: 'restricted', tickerActive: true, pressAccess: false } } }),
      collection: name => ({ get: async () => {
        if (name === 'players') {
          snapshotCount += 1;
          if (snapshotCount === 3) onExpiredSnapshot({ source, instance, actors });
          return { docs: [...source].map(([uid, value]) => snapshot(uid, value)) };
        }
        assert.equal(name, 'gmInstances');
        return { docs: [snapshot(instance.id, instance)] };
      } }),
    },
    db: { getAll: () => assert.fail('No recovery or Admin write/read seam may run after this deliberately failed candidate.') },
  };
  const clients = new Map(actors.slice(1).map(({ roleId }) => [roleId, {
    observe: async () => ({ hasAuth: true, sameActor: true }),
    setOffline: async value => { assert.equal(value, true); offlineCalls.push(roleId); },
  }]));
  const table = { fixture, clients, command: async (roleId, name, payload) => {
    assert.equal(name, 'refreshPresence');
    const original = actors.find(actor => actor.roleId === roleId);
    assert.ok(original);
    if (roleId === 'gm') { assert.deepEqual(payload, { instanceId: instance.id }); instance.lastSeenAt = Date.now(); }
    else assert.deepEqual(payload, { activeConsoleRoleId: roleId });
    source.get(original.actor.localId).lastSeenAt = Date.now();
    calls.push({ roleId, name, payload });
    return { status: 200, result: { sessionId: originalSessionId } };
  } };
  return { table, source, instance, actors, calls, offlineCalls };
}

async function fullHelperFailure(t, name, change, expectedError, { pendingProducer = false } = {}) {
  const reportRoot = process.env.PC10_NATIVE_LEASE_REPORT_ROOT;
  assert.ok(reportRoot, 'Retain each native failure report in the separate RED/GREEN evidence directory.');
  const directory = join(reportRoot, name);
  await mkdir(directory, { recursive: true });
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now });
  const schedulerCalls = [];
  const schedulerBoundary = new Error('Native scheduler transport boundary reached without launching a process.');
  t.mock.method(childProcess, 'execFile', (...args) => {
    schedulerCalls.push(args.slice(0, 3));
    const callback = args.at(-1);
    assert.equal(typeof callback, 'function');
    callback(schedulerBoundary, '', '');
  });
  syncBuiltinESMExports();
  const item = fixtureTable(change);
  const waiting = deferred(), stopping = deferred(), producer = deferred();
  let controller;
  if (pendingProducer) {
    const timers = new Map();
    let id = 0;
    controller = createFixtureHeartbeatController({
      setInterval: callback => { const key = ++id; timers.set(key, callback); return key; },
      clearInterval: key => timers.delete(key),
      gmTick: async () => {
        await producer.promise;
        item.instance.lastSeenAt = Date.now();
        item.source.get(item.table.fixture.gm.localId).lastSeenAt = Date.now();
      }, playerTick: async () => {},
    });
    controller.start();
    [...timers.values()][0]();
    await Promise.resolve();
    item.table.fixture.stopHeartbeats = async () => { stopping.resolve(); await controller.stop(); };
  }
  let proof;
  try {
    const module = await import(`./pc10-natural-disconnect.mjs?native-lease=${name}`);
    proof = module.runPc10NaturalDisconnectAcceptance(item.table, {
      root, directory, restartHeartbeats: false, progress: () => waiting.resolve(),
    });
    const rejected = proof.catch(error => error);
    if (pendingProducer) {
      await stopping.promise;
      assert.equal(item.offlineCalls.length, 0, 'The original helper must await the existing producer drain before any browser disappears.');
      t.mock.timers.tick(250);
      producer.resolve();
    }
    await waiting.promise;
    assert.equal(item.calls.length, 22, 'Retain exactly the original22 planned renewals.');
    assert.equal(item.offlineCalls.length, 21, 'Use every original browser offline transport exactly once.');
    t.mock.timers.tick(45_750);
    const error = await rejected;
    if (expectedError === 'scheduler-boundary') assert.equal(error, schedulerBoundary);
    else if (expectedError instanceof Error) assert.equal(error, expectedError);
    else assert.match(error?.message ?? '', expectedError);
    const report = JSON.parse(await readFile(join(directory, 'natural-disconnect-failure.json'), 'utf8'));
    assert.equal(report.passed, false);
    assert.equal(report.leaseMs, 45_000);
    assert.equal(report.leaseWaitElapsedMs, 45_750);
    assert.equal(report.calls.length, 22);
    assert.equal(report.backgroundInvocations.length, 0);
    assert.equal(schedulerCalls.length, expectedError === 'scheduler-boundary' ? 1 : 0,
      'An unqualified original source candidate must never reach the scheduler.');
    assert.ok(report.leaseCandidates, 'Persist the actual post-wait lease tuples BEFORE the unchanged original failing assertion.');
    assert.equal(report.leaseCandidates.checkedAt, Date.now());
    assert.equal(report.leaseCandidates.players.length, 22);
    assert.equal(report.leaseCandidates.gmInstances.length, 1);
    for (const entry of report.leaseCandidates.players) {
      assert.equal(entry.sessionId, originalSessionId);
      assert.equal(entry.originalActorUid, entry.actorUid);
      assert.equal(entry.connected, true);
      assert.ok(item.source.has(entry.actorUid));
    }
    const gm = report.leaseCandidates.gmInstances[0];
    assert.equal(gm.instanceId, item.instance.id);
    assert.equal(gm.actorUid, item.table.fixture.gm.localId);
    assert.equal(gm.sessionId, originalSessionId);
    return { report, item };
  } finally {
    if (controller) await controller.stop();
    if (proof) await proof.catch(() => {});
    t.mock.timers.reset(); t.mock.restoreAll(); syncBuiltinESMExports();
  }
}

test('full helper retains a later committed original player lease without extending the45000ms rule', async t => {
  const { report } = await fullHelperFailure(t, 'later-player-commit', ({ source, actors }) => {
    source.get(actors[8].actor.localId).lastSeenAt = now + 800;
  }, /Every actor must actually age past the lease/);
  const entry = report.leaseCandidates.players.find(row => row.actorUid === 'native-original-core-7');
  assert.equal(entry.lastSeenAtMs, now + 800); assert.equal(entry.ageMs, 44_950);
  assert.equal(entry.lastSeenAtValidity, 'valid'); assert.equal(entry.agedPastLease, false);
});

test('full helper distinguishes an absent original player timestamp in the failed source packet', async t => {
  const { report } = await fullHelperFailure(t, 'missing-player-timestamp', ({ source, actors }) => {
    delete source.get(actors[1].actor.localId).lastSeenAt;
  }, /Every actor must actually age past the lease/);
  const entry = report.leaseCandidates.players.find(row => row.actorUid === 'native-original-core-0');
  assert.equal(entry.lastSeenAtValidity, 'missing'); assert.equal(entry.lastSeenAtMs, null);
  assert.equal(entry.ageMs, null); assert.equal(entry.agedPastLease, false);
});

test('full helper retains a non-finite original timestamp as invalid rather than a guessed age', async t => {
  const { report } = await fullHelperFailure(t, 'non-finite-player-timestamp', ({ source, actors }) => {
    source.get(actors[2].actor.localId).lastSeenAt = NaN;
  }, /Every actor must actually age past the lease/);
  const entry = report.leaseCandidates.players.find(row => row.actorUid === 'native-original-core-1');
  assert.equal(entry.lastSeenAtValidity, 'non-finite'); assert.equal(entry.lastSeenAtMs, null);
  assert.equal(entry.ageMs, null); assert.equal(entry.agedPastLease, false);
});

test('full helper records a future original source timestamp and keeps the old age denial', async t => {
  const { report } = await fullHelperFailure(t, 'future-player-timestamp', ({ source, actors }) => {
    source.get(actors[3].actor.localId).lastSeenAt = now + 50_000;
  }, /Every actor must actually age past the lease/);
  const entry = report.leaseCandidates.players.find(row => row.actorUid === 'native-original-core-2');
  assert.equal(entry.lastSeenAtValidity, 'valid'); assert.equal(entry.lastSeenAtMs, now + 50_000);
  assert.equal(entry.ageMs, -4_250); assert.equal(entry.agedPastLease, false);
});

test('full helper records unsupported timestamp data before preserving the original toMillis failure', async t => {
  const { report } = await fullHelperFailure(t, 'unsupported-player-timestamp', ({ source, actors }) => {
    source.get(actors[4].actor.localId).lastSeenAt = 'unparsed-stored-time';
  }, /toMillis.*not a function/);
  const entry = report.leaseCandidates.players.find(row => row.actorUid === 'native-original-core-3');
  assert.equal(entry.lastSeenAtValidity, 'unsupported-type'); assert.equal(entry.lastSeenAtMs, null);
  assert.equal(entry.ageMs, null); assert.equal(entry.agedPastLease, false);
});

test('full helper retains diagnostics while the original timestamp read error remains the primary error', async t => {
  const originalError = new TypeError('Original source timestamp read failed.');
  const { report } = await fullHelperFailure(t, 'throwing-player-timestamp', ({ source, actors }) => {
    source.get(actors[5].actor.localId).lastSeenAt = { toMillis: () => { throw originalError; } };
  }, originalError);
  const entry = report.leaseCandidates.players.find(row => row.actorUid === 'native-original-core-4');
  assert.equal(entry.lastSeenAtValidity, 'read-failed'); assert.equal(entry.lastSeenAtMs, null);
  assert.equal(entry.ageMs, null); assert.equal(entry.agedPastLease, false);
  assert.equal(report.failure, originalError.message);
});

test('full helper records the original GM instance lease before the unchanged GM age assertion fails', async t => {
  const { report } = await fullHelperFailure(t, 'later-gm-commit', ({ instance }) => {
    instance.lastSeenAt = now + 800;
  }, /same GM instance must also age past/);
  assert.ok(report.leaseCandidates.players.every(row => row.agedPastLease));
  const entry = report.leaseCandidates.gmInstances[0];
  assert.equal(entry.lastSeenAtValidity, 'valid'); assert.equal(entry.lastSeenAtMs, now + 800);
  assert.equal(entry.ageMs, 44_950); assert.equal(entry.agedPastLease, false);
});

test('full helper drains the existing pending fixture producer then reaches the unchanged scheduler only after all22 leases age', async t => {
  const { report } = await fullHelperFailure(t, 'drained-original-producer', () => {}, 'scheduler-boundary', { pendingProducer: true });
  assert.ok(report.leaseCandidates.players.every(row => row.agedPastLease));
  assert.ok(report.leaseCandidates.gmInstances.every(row => row.agedPastLease));
  assert.equal(report.leaseCandidates.gmInstances[0].ageMs, 45_750);
  assert.equal(report.leaseCandidates.players.find(row => row.actorUid === 'native-original-gm').ageMs, 45_750);
});
