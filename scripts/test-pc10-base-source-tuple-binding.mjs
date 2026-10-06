import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createContext, Script, SyntheticModule } from 'node:vm';
import ts from 'typescript';
import { assertBasePostCombatActorIdentity, composeBasePostCombatActorObservation,
  observeBasePostCombatActor } from './pc10-base-post-combat-actor-observation.mjs';

const sessionId = 'native-source-session';
const uid = 'native-source-member';
const roleId = 'shepherd-engineer';
const storeUrl = '/src/store/useSessionStore.ts';
const timeOrigin = 12345;
const uidHash = value => createHash('sha256').update(value).digest('hex').slice(0, 16);

async function extractActualGenericObserverCallback() {
  const path = new URL('./pc10-full-game-demo-ui-proof.mjs', import.meta.url);
  const text = await readFile(path, 'utf8');
  const sourceFile = ts.createSourceFile(path.pathname, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let surface;
  function findSurface(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'surface') surface = node;
    ts.forEachChild(node, findSurface);
  }
  findSurface(sourceFile);
  assert.ok(surface, 'The mounted Full-game surface function must remain available for the public Base source join.');
  const observes = [];
  function findObserve(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'observe') observes.push(node);
    ts.forEachChild(node, findObserve);
  }
  findObserve(surface);
  assert.equal(observes.length, 1, 'Extract exactly the Full-game surface observer used by Base composition.');
  const callbacks = [];
  function findEvaluateCallback(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        node.expression.getText(sourceFile) === 'page.evaluate') callbacks.push(node.arguments[0]);
    ts.forEachChild(node, findEvaluateCallback);
  }
  findEvaluateCallback(observes[0]);
  assert.equal(callbacks.length, 1, 'Extract the actual browser callback from the Full-game surface observer.');
  assert.ok(ts.isArrowFunction(callbacks[0]));
  return callbacks[0].getText(sourceFile);
}

function sourceActor({ playerRole = 'player', profileRoleId = roleId, profileSessionId = sessionId,
  fleetGroupId = 'fleet-1', connectionGeneration = 7, identityHydrationRevision = 3 } = {}) {
  const actorUid = uid;
  const me = { uid: actorUid, sessionId, role: playerRole,
    assignedRoleId: playerRole === 'gm' ? null : roleId,
    activeConsoleRoleId: playerRole === 'gm' ? null : roleId,
    fleetGroupId: playerRole === 'gm' ? null : fleetGroupId,
    connectionGeneration, connected: true, escapeState: null,
    replacementRoleId: null, replacementStatus: null, seatId: playerRole === 'gm' ? null : 'seat-1' };
  const session = { id: sessionId, joinCode: 'native-join-code', currentTurn: 2, phase: 'active',
    turnStartAnnouncement: null,
    turnPhase: { progression: 'manual', airspace: { state: 'restricted' }, timerPause: null },
    turnState: { phase: 'coordination' }, fullGameDemo: { status: 'active' },
    setupConfirmed: true, setupRevision: 4, activeRoleIds: [playerRole === 'gm' ? 'gm' : roleId],
    activeVesselIds: ['shepherd'], pressEnabled: true, capybaraEnabled: true,
    gameOutcome: null, debriefSnapshot: null };
  return { uid: actorUid, session, me, connection: 'live', freshness: 'server',
    identityHydrationRevision, profile: { roleId: profileRoleId, sessionId: profileSessionId },
    gmInstance: playerRole === 'gm' ? { id: 'native-owned-gm-instance', uid: actorUid, sessionId } : null };
}

function currentStoreState(actor) {
  return { session: actor.session, me: actor.me,
    identityHydrationRevision: actor.identityHydrationRevision,
    connection: actor.connection, sessionSnapshotFreshness: actor.freshness,
    communicationError: null, gmInstance: actor.gmInstance,
    privateLoyalty: null, roleBrief: null, pendingCommands: [] };
}

async function runSerializedCallback(callbackText, actorSource, { crypto = webcrypto, origin = timeOrigin } = {}) {
  const getActor = typeof actorSource === 'function' ? actorSource : () => actorSource;
  const context = createContext({ input: storeUrl, crypto, TextEncoder, Uint8Array,
    performance: { timeOrigin: origin },
    document: { querySelector: () => null, querySelectorAll: () => [] } });
  const exports = {
    [storeUrl]: ['useSessionStore', { getState: () => currentStoreState(getActor()) }],
    '/src/lib/firebase.ts': ['auth', () => ({ currentUser: { uid: getActor().uid } })],
    '/src/lib/demoActorContext.ts': ['activeDemoActorProfile', getActor().profile],
  };
  const modules = new Map();
  for (const [name, [key, value]] of Object.entries(exports)) {
    const module = new SyntheticModule([key], function () { this.setExport(key, value); }, { context });
    await module.link(() => assert.fail('The mounted callback may use only its dynamic source imports.'));
    await module.evaluate();
    modules.set(name, module);
  }
  const script = new Script(`(${callbackText})(input)`, {
    importModuleDynamically: async name => {
      assert.ok(modules.has(name), 'The callback may import only the mounted source modules.');
      return modules.get(name);
    },
  });
  return script.runInContext(context);
}

function exactTuple(actor, origin = timeOrigin) {
  const digest = uidHash(actor.uid);
  return { hasAuth: true, sameActor: true, uidHash: digest, sessionId, meSessionId: sessionId,
    authUidHash: digest,
    memberUidHash: digest, memberDocumentIdHash: digest,
    profileRoleId: actor.profile.roleId, profileSessionId: actor.profile.sessionId,
    playerRole: actor.me.role, assignedRoleId: actor.me.assignedRoleId,
    activeConsoleRoleId: actor.me.activeConsoleRoleId, fleetGroupId: actor.me.fleetGroupId,
    connectionGeneration: actor.me.connectionGeneration,
    identityHydrationRevision: actor.identityHydrationRevision,
    connected: actor.me.connected, escapeLocked: actor.me.escapeState != null,
    connection: 'live', freshness: 'server',
    documentTimeOrigin: origin };
}

function mountedSurface(actor, { currentActor = actor, mutateOnDigest, genericOrigin = timeOrigin,
  exactOrigin = genericOrigin } = {}) {
  let current = currentActor;
  let changed = false;
  const racingCrypto = { subtle: { digest: async (...args) => {
    if (!changed && mutateOnDigest) { changed = true; current = mutateOnDigest(current); }
    return webcrypto.subtle.digest(...args);
  } } };
  const evaluations = [];
  return {
    evaluations,
    changedDuringDigest: () => changed,
    currentActor: () => current,
    storeModuleUrl: () => storeUrl,
    observe: async () => runSerializedCallback(await extractActualGenericObserverCallback(),
      () => current, { origin: genericOrigin }),
    page: { evaluate: async (callback, moduleUrl) => {
      assert.equal(moduleUrl, storeUrl);
      const exactRead = callback.toString().includes('memberDocumentIdHash');
      const value = await runSerializedCallback(callback.toString(), () => current,
        { crypto: exactRead ? racingCrypto : webcrypto, origin: exactRead ? exactOrigin : genericOrigin });
      evaluations.push({ exactRead, value });
      return value;
    } },
  };
}

test('the AST-extracted Full-game observer feeds the public Base composition with both source fields', async () => {
  const actor = sourceActor();
  const generic = await runSerializedCallback(await extractActualGenericObserverCallback(), actor);
  const exact = exactTuple(actor);
  const rich = { ...generic, fleetGroupId: actor.me.fleetGroupId,
    connectionGeneration: actor.me.connectionGeneration,
    identityHydrationRevision: actor.identityHydrationRevision };
  const composed = composeBasePostCombatActorObservation(generic, rich, exact);
  assert.deepEqual({
    profileSessionId: generic.profileSessionId ?? null,
    documentTimeOrigin: generic.documentTimeOrigin ?? null,
    composedSameActor: composed.sameActor,
  }, { profileSessionId: sessionId, documentTimeOrigin: timeOrigin, composedSameActor: true },
  'The actual serialized Full-game callback must supply its profile session and document origin to the public Base join.');
});

test('the exact serialized callback returns same-UID connection and hydration changes made during digest waits', async () => {
  const original = sourceActor();
  const surface = mountedSurface(original, { mutateOnDigest: current => ({
    ...current, me: { ...current.me, connected: false, escapeState: { status: 'locked' }, connectionGeneration: 8 },
    identityHydrationRevision: 4,
  }) });
  const composed = await observeBasePostCombatActor(surface);
  const exact = surface.evaluations.find(value => value.exactRead)?.value;
  assert.equal(surface.changedDuringDigest(), true);
  assert.deepEqual({
    sameActor: exact.sameActor,
    connected: exact.connected,
    escapeLocked: exact.escapeLocked,
    connectionGeneration: exact.connectionGeneration,
    identityHydrationRevision: exact.identityHydrationRevision,
    originalAuthHash: exact.authUidHash === uidHash(uid),
    originalMemberHash: exact.memberUidHash === uidHash(uid),
    documentTimeOrigin: exact.documentTimeOrigin,
    compositionBound: composed.sameActor,
  }, { sameActor: true, connected: false, escapeLocked: true, connectionGeneration: 8,
    identityHydrationRevision: 4, originalAuthHash: true, originalMemberHash: true,
    documentTimeOrigin: timeOrigin, compositionBound: false },
  'The post-digest tuple must be current, remain tied to the captured account, and fail the earlier rich-view join after generation drift.');
});

test('a stable source tuple remains bound through the actual generic, rich and exact callbacks', async () => {
  const actor = sourceActor();
  const observed = await observeBasePostCombatActor(mountedSurface(actor));
  assert.equal(observed.sameActor, true);
  assert.equal(observed.profileSessionId, sessionId);
  assert.equal(observed.documentTimeOrigin, timeOrigin);
  assert.doesNotThrow(() => assertBasePostCombatActorIdentity(observed, observed));
});

test('the original GM keeps valid nullable profile fields with source document identity', async () => {
  const actor = sourceActor({ playerRole: 'gm', profileRoleId: null, profileSessionId: null });
  const observed = await observeBasePostCombatActor(mountedSurface(actor));
  assert.equal(observed.sameActor, true);
  assert.equal(observed.profileRoleId, null);
  assert.equal(observed.profileSessionId, null);
  assert.equal(observed.documentTimeOrigin, timeOrigin);
  assert.doesNotThrow(() => assertBasePostCombatActorIdentity(observed, observed));
});

test('the public Base composition rejects an actor when every source view omits documentTimeOrigin', async () => {
  const actor = sourceActor();
  const generic = await runSerializedCallback(await extractActualGenericObserverCallback(), actor);
  const exact = exactTuple(actor);
  const rich = { ...generic, fleetGroupId: actor.me.fleetGroupId,
    connectionGeneration: actor.me.connectionGeneration,
    identityHydrationRevision: actor.identityHydrationRevision };
  delete generic.documentTimeOrigin;
  delete rich.documentTimeOrigin;
  delete exact.documentTimeOrigin;
  assert.equal(composeBasePostCombatActorObservation(generic, rich, exact).sameActor, false,
    'An actor without positive source document identity must remain unbound.');
});

test('the held Base mission identity requires documentTimeOrigin on both observations', async () => {
  const actor = await observeBasePostCombatActor(mountedSurface(sourceActor()));
  const originlessOriginal = { ...actor };
  const originlessCurrent = { ...actor };
  delete originlessOriginal.documentTimeOrigin;
  delete originlessCurrent.documentTimeOrigin;
  assert.throws(() => assertBasePostCombatActorIdentity(originlessCurrent, originlessOriginal),
    /documentTimeOrigin/, 'The held mission actor cannot waive its source document binding.');
});

test('missing, foreign or drifted source document origins fail the new Base identity binding', async () => {
  const actor = sourceActor();
  const missingOrigin = await observeBasePostCombatActor(mountedSurface(actor, { exactOrigin: null }));
  assert.equal(missingOrigin.sameActor, false,
    'The actual exact source callback cannot bind when its current document origin is missing.');
  const foreignOrigin = await observeBasePostCombatActor(mountedSurface(actor, { exactOrigin: timeOrigin + 1 }));
  assert.equal(foreignOrigin.sameActor, false,
    'The actual exact source callback cannot join a different document origin to the mounted generic view.');
  const held = await observeBasePostCombatActor(mountedSurface(actor));
  assert.throws(() => assertBasePostCombatActorIdentity(
    { ...held, documentTimeOrigin: timeOrigin + 1 }, held), /documentTimeOrigin/,
  'The actual held mission identity must reject document drift through receipt and replay.');

  const generic = await runSerializedCallback(await extractActualGenericObserverCallback(), actor);
  const exact = exactTuple(actor);
  const rich = { ...generic, fleetGroupId: actor.me.fleetGroupId,
    connectionGeneration: actor.me.connectionGeneration,
    identityHydrationRevision: actor.identityHydrationRevision };
  const completeGeneric = { ...generic, profileSessionId: sessionId, documentTimeOrigin: timeOrigin };
  const completeRich = { ...rich, profileSessionId: sessionId, documentTimeOrigin: timeOrigin };
  const completeExact = { ...exact, profileSessionId: sessionId, documentTimeOrigin: timeOrigin };
  assert.equal(composeBasePostCombatActorObservation(completeGeneric, completeRich,
    { ...completeExact, documentTimeOrigin: undefined }).sameActor, false,
  'A missing exact document origin cannot bind.');
  assert.equal(composeBasePostCombatActorObservation(completeGeneric,
    { ...completeRich, documentTimeOrigin: timeOrigin + 1 }, completeExact).sameActor, false,
  'A rich source from another document cannot bind.');
  const richWithoutOrigin = { ...completeRich };
  delete richWithoutOrigin.documentTimeOrigin;
  assert.equal(composeBasePostCombatActorObservation(completeGeneric, richWithoutOrigin, completeExact).sameActor, true,
    'An older rich view without this field may bind only when generic and exact current origins agree.');
});
