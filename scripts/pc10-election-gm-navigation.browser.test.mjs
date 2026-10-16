import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { build, stop } from 'esbuild';
import { chromium } from 'playwright';
import { withProofBrowserCleanup } from './proof-tooling-browser-lifecycle.mjs';
import { validateElectionPlan, validateElectionActionCycle } from './pc10-politics-press-proof.mjs';
import { assertGmInstanceFence, blockedSourceBranch } from './pc10-political-crisis-arrest-proof-contracts.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
async function sourceJsx(path, matches) {
  const source = await readFile(resolve(root, path), 'utf8');
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = [];
  function visit(node) {
    if (ts.isJsxElement(node) && matches(node.getText(tree))) found.push(node.getText(tree));
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.equal(found.length, 1, `Use the exact current source JSX from ${path}.`);
  return found[0];
}

async function fixtureScript() {
  const [observerBack, fleetBack, gmLink, election] = await Promise.all([
    sourceJsx('src/routes/ShipConsole.tsx', text => text.startsWith('<Link\n') &&
      text.includes('className="ship-console__back cic-text-button"')),
    sourceJsx('src/routes/ShipRoleSelect.tsx', text => text.startsWith('<Link ') &&
      text.includes('className="session-mode__back cic-text-button"') && text.includes('Back to fleet')),
    sourceJsx('src/routes/SessionMode.tsx', text => text.startsWith('<Link\n') && text.includes('aria-label="GM Console"')),
    sourceJsx('src/routes/GmConsole.tsx', text => text.startsWith(
      '<section className="gm-console__module gm-crisis cic-frame" aria-label="Election procedure and outcome">')),
  ]);
  const compiled = await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {HashRouter,Routes,Route,Link} from 'react-router-dom';
    import {PresidentialElectionWorkspaceView} from './src/components/PresidentialElectionWorkspace';
    const ship={id:'aegis'}, roleId=null, observer=true, isGm=true, consoleRole=null;
    const me={uid:'fixture-gm',role:'gm',sessionId:'fixture-session'};
    const session={id:'fixture-session',currentTurn:1,presidentialElection:null};
    const local={uid:me.uid,sessionId:session.id};
    const connection='live',sessionSnapshotFreshness='server';
    const electionVoters=[{uid:'voter-a',displayName:'President'},{uid:'voter-b',displayName:'Captain'}];
    const configurePresidentialElection=async policy=>{window.__policies.push(policy);};
    const castPresidentialBallot=async()=>{},resolvePresidentialElection=async()=>{};
    createRoot(document.getElementById('root')).render(<HashRouter><Routes>
      <Route path='/ships/aegis/observer' element={<main className='ship-console'>${observerBack}</main>}/>
      <Route path='/ships/aegis/roles' element={<main className='ship-role-select'>${fleetBack}</main>}/>
      <Route path='/console' element={<main className='fleet-roster'>${gmLink}</main>}/>
      <Route path='/gm' element={<main className='gm-console'>${election}</main>}/>
    </Routes></HashRouter>);
  ` }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
  alias: { '@': resolve(root, 'src') }, plugins: [{ name: 'inert-election-network-ports', setup(builder) {
    builder.onResolve({ filter: /^@\/(store\/useSessionStore|lib\/presidentialElectionService)$/ }, args =>
      ({ path: args.path, namespace: 'election-port' }));
    builder.onLoad({ filter: /.*/, namespace: 'election-port' }, args => ({ contents:
      args.path.includes('useSessionStore') ? 'export const useSessionStore=()=>{throw Error("Unused container port");};' :
        'export const castPresidentialBallot=()=>{},configurePresidentialElection=()=>{},resolvePresidentialElection=()=>{};' }));
  } }] });
  return compiled.outputFiles[0].text;
}

const original = { hasAuth: true, sameActor: true, playerRole: 'gm', gmInstanceOwned: true,
  sessionId: 'fixture-session', uidHash: 'fixture-original-gm', instanceId: 'fixture-instance',
  cycle: 1, phase: 'active', turnStatePhase: 'team', connection: 'live', freshness: 'server', documentTimeOrigin: 1 };
const choice = { voterRoleIds: ['dione-president', 'dione-captain'], policy: {
  votingSystem: 'plurality', populationWeighting: 'equal', vicePresidentEnabled: false,
  campaigning: 'prohibited', supplyUse: 'prohibited', tieRule: 'current-office-remains',
  openCycle: 1, closeCycle: 1, campaignInstructions: 'No campaigning or supplies.' } };

for (const action of ['configureElection', 'resolveElection']) test(`${action} checks the source form after returning the original GM`, async () => {
  const script = await fixtureScript();
  const source = await readFile(new URL('./pc10-politics-press-proof.mjs', import.meta.url), 'utf8');
  const tree = ts.createSourceFile('politics.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const names = new Set(['required', 'missingChoice', 'demandButton', 'configureElection', 'resolveElection', 'currentElectionGmBlockers', 'electionGmRegion']);
  const functions = tree.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text))
    .map(node => node.getText(tree)).join('\n');
  await withProofBrowserCleanup(async resources => {
    resources.browserServer = await chromium.launchServer({ channel: 'chrome', headless: true });
    resources.browser = await chromium.connect(resources.browserServer.wsEndpoint());
    resources.context = await resources.browser.newContext();
    await resources.context.route('**/*', route => route.request().isNavigationRequest() &&
      new URL(route.request().url()).hostname === 'pc10-election.invalid'
      ? route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }) : route.abort());
    const page = await resources.context.newPage(); page.setDefaultTimeout(750);
    await page.goto('http://pc10-election.invalid/#/ships/aegis/observer');
    await page.evaluate(() => { window.__policies = []; });
    const css = await readFile(resolve(root, 'src/index.css'), 'utf8');
    await page.addStyleTag({ content: ['ship-console', 'session-mode'].map(name =>
      css.match(new RegExp(`\\.${name}__back::before\\s*\\{[^}]*\\}`))?.[0] ?? '').join('\n') });
    await page.addScriptTag({ content: script });
    await page.getByRole('link', { name: /Change role/ }).waitFor();
    const consume = runInNewContext(`(()=>{${functions};return ${action};})()`, {
      assert, URL, validateElectionPlan, validateElectionActionCycle, assertGmInstanceFence, blockedSourceBranch,
      actorRosterUids: async () => [{ roleId: 'dione-president', uid: 'voter-a' }, { roleId: 'dione-captain', uid: 'voter-b' }],
      observedMutation: async input => {
        assert.equal(input.endpoint, 'configurePresidentialElection');
        await input.executeUi(); return { accepted: false, boundary: 'inert-rendered-consumer' };
      },
    });
    const current = { ...original, turnStatePhase: action === 'configureElection' ? 'team' : 'coordination' };
    const result = await consume({ gm: { page, observe: async () => ({ ...current }) },
      crew: { page }, initial: { sessionId: original.sessionId }, started: original,
      roster: [{ roleId: 'dione-president', displayName: 'President' },
        { roleId: 'dione-captain', displayName: 'Captain' }] }, action === 'configureElection' ? choice : { election: choice }, {});
    assert.equal(result.accepted, false, 'An inert UI fixture earns no gameplay credit.');
    assert.equal(new URL(page.url()).hash, '#/gm');
    const policies = await page.evaluate(() => window.__policies);
    assert.equal(policies.length, action === 'configureElection' ? 1 : 0);
    if (action === 'configureElection') assert.deepEqual(policies[0], { ...choice.policy, eligibleVoterUids: ['voter-a', 'voter-b'] });
    else assert.deepEqual(Array.from(result.blockerCodes), ['source-control-not-mounted']);
  }, { stopBuild: stop });
});
