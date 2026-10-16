import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { sourceBackedMemberGoto } from './fixtures/pc10-member-gm-document-resume-native-fixture.mjs';
import { createMemberGmLifecycleUiProof } from './pc10-member-gm-lifecycle-ui-proof.mjs';

const sourceRoot = fileURLToPath(new URL('..', import.meta.url));
const fullLayoutName = '← Change role';
const partialStyleName = '←Change role';
const shipId = 'aegis', href = '#/ships/aegis/roles';
const projectId = 'demo-native-full-layout';
const original = Object.freeze({ hasAuth: true, sameActor: true, sessionId: 'native-layout-session',
  uidHash: '0123456789abcdef', connection: 'live', freshness: 'server', generation: 3,
  hydrationRevision: 4, playerRole: 'gm', instanceId: 'native-layout-instance',
  claimedAt: 'native-layout-lease', gmInstanceOwned: true, grantShipId: null,
  privateAudienceMatches: true, foreignPendingCount: 0, activeConsoleRoleId: null,
  phase: 'active', cycle: 1 });

// Owner's full-source CSS ariaSnapshot establishes the spaced name. This native
// transport models the source control and an unrelated partial-style decoy;
// it does not compute CSS accessibility or create any real game/permission.
async function fullLayoutFixture(t, { sourcePresent = true, deniedEndpoint } = {}) {
  const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
  assert.match(css, /\.ship-console__back\s*\{[^}]*display:\s*inline-flex;/);
  assert.match(css, /\.ship-console__back::before\s*\{[^}]*content:\s*"←";/);
  const directory = await mkdtemp(resolve(tmpdir(), 'pc10-native-full-layout-'));
  const actor = { ...original }, selected = [], requests = [], replays = [], observers = [];
  const crewActor = { ...original, uidHash: 'fedcba9876543210', playerRole: 'player',
    profileRoleId: 'admiral', gmInstanceOwned: false, instanceId: null, claimedAt: null };
  let url = 'http://127.0.0.1:5173/#/console', locked = false;
  const route = () => new URL(url).hash.slice(1);
  const runtime = `import.meta.env = ${JSON.stringify({ VITE_FIREBASE_PROJECT_ID: projectId,
    VITE_USE_EMULATORS: '1', VITE_FIREBASE_AUTH_EMULATOR_PORT: '9109',
    VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT: '5011', VITE_FIREBASE_FIRESTORE_EMULATOR_PORT: '8090' })};`;
  function emit(endpoint, extra, result, rejected = endpoint === deniedEndpoint) {
    const data = { sessionId: original.sessionId, instanceId: original.instanceId, shipId, ...extra };
    const response = { url: () => `http://127.0.0.1:5011/${projectId}/us-central1/${endpoint}`,
      request: () => ({ method: () => 'POST', postDataJSON: () => ({ data }) }),
      status: () => rejected ? 403 : 200,
      json: async () => rejected ? { error: { status: 'PERMISSION_DENIED' } } : { result } };
    requests.push({ endpoint, data, result, rejected });
    for (const observer of [...observers]) if (observer.predicate(response)) {
      observers.splice(observers.indexOf(observer), 1); observer.resolve(response);
    }
  }
  function navigate(next) {
    if (route() === '/ships/aegis/observer') {
      actor.grantShipId = null;
      // Existing captured-authority unmount cleanup; this never credits a
      // missing source return or converts a genuine rejected grant to success.
      emit('setGmShipConsoleWriteGrant', { enabled: false }, { enabled: false }, false);
    }
    url = next;
  }
  function nodes() {
    if (route() === '/console') return [{ role: 'link', name: 'Original ship', href,
      click: async () => { url = `http://127.0.0.1:5173/${href}`; } }];
    if (route() === '/ships/aegis/roles') return [{ role: 'link', name: 'View ship consoles',
      click: async () => { url = 'http://127.0.0.1:5173/#/ships/aegis/observer'; } }];
    if (route() !== '/ships/aegis/observer') return [];
    return [...[...(sourcePresent ? [fullLayoutName] : []), partialStyleName].map(name => ({
      role: 'link', name, href, className: 'ship-console__back cic-text-button',
      click: async () => {
        selected.push({ name, actor: { ...actor } });
        navigate(`http://127.0.0.1:5173/${href}`);
      },
    })), { role: 'button', name: 'GM ship console read write access', click: async () => {} },
    { role: 'alertdialog', name: 'Are you sure?' },
    { role: 'button', name: 'ARE YOU SURE?', parent: 'Are you sure?', click: async () => {
      if (deniedEndpoint !== 'setGmShipConsoleWriteGrant') actor.grantShipId = shipId;
      emit('setGmShipConsoleWriteGrant', { enabled: true }, { enabled: true });
    } }, { role: 'region', name: 'ICN console lock' },
    { role: 'button', name: locked ? 'Release ICN console lock' : 'Engage ICN console lock',
      parent: 'ICN console lock', click: async () => {
        const next = !locked;
        if (deniedEndpoint !== 'setShipConsoleLock') locked = next;
        emit('setShipConsoleLock', { locked: next, requestId: `native-layout-lock-${requests.length}` }, { locked: next });
      } }];
  }
  function locator(matches) {
    const elements = () => nodes().filter(matches);
    return { matches, and: other => locator(node => matches(node) && other.matches(node)),
      count: async () => elements().length,
      isVisible: async () => elements().length === 1, isEnabled: async () => elements().length === 1,
      innerText: async () => elements()[0]?.name ?? '', getAttribute: async () => null,
      evaluate: async () => '',
      getByRole: (role, { name, exact }) => {
        assert.equal(exact, true);
        return locator(node => node.role === role && node.name === name &&
          elements().some(parent => parent.name === node.parent));
      },
      click: async () => {
        assert.equal(elements().length, 1, 'Exact full-layout source return absent or ambiguous.');
        await elements()[0].click();
      } };
  }
  const gm = { storeModuleUrl: () => '/src/store/useSessionStore.ts',
    page: { url: () => url, goto: async next => { navigate(next); return null; },
      getByRole: (role, { name, exact }) => {
        assert.equal(exact, true); assert.equal(typeof name, 'string');
        return locator(node => node.role === role && node.name === name);
      },
      locator: selector => {
        const match = selector.match(/^a(\.ship-console__back)?\[href(\$?)="([^"]+)"\]$/);
        assert.ok(match, `Unsupported native source selector ${selector}`);
        return locator(node => typeof node.href === 'string' &&
          (match[2] ? node.href.endsWith(match[3]) : node.href === match[3]) &&
          (!match[1] || node.className?.split(/\s+/).includes('ship-console__back')));
      },
      evaluate: async (fn, argument) => {
        if (argument?.moduleUrl) return { ...actor };
        if (String(fn).includes("fetch('/src/lib/firebaseConfig.ts')")) return runtime;
        assert.ok(String(fn).includes('main.ship-console[data-observer-mode]'));
        return { routePath: route(), observerMainCount: 1, observerMode: 'read', shipId,
          roleControlCount: 1, selectedRoleId: 'admiral', selectedRoleValid: true,
          loading: false, failed: false };
      },
      waitForResponse: (predicate, options) => {
        assert.ok(options.timeout > 0 && options.timeout <= 60_000);
        return new Promise((resolve, reject) => observers.push({ predicate, resolve, reject }));
      } },
    callable: async (endpoint, data) => {
      const request = requests.find(request => request.endpoint === endpoint &&
        JSON.stringify(request.data) === JSON.stringify(data));
      assert.ok(request && !request.rejected, 'Only exact committed UI captures may replay.');
      replays.push(endpoint); return { status: 'committed', result: request.result };
    } };
  let crewUrl = 'http://127.0.0.1:5173/#/ships/aegis/admiral';
  const crewNavigations = [], crewNavigationResponses = [];
  const crew = { storeModuleUrl: gm.storeModuleUrl, page: { url: () => crewUrl,
    goto: async next => {
      const navigation = await sourceBackedMemberGoto({ sourceRoot, fromUrl: crewUrl,
        toUrl: next, actor: crewActor });
      crewUrl = navigation.url;
      Object.assign(crewActor, navigation.actor);
      crewNavigations.push(navigation.navigation);
      crewNavigationResponses.push(navigation.response);
      return navigation.response;
    },
    evaluate: async (_fn, argument) => argument?.moduleUrl ? { ...crewActor } : runtime } };
  const proof = createMemberGmLifecycleUiProof({ sourceRoot, projectId, shipId, cases: ['gm-ship-grant-lock'] });
  const context = { gm, crew, directory, initial: { sessionId: original.sessionId,
    uidHash: original.uidHash, joinCode: 'NATIVE' }, started: { instanceId: original.instanceId },
    roster: [{ roleId: 'admiral', uidHash: crewActor.uidHash }] };
  t.after(async () => {
    for (const observer of observers.splice(0)) observer.reject(new Error('Native layout fixture closed.'));
    await rm(directory, { recursive: true });
  });
  return { run: () => proof.onStarted(context), evidence: proof.evidence, selected, actor, requests, replays,
    crewNavigations, crewNavigationResponses, crew, get returnedCrewActor() { return { ...crewActor }; } };
}

test('public factory captures the full-layout return while an unspaced partial-style decoy coexists', async t => {
  const f = await fullLayoutFixture(t);
  await f.run();
  assert.deepEqual(f.selected, [{ name: fullLayoutName, actor: { ...original, grantShipId: shipId } }]);
  const result = f.evidence.cases['gm-ship-grant-lock'];
  assert.equal(result.status, 'actual-ui-procedure-observed');
  assert.equal(result.revoke.httpStatus, 200); assert.equal(result.revoke.shipId, shipId);
  assert.equal(result.revoke.publicResult.enabled, false);
  assert.deepEqual(f.actor, original); assert.equal(f.replays.length, 3);
  assert.deepEqual(f.crewNavigations.at(-1), {
    kind: 'document-response-source-resume', beforeGeneration: original.generation,
    afterGeneration: original.generation + 1, beforeHydrationRevision: original.hydrationRevision,
    afterHydrationRevision: original.hydrationRevision + 1,
  }, 'Identical-URL page.goto is a document navigation backed by the actual Source resume lease.');
  assert.equal(f.returnedCrewActor.generation, original.generation + 1);
  assert.equal(f.returnedCrewActor.hydrationRevision, original.hydrationRevision + 1);
  assert.equal(f.crewNavigationResponses.at(-1).status(), 200);
  assert.equal(f.crewNavigationResponses.at(-1).url(), f.crew.page.url());
  assert.equal(f.evidence.actualRuntimeRuns, 0); assert.equal(f.evidence.nativeChecksAreGameplayProof, false);
});

test('full-layout crew navigation returns null only when the destination differs by hash', async t => {
  const f = await fullLayoutFixture(t);
  const before = { ...f.returnedCrewActor }, target = new URL(f.crew.page.url());
  target.hash = `${target.hash}-hash-only`;
  const response = await f.crew.page.goto(target.href);
  assert.equal(response, null);
  assert.equal(f.crewNavigationResponses.at(-1), null);
  assert.deepEqual(f.crewNavigations.at(-1), {
    kind: 'same-document-null', beforeGeneration: before.generation, afterGeneration: before.generation,
    beforeHydrationRevision: before.hydrationRevision, afterHydrationRevision: before.hydrationRevision,
  });
});

test('public factory never credits a partial-style decoy when the full-layout source return is absent', async t => {
  const f = await fullLayoutFixture(t, { sourcePresent: false });
  await assert.rejects(f.run());
  assert.equal(f.evidence.cases['gm-ship-grant-lock'].status, 'failed-uncredited');
  assert.deepEqual(f.selected, []); assert.deepEqual(f.actor, original);
});

for (const endpoint of ['setShipConsoleLock', 'setGmShipConsoleWriteGrant']) {
  test(`public factory denial of ${endpoint} cleans up through full-layout return without selecting the decoy`, async t => {
    const f = await fullLayoutFixture(t, { deniedEndpoint: endpoint });
    await assert.rejects(f.run(), new RegExp(`${endpoint}: actual UI request rejected`));
    assert.equal(f.evidence.cases['gm-ship-grant-lock'].status, 'failed-uncredited');
    assert.equal(f.selected.length, 1); assert.equal(f.selected[0].name, fullLayoutName);
    assert.equal(f.selected[0].actor.instanceId, original.instanceId);
    assert.equal(f.selected[0].actor.claimedAt, original.claimedAt);
    assert.deepEqual(f.actor, original);
    assert.equal(f.replays.length, endpoint === 'setShipConsoleLock' ? 1 : 0);
    assert.ok(!f.replays.includes(endpoint));
  });
}
