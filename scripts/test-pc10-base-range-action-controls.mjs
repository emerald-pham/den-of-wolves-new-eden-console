import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createContext, Script, SourceTextModule, SyntheticModule } from 'node:vm';
import { JSDOM } from 'jsdom';
import ts from 'typescript';
import * as React from 'react';

// Native only: the complete current controlled TSX, actual pure weapon policy,
// serialized DOM callback and public Base caller. No browser or transport runs.
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://native.invalid/' });
for (const key of ['window', 'document', 'HTMLElement', 'Node', 'Event', 'navigator'])
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// Explicit inert layout seam: jsdom cannot qualify real browser paint.
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
      [name, () => { throw new Error('Only the actual controlled view is mounted.'); }]));
  else throw new Error(`Unexpected component dependency: ${specifier}`);
  return new SyntheticModule(Object.keys(exports), function () {
    for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
  }, { context: componentContext });
});
await component.evaluate();
const Panel = component.namespace.WolfRangeActionPanelView;
const weaponUrl = new URL('../functions/src/wolfAttackLifecycle.ts', import.meta.url);
const weaponSource = ts.createSourceFile(weaponUrl.pathname, await readFile(weaponUrl, 'utf8'), ts.ScriptTarget.Latest, true);
const weaponNode = weaponSource.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'aegisWolfRangeActions');
assert.ok(weaponNode, 'Bind the fixture to the actual normal pure weapon policy.');
const weaponContext = createContext({});
const weaponModule = new SourceTextModule(ts.transpileModule(weaponNode.getText(weaponSource), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText, { context: weaponContext });
await weaponModule.link(() => { throw new Error('The pure weapon policy needs no transport.'); });
await weaponModule.evaluate();
const callbackUrl = new URL('./pc10-base-combat-deduction-ui-proof.mjs', import.meta.url);
const callbackSource = await readFile(callbackUrl, 'utf8');
const clickBoundary = new Error('Native original single-click boundary; no SDK mutation or receipt.');
const roleUidHash = role => createHash('sha256').update(`native-real-uid-${role}`).digest('hex').slice(0, 16);

function currentView(overrides = {}, weaponOverrides = {}) {
  const range = overrides.range ?? 'short-range';
  const actions = structuredClone(weaponModule.namespace.aegisWolfRangeActions({ range,
    charges: ['missile-launchers', 'point-defence-lasers'], damagedSystemIds: [], destroyed: false,
    upgrades: [], ...weaponOverrides }));
  return { type: 'wolf-range-action-choice-view', sessionId: 'native-session', turn: 1, revision: 18,
    currentStep: range, range, choiceStatus: 'pending', deadlineAt: '2026-10-06T09:00:00.000Z',
    // This is the exact public mapping in wolfRangeChoiceView, not invented IDs,
    // dice, damage, outcomes or support/fighter decisions.
    eligibleActions: actions.map(({ actionId, sourceId, range }) => ({ actionId, sourceId, range })),
    hitSlots: [], contacts: [{ contactId: 'contact-1', targetShipId: 'aegis', available: true }], ...overrides };
}

function nativeFixture({ view = currentView(), rendered = view, duringReceiptRead, afterSelections,
  sourceDrift, actorDrift, duringCertificate, expireWhileSaving = false, disabledBeforeSelection = false } = {}) {
  cleanup();
  const reads = [], bootstrapReads = [], checks = [], certificates = [], clicks = [], payloads = [], expectations = [];
  let role = 'wing-commander', key = 0, busy = disabledBeforeSelection, renderedView = rendered, report, certificateReads = 0;
  const base = { hasAuth: true, sameActor: true, sessionId: 'native-session', phase: 'active', cycle: 1,
    connection: 'live', freshness: 'server', phaseProgression: 'manual', airspace: 'restricted', turnStatePhase: 'team',
    fleetGroupId: 'fleet-1', connectionGeneration: 10, identityHydrationRevision: 1,
    seatId: 'native-seat', replacementRoleId: null, replacementStatus: null,
    discoveryAuthority: { groupId: 'fleet-1', shipId: 'aegis', revision: 1, fleetGroupVesselIds: ['aegis'] } };
  const gmActor = { ...base, uidHash: roleUidHash('gm'), profileRoleId: null, assignedRoleId: null,
    activeConsoleRoleId: null, playerRole: 'gm', instanceId: 'native-instance', gmInstanceOwned: true };
  const crewActor = () => ({ ...base, uidHash: roleUidHash(role), profileRoleId: role, assignedRoleId: role,
    activeConsoleRoleId: role, playerRole: 'player', ...actorDrift });
  const selectableCount = view.eligibleActions.filter(({ sourceId }) => sourceId.startsWith('aegis-')).length;
  function element() {
    return React.createElement(Panel, { key, view: renderedView, busy,
      onUseActions: actionIds => payloads.push({ button: 'Use selected actions', actionIds: [...actionIds] }),
      onPass: () => payloads.push({ button: 'Pass this range', actionIds: [] }),
      onAssignTargets: () => { throw new Error('This fixture must not alter the old target assignment path.'); } });
  }
  const mounted = render(element()), root = () => mounted.container.querySelector('section');
  const rerender = async () => { await act(async () => mounted.rerender(element())); };
  const effects = {
    root, remount: async () => { key++; await rerender(); },
    refreshIdentical: async () => { renderedView = structuredClone(view); await rerender(); },
    changeView: async next => { renderedView = next; await rerender(); },
    setBusy: async () => { busy = true; await rerender(); },
    clearFirst: async () => { await act(async () => fireEvent.click(root().querySelector('input'))); },
  };
  let decisionDeadline;
  function locator(kind, name, index) {
    const nodes = () => {
      if (role !== 'executive-officer') return [];
      const list = [...root().querySelectorAll(kind === 'checkbox' ? 'input[type="checkbox"]' : 'button')];
      const filtered = name === undefined ? list : list.filter(node => node.textContent.trim() === name);
      return index === undefined ? filtered : filtered.slice(index, index + 1);
    };
    return { all: async () => nodes().map((_node, i) => locator(kind, name, i)),
      count: async () => nodes().length,
      evaluateAll: async callback => structuredClone(callback(nodes())),
      isVisible: async () => nodes().length === 1, isEnabled: async () => nodes().length === 1 && !nodes()[0].matches(':disabled'),
      check: async options => {
        const node = nodes()[0]; assert.ok(node); assert.equal(node.matches(':disabled'), false, 'Native disabled original action checkbox.');
        checks.push({ options, afterReceiptRead: reads.length > 0, label: node.closest('label')?.querySelector('span')?.textContent });
        if (!node.checked) await act(async () => fireEvent.click(node));
        if (checks.length === selectableCount) await afterSelections?.(effects);
      },
      click: async options => {
        const node = nodes()[0]; assert.ok(node);
        clicks.push({ options, button: name, enabled: !node.matches(':disabled'), remainingMs: decisionDeadline - Date.now() });
        assert.equal(node.matches(':disabled'), false, 'Native attempted disabled original Use action.');
        await act(async () => fireEvent.click(node));
        throw clickBoundary;
      },
    };
  }
  const panel = { getByRole: (kind, options = {}) => locator(kind, options.name), innerText: async () => root().textContent,
    count: async () => dom.window.document.querySelectorAll('section[aria-label="Wolf range actions"]').length,
    isVisible: async () => !!root(),
    evaluate: async callback => {
      certificateReads++;
      const browser = createContext({ window: dom.window, document: dom.window.document,
        getComputedStyle: dom.window.getComputedStyle.bind(dom.window) });
      const value = new Script(`(${callback.toString()})`).runInContext(browser)(root());
      await duringCertificate?.(effects, certificateReads);
      return structuredClone(value); // Actual page.evaluate serialization into Node.
    } };
  async function readStore(callback, url, isGm) {
    assert.equal(url, '/native-store');
    const actor = isGm ? gmActor : crewActor(), browser = createContext({});
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
    storeModuleUrl: () => '/native-store', callable: async () => { throw new Error('No extra SDK read, retry or mutation is permitted.'); },
    page: { getByRole: (kind, options = {}) => {
      assert.equal(kind, 'region'); assert.equal(options.name, 'Wolf range actions'); return panel;
    }, evaluate: (callback, url) => readStore(callback, url, isGm), waitForResponse: () => new Promise(() => {}) } });
  const gm = surface(true), crew = surface(false);
  const current = { type: 'wolf-attack-state', attackId: 'native-original-attack', turn: 1, revision: 18,
    status: 'declared', currentStep: view.range, airspaceLocked: true };
  const context = { gm, crew, roster: ['wing-commander', 'executive-officer'].map(roleId =>
    ({ roleId, uidHash: roleUidHash(roleId) })), directory: '/native-no-files', initial: { sessionId: 'native-session' },
    started: { uidHash: gmActor.uidHash, instanceId: gmActor.instanceId } };
  const adapter = { select: async roleId => { role = roleId; return roleId === 'gm' ? gm : crew; },
    read: async (actor, path) => {
      reads.push({ actor, path });
      if (decisionDeadline) await duringReceiptRead?.(effects);
      return { ...current, ...(decisionDeadline ? sourceDrift : {}) };
    } };
  async function run() {
    const sandbox = createContext({ URL, console, Date });
    const module = new SourceTextModule(callbackSource, { context: sandbox, identifier: callbackUrl.href });
    await module.link(async specifier => {
      let exports;
      if (specifier === './pc10-two-browser-gameplay.mjs') exports = { createTwoBrowserGameplay: () => adapter };
      else if (specifier === 'node:fs/promises') exports = { writeFile: async (_path, text) => {
        report = JSON.parse(text);
        const next = report.observations.filter(row => row.stage === 'range action source and paint certificate');
        certificates.splice(0, certificates.length, ...next);
        if (expireWhileSaving && next.length) await new Promise(resolve => setTimeout(resolve, Math.max(1, decisionDeadline - Date.now() + 5)));
      } };
      else if (specifier === './pc10-live-wolf-attack-ui-proof.mjs') exports = {
        resolveLiveWolfAttack: async (_context, options) => {
          bootstrapReads.push(...reads.splice(0));
          decisionDeadline = Date.now() + (expireWhileSaving ? 250 : 10_000);
          const waitChoice = async (_surface, _source, fields) => fields.kind !== 'range-actions'
            ? { status: 'source-excluded', reason: 'already-committed' }
            : { status: 'eligible', choice: view, expected: { ...current, sessionId: 'native-session' },
              originalActor: { ...crewActor(), entitledShipId: 'aegis' } };
          await options.chooseNext(current, { waitChoice, deadlineAt: decisionDeadline });
          throw new Error('The fixture must stop at its original single-click boundary.');
        } };
      else {
        exports = await import(specifier.startsWith('.') ? new URL(specifier, callbackUrl).href : specifier);
        if (specifier === './pc10-base-combat-deduction-contracts.mjs') {
          const actualCapture = exports.captureBaseUiReceipt;
          exports = { ...exports, captureBaseUiReceipt: input => {
            expectations.push(structuredClone(input.expectedRequest)); return actualCapture(input);
          } };
        }
      }
      return new SyntheticModule(Object.keys(exports), function () {
        for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
      }, { context: sandbox });
    });
    await module.evaluate();
    return module.namespace.runBaseCombatAndDeduction(context, { combat: 'current', deduction: false, requiredBranches: [] });
  }
  return { run, root, effects, view, reads, bootstrapReads, checks, certificates, clicks, payloads, expectations,
    report: () => report, certificateReads: () => certificateReads, deadline: () => decisionDeadline };
}

async function expectCertified(f) {
  await assert.rejects(f.run(), error => error === clickBoundary);
  const actionIds = f.view.eligibleActions.filter(({ sourceId }) => sourceId.startsWith('aegis-')).map(({ actionId }) => actionId);
  assert.deepEqual(f.expectations[0], { range: f.view.range, actionIds, expectedTurn: f.view.turn, expectedRevision: f.view.revision });
  assert.deepEqual(f.payloads, [{ button: actionIds.length ? 'Use selected actions' : 'Pass this range', actionIds }]);
  assert.equal(f.checks.length, actionIds.length, 'One sole check per originally source-offered control; no restoration.');
  assert.equal(f.checks.every(row => row.afterReceiptRead), true, 'Normal selection follows existing receipt source/actor checkpoints.');
  assert.equal(f.certificates.length, 1); assert.equal(f.certificates[0].matched, true);
  assert.equal(f.certificates[0].gameplayCredit, false); assert.equal(f.clicks.length, 1);
  assert.ok(f.clicks[0].options.timeout > 0 && f.clicks[0].options.timeout <= 35_000);
  assert.ok(f.clicks[0].options.timeout <= f.clicks[0].remainingMs + 1, 'No fresh choice deadline.');
  assert.equal(f.reads.length, 1, 'Only the existing receipt source read.');
  assert.equal(f.report().requests.length, 0, 'The inert single-click boundary is not a committed SDK receipt.');
}

for (const range of ['long-range', 'medium-range', 'short-range'])
  test(`actual source ${range} sole AEGIS selection is certified after receipt checkpoints`, async () => {
    await expectCertified(nativeFixture({ view: currentView({ range, currentStep: range }) }));
  });

test('same-source actual controlled remount during the existing receipt read cannot discard an earlier selection', async () => {
  const f = nativeFixture({ duringReceiptRead: effect => effect.remount() }); await expectCertified(f);
});

test('an identical DTO refresh at the delayed receipt checkpoint keeps the normal current form usable', async () => {
  const f = nativeFixture({ duringReceiptRead: effect => effect.refreshIdentical() }); await expectCertified(f);
});

test('actual source offers no AEGIS actions: the sole legal Pass uses an exact empty actionIds request', async () => {
  const view = currentView({}, { charges: [] });
  view.eligibleActions.push({ actionId: 'source-highwall-short', sourceId: 'highwall', range: 'short-range' });
  const f = nativeFixture({ view }); await expectCertified(f); assert.equal(f.checks.length, 0);
});

test('certificate retains only hashes, booleans and counts from the local private comparison', async () => {
  const f = nativeFixture(); await expectCertified(f);
  for (const value of ['native-session', 'native-original-attack', 'contact-1', 'native-seat', 'native-instance',
    ...f.view.eligibleActions.flatMap(({ actionId, sourceId }) => [actionId, sourceId])])
    assert.equal(JSON.stringify(f.certificates).includes(value), false);
});

for (const [name, change] of [
  ['same-source actual remount after the sole selection', effect => effect.remount()],
  ['actual controlled checkbox is unchecked after the sole selection', effect => effect.clearFirst()],
  ['current source becomes busy after the sole selection', effect => effect.setBusy()],
  ['missing action control', effect => effect.root().querySelector('input').remove()],
  ['extra action control', effect => { const row = effect.root().querySelector('label'); row.after(row.cloneNode(true)); }],
  ['wrong offered action label', effect => { effect.root().querySelector('label span').textContent = 'Missile launchers'; }],
  ['hidden current checkbox', effect => { effect.root().querySelector('input').style.visibility = 'hidden'; }],
  ['hidden offered action label', effect => { effect.root().querySelector('label span').hidden = true; }],
  ['disabled current checkbox', effect => { effect.root().querySelector('input').disabled = true; }],
  ['hidden current panel', effect => { effect.root().hidden = true; }],
  ['wrong current cycle', effect => { effect.root().querySelector('.eyebrow').textContent = 'Cycle 2 // weapon control'; }],
  ['wrong current range', effect => { effect.root().querySelector('h2').textContent = 'medium range'; }],
  ['wrong current phase', effect => { effect.root().querySelector('.wolf-range-action__status').textContent = 'Target assignment'; }],
  ['wrong printed deadline', effect => effect.root().querySelector('time').setAttribute('datetime', '2026-10-07T09:00:00.000Z')],
  ['disabled Use with offered checked actions', effect => { effect.root().querySelector('button').disabled = true; }],
  ['duplicate current Use button', effect => { const button = effect.root().querySelector('button'); button.after(button.cloneNode(true)); }],
  ['foreign current panel label', effect => effect.root().setAttribute('aria-label', 'Unrelated actions')],
]) test(`${name} fails the final certificate without another selection, Pass or click`, async () => {
  const f = nativeFixture({ afterSelections: change });
  await assert.rejects(f.run(), /range action.*certificate/i);
  assert.equal(f.certificates.length, 1); assert.equal(f.certificates[0].matched, false);
  assert.equal(f.certificates[0].gameplayCredit, false); assert.equal(f.checks.length, 1);
  assert.equal(f.clicks.length, 0); assert.equal(f.payloads.length, 0); assert.equal(f.reads.length, 1);
});

test('disabled source-offered AEGIS controls cannot fall back to Pass before selection', async () => {
  const f = nativeFixture({ disabledBeforeSelection: true });
  await assert.rejects(f.run(), /range action.*certificate/i);
  assert.equal(f.checks.length, 0); assert.equal(f.clicks.length, 0); assert.equal(f.payloads.length, 0);
});

test('a genuinely empty source still rejects an injected current checkbox instead of fabricating an action', async () => {
  const f = nativeFixture({ view: currentView({}, { charges: [] }),
    duringReceiptRead: effect => { const input = dom.window.document.createElement('input'); input.type = 'checkbox'; effect.root().append(input); } });
  await assert.rejects(f.run(), /range action.*certificate/i);
  assert.equal(f.checks.length, 0); assert.equal(f.clicks.length, 0);
});

for (const [field, value] of [['sessionId', 'foreign-session'], ['turn', 2], ['revision', 19],
  ['currentStep', 'medium-range'], ['type', 'foreign-choice']])
  test(`original private pending view ${field} mismatch cannot choose or click`, async () => {
    const f = nativeFixture({ view: currentView({ [field]: value }) });
    await assert.rejects(f.run()); assert.equal(f.checks.length, 0); assert.equal(f.clicks.length, 0);
  });

for (const [field, value] of [['attackId', 'foreign-attack'], ['turn', 2], ['revision', 19],
  ['currentStep', 'medium-range'], ['status', 'resolved']])
  test(`unchanged receipt source ${field} fence blocks before the sole normal selection`, async () => {
    const f = nativeFixture({ sourceDrift: { [field]: value } });
    await assert.rejects(f.run()); assert.equal(f.checks.length, 0); assert.equal(f.clicks.length, 0);
    assert.equal(f.reads.length, 1);
  });

for (const [field, value] of [['uidHash', 'foreign-uid'], ['connectionGeneration', 11], ['identityHydrationRevision', 2],
  ['sessionId', 'foreign-session'], ['fleetGroupId', 'foreign-group'], ['seatId', 'foreign-seat'],
  ['profileRoleId', 'admiral'], ['assignedRoleId', 'admiral'], ['activeConsoleRoleId', null],
  ['connection', 'offline'], ['freshness', 'cache']])
  test(`unchanged held-combat ${field} loss after selection cannot be tolerated`, async () => {
    const drift = {}, f = nativeFixture({ actorDrift: drift, afterSelections: () => { drift[field] = value; } });
    await assert.rejects(f.run(), /Original combat|original combat|live server|sessionId/i);
    assert.equal(f.checks.length, 1); assert.equal(f.clicks.length, 0); assert.equal(f.payloads.length, 0);
  });

test('saving the certificate cannot grant a fresh35s after the original deadline', async () => {
  const f = nativeFixture({ expireWhileSaving: true });
  await assert.rejects(f.run(), /original.*deadline|decision budget/i);
  assert.equal(f.certificates.length, 1); assert.equal(f.certificates[0].matched, true);
  assert.equal(f.clicks.length, 0); assert.equal(f.checks.length, 1);
});

test('foreign actor after the final DOM observation remains a hard held-actor failure', async () => {
  const drift = {}, f = nativeFixture({ actorDrift: drift, duringCertificate: (_effect, read) => {
    if (read === 2) drift.connectionGeneration = 11;
  } });
  await assert.rejects(f.run(), /Original combat connectionGeneration/);
  assert.equal(f.clicks.length, 0); assert.equal(f.checks.length, 1);
});
