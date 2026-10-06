import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createContext, Script, SourceTextModule, SyntheticModule } from 'node:vm';

// Inert source audit only: exact c0 callback bodies, actual public adapter and
// actual Zustand immutable state replacement. No browser or network transport.
export const root = new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
const require = createRequire(import.meta.url);
const ts = require('typescript');
const { createStore } = require('zustand/vanilla');
const { createTwoBrowserGameplay } = await import(pathToFileURL(`${root}/scripts/pc10-two-browser-gameplay.mjs`).href);
const baseUrl = pathToFileURL(`${root}/scripts/pc10-base-combat-deduction-ui-proof.mjs`);
const baseSource = await readFile(baseUrl, 'utf8');
const parsed = async path => ts.createSourceFile(path, await readFile(`${root}/${path}`, 'utf8'), ts.ScriptTarget.Latest, true);
const full = await parsed('scripts/pc10-full-game-demo-ui-proof.mjs');
const service = await parsed('src/lib/sessionService.ts');
const firestore = await parsed('src/lib/firestore.ts');
const app = await parsed('src/App.tsx');
function only(source, predicate) {
  const values = [];
  function visit(node) { if (predicate(node)) values.push(node); ts.forEachChild(node, visit); }
  visit(source); assert.equal(values.length, 1, 'Extract exactly one actual source node.');
  return values[0];
}
const observeFunction = only(full, node => ts.isFunctionDeclaration(node) && node.name?.text === 'observe');
const observeCall = only(observeFunction, node => ts.isCallExpression(node) && node.expression.getText(full) === 'page.evaluate');
const observerSource = observeCall.arguments[0].getText(full);
const roleSource = only(service, node => ts.isFunctionDeclaration(node) && node.name?.text === 'selectConsoleRole').getText(service);
const playerSource = only(firestore, node => ts.isCallExpression(node) && node.expression.getText(firestore) === 'onSnapshot' &&
  node.arguments[2] && ts.isArrowFunction(node.arguments[2]) && node.arguments[2].getText(firestore).includes('const nextFingerprint = actorFingerprint(player);'))
  .arguments[2].getText(firestore);
const fingerprintSource = only(firestore, node => ts.isVariableDeclaration(node) && node.name.getText(firestore) === 'actorFingerprint').initializer.getText(firestore);
const berthSource = only(app, node => ts.isFunctionDeclaration(node) && node.name?.text === 'currentActorBerthMatches').getText(app);
const javascript = source => ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022,
} }).outputText;
const SID = 'native-session', ROLE = 'wing-commander', UID = 'private-native-original-wing';
const sha = uid => createHash('sha256').update(uid).digest('hex').slice(0, 16);
const plain = value => JSON.parse(JSON.stringify(value));
const gmActor = { hasAuth: true, sameActor: true, sessionId: SID, uidHash: sha('private-native-gm'),
  profileRoleId: null, assignedRoleId: null, activeConsoleRoleId: null, playerRole: 'gm',
  phase: 'active', cycle: 1, phaseProgression: 'manual', connection: 'live', freshness: 'server',
  gmInstanceOwned: true, instanceId: 'native-original-instance' };
export const choiceBoundary = new Error('Native source fixture reached the existing Wing choice boundary.');

export function fixture({ onDigest, released = false, afterSelected, beforeUntil, onReturned } = {}) {
  const initialMember = { uid: UID, sessionId: SID, role: 'player', assignedRoleId: ROLE,
    activeConsoleRoleId: released ? null : ROLE, seatId: ROLE, fleetGroupId: 'fleet-1',
    connectionGeneration: 3, connected: true, replacementRoleId: null, replacementStatus: null };
  const store = createStore(() => ({ session: { id: SID, phase: 'active', currentTurn: 1,
    turnPhase: { progression: 'manual', airspace: { state: 'restricted' } }, turnState: { phase: 'team' },
    // Complete last member-feed witness. The current source's matcher accepts
    // it before the normal claim and rejects it after local role publication.
    memberSessionScope: { groupId: 'fleet-1', vesselIds: ['aegis'] },
    currentActorBerthAuthority: { sessionId: SID, actorUid: UID, groupId: 'fleet-1', role: 'player',
      connectionGeneration: 3, assignedRoleId: ROLE, activeConsoleRoleId: initialMember.activeConsoleRoleId,
      replacementRoleId: null, replacementStatus: null, shipId: 'aegis' } },
    me: initialMember, identityHydrationRevision: 1, connection: 'live', sessionSnapshotFreshness: 'server',
    pendingCommands: [], seats: [{ id: ROLE, roleId: ROLE, status: 'claimed', holderUid: UID }] }));
  const counters = { richReads: 0, genericReads: 0, sdkCalls: 0, navigationCalls: 0, sourcePresence: 0, sourceFreshness: [], reads: [] };
  const callbackRows = [];
  const f = { store, counters, callbackRows, authUid: UID };
  store.setState({ setMe: me => store.setState({ me }) });
  async function evaluate(source, moduleUrl, kind) {
    assert.equal(moduleUrl, '/src/store/useSessionStore.ts');
    const index = kind === 'rich' ? ++counters.richReads : ++counters.genericReads;
    const crypto = { subtle: { digest: async (algorithm, bytes) => {
      const digest = await webcrypto.subtle.digest(algorithm, bytes);
      await onDigest?.(f, { kind, index });
      return digest;
    } } };
    const browser = createContext({ input: moduleUrl, crypto, TextEncoder,
      performance: { timeOrigin: 1000 }, document: { querySelector: () => null, querySelectorAll: () => [] } });
    assert.equal(new Script('[typeof process,typeof require,typeof Buffer].join(",")').runInContext(browser), 'undefined,undefined,undefined');
    const exports = new Map([
      ['/src/store/useSessionStore.ts', { useSessionStore: { getState: store.getState } }],
      ['/src/lib/firebase.ts', { auth: () => ({ currentUser: f.authUid ? { uid: f.authUid } : null }) }],
      ['/src/lib/demoActorContext.ts', { activeDemoActorProfile: { roleId: ROLE, sessionId: SID } }],
    ]);
    const modules = new Map();
    for (const [name, values] of exports) {
      const module = new SyntheticModule(Object.keys(values), function () {
        for (const [key, value] of Object.entries(values)) this.setExport(key, value);
      }, { context: browser });
      await module.link(() => assert.fail('No source transport import.')); await module.evaluate(); modules.set(name, module);
    }
    const value = plain(await new Script(`(${source})(input)`, { importModuleDynamically: async name => {
      assert.ok(modules.has(name), `No additional SDK/source module: ${name}`); return modules.get(name);
    } }).runInContext(browser));
    assert.equal(JSON.stringify(value).includes('private-native-'), false);
    callbackRows.push({ kind, index, value }); await onReturned?.(f, { kind, index, value }); return value;
  }
  const crew = { observe: () => evaluate(observerSource, '/src/store/useSessionStore.ts', 'generic'),
    until: async (_description, predicate, timeout) => {
      assert.ok(Number.isFinite(timeout) && timeout > 0);
      await beforeUntil?.(f); const value = await crew.observe(); assert.ok(predicate(value)); return value;
    },
    storeModuleUrl: () => '/src/store/useSessionStore.ts',
    callable: async () => { counters.sdkCalls++; assert.fail('No SDK call is authorized in this native source audit.'); },
    page: { url: () => `http://native.invalid/#/ships/aegis/roles/${ROLE}`,
      evaluate: (callback, moduleUrl) => evaluate(callback.toString(), moduleUrl, 'rich'),
      goto: async () => { counters.navigationCalls++; assert.fail('Already-held fixture must not navigate.'); },
      getByRole: () => { counters.choiceControlOpened = true; return {}; } },
  };
  const gm = { observe: async () => ({ ...gmActor }) };
  const context = { crew, gm, initial: { sessionId: SID, joinCode: 'NATIVE' },
    started: { uidHash: gmActor.uidHash, instanceId: gmActor.instanceId },
    roster: [{ roleId: ROLE, uidHash: sha(UID) }], directory: '/native-no-files' };
  const adapter = createTwoBrowserGameplay(context);
  f.select = options => adapter.select(ROLE, { deadlineAt: Date.now() + 1000, ...options });
  f.crew = crew;
  f.publishCurrentWitness = () => {
    const current = store.getState(), me = current.me;
    store.setState({ session: { ...current.session, currentActorBerthAuthority: {
      sessionId: current.session.id, actorUid: me.uid, groupId: me.fleetGroupId, role: me.role,
      connectionGeneration: me.connectionGeneration, assignedRoleId: me.assignedRoleId ?? null,
      activeConsoleRoleId: me.activeConsoleRoleId ?? null, replacementRoleId: me.replacementRoleId ?? null,
      replacementStatus: me.replacementStatus ?? null, shipId: 'aegis',
    } }, connection: 'live', sessionSnapshotFreshness: 'server' });
  };
  const berthContext = createContext({ isWireSafeEntityId: value => typeof value === 'string' && /^[a-z0-9-]+$/.test(value) });
  const berthMatches = new Script(`${javascript(berthSource)}\ncurrentActorBerthMatches;`).runInContext(berthContext);
  f.berthMatches = () => berthMatches(store.getState().session, store.getState().me);
  f.normalClaim = async () => {
    const sourceContext = createContext({ useSessionStore: { getState: store.getState },
      sessionAuthorityUid: state => state.me.uid,
      sessionAuthorityCheckpoint: (sessionId, uid) => ({ sessionId, uid }),
      authorityCheckpointIsCurrent: checkpoint => checkpoint.sessionId === SID && checkpoint.uid === f.authUid,
      refreshPresence: async role => { assert.equal(role, ROLE); counters.sourcePresence++; },
    });
    await new Script(`${javascript(roleSource).replace(/^export\s+/m, '')}\nselectConsoleRole("${ROLE}");`).runInContext(sourceContext);
  };
  const sourceContext = createContext({ subscribed: true, currentSessionSubscriptionToken: 1, subscriptionToken: 1,
    sessionSnapshotAuthority: { hasServerSessionAuthority: true }, sessionId: SID, uid: UID,
    memberActorAvailable: true, memberSessionConfirmed: true, memberActorEpoch: 1,
    pendingMemberDiscovery: undefined, memberPlayer: initialMember,
    playerFrom: (_sid, _uid, data) => ({ ...data }),
    handlers: { sessionReadAudience: 'member', onPlayer: me => store.setState({ me }),
      onSessionFreshness: fresh => { counters.sourceFreshness.push(fresh);
        store.setState({ connection: fresh ? 'live' : 'offline', sessionSnapshotFreshness: fresh ? 'server' : 'cache' }); } },
    memberFeedRefresh: () => { counters.memberFeedRefreshes = (counters.memberFeedRefreshes ?? 0) + 1; },
    startPrivateLoyaltyListener: () => {}, publishPendingMemberDiscovery: () => {},
    revokeMemberActor: () => assert.fail('No authority revocation in this source example.'), onError: () => assert.fail('No source error in this example.'),
  });
  new Script(`var actorFingerprint = ${javascript(`(${fingerprintSource})`).trim().replace(/;$/, '')};\nvar memberActorFingerprint = actorFingerprint(memberPlayer);`).runInContext(sourceContext);
  const receivePlayer = new Script(javascript(`(${playerSource})`)).runInContext(sourceContext);
  f.confirmPlayer = ({ fromCache = false } = {}) => {
    const player = { ...store.getState().me };
    receivePlayer({ metadata: { fromCache }, exists: () => true,
      get: key => player[key], data: () => player });
  };
  f.runBase = async () => {
    const current = { type: 'wolf-attack-state', attackId: 'native-original-attack', turn: 1,
      revision: 1, status: 'declared', currentStep: 'targeting', airspaceLocked: true };
    const baseAdapter = { select: async (...args) => {
      const selected = await adapter.select(...args); await afterSelected?.(f); return selected;
    }, read: async (role, suffix) => { assert.equal(role, 'gm'); assert.equal(suffix, 'wolfAttackState/current');
      counters.reads.push({ role, suffix }); return { ...current }; } };
    const sandbox = createContext({ URL, Date, console });
    const module = new SourceTextModule(baseSource, { context: sandbox, identifier: baseUrl.href });
    await module.link(async specifier => {
      let values;
      if (specifier === './pc10-two-browser-gameplay.mjs') values = { createTwoBrowserGameplay: () => baseAdapter };
      else if (specifier === 'node:fs/promises') values = { writeFile: async () => {} };
      else if (specifier === './pc10-live-wolf-attack-ui-proof.mjs') values = { resolveLiveWolfAttack: async (_context, options) => {
        await options.chooseNext(current, { deadlineAt: Date.now() + 1000,
          waitChoice: async () => { throw choiceBoundary; } }); assert.fail('Stop at the current choice boundary.');
      } };
      else values = await import(specifier.startsWith('.') ? new URL(specifier, baseUrl).href : specifier);
      return new SyntheticModule(Object.keys(values), function () {
        for (const [name, value] of Object.entries(values)) this.setExport(name, value);
      }, { context: sandbox });
    });
    await module.evaluate();
    return module.namespace.runBaseCombatAndDeduction(context, { combat: 'current', deduction: false, requiredBranches: [] });
  };
  return f;
}
