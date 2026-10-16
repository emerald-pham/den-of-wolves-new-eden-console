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
    import {normalizeElectionPolicy} from './functions/src/presidentialElection';
    const ship={id:'aegis'}, roleId=null, observer=true, isGm=true, consoleRole=null;
    const me={uid:'fixture-gm',role:'gm',sessionId:'fixture-session'};
    const session={id:'fixture-session',currentTurn:1,presidentialElection:null};
    const local={uid:me.uid,sessionId:session.id};
    const connection='live',sessionSnapshotFreshness='server';
    const electionVoters=[{uid:'voter-a',displayName:'President'},{uid:'voter-b',displayName:'Captain'}];
    const configurePresidentialElection=async policy=>{
      window.__policyAttempted=true;
      const voters=window.__freshVoters.map(uid=>({uid,shipId:'dione'}));
      if(!normalizeElectionPolicy(policy,voters,1))throw Error('Choose eligible active players and a complete bounded election procedure.');
      window.__policies.push(policy);
    };
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
  cycle: 1, phase: 'active', turnStatePhase: 'team', connection: 'live', freshness: 'server', documentTimeOrigin: 1,
  fullGameDemo: { status: 'active', progression: 'manual' } };
const choice = { voterRoleIds: ['dione-president', 'dione-captain'], policy: {
  votingSystem: 'plurality', populationWeighting: 'equal', vicePresidentEnabled: false,
  campaigning: 'prohibited', supplyUse: 'prohibited', tieRule: 'current-office-remains',
  openCycle: 1, closeCycle: 1, campaignInstructions: 'No campaigning or supplies.' } };

for (const {action, staleVoters = false} of [{action:'configureElection'},{action:'resolveElection'},
  {action:'configureElection',staleVoters:true}]) test(staleVoters
  ? 'election policy re-enters both original voters before selecting the current eligible electorate'
  : `${action} checks the source form after returning the original GM`, async () => {
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
    await page.evaluate(stale => {
      window.__policies = []; window.__freshVoters = stale ? [] : ['voter-a','voter-b'];
      window.__voterEntries = [];
    },staleVoters);
    const css = await readFile(resolve(root, 'src/index.css'), 'utf8');
    await page.addStyleTag({ content: ['ship-console', 'session-mode'].map(name =>
      css.match(new RegExp(`\\.${name}__back::before\\s*\\{[^}]*\\}`))?.[0] ?? '').join('\n') });
    await page.addScriptTag({ content: script });
    await page.getByRole('link', { name: /Change role/ }).waitFor();
    const consume = runInNewContext(`(()=>{${functions};return ${action};})()`, {
      assert, URL, validateElectionPlan, validateElectionActionCycle, assertGmInstanceFence, blockedSourceBranch,
      actorRosterUids: async () => [{ roleId: 'dione-president', uid: 'voter-a' }, { roleId: 'dione-captain', uid: 'voter-b' }],
      enterSelectedRole: async (_context, roleId) => {
        assert.ok(choice.voterRoleIds.includes(roleId));
        const uid=roleId==='dione-president'?'voter-a':'voter-b';
        await page.evaluate(({roleId,uid})=>{
          window.__voterEntries.push(roleId);
          if(!window.__freshVoters.includes(uid))window.__freshVoters.push(uid);
        },{roleId,uid});
        return {actor:{sameActor:true,sessionId:original.sessionId,profileRoleId:roleId,uidHash:uid}};
      },
      observedMutation: async input => {
        assert.equal(input.endpoint, 'configurePresidentialElection');
        await input.executeUi();
        await page.waitForFunction(()=>window.__policyAttempted===true);
        return { accepted: false, boundary: 'inert-rendered-consumer' };
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
    if(staleVoters)assert.deepEqual(await page.evaluate(()=>window.__voterEntries),choice.voterRoleIds);
  }, { stopBuild: stop });
});

test('secret ballots wait for each original voter’s normal Election route and real workspace', async () => {
  const header = await sourceJsx('src/components/AppHeader.tsx', text =>
    text.startsWith('<button className="cic-text-button"') && text.includes("navigate('/election')"));
  const workspace = await sourceJsx('src/routes/ElectionWorkspace.tsx', text =>
    text.startsWith('<main className="election-office">'));
  const compiled = await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
    import React,{useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {HashRouter,Routes,Route,Link,useNavigate} from 'react-router-dom';
    import {PresidentialElectionWorkspaceView} from './src/components/PresidentialElectionWorkspace';
    const policy=${JSON.stringify(choice.policy)};
    const roles=['dione-president','dione-captain'];
    window.__voterRole=null;window.__ballots=[];
    function PresidentialElectionWorkspace(){return <PresidentialElectionWorkspaceView
      projection={{type:'presidential-election',revision:1,state:'open',policy,candidates:[
        {id:'candidate-president',displayName:'President'},{id:'candidate-captain',displayName:'Captain'}]}}
      live currentUserUid={window.__voterRole} isFacilitator={false} currentCycle={1} ballotSubmitted={false}
      onConfigurePolicy={async()=>{}} onResolveElection={async()=>{}}
      onCastBallot={async ballot=>{window.__ballots.push({roleId:window.__voterRole,...ballot});}}/>;}
    function App(){const navigate=useNavigate(),[headerReady,setHeaderReady]=useState(false);
      return <><select aria-label='Current actor' defaultValue='' onChange={event=>{
        window.__voterRole=event.target.value;
        const url=new URL(location.href);url.searchParams.set('demoActor','fixture-session~'+event.target.value);
        history.replaceState(history.state,'',url);navigate('/console');setHeaderReady(false);
        setTimeout(()=>setHeaderReady(true),100);
      }}><option value=''>Controller</option>{roles.map(role=><option key={role}>{role}</option>)}</select>
      <header>{headerReady&&${header}}</header><Routes>
        <Route path='/console' element={<main>Current original voter</main>}/>
        <Route path='/election' element={${workspace}}/>
      </Routes></>;}
    createRoot(document.getElementById('root')).render(<HashRouter><App/></HashRouter>);
  ` }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
  alias: { '@': resolve(root, 'src') }, plugins: [{ name: 'inert-election-ballot-ports', setup(builder) {
    builder.onResolve({ filter: /^@\/(store\/useSessionStore|lib\/presidentialElectionService)$/ }, args =>
      ({ path: args.path, namespace: 'ballot-port' }));
    builder.onLoad({ filter: /.*/, namespace: 'ballot-port' }, args => ({ contents:
      args.path.includes('useSessionStore') ? 'export const useSessionStore=()=>{throw Error("Unused container port");};' :
        'export const castPresidentialBallot=()=>{},configurePresidentialElection=()=>{},resolvePresidentialElection=()=>{};' }));
  } }] });
  const source = await readFile(new URL('./pc10-politics-press-proof.mjs', import.meta.url), 'utf8');
  const tree = ts.createSourceFile('politics.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const names = new Set(['required','missingChoice','demandButton','castSecretBallots','selectVoterActor','currentElectionGmBlockers']);
  const functions = tree.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text))
    .map(node => node.getText(tree)).join('\n');
  await withProofBrowserCleanup(async resources => {
    resources.browserServer = await chromium.launchServer({ channel: 'chrome', headless: true });
    resources.browser = await chromium.connect(resources.browserServer.wsEndpoint());
    resources.context = await resources.browser.newContext();
    await resources.context.route('**/*', route => route.request().isNavigationRequest() &&
      new URL(route.request().url()).hostname === 'pc10-election.invalid'
      ? route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }) : route.abort());
    const page = await resources.context.newPage();page.setDefaultTimeout(750);
    await page.goto('http://pc10-election.invalid/#/console');
    await page.addScriptTag({content:compiled.outputFiles[0].text});
    await page.getByLabel('Current actor',{exact:true}).waitFor();
    const roster=[{roleId:'dione-president',uidHash:'fixture-president',displayName:'President'},
      {roleId:'dione-captain',uidHash:'fixture-captain',displayName:'Captain'}];
    const consume=runInNewContext(`(()=>{${functions};return castSecretBallots;})()`,{
      assert,URL,validateElectionPlan,validateElectionActionCycle,assertGmInstanceFence,blockedSourceBranch,
      observedMutation:async input=>{assert.equal(input.endpoint,'castPresidentialBallot');
        await input.executeUi();return {accepted:false,boundary:'inert-rendered-consumer'};},
    });
    const result=await consume({initial:{sessionId:original.sessionId},started:original,roster,
      gm:{observe:async()=>({...original})},crew:{page,until:async(_label,predicate)=>{
        const roleId=await page.evaluate(()=>window.__voterRole),actor=roster.find(row=>row.roleId===roleId);
        const current={...original,playerRole:'player',sameActor:true,uidHash:actor.uidHash,profileRoleId:roleId};
        assert.ok(predicate(current));return current;
      }}},{...choice,ballotsByRole:{'dione-president':{presidentCandidateRoleId:'dione-president'},
        'dione-captain':{presidentCandidateRoleId:'dione-president'}}},{});
    assert.equal(result.length,2);
    assert.ok(result.every(receipt=>receipt.accepted===false),'Inert ports earn no gameplay credit.');
    assert.deepEqual(await page.evaluate(()=>window.__ballots),roster.map(actor=>({roleId:actor.roleId,
      presidentCandidateId:'candidate-president'})));
    assert.equal(new URL(page.url()).hash,'#/election');
  },{stopBuild:stop});
});
