import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createMemberGmLifecycleUiProof } from './pc10-member-gm-lifecycle-ui-proof.mjs';

const sourceRoot = fileURLToPath(new URL('..', import.meta.url));
const projectId = 'demo-native-observer-return';
const shipId = 'aegis';
const roleHref = `#/ships/${shipId}/roles`;
const actor = Object.freeze({ sessionId: 'native-session', uidHash: '0123456789abcdef',
  hasAuth: true, sameActor: true, connection: 'live', freshness: 'server', generation: 1,
  hydrationRevision: 2, playerRole: 'gm', instanceId: 'native-instance', claimedAt: 'native-lease',
  gmInstanceOwned: true, grantShipId: null, privateAudienceMatches: true, foreignPendingCount: 0,
  activeConsoleRoleId: null, phase: 'active', cycle: 1, profileRoleId: null });

// Native transport doubles exercise the public factory. They create no browser,
// Auth account, server grant, emulator or gameplay evidence. The exact rendered
// name comes from the owner's harmless FULL index CSS ariaSnapshot, including
// the source link's inline-flex layout rather than only its ::before rule.
async function fixture(t, options = {}) {
  const directory = await mkdtemp(resolve(tmpdir(), 'pc10-native-observer-return-'));
  const current = { ...actor }, crewActor = { ...actor, uidHash: 'fedcba9876543210',
    playerRole: 'player', instanceId: null, claimedAt: null, gmInstanceOwned: false,
    profileRoleId: 'admiral', assignedRoleId: 'admiral' };
  let gmUrl = 'http://127.0.0.1:5173/#/console';
  let crewUrl = 'http://127.0.0.1:5173/#/ships/aegis/admiral';
  let locked = false;
  const pending = [], requests = [], clicks = [], replays = [];
  const runtimeSource = `import.meta.env = ${JSON.stringify({
    VITE_FIREBASE_PROJECT_ID: projectId, VITE_USE_EMULATORS: '1',
    VITE_FIREBASE_AUTH_EMULATOR_PORT: '9109', VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT: '5011',
    VITE_FIREBASE_FIRESTORE_EMULATOR_PORT: '8090',
  })};`;
  const route = () => new URL(gmUrl).hash.slice(1);
  const data = extra => ({ sessionId: actor.sessionId, instanceId: actor.instanceId, shipId, ...extra });
  function emit(endpoint, requestData, body, httpStatus = 200) {
    const response = { url: () => `http://127.0.0.1:5011/${projectId}/us-central1/${endpoint}`,
      request: () => ({ method: () => 'POST', postDataJSON: () => ({ data: requestData }) }),
      status: () => httpStatus, json: async () => body };
    requests.push({ endpoint, data: requestData, body, httpStatus });
    for (const observer of [...pending]) if (observer.predicate(response)) {
      pending.splice(pending.indexOf(observer), 1); observer.resolve(response);
    }
  }
  function leaveObserver(nextUrl) {
    if (route() === `/ships/${shipId}/observer`) {
      // ShipConsole's captured-authority unmount cleanup revokes even after a
      // failed selector. This never credits a missing return click or receipt.
      current.grantShipId = null;
      emit('setGmShipConsoleWriteGrant', data({ enabled: false }), { result: { enabled: false } });
    }
    gmUrl = nextUrl;
  }
  function nodes() {
    if (route() === '/console') return [{ role: 'link', name: 'Original ship', href: roleHref,
      click: async () => { gmUrl = `http://127.0.0.1:5173/${roleHref}`; } }];
    if (route() === `/ships/${shipId}/roles`) return [{ role: 'link', name: 'View ship consoles',
      click: async () => { gmUrl = `http://127.0.0.1:5173/#/ships/${shipId}/observer`; } }];
    if (route() !== `/ships/${shipId}/observer`) return [];
    return [
      ...Array.from({ length: options.returnCount ?? 1 }, () => ({ role: 'link',
        name: options.returnName ?? '← Change role', href: options.returnHref ?? roleHref,
        className: options.returnClass ?? 'ship-console__back cic-text-button',
        visible: options.returnVisible ?? true,
        click: async function () {
          clicks.push({ name: this.name, href: this.href, className: this.className,
            actor: { ...current } });
          leaveObserver(new URL(this.href, gmUrl).href);
        } })),
      { role: 'button', name: 'GM ship console read write access', click: async () => {} },
      { role: 'alertdialog', name: 'Are you sure?' },
      { role: 'button', name: 'ARE YOU SURE?', parent: 'Are you sure?', click: async () => {
        current.grantShipId = shipId;
        emit('setGmShipConsoleWriteGrant', data({ enabled: true }), { result: { enabled: true } });
      } },
      { role: 'region', name: 'ICN console lock' },
      { role: 'button', name: locked ? 'Release ICN console lock' : 'Engage ICN console lock',
        parent: 'ICN console lock', click: async () => {
          const next = !locked;
          if (!options.denyLock) locked = next;
          emit('setShipConsoleLock', data({ locked: next, requestId: `native-lock-${requests.length}` }),
            options.denyLock ? { error: { status: 'PERMISSION_DENIED' } } : { result: { locked: next } },
            options.denyLock ? 403 : 200);
        } },
    ];
  }
  function locator(matches) {
    const selected = () => nodes().filter(matches);
    return {
      and: other => locator(node => matches(node) && other.matches(node)), matches,
      count: async () => selected().length,
      isVisible: async () => selected().length === 1 && selected()[0].visible !== false,
      isEnabled: async () => selected().length === 1,
      innerText: async () => selected()[0]?.name ?? '',
      getAttribute: async name => selected()[0]?.[name] ?? null,
      evaluate: async () => '',
      getByRole: (role, { name, exact }) => {
        assert.equal(exact, true);
        return locator(node => node.role === role && node.name === name &&
          selected().some(parent => parent.name === node.parent));
      },
      click: async () => {
        assert.equal(selected().length, 1, 'Native exact mounted control absent or ambiguous.');
        assert.notEqual(selected()[0].visible, false, 'Native mounted control is hidden.');
        await selected()[0].click();
      },
    };
  }
  const page = {
    url: () => gmUrl,
    goto: async url => leaveObserver(url),
    getByRole: (role, { name, exact }) => {
      assert.equal(exact, true);
      return locator(node => node.role === role && node.name === name);
    },
    locator: selector => {
      const match = selector.match(/^a(\.ship-console__back)?\[href(\$?)="([^"]+)"\]$/);
      assert.ok(match, `Unsupported native selector ${selector}`);
      return locator(node => node.role === 'link' && typeof node.href === 'string' &&
        (match[2] ? node.href.endsWith(match[3]) : node.href === match[3]) &&
        (!match[1] || node.className?.split(/\s+/).includes('ship-console__back')));
    },
    evaluate: async (fn, argument) => {
      if (argument?.moduleUrl) return { ...current };
      if (String(fn).includes("fetch('/src/lib/firebaseConfig.ts')")) return runtimeSource;
      assert.ok(String(fn).includes('main.ship-console[data-observer-mode]'));
      return { routePath: route(), observerMainCount: 1, observerMode: current.grantShipId ? 'write' : 'read',
        shipId, roleControlCount: 1, selectedRoleId: 'admiral', selectedRoleValid: true,
        loading: false, failed: false };
    },
    waitForResponse: (predicate, waitOptions) => {
      assert.ok(waitOptions.timeout > 0 && waitOptions.timeout <= 60_000);
      return new Promise((resolve, reject) => pending.push({ predicate, resolve, reject }));
    },
  };
  const gm = { page, storeModuleUrl: () => '/src/store/useSessionStore.ts',
    callable: async (endpoint, requestData) => {
      const observed = requests.find(request => request.endpoint === endpoint &&
        JSON.stringify(request.data) === JSON.stringify(requestData));
      assert.ok(observed, 'Native replay must follow an exact observed UI request.');
      assert.equal(observed.httpStatus, 200);
      replays.push({ endpoint, data: requestData });
      return { status: 'committed', result: observed.body.result };
    } };
  const crew = { storeModuleUrl: gm.storeModuleUrl,
    page: { url: () => crewUrl, goto: async url => { crewUrl = url; },
      evaluate: async (_fn, argument) => argument?.moduleUrl ? { ...crewActor } : runtimeSource } };
  const context = { gm, crew, directory, initial: { sessionId: actor.sessionId,
    joinCode: 'NATIVE', uidHash: actor.uidHash }, started: { instanceId: actor.instanceId },
    roster: [{ roleId: 'admiral', uidHash: crewActor.uidHash }] };
  const proof = createMemberGmLifecycleUiProof({ sourceRoot, projectId, shipId,
    cases: ['gm-ship-grant-lock'] });
  t.after(async () => {
    for (const observer of pending.splice(0)) observer.reject(new Error('Native fixture closed.'));
    await rm(directory, { recursive: true });
  });
  return { run: () => proof.onStarted(context), evidence: proof.evidence,
    requests, clicks, replays, current, initial: { ...actor } };
}

test('public lifecycle factory captures current source-mounted return and revocation for the original ship', async t => {
  const f = await fixture(t);
  await f.run();
  const result = f.evidence.cases['gm-ship-grant-lock'];
  assert.equal(result.status, 'actual-ui-procedure-observed');
  assert.equal(result.revoke.httpStatus, 200);
  assert.equal(result.revoke.shipId, shipId);
  assert.equal(result.revoke.publicResult.enabled, false);
  assert.deepEqual(result.revoke.originalActor, { sessionId: actor.sessionId, uidHash: actor.uidHash,
    generation: actor.generation, instanceId: actor.instanceId, claimedAt: actor.claimedAt,
    hydrationRevision: actor.hydrationRevision });
  assert.equal(f.clicks.length, 1);
  assert.equal(f.clicks[0].name, '← Change role');
  assert.equal(f.clicks[0].href, roleHref);
  assert.equal(f.clicks[0].actor.grantShipId, shipId);
  assert.deepEqual(f.current, f.initial);
  assert.equal(f.replays.length, 3);
  assert.equal(f.evidence.sourceUnchanged, true);
  assert.equal(f.evidence.actualRuntimeRuns, 0);
  assert.equal(f.evidence.nativeChecksAreGameplayProof, false);
  assert.deepEqual(f.crewNavigations.at(-1), {
    kind: 'same-document-null', beforeGeneration: actor.generation, afterGeneration: actor.generation,
  }, 'The unchanged crew document returns Playwright null and preserves the original source lease.');
});

test('public lifecycle factory distinguishes same-document null from a stale full-document response', async t => {
  const sameDocument = await fixture(t, { crewNavigation: 'same-document-null' });
  await sameDocument.run();
  assert.deepEqual(sameDocument.crewNavigations.at(-1), {
    kind: 'same-document-null', beforeGeneration: actor.generation, afterGeneration: actor.generation,
  });

  const staleDocument = await fixture(t, { crewNavigation: 'document-response-stale' });
  await assert.rejects(staleDocument.run(), /Original selected actor restored/);
  assert.deepEqual(staleDocument.crewNavigations.at(-1), {
    kind: 'document-response-stale', beforeGeneration: actor.generation, afterGeneration: actor.generation,
  }, 'A Response means rejoin; without a newer source generation the old authority is rejected.');
  assert.equal(staleDocument.evidence.actualRuntimeRuns, 0);
  assert.equal(staleDocument.evidence.nativeChecksAreGameplayProof, false);
});

test('public lifecycle factory finally uses the same source return after genuine lock denial without granting credit', async t => {
  const f = await fixture(t, { denyLock: true });
  await assert.rejects(f.run(), /setShipConsoleLock: actual UI request rejected/);
  assert.equal(f.evidence.cases['gm-ship-grant-lock'].status, 'failed-uncredited');
  assert.equal(f.clicks.length, 1, 'Denial cleanup must activate the current source return.');
  assert.equal(f.clicks[0].href, roleHref);
  assert.equal(f.clicks[0].actor.grantShipId, shipId);
  assert.deepEqual(f.current, f.initial);
  assert.equal(f.replays.length, 1, 'A denied lock must never be replayed.');
});

for (const [reason, options] of [
  ['foreign ship href', { returnHref: '#/ships/dione/roles' }],
  ['non-source link class', { returnClass: 'unrelated-return' }],
  ['plain name alias', { returnName: 'Change role' }],
  ['unspaced partial-style name', { returnName: '←Change role' }],
  ['absent return', { returnCount: 0 }],
  ['ambiguous returns', { returnCount: 2 }],
  ['hidden return', { returnVisible: false }],
]) test(`public lifecycle factory leaves ${reason} uncredited without clicking it`, async t => {
  const f = await fixture(t, options);
  await assert.rejects(f.run());
  assert.equal(f.evidence.cases['gm-ship-grant-lock'].status, 'failed-uncredited');
  assert.equal(f.clicks.length, 0);
  assert.deepEqual(f.current, f.initial);
});
