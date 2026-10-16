import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createP181StarlightNativeSurfaceFactory, P181_NORMAL_SETUP,
  runP181StarlightMovementScoutUiProof } from './pc10-starlight-movement-scout-ui-proof.mjs';

// These use the existing actual factory with inert Playwright ports. They do
// not authenticate, start a browser/server, reserve a slot or prove gameplay.
function controlledFactory(actorProfile) {
  const browsers = [], surfaces = [], routes = [];
  let providerLaunches = 0;
  const factory = createP181StarlightNativeSurfaceFactory({
    ...(actorProfile === undefined ? {} : { actorProfile }),
    chromium: { async launch(options) {
      providerLaunches++;
      assert.deepEqual(options, { channel: 'chrome', headless: true });
      let connected = true;
      return {
        isConnected: () => connected,
        async close() { connected = false; },
        async newContext() { return {
          async route(pattern, handler) { routes.push({ pattern, handler }); },
          async newPage() {
            const page = new EventEmitter();
            page.url = () => 'http://127.0.0.1:5178/';
            page.setDefaultTimeout = () => {};
            page.setDefaultNavigationTimeout = () => {};
            return page;
          },
        }; },
      };
    } },
    baseUrl: 'http://127.0.0.1:5178',
    ports: { auth: 9149, functions: 5051, firestore: 8130 },
    directory: '/tmp/controlled-wing-bay-source-only',
    browsers, surfaces, remoteRequests: [], pageErrors: [], calls: [], requests: [],
  });
  return { factory, browsers, surfaces, routes, providerLaunches: () => providerLaunches,
    async close() { await Promise.all(browsers.map(browser => browser.close())); } };
}

test('Wing bay source profile admits exactly the three declared original surfaces', async () => {
  const held = controlledFactory('wing-bays');
  try {
    for (const label of ['normal-gm', 'normal-wing-commander', 'normal-admiral'])
      await held.factory.launch(label);
    assert.deepEqual(held.surfaces.map(surface => surface.label),
      ['normal-gm', 'normal-wing-commander', 'normal-admiral']);
    assert.equal(held.browsers.length, 3);
    assert.equal(held.providerLaunches(), 3);
    assert.equal(held.routes.length, 3);
    await assert.rejects(held.factory.launch('normal-admiral'));
    assert.equal(held.providerLaunches(), 3);
  } finally { await held.close(); }
  assert.deepEqual(held.browsers.map(browser => browser.isConnected()), [false, false, false]);
});

test('Wing bay source profile refuses a duplicate before a second provider acquisition', async () => {
  const held = controlledFactory('wing-bays');
  try {
    await held.factory.launch('normal-gm');
    await assert.rejects(held.factory.launch('normal-gm'));
    assert.equal(held.providerLaunches(), 1);
    assert.equal(held.surfaces.length, 1);
  } finally { await held.close(); }
});

test('Wing bay source profile rejects an unknown profile rather than silently choosing the two-actor default', () => {
  assert.throws(() => controlledFactory('unreviewed-four-actor-profile'));
});

test('the original source profile refuses a duplicate label before a second provider acquisition', async () => {
  const held = controlledFactory();
  try {
    await held.factory.launch('normal-gm');
    await assert.rejects(held.factory.launch('normal-gm'));
    assert.equal(held.providerLaunches(), 1);
  } finally { await held.close(); }
});

test('the original default source profile still admits GM/Wing and rejects Admiral without acquiring it', async () => {
  const held = controlledFactory();
  try {
    await held.factory.launch('normal-gm');
    await held.factory.launch('normal-wing-commander');
    await assert.rejects(held.factory.launch('normal-admiral'));
    assert.equal(held.providerLaunches(), 2);
    assert.deepEqual(held.surfaces.map(surface => surface.label), ['normal-gm', 'normal-wing-commander']);
  } finally { await held.close(); }
});

test('Wing bay source profile refuses foreign labels without acquiring any provider resource', async () => {
  const held = controlledFactory('wing-bays');
  try {
    await assert.rejects(held.factory.launch('foreign-role'));
    assert.equal(held.providerLaunches(), 0);
    assert.equal(held.browsers.length, 0);
  } finally { await held.close(); }
});

function controlledWingBayProcedure({ rejectedAction, retireWingBeforeDelivery = false } = {}) {
  const trace = [], receipts = [];
  const member = (roleId, uidHash) => ({
    roleId, uidHash, sessionId: 'normal-session', meSessionId: 'normal-session',
    hasAuth: true, sameActor: true, playerRole: 'player', profileRoleId: null, profileSessionId: null,
    assignedRoleId: roleId, activeConsoleRoleId: roleId, seatId: roleId,
    connectionGeneration: 2, identityHydrationRevision: 3, documentTimeOrigin: 1_000,
    phase: 'active', cycle: 1, fullGameDemo: null, currentOwnPlayerConfirmed: true,
    sdkHasServerAuthority: true, sdkResumePending: false, connected: true, kicked: false,
    escapeLocked: false, invalidFields: [], connection: 'live', freshness: 'server',
    currentCanonicalSeatOwned: true, currentMemberBerthPresent: true, currentMemberBerthNull: false,
    currentMemberBerthMatches: true, memberScopeMatches: true, fleetGroupId: 'fleet-1', shipId: 'aegis',
  });
  const short = value => createHash('sha256').update(value).digest('hex').slice(0, 16);
  const wing = member('wing-commander', short('ordinary-wing')), admiral = member('admiral', short('ordinary-admiral'));
  const gm = { ...member(null, short('ordinary-gm')), playerRole: 'gm', roleId: 'gm',
    instanceId: 'original-gm-instance', gmInstanceOwned: true, recoveryPending: false };
  const initial = { sessionId: 'normal-session', phase: 'lobby', cycle: 0, setupConfirmed: true,
    playerCount: 8, chartId: 'A', activeRoleIds: [...P181_NORMAL_SETUP.roleIds], fullGameDemo: null };
  const started = { sessionId: 'normal-session', phase: 'active', cycle: 1,
    uidHash: gm.uidHash, instanceId: gm.instanceId, fullGameDemo: null };
  const capture = (endpoint, actor, data, result = { status: 'committed' }, httpStatus = 200) => ({
    endpoint, httpStatus, data: { sessionId: initial.sessionId, requestId: `ordinary-${receipts.length}`, ...data }, result,
    before: { ...actor, generation: actor.connectionGeneration, hydrationRevision: actor.identityHydrationRevision },
  });
  const snapshot = { sessionId: initial.sessionId, phase: 'active', cycle: 1,
    airspace: 'restricted', connection: 'live', freshness: 'server', materials: 5,
    maintenance: null, damagedSystemIds: [], constructionBayUpgraded: false,
    wings: ['alpha', 'bravo'].map(id => ({ id: `fighter-wing-${id}`, count: 4, revision: 0,
      capacity: 4, damaged: false, charged: false })),
    cards: ['alpha', 'bravo'].map(id => ({ id: `fighter-wing-${id}`, buildEnabled: false,
      capacity: '4 fighters // Construction Bay standard', strength: '4 fighters // revision 0',
      eligibility: 'Unavailable // current charge state is unavailable',
      guidance: 'Build unavailable // Construction Bay charge state unavailable. Next actor // AEGIS Admiral or Executive Officer uses the current maintenance cycle.' })),
  };
  const io = {
    async prepareNormalSession({ setup }) {
      assert.equal(setup, P181_NORMAL_SETUP); trace.push('ordinary-setup-two-member-admission-start');
      return { initial, started, gm, expectedWingCommander: wing, expectedAdmiral: admiral,
        roster: [wing, admiral].map(actor => ({ roleId: actor.roleId, uidHash: actor.uidHash, sessionId: initial.sessionId })),
        receipts: ['confirmSetup', 'assignRole', 'assignRole', 'startGame', 'clearTurnAdvanceInterstitial']
          .map((endpoint, index) => capture(endpoint, gm, { instanceId: gm.instanceId,
            ...(endpoint === 'assignRole' ? { roleId: index === 1 ? 'wing-commander' : 'admiral',
              targetUid: index === 1 ? 'ordinary-wing' : 'ordinary-admiral' } : {}),
          })),
      };
    },
    async observeWingBayActors() { return structuredClone({ gm, wing, admiral }); },
    async observeWingBayState({ stage }) {
      trace.push(`observe:${stage}`);
      if (stage === 'charged' && retireWingBeforeDelivery) wing.assignedRoleId = null;
      return structuredClone(snapshot);
    },
    async performWingBayMaintenanceAction({ action }) {
      trace.push(`maintenance:${action}`);
      const revision = snapshot.maintenance?.revision ?? 0;
      const rejected = action === rejectedAction;
      const value = capture('runMaintenance', admiral, { shipId: 'aegis', consoleRoleId: 'admiral', action,
        expectedRevision: revision }, rejected ? null : { status: 'committed', revision: revision + 1 }, rejected ? 403 : 200);
      receipts.push(value);
      if (!rejected) snapshot.maintenance = { turn: 1, step: revision + 1, revision: revision + 1,
        charges: action === 'reactor' ? ['fighter-bay-alpha', 'fighter-bay-bravo', 'construction-bay'] : [] };
      if (action === 'reactor' && !rejected) {
        snapshot.wings.forEach(wing => { wing.charged = true; });
        snapshot.cards.forEach(card => {
          card.eligibility = 'Eligible // bay charged and operational';
          card.guidance = 'Build unavailable // wing at capacity (4 fighters). Next actor // Wing Commander waits for space in this wing.';
        });
      }
      return value;
    },
    async cleanupOwnedResources({ firstError, deadlineAt }) {
      trace.push('owned-cleanup'); return { status: 'owned-cleanup-complete', firstErrorPresent: Boolean(firstError), deadlineAt };
    },
  };
  const deadlineAt = Date.now() + 5_000;
  return { trace, receipts, io, gm, wing, admiral,
    input: { initial: { ...initial, setupConfirmed: false, activeRoleIds: [] }, proofProfile: 'wing-bays',
      io, absoluteDeadlineMs: deadlineAt, cleanupDeadlineMs: deadlineAt + 1_000 } };
}

test('Wing bay finite procedure consumes three ordinary authorities and maintenance without repeating Starlight actions', async () => {
  const held = controlledWingBayProcedure();
  let result, failure;
  try { result = await runP181StarlightMovementScoutUiProof(held.input); }
  catch (error) { failure = error; }
  assert.equal(failure, undefined, 'The existing finite wrapper must dispatch the declared ordinary three-actor bay procedure.');
  assert.deepEqual(held.trace.filter(value => value.startsWith('maintenance:')),
    ['maintenance:begin', 'maintenance:storage', 'maintenance:rations', 'maintenance:unrest', 'maintenance:riot', 'maintenance:reactor']);
  assert.equal(result.proofProfile, 'wing-bays');
  assert.equal(result.actualAuthActorCount, 3);
  assert.equal(result.positiveFighterBuilds, 0);
  assert.equal(result.actualAcceptance, false);
  assert.equal(result.fixedCatalogClosures, 0);
  assert.equal(held.trace.at(-1), 'owned-cleanup');
  assert.equal(result.cleanup.deadlineAt, held.input.cleanupDeadlineMs);
});

test('Wing bay finite procedure stops on the original maintenance rejection and still owns cleanup', async () => {
  const held = controlledWingBayProcedure({ rejectedAction: 'storage' });
  await assert.rejects(runP181StarlightMovementScoutUiProof(held.input), /maintenance.*storage|storage.*maintenance/i);
  assert.deepEqual(held.trace.filter(value => value.startsWith('maintenance:')), ['maintenance:begin', 'maintenance:storage']);
  assert.equal(held.trace.at(-1), 'owned-cleanup');
});

test('Wing bay finite procedure withholds charged-card credit if original Wing authority retires during delivery', async () => {
  const held = controlledWingBayProcedure({ retireWingBeforeDelivery: true });
  await assert.rejects(runP181StarlightMovementScoutUiProof(held.input), /Wing|authority|station/i);
  assert.equal(held.trace.includes('observe:charged'), true);
  assert.equal(held.trace.at(-1), 'owned-cleanup');
});

// These preserve the already intended teardown contract before a lint-only
// control-flow refactor. They are regression controls, not invented REDs.
test('Wing bay finite teardown preserves the original maintenance failure when authority detachment also fails', async () => {
  const held = controlledWingBayProcedure({ rejectedAction: 'storage' });
  const detachError = new Error('controlled authority detach failure');
  let original, cleanupPrimary;
  held.io.beginPathAuthority = async () => { held.trace.push('retain-authority'); };
  held.io.checkPathAuthority = async () => {};
  held.io.pathAuthorityFailed = new Promise(() => {});
  held.io.finishPathAuthority = async () => { held.trace.push('detach-authority'); throw detachError; };
  const cleanup = held.io.cleanupOwnedResources;
  held.io.cleanupOwnedResources = async value => { cleanupPrimary = value.firstError; return cleanup(value); };
  await assert.rejects(runP181StarlightMovementScoutUiProof(held.input), error => {
    original = error;
    assert.notEqual(error, detachError);
    assert.match(error.message, /maintenance.*storage|storage.*maintenance/i);
    return true;
  });
  assert.equal(cleanupPrimary, original);
  assert.deepEqual(held.trace.filter(value => value.startsWith('maintenance:')), ['maintenance:begin', 'maintenance:storage']);
  assert.equal(held.trace.at(-2), 'detach-authority');
  assert.equal(held.trace.at(-1), 'owned-cleanup');
});

test('Wing bay finite teardown rejects successful gameplay when authority detachment fails and still cleans up', async () => {
  const held = controlledWingBayProcedure();
  const detachError = new Error('controlled authority detach failure');
  let cleanupPrimary;
  held.io.beginPathAuthority = async () => {};
  held.io.checkPathAuthority = async () => {};
  held.io.pathAuthorityFailed = new Promise(() => {});
  held.io.finishPathAuthority = async () => { held.trace.push('detach-authority'); throw detachError; };
  const cleanup = held.io.cleanupOwnedResources;
  held.io.cleanupOwnedResources = async value => { cleanupPrimary = value.firstError; return cleanup(value); };
  await assert.rejects(runP181StarlightMovementScoutUiProof(held.input), error => error === detachError);
  assert.equal(cleanupPrimary, detachError);
  assert.equal(held.trace.at(-2), 'detach-authority');
  assert.equal(held.trace.at(-1), 'owned-cleanup');
});
