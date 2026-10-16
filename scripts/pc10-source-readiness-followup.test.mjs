import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, Script, SourceTextModule, SyntheticModule } from 'node:vm';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import ts from 'typescript';
import { candidateGeometrySnapshot } from './pc10-candidate-manual-ui-proof.mjs';
import { projectCandidateWorkspaceReadiness } from './pc10-candidate-manual-ui-geometry.mjs';
import { validateScoutBundle } from './pc10-navigation-scout-proof-contracts.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const plain = value => JSON.parse(JSON.stringify(value));
const noAction = () => assert.fail('This source fixture cannot read or mutate gameplay.');
const navigationSource = await readFile(resolve(ROOT, 'scripts/pc10-navigation-scout-ui-proof.mjs'), 'utf8');
const scoutStart = navigationSource.indexOf('    const bundle = validateScoutBundle(', navigationSource.indexOf('  async function reports('));
const scoutPredicate = navigationSource.slice(scoutStart, navigationSource.indexOf('    record.bundle = bundle;', scoutStart));
const paintStart = navigationSource.indexOf('      inspectPaint: async () => {', navigationSource.indexOf('  async function paint('));
const groupPredicate = navigationSource.slice(paintStart + '      inspectPaint: async () => {'.length,
  navigationSource.indexOf('\n      } });', paintStart));
assert.ok(scoutStart > 0 && paintStart > 0);

async function sourceModule(file, imports, realm = createContext({})) {
  const { outputText } = ts.transpileModule(await readFile(resolve(ROOT, file), 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } });
  const module = new SourceTextModule(outputText, { context: realm, identifier: file });
  await module.link(async name => {
    assert.ok(Object.hasOwn(imports, name), `Only declared source dependencies may load: ${name}`);
    const values = imports[name];
    if (values instanceof SourceTextModule) return values;
    const dependency = new SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context: realm });
    await dependency.link(noAction); return dependency;
  });
  await module.evaluate(); return module;
}

export async function sourceCss(file) {
  const path = resolve(ROOT, file), text = await readFile(path, 'utf8');
  let result = text;
  for (const entry of text.matchAll(/@import\s+"([^"]+)";/g)) {
    result = result.replace(entry[0], await sourceCss(resolve(dirname(path), entry[1])));
  }
  return result;
}
const sharedCss = await sourceCss('src/styles/cic.css');

/** Native DOM selectors and source CSS; box sizes/painted text model APIs absent in JSDOM. */
function domFixture(markup, styles) {
  const dom = new JSDOM(`<!doctype html><html><head><style>${styles}</style></head><body>${markup}</body></html>`);
  const { window } = dom, document = window.document;
  const blocks = new Set(['SECTION', 'DIV', 'P', 'H2', 'H3', 'ARTICLE', 'FIELDSET', 'LEGEND', 'LABEL', 'UL', 'LI']);
  Object.defineProperty(window.HTMLElement.prototype, 'innerText', { get() {
    const text = [...this.childNodes].map(node => {
      if (node.nodeType === 3) return node.textContent.replace(/\s+/g, ' ');
      if (!(node instanceof window.HTMLElement)) return '';
      return blocks.has(node.tagName) ? `\n${node.innerText}\n` : node.innerText;
    }).join('').trim();
    return window.getComputedStyle(this).textTransform === 'uppercase' ? text.toUpperCase() : text;
  } });
  const visible = node => !!node && !node.closest('[hidden],[aria-hidden="true"],[inert]') &&
    window.getComputedStyle(node).visibility !== 'hidden' && window.getComputedStyle(node).display !== 'none';
  window.HTMLElement.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, width: 280, height: 44 });
  window.HTMLElement.prototype.getClientRects = function () { return visible(this) ? [this.getBoundingClientRect()] : []; };
  function locator(nodes) {
    return { count: async () => nodes.length, isVisible: async () => nodes.length === 1 && visible(nodes[0]),
      isEnabled: async () => nodes.length === 1 && !nodes[0].matches(':disabled') && !nodes[0].closest('fieldset:disabled'),
      innerText: async () => { assert.equal(nodes.length, 1); return nodes[0].innerText; },
      textContent: async () => { assert.equal(nodes.length, 1); return nodes[0].textContent; },
      locator: selector => locator(nodes.flatMap(node => [...node.querySelectorAll(selector)])),
      getByRole: (role, options) => {
        assert.equal(options.exact, true);
        const selector = role === 'heading' ? 'h1,h2,h3,h4,h5,h6,[role="heading"]' : role === 'button' ? 'button' : 'section[aria-label]';
        return locator(nodes.flatMap(node => [...node.querySelectorAll(selector)]).filter(node =>
          (node.getAttribute('aria-label') ?? node.textContent.replace(/\s+/g, ' ').trim()) === options.name));
      } };
  }
  const realm = createContext({ document, innerWidth: 320, getComputedStyle: window.getComputedStyle.bind(window),
    matchMedia: () => ({ matches: false }), assert, validateScoutBundle });
  assert.equal(new Script('[typeof process,typeof require,typeof Buffer].join(",")').runInContext(realm),
    'undefined,undefined,undefined');
  return { dom, window, document, realm, locator };
}

export async function scoutFixture() {
  const fact = { coordinate: '0123', code: 'O', title: 'Deep Nebula' };
  const report = { requestId: 'source-scout-request', cycle: 2, entitlementId: 'starlight', targetCoordinate: '0123',
    status: 'resolved', noteId: '1'.repeat(64) };
  const result = { type: 'private-scout-result', sessionId: 'source-followup-session', requestId: report.requestId,
    requesterUid: 'source-wing-account', sourceId: report.entitlementId, cycle: report.cycle,
    targetCoordinate: report.targetCoordinate, systemFact: fact };
  const note = { type: 'player-discovery-note', id: report.noteId, cycle: report.cycle,
    targetCoordinate: report.targetCoordinate, systemFact: { ...fact }, recordedAt: '2026-10-06T00:00:00.000Z' };
  const module = await sourceModule('src/components/ScoutResultPanels.tsx', {
    'react/jsx-runtime': jsxRuntime, './ScoutResultPanels.css': {},
  });
  return { markup: renderToStaticMarkup(React.createElement(module.namespace.ScoutResultPanel, { report, result, note })),
    styles: `${sharedCss}\n${await sourceCss('src/components/ScoutResultPanels.css')}`, report, result, note,
    original: { uid: result.requesterUid, sessionId: result.sessionId }, record: { reply: { ...report } } };
}

export async function groupFixture() {
  const module = await sourceModule('src/components/FleetGroupPanel.tsx', {
    react: React, 'react/jsx-runtime': jsxRuntime, '@/data/ships': { findVessel: noAction }, './FleetGroupWorkspace.css': {},
  });
  return { markup: renderToStaticMarkup(React.createElement(module.namespace.default, {
    groupId: 'fleet-source-1', actorUid: 'source-wing-account', notes: [], draft: '', busy: false, notice: '',
    onDraft: noAction, onSend: noAction, onRefresh: noAction,
  })), styles: `${sharedCss}\n${await sourceCss('src/components/FleetGroupWorkspace.css')}`, original: { groupId: 'fleet-source-1' } };
}

export async function candidateFixture({ stage = 'reactor-choice', gm = false, shipId = 'aegis', selectedShipId = 'aegis',
  vesselIds = ['aegis', 'shepherd'],
  capacity = 5, committed = false, liberated = true } = {}) {
  const realm = createContext({});
  const research = await sourceModule('functions/src/endeavourResearch.ts', { './consoleMetadata': { consoleMetadataFor: noAction } }, realm);
  const paths = await sourceModule('functions/src/candidatePaths.ts', { './endeavourResearch': research }, realm);
  const code = stage === 'reactor-choice' ? 'P' : stage === 'paid-loss-choice' ? 'O' : 'N';
  const roleId = shipId === 'aegis' ? 'admiral' : `${shipId}-captain`, uid = gm ? 'source-gm-account' : `source-${roleId}`;
  const authority = { sessionId: 'source-followup-session', cycle: 2, phase: 'active', coordination: true,
    now: '2026-10-06T00:00:00.000Z', groupId: 'fleet-1', vesselIds,
    actor: { uid, gm, shipIds: gm ? [] : [shipId], research: false, shuttleIds: [] },
    discovered: [{ code, coordinate: '0123' }],
    ships: Object.fromEntries(vesselIds.map(id => [id, { fuel: 40, materials: 10,
      reactorCapacity: id === shipId ? capacity : 4, destroyed: false, jumpCharged: true, jumpDamaged: false,
      longJumpCost: id === 'aegis' ? 12 : 13, atCandidate: true, jumpedThisCycle: false, coordinate: '0123' }])),
    research: {}, engineeringShuttles: [], hiddenScoutCount: 0,
    station: { coordinate: '0123', groupId: 'fleet-1', liberated, sourceId: 'source-finalized-station-combat' } };
  const state = { revision: 6, sites: { '0123': { code, coordinate: '0123', groupId: 'fleet-1', materials: 10,
    researchIds: [], ...(code === 'N' ? { repairedAt: authority.now, shuttleId: 'philia' } : {}),
    ships: {}, reactors: committed ? { [shipId]: capacity } : {} } } };
  const report = plain(paths.namespace.candidateWorkspace(authority, state));
  const instance = gm ? { id: 'source-original-instance', sessionId: authority.sessionId, uid,
    claimedAt: 'source-original-lease', shipConsoleWriteGrant: { shipId: selectedShipId } } : undefined;
  const store = { session: { id: authority.sessionId, currentTurn: authority.cycle, phase: 'active',
    shipFleetGroupIds: Object.fromEntries(vesselIds.map(id => [id, 'fleet-1'])) },
    me: { sessionId: authority.sessionId, uid, role: gm ? 'gm' : 'player', fleetGroupId: 'fleet-1',
      assignedRoleId: gm ? undefined : roleId, activeConsoleRoleId: gm ? undefined : roleId },
    gmInstance: instance, connection: 'live', sessionSnapshotFreshness: 'server' };
  let stateCalls = 0;
  const panel = await sourceModule('src/components/CandidatePreparationPanel.tsx', {
    react: { ...React, useState: initial => {
      const current = React.useState(initial), index = stateCalls++;
      return index === 1 ? [report, current[1]] : index === 6 || index === 7 ? [selectedShipId, current[1]] : current;
    } }, 'react/jsx-runtime': jsxRuntime, '@/store/useSessionStore': { useSessionStore: selector => selector(store) },
    '@/lib/sessionService': { setGmShipConsoleWriteGrant: noAction },
    '@/lib/candidateService': { createCandidateAttempt: noAction, executeCandidateAttempt: noAction,
      readCandidateWorkspace: noAction, recoverCandidateAttempt: noAction }, './CandidatePreparationPanel.css': {},
  });
  const actor = { hasAuth: true, sameActor: true, uidHash: gm ? 'original-gm-hash' : 'original-member-hash',
    sessionId: authority.sessionId, playerRole: gm ? 'gm' : 'player', profileRoleId: gm ? null : roleId,
    assignedRoleId: gm ? null : roleId, activeConsoleRoleId: gm ? null : roleId,
    instanceId: instance?.id ?? null, ...(gm ? { instanceClaimedAt: instance.claimedAt } : {}),
    gmInstanceOwned: gm, connection: 'live', freshness: 'server' };
  return { markup: renderToStaticMarkup(React.createElement(panel.namespace.default)),
    styles: `${sharedCss}\n${await sourceCss('src/components/CandidatePreparationPanel.css')}`, report,
    readiness: { expectedActor: actor, currentActor: { ...actor },
      sourceState: { live: true, sessionId: authority.sessionId, cycle: authority.cycle, phase: 'active',
        playerRole: actor.playerRole, groupId: 'fleet-1', instanceId: actor.instanceId,
        ...(gm ? { instanceClaimedAt: instance.claimedAt } : {}), gmInstanceOwned: gm },
      request: { sessionId: authority.sessionId, expectedGroupId: 'fleet-1', ...(gm ? { instanceId: instance.id } : {}) },
      report, expectedGroupId: 'fleet-1', code, stage } };
}

function candidateDom(source) {
  const fixture = domFixture(source.markup, source.styles);
  fixture.realm.element = fixture.document.querySelector('[aria-label="Candidate preparation and actions"]');
  const snapshot = () => plain(new Script(`(${candidateGeometrySnapshot.toString()})(element)`).runInContext(fixture.realm));
  const decision = (overrides = {}) => projectCandidateWorkspaceReadiness({ ...source.readiness,
    rendered: { ...snapshot(), currentGroupId: 'fleet-1' }, ...overrides });
  return { ...fixture, snapshot, decision };
}

test('actual private report predicate matches exact source Site text under native uppercase code CSS', async t => {
  const source = await scoutFixture(), f = domFixture(source.markup, source.styles);
  t.after(() => f.dom.window.close());
  const code = f.document.querySelector('.scout-result-panel__code');
  assert.equal(code.textContent, 'Site O'); assert.equal(code.innerText, 'SITE O');
  Object.assign(f.realm, source, { reportPanel: f.locator([f.document.querySelector('.scout-result-panel')]) });
  await new Script(`(async () => {${scoutPredicate}})()`).runInContext(f.realm);
});

test('actual private report predicate rejects changed/missing/ambiguous/hidden facts and foreign requester', async t => {
  const source = await scoutFixture(), f = domFixture(source.markup, source.styles);
  t.after(() => f.dom.window.close());
  Object.assign(f.realm, source, { reportPanel: f.locator([f.document.querySelector('.scout-result-panel')]) });
  const run = () => new Script(`(async () => {${scoutPredicate}})()`).runInContext(f.realm);
  const code = f.document.querySelector('.scout-result-panel__code');
  code.textContent = 'Site P'; await assert.rejects(run()); code.textContent = 'Site O';
  const duplicate = code.cloneNode(true); code.after(duplicate); await assert.rejects(run()); duplicate.remove();
  code.hidden = true; await assert.rejects(run()); code.hidden = false;
  f.realm.result = { ...source.result, requesterUid: 'foreign-source-account' }; await assert.rejects(run());
  f.realm.result = source.result; code.remove(); await assert.rejects(run());
});

test('actual group paint predicate recognizes the unique exact source group heading under uppercase h2 CSS', async t => {
  const source = await groupFixture(), f = domFixture(source.markup, source.styles);
  t.after(() => f.dom.window.close());
  const heading = f.document.querySelector('h2');
  assert.equal(heading.textContent, 'Fleet group // fleet-source-1');
  assert.equal(heading.innerText, 'FLEET GROUP // FLEET-SOURCE-1');
  const panel = f.locator([f.document.querySelector('.fleet-group-workspace')]);
  Object.assign(f.realm, { panel, original: source.original, groupPanel: true, blockers: [],
    button: panel.getByRole('button', { name: 'Refresh group notes', exact: true }) });
  assert.equal((await new Script(`(async () => {${groupPredicate}})()`).runInContext(f.realm)).current, true);
});

test('actual group paint predicate keeps foreign/ambiguous/hidden headings and disabled controls unready', async t => {
  const source = await groupFixture(), f = domFixture(source.markup, source.styles);
  t.after(() => f.dom.window.close());
  const panel = f.locator([f.document.querySelector('.fleet-group-workspace')]), heading = f.document.querySelector('h2');
  Object.assign(f.realm, { panel, original: source.original, groupPanel: true, blockers: [],
    button: panel.getByRole('button', { name: 'Refresh group notes', exact: true }) });
  const run = () => new Script(`(async () => {${groupPredicate}})()`).runInContext(f.realm);
  heading.textContent = 'Fleet group // fleet-source-10'; assert.equal((await run()).current, false);
  heading.textContent = 'Fleet group // fleet-source-1';
  const duplicate = heading.cloneNode(true); heading.after(duplicate); assert.equal((await run()).current, false); duplicate.remove();
  heading.hidden = true; assert.equal((await run()).current, false); heading.hidden = false;
  f.document.querySelectorAll('button')[1].disabled = true; assert.notEqual((await run()).eligible, true);
});

for (const spec of [{ stage: 'repaired', gm: true }, { stage: 'paid-loss-choice', gm: true, selectedShipId: 'shepherd' },
  { stage: 'repaired', gm: false, shipId: 'shepherd' }, { stage: 'paid-loss-choice', gm: false, shipId: 'shepherd' },
  { stage: 'reactor-choice', gm: false }, { stage: 'reactor-choice', gm: true, selectedShipId: 'shepherd' }]) {
  test(`public candidate readiness binds ${spec.stage} to actual one-selected-ship markup (${spec.gm ? 'GM' : 'member'})`, async t => {
    const source = await candidateFixture(spec), f = candidateDom(source);
    t.after(() => f.dom.window.close());
    const button = f.document.querySelector('.candidate-preparation__choices button');
    assert.ok(button); assert.equal(f.window.getComputedStyle(button).textTransform, 'uppercase');
    assert.equal(source.report.paths[0].ships.filter(ship => ship.canAct).length, spec.gm ? 2 : 1);
    const ready = f.decision();
    assert.equal(ready.state, 'ready');
    assert.equal(ready.actingShipId, spec.gm ? spec.selectedShipId ?? 'aegis' : spec.shipId ?? 'aegis');
    button.disabled = true; assert.equal(f.decision().state, 'pending'); button.disabled = false;
    const duplicate = button.cloneNode(true); button.after(duplicate); assert.equal(f.decision().state, 'pending'); duplicate.remove();
    button.textContent = button.textContent.replace(/\/\/ (?:five|\d+)/, '// 99'); assert.equal(f.decision().state, 'pending');
  });
}

test('public candidate readiness rejects missing/ambiguous/unknown/unavailable GM source selections', async t => {
  const source = await candidateFixture({ stage: 'repaired', gm: true }), f = candidateDom(source);
  t.after(() => f.dom.window.close());
  const select = f.document.querySelector('.candidate-preparation__choices select');
  const duplicate = select.parentElement.cloneNode(true); select.parentElement.after(duplicate);
  assert.equal(f.decision().state, 'pending'); duplicate.remove();
  select.disabled = true; assert.equal(f.decision().state, 'pending'); select.disabled = false;
  select.parentElement.hidden = true; assert.equal(f.decision().state, 'pending'); select.parentElement.hidden = false;
  const foreign = f.document.createElement('option'); foreign.value = 'foreign-ship'; foreign.textContent = 'foreign-ship';
  select.append(foreign); select.value = foreign.value; assert.equal(f.decision().state, 'pending'); foreign.remove();
  select.value = 'aegis'; select.options[0].disabled = true; assert.equal(f.decision().state, 'pending');
  select.options[0].disabled = false; select.value = 'shepherd'; assert.equal(f.decision().state, 'pending', 'Target drift cannot retain the old Aegis button.');
  select.parentElement.remove(); assert.equal(f.decision().state, 'pending');
});

test('public GM single-ship readiness uses the actual unique offered GM vessel control', async t => {
  const source = await candidateFixture({ stage: 'reactor-choice', gm: true, vesselIds: ['aegis'] }), f = candidateDom(source);
  t.after(() => f.dom.window.close());
  assert.equal(f.document.querySelectorAll('.candidate-preparation__choices select').length, 0);
  assert.equal(f.decision().state, 'ready');
  const select = f.document.querySelector('.candidate-preparation__action select');
  const duplicate = select.parentElement.cloneNode(true); select.parentElement.after(duplicate);
  assert.equal(f.decision().state, 'pending'); duplicate.remove();
  select.options[0].disabled = true; assert.equal(f.decision().state, 'pending'); select.options[0].disabled = false;
  select.parentElement.remove(); assert.equal(f.decision().state, 'pending');
});

test('public member readiness binds the sole current native canAct ship without foreign or unavailable fallback', async t => {
  const source = await candidateFixture({ stage: 'paid-loss-choice', shipId: 'shepherd' }), f = candidateDom(source);
  t.after(() => f.dom.window.close());
  assert.equal(f.decision().state, 'ready');
  const native = plain(source.report);
  native.paths[0].ships.find(ship => ship.shipId === 'shepherd').canAct = false;
  assert.equal(f.decision({ report: native }).state, 'blocked');
  native.paths[0].ships.find(ship => ship.shipId === 'aegis').canAct = true;
  assert.equal(f.decision({ report: native }).state, 'pending');
  native.paths[0].ships.find(ship => ship.shipId === 'shepherd').canAct = true;
  assert.equal(f.decision({ report: native }).state, 'blocked');
  assert.equal(f.decision({ currentActor: { ...source.readiness.currentActor, assignedRoleId: 'foreign-role' } }).state, 'blocked');
});

test('public P stage requires liberated, positive, uncommitted current native reactor authority', async t => {
  for (const input of [{ liberated: false }, { capacity: 0 }, { committed: true }]) {
    const source = await candidateFixture(input), f = candidateDom(source); t.after(() => f.dom.window.close());
    assert.equal(f.decision().state, 'blocked');
  }
  const source = await candidateFixture(), f = candidateDom(source); t.after(() => f.dom.window.close());
  assert.equal(f.decision({ currentActor: { ...source.readiness.currentActor, uidHash: 'foreign-actor' } }).state, 'blocked');
  assert.equal(f.decision({ currentActor: { ...source.readiness.currentActor, activeConsoleRoleId: 'foreign-role' } }).state, 'blocked');
  assert.equal(f.decision({ report: { ...source.report, cycle: 1 } }).state, 'blocked');
  assert.equal(f.decision({ report: { ...source.report, groupId: 'foreign-group' } }).state, 'blocked');
  for (const patch of [{ completed: true }, { activated: true }, { reactorShipIds: ['aegis', 'aegis'] }]) {
    assert.equal(f.decision({ report: { ...source.report, paths: [{ ...source.report.paths[0], ...patch }] } }).state, 'blocked');
  }
  f.document.querySelector('.candidate-preparation__header + p').textContent = 'Cycle 2 // candidate revision 5';
  assert.equal(f.decision().state, 'pending');
});
