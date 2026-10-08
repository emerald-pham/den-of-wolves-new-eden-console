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
    require: name => { if(name.startsWith('@/assets/')) { readFileSync(resolve(root,'src',name.slice(2))); return {default:name}; } assert.ok(name.startsWith('.'), `Unexpected native fixture dependency: ${name}`); return pureSourceModule(resolve(dirname(path), `${name}.ts`)); } });
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

test('actual selector failure remains primary when bounded read-only diagnostics also fail', async () => {
  const source = await readFile(resolve(root, 'scripts/qualification/pc11-three-actor-trade-philia.mjs'), 'utf8');
  const start = source.indexOf('try{await recipientSelector.selectOption('), end = source.indexOf("await trade.getByLabel('Materials amount'", start);
  const primary = new Error('original exact recipient timeout'), diagnostic = new Error('diagnostic failed');
  const dependencies = { assert, recipientSelector: { selectOption: async () => { throw primary; } },
    actorUids: new Map([['Recipient', 'original-president']]), retainRecipientSelector: async () => { throw diagnostic; },
    bounded: promise => promise, workEnd: Date.now() + 5000, evidence: {} };
  const execute = new Function('deps', `const {${Object.keys(dependencies).join(',')}}=deps;return (async()=>{${source.slice(start, end)}})();`);
  await assert.rejects(execute(dependencies), error => error === primary);
  assert.equal(dependencies.evidence.tradeDiagnosticErrors.length, 1);
});

test('proof evidence reports actual absolute allocation cap and preserves cleanup reserve', () => {
  assert.equal(typeof adapter.pc11ProofTiming, 'function');
  assert.deepEqual(adapter.pc11ProofTiming(1000000, 1270000), { totalEnd: 1270000, workEnd: 1210000, executionCapMs: 270000 });
  assert.throws(() => adapter.pc11ProofTiming(1000000, 1119999));
  assert.throws(() => adapter.pc11ProofTiming(1000000, Number.NaN));
});

test('owned-root cleanup counts only committed retry and never exposes raw owned paths', async () => {
  const records=new Map([[`gmAccess/${uid}`,{uid}]]);
  const ref=path=>({path,get:async()=>({exists:records.has(path),get:key=>records.get(path)?.[key]})});
  const db={doc:ref,runTransaction:async callback=>{await callback({get:r=>r.get(),delete:()=>{}});return callback({get:r=>r.get(),delete:r=>records.delete(r.path)});}};
  const result=await adapter.removePc11OwnedRootRecords({db,uid,sessionId:sid});
  assert.equal(result.deleted,1);assert.equal(JSON.stringify(result).includes(uid),false);
});

test('passive original UI request tracker retains cleanup IDs even when reply diagnostics fail', async () => {
  assert.equal(typeof adapter.createPc11OwnedRequestTracker,'function');
  const page=new Page(),captured=[];
  const tracker=adapter.createPc11OwnedRequestTracker(page,value=>captured.push(value));
  const request=endpoint=>({url:()=>`http://127.0.0.1:5013/demo-pc11-test/us-central1/${endpoint}`,method:()=> 'POST',postDataJSON:()=>({data:{requestId:'original-1',sessionId:sid,instanceId:'gm-original'}})});
  page.emit('request',request('startGame'));page.emit('request',request('createSession'));
  assert.deepEqual(captured.map(v=>v.endpoint),['startGame','createSession']);
  assert.equal(captured[0].requestId,'original-1');assert.equal(captured[0].sessionId,sid);
  page.emit('request',{url:()=> 'http://127.0.0.1:5013/demo-pc11-test/us-central1/joinSession',method:()=> 'POST',postDataJSON:()=>({data:{joinCode:'NORMAL'}})});
  assert.equal(captured[2]?.endpoint,'joinSession');
  tracker.finish();assert.equal(page.listenerCount('request'),0);
});

test('every active runner browser callback binds published modules and normal fields without runtime', async () => {
  const source=await readFile(resolve(root,'scripts/qualification/pc11-three-actor-trade-philia.mjs'),'utf8');
  const ast=ts.createSourceFile('runner.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const callbacks=[];
  function visit(node){
    if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&['evaluate','evaluateAll'].includes(node.expression.name.text)&&node.arguments[0]&&(ts.isArrowFunction(node.arguments[0])||ts.isFunctionExpression(node.arguments[0]))){
      const callback=node.arguments[0],text=callback.getText(ast);
      // The copied factory's callable controller is never invoked by this UI-only runner.
      if(!text.includes('httpsCallable'))callbacks.push({text,kind:node.expression.name.text});
    }ts.forEachChild(node,visit);
  }visit(ast);assert.equal(callbacks.length,18,'Active browser callback inventory must be updated for changes.');
  for(const [file,names]of [['src/lib/firebase.ts',['auth']],['src/lib/firestore.ts',['db']],['src/store/useSessionStore.ts',['useSessionStore']],['src/lib/sessionService.ts',['setShipConsoleLock']]]) {
    const module=ts.createSourceFile(file,readFileSync(resolve(root,file),'utf8'),ts.ScriptTarget.Latest,true);
    const exported=new Set();for(const statement of module.statements){if(!statement.modifiers?.some(modifier=>modifier.kind===ts.SyntaxKind.ExportKeyword))continue;
      if(ts.isFunctionDeclaration(statement)&&statement.name)exported.add(statement.name.text);
      if(ts.isVariableStatement(statement))for(const declaration of statement.declarationList.declarations)if(ts.isIdentifier(declaration.name))exported.add(declaration.name.text);}
    for(const name of names)assert.ok(exported.has(name),`Missing published browser export ${file}:${name}`);
  }
  const firestoreSdk=require('firebase/firestore');for(const name of ['doc','getDocFromServer'])assert.equal(typeof firestoreSdk[name],'function');
  const rolePresets=pureSourceModule('src/data/rolePresets.ts');
  const state=stateFixture('gm');state.session.shipDamage={dione:{damagedSystemIds:[]}};state.session.shipResources={dione:{materials:3}};
  state.session.shuttleControl={philia:{holderUid:uid}};state.session.shuttleDockings=[{shuttleId:'philia',shipId:'dione'}];
  const authority=sdk.sessionSnapshotAuthorityFor(sid,uid);authority.hasServerSessionAuthority=true;
  const store={getState:()=>state,subscribe:callback=>{callback();return()=>{};}};
  const heldBalances={ore:0,fuel:0,food:0,water:0,materials:1,securityTeams:0};
  const modules={'/src/lib/firebase.ts':{auth:()=>({currentUser:{uid}})},'/src/store/useSessionStore.ts':{useSessionStore:store},
    '/src/lib/sessionSnapshotAuthority.ts':sdk,'/src/data/rolePresets.ts':rolePresets,'/src/lib/firestore.ts':{db:()=>({})},
    '/node_modules/.vite/deps/firebase_firestore.js':{doc:(_db,path)=>{assert.equal(path,`sessions/${sid}/playerHeldResourceInventories/${uid}`);return path;},getDocFromServer:async()=>({exists:()=>true,data:()=>({balances:heldBalances})})}};
  let compatibilityCalls=0;
  modules['/src/lib/sessionService.ts']={setShipConsoleLock:async(shipId,locked)=>{assert.equal(shipId,'dione');assert.equal(locked,true);compatibilityCalls++;}};
  const location={hash:'#/ships/dione/observer'};
  const window={};const node={textContent:'actual diagnostic',isConnected:true,querySelectorAll:()=>[],getAttribute:()=>null};
  const document={querySelector:selector=>selector==='section.same-table-trade'?node:null,querySelectorAll:()=>[]};
  const context={load:async path=>{assert.ok(Object.hasOwn(modules,path),`Unavailable active browser import ${path}`);return modules[path];},
    crypto:webcrypto,performance:{timeOrigin:100,now:()=>1},document,window,location,TextEncoder,
    requestAnimationFrame:callback=>callback(),fetch:async path=>{assert.equal(path,'/src/lib/firestore.ts');return{text:async()=>`import {getDocFromServer} from '/node_modules/.vite/deps/firebase_firestore.js';`};}};
  let executed=0;
  for(const {text,kind}of callbacks){
    const func=new Function(...Object.keys(context),`return (${text.replace(/\bimport\s*\(/g,'load(')});`)(...Object.values(context));
    const parameter=text.match(/^(?:async\s*)?(?:\(([^)]*)\)|([A-Za-z]+))\s*=>/)?.slice(1).find(Boolean)?.trim();
    const argument=kind==='evaluateAll'?[]:parameter==='element'?node:parameter==='playerCount'?12:parameter==='moduleUrl'||parameter==='storeUrl'?'/src/store/useSessionStore.ts':
      {sid,uid,authorityUrl:'/src/lib/sessionSnapshotAuthority.ts',storeUrl:'/src/store/useSessionStore.ts'};
    const result=await func(argument);executed++;
    if(text.includes('wrongSessionAuthority'))assert.deepEqual(result,{ownAuthority:true,wrongSessionAuthority:false});
    if(text.includes('Held inventory absent'))assert.deepEqual(result,heldBalances);
    if(text.includes('recommendedRoleIds'))assert.equal(result.length,12);
    if(text.includes('occupiedSeatCount'))assert.equal(result.occupiedSeatCount,1);
  }assert.equal(executed,18);assert.equal(compatibilityCalls,1,'Exactly one retained normal service invocation is bound');assert.equal(window.__pc11GmClaimObservation,undefined);
});

test('hosted Philia and normal reload retain original Dione seat and exact own host map',()=>{
  const philia=pureSourceModule('src/data/vessels/philia.ts').default;
  assert.equal(philia.captainRoleId,'dione-engineer');assert.equal(philia.initialDocking.shipId,'dione');
  for(const epoch of [{documentTimeOrigin:100,connectionGeneration:2,identityHydrationRevision:3},{documentTimeOrigin:200,connectionGeneration:3,identityHydrationRevision:4}]){
    const observed=member(epoch);
    assert.equal(adapter.pc11OwnBerthWitness(observed,{...observed},{uid,uidHash:hash(uid),group:fleet.fleetGroupRecord(rawGroup),expectedShipId:philia.initialDocking.shipId}),true);
    assert.equal(adapter.pc11OwnBerthWitness(observed,member({...epoch,activeConsoleRoleId:'philia-engineer'}),{uid,uidHash:hash(uid),group:fleet.fleetGroupRecord(rawGroup),expectedShipId:'dione'}),false);
  }
});

test('partial committed create recovers only exact captured UID/request receipt and refuses foreign scope',async()=>{
  assert.equal(typeof adapter.recoverPc11CreatedSession,'function');
  const record={requestId:'create-1',sessionId:sid,fingerprint:{actorUid:uid,requestId:'create-1'}};
  const db={doc:path=>{assert.equal(path,`sessionCreationRequests/${uid}_create-1`);return{get:async()=>({exists:true,get:key=>record[key]})};}};
  assert.equal(await adapter.recoverPc11CreatedSession({db,uid,requestId:'create-1'}),sid);
  record.fingerprint.actorUid='foreign';await assert.rejects(adapter.recoverPc11CreatedSession({db,uid,requestId:'create-1'}));
});

test('active UI receipt helper consumes every exercised normal callable and refuses foreign session/denied reply',async()=>{
  const directory=await mkdtemp(resolve(tmpdir(),'pc11-native-receipts-'));const surface=nativeSurface(stateFixture('gm'));
  const functionsSource=await readFile(resolve(root,'functions/src/index.ts'),'utf8');
  const balances={ore:0,fuel:0,food:0,water:0,materials:1,securityTeams:0};
  const fixtures=[
    ['claimGmInstance',{instanceId:'gm-original',name:'GM',deviceLabel:'PC11'}, {instance:{id:'gm-original',uid,sessionId:sid,claimedAt:'2026-10-08T00:00:00.000Z'}}],
    ['confirmSetup',{instanceId:'gm-original',expectedSetupRevision:0,playerCount:12,chartId:'A'}, {status:'committed'}],
    ['assignRole',{instanceId:'gm-original',targetUid:'recipient',roleId:'dione-president'}, {status:'committed'}],
    ['startGame',{instanceId:'gm-original',expectedSetupRevision:1}, {status:'committed',currentTurn:1}],
    ['clearTurnAdvanceInterstitial',{expectedCycle:1,expectedPausedAt:'2026-10-08T00:00:00.000Z'}, {status:'cleared'}],
    ['attestPlayerHeldTokenBaseline',{instanceId:'gm-original',attestationId:'attest-1',targetUid:uid,balances}, {status:'attested'}],
    ['createSameTableTradeOffer',{offerId:'offer-1',toUid:'recipient',quantities:{materials:1}}, {status:'created',offer:{fromUid:uid,toUid:'recipient',quantities:balances}}],
    ['acceptSameTableTradeOffer',{offerId:'offer-1',expectedRevision:1}, {status:'committed'}],
    ['proposePermissionedDismantling',{proposalId:'proposal-1',craftId:'philia',targetShipId:'dione',targetConsoleId:'maintenance',expectedControlRevision:1}, {status:'proposed'}],
    ['consentToPermissionedDismantling',{proposalId:'proposal-1',consentId:'consent-1',expectedTargetRevision:0}, {status:'consented'}],
    ['applyPermissionedDismantling',{proposalId:'proposal-1',consentId:'consent-1',expectedTargetRevision:0}, {status:'applied',materialGain:3,targetConsoleId:'maintenance'}],
  ];
  try{for(const [endpoint,fields,result]of fixtures){
    assert.match(functionsSource,new RegExp(`export const ${endpoint} =`));
    const data={sessionId:sid,requestId:`${endpoint}-1`,...fields};
    const request={url:()=>`http://127.0.0.1:5013/demo-pc11-test/us-central1/${endpoint}`,method:()=> 'POST',postDataJSON:()=>({data})};
    const response={request:()=>request,url:request.url,status:()=>200,json:async()=>({result})};
    surface.page.waitForResponse=async predicate=>{assert.equal(predicate(response),true);return response;};
    const captured=await captureLifecycleUiAction(surface,endpoint,async()=>{surface.page.emit('request',request);},{correlateRequests:true});
    assert.deepEqual(captured.data,data);assert.deepEqual(captured.result,result);assert.equal(publicLifecycleReceipt(captured).endpoint,endpoint);
    data.sessionId='foreign';await assert.rejects(captureLifecycleUiAction(surface,endpoint,async()=>{}));data.sessionId=sid;
    response.json=async()=>({result:{status:'denied'}});await assert.rejects(captureLifecycleUiAction(surface,endpoint,async()=>{}));
  }}finally{await rm(directory,{recursive:true});}
});

test('actual normalJoin wait accepts published setup-confirmed lobby and subsequent casting, retaining authority negatives',async()=>{
  const runner=await readFile(resolve(root,'scripts/qualification/pc11-three-actor-trade-philia.mjs'),'utf8');
  const functionsSource=await readFile(resolve(root,'functions/src/index.ts'),'utf8');
  const create=functionsSource.slice(functionsSource.indexOf('export const createSession'),functionsSource.indexOf('export const joinSession'));
  const phase=create.match(/session:\s*\{[\s\S]*?phase:\s*'([^']+)'/)?.[1];assert.equal(phase,'lobby');
  const source=ts.createSourceFile('runner',runner,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  let joinPredicate;
  function find(child){if(ts.isCallExpression(child)&&ts.isPropertyAccessExpression(child.expression)&&child.expression.name.text==='until')joinPredicate=child.arguments[1]?.getText(source);ts.forEachChild(child,find);}
  function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='normalJoin')find(node);ts.forEachChild(node,visit);}visit(source);assert.ok(joinPredicate);
  const predicate=new Function('sid',`return (${joinPredicate});`)(sid);
  const before={hasAuth:true,sameActor:true,sessionId:sid,cycle:0,phase,setupConfirmed:true,connection:'live',freshness:'server'};
  assert.equal(predicate(before),true,'First ordinarily admitted player joins published lobby after setup confirmation.');
  assert.equal(predicate({...before,phase:'casting'}),true,'The second player joins after the first actual role assignment advances phase.');
  for(const delta of [{hasAuth:false},{sameActor:false},{sessionId:'foreign'},{cycle:1},{phase:'active'},{phase:'closed'},{setupConfirmed:false},{connection:'offline'},{freshness:'cache'}])assert.equal(predicate({...before,...delta}),false);
  const admitted=member({phase,cycle:0,assignedRoleId:null,activeConsoleRoleId:null,seatId:null,currentCanonicalSeatOwned:false});
  assert.equal(adapter.pc11MemberReadiness(admitted,{sessionId:sid,uidHash:hash(uid),roleId:null,stage:'casting'}),true);
  assert.equal(adapter.pc11MemberReadiness({...admitted,phase:'casting'},{sessionId:sid,uidHash:hash(uid),roleId:null,stage:'casting'}),true);
});

test('actual first-failure snapshot skips an untouched blank surface without importing App modules',async()=>{
  const source=await readFile(resolve(root,'scripts/qualification/pc11-three-actor-trade-philia.mjs'),'utf8');
  const start=source.indexOf('async function snapshot('),end=source.indexOf('async function register(',start);let observations=0,writes=0;
  const deps={assert,baseUrl:'http://127.0.0.1:5183',sid,stage:'normal join',states:[],consumed:null,directory:'/tmp/native-unused',
    observeLifecycleActor:async()=>{observations++;return{sameActor:true};},writeFile:async()=>{writes++;},URL};
  const snapshot=new Function('deps',`let {${Object.keys(deps).join(',')}}=deps;${source.slice(start,end)};return snapshot;`)(deps);
  const value=await snapshot({page:{url:()=> 'about:blank'}},'unadmitted Recipient');
  assert.equal(observations,0);assert.equal(writes,0);assert.equal(value.skipped,true);
  await snapshot({page:{url:()=> 'http://127.0.0.1:5183/'}},'admitted Owner');assert.equal(observations,1);assert.equal(writes,1);
});

test('all six actual runner wait predicates consume the published ordinary setup-to-start transition chain',async()=>{
  const runner=await readFile(resolve(root,'scripts/qualification/pc11-three-actor-trade-philia.mjs'),'utf8');
  const handlers=await readFile(resolve(root,'functions/src/index.ts'),'utf8');
  const region=(start,end)=>handlers.slice(handlers.indexOf(start),handlers.indexOf(end,handlers.indexOf(start)+1));
  const create=region('export const createSession','export const joinSession');
  const confirm=region('export const confirmSetup','export const setFacilitatorResponsibility');
  const assign=region('export const assignRole','export const releaseSeat');
  const start=region('export const startGame','export const ');
  const lobby=create.match(/session:\s*\{[\s\S]*?phase:\s*'([^']+)'/)?.[1];assert.equal(lobby,'lobby');
  assert.match(confirm,/setupConfirmed: true/);assert.doesNotMatch(confirm,/phase: 'casting'/,'confirmSetup retains the published lobby phase');
  const setupStart=handlers.indexOf('function setupWriteFields('),setupEnd=handlers.indexOf('type SetupCommandFingerprint',setupStart);
  const setupJs=ts.transpileModule(handlers.slice(setupStart,setupEnd),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const writeSetup=new Function(`${setupJs};return setupWriteFields;`)()({activeRoleIds:[],activeVesselIds:[]});
  assert.deepEqual(writeSetup.activeRoleIds,[]);assert.deepEqual(writeSetup.activeVesselIds,[]);
  assert.equal(Object.hasOwn(writeSetup,'phase'),false,'Actual confirmSetup spread helper preserves lifecycle phase.');
  assert.match(assign,/tx\.update\(sessionRef,\s*\{\s*phase: 'casting'/);assert.match(start,/phase: 'active'/);
  const advanceStart=handlers.indexOf('function advanceTurnInTransaction('),advanceEnd=handlers.indexOf('function ',advanceStart+10);
  assert.match(handlers.slice(advanceStart,advanceEnd),/holdTurnAdvancePhase\(initialTurnPhase, phaseStartedAt\)/);
  const clearing=await readFile(resolve(root,'functions/src/turnInterstitialCallable.ts'),'utf8');
  const clearWrite=clearing.match(/tx\.update\(sessionRef,([^;]+)\);/)?.[1];assert.ok(clearWrite);
  assert.match(clearWrite,/turnPhase:resumed/);assert.doesNotMatch(clearWrite,/\bphase\s*:/,'Briefing clear changes turnPhase, not lifecycle phase.');
  const turn=pureSourceModule('functions/src/turnZero.ts'),interstitial=pureSourceModule('functions/src/turnInterstitial.ts'),serverNow=Date.parse('2026-10-08T00:00:00.000Z');
  const heldPhase=interstitial.holdTurnAdvancePhase(turn.startTurnPhase(1,serverNow),serverNow);
  assert.equal(heldPhase.timerPause.reason,'turn-interstitial');
  const clearedPhase=interstitial.clearHeldTurnAdvancePhase(heldPhase,1,heldPhase.timerPause.pausedAt,serverNow+1000);
  assert.ok(clearedPhase);assert.equal(clearedPhase.timerPause,undefined);

  const source=ts.createSourceFile('runner',runner,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),predicates=new Map();
  function visit(node){if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='until'&&node.arguments[1]&&ts.isArrowFunction(node.arguments[1]))predicates.set(node.arguments[0].getText(source),node.arguments[1].getText(source));ts.forEachChild(node,visit);}visit(source);
  assert.equal(predicates.size,7,'Every added wait requires an explicit ordinary lifecycle fixture.');
  const deps={assert,sid,before:member(),phase:undefined,expectedUidHash:hash(uid),roleIds:{Owner:roleId},label:'Owner'};
  const predicate=(prefix,overrides={})=>{const entry=[...predicates].find(([name])=>name.includes(prefix));assert.ok(entry,`Missing actual ${prefix} wait`);return new Function('deps',`const {${Object.keys(deps).join(',')}}=deps;return (${entry[1]});`)({...deps,...overrides});};
  const ordinary={hasAuth:true,sameActor:true,uidHash:hash(uid),sessionId:sid,cycle:0,phase:lobby,setupConfirmed:false,connection:'live',freshness:'server',profileRoleId:null,profileSessionId:null};
  assert.equal(predicate('Fresh ordinary Cycle0')(ordinary),true);
  const grantActor=predicate('Current original GM has Dione scoped grant');
  assert.equal(grantActor({sameActor:true,gmInstanceOwned:true,grantShipId:'dione'}),true);
  assert.equal(grantActor({sameActor:false,gmInstanceOwned:true,grantShipId:'dione'}),false);
  assert.equal(grantActor({sameActor:true,gmInstanceOwned:false,grantShipId:'dione'}),false);
  assert.equal(grantActor({sameActor:true,gmInstanceOwned:true,grantShipId:'aegis'}),false);
  assert.equal(grantActor({sameActor:true,gmInstanceOwned:true}),false);
  const configured={...ordinary,setupConfirmed:true,activeRoleIds:pureSourceModule('src/data/rolePresets.ts').recommendedRoleIds(12)};
  assert.equal(predicate('Legal12 roster confirmed')(configured),true);
  assert.equal(predicate('Normal joined fresh')(configured),true,'First join sees configured lobby');
  const assigned={...configured,phase:'casting'};assert.equal(predicate('Normal joined fresh')(assigned),true,'Second join follows the first role assignment');
  const beforeSeat=member({phase:lobby,cycle:0,assignedRoleId:null,activeConsoleRoleId:null,seatId:null,currentCanonicalSeatOwned:false});
  assert.equal(adapter.pc11MemberReadiness(beforeSeat,{sessionId:sid,uidHash:hash(uid),roleId:null,stage:'casting'}),true);
  assert.equal(adapter.pc11MemberReadiness({...beforeSeat,phase:'casting',assignedRoleId:roleId},{sessionId:sid,uidHash:hash(uid),roleId,stage:'casting'}),true);
  const claimed=member({phase:'casting',cycle:0});assert.equal(adapter.pc11MemberReadiness(claimed,{sessionId:sid,uidHash:hash(uid),roleId,stage:'station'}),true);
  const stationStart=runner.indexOf('function castingStationReady('),stationEnd=runner.indexOf('async function currentMemberBerthReady(',stationStart);
  const stationDeps={pc11MemberReadiness:adapter.pc11MemberReadiness,sid,short:hash,actorUids:new Map([['Owner',uid],['Recipient','original-president']])};
  const station=new Function('deps',`const {${Object.keys(stationDeps).join(',')}}=deps;${runner.slice(stationStart,stationEnd)};return castingStationReady;`)(stationDeps);
  assert.equal(station(claimed,'Owner',roleId),true);
  const president=member({uidHash:hash('original-president'),assignedRoleId:'dione-president',activeConsoleRoleId:'dione-president',seatId:'dione-president',phase:'casting',cycle:0});
  assert.equal(station(president,'Recipient','dione-president'),true);
  assert.equal(station({...president,currentCanonicalSeatOwned:false},'Recipient','dione-president'),false);
  assert.equal(station({...claimed,phase:lobby},'Owner',roleId),false,'Actual assigned station phase remains casting; lobby admission adds no seat authority.');
  const gm={...configured,playerRole:'gm',gmInstanceOwned:true,instanceId:'gm-original'};
  assert.equal(predicate('original normally authenticated live GM')(gm),true);
  const active={...gm,phase:'active',cycle:1,ordinaryBriefingMounted:true,ordinaryBriefingHeld:heldPhase.timerPause?.reason==='turn-interstitial'};
  assert.equal(predicate('original normally authenticated live GM',{phase:'active'})(active),true);
  assert.equal(predicate('original normally authenticated live GM',{phase:'active'})(gm),false);
  assert.equal(predicate('original normally authenticated live GM',{phase:'active'})({...active,phase:'casting'}),false);
  for(const delta of [{hasAuth:false},{sameActor:false},{connection:'offline'},{freshness:'cache'}])assert.equal(predicate('original normally authenticated live GM',{phase:'active'})({...active,...delta}),false);
  for(const delta of [{uidHash:hash('foreign')},{sessionId:'foreign'}])assert.throws(()=>predicate('original normally authenticated live GM',{phase:'active'})({...active,...delta}));
  assert.equal(predicate('Cycle 1 briefing cleared')(active),false);
  assert.equal(predicate('Cycle 1 briefing cleared')({...active,ordinaryBriefingMounted:false,ordinaryBriefingHeld:true}),false);
  assert.equal(predicate('Cycle 1 briefing cleared')({...active,ordinaryBriefingMounted:true,ordinaryBriefingHeld:false}),false);
  assert.equal(predicate('Cycle 1 briefing cleared')({...active,ordinaryBriefingMounted:false,ordinaryBriefingHeld:clearedPhase.timerPause?.reason==='turn-interstitial'}),true);
  assert.equal(predicate('Original persisted Auth/member document restoration')({...active,playerRole:'player',activeConsoleRoleId:roleId}),true);
  for(const delta of [{hasAuth:false},{sameActor:false},{connection:'offline'},{freshness:'cache'}])assert.equal(predicate('Original persisted Auth/member document restoration')({...active,playerRole:'player',activeConsoleRoleId:roleId,...delta}),false);
});


test('canonical lifecycle correlation ignores stale and foreign operation responses and preserves intended rejection', async () => {
  const surface = nativeSurface(stateFixture('gm'));
  for (const denied of [false, true]) {
    const make = (requestId, enabled, shipId = 'dione') => {
      const data = { sessionId: sid, instanceId: 'gm-original', requestId, shipId, enabled };
      const request = { url: () => 'http://127.0.0.1:5013/demo-pc11-test/us-central1/setGmShipConsoleWriteGrant', method: () => 'POST', postDataJSON: () => ({ data }) };
      return { request: () => request, url: request.url, status: () => denied && requestId === 'intended' ? 403 : 200, json: async () => denied && requestId === 'intended' ? { error: { status: 'PERMISSION_DENIED' } } : { result: { enabled } } };
    };
    const stale = make('earlier-disable', false), earlierEnable = make('earlier-enable', true), foreign = make('foreign', true, 'aegis'), intended = make('intended', true);
    surface.page.waitForResponse = predicate => new Promise(resolve => {
      const listener = response => { if (predicate(response)) { surface.page.off('response', listener); resolve(response); } };
      surface.page.on('response', listener);
    });
    const run = captureLifecycleUiAction(surface, 'setGmShipConsoleWriteGrant', async () => {
      surface.page.emit('response', stale); surface.page.emit('response', earlierEnable);
      surface.page.emit('request', foreign.request()); surface.page.emit('response', foreign);
      surface.page.emit('request', intended.request()); surface.page.emit('response', intended);
    }, { correlateRequests: true, matches: data => data?.shipId === 'dione' && data?.enabled === true });
    if (denied) await assert.rejects(run, /actual UI request rejected/);
    else { const result = await run; assert.equal(result.data.requestId, 'intended'); assert.equal(result.result.enabled, true); }
    assert.equal(surface.page.listenerCount('request'), 0);
  }
});


test('canonical state-repeat grant/revoke pair actual no-wire-ID requests without changing the backend envelope', async () => {
  for (const enabled of [true, false]) {
  const surface = nativeSurface(stateFixture('gm'));
  const data = { sessionId: sid, instanceId: 'gm-original', claimedAt: '2026-10-08T00:00:00.000Z', shipId: 'dione', enabled };
  const request = { url: () => 'http://127.0.0.1:5013/demo-pc11-test/us-central1/setGmShipConsoleWriteGrant', method: () => 'POST', postDataJSON: () => ({ data }) };
  const response = { request: () => request, url: request.url, status: () => 200, json: async () => ({ result: { enabled } }) };
  // Deliver the real request only when the choice runs, then inspect the response predicate.
  let predicate;
  surface.page.waitForResponse = match => new Promise((resolve, reject) => {
    predicate = match;
    surface.page.once('response', value => predicate(value) ? resolve(value) : reject(new Error('Intended no-wire-ID request was ignored')));
  });
  const result = await captureLifecycleUiAction(surface, 'setGmShipConsoleWriteGrant', async () => {
    surface.page.emit('request', request); surface.page.emit('response', response);
  }, { correlateRequests: true, matches: value => value?.shipId === 'dione' && value?.enabled === enabled });
  assert.deepEqual(result.data, data); assert.equal(result.result.enabled, enabled);
  assert.equal(surface.page.listenerCount('request'), 0);
  }
});
