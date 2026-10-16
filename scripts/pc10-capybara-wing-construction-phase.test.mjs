import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { createCapybaraSpecialistActionSeam } from './pc10-capybara-full-gameplay.mjs';

const source = await readFile(new URL('./pc10-capybara-full-gameplay.mjs', import.meta.url), 'utf8');
const file = ts.createSourceFile('capybara.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const gameplay = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'runCapybaraFullGameGameplay');
const progression = gameplay.body.statements.find(ts.isTryStatement).tryBlock.statements;
const start = progression.findIndex(node => ts.isVariableStatement(node) &&
  node.declarationList.declarations.some(value => value.name.getText(file) === 'research2'));
const end = progression.findIndex((node, index) => index > start && ts.isExpressionStatement(node) &&
  ts.isAwaitExpression(node.expression) && ts.isCallExpression(node.expression.expression) &&
  node.expression.expression.expression.getText(file) === 'attemptBoaRecycle');
assert.ok(start >= 0 && end > start, 'Execute the current Cycle2 orchestration through specialist actions.');
const cycleTwo = progression.slice(start, end + 1).map(node => node.getText(file)).join('\n');

// Use the current mounted card's actual eligibility expression, rather than a
// second implementation of its Team/charge/damage/material/capacity gates.
const ui = await readFile(new URL('../src/components/AegisConsoleWorkspace.tsx', import.meta.url), 'utf8');
const uiFile = ts.createSourceFile('AegisConsoleWorkspace.tsx', ui, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const buildPredicates = [];
function findBuild(node) {
  if (ts.isJsxAttribute(node) && node.name.getText(uiFile) === 'canBuild')
    buildPredicates.push(node.initializer.expression.getText(uiFile));
  ts.forEachChild(node, findBuild);
}
findBuild(uiFile); assert.equal(buildPredicates.length, 1);
const buildExpression = ts.transpileModule(`(${buildPredicates[0]})`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

async function runCycleTwo({ alpha = 3, bravo = 3, materials = 2, damaged = false,
  writable = true, live = true, charged = true } = {}) {
  const liveState = { sessionId: 'source-only-cappy', live: true, phase: 'active', cycle: 2,
    fullGameDemo: { status: 'active', progression: 'manual' }, airspace: 'restricted' };
  const counts = { 'fighter-wing-alpha': { count: alpha, revision: 7 }, 'fighter-wing-bravo': { count: bravo, revision: 9 } };
  const events = [], clicks = [], outcomes = [];
  let paid = false;
  const offered = wingId => runInNewContext(buildExpression, {
    Boolean, access: { writable }, connection: live ? 'live' : 'offline', hasServerSnapshot: live,
    constructionBayCharged: paid && charged, constructionBayDamaged: damaged,
    teamPhaseAvailable: liveState.airspace === 'restricted', constructionTurnAvailable: true,
    craft: { fighterWing: { countId: wingId, capacity: { standard: 6, upgraded: 8 } } },
    fighterWingCounts: counts, constructionBayUpgraded: false, resources: { materials },
  });
  const button = wingId => ({ count: async () => 1, isVisible: async () => true,
    isEnabled: async () => offered(wingId), click: async () => {
      assert.equal(offered(wingId), true, 'Only the current ordinary enabled build button may be clicked.');
      clicks.push({ wingId, phase: liveState.airspace, paid }); events.push('build');
    } });
  const page = { locator: selector => {
    assert.equal(selector, '.aegis-craft');
    return { filter: ({ hasText }) => ({ getByRole: (role, options) => {
      assert.equal(role, 'button'); assert.equal(options.name, 'Build 1 fighter // 1 material');
      return button(hasText === 'Fighter Wing Alpha' ? 'fighter-wing-alpha' : 'fighter-wing-bravo');
    } }) };
  } };
  const actor = { sameActor: true, uidHash: 'original-wing-hash', sessionId: liveState.sessionId,
    profileRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander', connection: 'live', freshness: 'server' };
  const surface = { page, observe: async () => actor };
  const gm = {};
  const a = { context: { initial: { sessionId: liveState.sessionId }, roster: [
    { roleId: 'wing-commander', uidHash: actor.uidHash }], gm },
    state: async () => liveState, select: async roleId => {
      assert.equal(roleId, 'wing-commander'); return surface;
    } };
  const seam = createCapybaraSpecialistActionSeam(a, a.context, {
    // Inert transport: execute the real action's prepare/current-control/click
    // boundary, without fabricating any receipt, replay or accepted evidence.
    specialistDriver: { capture: async action => {
      await action.prepare(page); await action.click(page); return { failed: true };
    } }, updateCapybaraStage: async (id, value) => outcomes.push({ id, ...value }),
  });
  const runSpecialist = async (id, action, inputs, options) => {
    if (action !== 'wing-build') return null;
    events.push('attempt');
    return seam.runSpecialist(id, action, inputs, options);
  };
  await runInNewContext(`(async () => { ${cycleTwo} })()`, {
    a, runSpecialist,
    advanceBaseDetectorResearch: async () => ({ branches: {}, requests: [] }), context: {},
    updateBestCapybaraStage: async () => {}, sourceActionStageOutcome: () => ({ status: 'pending' }),
    updateCapybaraStage: async (id, value) => outcomes.push({ id, ...value }),
    mark: async () => {}, paidMaintenance: async cycle => {
      assert.equal(cycle, 2); assert.equal(liveState.airspace, 'restricted'); paid = true; events.push('maintenance');
    }, coordination: async () => { liveState.airspace = 'lifted'; events.push('coordination'); },
    performMacawDismantling: async () => ({ status: 'pending' }), attemptBoaRecycle: async () => {},
  });
  return { events, clicks, outcomes, counts, materials };
}

test('Cappy Cycle2 offers normal fighter construction after paid maintenance while Team is still open', async () => {
  const result = await runCycleTwo();
  assert.deepEqual(result.clicks, [{ wingId: 'fighter-wing-alpha', phase: 'restricted', paid: true }]);
  assert.ok(result.events.indexOf('maintenance') < result.events.indexOf('build'));
  assert.ok(result.events.indexOf('build') < result.events.indexOf('coordination'));
  assert.equal(result.outcomes.find(row => row.id === 'wing-construction').status, 'pending',
    'The inert click fixture cannot create receipt/native acceptance credit.');
});

for (const [name, input] of [
  ['both wings full', { alpha: 6, bravo: 6 }], ['no material', { materials: 0 }],
  ['damaged Construction Bay', { damaged: true }], ['uncharged Construction Bay', { charged: false }],
  ['read-only role', { writable: false }], ['offline role', { live: false }],
]) test(`Cappy construction preserves pending without gameplay for ${name}`, async () => {
  const result = await runCycleTwo(input);
  assert.deepEqual(result.clicks, []);
  assert.equal(result.outcomes.find(row => row.id === 'wing-construction').status, 'pending');
  assert.equal(result.events.filter(value => value === 'coordination').length, 1);
});
