import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createContext, Script } from 'node:vm';
import { createTwoBrowserGameplay } from '../pc10-two-browser-gameplay.mjs';
import { fixture, root } from './pc10-post-digest-native-fixture.mjs';

// Native-only source coupling: the actual transaction reader, the exact normal
// resume return, the actual member-feed witness attachment/parser and the real
// public adapter/serialized browser callback. No Firebase or browser transport.
const require = createRequire(import.meta.url), ts = require('typescript');
const parsed = async path => ts.createSourceFile(path, await readFile(`${root}/${path}`, 'utf8'), ts.ScriptTarget.Latest, true);
const reader = await parsed('functions/src/memberSessionCallable.ts');
const groups = await parsed('functions/src/fleetGroups.ts');
const members = await parsed('functions/src/memberSession.ts');
const index = await parsed('functions/src/index.ts');
const firestore = await parsed('src/lib/firestore.ts');
const identifiers = await parsed('src/types/identifiers.ts');
const crewAccess = await parsed('functions/src/crewAccess.ts');
const roles = await parsed('functions/src/roleConfiguration.ts');
function only(source, predicate) {
  const values = [];
  function visit(node) { if (predicate(node)) values.push(node); ts.forEachChild(node, visit); }
  visit(source); assert.equal(values.length, 1, 'Extract exactly one current source node.'); return values[0];
}
const fn = (source, name) => only(source, node => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(source);
const js = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText.replace(/^export\s+/gm, '');
const resume = only(index, node => ts.isVariableDeclaration(node) && node.name.getText(index) === 'resumeSession');
const resumeReturn = only(resume, node => ts.isReturnStatement(node) &&
  node.getText(index).includes('session: (await currentMemberSessionReader(') && node.getText(index).includes(')).session'));
const feedSession = only(firestore, node => ts.isVariableDeclaration(node) && node.name.getText(firestore) === 'session' &&
  node.initializer?.getText(firestore).includes('currentActorBerthAuthorityFrom(response.currentActorBerthAuthority'));
const plain = value => JSON.parse(JSON.stringify(value));

export function projectionFixture({ legacy = false, freshDemo = true, actorRoleId = 'wing-commander',
  released = true, publishAfterClaim = true, onReturned } = {}) {
  const f = fixture({ actorRoleId, released, onReturned: (value, row) => onReturned?.(f, row) });
  const original = f.store.getState(), sid = original.session.id, uid = original.me.uid;
  const marker = { status: 'active', progression: 'manual' };
  const session = { ...original.session, memberSessionScope: { ...original.session.memberSessionScope, craftIds: [] },
    ...(freshDemo ? { fullGameDemo: marker } : {}) };
  delete session.currentActorBerthAuthority; f.store.setState({ session });
  f.atomicReadCount = 0; f.sourceReadPaths = []; f.uiChoices = []; let path = '#/demo-actors';
  const snapshot = (id, value) => ({ id, exists: value !== undefined, data: () => value, get: key => value?.[key] });
  const records = () => {
    const current = f.store.getState();
    return { [`sessions/${sid}`]: { ...current.session }, [`sessions/${sid}/players/${uid}`]: { ...current.me },
      [`sessions/${sid}/fleetGroups/fleet-1`]: { id: 'fleet-1', vesselIds: ['aegis'], memberUids: [uid],
        ...(f.legacy ? {} : { memberShipIds: { [uid]: 'aegis' } }) } };
  };
  f.legacy = legacy;
  const roleIds = only(roles, node => ts.isVariableDeclaration(node) && node.name.getText(roles) === 'ROLE_IDS');
  const roleContext = createContext({});
  new Script(js(`const ROLE_IDS = ${roleIds.initializer.getText(roles)};\n${fn(crewAccess, 'shipForRole')}`)).runInContext(roleContext);
  f.sourceRoleHasShip = new Script('role => shipForRole(role) !== undefined;').runInContext(roleContext);
  const transaction = { get: async ref => {
    const values = records(); f.sourceReadPaths.push(ref.path);
    return ref.collection ? { docs: Object.keys(values).filter(key => key.startsWith(`${ref.path}/`) &&
      !key.slice(ref.path.length + 1).includes('/')).map(key => snapshot(key.split('/').at(-1), values[key])) }
      : snapshot(ref.path.split('/').at(-1), values[ref.path]);
  }, set: () => assert.fail('No transaction writes.'), update: () => assert.fail('No transaction writes.') };
  const db = { doc: path => ({ path }), collection: path => ({ path, collection: true }),
    runTransaction: async (callback, options) => { assert.deepEqual(plain(options), { readOnly: true });
      f.atomicReadCount++; return callback(transaction); } };
  const sourceContext = createContext({ db,
    HttpsError: class extends Error { constructor(code, message) { super(message); this.code = code; } },
    // Public content filtering is outside this seam. This inert projection
    // preserves the actual scope supplied by the transaction, never a caller.
    memberSessionProjection: (raw, scope) => ({ ...raw, memberSessionScope:
      { groupId: scope.groupId, vesselIds: [...scope.vesselIds], craftIds: [...(scope.craftIds ?? [])] } }),
  });
  new Script(js([fn(groups, 'uniqueStrings'), fn(groups, 'fleetGroupRecord'), fn(groups, 'fleetGroupMemberShipId'),
    fn(members, 'record'), fn(members, 'memberSessionScope'), fn(reader, 'wire'),
    fn(reader, 'createCurrentMemberSessionReader')].join('\n'))).runInContext(sourceContext);
  const readCurrent = new Script('createCurrentMemberSessionReader({ db, projectSession: (source, sessionId) => ({ ...source.data(), id: sessionId }) });')
    .runInContext(sourceContext);
  f.readProjection = () => readCurrent({ auth: { uid }, data: { sessionId: sid } });
  f.resumeSessionOnly = async () => {
    const resumeContext = createContext({ reply: { player: { ...f.store.getState().me } }, sessionId: sid, uid,
      currentMemberSessionReader: f.readProjection });
    const reply = await new Script(js(`(async () => { ${resumeReturn.getText(index)} })()`)).runInContext(resumeContext);
    f.store.setState({ session: plain(reply.session), me: plain(reply.player), identityHydrationRevision: 1,
      connection: 'live', sessionSnapshotFreshness: 'server' });
    return plain(reply);
  };
  f.receiveMemberProjection = async () => {
    const response = plain(await f.readProjection()), current = f.store.getState();
    const feedContext = createContext({ response, projectedSession: response.session, closedHistory: false,
      scope: response.session.memberSessionScope, memberPlayer: current.me });
    new Script(js([fn(identifiers, 'isWireSafeEntityId'), fn(identifiers, 'isEntityId'), fn(identifiers, 'parseEntityId'),
      fn(firestore, 'recordValue'), fn(firestore, 'currentActorBerthAuthorityFrom')].join('\n'))).runInContext(feedContext);
    const projected = new Script(js(`(${feedSession.initializer.getText(firestore)})`)).runInContext(feedContext);
    f.store.setState({ session: plain(projected), connection: 'live', sessionSnapshotFreshness: 'server' });
    return response;
  };
  const link = (name, target, claim = false) => ({ waitFor: async ({ timeout }) => assert.ok(timeout > 0 && timeout <= 35000),
    isVisible: async () => true, click: async () => { f.uiChoices.push(name); path = target;
      if (claim) { await f.normalClaim(); if (publishAfterClaim) await f.receiveMemberProjection(); } }, first() { return this; } });
  f.crew.page.url = () => `http://native.invalid/${path}`;
  f.crew.page.getByRole = (_kind, { name }) => {
    assert.equal(name, "Enter this actor's stations"); return link(name, '#/console');
  };
  f.crew.page.locator = selector => {
    assert.equal(selector, `a[href$="/roles/${actorRoleId}"]`);
    return link('original-role-chooser', `#/ships/aegis/roles/${actorRoleId}`, true);
  };
  f.crew.page.waitForURL = async (predicate, { timeout }) => { assert.ok(timeout > 0 && timeout <= 35000);
    assert.ok(predicate(new URL(f.crew.page.url()))); };
  f.setHeldRoute = () => { path = actorRoleId === 'press-officer' ? '#/press' :
    actorRoleId === 'joint-engineering-quellon-refinery' || actorRoleId === 'joint-engineering-shepherd-icebreaker'
      ? `#/union/roles/${actorRoleId}` : `#/ships/aegis/roles/${actorRoleId}`; };
  const adapter = createTwoBrowserGameplay({ gm: {}, crew: f.crew, initial: { sessionId: sid, joinCode: 'NATIVE' },
    started: freshDemo ? { fullGameDemo: marker, phase: 'active', cycle: 1, phaseProgression: 'manual' } : undefined,
    roster: [{ roleId: actorRoleId, uidHash: f.callbackRows[0]?.value.uidHash ??
      // Only the same original fixture UID hash; no credentials or source writes.
      require('node:crypto').createHash('sha256').update(uid).digest('hex').slice(0, 16) }], directory: '/native-no-files' });
  f.run = options => adapter.select(actorRoleId, { deadlineAt: Date.now() + 1500, ...options });
  return f;
}
