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
const GM_ROLE = 'prepared-gm-role';
const GM_UID = 'prepared-keyboard-gm';
const GM_INSTANCE_ID = 'prepared-keyboard-gm-instance';
const GM_CLAIMED_AT = '2026-10-06T00:01:00.000Z';
const GROUP = 'fleet-1';
const noMutation = `const noMutation=()=>{throw new Error('Prepared keyboard diagnosis cannot mutate gameplay.');};`;

async function bundleSource({ mode = 'research-choice' } = {}) {
  const repairedRing = mode === 'repaired-ring';
  const entry = `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import CandidatePreparationPanel from './src/components/CandidatePreparationPanel';
    import RoleConsoleTemplate from './src/components/RoleConsoleTemplate';
    import { useSessionStore } from './src/store/useSessionStore';
    import { candidateWorkspace } from './functions/src/candidatePaths';
    import './src/index.css';
    const tracks=['reactor','jump-drive','hydroponics','water-reclamation','advanced-hydroponics'];
    const repairedRing=${JSON.stringify(repairedRing)};
    const shipIds=repairedRing?['aegis','dione','icebreaker','quellon','refinery-124','shepherd']:['shepherd'];
    const actorUid=repairedRing?${JSON.stringify(GM_UID)}:${JSON.stringify(UID)};
    const roleId=repairedRing?${JSON.stringify(GM_ROLE)}:${JSON.stringify(ROLE)};
    const gmInstance=repairedRing?{id:${JSON.stringify(GM_INSTANCE_ID)},uid:actorUid,sessionId:${JSON.stringify(SID)},
      name:'Prepared GM',deviceLabel:'Prepared fixture',claimedAt:${JSON.stringify(GM_CLAIMED_AT)},
      shipConsoleWriteGrant:{shipId:'aegis',grantedAt:'2026-10-06T00:02:00.000Z'}}:null;
    const authority={sessionId:${JSON.stringify(SID)},cycle:4,phase:'active',coordination:true,
      now:'2026-10-06T00:00:00.000Z',groupId:${JSON.stringify(GROUP)},vesselIds:shipIds,
      actor:{uid:actorUid,gm:repairedRing,shipIds:[],research:!repairedRing,shuttleIds:repairedRing?[]:['philia']},
      discovered:[{code:'N',coordinate:'0123'}],
      ships:Object.fromEntries(shipIds.map(shipId=>[shipId,{fuel:40,materials:10,reactorCapacity:5,destroyed:false,jumpCharged:true,
        jumpDamaged:false,longJumpCost:13,atCandidate:true,jumpedThisCycle:false,coordinate:'0123'}])),
      research:Object.fromEntries(tracks.map(id=>[id,4])),
      engineeringShuttles:[{id:'philia',available:!repairedRing}],hiddenScoutCount:0};
    const site={code:'N',coordinate:'0123',groupId:${JSON.stringify(GROUP)},materials:10,
      researchIds:repairedRing?tracks:[],ships:{},reactors:{},
      ...(repairedRing?{shuttleId:'philia',repairedAt:authority.now}:{})};
    const report=candidateWorkspace(authority,{revision:8,sites:{'0123':site}});
    useSessionStore.setState({session:{id:${JSON.stringify(SID)},phase:'active',currentTurn:4,
      updatedAt:'prepared-source-key',shipFleetGroupIds:Object.fromEntries(shipIds.map(shipId=>[shipId,${JSON.stringify(GROUP)}]))},
      me:{uid:actorUid,sessionId:${JSON.stringify(SID)},role:repairedRing?'gm':'player',
        assignedRoleId:roleId,activeConsoleRoleId:roleId,
        fleetGroupId:${JSON.stringify(GROUP)},connectionGeneration:1},gmInstance,
      connection:'live',sessionSnapshotFreshness:'server',identityHydrationRevision:1});
    globalThis.__pc10PreparedKeyboard={store:useSessionStore,report};
    const root=createRoot(document.querySelector('#source-root'));
    const candidate=<CandidatePreparationPanel />;
    const composed=<main className="ship-console ship-console--gameplay gm-console">
      <section className="ship-console__identity" aria-label="GM command">
        <p className="ship-console__nation">Prepared session // Game master</p>
        <h1 className="ship-console__name">GM Console</h1>
        <RoleConsoleTemplate label="GM operations console" eyebrow="Game master // Session operations"
          title="Fleet oversight" telemetry={<dl className="console-workspace__telemetry">
            <div><dt>Active roles</dt><dd>6</dd></div></dl>}>
          <div className="gm-console__grid">
            <section className="gm-console__module cic-frame gm-arbour-vision" aria-label="Facilitator rule call">
              <h2 className="gm-console__section-title">Facilitator rule call</h2>
              <label htmlFor="prepared-rule-ambiguity">Ambiguity</label>
              <textarea id="prepared-rule-ambiguity" rows={5} defaultValue="Prepared CIC source context." />
              <label htmlFor="prepared-rule-source">Source</label>
              <textarea id="prepared-rule-source" rows={5} defaultValue="Candidate rules and current Ring state." />
              <label htmlFor="prepared-rule-decision">Decision</label>
              <textarea id="prepared-rule-decision" rows={5} defaultValue="Preserve committed Ring repair and passage choices." />
              <label htmlFor="prepared-rule-audience">Audience</label>
              <select id="prepared-rule-audience" defaultValue="gm-only">
                <option value="gm-only">Facilitator only</option></select>
              <button className="gm-census-note__save cic-action-button" type="button" disabled>Record rule call</button>
              <p className="gm-player-roster__note" role="status">No facilitator rule call recorded yet.</p>
            </section>
            {candidate}
          </div>
        </RoleConsoleTemplate>
      </section>
    </main>;
    root.render(<React.StrictMode>{repairedRing?composed:candidate}</React.StrictMode>);
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
          export const selectCandidateEdition=noMutation;
          export async function readCandidateWorkspace(groupId){
            const state=globalThis.__pc10PreparedKeyboard.store.getState();
            const instanceId=state.gmInstance?.id;
            const response=await fetch('/${PROJECT}/us-central1/readCandidateWorkspace',{
              method:'POST',headers:{'content-type':'application/json'},
              body:JSON.stringify({data:{sessionId:state.session.id,expectedGroupId:groupId,...(instanceId?{instanceId}:{})}})});
            if(!response.ok)throw new Error('Prepared source read failed');
            return (await response.json()).result;
          }`, loader: 'js' }));
    } }] });
  const js = result.outputFiles.find(file => file.path.endsWith('.js'))?.text;
  const css = result.outputFiles.find(file => file.path.endsWith('.css'))?.text;
  assert.ok(js && css, 'The unchanged component, store, projection and complete CSS must bundle.');
  return { js, css };
}

for (const { surroundingCount, refreshBetweenTabs, mode = 'research-choice' } of [
  { surroundingCount: 0, refreshBetweenTabs: false },
  { surroundingCount: 39, refreshBetweenTabs: false },
  { surroundingCount: 39, refreshBetweenTabs: true },
  { surroundingCount: 0, refreshBetweenTabs: false, mode: 'repaired-ring' },
]) {
  const stage = mode === 'repaired-ring' ? 'repaired' : 'research-choice';
  const testName = mode === 'repaired-ring'
    ? 'composed GM CIC repaired Ring captures bind the six-ship source after native Tab traversal'
    : `unchanged source panel native Tabs reach all targets with ${surroundingCount} surrounding fixture controls${refreshBetweenTabs ? ' and same-authority store refresh' : ''}`;
  test(testName, async () => {
    const base = process.env.PC10_CANDIDATE_KEYBOARD_EVIDENCE ?? await mkdtemp(resolve(tmpdir(), 'pc10-keyboard-component-'));
    const directory = resolve(base, mode === 'repaired-ring' ? 'prepared-repaired-ring' :
      `prepared-surrounding-${surroundingCount}${refreshBetweenTabs ? '-refresh' : ''}`);
    await mkdir(directory, { recursive: true });
    const bundle = await bundleSource({ mode });
    const expectedRead = { data: { sessionId: SID, expectedGroupId: GROUP,
      ...(mode === 'repaired-ring' ? { instanceId: GM_INSTANCE_ID } : {}) } };
    const posted = [], traffic = [], errors = [], observations = [], refreshObservations = [];
    let server, browser, origin, report, page, actualPanel, surface;
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
            assert.deepEqual(payload, expectedRead);
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
      page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      // The prepared report is produced by the actual source projector in the
      // same browser bundle. Initial source reads wait for this read-only value.
      let releaseReport;
      const reportReady = new Promise(resolveReport => { releaseReport = resolveReport; });
      const initialRequests = new Set();
      await page.route(`**/${PROJECT}/us-central1/readCandidateWorkspace`, async route => {
        const payload = route.request().postDataJSON();
        assert.deepEqual(payload, expectedRead);
        if (!report) { initialRequests.add(route.request()); await reportReady; }
        return route.continue();
      });
      await page.goto(origin);
      report = await page.evaluate(() => globalThis.__pc10PreparedKeyboard.report);
      releaseReport();
      await page.getByRole('heading', { name: 'Ancient Jump Ring', exact: true }).waitFor();
      let viewport = { width: 1440, height: 900 }, presses = 0, pendingTab = false;
      actualPanel = page.getByRole('region', { name: 'Candidate preparation and actions', exact: true });
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
      surface = { page: fixturePage, storeModuleUrl: () => `${origin}/prepared-store.js`,
        observe: () => page.evaluate(({ uid, sid, roleId, gm }) => {
          const state = globalThis.__pc10PreparedKeyboard.store.getState();
          return { hasAuth: true, sameActor: state.me.uid === uid && state.me.sessionId === sid,
            uidHash: state.me.uid === uid ? 'prepared-original-hash' : 'prepared-foreign-hash', sessionId: state.session.id,
            playerRole: state.me.role, profileRoleId: roleId, assignedRoleId: state.me.assignedRoleId,
            activeConsoleRoleId: state.me.activeConsoleRoleId, instanceId: gm ? state.gmInstance?.id ?? null : null,
            instanceClaimedAt: gm ? state.gmInstance?.claimedAt ?? null : null,
            gmInstanceOwned: gm && state.gmInstance?.uid === state.me.uid && state.gmInstance?.sessionId === sid,
            connection: state.connection, freshness: state.sessionSnapshotFreshness };
        }, { uid: mode === 'repaired-ring' ? GM_UID : UID, sid: SID,
          roleId: mode === 'repaired-ring' ? GM_ROLE : ROLE, gm: mode === 'repaired-ring' }) };
      const tools = candidateGameplayTools({ gm: surface, crew: surface, directory,
        initial: { sessionId: SID, joinCode: 'PREPARED' },
        roster: [{ roleId: mode === 'repaired-ring' ? GM_ROLE : ROLE, uidHash: 'prepared-original-hash' }], projectId: PROJECT,
        ports: { functions: server.address().port } });
      await tools.candidateGeometry(surface, 'N', stage, { evidenceScope: mode === 'repaired-ring'
        ? 'Prepared unchanged component, CSS, store and candidate projector only.' : undefined });
      const geometries = JSON.parse(await readFile(resolve(directory, `N-${stage}-geometry.json`), 'utf8'));
      if (mode === 'repaired-ring') {
        assert.equal(report.paths[0].repaired, true);
        assert.deepEqual(report.paths[0].ships.map(ship => ship.shipId),
          ['aegis', 'dione', 'icebreaker', 'quellon', 'refinery-124', 'shepherd']);
        assert.ok(report.paths[0].ships.some(ship => ship.shipId === 'aegis' && ship.canAct));
        for (const geometry of geometries) {
          assert.equal(geometry.readiness.state, 'ready');
          assert.equal(geometry.readiness.actingShipId, 'aegis');
          assert.equal(geometry.readiness.repaired, true);
          assert.equal(geometry.keyboardFocusReached, true);
          assert.ok(geometry.keyboardTraversal.intendedTargetCount > 0);
          assert.equal(geometry.keyboardTraversal.allEnabledTargetsReached, true);
        }
        const presentationPath = resolve(directory, 'N-repaired-presentation-geometry.json');
        let presentation;
        try { presentation = JSON.parse(await readFile(presentationPath, 'utf8')); }
        catch { assert.fail('The repaired Ring path needs post-Tab path and focused-control screenshots with contemporaneous geometry.'); }
        const cdp = await context.newCDPSession(page);
        try {
          await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
          const { root: documentNode } = await cdp.send('DOM.getDocument');
          const paintedFonts = {};
          for (const [name, selector] of [
            ['title', '.candidate-preparation__path h3'],
            ['status', '.candidate-preparation__path p:nth-of-type(2)'],
            ['action', '.candidate-preparation__path button'],
          ]) {
            const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: documentNode.nodeId, selector });
            assert.ok(nodeId > 0, `The visible prepared ${name} node must be addressable by Chrome DevTools.`);
            const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
            paintedFonts[name] = fonts.map(({ familyName, postScriptName, isCustomFont, glyphCount }) =>
              ({ familyName, postScriptName, isCustomFont, glyphCount }));
            assert.ok(paintedFonts[name].some(font => font.glyphCount > 0),
              `Chrome must report the actual painted font for prepared ${name} text.`);
          }
          presentation.environment.paintedFonts = { source: 'CDP CSS.getPlatformFontsForNode', nodes: paintedFonts };
          await writeFile(presentationPath, `${JSON.stringify(presentation, null, 2)}\n`);
        } finally { await cdp.detach(); }
        assert.equal(presentation.scope, 'Prepared unchanged component, CSS, store and candidate projector only.');
        assert.equal(presentation.captures.length, 6);
        for (const geometry of presentation.captures) {
          assert.equal(geometry.readiness.state, 'ready');
          assert.equal(geometry.title, 'Ancient Jump Ring');
          assert.equal(geometry.titleGeometry.intersectsViewport, true);
          assert.match(geometry.statusText, /Engineering Shuttle committed.*Ring repaired/);
          assert.equal(geometry.statusGeometry.intersectsViewport, true);
          assert.equal(geometry.action.name, 'Cross Ring // aegis // five fuel');
          assert.equal(geometry.action.disabled, false);
          assert.equal(geometry.action.intersectsViewport, true);
          assert.ok(geometry.action.typography.fontSize);
          assert.ok(geometry.action.typography.lineHeight);
          assert.ok(geometry.action.typography.fontFamily);
          const screenshot = await readFile(resolve(directory, geometry.screenshot));
          assert.equal(screenshot.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
          if (geometry.kind === 'control-focus') {
            assert.equal(geometry.action.focused, true);
            assert.equal(geometry.action.focusVisible, true);
          }
        }
        assert.deepEqual(presentation.captures.map(value => [value.kind, value.width, value.height]), [
          ['path-focus', 320, 844], ['control-focus', 320, 844],
          ['path-focus', 844, 390], ['control-focus', 844, 390],
          ['path-focus', 1440, 900], ['control-focus', 1440, 900],
        ]);
      } else for (const geometry of geometries) {
        assert.equal(geometry.keyboardTraversal.intendedTargetCount, 8);
        assert.equal(geometry.keyboardTraversal.documentTabStopCount, 8 + surroundingCount);
        assert.equal(geometry.keyboardTraversal.tabPressLimit, 9 + surroundingCount);
        assert.equal(geometry.keyboardTraversal.allEnabledTargetsReached, true);
      }
      assert.equal(traffic.length, 0); assert.deepEqual(errors, []);
      assert.equal(refreshObservations.length, refreshBetweenTabs ? 3 : 0);
      assert.ok(refreshObservations.every(value => Object.values(value).every(flag => flag === true)));
      await writeFile(resolve(directory, 'prepared-native-observations.json'), `${JSON.stringify({
        scope: mode === 'repaired-ring'
          ? 'Prepared actual GM CIC composition using the released RoleConsoleTemplate, CandidatePreparationPanel, full CSS and six-ship candidate projector; zero Auth/gameplay/ending credit.'
          : 'Prepared unchanged source component/store/projector and real Chrome Tab diagnosis; zero Auth/gameplay/ending credit.',
        sourceRoot: ROOT, mode, surroundingCount, preparedReadCount: posted.length,
        initialReadCount: initialRequests.size, geometries, observations, refreshObservations,
      }, null, 2)}\n`);
    } catch (error) {
      let redScrollEvidence = null;
      if (mode === 'repaired-ring' && page && actualPanel && surface) {
        try {
          await page.setViewportSize({ width: 320, height: 844 });
          const captureScrolledTarget = async (label, selector, screenshotName) => {
            const target = page.locator(selector);
            await target.scrollIntoViewIfNeeded();
            await page.evaluate(() => document.fonts?.ready ?? Promise.resolve());
            const geometry = await actualPanel.evaluate(candidateGeometrySnapshot);
            const actorBefore = await surface.observe();
            const sourceBefore = await page.evaluate(() => {
              const state = globalThis.__pc10PreparedKeyboard.store.getState();
              const path = globalThis.__pc10PreparedKeyboard.report.paths[0];
              return { uid: state.me?.uid, sessionId: state.session?.id, roleId: state.me?.assignedRoleId,
                activeRoleId: state.me?.activeConsoleRoleId, phase: state.session?.phase,
                cycle: state.session?.currentTurn, sourceUpdatedAt: state.session?.updatedAt,
                identityHydrationRevision: state.identityHydrationRevision,
                instanceId: state.gmInstance?.id, gmInstanceOwned: state.gmInstance?.uid === state.me?.uid &&
                  state.gmInstance?.sessionId === state.session?.id,
                pathCode: path?.code, pathRepaired: path?.repaired,
                candidateRevision: path?.candidateRevision ?? globalThis.__pc10PreparedKeyboard.report.revision ?? null };
            });
            const layout = await target.evaluate(node => {
              const chain = [];
              for (let current = node; current && current instanceof HTMLElement; current = current.parentElement) {
                const style = getComputedStyle(current), rect = current.getBoundingClientRect();
                chain.push({ tag: current.tagName, className: typeof current.className === 'string' ? current.className : '',
                  scrollTop: current.scrollTop, scrollHeight: current.scrollHeight, clientHeight: current.clientHeight,
                  overflowY: style.overflowY, top: rect.top, bottom: rect.bottom, height: rect.height });
              }
              return chain;
            });
            const screenshot = resolve(directory, screenshotName);
            await page.screenshot({ path: screenshot });
            const actorAfter = await surface.observe();
            const sourceAfter = await page.evaluate(() => {
              const state = globalThis.__pc10PreparedKeyboard.store.getState();
              const path = globalThis.__pc10PreparedKeyboard.report.paths[0];
              return { uid: state.me?.uid, sessionId: state.session?.id, roleId: state.me?.assignedRoleId,
                activeRoleId: state.me?.activeConsoleRoleId, phase: state.session?.phase,
                cycle: state.session?.currentTurn, sourceUpdatedAt: state.session?.updatedAt,
                identityHydrationRevision: state.identityHydrationRevision,
                instanceId: state.gmInstance?.id, gmInstanceOwned: state.gmInstance?.uid === state.me?.uid &&
                  state.gmInstance?.sessionId === state.session?.id,
                pathCode: path?.code, pathRepaired: path?.repaired,
                candidateRevision: path?.candidateRevision ?? globalThis.__pc10PreparedKeyboard.report.revision ?? null };
            });
            return { label, viewport: page.viewportSize(), actorBefore, actorAfter,
              sourceBefore, sourceAfter, actorStable: JSON.stringify(actorBefore) === JSON.stringify(actorAfter),
              sourceStable: JSON.stringify(sourceBefore) === JSON.stringify(sourceAfter),
              titleGeometry: geometry.ringPathPresentation[0]?.titleGeometry,
              statusGeometry: geometry.ringPathPresentation[0]?.statusGeometry,
              action: geometry.ringPathPresentation[0]?.action,
              gapFromTitleToStatus: geometry.ringPathPresentation[0]?.statusGeometry?.top -
                geometry.ringPathPresentation[0]?.titleGeometry?.bottom,
              layout, screenshot: screenshotName };
          };
          redScrollEvidence = {
            scope: 'Test-only first RED from a prepared actual GM CIC composition; actual RoleConsoleTemplate, CandidatePreparationPanel, complete CSS and six-ship projector. No native, Auth, emulator or gameplay credit.',
            failure: error.message,
            captures: [
              await captureScrolledTarget('status-focused', '.candidate-preparation__path p:nth-of-type(2)',
                'N-repaired-status-scroll-red-320x844.png'),
              await captureScrolledTarget('heading-focused', '.candidate-preparation__path h3',
                'N-repaired-heading-scroll-red-320x844.png'),
              await captureScrolledTarget('passage-control-focused', '.candidate-preparation__path button',
                'N-repaired-action-scroll-red-320x844.png'),
            ],
          };
        } catch (captureError) {
          redScrollEvidence = { scope: 'Test-only first RED diagnostic attempt; no gameplay credit.',
            failure: error.message, diagnosticCaptureFailure: captureError.message, captures: [] };
        }
        await writeFile(resolve(directory, 'composed-ring-red-scroll-geometry.json'),
          `${JSON.stringify(redScrollEvidence, null, 2)}\n`);
      }
      await writeFile(resolve(directory, 'prepared-native-failure.json'), `${JSON.stringify({
        scope: 'Prepared-only failure, never actual gameplay credit.', error: error.message,
        mode, surroundingCount, observations, errors, externalRequestCount: traffic.length, redScrollEvidence,
      }, null, 2)}\n`);
      throw error;
    } finally {
      const ownedProcessIds = { nodeTestRunner: process.pid, chromeBrowser: browser?.process()?.pid ?? null,
        ephemeralServerOwner: process.pid, ephemeralServerPort: server?.address()?.port ?? null };
      if (browser) await browser.close();
      if (server?.listening) await new Promise((resolveClosed, reject) => server.close(error => error ? reject(error) : resolveClosed()));
      const sourceFiles = ['src/components/CandidatePreparationPanel.tsx', 'src/components/CandidatePreparationPanel.css',
        'src/components/RoleConsoleTemplate.tsx', 'src/routes/GmConsole.tsx',
        'src/store/useSessionStore.ts', 'functions/src/candidatePaths.ts', 'functions/src/endeavourResearch.ts',
        'src/index.css', 'scripts/pc10-candidate-manual-ui-proof.mjs', 'scripts/pc10-candidate-manual-ui-geometry.mjs'];
      const bindings = await Promise.all(sourceFiles.map(async path => ({ path,
        sha256: createHash('sha256').update(await readFile(resolve(ROOT, path))).digest('hex') })));
      await writeFile(resolve(directory, 'owned-resource-close.json'), `${JSON.stringify({
        browserClosed: !browser?.isConnected(), serverClosed: !server?.listening,
        ownedProcessIds, sharedFirebaseOrRootRuntimeTouched: false, sourceBindings: bindings,
      }, null, 2)}\n`);
    }
  });
}
