import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { createMemberNavigationResumeObserver } from '../pc10-member-navigation-resume.mjs';
import { observeFullGameDemoPresentationMember } from '../pc10-full-game-demo-proof-helpers.mjs';
import { observeLifecycleActor, captureLifecycleUiAction, publicLifecycleReceipt, openLifecycleSettings, closeLifecycleSettings } from '../pc10-member-gm-lifecycle-ui-proof.mjs';
import { observeUiReceipt, attachUiReceiptDiagnostics } from '../pc10-browser-ui-receipt.mjs';
import { originalProofError, retainProofFailure } from '../pc10-proof-failure-evidence.mjs';
import * as adapter from './pc11-normal-start-adapter.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname);
const require = createRequire(`${root}/package.json`);
const ts = require('typescript');
const hash = uid => createHash('sha256').update(uid).digest('hex').slice(0, 16);
const sid = 'normal-proof', uid = 'original-engineer', roleId = 'dione-engineer';
const sourceModules = new Map();
function pureSourceModule(file) {
  const path = resolve(root, file);
  if (sourceModules.has(path)) return sourceModules.get(path);
  const source = readFileSync(path, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {}; sourceModules.set(path, exports);
  runInNewContext(output, { exports, Date, Map, Set, JSON, Number, Object, Array, Error,
    require: name => { assert.ok(name.startsWith('.'), `Unexpected native fixture dependency: ${name}`); return pureSourceModule(resolve(dirname(path), `${name}.ts`)); } });
  return exports;
}
const sdk = await pureSourceModule('src/lib/sessionSnapshotAuthority.ts');
const fleet = await pureSourceModule('functions/src/fleetGroups.ts');
const member = overrides => ({ hasAuth: true, sameActor: true, uidHash: hash(uid), documentTimeOrigin: 100,
  sessionId: sid, meSessionId: sid, profileRoleId: null, profileSessionId: null,
  playerRole: 'player', assignedRoleId: roleId, activeConsoleRoleId: roleId, seatId: roleId,
  fleetGroupId: 'fleet-1', replacementRoleId: null, replacementStatus: null, escapeLocked: false,
  kicked: false, connected: true, currentOwnPlayerConfirmed: true, connectionGeneration: 2,
  identityHydrationRevision: 3, connection: 'live', freshness: 'server', cycle: 1, phase: 'active',
  setupConfirmed: true, fullGameDemo: null, currentCanonicalSeatOwned: true, memberScopeMatches: true,
  sdkHasServerAuthority: true, invalidFields: [], currentOwnBerthConfirmed: true, ...overrides });
const rawGroup = { id: 'fleet-1', vesselIds: ['aegis', 'dione'], memberUids: [uid], memberShipIds: { [uid]: 'dione' } };

class Page extends EventEmitter {
  url() { return 'http://127.0.0.1:5183/#/ships/dione/roles/dione-engineer'; }
  mainFrame() { return this; }
}
async function navigationCase(changes = {}, replyChanges = {}, requestChanges = {}, httpStatus = 200) {
  const directory = await mkdtemp(resolve(tmpdir(), 'pc11-native-navigation-'));
  const page = new Page(), before = member(), after = member({ connectionGeneration: 3, identityHydrationRevision: 4, ...changes });
  const observer = createMemberNavigationResumeObserver(page, { directory, roleId, deadlineAt: Date.now() + 5000, memberContract: 'pc11-live-base' });
  await observer.prepare(before);
  const request = { url: () => 'http://127.0.0.1:5013/demo-pc11-test/us-central1/resumeSession', method: () => 'POST', postDataJSON: () => ({ data: { sessionId: sid, ...requestChanges } }) };
  const player = { uid, sessionId: sid, role: 'player', fleetGroupId: 'fleet-1', connectionGeneration: 3,
    assignedRoleId: roleId, activeConsoleRoleId: roleId, seatId: roleId, replacementRoleId: null, replacementStatus: null, ...replyChanges };
  // Actual normal DTO omits connected; owned player feed supplies that floor.
  page.emit('request', request);
  page.emit('response', { request: () => request, url: request.url, status: () => httpStatus, json: async () => ({ result: { session: { id: sid }, player } }) });
  try { return await observer.accept(before, after, async () => after); }
  finally { await observer.finish(); assert.equal(page.listenerCount('request'), 0); await rm(directory, { recursive: true }); }
}

test('changed normal navigation epoch accepts exact passive resume receipt and clean SDK without unpublished fields', async () => {
  const accepted = await navigationCase();
  assert.equal(accepted?.connectionGeneration, 3);
  assert.equal(accepted?.identityHydrationRevision, 4);
  assert.equal(accepted?.currentOwnBerthConfirmed, true);
  assert.ok(!Object.hasOwn(accepted, 'currentMemberBerthPresent'));
  assert.ok(!Object.hasOwn(accepted, 'clientAcceptance'));
});

test('changed navigation rejects lost clean authority, original identity, seat, berth and invalid receipt', async () => {
  for (const changes of [{ connection: 'offline' }, { freshness: 'cache' }, { sdkHasServerAuthority: false },
    { currentOwnPlayerConfirmed: false }, { currentCanonicalSeatOwned: false }, { memberScopeMatches: false },
    { currentOwnBerthConfirmed: false }, { fullGameDemo: { status: 'active' } }, { invalidFields: ['seatId'] }]) {
    assert.equal(await navigationCase(changes), false);
  }
  for (const [changes, reply, request, http] of [[{ uidHash: hash('foreign') }, {}, {}, 200],
    [{ identityHydrationRevision: 5 }, {}, {}, 200], [{ documentTimeOrigin: 101 }, {}, {}, 200],
    [{}, { uid: 'foreign' }, {}, 200], [{}, { sessionId: 'foreign' }, {}, 200],
    [{}, { connectionGeneration: 4 }, {}, 200], [{}, { connected: false }, {}, 200],
    [{}, {}, { sessionId: 'foreign' }, 200], [{}, {}, { invented: true }, 200], [{}, {}, {}, 403]]) {
    await navigationCase(changes, reply, request, http).then(value => assert.equal(value, false), () => undefined);
  }
});

test('ordinary operational berth accepts server-started exact own memberShipIds map', async () => {
  assert.equal(typeof adapter.pc11OwnBerthWitness, 'function');
  const before = member(), after = member();
  assert.equal(adapter.pc11OwnBerthWitness(before, after, { uid, uidHash: hash(uid), group: fleet.fleetGroupRecord(rawGroup), expectedShipId: 'dione' }), true);
  for (const group of [{ ...rawGroup, id: 'fleet-2' }, { ...rawGroup, memberUids: [] }, { ...rawGroup, memberShipIds: {} },
    { ...rawGroup, memberShipIds: { [uid]: 'aegis' } }, { ...rawGroup, vesselIds: ['aegis'] }]) {
    assert.equal(adapter.pc11OwnBerthWitness(before, after, { uid, uidHash: hash(uid), group: fleet.fleetGroupRecord(group), expectedShipId: 'dione' }), false);
  }
  for (const changed of [{ uidHash: hash('foreign') }, { connectionGeneration: 3 }, { identityHydrationRevision: 4 }, { documentTimeOrigin: 101 },
    { connection: 'offline' }, { freshness: 'cache' }, { sdkHasServerAuthority: false }, { currentCanonicalSeatOwned: false }, { memberScopeMatches: false }]) {
    assert.equal(adapter.pc11OwnBerthWitness(before, member(changed), { uid, uidHash: hash(uid), group: fleet.fleetGroupRecord(rawGroup), expectedShipId: 'dione' }), false);
  }
});

test('actual runner operational reader consumes a present own server map and rereads the mounted tuple', async () => {
  const source = await readFile(resolve(root, 'scripts/qualification/pc11-three-actor-trade-philia.mjs'), 'utf8');
  const start = source.indexOf('async function currentMemberBerthReady('), end = source.indexOf('async function memberReady(', start);
  assert.ok(start >= 0 && end > start);
  let reads = 0;
  const dependencies = { assert, sid, stage: 'native-operational-read', states: [],
    bounded: operation => operation, db: { doc: path => ({ get: async () => { reads++; assert.equal(path, `sessions/${sid}/fleetGroups/fleet-1`); return { exists: true, data: () => rawGroup }; } }) },
    fleetGroupRecord: fleet.fleetGroupRecord, fullMember: async () => member(), observeNormalMember: async () => member(),
    actorUids: new Map([['Owner', uid]]), currentMember: value => adapter.pc11MemberReadiness(value, { sessionId: sid, uidHash: hash(uid), roleId, stage: 'station' }),
    stationReady: value => value.currentCanonicalSeatOwned, pc11OwnBerthWitness: adapter.pc11OwnBerthWitness,
    short: hash, roleIds: { Owner: roleId } };
  const execute = new Function('deps', `const {${Object.keys(dependencies).join(',')}}=deps;${source.slice(start, end)};return currentMemberBerthReady;`);
  const observed = await execute(dependencies)({}, member(), 'Owner', roleId, Date.now() + 5000);
  assert.equal(observed?.currentOwnBerthConfirmed, true); assert.equal(reads, 1);
});

function stateFixture(role = 'player') {
  const session = { id: sid, phase: 'active', currentTurn: 1, setupConfirmed: true, playerCount: 12,
    chartId: 'A', activeRoleIds: ['dione-engineer', 'dione-president'], activeVesselIds: ['aegis', 'dione'],
    memberSessionScope: { groupId: 'fleet-1', vesselIds: ['aegis', 'dione'], craftIds: ['philia'] } };
  const me = { uid, sessionId: sid, displayName: 'Original Engineer', role, assignedRoleId: role === 'player' ? roleId : null,
    activeConsoleRoleId: role === 'player' ? roleId : null, seatId: role === 'player' ? roleId : null,
    fleetGroupId: 'fleet-1', connected: true, connectionGeneration: 2 };
  return { session, me, seats: [{ id: roleId, roleId, sessionId: sid, status: 'claimed', holderUid: uid }],
    connection: 'live', sessionSnapshotFreshness: 'server', identityHydrationRevision: 3,
    gmInstance: role === 'gm' ? { id: 'gm-original', uid, sessionId: sid, claimedAt: '2026-10-08T00:00:00.000Z' } : null,
    gmAccessAuthenticatedAt: role === 'gm' ? '2026-10-08T00:00:00.000Z' : null,
    gmRecoveryPending: false, pendingCommands: [], roleBrief: null, gmAwayMissionHandPointers: [], gmLoyaltyCensusStatus: 'loading' };
}
function nativeSurface(state) {
  const authority = sdk.sessionSnapshotAuthorityFor(sid, uid); authority.hasServerSessionAuthority = true;
  const modules = { '/src/lib/firebase.ts': { auth: () => ({ currentUser: { uid } }) },
    '/src/store/useSessionStore.ts': { useSessionStore: { getState: () => state } }, '/src/lib/sessionSnapshotAuthority.ts': sdk };
  const page = new Page();
  page.evaluate = async (callback, argument) => {
    const source = callback.toString().replace(/\bimport\s*\(/g, 'load(');
    const execute = new Function('load', 'crypto', 'performance', 'document', `return (${source});`);
    return execute(async path => { assert.ok(Object.hasOwn(modules, path), `Actual browser module unavailable: ${path}`); return modules[path]; }, webcrypto,
      { timeOrigin: 100 }, { querySelector: () => null })(argument);
  };
  return { page, storeModuleUrl: () => '/src/store/useSessionStore.ts', sessionAuthorityModuleUrl: () => '/src/lib/sessionSnapshotAuthority.ts' };
}

test('actual active member and lifecycle callbacks execute against actual published SDK exports and clean store fields', async () => {
  const surface = nativeSurface(stateFixture());
  const observed = await observeFullGameDemoPresentationMember(surface, { knownRoleIds: [roleId] });
  assert.equal(observed.uidHash, hash(uid)); assert.equal(observed.sdkHasServerAuthority, true);
  assert.equal(observed.memberScopeMatches, true); assert.equal(observed.currentCanonicalSeatOwned, true);
  assert.equal(observed.connectionGeneration, 2); assert.equal(observed.identityHydrationRevision, 3);
  assert.deepEqual(observed.invalidFields, []);
  const lifecycle = await observeLifecycleActor(surface, sid);
  assert.equal(lifecycle.sameActor, true); assert.equal(lifecycle.privateAudienceMatches, true); assert.equal(lifecycle.foreignPendingCount, 0);
  assert.equal(lifecycle.generation, 2); assert.equal(lifecycle.hydrationRevision, 3);
});

test('real lifecycle capture and diagnostics consume normal callable request/reply fixtures without issuing SDK actions', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'pc11-native-callables-'));
  const surface = nativeSurface(stateFixture('gm'));
  const fixture = { data: { sessionId: sid, instanceId: 'gm-original', requestId: 'assign-1', targetUid: 'recipient', roleId: 'dione-president' }, result: { status: 'assigned', sessionId: sid, roleId: 'dione-president' } };
  const request = { url: () => 'http://127.0.0.1:5013/demo-pc11-test/us-central1/assignRole', method: () => 'POST', postDataJSON: () => ({ data: fixture.data }) };
  const response = { request: () => request, url: request.url, status: () => 200, json: async () => ({ result: fixture.result }) };
  surface.page.waitForResponse = async predicate => { assert.equal(predicate(response), true); return response; };
  attachUiReceiptDiagnostics(surface.page, { directory, label: 'native-only', inspectState: () => observeLifecycleActor(surface) });
  let actions = 0;
  try {
    const capture = await captureLifecycleUiAction(surface, 'assignRole', async () => { actions++; surface.page.emit('request', request); surface.page.emit('response', response); });
    assert.deepEqual(capture.data, fixture.data); assert.deepEqual(capture.result, fixture.result); assert.equal(actions, 1);
    assert.equal(publicLifecycleReceipt(capture).requestId, 'assign-1');
    assert.equal(surface.page.listenerCount('request'), 0);
    const primary = new Error('original failure');
    await assert.rejects(observeUiReceipt({ waitForResponse: async () => { throw primary; }, choose: async () => {}, page: surface.page }), error => error === primary);
    assert.equal(originalProofError(primary).message, 'original failure');
    assert.equal((await retainProofFailure(directory, 'native', primary)).evidenceWriteFailed, false);
    // Settings helpers use real accessible labels; no browser exists.
    const locator = { click: async () => { actions++; }, isVisible: async () => true, waitFor: async () => {}, getByRole: () => locator };
    surface.page.getByRole = () => locator;
    const dialog = await openLifecycleSettings(surface); await closeLifecycleSettings(dialog);
    assert.equal(actions, 3);
  } finally { await rm(directory, { recursive: true }); }
});

test('exact-owned top-level proof receipts and GM access are cleaned and foreign records refused', async () => {
  assert.equal(typeof adapter.removePc11OwnedRootRecords, 'function');
  const records = new Map([
    [`sessionCreationRequests/${uid}_create-1`, { sessionId: sid, requestId: 'create-1', fingerprint: { actorUid: uid, requestId: 'create-1' } }],
    [`sessionStartRequests/${sid}_start-1`, { sessionId: sid, requestId: 'start-1', actorUid: uid, instanceId: 'gm-original' }],
    [`gmAccess/${uid}`, { uid }],
  ]);
  const db = { doc: path => ({ path, get: async () => ({ exists: records.has(path), get: key => records.get(path)?.[key] }) }),
    runTransaction: async callback => callback({ get: ref => ref.get(), delete: ref => records.delete(ref.path) }) };
  const expected = { db, uid, sessionId: sid, creationRequestId: 'create-1', startRequestId: 'start-1', instanceId: 'gm-original' };
  records.get(`gmAccess/${uid}`).uid = 'foreign';
  await assert.rejects(adapter.removePc11OwnedRootRecords(expected));
  assert.equal(records.size, 3, 'Validate all owned records before any delete.');
  records.get(`gmAccess/${uid}`).uid = uid;
  assert.equal((await adapter.removePc11OwnedRootRecords(expected)).absent, true);
  assert.equal(records.size, 0);
});
