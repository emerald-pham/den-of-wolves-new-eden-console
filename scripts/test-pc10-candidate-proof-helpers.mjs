import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

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

/** Actual O callback and scout/candidate producers; only UI/provider ports are inert.
 * There is no Firebase client, emulator, browser or pre-seeded successful result. */
async function nebulaPermittedCalculationFixture({ incomplete = false, change } = {}) {
  const require = createRequire(import.meta.url);
  const { resolveCandidateAction, candidateWorkspace } = require('../functions/lib/candidatePaths.js');
  const { buildScoutResolutionPlan } = require('../functions/lib/scoutResolutionPlan.js');
  const ts = require('typescript');
  const compiled = async (file, dependencies = {}) => {
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8'), module = { exports: {} };
    runInNewContext(ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText, { module, exports: module.exports, structuredClone, window: { navigator: { onLine: true } },
      require: name => { assert.ok(Object.hasOwn(dependencies, name), `Only declared inert ports: ${name}`); return dependencies[name]; } });
    return module.exports;
  };
  const ships = ['aegis', 'shepherd', 'quellon', 'icebreaker', 'refinery-124'];
  const roleFor = { aegis: 'executive-officer', shepherd: 'shepherd-engineer', quellon: 'quellon-engineer',
    icebreaker: 'icebreaker-engineer', 'refinery-124': 'refinery-124-engineer' };
  const roster = Object.values(roleFor).map(roleId => ({ roleId }));
  const state = { sessionId: 'nebula-session', phase: 'active', cycle: 1, activeVesselIds: ships,
    organiserSites: { '0408': { code: 'O' } },
    shipFleetGroupIds: Object.fromEntries(ships.map(ship => [ship, ['icebreaker', 'refinery-124'].includes(ship) ? 'fleet-2' : 'fleet-1'])),
    shipResources: Object.fromEntries(ships.map(ship => [ship, { fuel: 40 }])),
    shipDamage: Object.fromEntries(ships.map(ship => [ship, { destroyed: false }])),
    shipSurvivors: Object.fromEntries(ships.map(ship => [ship, 100])) };
  const store = { session: { id: state.sessionId, currentTurn: 5, phase: 'active' },
    me: { uid: 'original-gm', sessionId: state.sessionId, role: 'gm', fleetGroupId: 'fleet-1',
      assignedRoleId: null, activeConsoleRoleId: null },
    gmInstance: { id: 'owned-instance', uid: 'original-gm', sessionId: state.sessionId, claimedAt: 'original-lease' },
    connection: 'live', sessionSnapshotFreshness: 'server' };
  const actor = { hasAuth: true, sameActor: true, uidHash: 'original-gm-hash', sessionId: state.sessionId,
    instanceId: 'owned-instance', gmInstanceOwned: true, playerRole: 'gm', connection: 'live', freshness: 'server',
    documentTimeOrigin: 1000 };
  const productionPhase = await compiled('src/lib/turnPhase.ts');
  const productionLifecycle = await compiled('functions/src/lifecycle.ts');
  const sdkAuthority = await compiled('src/lib/sessionSnapshotAuthority.ts', {
    './turnPhase': productionPhase, '../../functions/src/lifecycle': productionLifecycle,
  });
  const cursor = sdkAuthority.sessionSnapshotAuthorityFor(store.session.id, store.me.uid);
  assert.equal(sdkAuthority.acceptServerSessionAuthority(cursor, store.session, { seconds: 1, nanoseconds: 0 }), true);
  const storePort = { useSessionStore: { getState: () => store } };
  const mutation = await compiled('src/lib/sessionMutationAuthority.ts', {
    '@/store/useSessionStore': storePort, './sessionSnapshotAuthority': sdkAuthority,
  });
  let candidates = { revision: 0, sites: {} }, selectedShip, scoutCalls = 0, completeCalls = 0, forbiddenReads = 0;
  const marks = [], audits = [], paidResults = [], workspaceReads = [], evidence = [];
  const authority = (shipId, gm = false) => ({ sessionId: state.sessionId, cycle: state.cycle, phase: state.phase,
    coordination: true, now: '2026-10-13T07:00:00.000Z', groupId: 'fleet-1', vesselIds: ships,
    actor: { uid: gm ? store.me.uid : roleFor[shipId], gm, shipIds: gm ? ships : [shipId], research: false, shuttleIds: [] },
    discovered: [{ code: 'O', coordinate: '0408' }], research: {}, engineeringShuttles: [], hiddenScoutCount: marks.length,
    ships: Object.fromEntries(ships.map(ship => [ship, { fuel: state.shipResources[ship].fuel, materials: 0,
      destroyed: state.shipDamage[ship].destroyed, reactorCapacity: 3, jumpCharged: true, jumpDamaged: false,
      longJumpCost: 8, atCandidate: true, jumpedThisCycle: false, coordinate: '0408' }])) });
  const provider = async (_name, payload) => {
    workspaceReads.push({ ...payload });
    let report = { ...candidateWorkspace(authority(undefined, true), candidates), privateCalculations: structuredClone(audits) };
    if (change) report = change({ report, store, actor, cursor, sdkAuthority }) ?? report;
    return report;
  };
  const service = await compiled('src/lib/candidateService.ts', {
    'firebase/functions': { httpsCallable: (_unused, name) => async payload => ({ data: await provider(name, payload) }) },
    './firebase': { functions: () => ({ inertProvider: true }) },
    './sessionMutationAuthority': mutation, '@/store/useSessionStore': storePort,
  });
  const gm = { observe: async () => ({ ...actor }), page: {
    evaluate: async (callback, input) => runInNewContext(`(${String(callback).replace(/\bimport\s*\(/g, '__load(')})(__input)`, {
      __input: input, __load: async path => { assert.equal(path, '/src/lib/candidateService.ts'); return service; },
    }),
  } };
  const surface = { page: { getByRole: () => ({
    getByRole: () => ({ click: async () => {}, }), locator: () => ({ count: async () => 0 }),
  }), screenshot: async () => {} } };
  const tools = {
    begin: async () => state, state: async () => state,
    printedRationBudget: async () => Object.fromEntries(ships.map(ship => [ship, { food: 1, water: 1 }])),
    gmSupplies: async () => {}, gmRepair: async () => {}, maintenanceUi: async () => {},
    coordination: async () => {}, jump: async () => {},
    confirmPhysicalGroups: async () => {}, cycle: async cycle => { state.cycle = cycle; },
    select: async roleId => { selectedShip = Object.keys(roleFor).find(ship => roleFor[ship] === roleId); return roleId === 'gm' ? gm : surface; },
    candidateGeometry: async () => {}, record: async (stage, detail) => { evidence.push({ stage, ...detail }); },
    waitState: async (_description, predicate) => { assert.ok(predicate(state)); return state; },
    read: async () => { forbiddenReads++; throw Object.assign(new Error('Server-only deepNebulaScans client read denied.'), { code: 'permission-denied' }); },
    scout: async (roleId, craft, coordinate) => {
      const requestId = `scout-${++scoutCalls}`, shipId = craft === 'endeavour' ? 'shepherd' : 'quellon';
      const scan = { sourceId: craft, attempt: 1, range: 'unlimited', targetCoordinate: coordinate };
      const plan = buildScoutResolutionPlan({
        request: { type: 'scout-request', status: 'requested', resolution: 'pending', sessionId: state.sessionId,
          requestId, actorUid: roleId, entitlementId: craft, source: 'craft', ownerRoleId: roleId,
          anchorShipId: shipId, receivingShipId: shipId, cycle: state.cycle, targetCoordinate: coordinate, scan, createdAt: 'source-time' },
        cadence: { sessionId: state.sessionId, entitlementId: craft, cycle: state.cycle, scans: [{ requestId, actorUid: roleId, scan }] },
        session: { sessionId: state.sessionId, phase: 'active', chartId: 'A', chartSelectionLocked: true, currentCycle: state.cycle },
        facilitator: { type: 'automatic-server' }, fleetGroupId: 'fleet-1', recordedAt: '2026-10-13T07:00:00.000Z',
      });
      assert.equal(plan.result.systemFact.code, 'O'); assert.ok(plan.deepNebulaScan);
      if (!incomplete || scoutCalls !== 8) marks.push(plan.deepNebulaScan);
    },
    receipt: async (_surface, endpoint, click) => {
      assert.equal(endpoint, 'executeCandidateAction'); await click();
      const command = { sessionId: state.sessionId, requestId: `jump-${paidResults.length + 1}`, expectedRevision: candidates.revision,
        expectedGroupId: 'fleet-1', code: 'O', coordinate: '0408', action: 'nebula-jump', shipId: selectedShip };
      const plan = resolveCandidateAction(authority(selectedShip), candidates, command, 6);
      candidates = plan.state;
      for (const [ship, patch] of Object.entries(plan.shipPatches)) {
        state.shipResources[ship].fuel = patch.fuel;
        if (patch.destroyed) { state.shipDamage[ship].destroyed = true; state.shipSurvivors[ship] = 0; }
      }
      audits.push({ requestId: command.requestId, code: 'O', result: plan.reply.outcome, calculation: plan.calculation });
      paidResults.push(plan.reply);
      if (plan.groupOutcome) state.phase = 'debrief';
      return plan.reply;
    },
    complete: async code => { assert.equal(code, 'O'); assert.equal(state.phase, 'debrief'); completeCalls++; },
  };
  const proof = await import('./pc10-candidate-manual-ui-proof.mjs');
  const { candidateShipRole } = await helpers();
  // Run the actual exported consumer body, replacing its tool factory with
  // explicit UI ports. Producer/service source remains real; no native claim.
  const run = new Function('assert', 'candidateGameplayTools', 'candidateShipRole', 'readNebulaCandidateCalculation',
    `return (${proof.runNebulaEnding.toString()});`)(assert, () => tools, candidateShipRole, proof.readNebulaCandidateCalculation);
  const context = { gm, crew: surface, initial: { sessionId: state.sessionId }, started: { ...actor }, roster, directory: '/inert-evidence' };
  return { run: () => run(context), marks, paidResults, workspaceReads, evidence,
    counts: () => ({ scoutCalls, completeCalls, forbiddenReads }), store, actor };
}

test('actual O ending consumes eight source scout marks through permitted original GM calculation without a private collection read', async t => {
  const fixture = await nebulaPermittedCalculationFixture();
  try { await fixture.run(); }
  finally { t.diagnostic(JSON.stringify({ counts: fixture.counts(), sourceScoutMarks: fixture.marks.length,
    paidOutcomes: fixture.paidResults.map(reply => reply.outcome), permittedReads: fixture.workspaceReads.length })); }
  assert.deepEqual(fixture.counts(), { scoutCalls: 8, completeCalls: 1, forbiddenReads: 0 });
  assert.equal(fixture.marks.length, 8);
  assert.equal(fixture.workspaceReads.length, 4, 'Each paid survivor attempt must match its own calculation.');
  assert.ok(fixture.workspaceReads.every(read => read.sessionId === 'nebula-session' && read.expectedGroupId === 'fleet-1' && read.instanceId === 'owned-instance'));
  assert.deepEqual(fixture.paidResults.map(reply => reply.outcome), ['lost', 'reached', 'reached', 'reached', 'reached']);
});

for (const [label, change, message] of [
  ['incomplete qualifying scans', undefined, /eight|scout|modifier/i],
  ['missing matched private calculation', ({ report }) => ({ ...report, privateCalculations: [] }), /original|calculation|receipt/i],
  ['another request calculation', ({ report }) => ({ ...report, privateCalculations: report.privateCalculations.map(audit => ({ ...audit, requestId: 'foreign-request' })) }), /original|calculation|receipt/i],
  ['foreign group response', ({ report }) => ({ ...report, groupId: 'fleet-2' }), /verified|group|authority/i],
  ['GM role retired during reply', ({ store }) => { store.me.role = 'player'; }, /audience|authority|GM/i],
  ['original GM identity changed during reply', ({ actor }) => { actor.uidHash = 'other-gm'; }, /original|GM|authority/i],
  ['cache reply', ({ store }) => { store.connection = 'offline'; store.sessionSnapshotFreshness = 'cache'; }, /live|authority|reconnect/i],
]) {
  test(`actual O ending refuses ${label} instead of inventing scan or ending credit`, async () => {
    const fixture = await nebulaPermittedCalculationFixture({ incomplete: label === 'incomplete qualifying scans', change });
    await assert.rejects(fixture.run(), message);
    assert.equal(fixture.counts().forbiddenReads, 0, 'No diagnostic can weaken server-only scan privacy.');
    assert.equal(fixture.counts().completeCalls, 0);
    assert.ok(fixture.paidResults.length <= 2, 'Invalid first survivor evidence must stop all later paid choices.');
  });
}
