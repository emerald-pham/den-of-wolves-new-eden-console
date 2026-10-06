import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createContext, Script, SyntheticModule } from 'node:vm';
import { observeBasePostCombatActor } from './pc10-base-post-combat-actor-observation.mjs';

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

async function runSerializedObserver(callback, moduleUrl, actor) {
  const context = createContext({ input: moduleUrl, crypto: webcrypto, TextEncoder, Uint8Array });
  const exports = {
    '/src/store/useSessionStore.ts': ['useSessionStore', {
      getState: () => ({ session: { id: actor.sessionId }, me: actor.me,
        identityHydrationRevision: actor.identityHydrationRevision }),
    }],
    '/src/lib/firebase.ts': ['auth', () => ({ currentUser: { uid: actor.uid } })],
    '/src/lib/demoActorContext.ts': ['activeDemoActorProfile', actor.profile],
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

function mountedSurface({ exactActor = sourceActor(foreignUid, foreignRole) } = {}) {
  let sourceReadIndex = 0;
  return {
    storeModuleUrl: () => '/src/store/useSessionStore.ts',
    observe: async () => ({ ...originalGeneric }),
    page: { evaluate: (callback, moduleUrl) => {
      assert.equal(moduleUrl, '/src/store/useSessionStore.ts');
      // The established rich observer saw the original view. Before the exact
      // member callback, the store/Auth may have changed to another actor in
      // the same session. Each callback below is executed from its real source.
      const actor = sourceReadIndex++ === 0 ? sourceActor(originalUid, originalRole) : exactActor;
      return runSerializedObserver(callback, moduleUrl, actor);
    } },
  };
}

test('the serialized exact member read cannot join a foreign Auth/member pair from the same session', async () => {
  const actor = await observeBasePostCombatActor(mountedSurface());
  assert.equal(actor.sessionId, sessionId);
  assert.equal(actor.meSessionId, sessionId);
  assert.equal(actor.sameActor, false,
    'The mounted generic/rich original and the later exact foreign Auth/member observation are different actors.');
});

test('the public original-actor hold rejects any UID, document, session, role, generation or hydration drift', async () => {
  const source = await readFile(new URL('./pc10-base-gameplay-composed-post-combat.mjs', import.meta.url), 'utf8');
  const observer = await import('./pc10-base-post-combat-actor-observation.mjs');
  const hold = observer.assertBasePostCombatActorIdentity;
  assert.equal(typeof hold, 'function', 'Expose the strict identity comparator used by the mounted mission path.');

  const original = { hasAuth: true, sameActor: true, sessionId, meSessionId: sessionId,
    profileSessionId: sessionId, uidHash: originalUidHash, authUidHash: originalUidHash,
    memberUidHash: originalUidHash, memberDocumentIdHash: originalUidHash,
    profileRoleId: originalRole, playerRole: 'player', assignedRoleId: originalRole,
    activeConsoleRoleId: originalRole, fleetGroupId: 'fleet-1', connectionGeneration: 7,
    identityHydrationRevision: 3, connection: 'live', freshness: 'server' };
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
  assert.equal(holds.length, 4, 'Hold the same original actor before click, after receipt, before replay, and after replay.');
  const click = missionUi.indexOf('const response = await observeUiReceipt');
  const body = missionUi.indexOf('const body = await response.json()');
  const replay = missionUi.indexOf('const replay = await surface.callable');
  const replayResult = missionUi.indexOf("assert.equal(replay.status, 'committed')");
  assert.ok(holds[0] >= 0 && holds[0] < click);
  assert.ok(holds[1] > body && holds[1] < replay);
  assert.ok(holds[2] > body && holds[2] < replay);
  assert.ok(holds[3] > replayResult);
  assert.ok(missionUi.indexOf('const heldActor = readyAfter.actor') < holds[0],
    'The original role identity tuple must come from the source-eligible selected role observation.');
  assert.match(source, /assertWolfChoiceActor\(current, expectedActor\)/,
    'Each held check must retain the existing rich current-actor assertion.');
});
