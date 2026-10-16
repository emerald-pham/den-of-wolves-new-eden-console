import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { candidateGameplayTools, candidateGeometrySnapshot } from './pc10-candidate-manual-ui-proof.mjs';

// Prepared source/native Chrome diagnosis only. No real Auth, Firebase,
// gameplay, admission, candidate choice, ending or checkpoint acceptance.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requireNative = createRequire(resolve(ROOT, 'package.json'));
const { build } = requireNative('esbuild');
const { chromium } = requireNative('playwright');
const PROJECT = 'demo-pc10-keyboard-prepared';
const SID = 'prepared-keyboard-session';
const ROLE = 'shepherd-scientist';
const UID = 'prepared-keyboard-scientist';
const GROUP = 'fleet-1';
const noMutation = `const noMutation=()=>{throw new Error('Prepared keyboard diagnosis cannot mutate gameplay.');};`;

async function bundleSource() {
  const entry = `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import CandidatePreparationPanel from './src/components/CandidatePreparationPanel';
    import { useSessionStore } from './src/store/useSessionStore';
    import { candidateWorkspace } from './functions/src/candidatePaths';
    import './src/index.css';
    const tracks=['reactor','jump-drive','hydroponics','water-reclamation','advanced-hydroponics'];
    const authority={sessionId:${JSON.stringify(SID)},cycle:4,phase:'active',coordination:true,
      now:'2026-10-06T00:00:00.000Z',groupId:${JSON.stringify(GROUP)},vesselIds:['shepherd'],
      actor:{uid:${JSON.stringify(UID)},gm:false,shipIds:[],research:true,shuttleIds:['philia']},
      discovered:[{code:'N',coordinate:'0123'}],
      ships:{shepherd:{fuel:40,materials:10,reactorCapacity:5,destroyed:false,jumpCharged:true,
        jumpDamaged:false,longJumpCost:13,atCandidate:true,jumpedThisCycle:false,coordinate:'0123'}},
      research:Object.fromEntries(tracks.map(id=>[id,4])),
      engineeringShuttles:[{id:'philia',available:true}],hiddenScoutCount:0};
    const report=candidateWorkspace(authority,{revision:8,sites:{'0123':{code:'N',coordinate:'0123',
      groupId:${JSON.stringify(GROUP)},materials:10,researchIds:[],ships:{},reactors:{}}}});
    useSessionStore.setState({session:{id:${JSON.stringify(SID)},phase:'active',currentTurn:4,
      updatedAt:'prepared-source-key',shipFleetGroupIds:{shepherd:${JSON.stringify(GROUP)}}},
      me:{uid:${JSON.stringify(UID)},sessionId:${JSON.stringify(SID)},role:'player',
        assignedRoleId:${JSON.stringify(ROLE)},activeConsoleRoleId:${JSON.stringify(ROLE)},
        fleetGroupId:${JSON.stringify(GROUP)},connectionGeneration:1},gmInstance:null,
      connection:'live',sessionSnapshotFreshness:'server',identityHydrationRevision:1});
    globalThis.__pc10PreparedKeyboard={store:useSessionStore,report};
    createRoot(document.querySelector('#source-root')).render(
      React.createElement(React.StrictMode,null,React.createElement(CandidatePreparationPanel)));
  `;
  const result = await build({ stdin: { contents: entry, resolveDir: ROOT, loader: 'tsx' },
    bundle: true, write: false, outfile: resolve(ROOT, 'prepared-keyboard.js'), format: 'iife',
    platform: 'browser', jsx: 'automatic', alias: { '@': resolve(ROOT, 'src') },
    loader: { '.png': 'dataurl', '.svg': 'dataurl', '.woff': 'dataurl', '.woff2': 'dataurl' },
    plugins: [{ name: 'existing-source-prepared-transport', setup(builder) {
      builder.onResolve({ filter: /^@\/lib\/(candidateService|sessionService)$/ }, args =>
        ({ path: args.path, namespace: 'prepared-transport' }));
      builder.onLoad({ filter: /.*/, namespace: 'prepared-transport' }, args => ({ contents:
        args.path.endsWith('sessionService') ? `${noMutation} export const setGmShipConsoleWriteGrant=noMutation;` : `
          ${noMutation}
          export const createCandidateAttempt=noMutation, executeCandidateAttempt=noMutation;
          export const recoverCandidateAttempt=()=>undefined;
          export async function readCandidateWorkspace(groupId){
            const state=globalThis.__pc10PreparedKeyboard.store.getState();
            const response=await fetch('/${PROJECT}/us-central1/readCandidateWorkspace',{
              method:'POST',headers:{'content-type':'application/json'},
              body:JSON.stringify({data:{sessionId:state.session.id,expectedGroupId:groupId}})});
            if(!response.ok)throw new Error('Prepared source read failed');
            return (await response.json()).result;
          }`, loader: 'js' }));
    } }] });
  const js = result.outputFiles.find(file => file.path.endsWith('.js'))?.text;
  const css = result.outputFiles.find(file => file.path.endsWith('.css'))?.text;
  assert.ok(js && css, 'The unchanged component, store, projection and complete CSS must bundle.');
  return { js, css };
}

for (const { surroundingCount, refreshBetweenTabs } of [
  { surroundingCount: 0, refreshBetweenTabs: false },
  { surroundingCount: 39, refreshBetweenTabs: false },
  { surroundingCount: 39, refreshBetweenTabs: true },
]) {
  test(`unchanged source panel native Tabs reach all targets with ${surroundingCount} surrounding fixture controls${refreshBetweenTabs ? ' and same-authority store refresh' : ''}`, async () => {
    const base = process.env.PC10_CANDIDATE_KEYBOARD_EVIDENCE ?? await mkdtemp(resolve(tmpdir(), 'pc10-keyboard-component-'));
    const directory = resolve(base, `prepared-surrounding-${surroundingCount}${refreshBetweenTabs ? '-refresh' : ''}`);
    await mkdir(directory, { recursive: true });
    const bundle = await bundleSource();
    const posted = [], traffic = [], errors = [], observations = [], refreshObservations = [];
    let server, browser, origin, report;
    try {
      server = createServer(async (request, response) => {
        try {
          if (request.method === 'GET' && request.url === '/') {
            const surrounding = Array.from({ length: surroundingCount }, (_, index) =>
              `<button type="button">Prepared surrounding control ${index}</button>`).join('');
            response.setHeader('content-type', 'text/html');
            response.end(`<!doctype html><html><head><style>${bundle.css}</style></head><body>
              <header aria-label="Prepared surrounding controls">${surrounding}</header>
              <main id="source-root"></main><script>${bundle.js}</script></body></html>`);
          } else if (request.method === 'GET' && request.url === '/prepared-store.js') {
            response.setHeader('content-type', 'application/javascript');
            response.end('export const useSessionStore=globalThis.__pc10PreparedKeyboard.store;');
          } else if (request.method === 'POST' && request.url === `/${PROJECT}/us-central1/readCandidateWorkspace`) {
            let text = ''; for await (const chunk of request) text += chunk;
            const payload = JSON.parse(text);
            assert.deepEqual(payload, { data: { sessionId: SID, expectedGroupId: GROUP } });
            posted.push(payload);
            response.setHeader('content-type', 'application/json');
            response.end(JSON.stringify({ result: report }));
          } else { response.statusCode = 404; response.end(); }
        } catch (error) { errors.push(error.message); response.statusCode = 500; response.end(); }
      });
      await new Promise((resolveListening, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListening); });
      origin = `http://127.0.0.1:${server.address().port}`;
      browser = await chromium.launch({ channel: 'chrome', headless: true });
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
      await context.route('**/*', route => {
        const url = route.request().url();
        if (url.startsWith(`${origin}/`)) return route.continue();
        traffic.push(url); return route.abort();
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      // The prepared report is produced by the actual source projector in the
      // same browser bundle. Initial source reads wait for this read-only value.
      let releaseReport;
      const reportReady = new Promise(resolveReport => { releaseReport = resolveReport; });
      const initialRequests = new Set();
      await page.route(`**/${PROJECT}/us-central1/readCandidateWorkspace`, async route => {
        const payload = route.request().postDataJSON();
        assert.deepEqual(payload, { data: { sessionId: SID, expectedGroupId: GROUP } });
        if (!report) { initialRequests.add(route.request()); await reportReady; }
        return route.continue();
      });
      await page.goto(origin);
      report = await page.evaluate(() => globalThis.__pc10PreparedKeyboard.report);
      releaseReport();
      await page.getByRole('heading', { name: 'Ancient Jump Ring', exact: true }).waitFor();
      let viewport = { width: 1440, height: 900 }, presses = 0, pendingTab = false;
      const actualPanel = page.getByRole('region', { name: 'Candidate preparation and actions', exact: true });
      const panel = new Proxy(actualPanel, { get(target, key) {
        if (key === 'evaluate') return async (callback, arg) => {
          const snapshot = await target.evaluate(callback, arg);
          if (callback === candidateGeometrySnapshot) {
            observations.push({ ...viewport, tabPressOrdinal: pendingTab ? presses : null,
              documentTabStopCount: snapshot.documentTabStopCount,
              tabStopKeys: snapshot.tabStopKeys, activeTargetKey: snapshot.activeTargetKey });
            pendingTab = false;
          }
          return snapshot;
        };
        const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
      } });
      const fixturePage = new Proxy(page, { get(target, key) {
        if (key === 'getByRole') return (role, options) => role === 'region' && options.name === 'Candidate preparation and actions'
          ? panel : target.getByRole(role, options);
        if (key === 'setViewportSize') return async size => { viewport = { ...size }; presses = 0; await target.setViewportSize(size); };
        if (key === 'keyboard') return { press: async keyName => {
          assert.equal(keyName, 'Tab'); await target.keyboard.press(keyName); presses++; pendingTab = true;
          if (refreshBetweenTabs && presses === 1) {
            // Optional prepared-source diagnosis only. This is not an extra
            // production-proof read/action: refresh same-authority store objects
            // without changing the source key, actor, document or hydration.
            refreshObservations.push(await target.evaluate(async () => {
              const store = globalThis.__pc10PreparedKeyboard.store;
              const before = store.getState(), active = document.activeElement;
              store.setState({ session: { ...before.session }, me: { ...before.me } });
              await new Promise(resolvePaint => requestAnimationFrame(resolvePaint));
              const after = store.getState();
              return { activeNodeConnected: active.isConnected, activeNodeRetained: document.activeElement === active,
                sourceKeyRetained: before.session.updatedAt === after.session.updatedAt,
                actorRetained: before.me.uid === after.me.uid && before.me.sessionId === after.me.sessionId,
                hydrationRetained: before.identityHydrationRevision === after.identityHydrationRevision };
            }));
          }
        } };
        const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
      } });
      const surface = { page: fixturePage, storeModuleUrl: () => `${origin}/prepared-store.js`,
        observe: () => page.evaluate(({ uid, sid, roleId }) => {
          const state = globalThis.__pc10PreparedKeyboard.store.getState();
          return { hasAuth: true, sameActor: state.me.uid === uid && state.me.sessionId === sid,
            uidHash: state.me.uid === uid ? 'prepared-original-hash' : 'prepared-foreign-hash', sessionId: state.session.id,
            playerRole: state.me.role, profileRoleId: roleId, assignedRoleId: state.me.assignedRoleId,
            activeConsoleRoleId: state.me.activeConsoleRoleId, instanceId: null, gmInstanceOwned: false,
            connection: state.connection, freshness: state.sessionSnapshotFreshness };
        }, { uid: UID, sid: SID, roleId: ROLE }) };
      const tools = candidateGameplayTools({ gm: surface, crew: surface, directory,
        initial: { sessionId: SID, joinCode: 'PREPARED' },
        roster: [{ roleId: ROLE, uidHash: 'prepared-original-hash' }], projectId: PROJECT,
        ports: { functions: server.address().port } });
      await tools.candidateGeometry(surface, 'N', 'research-choice');
      const geometries = JSON.parse(await readFile(resolve(directory, 'N-research-choice-geometry.json'), 'utf8'));
      for (const geometry of geometries) {
        assert.equal(geometry.keyboardTraversal.intendedTargetCount, 8);
        assert.equal(geometry.keyboardTraversal.documentTabStopCount, 8 + surroundingCount);
        assert.equal(geometry.keyboardTraversal.tabPressLimit, 9 + surroundingCount);
        assert.equal(geometry.keyboardTraversal.allEnabledTargetsReached, true);
      }
      assert.equal(traffic.length, 0); assert.deepEqual(errors, []);
      assert.equal(refreshObservations.length, refreshBetweenTabs ? 3 : 0);
      assert.ok(refreshObservations.every(value => Object.values(value).every(flag => flag === true)));
      await writeFile(resolve(directory, 'prepared-native-observations.json'), `${JSON.stringify({
        scope: 'Prepared unchanged source component/store/projector and real Chrome Tab diagnosis; zero Auth/gameplay/ending credit.',
        sourceRoot: ROOT, surroundingCount, preparedReadCount: posted.length,
        initialReadCount: initialRequests.size, geometries, observations, refreshObservations,
      }, null, 2)}\n`);
    } catch (error) {
      await writeFile(resolve(directory, 'prepared-native-failure.json'), `${JSON.stringify({
        scope: 'Prepared-only failure, never actual gameplay credit.', error: error.message,
        surroundingCount, observations, errors, externalRequestCount: traffic.length,
      }, null, 2)}\n`);
      throw error;
    } finally {
      if (browser) await browser.close();
      if (server?.listening) await new Promise((resolveClosed, reject) => server.close(error => error ? reject(error) : resolveClosed()));
      const sourceFiles = ['src/components/CandidatePreparationPanel.tsx', 'src/components/CandidatePreparationPanel.css',
        'src/store/useSessionStore.ts', 'functions/src/candidatePaths.ts', 'functions/src/endeavourResearch.ts',
        'src/index.css', 'scripts/pc10-candidate-manual-ui-proof.mjs', 'scripts/pc10-candidate-manual-ui-geometry.mjs'];
      const bindings = await Promise.all(sourceFiles.map(async path => ({ path,
        sha256: createHash('sha256').update(await readFile(resolve(ROOT, path))).digest('hex') })));
      await writeFile(resolve(directory, 'owned-resource-close.json'), `${JSON.stringify({
        browserClosed: !browser?.isConnected(), serverClosed: !server?.listening,
        sharedFirebaseOrRootRuntimeTouched: false, sourceBindings: bindings,
      }, null, 2)}\n`);
    }
  });
}
