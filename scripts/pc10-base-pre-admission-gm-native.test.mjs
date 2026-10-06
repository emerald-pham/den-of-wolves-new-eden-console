import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { createContext, Script, SyntheticModule } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { createBaseGameplayDriverOptions } from './pc10-base-gameplay-composed-post-combat.mjs';
import { createPendingGmRulingsCountersCallbacks } from './pc10-pending-procedure-ui-proof.mjs';
import { createTwoBrowserGameplay } from './pc10-two-browser-gameplay.mjs';

const { parse } = createRequire(import.meta.url)('acorn');
const source = await readFile(new URL('./pc10-full-game-demo-ui-proof.mjs', import.meta.url), 'utf8');
const tree = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
const nodes = [];
function walk(value) {
  if (!value || typeof value !== 'object') return;
  if (typeof value.type === 'string') nodes.push(value);
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) child.forEach(walk);
    else if (child && typeof child === 'object') walk(child);
  }
}
walk(tree);
const unwrap = node => node?.type === 'ChainExpression' ? node.expression : node;
const setupCalls = nodes.filter(node => node.type === 'AwaitExpression' &&
  unwrap(node.argument)?.type === 'CallExpression' &&
  unwrap(node.argument).callee?.object?.name === 'options' &&
  unwrap(node.argument).callee?.property?.name === 'onSetup');
assert.equal(setupCalls.length, 1);
const setupCall = setupCalls[0], setupInput = unwrap(setupCall.argument).arguments[0];
const observe = nodes.find(node => node.type === 'FunctionDeclaration' && node.id?.name === 'observe');
const observeReturn = observe.body.body.find(node => node.type === 'ReturnStatement');
const observeCallback = observeReturn.argument.arguments[0];
const serializedObserver = source.slice(observeCallback.start, observeCallback.end);
const plain = value => value === undefined ? value : JSON.parse(JSON.stringify(value));
const fixtureDirectories = [];
after(async () => {
  for (const directory of fixtureDirectories) await rm(directory, { recursive: true });
});

// This runs the real producer's exact callback expression, the real composed
// Base hooks and default pending-GM factory/recipe/capture. Browser I/O alone
// is inert: no browser, Auth account, gameplay SDK or server fixture exists.
async function fixture({ actorChange = {}, storeChange = {} } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'pc10-native-pre-admission-'));
  fixtureDirectories.push(directory);
  const sessionId = 'native-pre-admission-session', uid = 'private-original-setup-uid';
  const raw = { session: { id: sessionId, joinCode: 'native-join', phase: 'lobby', currentTurn: 0,
    setupRevision: 2, setupConfirmed: false }, me: { uid, sessionId, role: 'gm' },
    connection: 'live', sessionSnapshotFreshness: 'server', pendingCommands: [], gmInstance: null };
  const counts = { crewAccess: 0, evaluates: 0, selects: 0, ui: 0, sdk: 0, responseObservers: 0 };
  const labels = [], timeouts = [];
  const browser = createContext({ crypto: webcrypto, TextEncoder, performance: { timeOrigin: 123_000 },
    document: { querySelector: () => null, querySelectorAll: () => [] } });
  assert.equal(new Script('[typeof process,typeof require,typeof Buffer].join(",")').runInContext(browser),
    'undefined,undefined,undefined');
  const modules = new Map();
  for (const [path, exports] of [
    ['/src/store/useSessionStore.ts', { useSessionStore: { getState: () => raw } }],
    ['/src/lib/firebase.ts', { auth: () => ({ currentUser: { uid } }) }],
    ['/src/lib/demoActorContext.ts', { activeDemoActorProfile: null }],
  ]) {
    const module = new SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    }, { context: browser });
    await module.link(() => assert.fail('No native module dependencies.'));
    await module.evaluate(); modules.set(path, module);
  }
  const evaluate = async (callback, input) => {
    counts.evaluates += 1; browser.input = input;
    const script = new Script(`(${typeof callback === 'string' ? callback : callback.toString()})(input)`, {
      importModuleDynamically: async path => {
        assert.ok(modules.has(path), `No new SDK/read/import: ${path}`); return modules.get(path);
      },
    });
    return plain(await script.runInContext(browser));
  };
  const gm = { storeModuleUrl: () => '/src/store/useSessionStore.ts',
    observe: async () => ({ ...await evaluate(serializedObserver, '/src/store/useSessionStore.ts'), ...actorChange }),
    until: async (label, predicate, timeout) => {
      counts.selects += 1; labels.push(label); timeouts.push(timeout);
      const current = await gm.observe();
      assert.ok(predicate(current), 'Native original GM authority is unavailable.'); return current;
    },
    callable: async () => { counts.sdk += 1; assert.fail('No setup mutation or replay is offered in this solo fixture.'); },
    page: { evaluate, on: () => { counts.responseObservers += 1; }, off: () => {},
      waitForResponse: () => { counts.responseObservers += 1; assert.fail('Do not arm an unoffered control.'); },
      getByRole: () => { counts.ui += 1; assert.fail('No invented facilitator control.'); } },
  };
  // The original producer captures initial BEFORE the named GM joins. Its
  // instanceId is legitimately null; no roster/confirmed/prepared fields exist.
  const initial = await gm.observe();
  raw.gmInstance = { id: 'native-owned-gm-instance', uid, sessionId };
  Object.assign(raw, storeChange);
  const crew = new Proxy({}, { get() { counts.crewAccess += 1; assert.fail('Crew has not been admitted.'); } });
  const context = { gm, crew, initial, directory };
  const produce = async options => {
    const environment = createContext({ options, gm, crew, initial, directory });
    return new Script(`(async () => { ${source.slice(setupCall.start, setupCall.end)}; })()`)
      .runInContext(environment);
  };
  return { raw, gm, crew, initial, context, counts, labels, timeouts, produce };
}

function driver(options = {}) {
  return createBaseGameplayDriverOptions({ normalEnding: async () => assert.fail('No gameplay/ending credit.'), ...options });
}

test('the actual setup producer omits roster before confirm and ordinary admission', () => {
  assert.deepEqual(setupInput.properties.map(property => property.key.name), ['gm', 'crew', 'initial', 'directory']);
  assert.ok(setupCall.end < source.indexOf("const confirmControl = setup.getByRole('button'"));
  assert.ok(setupCall.end < source.indexOf('const roster ='));
});

test('the composed Base setup runs its original root hook then records the solo GM case pending without an admitted roster', async () => {
  const f = await fixture(), order = [];
  const originalRoot = async context => {
    order.push('original-root-setup');
    assert.equal(context.gm, f.gm); assert.equal(context.crew, f.crew);
    assert.equal(context.initial, f.initial); assert.equal(Object.hasOwn(context, 'roster'), false);
    assert.equal(context.initial.instanceId, null);
  };
  const d = driver({ rootHooks: { onSetup: originalRoot } });
  await f.produce({ onSetup: async context => {
    const results = await d.onSetup(context);
    order.push('pending-GM-setup-returned');
    const result = results[1];
    assert.equal(result.checkpoint, 'on-setup'); assert.equal(result.observedProcedureCount, 0);
    assert.equal(result.pendingProcedureCount, 1); assert.equal(result.familyAcceptanceClaimed, false);
    assert.deepEqual(result.evidence.cases.map(row => row.caseId), ['gm:setFacilitatorResponsibility']);
    assert.equal(result.evidence.cases[0].status, 'pending');
  } });
  assert.deepEqual(order, ['original-root-setup', 'pending-GM-setup-returned']);
  assert.equal(f.counts.crewAccess, 0); assert.equal(f.counts.ui, 0); assert.equal(f.counts.sdk, 0);
  assert.equal(f.counts.responseObservers, 0);
  assert.ok(f.timeouts.every(timeout => timeout > 0 && timeout <= 60_000));
});

test('an authored setup step receives only the original GM adapter and cannot select or inspect pre-admission crew', async () => {
  const f = await fixture(); let steps = 0, game;
  const d = driver({ pendingProcedureOptions: { gmChoiceSteps: { setFacilitatorResponsibility: async input => {
    steps += 1; game = input.game;
    assert.equal(Object.hasOwn(input.context, 'roster'), false);
    assert.equal(await game.select('gm'), f.gm);
    const current = await game.state();
    assert.equal(current.sessionId, f.initial.sessionId); assert.equal(current.cycle, 0);
    assert.equal(current.phase, 'lobby'); assert.equal(current.setupRevision, 2); assert.equal(current.live, true);
    return null; // Source has no second GM/control; do not fabricate a receipt.
  } } } });
  await f.produce({ onSetup: d.onSetup }); assert.equal(steps, 1);
  await assert.rejects(game.select('executive-officer'), /pre-admission.*GM|GM.*pre-admission/i);
  await assert.rejects(game.state(f.crew), /pre-admission.*GM|GM.*pre-admission/i);
  assert.equal(f.counts.crewAccess, 0); assert.equal(f.counts.ui, 0); assert.equal(f.counts.sdk, 0);
});

test('the ordinary default gameplay factory still requires its genuine nonempty admitted roster', async () => {
  const f = await fixture();
  assert.throws(() => createTwoBrowserGameplay(f.context));
  assert.throws(() => createTwoBrowserGameplay({ ...f.context, roster: [] }));
  const game = createTwoBrowserGameplay({ ...f.context, roster: [{ roleId: 'executive-officer', uidHash: 'admitted-original' }] });
  assert.equal(await game.select('gm'), f.gm); assert.equal(f.counts.crewAccess, 0);
});

test('a supplied setup factory remains explicit and receives the exact original producer context', async () => {
  const f = await fixture(); let factories = 0, steps = 0;
  const custom = { select: async () => assert.fail('No selection required by this unoffered step.') };
  const callbacks = createPendingGmRulingsCountersCallbacks({ gameFactory: context => {
    factories += 1; assert.equal(context.initial, f.initial); assert.equal(Object.hasOwn(context, 'roster'), false);
    return custom;
  }, steps: { setFacilitatorResponsibility: async ({ game }) => { steps += 1; assert.equal(game, custom); return null; } } });
  const result = await callbacks.onSetup(f.context);
  assert.equal(factories, 1); assert.equal(steps, 1); assert.equal(result.observedProcedureCount, 0);
});

for (const [label, actorChange] of Object.entries({ foreignUid: { uidHash: 'foreign-original' },
  foreignSession: { sessionId: 'foreign-session' }, missingAuth: { hasAuth: false },
  differentActor: { sameActor: false }, nonGm: { playerRole: 'player' },
  foreignDocument: { documentTimeOrigin: 456_000 }, notOwned: { gmInstanceOwned: false },
  missingInstance: { instanceId: null }, disconnected: { connection: 'offline' },
  cached: { freshness: 'cache' }, wrongCycle: { cycle: 1 }, activePhase: { phase: 'active' },
})) {
  test(`pre-admission setup gives no authority or action credit for ${label}`, async () => {
    const f = await fixture(); let selected = false;
    // Bind the genuine initial snapshot before changing the current observation.
    const originalObserve = f.gm.observe;
    f.gm.observe = async () => ({ ...await originalObserve(), ...actorChange });
    const callbacks = createPendingGmRulingsCountersCallbacks({ steps: {
      setFacilitatorResponsibility: async ({ game }) => { await game.select('gm'); selected = true; return null; },
    } });
    const result = await callbacks.onSetup(f.context);
    assert.equal(selected, false); assert.equal(result.observedProcedureCount, 0);
    assert.equal(result.evidence.cases[0].reason, 'mounted-GM-source-preparation-did-not-complete');
    assert.equal(f.counts.crewAccess, 0); assert.equal(f.counts.sdk, 0); assert.equal(f.counts.ui, 0);
    assert.equal(f.counts.responseObservers, 0);
  });
}

test('later active-game callbacks never use the pre-admission path when the admitted roster is missing', async () => {
  const f = await fixture(); f.raw.session.currentTurn = 1; f.raw.session.phase = 'active';
  await assert.rejects(createPendingGmRulingsCountersCallbacks().onStarted(f.context));
  assert.equal(f.counts.selects, 0); assert.equal(f.counts.sdk, 0); assert.equal(f.counts.crewAccess, 0);
});
