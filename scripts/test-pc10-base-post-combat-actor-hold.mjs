import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createContext, Script, SyntheticModule } from 'node:vm';
import { assessLiveBaseAction } from './pc10-base-post-combat-choice-policy.mjs';
import { composeBasePostCombatActorObservation, observeBasePostCombatActor } from './pc10-base-post-combat-actor-observation.mjs';

const sessionId = 'native-private-session';
const originalUid = 'native-original-member';
const foreignUid = 'native-foreign-member';
const originalRole = 'shepherd-engineer';
const foreignRole = 'shepherd-captain';
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 16);
const originalUidHash = hash(originalUid);
const originalGeneric = {
  hasAuth: true, sameActor: true, uidHash: originalUidHash, sessionId,
  profileSessionId: sessionId, documentTimeOrigin: 12345, cycle: 2, phase: 'active',
  playerRole: 'player', profileRoleId: originalRole, assignedRoleId: originalRole,
  activeConsoleRoleId: originalRole, connection: 'live', freshness: 'server',
};

function sourceActor(uid, roleId, overrides = {}) {
  return {
    uid, roleId, sessionId,
    me: { uid, sessionId, role: 'player', assignedRoleId: roleId, activeConsoleRoleId: roleId,
      fleetGroupId: 'fleet-1', connectionGeneration: 7, connected: true, escapeState: null },
    identityHydrationRevision: 3,
    profile: { roleId, sessionId },
    ...overrides,
  };
}

async function runSerializedObserver(callback, moduleUrl, actorSource, { crypto: cryptoSource = webcrypto } = {}) {
  const getActor = typeof actorSource === 'function' ? actorSource : () => actorSource;
  const context = createContext({ input: moduleUrl, crypto: cryptoSource, TextEncoder, Uint8Array,
    performance: { timeOrigin: 12345 } });
  const exports = {
    '/src/store/useSessionStore.ts': ['useSessionStore', {
      getState: () => {
        const actor = getActor();
        return { session: { id: actor.sessionId }, me: actor.me,
          identityHydrationRevision: actor.identityHydrationRevision };
      },
    }],
    '/src/lib/firebase.ts': ['auth', () => ({ currentUser: { uid: getActor().uid } })],
    '/src/lib/demoActorContext.ts': ['activeDemoActorProfile', getActor().profile],
  };
  const modules = new Map();
  for (const [name, [key, value]] of Object.entries(exports)) {
    const module = new SyntheticModule([key], function () { this.setExport(key, value); }, { context });
    await module.link(() => assert.fail('The serialized observer has no static imports.'));
    await module.evaluate();
    modules.set(name, module);
  }
  const script = new Script(`(${callback.toString()})(input)`, {
    importModuleDynamically: async name => {
      assert.ok(modules.has(name), 'The observer may import only the mounted source modules.');
      return modules.get(name);
    },
  });
  return script.runInContext(context);
}

function mountedSurface({ exactActor = sourceActor(foreignUid, foreignRole), hashRace = false } = {}) {
  let sourceReadIndex = 0;
  let currentExactActor = exactActor;
  let changedDuringDigest = false;
  const racingCrypto = {
    subtle: {
      digest: async (...args) => {
        if (!changedDuringDigest) {
          changedDuringDigest = true;
          currentExactActor = sourceActor(foreignUid, foreignRole, {
            me: { ...exactActor.me, uid: foreignUid, role: 'player', assignedRoleId: foreignRole,
              activeConsoleRoleId: foreignRole, connected: false, escapeState: { status: 'locked' },
              connectionGeneration: 8 },
            identityHydrationRevision: 4,
            profile: { roleId: foreignRole, sessionId },
          });
        }
        return webcrypto.subtle.digest(...args);
      },
    },
  };
  return {
    storeModuleUrl: () => '/src/store/useSessionStore.ts',
    observe: async () => ({ ...originalGeneric }),
    currentExactActor: () => currentExactActor,
    changedDuringDigest: () => changedDuringDigest,
    page: { evaluate: (callback, moduleUrl) => {
      assert.equal(moduleUrl, '/src/store/useSessionStore.ts');
      // The established rich observer saw the original view. Before the exact
      // member callback, the store/Auth may have changed to another actor in
      // the same session. Each callback below is executed from its real source.
      const isRichRead = sourceReadIndex++ === 0;
      if (isRichRead) return runSerializedObserver(callback, moduleUrl, sourceActor(originalUid, originalRole));
      if (hashRace) return runSerializedObserver(callback, moduleUrl, () => currentExactActor,
        { crypto: racingCrypto });
      return runSerializedObserver(callback, moduleUrl, exactActor);
    } },
  };
}

test('the serialized exact member read cannot join a foreign Auth/member pair from the same session', async () => {
  const firestore = await readFile(new URL('../src/lib/firestore.ts', import.meta.url), 'utf8');
  assert.match(firestore, /onSnapshot\(doc\(database,\s*`sessions\/\$\{sessionId\}\/players\/\$\{uid\}`\)/,
    'The mounted member document key is the current UID under this session.');
  assert.match(firestore, /playerFrom\(sessionId,\s*uid,\s*snapshot\.data\(\)\)/,
    'The current store member retains the UID used for the mounted players document.');
  const actor = await observeBasePostCombatActor(mountedSurface());
  assert.equal(actor.sessionId, sessionId);
  assert.equal(actor.meSessionId, sessionId);
  assert.equal(actor.sameActor, false,
    'The mounted generic/rich original and the later exact foreign Auth/member observation are different actors.');
  const assessment = assessLiveBaseAction({ sessionId, expectedCycle: 2, shipId: 'shepherd', roleId: originalRole,
    expectedGroupId: 'fleet-1', sourceGm: { sessionId, uidHash: hash('native-gm'), instanceId: 'gm-instance',
      playerRole: 'gm', gmInstanceOwned: true, phase: 'active', cycle: 2, connection: 'live', freshness: 'server' },
    originalGm: { sessionId, uidHash: hash('native-gm'), instanceId: 'gm-instance', playerRole: 'gm' },
    currentSession: { sessionId, phase: 'active', currentTurn: 2, live: true,
      activeRoleIds: [originalRole], activeVesselIds: ['shepherd'] },
    ship: { shipId: 'shepherd', currentTurn: 2, damage: { destroyed: false, damagedSystemIds: [] } },
    originalActor: { roleId: originalRole, uidHash: originalUidHash }, currentActor: actor });
  assert.equal(assessment.status, 'pending');
  assert.ok(assessment.blockers.includes('original-actor-not-current-live-and-assigned'));
});

test('the serialized source join fails closed when a required identity field is missing', async () => {
  const missingGeneration = sourceActor(originalUid, originalRole);
  missingGeneration.me.connectionGeneration = undefined;
  const missingHydration = sourceActor(originalUid, originalRole, { identityHydrationRevision: undefined });
  const missingRole = sourceActor(originalUid, originalRole, { profile: { roleId: null, sessionId } });
  const missingFleet = sourceActor(originalUid, originalRole);
  missingFleet.me.fleetGroupId = undefined;
  const missingMemberUid = sourceActor(originalUid, originalRole);
  missingMemberUid.me.uid = undefined;
  for (const exactActor of [missingGeneration, missingHydration, missingRole, missingFleet, missingMemberUid]) {
    const actor = await observeBasePostCombatActor(mountedSurface({ exactActor }));
    assert.equal(actor.sameActor, false, 'Missing original identity evidence cannot compose into a live actor.');
  }
});

test('the serialized exact member read cannot publish its pre-digest Auth/store tuple after it changes during hashing', async () => {
  const surface = mountedSurface({ exactActor: sourceActor(originalUid, originalRole), hashRace: true });
  const actor = await observeBasePostCombatActor(surface);
  const current = surface.currentExactActor();
  assert.equal(surface.changedDuringDigest(), true, 'The source tuple changes while the real serialized callback awaits UID digests.');
  assert.equal(current.uid === foreignUid && current.me.uid === foreignUid, true,
    'The post-digest Auth/member source is a different current account.');
  assert.deepEqual({
    sameActor: actor.sameActor,
    connected: actor.connected,
    escapeLocked: actor.escapeLocked,
    connectionGeneration: actor.connectionGeneration,
    identityHydrationRevision: actor.identityHydrationRevision,
  }, {
    sameActor: false,
    connected: false,
    escapeLocked: true,
    connectionGeneration: current.me.connectionGeneration,
    identityHydrationRevision: current.identityHydrationRevision,
  }, 'The composed actor must fail closed and expose the current post-digest member tuple, not the stale pre-await snapshot.');
});

test('the exact source tuple can bind the original GM when source role fields are explicitly null', () => {
  const gm = { sessionId, uidHash: originalUidHash, hasAuth: true, sameActor: true,
    profileSessionId: null, profileRoleId: null, documentTimeOrigin: 12345,
    playerRole: 'gm', assignedRoleId: null,
    activeConsoleRoleId: null, phase: 'active', cycle: 2, connection: 'live', freshness: 'server' };
  const rich = { ...gm, fleetGroupId: null, connectionGeneration: 8, identityHydrationRevision: 4 };
  const exact = { sessionId, meSessionId: sessionId, sameActor: true, authUidHash: originalUidHash,
    memberUidHash: originalUidHash, memberDocumentIdHash: originalUidHash, profileSessionId: null,
    profileRoleId: null, documentTimeOrigin: 12345, playerRole: 'gm', assignedRoleId: null, activeConsoleRoleId: null,
    fleetGroupId: null, connectionGeneration: 8, identityHydrationRevision: 4,
    connected: true, escapeLocked: false };
  assert.equal(composeBasePostCombatActorObservation(gm, rich, exact).sameActor, true);
});

test('the public original-actor hold rejects any UID, document, session, role, generation or hydration drift', async () => {
  const source = await readFile(new URL('./pc10-base-gameplay-composed-post-combat.mjs', import.meta.url), 'utf8');
  const observer = await import('./pc10-base-post-combat-actor-observation.mjs');
  const hold = observer.assertBasePostCombatActorIdentity;
  assert.equal(typeof hold, 'function', 'Expose the strict identity comparator used by the mounted mission path.');

  const original = { hasAuth: true, sameActor: true, sessionId, meSessionId: sessionId,
    profileSessionId: sessionId, uidHash: originalUidHash, authUidHash: originalUidHash,
    memberUidHash: originalUidHash, memberDocumentIdHash: originalUidHash,
    documentTimeOrigin: 12345,
    profileRoleId: originalRole, playerRole: 'player', assignedRoleId: originalRole,
    activeConsoleRoleId: originalRole, fleetGroupId: 'fleet-1', connectionGeneration: 7,
    identityHydrationRevision: 3, connected: true, escapeLocked: false,
    connection: 'live', freshness: 'server' };
  assert.doesNotThrow(() => hold(original, original));
  for (const field of ['uidHash', 'authUidHash', 'memberUidHash', 'memberDocumentIdHash',
    'sessionId', 'meSessionId', 'profileSessionId', 'profileRoleId', 'playerRole',
    'assignedRoleId', 'activeConsoleRoleId', 'fleetGroupId', 'connectionGeneration',
    'identityHydrationRevision']) {
    assert.throws(() => hold({ ...original, [field]: field === 'connectionGeneration' ||
      field === 'identityHydrationRevision' ? original[field] + 1 : `changed-${field}` }, original), field);
  }
  for (const field of ['uidHash', 'memberDocumentIdHash', 'sessionId', 'profileRoleId',
    'connectionGeneration', 'identityHydrationRevision']) {
    const incomplete = { ...original }; delete incomplete[field];
    assert.throws(() => hold(incomplete, original), `Missing ${field} must fail closed.`);
  }

  const missionUiStart = source.indexOf('async function missionUi(');
  const missionUiEnd = source.indexOf('\n  const ships = [', missionUiStart);
  assert.ok(missionUiStart >= 0 && missionUiEnd > missionUiStart);
  const missionUi = source.slice(missionUiStart, missionUiEnd);
  const holds = [...missionUi.matchAll(/assertMissionActorHeld\(surface,\s*heldActor\)/g)]
    .map(match => match.index);
  assert.equal(holds.length, 5, 'Hold the same original actor at readiness, immediately before click, after receipt, before replay, and after replay.');
  const click = missionUi.indexOf('const response = await observeUiReceipt');
  const clickControl = missionUi.indexOf('return action()');
  const body = missionUi.indexOf('const body = await response.json()');
  const replay = missionUi.indexOf('const replay = await surface.callable');
  const replayResult = missionUi.indexOf("assert.equal(replay.status, 'committed')");
  assert.ok(holds[0] >= 0 && holds[0] < click);
  assert.ok(holds[1] > click && holds[1] < clickControl,
    'Reinspect the original actor inside the armed response flow immediately before the one UI click.');
  assert.ok(holds[2] > body && holds[2] < replay);
  assert.ok(holds[3] > body && holds[3] < replay);
  assert.ok(holds[4] > replayResult);
  assert.ok(missionUi.indexOf('heldActor = readyAfter.actor') < holds[0],
    'The original role identity tuple must come from the source-eligible selected role observation.');
  assert.equal((missionUi.match(/choose\(panel, async action =>/g) ?? []).length, 1,
    'Keep the same response observer and pass one guarded action callback.');
  assert.equal((missionUi.match(/surface\.callable\('commitAwayMissionLifecycleCommand'/g) ?? []).length, 1,
    'Keep exactly one exact SDK replay.');
  const choiceStart = source.indexOf("const result = await missionUi(roleId, mission.id");
  const choiceEnd = source.indexOf("if (delivered?.publicState.status === 'complete')", choiceStart);
  const choices = source.slice(choiceStart, choiceEnd);
  assert.equal((choices.match(/\.click\(\)/g) ?? []).length, 8, 'Keep all eight existing mounted UI choices.');
  assert.equal((choices.match(/commit\(\(\)\s*=>/g) ?? []).length, 8,
    'Reinspect the same actor immediately before each existing UI choice.');
  assert.match(source, /assertWolfChoiceActor\(current, expectedActor\)/,
    'Each held check must retain the existing rich current-actor assertion.');
});
