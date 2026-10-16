import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createContext, Script, SyntheticModule } from 'node:vm';
import { createTwoBrowserGameplay } from '../pc10-two-browser-gameplay.mjs';
import { observeFullGameDemoPresentationMember } from '../pc10-full-game-demo-proof-helpers.mjs';
import { projectionFixture } from './pc10-member-projection-native-fixture.mjs';

// Native-only public selection, actual normal client resume/fence functions,
// actual member transaction/feed parser, and server lease increment. Inert
// transport at the ordinary route entry; no browser or gameplay acceptance.
const require = createRequire(import.meta.url), ts = require('typescript');
const sources = {};
for (const path of ['src/lib/sessionService.ts', 'src/lib/sessionSnapshotAuthority.ts', 'functions/src/index.ts', 'src/App.tsx']) {
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
  const roleId = options.roleId ?? 'icebreaker-captain', f = projectionFixture({ actorRoleId: roleId, freshDemo: true });
  f.store.setState({ me: { ...f.store.getState().me, connectionGeneration: options.initialGeneration ?? 2,
    ...(options.initialActiveRole ? { activeConsoleRoleId: roleId } : {}),
    ...(options.initialSeatNull ? { seatId: null } : {}) },
    ...(options.initialSeatNull ? { seats: [{ id: roleId, roleId, status: 'open', holderUid: null }] } : {}) });
  await f.resumeSessionOnly(); await f.receiveMemberProjection();
  const start = f.store.getState(), uid = start.me.uid, sid = start.session.id;
  const directory = await mkdtemp(join(tmpdir(), 'pc10-native-navigation-'));
  const events = new EventEmitter(), sdkRequests = [], application = [], seatClaims = [], lifecycleCommands = [];
  const retryDeclarations = [];
  const findRetry = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(sources['src/App.tsx']) === 'retry' &&
        ts.isCallExpression(node.initializer) && node.initializer.arguments[0]?.getText(sources['src/App.tsx']).includes("state.connection !== 'live'")) retryDeclarations.push(node);
    ts.forEachChild(node, findRetry);
  };
  findRetry(sources['src/App.tsx']); assert.equal(retryDeclarations.length, 1);
  const retrySource = retryDeclarations[0].initializer.arguments[0].getText(sources['src/App.tsx']);
  // Inert transport barriers reproduce the real native ordering: the own-player
  // feed can publish the server lease before HTTP delivery or SDK application.
  // The actual source resume/finally fence still owns identity hydration.
  const barrier = () => { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; };
  const responseGate = barrier(), applicationGate = barrier(), requestObserved = barrier(), earlyObservation = barrier();
  const deferredResume = options.deferResumeResponse || options.deferResumeApplication;
  let backgroundResume;
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
    new Script(js(sourceFunction('src/lib/sessionService.ts', 'claimSeatWithReceipt') + '\n' +
      sourceFunction('src/lib/sessionService.ts', 'claimSeat') + '\n' +
      sourceFunction('src/lib/sessionService.ts', 'selectConsoleRole'))).runInContext(claimContext);
    actualNormalClaim = () => new Script(`selectConsoleRole(${JSON.stringify(roleId)})`).runInContext(claimContext);
    f.normalClaim = () => options.claimDuringAcceptance ? undefined : actualNormalClaim();
  }
  const authorityContext = createContext({});
  new Script(js('const sessionSnapshotAuthorities = new Map(); const memberResumeTokens = new WeakMap(); const wingFirstEntries = new WeakMap(); const admiralFirstEntries = new WeakMap();\n' +
    ['finishAdmiralFirstEntry', 'createSessionSnapshotAuthority', 'beginMemberSessionResume', 'isCurrentMemberSessionResume',
      'finishMemberSessionResume', 'memberSessionResumeBlocksFreshness', 'sessionSnapshotAuthorityFor']
      .map(name => sourceFunction('src/lib/sessionSnapshotAuthority.ts', name)).join('\n'))).runInContext(authorityContext);
  const authorityFns = new Script('({beginMemberSessionResume,isCurrentMemberSessionResume,finishMemberSessionResume,memberSessionResumeBlocksFreshness,sessionSnapshotAuthorityFor})').runInContext(authorityContext);
  const authority = authorityFns.sessionSnapshotAuthorityFor(sid, uid); authority.hasServerSessionAuthority = true;
  // A Vite query-qualified mounted module and a later bare import can own
  // different module maps/WeakMaps. Evaluate the same actual Source functions
  // in a second module closure; only the mounted closure is used by normal SDK
  // resume below. This is Native-only, with no browser or transport acceptance.
  const mountedAuthorityUrl = '/src/lib/sessionSnapshotAuthority.ts?t=native-mounted-app';
  let bareAuthorityFns = authorityFns;
  if (options.distinctMountedAuthority) {
    const bareContext = createContext({});
    new Script(js('const sessionSnapshotAuthorities = new Map(); const memberResumeTokens = new WeakMap(); const wingFirstEntries = new WeakMap(); const admiralFirstEntries = new WeakMap();\n' +
      ['finishAdmiralFirstEntry', 'createSessionSnapshotAuthority', 'beginMemberSessionResume', 'isCurrentMemberSessionResume',
        'finishMemberSessionResume', 'memberSessionResumeBlocksFreshness', 'sessionSnapshotAuthorityFor']
        .map(name => sourceFunction('src/lib/sessionSnapshotAuthority.ts', name)).join('\n'))).runInContext(bareContext);
    bareAuthorityFns = new Script('({beginMemberSessionResume,isCurrentMemberSessionResume,finishMemberSessionResume,memberSessionResumeBlocksFreshness,sessionSnapshotAuthorityFor})').runInContext(bareContext);
    if (options.bareDecoyAccepted) bareAuthorityFns.sessionSnapshotAuthorityFor(sid, uid).hasServerSessionAuthority = true;
  }
  const authorityImports = [];
  const presentationAcceptanceReads = [];
  f.crew.sessionAuthorityModuleUrl = () => Object.hasOwn(options, 'capturedAuthorityModuleUrl')
    ? options.capturedAuthorityModuleUrl : mountedAuthorityUrl;
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
        assert.equal(reply.player.connected, player.connected,
          'Use the post-commit player snapshot value from the exact current server DTO.');
        reply.session = { ...(endpoint === 'joinSession' ? start.session : before.session) };
      }
      delete reply.session.currentActorBerthAuthority;
      options.mutateReply?.(reply);
      if (endpoint === 'joinSession') { assert.equal(data.joinCode, 'NATIVE'); return { data: reply }; }
      const request = { method: () => 'POST', url: () => 'http://127.0.0.1:5011/demo-native/us-central1/resumeSession',
        postDataJSON: () => ({ data: { sessionId: options.requestSession ?? data.sessionId } }),
        allHeaders: () => assert.fail('No request headers'), headers: () => assert.fail('No request headers') };
      if (!options.hideRequest) events.emit('request', request);
      if (options.publishGenerationBeforeResponse) {
        const current = f.store.getState();
        f.store.setState({ me: { ...current.me, connectionGeneration: player.connectionGeneration },
          connection: 'offline', sessionSnapshotFreshness: 'cache' });
      }
      requestObserved.release();
      if (options.failResumeRequest) events.emit('requestfailed', request);
      if (options.deferResumeResponse) await responseGate.promise;
      const response = { request: () => request, url: request.url, status: () => options.httpStatus ?? 200,
        json: async () => options.responseBodyPending ? new Promise(() => {}) :
          options.responseError ? { error: { status: 'PERMISSION_DENIED' } } : { result: reply } };
      if (!options.hideResponse) events.emit('response', response);
      if (options.deferResumeApplication) await applicationGate.promise;
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
  const evaluateMemberCallback = async (callback, input) => {
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
      ['/src/lib/demoActorContext.ts', { activeDemoActorProfile: { roleId, sessionId: sid } }],
      ['/src/lib/sessionSnapshotAuthority.ts', bareAuthorityFns],
      [mountedAuthorityUrl, authorityFns],
    ]);
    const modules = new Map();
    for (const [name, values] of exports) {
      const module = new SyntheticModule(Object.keys(values), function () {
        for (const [key, value] of Object.entries(values)) this.setExport(key, value);
      }, { context: browser });
      await module.link(() => assert.fail('No extra transport')); await module.evaluate(); modules.set(name, module);
    }
    return plain(await new Script(`(${callback.toString()})(input)`, { importModuleDynamically: async name => {
      assert.ok(modules.has(name), name);
      if (name.includes('sessionSnapshotAuthority.ts')) authorityImports.push(name);
      return modules.get(name);
    } }).runInContext(browser));
  };
  f.crew.page.evaluate = async (callback, input) => {
    if (typeof input === 'string') {
      const value = await originalEvaluate(callback, input);
      if ((deferredResume || options.unmatchedLeaseBeforeRetry) && value.connectionGeneration === start.me.connectionGeneration + (options.externalGenerationDelta ?? 1) &&
          value.identityHydrationRevision === start.identityHydrationRevision) earlyObservation.release(value);
      return value;
    }
    const value = await evaluateMemberCallback(callback, input);
    if (options.nativePresentationAcceptance && Object.hasOwn(value, 'clientAcceptance')) {
      // Execute the exact reader used by the retained recharge proof, including
      // its mounted authority module and post-digest identity observation.
      const current = await observeFullGameDemoPresentationMember({ ...f.crew,
        page: { ...f.crew.page, evaluate: evaluateMemberCallback } }, { knownRoleIds: [roleId] });
      presentationAcceptanceReads.push(current); return current;
    }
    return value;
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
      if (options.unmatchedLeaseBeforeRetry) {
        // External own-player listener boundary: another already authenticated
        // demo document's ordinary server resume commits first. The source
        // generation allocator owns the value; local SDK hydration is untouched.
        const current = f.store.getState();
        let generation = current.me.connectionGeneration;
        for (let i = 0; i < (options.externalGenerationDelta ?? 1); i++)
          generation = nextGeneration({ get: key => key === 'connectionGeneration' ? generation : current.me[key] });
        f.store.setState({ me: { ...current.me, connectionGeneration: generation },
          connection: 'offline', sessionSnapshotFreshness: 'cache' });
        options.mutateListener?.(f);
        backgroundResume = (async () => {
          await earlyObservation.promise;
          await new Promise(resolve => setTimeout(resolve, 0));
          if (options.noAutomaticRetry) return;
          const retryContext = createContext({ useSessionStore: { getState: f.store.getState },
            pendingStationMemberRefresh: undefined, readClosedHistoryIfReady: () => assert.fail('Not a closed session.'),
            // The real App timer owns this call. The proof adapter never calls
            // resume; actual client resume/finally owns reply hydration/fences.
            connectAutomaticallyDeduplicated: async () => {
              await resume(sid);
              if (!options.noFreshMember) await f.receiveMemberProjection();
            }, run: callback => callback() });
          await new Script(js(`(${retrySource})()`)).runInContext(retryContext);
        })();
        void backgroundResume.catch(() => undefined);
        return;
      }
      if (options.unwitnessed) {
        const current = f.store.getState(); f.store.setState({ me: { ...current.me, connectionGeneration: current.me.connectionGeneration + 1 }, identityHydrationRevision: 2 });
      } else if (!options.skipResume && !options.resumeBeforeClaim) {
        if (deferredResume) {
          backgroundResume = (async () => {
            await resume(sid);
            options.mutateAfter?.(f);
            if (!options.noFreshMember) await f.receiveMemberProjection();
            else if (options.feedAfterMs !== undefined) setTimeout(() => void f.receiveMemberProjection(), options.feedAfterMs);
          })();
          // A rejected proof must not leave an unhandled inert SDK task.
          void backgroundResume.catch(() => undefined);
          return;
        }
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
    requestObserved: () => requestObserved.promise, earlyGenerationObserved: () => earlyObservation.promise,
    releaseResumeResponse: responseGate.release, releaseResumeApplication: applicationGate.release,
    finishPendingResume: () => backgroundResume,
    authorityImports, presentationAcceptanceReads, mountedAuthorityUrl, authorityBinding: () => {
      const bare = bareAuthorityFns.sessionSnapshotAuthorityFor(sid, uid);
      return { sameObject: bare === authority, mountedHasServerAuthority: authority.hasServerSessionAuthority,
        bareHasServerAuthority: bare.hasServerSessionAuthority,
        mountedResumePending: authorityFns.memberSessionResumeBlocksFreshness(authority),
        bareResumePending: bareAuthorityFns.memberSessionResumeBlocksFreshness(bare) };
    },
    run: () => adapter.select(roleId, { deadlineAt: Date.now() + (options.shortDeadline ? 120 : 1500) }),
    cleanup: async () => {
      responseGate.release(); applicationGate.release();
      await backgroundResume?.catch(() => undefined);
      await rm(directory, { recursive: true, force: true });
    } };
}
