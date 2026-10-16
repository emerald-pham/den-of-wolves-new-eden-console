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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TRACKS = ['reactor', 'jump-drive', 'hydroponics', 'water-reclamation', 'advanced-hydroponics'];
const plain = value => JSON.parse(JSON.stringify(value));
const noAction = () => assert.fail('This source-render fixture cannot read or mutate gameplay.');

async function sourceModule(file, imports, realm = createContext({})) {
  const source = await readFile(resolve(ROOT, file), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
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
    await dependency.link(noAction);
    return dependency;
  });
  await module.evaluate();
  return module;
}

async function sourceCss(file) {
  const path = resolve(ROOT, file), text = await readFile(path, 'utf8');
  const imports = [...text.matchAll(/@import\s+"([^"]+)";/g)];
  let result = text;
  for (const entry of imports) {
    const imported = resolve(dirname(path), entry[1]);
    result = result.replace(entry[0], await sourceCss(imported));
  }
  return result;
}

const STYLES = `${await sourceCss('src/index.css')}\n${await sourceCss('src/components/CandidatePreparationPanel.css')}`;
// JSDOM cannot parse the index's modern container rules. The native Chrome check
// uses STYLES in full; this DOM model consumes the actual shared and panel CSS.
const VM_STYLES = `${await sourceCss('src/styles/cic.css')}\n${await sourceCss('src/components/CandidatePreparationPanel.css')}`;

/** Actual server projection and full component markup; only the local SSR report state is preloaded. */
export async function sourceFixture({ stage = 'research-choice', shipId = 'aegis', fuelCost = 12 } = {}) {
  const realm = createContext({});
  const research = await sourceModule('functions/src/endeavourResearch.ts', {
    './consoleMetadata': { consoleMetadataFor: noAction },
  }, realm);
  const paths = await sourceModule('functions/src/candidatePaths.ts', { './endeavourResearch': research }, realm);
  const code = stage === 'paid-loss-choice' ? 'O' : 'N';
  const roleId = stage === 'research-choice' ? 'shepherd-scientist' : shipId === 'aegis' ? 'admiral' : `${shipId}-captain`;
  const authority = { sessionId: 'source-only-candidate-session', cycle: 4, phase: 'active', coordination: true,
    now: '2026-10-06T00:00:00.000Z', groupId: 'fleet-1', vesselIds: [shipId],
    actor: { uid: `source-${roleId}`, gm: false, shipIds: stage === 'research-choice' ? [] : [shipId],
      research: stage === 'research-choice', shuttleIds: [] },
    discovered: [{ code, coordinate: '0123' }],
    ships: { [shipId]: { fuel: 40, materials: 10, reactorCapacity: 5, destroyed: false,
      jumpCharged: true, jumpDamaged: false, longJumpCost: fuelCost, atCandidate: true,
      jumpedThisCycle: false, coordinate: '0123' } },
    research: Object.fromEntries(TRACKS.map(id => [id, 4])), engineeringShuttles: [], hiddenScoutCount: 0 };
  const state = { revision: 8, sites: stage === 'repaired' ? {
    '0123': { code: 'N', coordinate: '0123', groupId: 'fleet-1', materials: 10, researchIds: TRACKS,
      shuttleId: 'philia', repairedAt: authority.now, ships: {}, reactors: {} },
  } : {} };
  const report = plain(paths.namespace.candidateWorkspace(authority, state));
  const storeState = { session: { id: authority.sessionId, currentTurn: authority.cycle, phase: 'active',
    shipFleetGroupIds: { [shipId]: authority.groupId } },
    me: { sessionId: authority.sessionId, uid: authority.actor.uid, role: 'player', fleetGroupId: authority.groupId,
      assignedRoleId: roleId, activeConsoleRoleId: roleId },
    connection: 'live', sessionSnapshotFreshness: 'server', gmInstance: undefined };
  let stateCalls = 0;
  const panel = await sourceModule('src/components/CandidatePreparationPanel.tsx', {
    react: { ...React, useState: initial => {
      const current = React.useState(initial);
      return stateCalls++ === 1 ? [report, current[1]] : current;
    } },
    'react/jsx-runtime': jsxRuntime,
    '@/store/useSessionStore': { useSessionStore: selector => selector(storeState) },
    '@/lib/sessionService': { setGmShipConsoleWriteGrant: noAction },
    '@/lib/candidateService': { createCandidateAttempt: noAction, executeCandidateAttempt: noAction,
      readCandidateWorkspace: noAction, recoverCandidateAttempt: noAction },
    './CandidatePreparationPanel.css': {},
  });
  const markup = renderToStaticMarkup(React.createElement(panel.namespace.default));
  const actor = { hasAuth: true, sameActor: true, uidHash: 'source-original-actor-hash', sessionId: authority.sessionId,
    playerRole: 'player', profileRoleId: roleId, assignedRoleId: roleId,
    activeConsoleRoleId: roleId, instanceId: null, gmInstanceOwned: false,
    connection: 'live', freshness: 'server' };
  const readiness = { expectedActor: actor, currentActor: { ...actor },
    sourceState: { live: true, sessionId: authority.sessionId, cycle: authority.cycle, phase: 'active',
      playerRole: 'player', groupId: authority.groupId, instanceId: null, gmInstanceOwned: false },
    request: { sessionId: authority.sessionId, expectedGroupId: authority.groupId }, report,
    expectedGroupId: authority.groupId, code, stage };
  return { markup, styles: STYLES, report, readiness };
}

/** JSDOM supplies native DOM queries/labels/disabled state; box sizes and painted text model browser-only APIs. */
function browserFixture(source) {
  const dom = new JSDOM(`<!doctype html><html><head><style>${VM_STYLES}</style></head><body>${source.markup}</body></html>`);
  const { window } = dom, document = window.document;
  const block = new Set(['SECTION', 'DIV', 'P', 'H2', 'H3', 'ARTICLE', 'FIELDSET', 'LEGEND', 'LABEL', 'UL', 'LI']);
  Object.defineProperty(window.HTMLElement.prototype, 'innerText', { get() {
    const content = [...this.childNodes].map(node => {
      if (node.nodeType === window.Node.TEXT_NODE) return node.textContent.replace(/\s+/g, ' ');
      if (!(node instanceof window.HTMLElement)) return '';
      return block.has(node.tagName) ? `\n${node.innerText}\n` : node.innerText;
    }).join('').trim();
    return window.getComputedStyle(this).textTransform === 'uppercase' ? content.toUpperCase() : content;
  } });
  window.HTMLElement.prototype.getClientRects = function () {
    if (window.getComputedStyle(this).display === 'none') return [];
    for (let node = this.parentElement; node; node = node.parentElement) {
      if (window.getComputedStyle(node).display === 'none') return [];
    }
    return [this.getBoundingClientRect()];
  };
  window.HTMLElement.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, width: 280, height: 44 });
  const element = document.querySelector('[aria-label="Candidate preparation and actions"]');
  assert.ok(element);
  const realm = createContext({ element, document, innerWidth: 320,
    getComputedStyle: window.getComputedStyle.bind(window), matchMedia: () => ({ matches: false }) });
  assert.equal(new Script('[typeof process,typeof require,typeof Buffer].join(",")').runInContext(realm),
    'undefined,undefined,undefined');
  const snapshot = () => plain(new Script(`(${candidateGeometrySnapshot.toString()})(element)`).runInContext(realm));
  const decision = (overrides = {}) => projectCandidateWorkspaceReadiness({ ...source.readiness,
    rendered: { ...snapshot(), currentGroupId: source.readiness.expectedGroupId }, ...overrides });
  return { dom, element, window, snapshot, decision };
}

test('actual source snapshot recognizes five native research choices and title-case Commit under shared uppercase button CSS', async t => {
  const source = await sourceFixture(), fixture = browserFixture(source);
  t.after(() => fixture.dom.window.close());
  const button = fixture.element.querySelector('fieldset button');
  assert.equal(button.textContent, 'Commit chosen research');
  assert.equal(fixture.window.getComputedStyle(button).textTransform, 'uppercase');
  assert.equal(button.innerText, 'COMMIT CHOSEN RESEARCH');
  assert.equal(button.disabled, true, 'The original unselected Commit stays disabled until research is chosen.');
  assert.equal(fixture.element.querySelectorAll('fieldset').length, 1);
  assert.deepEqual(source.report.paths[0].researchChoices.map(choice => choice.id), TRACKS);
  const rendered = fixture.snapshot();
  assert.equal(rendered.researchGroupVisible, true);
  assert.deepEqual(rendered.researchTrackNames, source.report.paths[0].researchChoices.map(choice => choice.name));
  assert.equal(rendered.researchTrackEnabledCount, 5);
  assert.equal(rendered.commitResearchButtonCount, 1);
  assert.equal(fixture.decision().state, 'ready');
});

for (const spec of [
  { stage: 'repaired', shipId: 'aegis', expected: 'Cross Ring // aegis // five fuel', property: 'ringButtons' },
  { stage: 'paid-loss-choice', shipId: 'shepherd', fuelCost: 13,
    expected: 'Long jump into Nebula // shepherd // 13 fuel', property: 'nebulaJumpButtons' },
]) {
  test(`actual source snapshot recognizes the dynamic ${spec.stage} control under shared uppercase button CSS`, async t => {
    const source = await sourceFixture(spec), fixture = browserFixture(source);
    t.after(() => fixture.dom.window.close());
    const button = fixture.element.querySelector('.candidate-preparation__choices button');
    assert.equal(button.textContent.trim(), spec.expected);
    assert.equal(fixture.window.getComputedStyle(button).textTransform, 'uppercase');
    assert.equal(button.innerText, spec.expected.toUpperCase());
    assert.deepEqual(fixture.snapshot()[spec.property], [{ name: spec.expected, enabled: true }]);
    assert.equal(fixture.decision().state, 'ready');
    button.disabled = true;
    assert.equal(fixture.decision().state, 'pending', 'A disabled mounted passage/jump remains unready.');
    button.disabled = false;
    const duplicate = button.cloneNode(true); button.after(duplicate);
    assert.equal(fixture.decision().state, 'pending', 'Ambiguous matching controls remain unready.');
    duplicate.remove(); button.remove();
    assert.equal(fixture.decision().state, 'pending', 'A missing passage/jump remains unready.');
  });
}

test('native source snapshots keep missing, ambiguous, disabled and changed semantic research controls unready', async t => {
  const source = await sourceFixture(), fixture = browserFixture(source);
  t.after(() => fixture.dom.window.close());
  const group = fixture.element.querySelector('fieldset'), button = group.querySelector('button');
  group.disabled = true;
  assert.equal(fixture.snapshot().researchTrackEnabledCount, 0);
  assert.equal(fixture.decision().state, 'pending');
  group.disabled = false;
  const duplicate = button.cloneNode(true); button.after(duplicate);
  assert.equal(fixture.decision().state, 'pending');
  duplicate.remove();
  button.textContent = 'COMMIT CHOSEN RESEARCH';
  assert.equal(fixture.decision().state, 'pending', 'Different semantic source text cannot be accepted by case folding.');
  button.textContent = 'Commit chosen research';
  group.querySelector('label').lastChild.textContent = 'Different research track';
  assert.equal(fixture.decision().state, 'pending');
  group.remove();
  assert.equal(fixture.decision().state, 'pending');
});

test('native source snapshots preserve current report, original actor, scope and rendered revision guards', async t => {
  const source = await sourceFixture(), fixture = browserFixture(source);
  t.after(() => fixture.dom.window.close());
  assert.equal(fixture.decision({ currentActor: { ...source.readiness.currentActor, uidHash: 'foreign-actor' } }).state, 'blocked');
  assert.equal(fixture.decision({ report: undefined }).state, 'blocked');
  assert.equal(fixture.decision({ report: { ...source.report, cycle: 3 } }).state, 'blocked');
  assert.equal(fixture.decision({ report: { ...source.report, groupId: 'foreign-group' } }).state, 'blocked');
  assert.equal(fixture.decision({ report: { ...source.report, paths: [] } }).state, 'blocked');
  assert.equal(fixture.decision({ report: { ...source.report, paths: [...source.report.paths, ...source.report.paths] } }).state, 'blocked');
  fixture.element.querySelector('.candidate-preparation__header + p').textContent = 'Cycle 4 // candidate revision 7';
  assert.equal(fixture.decision().state, 'pending');
});
