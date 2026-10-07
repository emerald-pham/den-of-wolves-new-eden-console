import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createContext, Script, SyntheticModule } from 'node:vm';
import { createTwoBrowserGameplay } from '../pc10-two-browser-gameplay.mjs';
import { projectionFixture } from './pc10-member-projection-native-fixture.mjs';

// Native-only public selection, actual normal client resume/fence functions,
// actual member transaction/feed parser, and server lease increment. Inert
// transport at the ordinary route entry; no browser or gameplay acceptance.
const require = createRequire(import.meta.url), ts = require('typescript');
const sources = {};
for (const path of ['src/lib/sessionService.ts', 'src/lib/sessionSnapshotAuthority.ts', 'functions/src/index.ts']) {
  const text = await readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
  sources[path] = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
}
function sourceFunction(path, name) {
  const matches = [];
  function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === name) matches.push(node); ts.forEachChild(node, visit); }
  visit(sources[path]); assert.equal(matches.length, 1); return matches[0].getText(sources[path]);
}
const js = code => ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText.replace(/^export\s+/gm, '');
const resumeReplyDeclarations = [];
function findReply(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(sources['functions/src/index.ts']) === 'reply' &&
      node.initializer?.getText(sources['functions/src/index.ts']).includes('connectionGeneration: resumeResult.connectionGeneration')) resumeReplyDeclarations.push(node);
  ts.forEachChild(node, findReply);
}
findReply(sources['functions/src/index.ts']); assert.equal(resumeReplyDeclarations.length, 1);
const resumeReplySource = resumeReplyDeclarations[0].initializer.getText(sources['functions/src/index.ts']);
const sha = uid => createHash('sha256').update(uid).digest('hex').slice(0, 16);
const plain = value => JSON.parse(JSON.stringify(value));

export async function stationNavigationResumeFixture(options = {}) {
  const roleId = 'icebreaker-captain', f = projectionFixture({ actorRoleId: roleId, freshDemo: true });
  f.store.setState({ me: { ...f.store.getState().me, connectionGeneration: 2,
    ...(options.initialSeatNull ? { seatId: null } : {}) },
    ...(options.initialSeatNull ? { seats: [{ id: roleId, roleId, status: 'open', holderUid: null }] } : {}) });
  await f.resumeSessionOnly(); await f.receiveMemberProjection();
  const start = f.store.getState(), uid = start.me.uid, sid = start.session.id;
  const directory = await mkdtemp(join(tmpdir(), 'pc10-native-navigation-'));
  const events = new EventEmitter(), sdkRequests = [], application = [], seatClaims = [], lifecycleCommands = [];
  let actualNormalClaim, acceptanceClaims = 0;
  let resumedServerPlayer;
  if (options.initialSeatNull) {
    // Actual normal client selection/claimSeat with inert Native receipt
    // application. Base22 independently records the real server200 claim.
    const claimContext = createContext({ useSessionStore: { getState: f.store.getState },
      commandId: () => 'native-seat-receipt', expectedSetupRevision: () => 0,
      sessionAuthorityUid: state => state.me.uid,
      sessionAuthorityCheckpoint: (sessionId, actorUid) => ({ sessionId, actorUid }),
      authorityCheckpointIsCurrent: checkpoint => checkpoint.sessionId === sid && checkpoint.actorUid === f.authUid,
      requireStationReselection: () => assert.fail('Original open native seat must remain eligible.'),
      interception: error => ({ code: error.code }),
      refreshPresence: async selected => { assert.equal(selected, roleId); f.counters.sourcePresence++; },
      sendOrQueue: async command => {
        assert.equal(command.kind, 'claimSeat'); assert.equal(command.payload.sessionId, sid);
        assert.equal(command.payload.seatId, roleId); seatClaims.push(plain(command));
        const state = f.store.getState();
        f.store.setState({ me: { ...state.me, seatId: options.foreignSeat ? 'foreign-seat' : roleId },
          seats: state.seats.map(seat => ({ ...seat, status: 'claimed', holderUid: uid })) });
        return 'applied';
      },
    });
    new Script(js(sourceFunction('src/lib/sessionService.ts', 'claimSeat') + '\n' +
      sourceFunction('src/lib/sessionService.ts', 'selectConsoleRole'))).runInContext(claimContext);
    actualNormalClaim = () => new Script(`selectConsoleRole(${JSON.stringify(roleId)})`).runInContext(claimContext);
    f.normalClaim = () => options.claimDuringAcceptance ? undefined : actualNormalClaim();
  }
  const authorityContext = createContext({});
  new Script(js('const sessionSnapshotAuthorities = new Map(); const memberResumeTokens = new WeakMap();\n' +
    ['createSessionSnapshotAuthority', 'beginMemberSessionResume', 'isCurrentMemberSessionResume',
      'finishMemberSessionResume', 'memberSessionResumeBlocksFreshness', 'sessionSnapshotAuthorityFor']
      .map(name => sourceFunction('src/lib/sessionSnapshotAuthority.ts', name)).join('\n'))).runInContext(authorityContext);
  const authorityFns = new Script('({beginMemberSessionResume,isCurrentMemberSessionResume,finishMemberSessionResume,memberSessionResumeBlocksFreshness,sessionSnapshotAuthorityFor})').runInContext(authorityContext);
  const authority = authorityFns.sessionSnapshotAuthorityFor(sid, uid); authority.hasServerSessionAuthority = true;
  const leaseContext = createContext({ HttpsError: class extends Error {} });
  new Script(js(sourceFunction('functions/src/index.ts', 'nextConnectionGeneration'))).runInContext(leaseContext);
  const nextGeneration = new Script('nextConnectionGeneration').runInContext(leaseContext);
  const sourceResumeContext = createContext({ ...authorityFns,
    useSessionStore: { getState: f.store.getState }, auth: () => ({ currentUser: { uid: f.authUid } }),
    functions: () => ({}), ensureSignedIn: async () => assert.equal(f.authUid, uid),
    applySession: reply => {
      if (options.rejectApply) return false;
      const current = f.store.getState();
      application.push({ beforeGeneration: current.me?.connectionGeneration ?? null, replyGeneration: reply.player.connectionGeneration });
      f.store.setState({ me: plain(reply.player), session: plain(reply.session),
        identityHydrationRevision: current.identityHydrationRevision + 1 }); return true;
    },
    httpsCallable: (_runtime, endpoint) => async data => {
      assert.ok(['joinSession', 'resumeSession'].includes(endpoint)); sdkRequests.push(endpoint);
      const before = f.store.getState();
      const player = endpoint === 'joinSession' ? { ...start.me, assignedRoleId: null, activeConsoleRoleId: null, seatId: null, connectionGeneration: 1 }
        : { ...before.me, connectionGeneration: nextGeneration({ get: key => before.me[key] }) };
      let reply = { player, session: { ...(endpoint === 'joinSession' ? start.session : before.session) } };
      if (options.sourceResumeReply) {
        resumedServerPlayer = { ...player };
        const server = createContext({ uid, sessionId: sid,
          resumeResult: { seatId: player.seatId, connectionGeneration: player.connectionGeneration },
          playerSnap: { get: key => player[key] }, cleanName: value => value ?? 'Native player',
          isoOf: () => undefined, playerEscapeState: () => undefined });
        reply = plain(new Script(js(`(${resumeReplySource})`)).runInContext(server));
        assert.equal(Object.hasOwn(reply.player, 'connected'), false, 'Use the exact current server DTO, not an invented connected flag.');
        reply.session = { ...(endpoint === 'joinSession' ? start.session : before.session) };
      }
      delete reply.session.currentActorBerthAuthority;
      options.mutateReply?.(reply);
      if (endpoint === 'joinSession') { assert.equal(data.joinCode, 'NATIVE'); return { data: reply }; }
      const request = { method: () => 'POST', url: () => 'http://127.0.0.1:5011/demo-native/us-central1/resumeSession',
        postDataJSON: () => ({ data: { sessionId: options.requestSession ?? data.sessionId } }),
        allHeaders: () => assert.fail('No request headers'), headers: () => assert.fail('No request headers') };
      if (!options.hideRequest) events.emit('request', request);
      const response = { request: () => request, url: request.url, status: () => options.httpStatus ?? 200,
        json: async () => options.responseBodyPending ? new Promise(() => {}) :
          options.responseError ? { error: { status: 'PERMISSION_DENIED' } } : { result: reply } };
      if (!options.hideResponse) events.emit('response', response);
      return { data: reply };
    },
  });
  new Script(js(sourceFunction('src/lib/sessionService.ts', 'resumeSession') + '\n' + sourceFunction('src/lib/sessionService.ts', 'joinSession'))).runInContext(sourceResumeContext);
  const resume = new Script('resumeSession').runInContext(sourceResumeContext);
  const joinSession = new Script('joinSession').runInContext(sourceResumeContext);
  const gmContext = createContext({ useSessionStore: { getState: () => ({ session: { id: sid }, gmInstance: { id: 'native-owned-gm' } }) },
    commandId: () => 'native-lifecycle-command', sendOrQueue: async command => {
      lifecycleCommands.push(plain(command)); assert.equal(command.payload.sessionId, sid); assert.equal(command.payload.targetUid, uid);
      const current = f.store.getState();
      if (command.kind === 'assignRole') { assert.equal(command.payload.roleId, roleId); f.store.setState({ me: { ...current.me, assignedRoleId: roleId } }); }
      else { assert.equal(command.kind, 'releaseRole'); f.store.setState({ me: { ...current.me, assignedRoleId: null, activeConsoleRoleId: null, seatId: null },
        seats: current.seats.map(seat => ({ ...seat, status: 'open', holderUid: null })) }); }
      return 'applied';
    } });
  new Script(js(sourceFunction('src/lib/sessionService.ts', 'assignRole') + '\n' + sourceFunction('src/lib/sessionService.ts', 'releaseRole'))).runInContext(gmContext);
  const clientAssignRole = async () => { await new Script(`assignRole(${JSON.stringify(uid)},${JSON.stringify(roleId)})`).runInContext(gmContext); await f.receiveMemberProjection(); };
  const clientReleaseRole = async () => { await new Script(`releaseRole(${JSON.stringify(uid)})`).runInContext(gmContext); await f.receiveMemberProjection(); };
  const clientJoin = async () => { f.store.setState({ session: null, me: null, identityHydrationRevision: 0 }); await joinSession('NATIVE'); await f.receiveMemberProjection(); };
  const originalEvaluate = f.crew.page.evaluate;
  f.crew.page.evaluate = async (callback, input) => {
    if (typeof input === 'string') return originalEvaluate(callback, input);
    if (options.acceptanceObservationPending) return new Promise(() => {});
    const crypto = { subtle: { digest: async (algorithm, bytes) => {
      const digest = await webcrypto.subtle.digest(algorithm, bytes);
      if (options.claimDuringAcceptance && acceptanceClaims++ === 0) {
        await actualNormalClaim();
        options.afterAcceptanceClaim?.(f);
        if (!options.staleAfterAcceptanceClaim) await f.receiveMemberProjection();
      }
      return digest;
    } } };
    const browser = createContext({ input, crypto, TextEncoder, performance: { timeOrigin: options.newDocument ? 2000 : 1000 } });
    const exports = new Map([
      ['/src/store/useSessionStore.ts', { useSessionStore: { getState: f.store.getState } }],
      ['/src/lib/firebase.ts', { auth: () => ({ currentUser: { uid: f.authUid } }) }],
      ['/src/lib/sessionSnapshotAuthority.ts', authorityFns],
    ]);
    const modules = new Map();
    for (const [name, values] of exports) {
      const module = new SyntheticModule(Object.keys(values), function () {
        for (const [key, value] of Object.entries(values)) this.setExport(key, value);
      }, { context: browser });
      await module.link(() => assert.fail('No extra transport')); await module.evaluate(); modules.set(name, module);
    }
    return plain(await new Script(`(${callback.toString()})(input)`, { importModuleDynamically: async name => {
      assert.ok(modules.has(name), name); return modules.get(name);
    } }).runInContext(browser));
  };
  f.crew.page.on = (...args) => { events.on(...args); return f.crew.page; };
  f.crew.page.off = (...args) => { events.off(...args); return f.crew.page; };
  const receiveMemberProjection = f.receiveMemberProjection;
  f.receiveMemberProjection = async () => {
    if (options.sourceResumeReply && resumedServerPlayer) {
      const current = f.store.getState();
      f.store.setState({ me: { ...current.me, connected: options.disconnectedMemberFeed ? false : resumedServerPlayer.connected } });
    }
    return receiveMemberProjection();
  };
  let forcedRoute; const originalUrl = f.crew.page.url;
  f.crew.page.url = () => forcedRoute ? originalUrl().replace(/#.*/, `#${forcedRoute}`) : originalUrl();
  f.setActorRoute = () => { forcedRoute = '/demo-actors'; };
  const originalGetByRole = f.crew.page.getByRole;
  f.crew.page.getByRole = (...args) => { const link = originalGetByRole(...args), click = link.click; link.click = async () => { forcedRoute = undefined; await click(); }; return link; };
  const originalLocator = f.crew.page.locator;
  f.crew.page.locator = selector => {
    const link = originalLocator(selector), click = link.click;
    link.click = async () => {
      forcedRoute = undefined;
      if (options.resumeBeforeClaim && !options.skipResume) await resume(sid);
      await click();
      if (options.unwitnessed) {
        const current = f.store.getState(); f.store.setState({ me: { ...current.me, connectionGeneration: current.me.connectionGeneration + 1 }, identityHydrationRevision: 2 });
      } else if (!options.skipResume && !options.resumeBeforeClaim) {
        await resume(sid);
        if (options.forgeAfterRejected) {
          const current = f.store.getState(); f.store.setState({ me: { ...current.me, connectionGeneration: current.me.connectionGeneration + 1 }, identityHydrationRevision: 2 });
        }
      }
      options.mutateAfter?.(f);
      if (!options.noFreshMember) await f.receiveMemberProjection();
      else if (options.feedAfterMs !== undefined) setTimeout(() => void f.receiveMemberProjection(), options.feedAfterMs);
      if (options.pendingNewerResume) authorityFns.beginMemberSessionResume(authority);
    };
    return link;
  };
  const adapter = createTwoBrowserGameplay({ gm: {}, crew: f.crew, initial: { sessionId: sid, joinCode: 'NATIVE' },
    started: { fullGameDemo: { status: 'active', progression: 'manual' } },
    roster: [{ roleId, uidHash: sha(uid) }], directory });
  return { ...f, sdkRequests, application, seatClaims, lifecycleCommands, clientJoin, clientAssignRole, clientReleaseRole, directory, events, adapter,
    run: () => adapter.select(roleId, { deadlineAt: Date.now() + (options.shortDeadline ? 120 : 1500) }),
    cleanup: () => rm(directory, { recursive: true, force: true }) };
}

