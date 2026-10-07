import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createContext, Script, SyntheticModule } from 'node:vm';
import { createTwoBrowserGameplay } from './pc10-two-browser-gameplay.mjs';
import { projectionFixture } from './fixtures/pc10-member-projection-native-fixture.mjs';

// Native-only public selection, actual normal client resume/fence functions,
// actual member transaction/feed parser, and server lease increment. Inert
// transport at the ordinary route entry; no browser or gameplay acceptance.
const require = createRequire(import.meta.url), ts = require('typescript');
const sources = {};
for (const path of ['src/lib/sessionService.ts', 'src/lib/sessionSnapshotAuthority.ts', 'functions/src/index.ts']) {
  const text = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  sources[path] = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
}
function sourceFunction(path, name) {
  const matches = [];
  function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === name) matches.push(node); ts.forEachChild(node, visit); }
  visit(sources[path]); assert.equal(matches.length, 1); return matches[0].getText(sources[path]);
}
const js = code => ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText.replace(/^export\s+/gm, '');
const sha = uid => createHash('sha256').update(uid).digest('hex').slice(0, 16);
const plain = value => JSON.parse(JSON.stringify(value));

async function fixture(options = {}) {
  const roleId = 'icebreaker-captain', f = projectionFixture({ actorRoleId: roleId, freshDemo: true });
  f.store.setState({ me: { ...f.store.getState().me, connectionGeneration: 2 } });
  await f.resumeSessionOnly(); await f.receiveMemberProjection();
  const start = f.store.getState(), uid = start.me.uid, sid = start.session.id;
  const directory = await mkdtemp(join(tmpdir(), 'pc10-native-navigation-'));
  const events = new EventEmitter(), sdkRequests = [], application = [];
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
    functions: () => ({}),
    applySession: reply => {
      if (options.rejectApply) return false;
      const current = f.store.getState();
      application.push({ beforeGeneration: current.me.connectionGeneration, replyGeneration: reply.player.connectionGeneration });
      f.store.setState({ me: plain(reply.player), session: plain(reply.session),
        identityHydrationRevision: current.identityHydrationRevision + 1 }); return true;
    },
    httpsCallable: (_runtime, endpoint) => async data => {
      assert.equal(endpoint, 'resumeSession'); sdkRequests.push(endpoint);
      const before = f.store.getState();
      const player = { ...before.me, connectionGeneration: nextGeneration({ get: key => before.me[key] }) };
      const reply = { player, session: { ...before.session } };
      delete reply.session.currentActorBerthAuthority;
      options.mutateReply?.(reply);
      const request = { method: () => 'POST', url: () => 'http://127.0.0.1:5011/demo-native/us-central1/resumeSession',
        postDataJSON: () => ({ data: { sessionId: options.requestSession ?? data.sessionId } }),
        allHeaders: () => assert.fail('No request headers'), headers: () => assert.fail('No request headers') };
      if (!options.hideRequest) events.emit('request', request);
      const response = { request: () => request, url: request.url, status: () => options.httpStatus ?? 200,
        json: async () => options.responseError ? { error: { status: 'PERMISSION_DENIED' } } : { result: reply } };
      if (!options.hideResponse) events.emit('response', response);
      return { data: reply };
    },
  });
  new Script(js(sourceFunction('src/lib/sessionService.ts', 'resumeSession'))).runInContext(sourceResumeContext);
  const resume = new Script('resumeSession').runInContext(sourceResumeContext);
  const originalEvaluate = f.crew.page.evaluate;
  f.crew.page.evaluate = async (callback, input) => {
    if (typeof input === 'string') return originalEvaluate(callback, input);
    const browser = createContext({ input, crypto: webcrypto, TextEncoder, performance: { timeOrigin: options.newDocument ? 2000 : 1000 } });
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
  const originalLocator = f.crew.page.locator;
  f.crew.page.locator = selector => {
    const link = originalLocator(selector), click = link.click;
    link.click = async () => {
      await click();
      if (options.unwitnessed) {
        const current = f.store.getState(); f.store.setState({ me: { ...current.me, connectionGeneration: current.me.connectionGeneration + 1 }, identityHydrationRevision: 2 });
      } else {
        await resume(sid);
        if (options.forgeAfterRejected) {
          const current = f.store.getState(); f.store.setState({ me: { ...current.me, connectionGeneration: current.me.connectionGeneration + 1 }, identityHydrationRevision: 2 });
        }
      }
      options.mutateAfter?.(f);
      if (!options.noFreshMember) await f.receiveMemberProjection();
      if (options.pendingNewerResume) authorityFns.beginMemberSessionResume(authority);
    };
    return link;
  };
  const adapter = createTwoBrowserGameplay({ gm: {}, crew: f.crew, initial: { sessionId: sid, joinCode: 'NATIVE' },
    started: { fullGameDemo: { status: 'active', progression: 'manual' } },
    roster: [{ roleId, uidHash: sha(uid) }], directory });
  return { ...f, sdkRequests, application, directory, events, adapter,
    run: () => adapter.select(roleId, { deadlineAt: Date.now() + (options.shortDeadline ? 120 : 1500) }),
    cleanup: () => rm(directory, { recursive: true, force: true }) };
}

test('ordinary Icebreaker station entry binds one actual accepted resume and fresh original member before returning', async () => {
  const f = await fixture();
  try {
    assert.equal(await f.run(), f.crew);
    assert.deepEqual(f.sdkRequests, ['resumeSession']); assert.equal(f.application.length, 1);
    assert.equal(f.store.getState().me.connectionGeneration, 3); assert.equal(f.store.getState().identityHydrationRevision, 2);
    assert.deepEqual(f.uiChoices, ["Enter this actor's stations", 'original-role-chooser']);
    assert.equal(f.counters.sdkCalls, 0, 'Selection adds no gameplay callable or forced resume.');
    assert.equal(f.events.eventNames().length, 0, 'Own listeners removed after success.');
    const files = await readdir(join(f.directory, 'member-navigation'));
    assert.equal(files.length, 1);
    const packet = JSON.parse(await readFile(join(f.directory, 'member-navigation', files[0]), 'utf8'));
    assert.equal(packet.transitions.length, 1); assert.equal(packet.transitions[0].status, 'accepted-normal-resume-bound');
    assert.equal(JSON.stringify(packet).includes('private-native-'), false);
  } finally { await f.cleanup(); }
});

for (const [label, options] of [
  ['generation and hydration without a real resume', { unwitnessed: true }],
  ['response lacking its original request event', { hideRequest: true }],
  ['request lacking its actual response', { hideResponse: true }],
  ['foreign request session', { requestSession: 'foreign-session' }],
  ['denied response', { httpStatus: 403 }],
  ['error envelope', { responseError: true }],
  ['foreign reply UID', { mutateReply: reply => { reply.player.uid = 'foreign-uid'; }, forgeAfterRejected: true }],
  ['foreign reply group', { mutateReply: reply => { reply.player.fleetGroupId = 'fleet-2'; } }],
  ['released reply assignment', { mutateReply: reply => { reply.player.assignedRoleId = null; } }],
  ['SDK rejected apply despite numerical state change', { rejectApply: true, forgeAfterRejected: true, shortDeadline: true }],
  ['newer unfinished client resume', { pendingNewerResume: true, shortDeadline: true }],
  ['later lease instead of captured accepted reply', { mutateAfter: f => {
    const current = f.store.getState(); f.store.setState({ me: { ...current.me, connectionGeneration: current.me.connectionGeneration + 1 } }); } }],
  ['hydration advanced twice', { mutateAfter: f => f.store.setState({ identityHydrationRevision: 3 }) }],
  ['missing fresh original member witness', { noFreshMember: true, shortDeadline: true }],
]) test(`station entry rejects ${label} without reaching gameplay`, async () => {
  const f = await fixture(options);
  try {
    await assert.rejects(f.run()); assert.equal(f.counters.sdkCalls, 0);
    assert.equal(f.events.eventNames().length, 0, 'Own listeners removed on rejection.');
  } finally { await f.cleanup(); }
});
