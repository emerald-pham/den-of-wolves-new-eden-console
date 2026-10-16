import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createContext, Script } from 'node:vm';

const require = createRequire(import.meta.url), ts = require('typescript');
const js = code => ts.transpileModule(code, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText.replace(/^export\s+/gm, '');

function sourceFunction(source, name, file) {
  const matches = [];
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) matches.push(node);
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(matches.length, 1, `Expected one Source function ${name} in ${file}.`);
  return matches[0].getText(source);
}

function sourcePropertyInitializer(source, name, file) {
  const matches = [];
  function visit(node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(source).replaceAll(/["']/g, '') === name) {
      matches.push(node.initializer);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(matches.length, 1, `Expected one Source property ${name} in ${file}.`);
  return matches[0].getText(source);
}

async function loadSource(sourceRoot) {
  const files = {
    server: 'functions/src/index.ts',
    service: 'src/lib/sessionService.ts',
    store: 'src/store/useSessionStore.ts',
    authority: 'src/lib/sessionSnapshotAuthority.ts',
  };
  const parsed = {};
  for (const [key, file] of Object.entries(files)) {
    const text = await readFile(resolve(sourceRoot, file), 'utf8');
    parsed[key] = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  }
  return { parsed, files };
}

async function resumeSourceMember({ sourceRoot, actor, uid }) {
  const { parsed, files } = await loadSource(sourceRoot);
  const serverContext = createContext({ HttpsError: class extends Error {} });
  new Script(js(sourceFunction(parsed.server, 'nextConnectionGeneration', files.server))).runInContext(serverContext);
  const nextConnectionGeneration = new Script('nextConnectionGeneration').runInContext(serverContext);

  const authorityContext = createContext({});
  new Script(js(`const sessionSnapshotAuthorities = new Map();
    const memberResumeTokens = new WeakMap();
    ${['createSessionSnapshotAuthority', 'beginMemberSessionResume', 'isCurrentMemberSessionResume',
      'finishMemberSessionResume', 'sessionSnapshotAuthorityFor']
      .map(name => sourceFunction(parsed.authority, name, files.authority)).join('\n')}`)).runInContext(authorityContext);
  const authorityFns = new Script(`({ beginMemberSessionResume, isCurrentMemberSessionResume,
    finishMemberSessionResume, sessionSnapshotAuthorityFor })`).runInContext(authorityContext);

  const sourceSet = 'setIdentity';
  const state = {
    session: { id: actor.sessionId },
    me: {
      uid, sessionId: actor.sessionId, role: 'player',
      assignedRoleId: actor.assignedRoleId ?? actor.profileRoleId ?? null,
      activeConsoleRoleId: actor.activeConsoleRoleId ?? null,
      seatId: actor.assignedRoleId ?? actor.profileRoleId ?? null,
      connectionGeneration: actor.generation,
      connected: true,
    },
    identityHydrationRevision: actor.hydrationRevision,
    sessionSnapshotFreshness: 'server',
    privateLoyalty: null,
  };
  const identityContext = createContext({ set: update => {
    Object.assign(state, typeof update === 'function' ? update(state) : update);
  } });
  new Script(js(`${sourceFunction(parsed.store, 'clearVoyageMovement', files.store)}
    ${sourceFunction(parsed.store, 'samePrivateAssignment', files.store)}
    const ${sourceSet} = ${sourcePropertyInitializer(parsed.store, 'setIdentity', files.store)};`))
    .runInContext(identityContext);
  const setIdentity = new Script(sourceSet).runInContext(identityContext);
  const store = state;
  store.getState = () => store;
  store.setIdentity = (session, player) => setIdentity(session, player);
  store.setSessionSnapshotFreshness = freshness => { state.sessionSnapshotFreshness = freshness; };
  const originalSession = store.session, originalMember = store.me;
  const clientContext = createContext({
    ...authorityFns,
    useSessionStore: { getState: () => store },
    auth: () => ({ currentUser: { uid } }),
    functions: () => ({}),
    ensureSignedIn: async () => {},
    normalizeShuttleManifest: (dockings, visits) => ({ dockings: dockings ?? [], visits: visits ?? [] }),
    normalizePressDispatch: value => value,
    // The inert transport hands applySession an accepted server reply; the
    // actual applySession, resumeSession, and store setIdentity still execute.
    acceptCallableSessionAuthority: () => true,
    clearPrivateStationState: () => assert.fail('The resume fixture does not request station reselection.'),
    stationSelectionNotice: () => null,
    httpsCallable: (_runtime, endpoint) => async request => {
      assert.equal(endpoint, 'resumeSession');
      assert.equal(request.sessionId, actor.sessionId);
      const before = store.me;
      const generation = nextConnectionGeneration({ get: key => before[key] });
      return { data: { session: { ...store.session }, player: { ...before, connectionGeneration: generation } } };
    },
  });
  new Script(js(`${sourceFunction(parsed.service, 'applySession', files.service)}
    ${sourceFunction(parsed.service, 'resumeSession', files.service)}`)).runInContext(clientContext);
  const resumed = await new Script(`resumeSession(${JSON.stringify(actor.sessionId)})`).runInContext(clientContext);
  assert.equal(resumed, true, 'Actual client resumeSession must accept the Source-backed new lease.');
  assert.equal(store.me.uid, uid);
  assert.equal(store.me.sessionId, actor.sessionId);
  assert.ok(store.me.connectionGeneration > originalMember.connectionGeneration);
  assert.ok(store.identityHydrationRevision > actor.hydrationRevision);
  assert.equal(store.session?.id, originalSession.id);
  assert.equal(store.sessionSnapshotFreshness, 'server');
  return {
    ...actor,
    generation: store.me.connectionGeneration,
    hydrationRevision: store.identityHydrationRevision,
  };
}

/**
 * Model Playwright's navigation result while deriving any document-return
 * lease from the actual server and client Source functions. Same URL is a
 * document navigation; only an origin/path/query match with a changed hash is
 * a same-document null result.
 */
export async function sourceBackedMemberGoto({ sourceRoot, fromUrl, toUrl, actor, staleResponse = false }) {
  const from = new URL(fromUrl), to = new URL(toUrl);
  const beforeGeneration = actor.generation, beforeHydrationRevision = actor.hydrationRevision;
  const sameDocument = from.origin === to.origin && from.pathname === to.pathname &&
    from.search === to.search && from.hash !== to.hash;
  if (sameDocument) {
    return {
      url: to.href,
      actor: { ...actor },
      response: null,
      navigation: { kind: 'same-document-null', beforeGeneration, afterGeneration: actor.generation,
        beforeHydrationRevision, afterHydrationRevision: actor.hydrationRevision },
    };
  }

  if (staleResponse) {
    return {
      url: to.href,
      actor: { ...actor },
      response: { url: () => to.href, status: () => 200 },
      navigation: { kind: 'document-response-stale', beforeGeneration, afterGeneration: actor.generation,
        beforeHydrationRevision, afterHydrationRevision: actor.hydrationRevision },
    };
  }

  const sourceUid = `native-member-${actor.uidHash}`;
  const resumedActor = await resumeSourceMember({ sourceRoot, actor, uid: sourceUid });
  return {
    url: to.href,
    actor: resumedActor,
    response: { url: () => to.href, status: () => 200 },
    navigation: { kind: 'document-response-source-resume', beforeGeneration,
      afterGeneration: resumedActor.generation, beforeHydrationRevision,
      afterHydrationRevision: resumedActor.hydrationRevision },
  };
}
