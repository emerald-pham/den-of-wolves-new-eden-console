import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createContext, Script, SourceTextModule, SyntheticModule } from 'node:vm';
import { JSDOM } from 'jsdom';
import ts from 'typescript';
import * as React from 'react';

// Native only: execute the repository's actual controlled TSX view and public
// Base callback. No browser, Auth, Firebase transport, engine or RNG is started.
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://native.invalid/' });
for (const key of ['window', 'document', 'HTMLElement', 'Node', 'Event', 'navigator'])
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no layout engine. This explicit inert rect seam verifies the
// serialized observer's geometry branches, not actual rendered browser paint.
dom.window.HTMLElement.prototype.getClientRects = function () {
  return this.isConnected ? [{ width: 100, height: 20 }] : [];
};
const { render, fireEvent, act, cleanup } = await import('@testing-library/react');
const sourceUrl = new URL('../src/components/WolfRangeActionPanel.tsx', import.meta.url);
const jsx = ts.transpileModule(await readFile(sourceUrl, 'utf8'), { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const componentContext = createContext({ console });
const component = new SourceTextModule(jsx, { context: componentContext });
await component.link(async specifier => {
  let exports;
  if (specifier === 'react') exports = React;
  else if (specifier === 'react/jsx-runtime') exports = await import(specifier);
  else if (specifier.endsWith('.css')) exports = {};
  else if (specifier.includes('firestore')) exports = { subscribeWolfAttackMemberView: () => { throw new Error('No transport in a native view fixture.'); } };
  else if (specifier.includes('sessionService')) exports = Object.fromEntries(
    ['assignWolfRangeTargets', 'commitWolfRangeActionChoice', 'getWolfRangeActionChoice'].map(name =>
      [name, () => { throw new Error('No SDK call or mutation in a native view fixture.'); }]));
  else if (specifier.includes('wolfAttackChoiceController')) exports = Object.fromEntries(
    ['useWolfAttackChoiceAuthority', 'useWolfAttackChoiceController'].map(name =>
      [name, () => { throw new Error('Only the real controlled view is mounted here.'); }]));
  else throw new Error(`Unexpected component dependency: ${specifier}`);
  return new SyntheticModule(Object.keys(exports), function () {
    for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
  }, { context: componentContext });
});
await component.evaluate();
const Panel = component.namespace.WolfRangeActionPanelView;
const callbackUrl = new URL('./pc10-base-combat-deduction-ui-proof.mjs', import.meta.url);
const callbackSource = await readFile(callbackUrl, 'utf8');
const clickBoundary = new Error('Native original single-click boundary; no SDK mutation or receipt.');

function currentView(overrides = {}) {
  return { type: 'wolf-range-action-choice-view', sessionId: 'native-session', turn: 1, revision: 19,
    currentStep: 'short-range', range: 'short-range', choiceStatus: 'targets-required',
    deadlineAt: '2026-10-06T02:00:00.000Z',
    eligibleActions: [{ actionId: 'native-missiles', sourceId: 'aegis-missile-launchers', range: 'short-range' }],
    hitSlots: [{ actionId: 'native-missiles', count: 1, damagePerHit: 1 }],
    contacts: [
      { contactId: 'contact-1', targetShipId: 'shepherd', available: true, requiredCoverageDamage: null },
      { contactId: 'contact-2', targetShipId: 'quellon', available: true, requiredCoverageDamage: null },
      { contactId: 'contact-3', targetShipId: 'aegis', available: true, requiredCoverageDamage: null },
    ], ...overrides };
}

function nativeFixture({ view = currentView(), afterSelections, sourceDrift, actorDrift,
  duringCertificate, expireWhileSaving = false } = {}) {
  cleanup();
  const calls = [], reads = [], selected = [], certificates = [], clicks = [], assigned = [];
  let role = 'wing-commander', key = 0, busy = false, renderedView = view, report, certificateReads = 0;
  const base = { hasAuth: true, sameActor: true, sessionId: 'native-session', phase: 'active', cycle: 1,
    connection: 'live', freshness: 'server', phaseProgression: 'manual', airspace: 'restricted', turnStatePhase: 'team',
    fleetGroupId: 'fleet-1', connectionGeneration: 10, identityHydrationRevision: 1,
    seatId: 'native-seat', replacementRoleId: null, replacementStatus: null,
    discoveryAuthority: { groupId: 'fleet-1', shipId: 'aegis', revision: 1, fleetGroupVesselIds: ['aegis'] } };
  const gmActor = { ...base, uidHash: 'native-gm', profileRoleId: null, assignedRoleId: null,
    activeConsoleRoleId: null, playerRole: 'gm', instanceId: 'native-instance', gmInstanceOwned: true };
  const crewActor = () => ({ ...base, uidHash: `native-${role}`, profileRoleId: role, assignedRoleId: role,
    activeConsoleRoleId: role, playerRole: 'player', ...actorDrift });
  function element() {
    return React.createElement(Panel, { key, view: renderedView, busy,
      onUseActions: () => { throw new Error('No pending action choice in this fixture.'); },
      onPass: () => { throw new Error('Never replace current targets with a pass.'); },
      onAssignTargets: value => assigned.push(structuredClone(value)) });
  }
  const mounted = render(element());
  const root = () => mounted.container.querySelector('section');
  const rerender = async () => { await act(async () => mounted.rerender(element())); };
  const effects = {
    root, remount: async () => { key++; await rerender(); },
    refreshIdentical: async () => { renderedView = structuredClone(view); await rerender(); },
    setBusy: async () => { busy = true; await rerender(); },
    change: async (index, value) => { await act(async () => fireEvent.change(root().querySelectorAll('select')[index], { target: { value } })); },
  };
  const expectedFieldCount = view.hitSlots.filter(slot => !view.eligibleActions.some(action =>
    action.actionId === slot.actionId && action.range === 'medium-range' &&
    ['aegis-alpha-wing', 'aegis-bravo-wing'].includes(action.sourceId)))
    .reduce((total, slot) => total + Math.min(slot.count, view.contacts.filter(item => item.available).length), 0);
  function locator(kind, name, index) {
    const nodes = () => {
      if (role !== 'executive-officer') return [];
      const list = [...root().querySelectorAll(kind === 'combobox' ? 'select' : kind === 'button' ? 'button' : 'option')];
      const filtered = name === undefined ? list : list.filter(node => (kind === 'button' ? node.textContent.trim() : node.getAttribute('aria-label')) === name);
      return index === undefined ? filtered : filtered.slice(index, index + 1);
    };
    return { all: async () => nodes().map((_node, i) => locator(kind, name, i)),
      evaluateAll: async callback => structuredClone(callback(nodes())),
      isVisible: async () => nodes().length === 1, isEnabled: async () => nodes().length === 1 && !nodes()[0].matches(':disabled'),
      getAttribute: async attribute => nodes()[0].getAttribute(attribute),
      locator: child => { assert.equal(child, 'option'); return { evaluateAll: async callback => structuredClone(callback([...nodes()[0].querySelectorAll('option')])) }; },
      selectOption: async value => {
        const node = nodes()[0]; assert.ok(node); assert.equal(node.matches(':disabled'), false);
        selected.push({ label: node.getAttribute('aria-label'), value });
        await act(async () => fireEvent.change(node, { target: { value } }));
        if (selected.length === expectedFieldCount) await afterSelections?.(effects);
        return [value];
      },
      click: async options => {
        clicks.push({ options, enabled: !nodes()[0].matches(':disabled'), remainingMs: decisionDeadline - Date.now() });
        if (nodes()[0].matches(':disabled')) throw new Error('Native attempted disabled original target commit.');
        throw clickBoundary;
      },
    };
  }
  const panel = { getByRole: (kind, options = {}) => locator(kind, options.name), innerText: async () => root().textContent,
    evaluate: async callback => {
      certificateReads++;
      const browser = createContext({ window: dom.window, document: dom.window.document,
        getComputedStyle: dom.window.getComputedStyle.bind(dom.window) });
      const value = new Script(`(${callback.toString()})`).runInContext(browser)(root());
      await duringCertificate?.(effects);
      // Match the existing page.evaluate serialization boundary into Node.
      return structuredClone(value);
    } };
  async function readStore(callback, url, isGm) {
    assert.equal(url, '/native-store');
    const actor = isGm ? gmActor : crewActor();
    const browser = createContext({});
    const module = new SyntheticModule(['useSessionStore'], function () {
      this.setExport('useSessionStore', { getState: () => ({ session: { id: actor.sessionId, playerDiscovery: actor.discoveryAuthority },
        me: { ...actor, connected: true }, identityHydrationRevision: actor.identityHydrationRevision }) });
    }, { context: browser });
    await module.link(() => {}); await module.evaluate();
    return structuredClone(await new Script(`(${callback.toString()})("/native-store")`, {
      importModuleDynamically: async () => module,
    }).runInContext(browser));
  }
  const surface = isGm => ({ observe: async () => ({ ...(isGm ? gmActor : crewActor()) }),
    storeModuleUrl: () => '/native-store', callable: async () => { throw new Error('No extra SDK read or mutation is permitted.'); },
    page: { getByRole: (kind, options = {}) => {
      assert.equal(kind, 'region'); assert.equal(options.name, 'Wolf range actions'); return panel;
    }, evaluate: (callback, url) => readStore(callback, url, isGm),
    waitForResponse: () => new Promise(() => {}) } });
  const gm = surface(true), crew = surface(false);
  const current = { type: 'wolf-attack-state', attackId: 'native-original-attack', turn: 1, revision: 19,
    status: 'declared', currentStep: view.currentStep, airspaceLocked: true };
  const context = { gm, crew, roster: ['wing-commander', 'executive-officer'].map(roleId =>
    ({ roleId, uidHash: `native-${roleId}` })), directory: '/native-no-files', initial: { sessionId: 'native-session' },
    started: { uidHash: gmActor.uidHash, instanceId: gmActor.instanceId } };
  const adapter = { select: async roleId => { role = roleId; return roleId === 'gm' ? gm : crew; },
    read: async (actor, path) => { reads.push({ actor, path }); return { ...current, ...sourceDrift }; } };
  let decisionDeadline;
  async function run() {
    const sandbox = createContext({ URL, console, Date });
    const module = new SourceTextModule(callbackSource, { context: sandbox, identifier: callbackUrl.href });
    await module.link(async specifier => {
      let exports;
      if (specifier === './pc10-two-browser-gameplay.mjs') exports = { createTwoBrowserGameplay: () => adapter };
      else if (specifier === 'node:fs/promises') exports = { writeFile: async (_path, text) => {
        report = JSON.parse(text);
        const next = report.observations.filter(row => row.stage === 'range target source and paint certificate');
        certificates.splice(0, certificates.length, ...next);
        if (expireWhileSaving && next.length) await new Promise(resolve => setTimeout(resolve, Math.max(1, decisionDeadline - Date.now() + 5)));
      } };
      else if (specifier === './pc10-live-wolf-attack-ui-proof.mjs') exports = {
        resolveLiveWolfAttack: async (_context, options) => {
          decisionDeadline = Date.now() + (expireWhileSaving ? 250 : 10_000);
          const waitChoice = async (_surface, _source, fields) => {
            calls.push({ kind: fields.kind, role });
            if (fields.kind !== 'range-actions') return { status: 'source-excluded', reason: 'already-committed' };
            return { status: 'eligible', choice: view, expected: { ...current, sessionId: 'native-session' },
              originalActor: { ...crewActor(), entitledShipId: 'aegis' } };
          };
          await options.chooseNext(current, { waitChoice, deadlineAt: decisionDeadline });
          throw new Error('Native fixture must stop at its original single-click boundary.');
        } };
      else exports = await import(specifier.startsWith('.') ? new URL(specifier, callbackUrl).href : specifier);
      return new SyntheticModule(Object.keys(exports), function () {
        for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
      }, { context: sandbox });
    });
    await module.evaluate();
    return module.namespace.runBaseCombatAndDeduction(context, { combat: 'current', deduction: false, requiredBranches: [] });
  }
  return { run, root, effects, selected, certificates, calls, clicks, reads, assigned,
    report: () => report, certificateReads: () => certificateReads, deadline: () => decisionDeadline };
}

async function expectCertified(f) {
  await assert.rejects(f.run(), error => error === clickBoundary);
  assert.equal(f.certificates.length, 1, 'The actual public caller must retain one final source-and-paint certificate.');
  assert.equal(f.certificates[0].matched, true);
  assert.equal(f.certificates[0].gameplayCredit, false);
  assert.equal(f.certificateReads(), 1);
  assert.equal(f.clicks.length, 1);
  assert.ok(f.clicks[0].options.timeout > 0 && f.clicks[0].options.timeout <= 35_000);
  assert.ok(f.clicks[0].options.timeout <= f.clicks[0].remainingMs + 1, 'The original choice deadline also caps the single click.');
  assert.equal(f.reads.length, 1, 'Only the existing receipt source read; no additional SDK/source read.');
  assert.equal(f.report().requests.length, 0, 'A native boundary is not a committed receipt.');
}

test('actual Base retains one final controlled target certificate before its original single UI click', async () => {
  const f = nativeFixture(); await expectCertified(f);
  await act(async () => fireEvent.click(f.root().querySelector('button')));
  assert.deepEqual(f.assigned, [[{ actionId: 'native-missiles', contactIds: ['contact-1'] }]]);
  const text = JSON.stringify(f.certificates);
  for (const privateValue of ['native-session', 'native-original-attack', 'contact-1', 'native-missiles', 'shepherd', 'native-executive-officer'])
    assert.equal(text.includes(privateValue), false, 'Only safe fingerprints, counts and flags are retained.');
});

test('actual short coverage accepts fixed damage, distinct contacts and the legal surplus assignment', async () => {
  const f = nativeFixture({ view: currentView({ eligibleActions: [
    { actionId: 'native-highwall', sourceId: 'highwall', range: 'short-range' },
    { actionId: 'native-missiles', sourceId: 'aegis-missile-launchers', range: 'short-range' },
  ], hitSlots: [{ actionId: 'native-highwall', count: 1, damagePerHit: 3 },
    { actionId: 'native-missiles', count: 2, damagePerHit: 1 }], contacts: [
    { contactId: 'contact-1', targetShipId: 'aegis', available: true, requiredCoverageDamage: 2 },
    { contactId: 'contact-2', targetShipId: 'dione', available: true, requiredCoverageDamage: 1 },
    { contactId: 'contact-3', targetShipId: 'quellon', available: true, requiredCoverageDamage: null },
  ] }) });
  await expectCertified(f); assert.deepEqual(f.selected.map(row => row.value), ['contact-1', 'contact-2', 'contact-3']);
});

test('an identical current DTO object refresh preserves the actual React draft', async () => {
  const f = nativeFixture({ afterSelections: effect => effect.refreshIdentical() }); await expectCertified(f);
});

test('nine current source slots and repeated Alpha labels retain the complete rendered field sequence', async () => {
  const view = currentView({ eligibleActions: Array.from({ length: 9 }, (_, index) =>
    ({ actionId: `native-alpha-${index}`, sourceId: 'aegis-alpha-wing', range: 'short-range' })),
  hitSlots: Array.from({ length: 9 }, (_, index) => ({ actionId: `native-alpha-${index}`, count: index % 3, damagePerHit: 1 })) });
  const f = nativeFixture({ view }); await expectCertified(f);
  assert.equal(f.selected.length, 9); assert.equal(f.certificates[0].expectedFieldCount, 9);
});

for (const [name, view] of [
  ['no remaining live contact with explicitly unused hits', currentView({ contacts: [
    { contactId: 'contact-1', targetShipId: 'aegis', available: false, requiredCoverageDamage: 0 },
  ] })],
  ['fixed Wing Commander Medium target without any EO target field', currentView({ currentStep: 'medium-range', range: 'medium-range',
    eligibleActions: [{ actionId: 'native-alpha', sourceId: 'aegis-alpha-wing', range: 'medium-range' }],
    hitSlots: [{ actionId: 'native-alpha', count: 1, damagePerHit: 1 }] })],
]) test(`source-legal ${name} receives a zero-field certificate`, async () => {
  const f = nativeFixture({ view }); await expectCertified(f); assert.equal(f.certificates[0].expectedFieldCount, 0);
});

for (const [name, change] of [
  ['same-source real component remount clears its draft', effect => effect.remount()],
  ['current busy state disables the real fields and commit', effect => effect.setBusy()],
  ['another enabled opaque contact replaced the intended value', effect => effect.change(0, 'contact-2')],
  ['missing final field', effect => effect.root().querySelector('select').remove()],
  ['extra final field', effect => effect.root().querySelector('select').after(effect.root().querySelector('select').cloneNode(true))],
  ['wrong final hit label', effect => effect.root().querySelector('select').setAttribute('aria-label', 'Bravo Fighter Wing hit 1')],
  ['hidden final field', effect => { effect.root().querySelector('select').style.display = 'none'; }],
  ['foreign option after selection', effect => effect.root().querySelector('select').add(new dom.window.Option('Foreign private contact', 'foreign-contact'))],
  ['missing original option after selection', effect => effect.root().querySelector('option[value="contact-1"]').remove()],
  ['disabled original option after selection', effect => { effect.root().querySelector('option[value="contact-1"]').disabled = true; }],
  ['wrong visible source target label', effect => { effect.root().querySelector('option[value="contact-1"]').textContent = 'contact-1 — AEGIS'; }],
  ['wrong painted cycle', effect => { effect.root().querySelector('.eyebrow').textContent = 'Cycle 2 // weapon control'; }],
  ['wrong painted range', effect => { effect.root().querySelector('h2').textContent = 'medium range'; }],
  ['wrong painted status', effect => { effect.root().querySelector('.wolf-range-action__status').textContent = 'Choice required'; }],
  ['wrong original printed deadline', effect => effect.root().querySelector('time').setAttribute('dateTime', '2026-10-07T02:00:00.000Z')],
  ['hidden current panel', effect => { effect.root().style.visibility = 'hidden'; }],
  ['duplicate final commit control', effect => effect.root().querySelector('button').after(effect.root().querySelector('button').cloneNode(true))],
]) test(`actual Base retains a failed certificate and never clicks when ${name}`, async () => {
  const f = nativeFixture({ afterSelections: change });
  await assert.rejects(f.run(), /target.*certificate/i);
  assert.equal(f.clicks.length, 0); assert.equal(f.certificateReads(), 1);
  assert.equal(f.certificates.length, 1); assert.equal(f.certificates[0].matched, false);
  assert.equal(f.certificates[0].gameplayCredit, false); assert.equal(f.report().requests.length, 0);
});

test('actual incomplete Fighter coverage disables commit and is retained without guessing a product fix', async () => {
  const f = nativeFixture({ view: currentView({ eligibleActions: [
    { actionId: 'native-missiles', sourceId: 'aegis-missile-launchers', range: 'short-range' },
    { actionId: 'native-lasers', sourceId: 'aegis-point-defence-lasers', range: 'short-range' },
  ], hitSlots: [{ actionId: 'native-missiles', count: 1, damagePerHit: 1 }, { actionId: 'native-lasers', count: 1, damagePerHit: 1 }],
  contacts: [{ contactId: 'contact-1', targetShipId: 'aegis', available: true, requiredCoverageDamage: 2 },
    { contactId: 'contact-2', targetShipId: 'quellon', available: true, requiredCoverageDamage: null }] }),
  afterSelections: effect => effect.change(1, 'contact-2') });
  await assert.rejects(f.run(), /target.*certificate/i);
  assert.equal(f.root().querySelector('button').disabled, true);
  assert.equal(f.certificates[0].commitEnabled, false); assert.equal(f.clicks.length, 0);
});

test('original remaining deadline is rechecked after saving the certificate; the click receives no fresh35s', async () => {
  const f = nativeFixture({ expireWhileSaving: true });
  await assert.rejects(f.run(), /original.*deadline|decision budget/i);
  assert.equal(f.certificates.length, 1); assert.equal(f.certificates[0].matched, true);
  assert.equal(f.clicks.length, 0); assert.equal(f.certificateReads(), 1);
});

for (const [field, value] of [['uidHash', 'foreign-uid'], ['connectionGeneration', 11], ['identityHydrationRevision', 2],
  ['sessionId', 'foreign-session'], ['fleetGroupId', 'foreign-group'], ['seatId', 'foreign-seat'], ['profileRoleId', 'admiral']])
  test(`the unchanged held-combat ${field} guard still fails after the final observation`, async () => {
    const drift = {}, f = nativeFixture({ actorDrift: drift, duringCertificate: () => { drift[field] = value; } });
    await assert.rejects(f.run(), /Original combat|sessionId|entitled/);
    assert.equal(f.clicks.length, 0); assert.equal(f.report()?.requests.length ?? 0, 0);
  });

test('the unchanged receipt source revision fence rejects a newer attack before any final certificate or click', async () => {
  const f = nativeFixture({ sourceDrift: { revision: 20 } });
  await assert.rejects(f.run(), /Current source revision changed/);
  assert.equal(f.certificateReads(), 0); assert.equal(f.clicks.length, 0);
});
