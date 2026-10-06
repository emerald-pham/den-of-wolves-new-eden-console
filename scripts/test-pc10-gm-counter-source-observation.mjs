import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createContext, Script, SyntheticModule } from 'node:vm';
import test from 'node:test';
import { createPendingProcedureDefaultSteps } from './pc10-pending-procedure-ui-recipes.mjs';
import { GM_RULING_COUNTER_PROCEDURES, createPendingGmRulingsCountersCallbacks,
  evaluateProcedureCapture } from './pc10-pending-procedure-ui-proof.mjs';

const SESSION_ID = 'native-counter-source-session';
const UID = 'native-original-counter-gm';
const UID_HASH = createHash('sha256').update(UID).digest('hex').slice(0, 16);
const INSTANCE_ID = 'native-original-counter-instance';
const CLAIMED_AT = '2026-10-06T06:00:00.000Z';
const spec = GM_RULING_COUNTER_PROCEDURES.find(row => row.endpoint === 'applyShipCounterSteps');
const steps = createPendingProcedureDefaultSteps();

function descendants(node) { return node.children.flatMap(child => [child, ...descendants(child)]); }
function matchesName(expected, actual) {
  if (expected instanceof RegExp) return expected.test(actual ?? '');
  return actual === expected;
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }

function nativeCounterFixture(options = {}) {
  let authUid = UID;
  let committed = false;
  let staleProjectionReads = options.staleProjectionReads ?? 0;
  let mode = false;
  let sourceReads = 0;
  let replayCalls = 0;
  let lastRequest = null;
  let lastResult = null;
  const actions = [];
  const listeners = new Set();
  const waiters = [];
  const cachedRevisions = { aegis: 14, quellon: 30 };
  const raw = {
    session: { id: SESSION_ID, currentTurn: 1, phase: 'active', activeVesselIds: ['aegis', 'quellon'],
      activeRoleIds: ['admiral'], vesselActionRevisions: { ...cachedRevisions },
      shipFleetGroupIds: { aegis: 'native-fleet', quellon: 'other-fleet' },
      shipResources: { aegis: { materials: 4 }, quellon: { materials: 5 } },
      fighterWingCounts: {},
    },
    me: { uid: UID, sessionId: SESSION_ID, role: 'gm', connectionGeneration: 7, activeConsoleRoleId: null },
    connection: 'live', sessionSnapshotFreshness: 'server', identityHydrationRevision: 11,
    gmInstance: { id: INSTANCE_ID, sessionId: SESSION_ID, uid: UID, claimedAt: CLAIMED_AT,
      shipConsoleWriteGrant: null },
    pendingCommands: [], gmAccessAuthenticatedAt: null, roleBrief: null,
  };
  const browser = createContext({ crypto: webcrypto, TextEncoder, performance: { timeOrigin: 1_728_182_400_000 },
    document: { querySelector: () => null } });
  const modules = new Map();
  const sourceStore = {
    getState() {
      if (browser.__readMode === 'action-state') {
        sourceReads += 1;
        if (committed && staleProjectionReads > 0) {
          staleProjectionReads -= 1;
          const stale = clone(raw);
          stale.session.vesselActionRevisions = { ...stale.session.vesselActionRevisions, ...cachedRevisions };
          return stale;
        }
      }
      return raw;
    },
  };
  const moduleEntries = [
    ['/src/store/useSessionStore.ts', { useSessionStore: sourceStore }],
    ['/src/lib/firebase.ts', { auth: () => ({ currentUser: authUid ? { uid: authUid } : null }) }],
    ['/src/lib/demoActorContext.ts', { activeDemoActorProfile: null }],
  ];
  const ready = Promise.all(moduleEntries.map(async ([path, exports]) => {
    const mod = new SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    }, { context: browser });
    await mod.link(() => { throw new Error('The native counter fixture has no transitive browser imports.'); });
    await mod.evaluate(); modules.set(path, mod);
  }));

  function actor() {
    return { sameActor: !!authUid && authUid === raw.me?.uid, sessionId: raw.session?.id ?? null,
      uidHash: authUid ? createHash('sha256').update(authUid).digest('hex').slice(0, 16) : null,
      playerRole: raw.me?.role ?? null, profileRoleId: null, activeConsoleRoleId: raw.me?.activeConsoleRoleId ?? null,
      assignedRoleId: null, connection: raw.connection, freshness: raw.sessionSnapshotFreshness,
      instanceId: raw.gmInstance?.id ?? null,
      gmInstanceOwned: !!raw.gmInstance && raw.gmInstance.uid === authUid && raw.gmInstance.sessionId === raw.session?.id,
      claimedAt: raw.gmInstance?.claimedAt ?? null, phase: raw.session?.phase ?? null,
      cycle: raw.session?.currentTurn ?? null, connectionGeneration: raw.me?.connectionGeneration ?? null,
      hydrationRevision: raw.identityHydrationRevision ?? null };
  }
  const tree = { role: 'region', name: 'Fleet resource controls', children: [] };
  const modeButton = { role: 'button', name: 'Ship numbers write mode', attributes: { 'aria-pressed': 'false' },
    children: [], click() { mode = !mode; this.attributes['aria-pressed'] = String(mode); actions.push('write-mode'); } };
  tree.children.push({ role: 'generic', name: 'Fleet resource access', children: [modeButton] });
  function group(name, shipId) {
    const button = { role: 'button', name: 'Increase Materials', attributes: {}, children: [],
      isEnabled: () => mode,
      click() {
        actions.push(`counter:${shipId}`);
        const requestShipId = options.requestShipId ?? shipId;
        const before = raw.session.vesselActionRevisions[requestShipId] ?? 0;
        const revision = before + 1;
        raw.session.vesselActionRevisions = { ...raw.session.vesselActionRevisions, [requestShipId]: revision };
        const requestId = `native-counter-${requestShipId}-${revision}`;
        lastRequest = { sessionId: SESSION_ID, instanceId: INSTANCE_ID, shipId: requestShipId,
          counter: 'resource', resourceId: 'materials', steps: [1], requestId, expectedRevision: before };
        const replyRevision = options.replyRevisionAfterReceipt ?? revision;
        lastResult = { status: 'committed', shipId: requestShipId, counterRevision: replyRevision, revision: replyRevision };
        committed = true;
        if (options.moveGroupAfterReceipt) raw.session.shipFleetGroupIds = {
          ...raw.session.shipFleetGroupIds, aegis: 'moved-fleet' };
        if (options.phaseAfterReceipt) raw.session.phase = options.phaseAfterReceipt;
        if (options.cacheAfterReceipt) raw.sessionSnapshotFreshness = 'cache';
        if (options.foreignGmAfterReceipt) raw.gmInstance = { ...raw.gmInstance, id: 'replacement-instance' };
        if (options.laterUidAfterReceipt) authUid = 'native-later-gm';
        if (options.foreignUidAfterReceipt) {
          authUid = 'native-foreign-gm'; raw.me = { ...raw.me, uid: authUid };
          raw.gmInstance = { ...raw.gmInstance, uid: authUid, id: 'native-foreign-instance' };
        }
        const request = { method: () => 'POST', url: () => 'http://localhost:5011/demo-native/us-central1/applyShipCounterSteps',
          postDataJSON: () => ({ data: lastRequest }) };
        const response = { request: () => request, url: request.url, status: () => 200, ok: () => true,
          json: async () => ({ result: lastResult }) };
        for (const listener of [...listeners]) listener(request);
        for (const waiter of [...waiters]) if (waiter.predicate(response)) {
          waiters.splice(waiters.indexOf(waiter), 1); waiter.resolve(response);
        }
      } };
    return { role: 'group', name: `${name} resource controls`, attributes: { 'aria-label': `${name} resource controls` },
      children: [button] };
  }
  const aegis = group('AEGIS', 'aegis'), quellon = group('Quellon', 'quellon');
  tree.children.push({ role: 'generic', name: 'Fleet resource ships',
    children: options.wrongGroupFirst ? [quellon, aegis] : [aegis, quellon] });
  const status = { role: 'status', name: 'status', children: [] };
  const allNodes = () => [...descendants(tree), status];
  function locator(nodes) {
    return {
      count: async () => nodes.length,
      nth: index => locator(nodes.slice(index, index + 1)),
      first: () => locator(nodes.slice(0, 1)),
      getByRole(role, { name, exact = false } = {}) {
        const found = nodes.flatMap(node => descendants(node)).filter(node => node.role === role &&
          (name === undefined || (exact ? node.name === name : matchesName(name, node.name))));
        return locator(found);
      },
      async getAttribute(key) {
        assert.equal(nodes.length, 1);
        return nodes[0].attributes?.[key] ?? null;
      },
      async isVisible() { assert.equal(nodes.length, 1); return nodes[0].visible !== false; },
      async isEnabled() {
        assert.equal(nodes.length, 1);
        return typeof nodes[0].isEnabled === 'function' ? nodes[0].isEnabled() : nodes[0].enabled !== false;
      },
      async click() {
        assert.equal(nodes.length, 1); assert.equal(await locator(nodes).isVisible(), true);
        assert.equal(await locator(nodes).isEnabled(), true, `Disabled native source action: ${nodes[0].name}`);
        nodes[0].click?.();
      },
      allTextContents: async () => ['Materials counter committed'],
    };
  }
  const page = {
    url: () => 'http://localhost:5174/#/gm',
    getByRole(role, { name, exact = false } = {}) {
      const found = allNodes().filter(node => node.role === role &&
        (name === undefined || (exact ? node.name === name : matchesName(name, node.name))));
      return locator(found);
    },
    async evaluate(callback, input) {
      await ready;
      const callbackText = callback.toString();
      const readMode = callbackText.includes('currentDocumentAuthority = null') ? 'action-state'
        : callbackText.includes('privateKeys = Object.keys(s)') ? 'lifecycle' : 'other';
      browser.__readMode = readMode;
      browser.input = input;
      try {
        return clone(await new Script(`(${callbackText})(input)`, {
          importModuleDynamically: async path => {
            assert.ok(modules.has(path), `Unexpected native browser import ${path}`);
            return modules.get(path);
          },
        }).runInContext(browser));
      } finally { browser.__readMode = null; }
    },
    on(event, listener) { assert.equal(event, 'request'); listeners.add(listener); },
    off(event, listener) { assert.equal(event, 'request'); listeners.delete(listener); },
    waitForResponse(predicate, { timeout }) {
      assert.ok(timeout > 0 && timeout <= 60_000);
      return new Promise((resolve, reject) => waiters.push({ predicate, resolve, reject }));
    },
  };
  const surface = { page, storeModuleUrl: () => '/src/store/useSessionStore.ts', observe: async () => actor(),
    callable: async (endpoint, data) => {
      assert.equal(endpoint, 'applyShipCounterSteps'); replayCalls += 1;
      assert.deepEqual(data, lastRequest, 'Replay must use the exact original UI payload.');
      return { status: 'committed', result: lastResult };
    } };
  const context = { initial: { sessionId: SESSION_ID, uidHash: UID_HASH }, started: actor(), gm: surface };
  const game = { select: async (role) => { assert.equal(role, 'gm'); return surface; },
    state: async () => ({ ...clone(raw.session), sessionId: raw.session.id, cycle: raw.session.currentTurn,
      live: raw.connection === 'live' && raw.sessionSnapshotFreshness === 'server' }) };
  return { raw, actions, context, game, surface, get sourceReads() { return sourceReads; },
    get replayCalls() { return replayCalls; }, get lastRequest() { return lastRequest; },
    async run() {
      const callbacks = createPendingGmRulingsCountersCallbacks({
        steps: { [spec.id]: steps[spec.id] }, gameFactory: () => game,
      });
      const result = await callbacks.onStarted(context);
      return { result, row: result.evidence.cases.find(row => row.endpoint === spec.endpoint) };
    },
    setInitialCache() { raw.sessionSnapshotFreshness = 'cache'; },
  };
}

test('mounted GM source couples the parent fleet toggle, named AEGIS group, and ordinary counter control', async () => {
  const gmSource = await readFile(new URL('../src/routes/GmConsole.tsx', import.meta.url), 'utf8');
  const fleet = gmSource.indexOf('aria-label="Fleet resource controls"');
  const mode = gmSource.indexOf('aria-label="Ship numbers write mode"', fleet);
  const ships = gmSource.indexOf('<div className="gm-fleet-resources__ships">', mode);
  const group = gmSource.indexOf('role="group"', ships);
  const button = gmSource.indexOf('aria-label={`Increase ${resource.label}`}', group);
  assert.ok(fleet >= 0 && mode > fleet && ships > mode && group > ships);
  assert.match(gmSource.slice(group, group + 800), /aria-label=\{`\$\{ship\.name\} resource controls`\}/);
  assert.ok(button > group, 'The actual one-step counter is mounted inside its named ship group.');
});

test('default GM counter capture waits for its exact live source revision after UI receipt and replay', async () => {
  const fixture = nativeCounterFixture({ staleProjectionReads: 2, wrongGroupFirst: true });
  const { result, row } = await fixture.run();
  assert.equal(row.status, 'completed', row.reason);
  assert.equal(row.revision, 15);
  assert.equal(fixture.lastRequest.shipId, 'aegis', 'The mounted choice remains bound to the source-selected AEGIS vessel.');
  assert.deepEqual(fixture.actions, ['write-mode', 'counter:aegis']);
  assert.equal(fixture.replayCalls, 1, 'Only the exact UI request is replayed once.');
  assert.ok(fixture.sourceReads >= 4, 'The real source projection is sampled again until revision 15 arrives.');
  assert.equal(result.familyAcceptanceClaimed, false, 'A native fixture never claims gameplay or closure credit.');
});

for (const [label, options] of [
  ['moved source group', { moveGroupAfterReceipt: true }],
  ['wrong vessel in the captured UI request', { requestShipId: 'quellon' }],
  ['reply-only revision', { replyRevisionAfterReceipt: 16 }],
  ['source phase change', { phaseAfterReceipt: 'closed' }],
  ['cached source after receipt', { cacheAfterReceipt: true }],
  ['foreign GM instance after receipt', { foreignGmAfterReceipt: true }],
  ['later Auth UID after receipt', { laterUidAfterReceipt: true }],
  ['foreign Auth UID after receipt', { foreignUidAfterReceipt: true }],
]) test(`default GM counter capture stays pending on ${label}`, async () => {
  const fixture = nativeCounterFixture(options);
  const { row } = await fixture.run();
  assert.notEqual(row.status, 'completed');
  assert.equal(row.familyAcceptanceClaimed, undefined);
});

test('default GM counter recipe stays pending when its initial source snapshot is stale', async () => {
  const fixture = nativeCounterFixture(); fixture.setInitialCache();
  const { row } = await fixture.run();
  assert.notEqual(row.status, 'completed');
  assert.deepEqual(fixture.actions, [], 'No mounted counter is clicked from cached source state.');
  assert.equal(fixture.replayCalls, 0);
});

function validCounterCapture() {
  const actor = { sameActor: true, sessionId: SESSION_ID, connection: 'live', freshness: 'server',
    playerRole: 'gm', gmInstanceOwned: true, uidHash: UID_HASH, instanceId: INSTANCE_ID };
  const request = { sessionId: SESSION_ID, instanceId: INSTANCE_ID, shipId: 'aegis', counter: 'resource',
    resourceId: 'materials', steps: [1], requestId: 'native-counter-revision-15', expectedRevision: 14 };
  const result = { status: 'committed', shipId: 'aegis', counterRevision: 15, revision: 15 };
  return { caseId: spec.id,
    expected: { sessionId: SESSION_ID, roleId: 'gm', uidHash: UID_HASH, instanceId: INSTANCE_ID,
      cycle: 1, sourceRevision: 14, shipId: 'aegis', groupId: 'native-fleet' },
    offered: true, mountedUi: true, actorBefore: actor, actorAfter: actor,
    sourceBefore: { live: true, sessionId: SESSION_ID, cycle: 1, revision: 14, groupId: 'native-fleet' },
    sourceAfter: { live: true, sessionId: SESSION_ID, cycle: 1, revision: 15, groupId: 'native-fleet' },
    request, response: { httpStatus: 200, result, exactReplay: true }, replay: { result },
    rendered: { visible: true, resultStatus: 'committed' }, trainingChoice: 'gm-training:deliberate-choice',
    randomOutcomeForced: false, randomOutcomeRecorded: false };
}

test('counter evaluator rejects wrong source group, stale or reply-only revision, and foreign actor', () => {
  const baseline = validCounterCapture();
  assert.equal(evaluateProcedureCapture(baseline).status, 'completed');
  for (const mutate of [
    input => { input.sourceAfter.groupId = 'moved-fleet'; },
    input => { input.sourceAfter.revision = 14; },
    input => { input.sourceAfter.revision = 16; },
    input => { input.actorAfter.uidHash = 'ffffffffffffffff'; },
    input => { input.sourceAfter.live = false; },
  ]) {
    const input = structuredClone(baseline); mutate(input);
    assert.notEqual(evaluateProcedureCapture(input).status, 'completed');
  }
});
