import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

/** Compose genuine UI-selected crew accounts; no token, Admin write or store setter. */
export function createTwoBrowserGameplay(context) {
  const { gm, crew, initial, roster, directory } = context;
  assert.ok(initial.sessionId && initial.joinCode && roster.length);
  const actions = [], snapshots = [];
  const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  async function live(surface) {
    return surface.until('The current normally admitted actor is live', state =>
      state.sameActor && state.sessionId === initial.sessionId && state.connection === 'live' &&
      state.freshness === 'server' && (surface !== gm || state.gmInstanceOwned));
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
        organiserSites: session?.organiserSites,
        shipFleetGroupIds: session?.shipFleetGroupIds,
        vesselActionRevisions: session?.vesselActionRevisions, gameOutcome: session?.gameOutcome,
        debriefSnapshot: session?.debriefSnapshot,
        player: { role: s.me?.role, assignedRoleId: s.me?.assignedRoleId,
          activeConsoleRoleId: s.me?.activeConsoleRoleId, replacementRoleId: s.me?.replacementRoleId },
        live: s.connection === 'live' && s.sessionSnapshotFreshness === 'server' };
    }, surface.storeModuleUrl());
  }
  async function select(roleId, { enter = true } = {}) {
    if (roleId === 'gm') { await live(gm); return gm; }
    const actor = roster.find(value => value.roleId === roleId);
    assert.ok(actor, `${roleId} must be a genuinely admitted account in this fresh roster.`);
    const current = await crew.observe();
    if (current.profileRoleId !== roleId) {
      const url = new URL(crew.page.url());
      url.search = '';
      url.searchParams.set('demoActor', `${initial.sessionId}~${roleId}`);
      url.searchParams.set('demoJoin', initial.joinCode);
      url.hash = '/demo-actors';
      await crew.page.goto(url.href);
    }
    const actual = await live(crew);
    assert.equal(actual.profileRoleId, roleId);
    assert.equal(actual.uidHash, actor.uidHash, 'Select the original role account, never manufacture another identity.');
    if (enter && (actual.activeConsoleRoleId !== roleId || new URL(crew.page.url()).hash === '#/demo-actors')) {
      const entry = crew.page.getByRole('link', { name: "Enter this actor's stations", exact: true });
      if (await entry.isVisible()) await entry.click();
      if (roleId === 'press-officer') {
        await crew.page.getByRole('link', { name: 'Press Officer', exact: true }).click();
      } else {
        const roleLink = crew.page.locator(`a[href$="/roles/${roleId}"]`);
        await roleLink.waitFor(); await roleLink.click();
      }
      await crew.until(`The actual ${roleId} console is held`, value =>
        value.activeConsoleRoleId === roleId && value.sameActor && value.connection === 'live' && value.freshness === 'server');
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
    return surface.page.evaluate(async ({ sid, suffix, collection }) => {
      const source = await (await fetch('/src/lib/firestore.ts')).text();
      const match = source.match(/from\s+["']([^"']*firebase_firestore\.js[^"']*)["']/);
      if (!match) throw new Error('Read the actual current browser SDK import before the entitled read.');
      const sdk = await import(match[1]);
      const { db } = await import('/src/lib/firestore.ts');
      const path = `sessions/${sid}/${suffix}`;
      if (collection) return (await sdk.getDocs(sdk.collection(db(), path))).docs.map(document =>
        ({ id: document.id, ...document.data() }));
      const document = await sdk.getDoc(sdk.doc(db(), path));
      return document.exists() ? { id: document.id, ...document.data() } : null;
    }, { sid: initial.sessionId, suffix, collection });
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
    assert.equal(before.turnPhase.airspace.state, 'restricted');
    async function execute(button) {
      const result = surface.page.waitForResponse(response => response.request().method() === 'POST' &&
        new URL(response.url()).pathname.endsWith('/us-central1/runMaintenance'));
      await button.click();
      const response = await result, body = await response.json();
      assert.equal(response.status(), 200, `Real ${shipId} maintenance: ${JSON.stringify(body)}`);
      assert.equal(body.result?.status, 'committed');
      const revision = body.result.cycle.revision;
      const request = response.request().postDataJSON()?.data;
      const deadline = Date.now() + 60_000;
      while ((await state()).maintenanceCycles?.[shipId]?.revision !== revision ||
          (await state(surface)).maintenanceCycles?.[shipId]?.revision !== revision) {
        assert.ok(Date.now() < deadline, `${shipId} GM and original crew maintenance must observe revision ${revision}`);
        await delay(200);
      }
      const actual = await surface.observe();
      actions.push({ roleId, endpoint: 'runMaintenance', cycle: before.cycle, action: request?.action,
        requestFingerprint: hash(request), resultFingerprint: hash(body.result), revision,
        uidHash: actual.uidHash, status: 'committed',
        transport: 'captured normal connected UI request and unmodified server reply; original crew and GM revision synchronized' });
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
    await writeFile(`${directory}/${name}`, `${JSON.stringify({ schemaVersion: 1,
      actualBrowserProcesses: 2, actualBrowserContexts: 2, actualHumans: 0,
      adminGameplayWrites: false, acceleratedClock: false, callableFixtures: false,
      limitations: ['Explicit SDK actions are separately labeled from connected UI actions.',
        'No function or full-game acceptance follows from the adapter itself.'],
      actions, snapshots, ...details }, null, 2)}\n`);
  }
  return { context, actions, state, select, command, read, ui, maintenanceUi, save };
}
