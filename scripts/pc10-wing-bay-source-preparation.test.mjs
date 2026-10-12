import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createP181StarlightNativeSurfaceFactory } from './pc10-starlight-movement-scout-ui-proof.mjs';

// These use the existing actual factory with inert Playwright ports. They do
// not authenticate, start a browser/server, reserve a slot or prove gameplay.
function controlledFactory(actorProfile) {
  const browsers = [], surfaces = [], routes = [];
  let providerLaunches = 0;
  const factory = createP181StarlightNativeSurfaceFactory({
    ...(actorProfile === undefined ? {} : { actorProfile }),
    chromium: { async launch(options) {
      providerLaunches++;
      assert.deepEqual(options, { channel: 'chrome', headless: true });
      let connected = true;
      return {
        isConnected: () => connected,
        async close() { connected = false; },
        async newContext() { return {
          async route(pattern, handler) { routes.push({ pattern, handler }); },
          async newPage() {
            const page = new EventEmitter();
            page.url = () => 'http://127.0.0.1:5178/';
            page.setDefaultTimeout = () => {};
            page.setDefaultNavigationTimeout = () => {};
            return page;
          },
        }; },
      };
    } },
    baseUrl: 'http://127.0.0.1:5178',
    ports: { auth: 9149, functions: 5051, firestore: 8130 },
    directory: '/tmp/controlled-wing-bay-source-only',
    browsers, surfaces, remoteRequests: [], pageErrors: [], calls: [], requests: [],
  });
  return { factory, browsers, surfaces, routes, providerLaunches: () => providerLaunches,
    async close() { await Promise.all(browsers.map(browser => browser.close())); } };
}

test('Wing bay source profile admits exactly the three declared original surfaces', async () => {
  const held = controlledFactory('wing-bays');
  try {
    for (const label of ['normal-gm', 'normal-wing-commander', 'normal-admiral'])
      await held.factory.launch(label);
    assert.deepEqual(held.surfaces.map(surface => surface.label),
      ['normal-gm', 'normal-wing-commander', 'normal-admiral']);
    assert.equal(held.browsers.length, 3);
    assert.equal(held.providerLaunches(), 3);
    assert.equal(held.routes.length, 3);
    await assert.rejects(held.factory.launch('normal-admiral'));
    assert.equal(held.providerLaunches(), 3);
  } finally { await held.close(); }
  assert.deepEqual(held.browsers.map(browser => browser.isConnected()), [false, false, false]);
});

test('Wing bay source profile refuses a duplicate before a second provider acquisition', async () => {
  const held = controlledFactory('wing-bays');
  try {
    await held.factory.launch('normal-gm');
    await assert.rejects(held.factory.launch('normal-gm'));
    assert.equal(held.providerLaunches(), 1);
    assert.equal(held.surfaces.length, 1);
  } finally { await held.close(); }
});

test('Wing bay source profile rejects an unknown profile rather than silently choosing the two-actor default', () => {
  assert.throws(() => controlledFactory('unreviewed-four-actor-profile'));
});

test('the original source profile refuses a duplicate label before a second provider acquisition', async () => {
  const held = controlledFactory();
  try {
    await held.factory.launch('normal-gm');
    await assert.rejects(held.factory.launch('normal-gm'));
    assert.equal(held.providerLaunches(), 1);
  } finally { await held.close(); }
});

test('the original default source profile still admits GM/Wing and rejects Admiral without acquiring it', async () => {
  const held = controlledFactory();
  try {
    await held.factory.launch('normal-gm');
    await held.factory.launch('normal-wing-commander');
    await assert.rejects(held.factory.launch('normal-admiral'));
    assert.equal(held.providerLaunches(), 2);
    assert.deepEqual(held.surfaces.map(surface => surface.label), ['normal-gm', 'normal-wing-commander']);
  } finally { await held.close(); }
});

test('Wing bay source profile refuses foreign labels without acquiring any provider resource', async () => {
  const held = controlledFactory('wing-bays');
  try {
    await assert.rejects(held.factory.launch('foreign-role'));
    assert.equal(held.providerLaunches(), 0);
    assert.equal(held.browsers.length, 0);
  } finally { await held.close(); }
});
