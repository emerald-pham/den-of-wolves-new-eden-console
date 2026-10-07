import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createContext, Script, SyntheticModule } from 'node:vm';
import { projectionFixture } from './pc10-member-projection-native-fixture.mjs';
import { createTwoBrowserGameplay } from '../pc10-two-browser-gameplay.mjs';

// Native-only: actual public account adapter, member transaction/feed parser,
// client resume + SDK fence, store identity hydration and App retry callback.
// SDK transport and session-content cursor acceptance are inert ports. This
// is not a browser, authenticated emulator run, or actual Base23 cause claim.
const require = createRequire(import.meta.url), ts = require('typescript');
const sources = new Map();
for (const path of ['src/lib/sessionService.ts', 'src/lib/sessionSnapshotAuthority.ts', 'src/store/useSessionStore.ts',
  'src/App.tsx', 'functions/src/index.ts']) {
  const text = await readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
  sources.set(path, ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true));
}
function only(path, predicate) {
  const source = sources.get(path), values = [];
  function visit(node) { if (predicate(node, source)) values.push(node); ts.forEachChild(node, visit); }
  visit(source); assert.equal(values.length, 1, path); return values[0].getText(source);
}
const fn = (path, name) => only(path, node => ts.isFunctionDeclaration(node) && node.name?.text === name);
const js = code => ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText.replace(/^export\s+/gm, '');
const plain = value => JSON.parse(JSON.stringify(value));
const sha = uid => createHash('sha256').update(uid).digest('hex').slice(0, 16);
const retry = only('src/App.tsx', (node, source) => ts.isVariableDeclaration(node) && node.name.getText(source) === 'retry' &&
  node.initializer?.getText(source).includes('pendingStationMemberRefresh'));
const identity = only('src/store/useSessionStore.ts', (node, source) => ts.isPropertyAssignment(node) &&
  node.name.getText(source) === 'setIdentity' && ts.isArrowFunction(node.initializer));
const reply = only('functions/src/index.ts', (node, source) => ts.isVariableDeclaration(node) && node.name.getText(source) === 'reply' &&
  node.initializer?.getText(source).includes('connectionGeneration: resumeResult.connectionGeneration'));

export async function presentationStartFixture({ roleId = 'press-officer', held = false, publish = true, onDigest } = {}) {
  const f = projectionFixture({ actorRoleId: roleId, freshDemo: false, released: !held });
  if (roleId === 'press-officer') f.memberGroup = { id: 'fleet-1', vesselIds: ['aegis'],
    memberUids: [f.store.getState().me.uid], memberShipIds: {} };
  await f.resumeSessionOnly(); if (publish) await f.receiveMemberProjection();
  const state = f.store.getState(), uid = state.me.uid, sid = state.session.id;
  f.store.setState({ session: { ...state.session, phase: 'casting', currentTurn: 0, setupConfirmed: true,
    fullGameDemo: { status: 'preparing', progression: 'manual' }, pressEnabled: true }, gmInstance: null,
    setConnection: connection => f.store.setState({ connection }),
    setSessionSnapshotFreshness: sessionSnapshotFreshness => f.store.setState({ sessionSnapshotFreshness }),
    setCommunicationError: communicationError => f.store.setState({ communicationError }),
    disconnect: () => assert.fail('No terminal identity failure in a successful Native recovery.') });
  const sourceIdentity = identity.slice(identity.indexOf(':') + 1);
  const identityContext = createContext({ set: update => f.store.setState(update(f.store.getState())),
    clearVoyageMovement: session => session, samePrivateAssignment: () => false });
  f.store.setState({ setIdentity: new Script(js(`(${sourceIdentity})`)).runInContext(identityContext) });
  const authorityContext = createContext({});
  new Script(js('const sessionSnapshotAuthorities = new Map(); const memberResumeTokens = new WeakMap();\n' +
    ['createSessionSnapshotAuthority', 'beginMemberSessionResume', 'isCurrentMemberSessionResume', 'finishMemberSessionResume',
      'memberSessionResumeBlocksFreshness', 'sessionSnapshotAuthorityFor'].map(name => fn('src/lib/sessionSnapshotAuthority.ts', name)).join('\n')))
    .runInContext(authorityContext);
  const authorityFns = new Script('({beginMemberSessionResume,isCurrentMemberSessionResume,finishMemberSessionResume,memberSessionResumeBlocksFreshness,sessionSnapshotAuthorityFor})')
    .runInContext(authorityContext);
  const authority = authorityFns.sessionSnapshotAuthorityFor(sid, uid); authority.hasServerSessionAuthority = true;
  const leaseContext = createContext({ HttpsError: class extends Error {} });
  new Script(js(fn('functions/src/index.ts', 'nextConnectionGeneration'))).runInContext(leaseContext);
  const nextGeneration = new Script('nextConnectionGeneration').runInContext(leaseContext);
  const sdkCalls = [], replies = [], events = new EventEmitter(); let serverPlayer;
  f.crew.page.on = (...args) => { events.on(...args); return f.crew.page; };
  f.crew.page.off = (...args) => { events.off(...args); return f.crew.page; };
  f.events = events;
  const client = createContext({ ...authorityFns, useSessionStore: { getState: f.store.getState },
    auth: () => ({ currentUser: { uid: f.authUid } }), functions: () => ({}),
    window: { navigator: { onLine: true } }, ensureSignedIn: async () => assert.equal(f.authUid, uid),
    TERMINAL_RESUME_ERRORS: new Set(), errorCode: error => error.code,
    flushPendingCommands: async () => true, reconcileGmAuthority: () => assert.fail('A player cannot reconcile GM.'),
    clearConnectRateLimitAfterAuthority: () => {}, isRateLimitedCommandError: () => false,
    normalizeShuttleManifest: (dockings, visits) => ({ dockings: dockings ?? {}, visits: visits ?? [] }),
    acceptCallableSessionAuthority: () => { if (f.rejectApply) return false; authority.hasServerSessionAuthority = true; return true; },
    clearPrivateStationState: () => {}, stationSelectionNotice: () => ({ code: 'permission-denied', kind: 'station-selection-required' }),
    httpsCallable: (_runtime, endpoint) => async data => {
      assert.equal(endpoint, 'resumeSession'); assert.equal(data.sessionId, sid); sdkCalls.push(endpoint);
      if (f.rejectResume) throw Object.assign(new Error('Native denied resume.'), { code: 'permission-denied' });
      const before = f.store.getState(); serverPlayer = { ...before.me,
        activeConsoleRoleId: f.resumeConsoleNull ? null : before.me.activeConsoleRoleId,
        connectionGeneration: nextGeneration({ get: key => before.me[key] }) };
      const server = createContext({ uid, sessionId: sid, resumeResult: { seatId: serverPlayer.seatId,
        connectionGeneration: serverPlayer.connectionGeneration }, playerSnap: { get: key => serverPlayer[key] },
        cleanName: value => value ?? 'Native Press', isoOf: () => undefined, playerEscapeState: () => undefined });
      const actualReply = plain(new Script(js(`(function () { ${reply} return reply; })()`)).runInContext(server));
      actualReply.session = { ...before.session }; delete actualReply.session.currentActorBerthAuthority;
      const request = { method: () => 'POST', url: () => 'http://127.0.0.1:5011/demo-native/us-central1/resumeSession',
        postDataJSON: () => ({ data: { sessionId: sid } }),
        headers: () => assert.fail('No headers'), allHeaders: () => assert.fail('No headers') };
      if (!f.hideRequest) events.emit('request', request);
      if (!f.hideResponse) events.emit('response', { request: () => request, status: () => f.responseStatus ?? 200, url: request.url,
        json: async () => f.responseBodyPending ? new Promise(() => {}) :
          ({ result: f.mutateEvidenceReply ? f.mutateEvidenceReply(plain(actualReply)) : actualReply }) });
      replies.push(actualReply); return { data: actualReply };
    },
  });
  new Script(js('let latestConnectAttemptGeneration = 0; let resumeRateLimitHold;\n' +
    ['applySession', 'resumeSession', 'connectWithRetryPolicy'].map(name => fn('src/lib/sessionService.ts', name)).join('\n'))).runInContext(client);
  const autoConnect = () => new Script('connectWithRetryPolicy(true)').runInContext(client);
  let retryTick;
  const app = createContext({ useSessionStore: { getState: f.store.getState }, CONNECT_RETRY_INTERVAL_MS: 2000,
    pendingStationMemberRefresh: undefined, readClosedHistoryIfReady: () => {},
    connectAutomaticallyDeduplicated: autoConnect, run: callback => { f.pendingRetry = callback(); },
    window: { setInterval: callback => { retryTick = callback; return 1; } } });
  new Script(js(`const ${retry};`)).runInContext(app);
  f.automaticRetry = async ({ feed = true } = {}) => { retryTick(); await f.pendingRetry;
    if (feed && serverPlayer && !f.rejectApply) {
      const current = f.store.getState(); f.store.setState({ me: { ...current.me, connected: serverPlayer.connected } });
      await f.receiveMemberProjection();
    } };
  f.beginNewerResume = () => authorityFns.beginMemberSessionResume(authority);
  f.revokeServerAuthority = () => { authority.hasServerSessionAuthority = false; };
  f.authority = authority;
  let observations = 0;
  const originalEvaluate = f.crew.page.evaluate;
  f.crew.page.evaluate = async (callback, input) => {
    if (!callback.toString().includes('memberSessionResumeBlocksFreshness')) return originalEvaluate(callback, input);
    const crypto = { subtle: { digest: async (algorithm, bytes) => {
      const digest = await webcrypto.subtle.digest(algorithm, bytes); await onDigest?.(f, ++observations); return digest;
    } } };
    const browser = createContext({ input, crypto, TextEncoder, performance: { timeOrigin: 1000 } });
    const exports = new Map([
      ['/src/store/useSessionStore.ts', { useSessionStore: { getState: f.store.getState } }],
      ['/src/lib/firebase.ts', { auth: () => ({ currentUser: f.authUid ? { uid: f.authUid } : null }) }],
      ['/src/lib/demoActorContext.ts', { activeDemoActorProfile: { roleId, sessionId: sid } }],
      ['/src/lib/sessionSnapshotAuthority.ts', authorityFns],
    ]);
    const modules = new Map();
    for (const [name, values] of exports) {
      const module = new SyntheticModule(Object.keys(values), function () {
        for (const [key, value] of Object.entries(values)) this.setExport(key, value);
      }, { context: browser });
      await module.link(() => assert.fail('No extra Native transport.')); await module.evaluate(); modules.set(name, module);
    }
    const result = plain(await new Script(`(${callback.toString()})(input)`, { importModuleDynamically: async name => {
      assert.ok(modules.has(name), name); return modules.get(name);
    } }).runInContext(browser));
    f.presentationRows.push(result); return result;
  };
  f.presentationRows = []; f.sdkCalls = sdkCalls; f.resumeReplies = replies;
  f.actorOptions = { sessionId: sid, controller: { sessionId: sid, uidHash: sha('native-controller') },
    roster: [{ roleId, uidHash: sha(uid) }], confirmedRoleIds: roleId === 'press-officer' ? ['admiral'] : [roleId], pressIncluded: true };
  const adapter = createTwoBrowserGameplay({ gm: {}, crew: f.crew, initial: { sessionId: sid, joinCode: 'NATIVE' },
    prepared: { fullGameDemo: { status: 'preparing', progression: 'manual' } }, roster: f.actorOptions.roster, directory: '/native-no-files' });
  f.account = () => adapter.select(roleId, { enter: false, deadlineAt: Date.now() + 1000 });
  f.setOffline = () => f.store.setState({ connection: 'offline', sessionSnapshotFreshness: 'cache',
    communicationError: { code: 'permission-denied', kind: 'station-selection-required' } });
  return f;
}
