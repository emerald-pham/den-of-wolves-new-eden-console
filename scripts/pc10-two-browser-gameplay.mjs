import { observeUiReceipt } from './pc10-browser-ui-receipt.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { candidateEvidenceEnvelope, waitForMaintenanceReceipt } from './pc10-candidate-proof-helpers.mjs';

function hasExactKeys(value, expected) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
}

/** Native-test seam for the safe browser-to-Node Firestore read envelope. */
export function unwrapBrowserFirestoreReadOutcome(outcome) {
  if (hasExactKeys(outcome, ['status', 'value']) && outcome.status === 'ok') return outcome.value;
  if (hasExactKeys(outcome, ['status', 'code']) && outcome.status === 'error' &&
      (outcome.code === null || (typeof outcome.code === 'string' && outcome.code.length <= 128))) {
    const error = new Error('Authenticated browser Firestore read failed.');
    if (typeof outcome.code === 'string') Object.defineProperty(error, 'code', { value: outcome.code });
    throw error;
  }
  throw new Error('Authenticated browser Firestore read returned an invalid result.');
}

/** Compose genuine UI-selected crew accounts; no token, Admin write or store setter. */
export function createTwoBrowserGameplay(context) {
  const { gm, crew, initial, roster, directory } = context;
  assert.ok(initial.sessionId && initial.joinCode && roster.length);
  const actions = [], snapshots = [];
  const hash = value => createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
  async function live(surface, deadlineAt = Date.now() + 60_000) {
    return surface.until('The current normally admitted actor is live', state =>
      state.sameActor && state.sessionId === initial.sessionId && state.connection === 'live' &&
      state.freshness === 'server' && (surface !== gm || state.gmInstanceOwned), Math.max(1, Math.min(60_000, deadlineAt - Date.now())));
  }
  async function state(surface = gm) {
    return surface.page.evaluate(async moduleUrl => {
      const { useSessionStore } = await import(moduleUrl);
      const s = useSessionStore.getState();
      const session = s.session;
      return { sessionId: session?.id, cycle: session?.currentTurn, phase: session?.phase,
        turnLimit: session?.turnLimit, turnPhase: session?.turnPhase,
        fullGameDemo: session?.fullGameDemo, shipResources: session?.shipResources,
        shipDamage: session?.shipDamage, shipSurvivors: session?.shipSurvivors,
        activeVesselIds: session?.activeVesselIds, maintenanceCycles: session?.maintenanceCycles,
        shuttleDockings: session?.shuttleDockings, shuttleFuelled: session?.shuttleFuelled,
        shuttleControl: session?.shuttleControl, shipGalacticCoordinates: session?.shipGalacticCoordinates,
        organiserSites: session?.organiserSites, setupRevision: session?.setupRevision,
        chartId: session?.chartId, turnState: session?.turnState,
        shipFleetGroupIds: session?.shipFleetGroupIds,
        vesselActionRevisions: session?.vesselActionRevisions, gameOutcome: session?.gameOutcome,
        debriefSnapshot: session?.debriefSnapshot,
        player: { role: s.me?.role, assignedRoleId: s.me?.assignedRoleId,
          activeConsoleRoleId: s.me?.activeConsoleRoleId, replacementRoleId: s.me?.replacementRoleId },
        live: s.connection === 'live' && s.sessionSnapshotFreshness === 'server' };
    }, surface.storeModuleUrl());
  }
  async function shipState(shipId, surface = gm) {
    return surface.page.evaluate(async ({ moduleUrl, shipId }) => {
      const { useSessionStore } = await import(moduleUrl);
      const { projectShipState } = await import('/src/lib/shipStateProjection.ts');
      const snapshot = useSessionStore.getState();
      return { sessionId: snapshot.session?.id,
        live: snapshot.connection === 'live' && snapshot.sessionSnapshotFreshness === 'server',
        shipProjection: snapshot.session ? projectShipState(snapshot.session, shipId) : null };
    }, { moduleUrl: surface.storeModuleUrl(), shipId });
  }
  async function select(roleId, { enter = true, deadlineAt = Date.now() + 60_000 } = {}) {
    const navigationTimeout = () => Math.max(1, Math.min(35_000, deadlineAt - Date.now()));
    if (roleId === 'gm') { await live(gm, deadlineAt); return gm; }
    const actor = roster.find(value => value.roleId === roleId);
    assert.ok(actor, `${roleId} must be a genuinely admitted account in this fresh roster.`);
    const current = await crew.observe();
    if (current.profileRoleId !== roleId) {
      const url = new URL(crew.page.url());
      url.search = '';
      url.searchParams.set('demoActor', `${initial.sessionId}~${roleId}`);
      url.searchParams.set('demoJoin', initial.joinCode);
      url.hash = '/demo-actors';
      await crew.page.goto(url.href, { timeout: navigationTimeout() });
    }
    const actual = await live(crew, deadlineAt);
    assert.equal(actual.profileRoleId, roleId);
    assert.equal(actual.uidHash, actor.uidHash, 'Select the original role account, never manufacture another identity.');
    const onRoleRoute = () => {
      const path = new URL(crew.page.url()).hash;
      return roleId === 'press-officer' ? path === '#/press'
        : /^#\/(?:ships\/[^/]+|union)\/roles\//.test(path) && path.endsWith(`/roles/${roleId}`);
    };
    async function originalAccount() {
      assert.ok(Date.now() < deadlineAt, 'Original role navigation deadline expired.');
      const current = await crew.observe();
      assert.equal(current.uidHash, actor.uidHash); assert.equal(current.profileRoleId, roleId);
      assert.equal(current.sessionId, initial.sessionId); assert.equal(current.hasAuth, true); assert.equal(current.sameActor, true);
    }
    if (enter && (actual.activeConsoleRoleId !== roleId || !onRoleRoute())) {
      for (let hop = 0; hop < 4 && !onRoleRoute(); hop++) {
        await originalAccount();
        const path = new URL(crew.page.url()).hash;
        let link;
        if (path === '#/demo-actors') link = crew.page.getByRole('link', { name: "Enter this actor's stations", exact: true });
        else if (path === '#/brief') link = crew.page.getByRole('link', { name: 'Back to stations', exact: true });
        else if (path.startsWith('#/shuttles/')) link = crew.page.getByRole('link', { name: /^Back to / }).first();
        else if (path === '#/console' || /^#\/ships\/[^/]+\/roles$/.test(path)) {
          link = roleId === 'press-officer' ? crew.page.getByRole('link', { name: 'Press Officer', exact: true })
            : crew.page.locator(`a[href$="/roles/${roleId}"]`);
          if (path !== '#/console' && !(await link.isVisible())) link = crew.page.getByRole('link', { name: 'Back to fleet', exact: true });
        } else link = crew.page.getByRole('link', { name: /^(?:Back to (?:stations|role selection)|View ship consoles|Change role|Leave ship)$/ }).first();
        await link.waitFor({ state: 'visible', timeout: navigationTimeout() });
        await originalAccount(); await link.click();
        await crew.page.waitForURL(url => url.hash !== path, { timeout: navigationTimeout() });
        await originalAccount();
      }
      assert.ok(onRoleRoute(), 'Normal Back and chooser navigation must reach the original role console.');
      await crew.until(`The actual ${roleId} console is held`, value =>
        value.activeConsoleRoleId === roleId && value.uidHash === actor.uidHash && value.profileRoleId === roleId &&
        value.sessionId === initial.sessionId && value.sameActor && value.connection === 'live' && value.freshness === 'server',
      Math.max(1, deadlineAt - Date.now()));
      await originalAccount();
    }
    return crew;
  }
  async function command(roleId, name, fields = {}, { instance = roleId === 'gm' } = {}) {
    const surface = await select(roleId);
    const observed = await live(surface);
    const payload = { sessionId: initial.sessionId,
      ...(instance ? { instanceId: observed.instanceId } : {}), ...fields };
    const startedAt = new Date().toISOString();
    const reply = await surface.callable(name, payload);
    actions.push({ roleId, name, startedAt, completedAt: new Date().toISOString(),
      transport: 'real browser Firebase SDK in the currently selected account',
      status: reply.status, code: reply.code, requestFingerprint: hash(payload),
      resultStatus: reply.result?.status });
    assert.equal(reply.status, 'committed', `${roleId}/${name}: ${reply.code ?? ''} ${reply.message ?? ''}`);
    return reply.result;
  }
  async function read(roleId, suffix, { collection = false } = {}) {
    const surface = await select(roleId, { enter: false });
    await live(surface);
    const outcome = await surface.page.evaluate(async ({ sid, suffix, collection }) => {
      try {
        const source = await (await fetch('/src/lib/firestore.ts')).text();
        const match = source.match(/from\s+["']([^"']*firebase_firestore\.js[^"']*)["']/);
        if (!match) throw new Error('Read the actual current browser SDK import before the entitled read.');
        const sdk = await import(match[1]);
        const { db } = await import('/src/lib/firestore.ts');
        const path = `sessions/${sid}/${suffix}`;
        const value = collection
          ? (await sdk.getDocs(sdk.collection(db(), path))).docs.map(document =>
            ({ id: document.id, ...document.data() }))
          : await sdk.getDoc(sdk.doc(db(), path)).then(document =>
            document.exists() ? { id: document.id, ...document.data() } : null);
        return { status: 'ok', value };
      } catch (error) {
        return { status: 'error', code: typeof error?.code === 'string' ? error.code : null };
      }
    }, { sid: initial.sessionId, suffix, collection });
    return unwrapBrowserFirestoreReadOutcome(outcome);
  }
  async function readCurrentWolfAttackFromServer(roleId, suffix, { deadlineAt, onSnapshot, collection = false }) {
    assert.ok(roleId === 'gm' && suffix === 'wolfAttackState/current' && collection === false,
      'Server-only combat reinspection uses only the entitled GM original attack document.');
    const budget = () => assert.ok(Number.isFinite(deadlineAt) && Date.now() < deadlineAt,
      'The original combat source reinspection deadline expired.');
    budget();
    const surface = await select('gm', { enter: false, deadlineAt }); budget();
    await live(surface, deadlineAt); budget();
    const outcome = await surface.page.evaluate(async sid => {
      try {
        const source = await (await fetch('/src/lib/firestore.ts')).text();
        const match = source.match(/from\s+["']([^"']*firebase_firestore\.js[^"']*)["']/);
        if (!match) throw new Error('Read the actual current browser SDK import before the entitled read.');
        const sdk = await import(match[1]);
        const { db } = await import('/src/lib/firestore.ts');
        const document = await sdk.getDocFromServer(sdk.doc(db(), `sessions/${sid}/wolfAttackState/current`));
        return { status: 'ok', value: document.exists() ? { id: document.id, ...document.data() } : null,
          metadata: { fromCache: document.metadata?.fromCache ?? null,
            hasPendingWrites: document.metadata?.hasPendingWrites ?? null } };
      } catch (error) {
        return { status: 'error', code: typeof error?.code === 'string' ? error.code : null };
      }
    }, initial.sessionId);
    // Retain only the already completed read. Its observer does not authorize
    // a cache fallback, a second read, or acceptance of a pending local write.
    await onSnapshot?.(outcome); budget();
    if (outcome?.status === 'ok') {
      assert.ok(hasExactKeys(outcome, ['status', 'value', 'metadata']) &&
        hasExactKeys(outcome.metadata, ['fromCache', 'hasPendingWrites']) &&
        outcome.metadata.fromCache === false && outcome.metadata.hasPendingWrites === false,
      'The original combat reinspection requires a server snapshot without pending local writes.');
      return unwrapBrowserFirestoreReadOutcome({ status: 'ok', value: outcome.value });
    }
    return unwrapBrowserFirestoreReadOutcome(outcome);
  }
  async function ui(roleId, description, decision) {
    const surface = await select(roleId);
    await live(surface);
    await decision(surface.page);
    actions.push({ roleId, description, transport: 'actual connected UI control',
      at: new Date().toISOString(), path: new URL(surface.page.url()).hash });
  }
  async function maintenanceUi(shipId, roleId, { consoles = ['Jump Drive'], refuels = {}, afterBegin, afterRiot } = {}) {
    const surface = await select(roleId);
    const maintenancePage = surface.page.getByRole('button', { name: 'Maintenance', exact: true });
    const panel = surface.page.getByRole('region', { name: / maintenance cycle$/i }).first();
    await maintenancePage.or(panel).first().waitFor();
    if (!(await panel.isVisible()) && await maintenancePage.isVisible()) await maintenancePage.click();
    await panel.waitFor();
    const before = await state();
    const originalActor = await surface.observe();
    assert.equal(before.turnPhase.airspace.state, 'restricted');
    async function execute(button) {
      const response = await observeUiReceipt({
        waitForResponse: () => surface.page.waitForResponse(response => response.request().method() === 'POST' &&
          new URL(response.url()).pathname.endsWith('/us-central1/runMaintenance')),
        choose: () => button.click(),
      });
      const body = await response.json();
      const request = response.request().postDataJSON()?.data;
      const entry = { roleId, shipId, endpoint: 'runMaintenance', cycle: before.cycle,
        action: request?.action, expectedRevision: request?.expectedRevision,
        requestFingerprint: hash(request), resultFingerprint: hash(body.result),
        httpStatus: response.status(), status: body.result?.status,
        revision: body.result?.cycle?.revision, returnedStep: body.result?.cycle?.step,
        uidHash: originalActor.uidHash, synchronization: 'pending',
        transport: 'captured actual connected UI request and unmodified server reply' };
      actions.push(entry);
      await save('maintenance-ui-progress.json');
      assert.equal(response.status(), 200, `Real ${shipId} maintenance: ${JSON.stringify(body)}`);
      assert.equal(body.result?.status, 'committed');
      const revision = body.result.cycle.revision;
      await waitForMaintenanceReceipt({ shipId, cycle: before.cycle, revision, expectedActor: originalActor,
        expectedMaintenance: body.result.cycle,
        inspectGm: () => shipState(shipId), inspectCrew: () => shipState(shipId, surface), inspectActor: () => surface.observe(),
        inspectRendered: () => panel.evaluate(element => {
          const current = [...element.querySelectorAll('ol[aria-label$=" maintenance sequence"] li[aria-current="step"]')];
          return { currentStep: current.length === 0 ? null : current.length === 1
            ? Number(current[0].querySelector('.maintenance-systems__step > span')?.textContent) : 'ambiguous',
          endEnabled: [...element.querySelectorAll('button')].some(button =>
            button.textContent?.trim() === 'End maintenance cycle' && !button.disabled),
          results: [...element.querySelectorAll('[role="status"]')].map(status => status.textContent ?? '') };
        }) });
      entry.synchronization = 'original crew and GM ship projections plus rendered step/results matched';
      await save('maintenance-ui-progress.json');
      console.log(JSON.stringify({ maintenanceStage: 'actual normal UI committed', roleId, shipId,
        cycle: before.cycle, action: request?.action, revision }));
    }
    await panel.getByRole('button', { name: `Begin Maintenance Cycle: Cycle ${before.cycle}`, exact: true }).click();
    await execute(panel.getByRole('button', { name: 'ARE YOU SURE?', exact: true }));
    await afterBegin?.();
    await execute(panel.getByRole('button', { name: 'Check storage', exact: true }));
    for (const [label, resource] of [['Food', 'food'], ['Water', 'water']]) {
      const options = await panel.getByLabel(`${label} ration level`, { exact: true }).locator('option').evaluateAll(nodes =>
        nodes.map(node => ({ value: node.value, cost: Number(node.textContent.split('//')[1]?.trim()) })));
      const liveStores = (await state()).shipResources[shipId][resource];
      const affordable = options.filter(option => Number.isFinite(option.cost) && option.cost <= liveStores).at(-1);
      assert.ok(affordable, 'Use a ration choice actually displayed and affordable in this live game.');
      await panel.getByLabel(`${label} ration level`, { exact: true }).selectOption(affordable.value);
    }
    await execute(panel.getByRole('button', { name: 'Proceed with rations', exact: true }));
    await execute(panel.getByRole('button', { name: 'Run unrest check', exact: true }));
    await execute(panel.getByRole('button', { name: 'Run riot check', exact: true }));
    await afterRiot?.();
    for (const name of consoles) await panel.getByRole('checkbox', { name: new RegExp(`^${name}(?: \\/\\/ Charged)?$`, 'i') }).check();
    await panel.getByRole('button', { name: 'Power up reactor', exact: true }).click();
    await execute(panel.getByRole('button', { name: 'ARE YOU SURE?', exact: true }));
    const production = panel.getByRole('group', { name: / production consoles$/i });
    const productionNames = await production.getByRole('button', { name: /^Run / }).allTextContents();
    for (const name of productionNames) {
      const run = production.getByRole('button', { name: name.trim(), exact: true });
      if (await run.isEnabled()) await execute(run);
      else {
        const skip = production.getByRole('button', { name: name.trim().replace(/^Run /, 'Skip '), exact: true });
        if (await skip.isEnabled()) await execute(skip);
      }
    }
    for (const [label, craftId] of Object.entries(refuels)) {
      await panel.getByLabel(`${label} refuelling`, { exact: true }).selectOption(craftId);
    }
    await execute(panel.getByRole('button', { name: 'Proceed with refuelling', exact: true }).and(surface.page.locator(':enabled')).first());
    if (shipId === 'aegis') await execute(panel.getByRole('button', { name: 'Proceed with refuelling', exact: true }).and(surface.page.locator(':enabled')).first());
    await execute(panel.getByRole('button', { name: 'End maintenance cycle', exact: true }));
    const completedDeadline = Date.now() + 60_000;
    let completed;
    while (Date.now() < completedDeadline) {
      completed = (await state()).maintenanceCycles?.[shipId];
      if (completed?.turn === before.cycle && completed.step === 0 && completed.completedAt) break;
      await delay(200);
    }
    assert.ok(completed?.turn === before.cycle && completed.step === 0 && completed.completedAt,
      `${shipId} actual maintenance must finish this cycle.`);
    const after = await state();
    snapshots.push({ description: `${shipId} actual UI maintenance`, before: before.shipResources[shipId],
      after: after.shipResources[shipId], cycle: before.cycle });
    actions.push({ roleId, name: 'runMaintenance', description: 'Begin, storage, affordable rations, unrest, riot, deliberate reactor, bays and end via UI',
      transport: 'actual connected UI control', cycle: before.cycle });
    return after.maintenanceCycles[shipId];
  }
  async function save(name = 'two-browser-gameplay-actions.json', details = {}) {
    await writeFile(`${directory}/${name}`, `${JSON.stringify(candidateEvidenceEnvelope({
      limitations: ['Explicit SDK actions are separately labeled from connected UI actions.',
        'No function or full-game acceptance follows from the adapter itself.'],
      actions, snapshots, ...details }), null, 2)}\n`);
  }
  return { context, actions, state, shipState, select, command,
    read: (roleId, suffix, options) => options?.serverOnly === true
      ? readCurrentWolfAttackFromServer(roleId, suffix, options) : read(roleId, suffix, options),
    ui, maintenanceUi, save };
}
