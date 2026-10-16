import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Real Auth emulator accounts + production actor components. The callable
// responses below are declared UI fixtures, not server-authority acceptance.
// Full create/preparation/casting/start acceptance belongs to the reconciled
// candidate with the actual prepareFullGameDemo callable.
const origin = process.env.DEMO_ACTOR_BROWSER_URL;
const functionPort = process.env.DEMO_ACTOR_FUNCTIONS_PORT;
const authPort = process.env.DEMO_ACTOR_AUTH_PORT;
const outputDirectory = process.env.DEMO_ACTOR_EVIDENCE_DIR;
if (!origin || new URL(origin).hostname !== '127.0.0.1' || !functionPort || !authPort || !outputDirectory) {
  throw new Error('Provide this worktree’s local Vite URL, Functions/Auth ports and evidence directory.');
}
let sessionId = 'demo-ui-real-auth';
const joinCode = '482100';
const path = `/__demo-persona-proof-${process.pid}.html`;
const harnessPath = new URL(`..${path}`, import.meta.url);
const fixtureUrl = `${origin}${path}`;
const controllerUrl = `${fixtureUrl}?demoActor=${sessionId}~controller&demoJoin=${joinCode}#/demo-actors`;
const players = new Map();
const calls = [];
const remoteRequests = [];
const pageErrors = [];
const failedRequests = [];
const browserErrors = [];
let sdkSignups = 0;
let setupRevision = 0;
let roleIds = [];
const digest = uid => createHash('sha256').update(uid).digest('hex').slice(0, 16);

function session() {
  return {
    id: sessionId, name: 'Isolated demo actor UI fixture', joinCode,
    ownerUid: 'ui-fixture-gm', phase: 'casting', currentTurn: 0, playerCount: 20,
    setupRevision, activeRoleIds: roleIds, pressEnabled: true,
    fullGameDemo: { status: 'preparing', progression: 'manual' },
    createdAt: '2026-10-05T00:00:00.000Z', updatedAt: '2026-10-05T00:00:00.000Z',
  };
}

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Demo actor boundary proof</title></head>
<body><div id="root"></div><script type="module">
import RefreshRuntime from '/@react-refresh';
RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;
window.__vite_plugin_react_preamble_installed__=true;
</script><script type="module">
import React from 'react';
import ReactDOMClient from 'react-dom/client';
import {HashRouter,Routes,Route} from 'react-router-dom';
import {signOut} from 'firebase/auth';
import '/src/index.css';
import {auth} from '/src/lib/firebase.ts';
import {ensureAnonymousAuth} from '/src/lib/anonymousAuth.ts';
import {activeDemoActorProfile,expectedDemoActorUid} from '/src/lib/demoActorContext.ts';
import {recommendedRoleIds} from '/src/data/rolePresets.ts';
import {useSessionStore} from '/src/store/useSessionStore.ts';
import DemoActorControls from '/src/components/DemoActorControls.tsx';
import DemoActorManager from '/src/routes/DemoActorManager.tsx';
const profile=activeDemoActorProfile;
const identity=auth();
const expected=expectedDemoActorUid();
if(expected===null) throw new Error('A prepared profile is missing.');
const user=await ensureAnonymousAuth(identity,expected);
const roleIds=recommendedRoleIds(20);
const session={id:profile?.sessionId??'${sessionId}',name:'Isolated demo actor UI fixture',joinCode:'${joinCode}',ownerUid:'ui-fixture-gm',
phase:'casting',currentTurn:0,playerCount:20,setupRevision:0,activeRoleIds:roleIds,pressEnabled:true,
fullGameDemo:{status:'preparing',progression:'manual'},createdAt:'2026-10-05T00:00:00.000Z',updatedAt:'2026-10-05T00:00:00.000Z'};
const player={uid:user.uid,sessionId:session.id,role:'player',displayName:'DEMO // '+(profile?.roleId??'ordinary'),
seatId:profile?.roleId==='controller'?null:profile?.roleId??null,activeConsoleRoleId:profile?.roleId==='controller'?null:profile?.roleId??null};
const store=useSessionStore;
store.getState().setIdentity(session,player);
store.getState().setConnection('live');store.getState().setSessionSnapshotFreshness('server');
window.__proof={auth:identity,store,roleIds,signOut,documentId:crypto.randomUUID(),ready:true};
const h=React.createElement;
ReactDOMClient.createRoot(document.getElementById('root')).render(h(HashRouter,null,
profile?h(React.Fragment,null,h(DemoActorControls),h(Routes,null,
h(Route,{path:'/demo-actors',element:h(DemoActorManager)}),
h(Route,{path:'/console',element:h('main',null,h('h1',null,'Station catalog returned'))}))):
h('main',null,h('h1',null,'Ordinary browser Auth identity'),h('p',null,'This is an SDK isolation check, not a live GM authority proof.'))));
</script></body></html>`;

async function intercept(context) {
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
      remoteRequests.push(`${url.origin}${url.pathname}`);
      return route.abort();
    }
    // Serve the harness through Vite so Chromium observes its real loopback
    // address space before the genuine SDK reaches the local Auth emulator.
    if (url.pathname === path) return route.continue();
    if (url.port === authPort && url.pathname.endsWith('/accounts:signUp') && request.method() === 'POST') sdkSignups += 1;
    if (url.port !== functionPort) return route.continue();
    const cors = { 'access-control-allow-origin': new URL(origin).origin, 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'POST,OPTIONS' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const authorization = request.headers().authorization;
    assert.match(authorization ?? '', /^Bearer /, 'Every actor callable needs real SDK Auth.');
    const token = authorization.slice(7);
    // Verify this actual SDK token with the isolated Auth emulator. Do not save
    // or print credentials. The fixture then uses its verified public UID.
    const verification = await fetch(`http://127.0.0.1:${authPort}/identitytoolkit.googleapis.com/v1/accounts:lookup?key=demo-key`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: token }),
    });
    const account = (await verification.json()).users?.[0];
    assert.ok(account?.localId, 'Auth emulator must confirm the callable UID.');
    const uid = account.localId;
    const callable = url.pathname.split('/').at(-1);
    const command = request.postDataJSON()?.data;
    calls.push({ callable, uidHash: digest(uid), hasUidOverride: 'uid' in command || 'actorUid' in command });
    assert.equal(calls.at(-1).hasUidOverride, false);
    let result;
    if (callable === 'joinSession') {
      assert.equal(command.joinCode, joinCode);
      const roleId = command.displayName?.replace('DEMO // ', '') ?? 'controller';
      if (!players.has(uid)) players.set(uid, { uid, sessionId, role: 'player', displayName: command.displayName, seatId: null, profileRoleId: roleId });
      result = { session: session(), player: players.get(uid) };
    } else if (callable === 'claimSeat') {
      assert.equal(command.sessionId, sessionId);
      const player = players.get(uid);
      assert.equal(command.seatId, player?.profileRoleId);
      if (command.expectedSetupRevision !== setupRevision) result = { status: 'stale', setupRevision };
      else {
        player.seatId = command.seatId;
        result = { status: 'committed', setupRevision: ++setupRevision };
      }
    } else if (callable === 'resumeSession') {
      assert.equal(command.sessionId, sessionId);
      assert.ok(players.has(uid));
      result = { session: session(), player: players.get(uid) };
    } else if (callable === 'refreshPresence') {
      assert.equal(command.sessionId, sessionId);
      assert.ok(players.has(uid), 'Presence needs this same normally admitted fixture UID.');
      result = { refreshed: true };
    } else throw new Error(`Unexpected callable in actor chooser: ${callable}`);
    return route.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify({ result }) });
  });
}

await mkdir(outputDirectory, { recursive: true });
await writeFile(harnessPath, html);
const browser = await chromium.launch({ headless: true });
const a = await browser.newContext({ serviceWorkers: 'block' });
const b = await browser.newContext({ serviceWorkers: 'block' });
const evidence = { scope: 'Two browser surfaces; real Firebase SDK/Auth emulator; explicit callable UI fixtures. No server readiness or physical-attendance proof.', viewports: [] };
try {
  await intercept(a); await intercept(b);
  const ordinary = await a.newPage(), crew = await b.newPage();
  for (const page of [ordinary, crew]) {
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('requestfailed', request => { const url = new URL(request.url()); failedRequests.push({ path: `${url.origin}${url.pathname}`, error: request.failure()?.errorText }); });
    page.on('console', message => { if (message.type() === 'error' && /CORS|net::|Access to fetch/i.test(message.text())) browserErrors.push(message.text().replace(/\?[^\s'"]+/g, '')); });
  }
  await ordinary.goto(fixtureUrl);
  await ordinary.waitForFunction(() => window.__proof?.ready);
  const ordinaryUid = await ordinary.evaluate(() => window.__proof.auth.currentUser.uid);
  await b.addInitScript(() => localStorage.setItem('dow-new-eden-session-waiver', String(Date.now())));
  await crew.goto(controllerUrl);
  await crew.waitForFunction(() => window.__proof?.ready);
  roleIds = await crew.evaluate(() => window.__proof.roleIds);
  const controllerUid = await crew.evaluate(() => window.__proof.auth.currentUser.uid);
  await crew.evaluate(() => localStorage.setItem('dow-new-eden-session', JSON.stringify({ state: { me: { uid: 'ordinary-gm-cache', role: 'gm' }, pendingCommands: [{ id: 'ordinary-gm-command' }], gmAccessAuthenticatedAt: 123 }, version: 1 })));
  const prepare = crew.getByRole('button', { name: 'Prepare demo crew' });
  await prepare.waitFor();
  const controllerDocument = await crew.evaluate(() => window.__proof.documentId);
  await crew.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent === 'Prepare demo crew' && !button.disabled));
  await prepare.focus();
  await crew.keyboard.press('Enter');
  await crew.getByRole('button', { name: /Open.*Press Officer/ }).waitFor({ timeout: 45_000 });
  assert.equal(await crew.getByLabel('Current actor', { exact: true }).locator('option').count(), 22);
  assert.equal(await crew.evaluate(() => window.__proof.documentId), controllerDocument);
  evidence.preparedActorSelectorUpdatedWithoutReload = true;
  const roster = await crew.evaluate(() => JSON.parse(localStorage.getItem('dow-new-eden-demo-actors:demo-ui-real-auth')));
  assert.equal(roster.length, 21);
  assert.equal(new Set(roster.map(actor => actor.uid)).size, 21);
  assert.ok(roster.every(actor => actor.uid !== ordinaryUid && actor.uid !== controllerUid));
  assert.equal(calls.filter(call => call.callable === 'joinSession').length, 21);
  assert.equal(calls.filter(call => call.callable === 'claimSeat').length, 20);
  assert.equal(await ordinary.evaluate(() => window.__proof.auth.currentUser.uid), ordinaryUid);
  evidence.genuineDistinctActorCount = roster.length;
  evidence.defaultIdentityPreserved = true;
  evidence.callableUidOverrides = calls.filter(call => call.hasUidOverride).length;
  await crew.getByRole('button', { name: /Open.*\/\/ Admiral$/ }).click();
  await crew.waitForURL(/demoActor=demo-ui-real-auth%7Eadmiral/);
  await crew.waitForFunction(() => window.__proof?.ready);
  const admiral = roster.find(actor => actor.roleId === 'admiral');
  assert.equal(await crew.evaluate(() => window.__proof.auth.currentUser.uid), admiral.uid);
  assert.notEqual(await crew.evaluate(() => window.__proof.documentId), controllerDocument);
  await crew.evaluate(() => {
    window.__proof.store.getState().enqueueCommand({ id: 'old-actor-command', kind: 'claimSeat', createdAt: 'now', payload: { sessionId: 'demo-ui-real-auth', seatId: 'admiral', requestId: 'old-actor-command', expectedSetupRevision: 0 } });
    window.__proof.store.setState({ privateLoyalty: { roleId: 'admiral', privateText: 'OLD ACTOR ONLY' } });
    setTimeout(() => window.__proof.store.setState({ privateLoyalty: { privateText: 'DEAD DOCUMENT RESPONSE' } }), 500);
  });
  await crew.getByLabel('Current actor', { exact: true }).selectOption('wing-commander');
  await crew.waitForURL(/demoActor=demo-ui-real-auth%7Ewing-commander/);
  await crew.waitForFunction(() => window.__proof?.ready);
  const wing = roster.find(actor => actor.roleId === 'wing-commander');
  assert.equal(await crew.evaluate(() => window.__proof.auth.currentUser.uid), wing.uid);
  await crew.waitForTimeout(600);
  assert.deepEqual(await crew.evaluate(() => window.__proof.store.getState().pendingCommands), []);
  assert.equal(await crew.evaluate(() => window.__proof.store.getState().privateLoyalty), null);
  assert.equal(await crew.evaluate(() => JSON.parse(localStorage.getItem('dow-new-eden-session')).state.me.uid), 'ordinary-gm-cache');
  evidence.wrongActorOutboxBlocked = true;
  evidence.oldPrivateAndInflightResponsesBlocked = true;
  await crew.getByLabel('Current actor', { exact: true }).selectOption('admiral');
  await crew.waitForURL(/demoActor=demo-ui-real-auth%7Eadmiral/);
  await crew.waitForFunction(() => window.__proof?.ready);
  assert.equal(await crew.evaluate(() => window.__proof.auth.currentUser.uid), admiral.uid);
  assert.deepEqual(await crew.evaluate(() => window.__proof.store.getState().pendingCommands.map(command => command.id)), ['old-actor-command']);
  assert.equal(await crew.evaluate(() => window.__proof.store.getState().privateLoyalty), null);
  evidence.returningActorRestoredOwnOutbox = true;
  await crew.getByRole('link', { name: 'Crew controller', exact: true }).click();
  await crew.waitForURL(/demoActor=demo-ui-real-auth%7Econtroller/);
  await crew.waitForFunction(() => window.__proof?.ready);
  const viewports = [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 640 }, { width: 844, height: 390 }];
  for (const viewport of viewports) {
    await crew.setViewportSize(viewport); await crew.emulateMedia({ reducedMotion: 'reduce' });
    await crew.getByRole('heading', { name: 'Demo crew controller' }).scrollIntoViewIfNeeded();
    const layout = await crew.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      controls: [...document.querySelectorAll('.demo-actor-manager button,.demo-actor-manager a,.demo-actor-controls select,.demo-actor-controls a')].map(node => ({ height: node.getBoundingClientRect().height, left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right })),
      font: getComputedStyle(document.querySelector('.demo-actor-manager h1')).fontFamily,
    }));
    assert.equal(layout.overflow, false);
    assert.ok(layout.controls.every(control => control.height >= 44 && control.left >= 0 && control.right <= viewport.width + 1));
    assert.match(layout.font, /mono/i);
    evidence.viewports.push({ ...viewport, noOverflow: true, touchTargets44px: true, monospace: true, reducedMotion: true });
    await crew.screenshot({ path: `${outputDirectory}/crew-${viewport.width}x${viewport.height}.png`, fullPage: true });
  }
  const back = crew.getByRole('link', { name: 'Back to stations' });
  await back.focus(); await crew.keyboard.press('Enter');
  await crew.getByRole('heading', { name: 'Station catalog returned' }).waitFor();
  evidence.keyboardPrepareAndReturn = true;
  await crew.evaluate(() => {
    const current = window.__proof.store.getState().session;
    window.__proof.store.getState().setSession({ ...current, phase: 'debrief', fullGameDemo: { status: 'complete', progression: 'manual' } });
  });
  const signupsBeforeFresh = sdkSignups;
  sessionId = 'fresh-demo-ui-real-auth'; setupRevision = 0; players.clear();
  await crew.goto(`${fixtureUrl}?demoActor=${sessionId}~controller&demoJoin=${joinCode}#/demo-actors`);
  await crew.waitForFunction(() => window.__proof?.ready);
  assert.equal(await crew.evaluate(() => window.__proof.auth.currentUser.uid), controllerUid);
  assert.deepEqual(await crew.evaluate(() => window.__proof.store.getState().pendingCommands), []);
  assert.equal(await crew.evaluate(() => window.__proof.store.getState().privateLoyalty), null);
  await crew.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent === 'Prepare demo crew' && !button.disabled));
  await crew.getByRole('button', { name: 'Prepare demo crew' }).click();
  await crew.getByRole('button', { name: /Open.*Press Officer/ }).waitFor({ timeout: 45_000 });
  const freshRoster = await crew.evaluate(() => JSON.parse(localStorage.getItem('dow-new-eden-demo-actors:fresh-demo-ui-real-auth')));
  assert.deepEqual(freshRoster.map(actor => actor.uid), roster.map(actor => actor.uid));
  assert.equal(sdkSignups, signupsBeforeFresh);
  assert.equal(await crew.evaluate(() => JSON.parse(localStorage.getItem('dow-new-eden-session')).state.me.uid), 'ordinary-gm-cache');
  evidence.freshSessionSameGenuineAccounts = true;
  evidence.freshSessionNewSignups = sdkSignups - signupsBeforeFresh;
  evidence.freshSessionPrivateStateAndOutboxReset = true;
  await crew.evaluate(async () => {
    const { demoActorServices } = await import('/src/lib/firebase.ts');
    await window.__proof.signOut(demoActorServices({ sessionId: 'fresh-demo-ui-real-auth', roleId: 'wing-commander' }).auth);
  });
  await crew.getByRole('button', { name: /Open.*Wing Commander$/ }).click();
  await crew.getByRole('alert').filter({ hasText: /account.*unavailable/i }).waitFor();
  assert.equal(sdkSignups, signupsBeforeFresh);
  evidence.lostSdkAccountDeniesReplacement = true;
  evidence.initialSdkAccountCount = signupsBeforeFresh;
  assert.deepEqual(remoteRequests, []);
  assert.deepEqual(pageErrors, []);
  evidence.remoteRequests = remoteRequests;
  evidence.pageErrors = pageErrors;
  evidence.authUidHashes = roster.map(actor => ({ roleId: actor.roleId, uidHash: digest(actor.uid) }));
  await writeFile(`${outputDirectory}/evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ passed: true, actorCount: roster.length, outputDirectory, scope: evidence.scope }));
} catch (cause) {
  const crew = b.pages()[0];
  const visibleFixture = crew ? await crew.locator('body').innerText().catch(() => '') : '';
  if (crew) await crew.screenshot({ path: `${outputDirectory}/failure.png`, fullPage: true }).catch(() => undefined);
  await writeFile(`${outputDirectory}/failure.json`, `${JSON.stringify({ message: cause.message, pageErrors, remoteRequests, failedRequests, browserErrors, callCount: calls.length, visibleFixture }, null, 2)}\n`);
  throw cause;
} finally {
  await a.close(); await b.close(); await browser.close();
  await unlink(harnessPath);
}
