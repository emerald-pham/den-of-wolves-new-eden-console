import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const helpers = () => import('./pc10-candidate-proof-helpers.mjs');
const coreRoles = [
  'admiral', 'executive-officer', 'wing-commander',
  'dione-captain', 'dione-engineer', 'dione-president',
  'icebreaker-captain', 'icebreaker-engineer', 'icebreaker-miner',
  'shepherd-captain', 'shepherd-engineer', 'shepherd-scientist',
  'quellon-captain', 'quellon-engineer', 'quellon-explorer',
  'refinery-124-captain', 'refinery-124-engineer', 'refinery-124-pdf-colonel',
];
const coreShips = ['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'];
const options = { candidateCode: 'N', directory: '/tmp/pc10-new-candidate-attempt',
  sourceRoot: '/tmp/pc10-owned-candidate-source' };
function admission(count = 18, press = true) {
  const roles = count === 20 ? [...coreRoles, 'capybara-captain', 'capybara-recycler'] : coreRoles;
  const actor = { hasAuth: true, sameActor: true, sessionId: 'fresh-session', cycle: 0, phase: 'lobby',
    connection: 'live', freshness: 'server' };
  return { confirmed: { ...actor, activeRoleIds: roles,
    uidHash: 'gm-hash', instanceId: 'owned-gm',
    activeVesselIds: count === 20 ? [...coreShips, 'capybara'] : coreShips,
    setupConfirmed: true, pressEnabled: press, capybaraEnabled: count === 20 },
  gm: { ...actor, uidHash: 'gm-hash', playerRole: 'gm', gmInstanceOwned: true, instanceId: 'owned-gm' },
  controller: { ...actor, uidHash: 'controller-hash', playerRole: 'player', profileRoleId: 'controller' },
  roster: [...roles, ...(press ? ['press-officer'] : [])].map((roleId, index) => ({ roleId, uidHash: `actor-${index}` })) };
}

test('candidate configuration supports the complete 18 and 20 ordinary rosters with source-correct Capybara choices', async () => {
  const { candidateProofOptions } = await helpers();
  for (const candidateCode of ['N', 'O', 'P']) {
    const base = candidateProofOptions({ ...options, candidateCode });
    assert.equal(base.playerCount, 18); assert.equal(base.includePress, true);
    assert.equal(base.capybaraEnabled, false); assert.equal(base.gameplayOnly, true);
    assert.equal(base.chartId, candidateCode === 'P' ? 'B' : 'A');
    const expanded = candidateProofOptions({ ...options, candidateCode, playerCount: 20 });
    assert.equal(expanded.capybaraEnabled, true); assert.equal(expanded.playerCount, 20);
  }
});

test('invalid setup/runtime/evidence choices fail before any fresh runner is called', async () => {
  const { candidateProofOptions } = await helpers();
  for (const changed of [
    { candidateCode: 'X' }, { playerCount: 7 }, { playerCount: 21 }, { playerCount: '18' },
    { playerCount: 20, capybaraEnabled: false }, { playerCount: 18, capybaraEnabled: true },
    { includePress: 'true' }, { directory: undefined }, { directory: 'relative-attempt' },
    { directory: '/tmp/pc10-owned-candidate-source/committed-evidence' },
    { baseUrl: 'https://example.com' }, { projectId: 'dow-production' },
    { ports: { auth: 9119, functions: 9119, firestore: 8100 } },
    { expectedSourceCommit: 'short-sha' }, { expectedRuntimeIndexSha256: 'short-hash' },
  ]) assert.throws(() => candidateProofOptions({ ...options, ...changed }));
});

test('the old P11 callback remains explicit and uses genuine engineer fallback rather than inventing a captain', async () => {
  const { candidateProofOptions, candidateShipRole } = await helpers();
  const configuration = candidateProofOptions({ ...options, candidateCode: 'P', playerCount: 11 });
  assert.equal(configuration.playerCount, 11); assert.equal(configuration.capybaraEnabled, false);
  const roster = [{ roleId: 'icebreaker-engineer' }, { roleId: 'capybara-recycler' }];
  assert.equal(candidateShipRole(roster, 'icebreaker', 'captain'), 'icebreaker-engineer');
  assert.equal(candidateShipRole(roster, 'capybara', 'engineer'), 'capybara-recycler');
  assert.throws(() => candidateShipRole(roster, 'dione', 'engineer'), /admitted/);
});

test('evidence-directory reuse cannot overwrite a previous failure, screenshot, or plan', async () => {
  const { prepareCandidateEvidenceDirectory } = await helpers();
  const directory = await mkdtemp(join(tmpdir(), 'pc10-candidate-evidence-'));
  try {
    await writeFile(join(directory, 'failure.json'), 'retained actual failure');
    await assert.rejects(prepareCandidateEvidenceDirectory(directory, { status: 'planned' }), /empty|reuse|existing/);
    assert.equal(await readFile(join(directory, 'failure.json'), 'utf8'), 'retained actual failure');
  } finally { await rm(directory, { recursive: true }); }
});

test('a fresh evidence directory records a plan only and never manufactures current gameplay credit', async () => {
  const { prepareCandidateEvidenceDirectory } = await helpers();
  const parent = await mkdtemp(join(tmpdir(), 'pc10-candidate-plan-'));
  const directory = join(parent, 'new-attempt');
  try {
    await prepareCandidateEvidenceDirectory(directory, { candidateCode: 'O', sourceCommit: 'a'.repeat(40) });
    const plan = JSON.parse(await readFile(join(directory, 'candidate-harness-plan.json'), 'utf8'));
    assert.equal(plan.schemaVersion, 2); assert.equal(plan.status, 'planned');
    assert.equal(plan.wholeGameProof, false); assert.equal(plan.candidateEndingObserved, false);
    assert.equal(plan.actualBrowserProcesses, 0); assert.equal(plan.actualBrowserContexts, 0);
    assert.equal(plan.actualAuthenticatedActors, 0);
    assert.equal(plan.expectedBrowserProcesses, 2); assert.equal(plan.expectedBrowserContexts, 2);
    await assert.rejects(prepareCandidateEvidenceDirectory(directory, {}), /empty|reuse|existing/);
  } finally { await rm(parent, { recursive: true }); }
});

test('complete admission counts every distinct named role, Press, controller and live GM without counting humans', async () => {
  const { assertCandidateAdmission } = await helpers();
  for (const count of [18, 20]) for (const press of [true, false]) {
    const result = assertCandidateAdmission(admission(count, press), { playerCount: count, includePress: press,
      capybaraEnabled: count === 20 });
    assert.equal(result.actualAuthenticatedActors, count + Number(press) + 2);
    assert.equal(result.namedRoleAccounts, count + Number(press));
    assert.equal(result.actualBrowserProcesses, 2); assert.equal(result.actualBrowserContexts, 2);
    assert.equal(result.actualHumans, 0);
  }
});

test('a missing or foreign actor, stale GM instance, wrong role or changed confirmed roster earns no admission credit', async () => {
  const { assertCandidateAdmission } = await helpers();
  const valid = admission();
  for (const invalid of [
    { roster: valid.roster.slice(1) },
    { roster: valid.roster.map((actor, index) => index === 0 ? { ...actor, uidHash: valid.gm.uidHash } : actor) },
    { roster: valid.roster.map((actor, index) => index === 0 ? { ...actor, roleId: 'invented-role' } : actor) },
    { gm: { ...valid.gm, gmInstanceOwned: false } },
    { gm: { ...valid.gm, playerRole: 'player' } },
    { gm: { ...valid.gm, connection: 'connecting' } },
    { controller: { ...valid.controller, profileRoleId: 'admiral' } },
    { controller: { ...valid.controller, sessionId: 'foreign-session' } },
    { confirmed: { ...valid.confirmed, activeRoleIds: valid.confirmed.activeRoleIds.slice(1) } },
  ]) assert.throws(() => assertCandidateAdmission({ ...valid, ...invalid }, { playerCount: 18,
    includePress: true, capybaraEnabled: false }));
});

test('a hook cannot replace the GM account or owned instance after confirmed setup and retain admission credit', async () => {
  const { assertCandidateAdmission } = await helpers();
  const valid = admission();
  for (const changed of [{ uidHash: 'different-ordinary-gm' }, { instanceId: 'replacement-owned-instance' }]) {
    assert.throws(() => assertCandidateAdmission({ ...valid, gm: { ...valid.gm, ...changed } }, {
      playerCount: 18, includePress: true, capybaraEnabled: false }), /original|confirmed|same|equal/);
  }
});

test('candidate hooks await the canonical root setup API and bind the fully confirmed 20-role admission before start', async () => {
  const { candidateDriverOptions, candidateEndingFor, runNebulaEnding } = await import('./pc10-candidate-manual-ui-proof.mjs');
  const valid = admission(20), stages = [];
  const directory = await mkdtemp(join(tmpdir(), 'pc10-candidate-hooks-'));
  try {
    const configured = candidateDriverOptions({ ...options, directory, candidateCode: 'O', playerCount: 20,
      onSetup: async context => { await Promise.resolve(); assert.equal(context.initial.sessionId, valid.confirmed.sessionId); stages.push('setup'); },
      onBeforeStart: async context => { await Promise.resolve(); assert.equal(context.confirmed.activeRoleIds.length, 20); stages.push('before-start'); },
      onStarted: async context => { assert.equal(context.admission.actualAuthenticatedActors, 23);
        assert.equal(context.confirmed.activeVesselIds.length, 7); stages.push('started'); } });
    assert.equal(configured.gameplayOnly, true); assert.equal(configured.playerCount, 20);
    assert.equal(configured.includePress, true); assert.equal(configured.capybaraEnabled, true);
    assert.equal(candidateEndingFor('O'), runNebulaEnding);
    const context = { initial: { sessionId: valid.confirmed.sessionId }, directory,
      confirmed: valid.confirmed, prepared: { fullGameDemo: { status: 'preparing', progression: 'manual' } },
      gm: { observe: async () => valid.gm }, crew: { observe: async () => valid.controller }, roster: valid.roster };
    await configured.onSetup(context); await configured.onBeforeStart(context);
    const recorded = JSON.parse(await readFile(join(directory, 'candidate-admission.json'), 'utf8'));
    assert.equal(recorded.actualAuthenticatedActors, 23); assert.equal(recorded.status, 'in-progress');
    assert.equal(recorded.wholeGameProof, false);
    const current = { ...valid.gm, cycle: 1, phase: 'active', fullGameDemo: { status: 'active', progression: 'manual' },
      phaseProgression: 'manual', airspace: 'restricted', turnStatePhase: 'team',
      activeRoleIds: valid.confirmed.activeRoleIds, activeVesselIds: valid.confirmed.activeVesselIds };
    await configured.onStarted({ ...context, gm: { observe: async () => current }, started: current });
    assert.deepEqual(stages, ['setup', 'before-start', 'started']);
  } finally { await rm(directory, { recursive: true }); }
});

test('candidate CLI rejects a missing attempt directory and the previously mistyped directory variable before runtime I/O', () => {
  const { PC10_EVIDENCE_DIRECTORY: _directory, PC10_PROOF_DIR: _legacy, ...environment } = process.env;
  void _directory; void _legacy;
  for (const extra of [{}, { PC10_PROOF_DIR: '/tmp/retained-proof-directory' }]) {
    const result = spawnSync(process.execPath, ['scripts/pc10-candidate-manual-ui-proof.mjs'], {
      encoding: 'utf8', timeout: 10_000, env: { ...environment, ...extra } });
    assert.notEqual(result.status, 0); assert.equal(result.error, undefined);
    assert.match(result.stderr, /PC10_EVIDENCE_DIRECTORY/);
    assert.doesNotMatch(result.stderr, /fetch failed|ECONNREFUSED|top-level await/);
  }
});

test('candidate actions start only in the same genuine manual Team1 session and original live GM instance', async () => {
  const { assertFreshCandidateStart } = await helpers();
  const valid = admission();
  const current = { ...valid.gm, cycle: 1, phase: 'active', fullGameDemo: { status: 'active', progression: 'manual' },
    phaseProgression: 'manual', airspace: 'restricted', turnStatePhase: 'team',
    activeRoleIds: valid.confirmed.activeRoleIds, activeVesselIds: valid.confirmed.activeVesselIds };
  assert.doesNotThrow(() => assertFreshCandidateStart({ current, started: current, roster: valid.roster }));
  for (const changed of [
    { phase: 'debrief' }, { cycle: 2 }, { airspace: 'lifted' }, { phaseProgression: 'automatic' },
    { fullGameDemo: null }, { fullGameDemo: { status: 'active', progression: 'manual', seededScene: true } },
    { uidHash: 'replaced-gm' }, { instanceId: 'new-gm-instance' }, { gmInstanceOwned: false },
    { freshness: 'cache' }, { activeVesselIds: ['invented-vessel'] },
  ]) assert.throws(() => assertFreshCandidateStart({ current: { ...current, ...changed }, started: current,
    roster: valid.roster }));
});

test('maintenance receipt synchronization waits for both actual observers and the original crew actor', async () => {
  const { waitForMaintenanceReceipt } = await helpers();
  const cycle = { turn: 1, revision: 8 };
  const actor = { sameActor: true, sessionId: 'fresh-session', uidHash: 'original-engineer',
    profileRoleId: 'dione-engineer', activeConsoleRoleId: 'dione-engineer', connection: 'live', freshness: 'server' };
  let time = 0, waits = 0;
  const result = await waitForMaintenanceReceipt({ shipId: 'dione', cycle: 1, revision: 8, expectedActor: actor,
    inspectGm: async () => ({ live: true, sessionId: actor.sessionId, maintenanceCycles: { dione: cycle } }),
    inspectCrew: async () => ({ live: true, sessionId: actor.sessionId, maintenanceCycles: { dione: { ...cycle, revision: waits ? 8 : 7 } } }),
    inspectActor: async () => actor, now: () => time, wait: async () => { waits += 1; time += 1; } });
  assert.equal(waits, 1); assert.equal(result.revision, 8);
});

test('fresh global counters cannot release a stale crew ship projection before the next AEGIS bay action', async () => {
  const { waitForMaintenanceReceipt } = await helpers();
  const cycle = { turn: 2, revision: 12 };
  const actor = { sameActor: true, sessionId: 'fresh-session', uidHash: 'original-eo',
    profileRoleId: 'executive-officer', activeConsoleRoleId: 'executive-officer', connection: 'live', freshness: 'server' };
  let time = 0, waits = 0;
  const snapshot = revision => ({ live: true, sessionId: actor.sessionId, maintenanceCycles: { aegis: cycle },
    shipProjection: { shipId: 'aegis', currentTurn: 2, maintenanceCycle: { ...cycle, revision } } });
  await waitForMaintenanceReceipt({ shipId: 'aegis', cycle: 2, revision: 12, expectedActor: actor,
    inspectGm: async () => snapshot(12), inspectCrew: async () => snapshot(waits ? 12 : 11),
    inspectActor: async () => actor, now: () => time, wait: async () => { waits += 1; time += 1; } });
  assert.equal(waits, 1, 'Wait for the original crew’s actual per-ship projection, even if faster global counters match.');
});

test('fresh projections still wait for the rendered first AEGIS bay step and exact receipt result', async () => {
  const { waitForMaintenanceReceipt } = await helpers();
  const cycle = { turn: 2, revision: 12, step: 7, results: { '6': 'First bay committed.' } };
  const actor = { sameActor: true, sessionId: 'fresh-session', uidHash: 'original-eo',
    profileRoleId: 'executive-officer', activeConsoleRoleId: 'executive-officer', connection: 'live', freshness: 'server' };
  const snapshot = { live: true, sessionId: actor.sessionId,
    shipProjection: { shipId: 'aegis', currentTurn: 2, maintenanceCycle: cycle } };
  let time = 0, waits = 0;
  await waitForMaintenanceReceipt({ shipId: 'aegis', cycle: 2, revision: 12, expectedMaintenance: cycle, expectedActor: actor,
    inspectGm: async () => snapshot, inspectCrew: async () => snapshot, inspectActor: async () => actor,
    inspectRendered: async () => ({ currentStep: waits ? 7 : 6, results: waits ? ['First bay committed.'] : [] }),
    now: () => time, wait: async () => { waits += 1; time += 1; } });
  assert.equal(waits, 1, 'The actual next rendered step must be current before the second bay click.');
});

test('the unchanged final AEGIS bay step waits for its new receipt result instead of reusing the first bay render', async () => {
  const { waitForMaintenanceReceipt } = await helpers();
  const cycle = { turn: 2, revision: 13, step: 7, results: { '6': 'First bay committed.', '7': 'Final bay committed.' } };
  const actor = { sameActor: true, sessionId: 'fresh-session', uidHash: 'original-eo',
    profileRoleId: 'executive-officer', activeConsoleRoleId: 'executive-officer', connection: 'live', freshness: 'server' };
  const snapshot = { live: true, sessionId: actor.sessionId,
    shipProjection: { shipId: 'aegis', currentTurn: 2, maintenanceCycle: cycle } };
  let time = 0, waits = 0;
  await waitForMaintenanceReceipt({ shipId: 'aegis', cycle: 2, revision: 13, expectedMaintenance: cycle, expectedActor: actor,
    inspectGm: async () => snapshot, inspectCrew: async () => snapshot, inspectActor: async () => actor,
    inspectRendered: async () => ({ currentStep: 7, results: ['First bay committed.', ...(waits ? ['Final bay committed.'] : [])] }),
    now: () => time, wait: async () => { waits += 1; time += 1; } });
  assert.equal(waits, 1, 'Step seven alone is insufficient when its closure still belongs to the first bay receipt.');
});

test('completed maintenance requires the rendered idle sequence and current receipt explanation', async () => {
  const { waitForMaintenanceReceipt } = await helpers();
  const cycle = { turn: 2, revision: 14, step: 0, results: { '7': 'Maintenance cycle ended.' } };
  const actor = { sameActor: true, sessionId: 'fresh-session', uidHash: 'original-eo',
    profileRoleId: 'executive-officer', activeConsoleRoleId: 'executive-officer', connection: 'live', freshness: 'server' };
  const snapshot = { live: true, sessionId: actor.sessionId,
    shipProjection: { shipId: 'aegis', currentTurn: 2, maintenanceCycle: cycle } };
  let time = 0, waits = 0;
  await waitForMaintenanceReceipt({ shipId: 'aegis', cycle: 2, revision: 14, expectedMaintenance: cycle, expectedActor: actor,
    inspectGm: async () => snapshot, inspectCrew: async () => snapshot, inspectActor: async () => actor,
    inspectRendered: async () => ({ currentStep: waits ? null : 7, results: waits ? ['Maintenance cycle ended.'] : ['Final bay committed.'] }),
    now: () => time, wait: async () => { waits += 1; time += 1; } });
  assert.equal(waits, 1);
});

test('a normal six-step vessel reaches internal step7 through its enabled End control rather than an invented seventh printed row', async () => {
  const { waitForMaintenanceReceipt } = await helpers();
  const cycle = { turn: 2, revision: 12, step: 7, results: { '6': 'Shuttle bay committed.' } };
  const actor = { sameActor: true, sessionId: 'fresh-session', uidHash: 'original-dione-engineer',
    profileRoleId: 'dione-engineer', activeConsoleRoleId: 'dione-engineer', connection: 'live', freshness: 'server' };
  const snapshot = { live: true, sessionId: actor.sessionId,
    shipProjection: { shipId: 'dione', currentTurn: 2, maintenanceCycle: cycle } };
  let time = 0, waits = 0;
  await waitForMaintenanceReceipt({ shipId: 'dione', cycle: 2, revision: 12, expectedMaintenance: cycle, expectedActor: actor,
    inspectGm: async () => snapshot, inspectCrew: async () => snapshot, inspectActor: async () => actor,
    inspectRendered: async () => ({ currentStep: null, endEnabled: waits > 0, results: ['Shuttle bay committed.'] }),
    timeoutMs: 3, now: () => time, wait: async () => { waits += 1; time += 1; } });
  assert.equal(waits, 1, 'The displayed six-step vessel must paint its ready-to-end control before the actual end request.');
});

test('matching maintenance counters from a foreign crew or another cycle never enable the next paid action', async () => {
  const { waitForMaintenanceReceipt } = await helpers();
  const actor = { sameActor: true, sessionId: 'fresh-session', uidHash: 'original-engineer',
    profileRoleId: 'dione-engineer', activeConsoleRoleId: 'dione-engineer', connection: 'live', freshness: 'server' };
  for (const changed of [{ uidHash: 'foreign' }, { profileRoleId: 'admiral' }, { activeConsoleRoleId: null }]) {
    await assert.rejects(waitForMaintenanceReceipt({ shipId: 'dione', cycle: 1, revision: 8, expectedActor: actor,
      inspectGm: async () => ({ live: true, sessionId: actor.sessionId, maintenanceCycles: { dione: { turn: 1, revision: 8 } } }),
      inspectCrew: async () => ({ live: true, sessionId: actor.sessionId, maintenanceCycles: { dione: { turn: 1, revision: 8 } } }),
      inspectActor: async () => ({ ...actor, ...changed }) }));
  }
  let time = 0;
  await assert.rejects(waitForMaintenanceReceipt({ shipId: 'dione', cycle: 1, revision: 8, expectedActor: actor,
    inspectGm: async () => ({ live: true, sessionId: actor.sessionId, maintenanceCycles: { dione: { turn: 2, revision: 8 } } }),
    inspectCrew: async () => ({ live: true, sessionId: actor.sessionId, maintenanceCycles: { dione: { turn: 2, revision: 8 } } }),
    inspectActor: async () => actor, timeoutMs: 2, now: () => time, wait: async () => { time += 1; } }), /observe|synchron/);
});

test('Station contribution stops immediately at the real activation reply and preserves remaining vessel choices', async () => {
  const { contributeStationReactors } = await helpers();
  for (const ships of [coreShips, [...coreShips, 'capybara']]) {
    const called = [];
    const result = await contributeStationReactors({ shipIds: ships, contribute: async shipId => {
      called.push(shipId);
      return { type: 'candidate-action-result', status: 'committed', code: 'P', action: 'contribute-reactor',
        ...(called.length === 5 ? { outcome: 'activated' } : {}) };
    } });
    assert.equal(result.outcome, 'activated'); assert.deepEqual(called, ships.slice(0, 5));
  }
});

test('Station contribution requires actual activation and cannot accept a replay, stale reply or another path', async () => {
  const { contributeStationReactors } = await helpers();
  for (const reply of [
    { status: 'stale', code: 'P', action: 'contribute-reactor', outcome: 'activated' },
    { status: 'replayed', code: 'P', action: 'contribute-reactor', outcome: 'activated' },
    { status: 'committed', code: 'O', action: 'nebula-jump', outcome: 'reached' },
  ]) await assert.rejects(contributeStationReactors({ shipIds: ['aegis'], contribute: async () => reply }));
  await assert.rejects(contributeStationReactors({ shipIds: ['aegis'], contribute: async () => ({
    type: 'candidate-action-result', status: 'committed', code: 'P', action: 'contribute-reactor' }) }), /activation/);
});

test('proof evidence cannot relabel a seeded run, extra browser or human attendance through caller details', async () => {
  const { candidateEvidenceEnvelope } = await helpers();
  const result = candidateEvidenceEnvelope({ status: 'in-progress', choices: [], actualHumans: 20,
    actualBrowserProcesses: 20, adminGameplayWrites: true, callableFixtures: true,
    acceleratedClock: true, wholeGameProof: true, schemaVersion: 100 });
  assert.equal(result.schemaVersion, 2); assert.equal(result.actualHumans, 0);
  assert.equal(result.actualBrowserProcesses, 2); assert.equal(result.actualBrowserContexts, 2);
  assert.equal(result.adminGameplayWrites, false); assert.equal(result.callableFixtures, false);
  assert.equal(result.acceleratedClock, false); assert.equal(result.wholeGameProof, false);
});
