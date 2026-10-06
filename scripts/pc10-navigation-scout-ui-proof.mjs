import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createTwoBrowserGameplay } from './pc10-two-browser-gameplay.mjs';
import {
  NAV_SCOUT_BRANCHES, navigationScoutHash, assertNavigationScoutActor, assertNavigationScoutCensus,
  waitForNavigationScoutPaint, assertNavigationScoutCost, validateScoutBundle,
  validateScoutTaxiDelivery, classifyScoutRecovery,
  safeNavigationScoutEvidence, summarizeNavigationScoutBranches, captureNavigationScoutUiReceipt,
} from './pc10-navigation-scout-proof-contracts.mjs';

const LABELS = { starlight: 'Starlight', hummingbird: 'Hummingbird', endeavour: 'Endeavour', 'comms-officer': 'Comms Officer' };
const SCOUT_ROLES = { starlight: 'wing-commander', hummingbird: 'quellon-explorer', endeavour: 'shepherd-scientist', 'comms-officer': 'comms-officer' };
const ANCHORS = { starlight: 'aegis', hummingbird: 'quellon', endeavour: 'shepherd', 'comms-officer': 'aegis' };
const NAVIGATION = new Set(['group-navigation', 'group-message', 'known-share', 'known-jump', 'gm-move', 'partition',
  'taxi-courier', 'taxi-fuel', 'taxi-passengers', 'natural-failure', 'dradis', 'press-access']);
const SOURCES = Object.freeze([
  'scripts/pc10-full-game-demo-ui-proof.mjs', 'scripts/pc10-two-browser-gameplay.mjs',
  'scripts/pc10-navigation-scout-ui-proof.mjs', 'scripts/pc10-navigation-scout-proof-contracts.mjs',
  'scripts/pc10-browser-ui-receipt.mjs', 'src/routes/GmConsole.tsx', 'src/routes/ShipConsole.tsx',
  'src/components/FleetGroupWorkspace.tsx', 'src/components/FleetGroupPanel.tsx', 'src/lib/fleetGroupService.ts',
  'src/components/ScoutTaxiCommunicationPanel.tsx', 'src/lib/scoutTaxiCommunicationService.ts',
  'src/components/JumpDriveConsole.tsx', 'src/components/JumpFailureAdjudicationPanel.tsx',
  'src/components/GmStarmapModule.tsx', 'src/components/DradisEffectControls.tsx',
  'src/components/AirspaceControl.tsx', 'src/lib/airspaceService.ts', 'src/lib/sessionService.ts',
  'src/components/ScoutRequestControls.tsx', 'src/components/ScoutReportController.tsx',
  'src/components/GmScoutRevealController.tsx', 'src/lib/scoutRequestService.ts', 'src/lib/scoutResultService.ts',
  'src/components/CandidatePreparationPanel.tsx', 'src/lib/candidateService.ts', 'functions/src/index.ts',
  'src/routes/ReplacementRoleWorkspace.tsx', 'src/routes/SessionMode.tsx', 'src/data/replacementRoles.ts',
  'functions/src/starChartGraph.ts', 'functions/src/scoutRequestCadence.ts', 'functions/src/scoutResultCallable.ts',
  'src/lib/sessionMutationAuthority.ts', 'src/lib/sessionSnapshotAuthority.ts',
]);

/** Prerequisites are caller choices and genuine current source state, never injected setup. */
export const NAVIGATION_SCOUT_PREREQUISITES = Object.freeze({
  navigation: 'Original current-group actors; actual scanned knowledge; ordinary charged/fuelled Jump Drive in Coordination.',
  separatedTaxi: 'A real GM movement or paid jump and confirmed server partition; original home-shuttle holder; printed range and current cadence.',
  taxiCadence: 'Courier, fuel and passengers each use one attempt. Compose different eligible shuttles or actual later cycles; no helper phase advances.',
  scout: 'Original Wing/Explorer/Scientist or genuinely assigned Comms replacement; actual printed GM chart coordinate; lifted airspace and source craft requirements.',
  naturalFailure: 'An actual server-produced current unresolved failed-jump pointer. No damage, failure or die value is created by this packet.',
  gmRecovery: 'A real committed scout request still pending and its visible recovery button. Automatic resolution is not GM recovery credit.',
  press: 'Original Admiral, restricted Team airspace, Press enabled and actual Systems control.',
  ending: 'Caller owns all paid maintenance, ordinary GM phase changes and a genuine terminal source branch.',
});

/**
 * Additive fresh-runner composition. onSetup observes mounted prestart readers.
 * onStarted binds the confirmed ordinary Auth census; it makes no game mutation.
 * runNavigation accepts ordered {branch,roleId,...intent} steps. runScoutReaders
 * accepts {roleId,entitlementId,coordinate?,branches?,foreignRoleId?}; absent
 * coordinate means choose the first actually printed GM map button, not a fact.
 * No phases, inventory grants, setup writes or initial SDK mutations are hidden here.
 */
export function createNavigationScoutProof(initialContext, { requiredBranches = [] } = {}) {
  summarizeNavigationScoutBranches([], []);
  assert.ok(requiredBranches.every(branch => NAV_SCOUT_BRANCHES.includes(branch)), 'Unknown required branch.');
  assert.equal(new Set(requiredBranches).size, requiredBranches.length, 'Duplicate required branches.');
  const rows = [], sourceBindings = {}, scoutRecords = new Map();
  let context = initialContext, gameplay, bound = false, stageEnd, runEnd;
  let prestartListener, prestartSurface, prestartReaderRequests = 0;
  let prestartStartRequested = false, invalidPrestartStart = false;
  const remaining = () => {
    const ms = Math.min(60_000, (stageEnd ?? Date.now() + 60_000) - Date.now(), (runEnd ?? Date.now() + 480_000) - Date.now());
    assert.ok(ms > 0, 'Original source procedure budget expired; no extension or mutation retry.');
    return ms;
  };
  const stage = () => { stageEnd = Math.min(Date.now() + 60_000, runEnd ?? Infinity); };
  const add = input => { const row = safeNavigationScoutEvidence(input); rows.push(row); return row; };
  async function save(name = 'navigation-scout-proof-progress.json') {
    assert.ok(context?.directory, 'Provide the runner evidence directory explicitly.');
    assert.ok(/^[a-z0-9][a-z0-9.-]*\.json$/.test(name), 'Evidence filename must stay inside the explicit directory.');
    const packet = { schema: 'pc10-navigation-scout-proof-v1', actualAcceptance: false,
      limitations: ['Native contracts and this driver confer zero runtime, capacity, closure or full-game acceptance.',
        'All initial mutations use mounted controls; exact receipt recovery and read/privacy supplements are labeled.',
        'GM movement and facilitator rulings are explicit virtual-training choices.',
        'A missing natural failure or automatically completed scout request leaves that conditional branch uncredited.',
        'Prestart query observation ends at the captured ordinary GM start request; active readers may mount before onStarted.',
        'The ordinary roster contains independent Auth identities; it does not establish physical human attendance.',
        'Mission discard, research, ECM and detector procedures are outside this packet.'],
      sourceBindings, roster: context.roster?.map(actor => ({ roleId: actor.roleId, uidHash: actor.uidHash })), rows };
    await writeFile(`${context.directory}/${name}`, `${JSON.stringify(packet, null, 2)}\n`);
    return packet;
  }
  async function pending(branch, reason, roleId, actor) {
    add({ branch, status: 'pending', reason, roleId, actor, nextActor: 'caller' }); await save();
    assert.ok(!requiredBranches.includes(branch), `Required ${branch} is blocked/uncredited: ${reason}.`);
    return null;
  }
  async function actor(surface) {
    const observed = await surface.observe();
    const local = await surface.page.evaluate(async moduleUrl => {
      const { useSessionStore } = await import(moduleUrl);
      const { findConsoleRole } = await import('/src/data/roles.ts');
      const s = useSessionStore.getState(), me = s.me, session = s.session;
      const { captureSessionAuthority } = await import('/src/lib/sessionMutationAuthority.ts');
      const checkpoint = session?.id ? captureSessionAuthority(session.id, me?.uid) : undefined;
      const { replacementRoleFor } = await import('/src/data/replacementRoles.ts');
      const shipId = me?.replacementRoleId ? replacementRoleFor(me.replacementRoleId)?.vesselId ?? null
        : me?.assignedRoleId ? findConsoleRole(me.assignedRoleId)?.shipId ?? null : null;
      return { uid: me?.uid ?? null, groupId: me?.fleetGroupId ?? null, generation: me?.connectionGeneration ?? null,
        seatId: me?.seatId ?? null, replacementRoleId: me?.replacementRoleId ?? null, replacementStatus: me?.replacementStatus ?? null,
        instanceClaimedAt: s.gmInstance?.claimedAt ?? null, shipId,
        navigationRevision: me?.role === 'gm' ? session?.gmNavigationRevision : session?.playerDiscovery?.revision,
        fleetPartitionRevision: session?.fleetPartitionRevision ?? 0,
        vesselRevisions: session?.vesselActionRevisions ?? {},
        controlRevisions: Object.fromEntries(Object.entries(session?.shuttleControl ?? {}).map(([id, control]) => [id, control.revision])),
        knownCoordinates: session?.playerDiscovery?.knownCoordinates ?? [],
        localShipIds: Object.entries(session?.shipFleetGroupIds ?? {}).filter(([, group]) => group === me?.fleetGroupId).map(([id]) => id),
        shipGroups: session?.shipFleetGroupIds ?? {}, cursor: checkpoint ? { version: checkpoint.version,
          serverCursor: checkpoint.authority.latestServerAuthorityCursor ?? null } : null,
      };
    }, surface.storeModuleUrl());
    return { ...observed, ...local };
  }
  async function ready(surface, original) {
    await waitForNavigationScoutPaint({ original, timeoutMs: remaining(), inspect: () => actor(surface),
      inspectPaint: async () => ({ mounted: true, current: true, eligible: true }) });
    return actor(surface);
  }
  async function bind(next = context) {
    if (prestartListener) {
      prestartSurface.page.off('request', prestartListener); prestartListener = undefined;
      assert.equal(prestartReaderRequests, 0, 'Prestart GM readers must not send active scout/candidate queries.');
      assert.equal(invalidPrestartStart, false, 'Prestart start request must belong to the original GM session and instance.');
    }
    if (next) context = next;
    if (bound) return;
    assertNavigationScoutCensus(context);
    gameplay = createTwoBrowserGameplay(context);
    for (const path of SOURCES) sourceBindings[path] = createHash('sha256').update(await readFile(new URL(`../${path}`, import.meta.url))).digest('hex');
    const current = await actor(context.gm);
    assert.equal(current.uidHash, context.started.uidHash, 'Keep the original start GM.');
    assert.equal(current.instanceId, context.started.instanceId, 'Keep the actual started GM instance.');
    assert.equal(current.sessionId, context.initial.sessionId);
    await ready(context.gm, current);
    bound = true;
  }
  async function selected(roleId, { enter = true } = {}) {
    const surface = await gameplay.select(roleId, { enter, deadlineAt: Date.now() + remaining() });
    const current = await actor(surface);
    const expected = roleId === 'gm' ? context.started.uidHash : context.roster.find(entry => entry.roleId === roleId)?.uidHash;
    assert.equal(current.uidHash, expected, 'Use exactly the originally admitted role Auth account.');
    assert.equal(current.sessionId, context.initial.sessionId);
    await ready(surface, current);
    return { surface, original: current };
  }
  async function scoutSelected(plan) {
    if (plan.entitlementId !== 'comms-officer') return selected(plan.roleId);
    const current = await selected(plan.roleId, { enter: false });
    const { surface, original } = current;
    assert.equal(original.replacementRoleId, 'comms-officer', 'Caller must have completed an actual Comms reassignment.');
    assert.equal(original.replacementStatus, null); assert.equal(original.activeConsoleRoleId, null);
    for (let hop = 0; hop < 5 && new URL(surface.page.url()).hash !== '#/replacement/comms-officer'; hop++) {
      await ready(surface, original);
      const path = new URL(surface.page.url()).hash;
      let link;
      if (path === '#/demo-actors') link = surface.page.getByRole('link', { name: "Enter this actor's stations", exact: true });
      else if (path === '#/console') link = surface.page.getByRole('link', { name: 'Comms Officer', exact: true });
      else if (path === '#/brief') link = surface.page.getByRole('link', { name: 'Back to stations', exact: true });
      else if (path.startsWith('#/shuttles/')) link = surface.page.getByRole('link', { name: /^Back to / }).first();
      else link = surface.page.getByRole('link', { name: /^(?:Back to fleet|Back to stations|Back to role selection|View ship consoles|Change role|Leave ship)$/ }).first();
      await link.waitFor({ state: 'visible', timeout: remaining() });
      await link.click({ timeout: remaining() }); await ready(surface, original);
    }
    assert.equal(new URL(surface.page.url()).hash, '#/replacement/comms-officer', 'Use normal current Comms chooser navigation.');
    return current;
  }
  async function chooseOption(select, value) {
    const offered = await select.locator('option').evaluateAll(options => options.filter(option => !option.disabled).map(option => option.value));
    assert.ok(offered.includes(value), 'Select only an actually offered source option.');
    await select.selectOption(value, { timeout: remaining() });
    assert.equal(await select.inputValue(), value);
  }
  async function paint(surface, original, panel, button, { groupPanel = false, blockers = [] } = {}) {
    const result = await waitForNavigationScoutPaint({ original, timeoutMs: remaining(), inspect: () => actor(surface),
      inspectPaint: async () => {
        if (await panel.count() !== 1 || !await panel.isVisible()) return { mounted: false };
        const text = await panel.innerText();
        const heading = panel.getByRole('heading', { name: `Fleet group // ${original.groupId}`, exact: true });
        const current = !groupPanel || await heading.count() === 1 && await heading.isVisible();
        if (!current) return { mounted: true, current: false };
        for (const [phrase, reason] of blockers) if (text.includes(phrase)) return { mounted: true, current, eligible: false, blocker: reason };
        return { mounted: true, current, eligible: await button.count() === 1 && await button.isVisible() && await button.isEnabled() };
      } });
    assert.equal(result.state, 'offered', `Source control blocked: ${result.reason ?? 'current paint unavailable'}.`);
  }
  async function waitState(surface, original, description, predicate) {
    let state;
    while (remaining() > 0) {
      await ready(surface, original); state = await gameplay.state();
      const gm = await actor(context.gm);
      assert.equal(gm.uidHash, context.started.uidHash); assert.equal(gm.instanceId, context.started.instanceId);
      assert.equal(gm.gmInstanceOwned, true); assert.equal(gm.hasAuth, true); assert.equal(gm.sameActor, true);
      if (state.live && gm.connection === 'live' && gm.freshness === 'server' && predicate(state)) return state;
      await delay(200);
    }
    throw new Error(`${description} source projection is still pending.`);
  }
  async function readService(surface, original, module, method, args = []) {
    await ready(surface, original);
    // Invoke the normal strict client service. A rejected stale reply is discarded;
    // at most one reread follows newer same-audience information, never a mutation.
    for (let attempt = 0; attempt < 2; attempt++) {
      const before = await actor(surface);
      try {
        const value = await surface.page.evaluate(async ({ module, method, args }) => {
          const service = await import(module);
          if (module === '/src/lib/fleetGroupService.ts' && method === 'readFleetGroupMessages') return service.createCurrentFleetGroupActions().read();
          return service[method](...args);
        }, { module, method, args });
        assertNavigationScoutActor(await actor(surface), original);
        return value;
      } catch (error) {
        const current = await ready(surface, original);
        if (attempt !== 0 || navigationScoutHash(current.cursor) === navigationScoutHash(before.cursor) ||
          !/authority changed|session authority changed|Reconnect|refresh/i.test(error.message ?? '')) throw error;
      }
    }
    throw new Error('Current source reader did not return; no credit.');
  }
  async function action(step, surface, original, endpoint, intent, button, panel, paintOptions = {}) {
    await paint(surface, original, panel, button, paintOptions);
    let wireRow;
    const captured = await captureNavigationScoutUiReceipt({ surface, endpoint, original, intent,
      timeoutMs: remaining(), inspect: async () => {
        const current = await actor(surface);
        // Navigation group changes are checked against the real committed ship partition below.
        if (['jumpShip', 'moveShipToLocation', 'adjudicateFailedJump'].includes(endpoint) && current.groupId !== original.groupId) return current;
        return ready(surface, original);
      },
      choose: () => button.click({ timeout: remaining() }),
      consequenceGroups: async result => {
        while (remaining() > 0) {
          const state = await gameplay.state();
          if (state.live && state.vesselActionRevisions?.[result.shipId] === result.revision) return state.shipFleetGroupIds;
          await delay(200);
        }
        throw new Error('Original ship partition consequence remains pending.');
      },
      record: captured => { wireRow = add({ branch: step.branch, status: 'pending', roleId: step.roleId,
        actor: original, endpoint, request: captured.request, result: captured.result, replay: 'pending',
        httpStatus: captured.httpStatus, ...(captured.errorCode ? { errorCode: captured.errorCode } : {}),
        setupChoice: step.branch === 'gm-move' || step.branch === 'natural-failure', nextActor: 'caller' }); },
    });
    wireRow.replay = captured.replay;
    if (captured.replayResult) wireRow.replayFingerprint = navigationScoutHash(captured.replayResult);
    await save();
    return { ...captured, row: wireRow };
  }
  async function navigationRead(step, surface, original) {
    const panel = surface.page.getByRole('region', { name: 'Fleet group communication', exact: true });
    await panel.waitFor({ state: 'visible', timeout: remaining() });
    const projection = await readService(surface, original, '/src/lib/fleetGroupService.ts', 'readFleetGroupNavigation',
      original.playerRole === 'gm' ? [step.shipId] : []);
    if (original.playerRole !== 'gm') assert.equal(projection.groupId, original.groupId);
    assert.ok(projection.ships.length > 0 && projection.ships.every(ship => ship.fleetGroupId === projection.groupId));
    if (original.playerRole === 'player') {
      const list = panel.getByRole('list', { name: 'Current group ships', exact: true });
      await list.waitFor({ state: 'visible', timeout: remaining() });
      const text = await list.innerText();
      for (const ship of projection.ships) assert.ok(text.includes(ship.coordinate), 'Mounted local plot must match the actual current group sample.');
    }
    const notes = await readService(surface, original, '/src/lib/fleetGroupService.ts', 'readFleetGroupMessages');
    assert.equal(notes.groupId, original.groupId); assert.ok(Array.isArray(notes.messages));
    add({ branch: step.branch, status: 'observed', actor: original, roleId: step.roleId,
      endpoint: 'readFleetGroupNavigation', result: { navigation: projection, notes }, replay: 'read-only', nextActor: 'caller' });
  }
  async function navigationStep(step) {
    assert.ok(NAVIGATION.has(step.branch), 'Unknown navigation procedure branch.');
    assert.ok(step.roleId, 'Choose a genuinely admitted source role explicitly.');
    const { surface, original } = await selected(step.roleId);
    const groupPanel = surface.page.getByRole('region', { name: 'Fleet group communication', exact: true });
    if (step.branch === 'group-navigation') return navigationRead(step, surface, original);
    if (step.branch === 'group-message') {
      await groupPanel.waitFor({ state: 'visible', timeout: remaining() });
      await groupPanel.getByLabel('Note to your fleet group', { exact: true }).fill(step.text, { timeout: remaining() });
      const wire = await action(step, surface, original, 'sendFleetGroupMessage', { text: step.text },
        groupPanel.getByRole('button', { name: 'Send group note', exact: true }), groupPanel, { groupPanel: true });
      const notes = await surface.page.evaluate(async () => (await import('/src/lib/fleetGroupService.ts')).createCurrentFleetGroupActions().read());
      assertNavigationScoutActor(await actor(surface), original);
      assert.equal(notes.groupId, original.groupId);
      assert.ok(notes.messages.some(note => note.id === wire.result.messageId && note.text === step.text.trim() && note.actorUid === original.uid));
      await groupPanel.getByRole('button', { name: 'Refresh group notes', exact: true }).click({ timeout: remaining() });
      await groupPanel.getByText(step.text.trim(), { exact: true }).waitFor({ state: 'visible', timeout: remaining() });
      wire.row.status = 'observed'; return;
    }
    if (step.branch === 'known-share') {
      assert.ok(original.knownCoordinates.includes(step.coordinate), 'Share a current actor-known source coordinate.');
      const panel = groupPanel.getByRole('region', { name: 'Share scanned system', exact: true });
      await panel.waitFor({ state: 'visible', timeout: remaining() });
      await chooseOption(panel.getByLabel('Scanned system to share', { exact: true }), step.coordinate);
      const all = panel.getByRole('checkbox', { name: `All ships in ${original.groupId}`, exact: true });
      await all.setChecked((step.recipientShipIds ?? 'all') === 'all', { timeout: remaining() });
      if (step.recipientShipIds && step.recipientShipIds !== 'all') for (const shipId of original.localShipIds) {
        const label = await surface.page.evaluate(async shipId => {
          const vessel = (await import('/src/data/ships.ts')).findVessel(shipId);
          return (vessel.shortName ?? vessel.name).toUpperCase();
        }, shipId);
        await panel.getByRole('checkbox', { name: label, exact: true }).setChecked(step.recipientShipIds.includes(shipId), { timeout: remaining() });
      }
      const wire = await action(step, surface, original, 'shareKnownSystemDetails', step,
        panel.getByRole('button', { name: 'Share scanned system', exact: true }), panel);
      assert.equal(wire.result.groupId, original.groupId); assert.equal(wire.result.coordinate, step.coordinate);
      assert.ok(wire.result.recipientShipIds.every(shipId => original.localShipIds.includes(shipId)));
      assert.ok(wire.result.navigationRevision > original.navigationRevision); wire.row.status = 'observed'; return;
    }
    if (step.branch === 'known-jump') {
      assert.equal(original.shipId, step.shipId); assert.equal(original.airspace, 'lifted');
      assert.ok(original.knownCoordinates.includes(step.coordinate), 'Destination must be actually known to this current actor.');
      const name = await surface.page.evaluate(async id => (await import('/src/data/ships.ts')).findVessel(id).name, step.shipId);
      const panel = surface.page.getByRole('region', { name: `${name} Jump Drive control`, exact: true });
      await panel.waitFor({ state: 'visible', timeout: remaining() });
      const unlock = panel.getByRole('button', { name: 'Unlock destination coordinates', exact: true });
      if (await unlock.isVisible()) await unlock.click({ timeout: remaining() });
      for (let index = 0; index < 4; index++) {
        const digit = Number(await panel.getByLabel(`Coordinate digit ${index + 1} value`, { exact: true }).textContent());
        const clicks = (Number(step.coordinate[index]) - digit + 10) % 10;
        for (let n = 0; n < clicks; n++) await panel.getByRole('button', { name: `Increase coordinate digit ${index + 1}`, exact: true }).click({ timeout: remaining() });
      }
      await panel.getByRole('button', { name: 'Lock destination coordinates', exact: true }).click({ timeout: remaining() });
      const power = panel.getByRole('slider', { name: 'Jump drive power', exact: true });
      await power.focus({ timeout: remaining() }); await power.press('End', { timeout: remaining() }); assert.equal(await power.inputValue(), '100');
      const before = await gameplay.state();
      const wire = await action(step, surface, original, 'jumpShip', step,
        panel.getByRole('button', { name: `Jump to ${step.coordinate}`, exact: true }), panel,
        { blockers: [['Drive charge // NOT CHARGED', 'source-drive-not-charged']] });
      assert.equal(wire.result.shipId, step.shipId);
      if (wire.result.status !== 'jumped') {
        assert.ok(['drive-failure', 'fuel-shortage'].includes(wire.result.status), 'Blocked jump is not paid success.');
        assert.ok(wire.result.failureRequestId, 'Retain the actual server-created failure pointer.');
        wire.row.status = 'pending'; wire.row.reason = 'actual-server-jump-failure';
        return pending('known-jump', 'actual-server-jump-failure', step.roleId, original);
      }
      assert.equal(wire.result.destination, step.coordinate);
      const current = await actor(surface);
      const after = await waitState(surface, current, 'Paid jump', state =>
        state.vesselActionRevisions?.[step.shipId] === wire.result.revision && state.shipResources[step.shipId].fuel === wire.result.remainingFuel &&
        !state.maintenanceCycles?.[step.shipId]?.charges?.includes('jump-drive'));
      assertNavigationScoutCost('jumpShip', wire.result, { beforeFuel: before.shipResources[step.shipId].fuel,
        afterFuel: after.shipResources[step.shipId].fuel, chargedBefore: before.maintenanceCycles?.[step.shipId]?.charges?.includes('jump-drive') === true,
        chargedAfter: after.maintenanceCycles?.[step.shipId]?.charges?.includes('jump-drive') === true });
      wire.row.costs = { fuel: wire.result.fuelCost }; wire.row.status = 'observed'; return;
    }
    if (step.branch === 'gm-move') {
      assert.equal(step.roleId, 'gm'); assert.equal(step.virtualTrainingChoice, true, 'Declare this ordinary GM movement as an explicit virtual-training choice.');
      const panel = surface.page.getByRole('region', { name: 'GM starmap', exact: true });
      await panel.waitFor({ state: 'visible', timeout: remaining() });
      await chooseOption(panel.getByLabel('Ship to move', { exact: true }), step.shipId);
      const printedCoordinates = await panel.locator('button[data-system-coordinate]').evaluateAll(buttons => buttons.map(button => button.dataset.systemCoordinate));
      assert.ok(printedCoordinates.includes(step.coordinate), 'Use an actual GM chart map button, not a fabricated destination.');
      await panel.locator(`button[data-system-coordinate="${step.coordinate}"]`).click({ timeout: remaining() });
      const wire = await action(step, surface, original, 'moveShipToLocation', { ...step, printedCoordinates },
        panel.getByRole('button', { name: 'Move ship to location', exact: true }), panel);
      assert.equal(wire.result.destination, step.coordinate); assert.equal(wire.result.shipId, step.shipId);
      await waitState(surface, original, 'GM movement', state => state.vesselActionRevisions?.[step.shipId] === wire.result.revision &&
        state.shipGalacticCoordinates?.[step.shipId] === step.coordinate);
      wire.row.status = 'observed'; return;
    }
    if (step.branch === 'partition') {
      assert.equal(step.roleId, 'gm');
      const wire = await action(step, surface, original, 'confirmFleetPartition', {},
        groupPanel.getByRole('button', { name: 'Confirm separated fleet groups', exact: true }), groupPanel, { groupPanel: true });
      assert.ok(Array.isArray(wire.result.groupIds) && new Set(wire.result.groupIds).size === wire.result.groupIds.length);
      await waitState(surface, original, 'Server partition', state =>
        new Set(Object.values(state.shipFleetGroupIds ?? {})).size === wire.result.groupIds.length);
      wire.row.status = 'observed'; return;
    }
    if (step.branch.startsWith('taxi-')) {
      assert.equal(original.assignedRoleId, SCOUT_ROLES[step.shuttleId]); assert.equal(original.airspace, 'lifted');
      const before = await gameplay.state();
      assert.notEqual(before.shipFleetGroupIds[ANCHORS[step.shuttleId]], before.shipFleetGroupIds[step.targetShipId], 'A genuinely separated destination is required.');
      let wire;
      if (step.branch === 'taxi-courier') {
        await openShuttle(surface, step.shuttleId);
        const panel = surface.page.getByRole('region', { name: `${LABELS[step.shuttleId]} scout taxi courier`, exact: true });
        await panel.waitFor({ state: 'visible', timeout: remaining() });
        await chooseOption(panel.getByLabel('Courier destination ship', { exact: true }), step.targetShipId);
        await panel.getByLabel('Courier note', { exact: true }).fill(step.text, { timeout: remaining() });
        wire = await action(step, surface, original, 'sendScoutTaxiCourier', step,
          panel.getByRole('button', { name: 'Send scout taxi courier', exact: true }), panel,
          { blockers: [['Wait for current live authority and open airspace.', 'source-courier-authority-blocked']] });
        const targetRoleId = step.recipientRoleId;
        assert.ok(targetRoleId, 'Provide an original destination-group account to observe the actual delivered note.');
        const recipient = await selected(targetRoleId);
        assert.equal(recipient.original.groupId, before.shipFleetGroupIds[step.targetShipId]);
        const notes = await recipient.surface.page.evaluate(async () => (await import('/src/lib/fleetGroupService.ts')).createCurrentFleetGroupActions().read());
        assertNavigationScoutActor(await actor(recipient.surface), recipient.original);
        validateScoutTaxiDelivery(notes, { request: wire.request, actor: original, targetGroupId: before.shipFleetGroupIds[step.targetShipId] });
      } else {
        const panel = groupPanel.getByRole('region', { name: 'Scout taxi transfer', exact: true });
        await panel.waitFor({ state: 'visible', timeout: remaining() });
        await chooseOption(panel.getByLabel('Taxi shuttle', { exact: true }), step.shuttleId);
        await chooseOption(panel.getByLabel('Taxi destination ship', { exact: true }), step.targetShipId);
        await chooseOption(panel.getByLabel('Taxi payload', { exact: true }), step.branch === 'taxi-fuel' ? 'fuel' : 'players');
        const intent = { ...step };
        if (step.branch === 'taxi-fuel') await chooseOption(panel.getByLabel('Fuel units', { exact: true }), String(step.units));
        else {
          assert.ok(Array.isArray(step.passengerRoleIds) && step.passengerRoleIds.length >= 1 && step.passengerRoleIds.length <= 2);
          const players = await gameplay.read(step.roleId, 'players', { collection: true });
          const passengers = step.passengerRoleIds.map(roleId => {
            const entry = context.roster.find(actor => actor.roleId === roleId);
            assert.ok(entry && roleId !== step.roleId, 'Passengers must be different normally admitted original accounts.');
            return { entry };
          });
          intent.passengerUids = [];
          for (const { entry } of passengers) {
            const player = await surface.page.evaluate(async ({ players, uidHash }) => {
              for (const player of players) {
                const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(player.uid))))
                  .map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16);
                if (hash === uidHash) return player;
              }
              return null;
            }, { players, uidHash: entry.uidHash });
            assert.ok(player?.connected === true && player.fleetGroupId === original.groupId, 'Source passenger must be currently connected in the actual group.');
            intent.passengerUids.push(player.uid);
            await panel.getByRole('checkbox', { name: player.displayName, exact: true }).check({ timeout: remaining() });
          }
        }
        wire = await action(step, surface, original, 'sendScoutTaxiTransfer', intent,
          panel.getByRole('button', { name: 'Send scout taxi', exact: true }), panel);
        if (step.branch === 'taxi-fuel') {
          const anchor = ANCHORS[step.shuttleId];
          const after = await waitState(surface, original, 'Actual taxi fuel', state =>
            state.shipResources[anchor].fuel === wire.result.sourceFuelRemaining &&
            state.shipResources[step.targetShipId].fuel === before.shipResources[step.targetShipId].fuel + step.units);
          assertNavigationScoutCost('sendScoutTaxiTransfer', wire.result, { beforeFuel: before.shipResources[anchor].fuel,
            afterFuel: after.shipResources[anchor].fuel, beforeTargetFuel: before.shipResources[step.targetShipId].fuel,
            afterTargetFuel: after.shipResources[step.targetShipId].fuel });
          wire.row.costs = { fuel: step.units, cadenceAttempts: 1 };
        } else {
          assert.deepEqual(wire.result.playerUids, intent.passengerUids);
          for (const roleId of step.passengerRoleIds) {
            const passenger = await selected(roleId, { enter: false });
            assert.equal(passenger.original.groupId, before.shipFleetGroupIds[step.targetShipId], 'Original passenger must now have the actual target group.');
          }
          wire.row.costs = { passengers: step.passengerRoleIds.length, cadenceAttempts: 1 };
        }
      }
      const restored = await selected(step.roleId);
      assert.equal(restored.original.groupId, original.groupId, 'The original scout taxi operator must return to the source group.');
      if (!wire.row.costs) wire.row.costs = { cadenceAttempts: 1 };
      wire.row.status = 'observed'; return;
    }
    if (step.branch === 'natural-failure') {
      assert.equal(step.roleId, 'gm');
      const queue = await readService(surface, original, '/src/lib/sessionService.ts', 'listUnresolvedJumpFailures');
      assert.notEqual(queue.stale, true, 'Use the actual current failed-jump list.');
      const matches = queue.failures.filter(failure => failure.shipId === step.shipId && (!step.failureRequestId || failure.requestId === step.failureRequestId));
      if (matches.length === 0) return pending(step.branch, 'no-natural-server-failure', step.roleId, original);
      assert.equal(matches.length, 1, 'Choose the exact currently unresolved failure.');
      assert.equal(step.virtualTrainingChoice, true, 'Label this actual facilitator ruling as explicit virtual-training choice.');
      const failure = matches[0], panel = surface.page.getByRole('region', { name: 'Failed jump adjudication', exact: true });
      await panel.getByRole('button', { name: 'Check failed jumps', exact: true }).click({ timeout: remaining() });
      const consequence = panel.getByLabel(`Failed-jump consequence for ${step.shipId.toUpperCase()}`, { exact: true });
      await consequence.waitFor({ state: 'visible', timeout: remaining() }); await chooseOption(consequence, step.consequence);
      if (step.coordinate) await chooseOption(panel.getByLabel(`Adjudication destination for ${step.shipId.toUpperCase()}`, { exact: true }), step.coordinate);
      const wire = await action(step, surface, original, 'adjudicateFailedJump', { ...step, failureRequestId: failure.requestId,
        expectedRevision: failure.failureRevision }, panel.getByRole('button', { name: `Complete failed jump for ${step.shipId.toUpperCase()}`, exact: true }), panel);
      assert.ok(['jumped', 'delayed'].includes(wire.result.status)); wire.row.status = 'observed'; return;
    }
    if (step.branch === 'dradis') {
      assert.equal(step.roleId, 'gm');
      const panel = surface.page.getByRole('region', { name: 'GM DRADIS effects', exact: true });
      if (!await panel.isVisible()) await surface.page.getByRole('button', { name: 'Zoom into DRADIS panel', exact: true }).first().click({ timeout: remaining() });
      const wire = await action(step, surface, original, 'triggerDradisContact', {},
        panel.getByRole('button', { name: 'Trigger unknown contact', exact: true }), panel);
      assert.ok(Number.isFinite(Date.parse(wire.result.triggeredAt)));
      await waitState(surface, original, 'Actual contact', asyncState => asyncState.live);
      const shown = await surface.page.evaluate(async moduleUrl => (await import(moduleUrl)).useSessionStore.getState().session?.dradisContactTriggeredAt,
        surface.storeModuleUrl());
      assert.equal(shown, wire.result.triggeredAt, 'Show the actually triggered source contact.'); wire.row.status = 'observed'; return;
    }
    if (step.branch === 'press-access') {
      assert.equal(step.roleId, 'admiral'); assert.equal(original.airspace, 'restricted');
      const summary = surface.page.locator('details.aegis-systems-control > summary');
      if (await summary.locator('..').getAttribute('open') === null) await summary.click({ timeout: remaining() });
      const panel = surface.page.getByRole('region', { name: 'Airspace control', exact: true });
      const wire = await action(step, surface, original, 'unlockPressAirspace', {},
        panel.getByRole('button', { name: 'Unlock airspace // Press', exact: true }), panel);
      const after = await waitState(surface, original, 'Actual Press exception', state => state.turnPhase?.airspace?.pressAccess === true);
      assert.equal(after.turnPhase.airspace.state, 'restricted');
      const consumed = panel.getByRole('button', { name: 'Press airspace exception authorized', exact: true });
      await consumed.waitFor({ state: 'visible', timeout: remaining() }); assert.equal(await consumed.isEnabled(), false);
      wire.row.status = 'observed'; return;
    }
  }

  async function openShuttle(surface, entitlementId) {
    if (entitlementId === 'comms-officer') return;
    const request = surface.page.getByRole('region', { name: `${LABELS[entitlementId]} scouting request`, exact: true });
    if (!await request.isVisible()) await surface.page.getByRole('link', { name: `Open ${LABELS[entitlementId]} shuttle console`, exact: true }).click({ timeout: remaining() });
    await request.waitFor({ state: 'visible', timeout: remaining() });
  }
  async function printedCoordinate(plan) {
    const gm = await selected('gm');
    const panel = gm.surface.page.getByRole('region', { name: 'GM starmap', exact: true });
    await panel.waitFor({ state: 'visible', timeout: remaining() });
    const values = await panel.locator('button[data-system-coordinate]').evaluateAll(buttons =>
      buttons.filter(button => !button.disabled).map(button => button.dataset.systemCoordinate));
    assert.ok(values.length > 0, 'The actual mounted GM chart must offer printed coordinate buttons.');
    const eligible = await gm.surface.page.evaluate(async ({ values, entitlementId, anchor }) => {
      if (entitlementId === 'endeavour') return values;
      const { useSessionStore } = await import('/src/store/useSessionStore.ts');
      const { jumpDistanceBetween } = await import('/functions/src/starChartGraph.ts');
      const origin = useSessionStore.getState().session?.shipGalacticCoordinates?.[anchor];
      const limit = entitlementId === 'starlight' ? 2 : entitlementId === 'hummingbird' ? 3 : 1;
      return values.filter(coordinate => { const distance = jumpDistanceBetween(origin, coordinate); return distance !== null && distance <= limit; });
    }, { values, entitlementId: plan.entitlementId, anchor: ANCHORS[plan.entitlementId] });
    assert.ok(eligible.length > 0, 'No current source-range printed coordinate is offered.');
    const chosen = plan.coordinate ?? eligible[0];
    assert.ok(values.includes(chosen), 'The scout intent must be an actually printed coordinate.');
    assert.ok(eligible.includes(chosen), 'The actual printed scout destination must be in its current source range.');
    return { coordinate: chosen, printedCoordinates: values };
  }
  async function requestScout(plan) {
    if (plan.entitlementId !== 'comms-officer') assert.equal(plan.roleId, SCOUT_ROLES[plan.entitlementId], 'Use the actual printed scout holder role.');
    const printed = await printedCoordinate(plan);
    const { surface, original } = await scoutSelected(plan);
    assert.equal(original.phase, 'active'); assert.equal(original.airspace, 'lifted');
    await openShuttle(surface, plan.entitlementId);
    const panel = surface.page.getByRole('region', { name: `${LABELS[plan.entitlementId]} scouting request`, exact: true });
    await panel.getByLabel('Printed system coordinate', { exact: true }).fill(printed.coordinate, { timeout: remaining() });
    const wire = await action({ ...plan, branch: 'scout-request' }, surface, original, 'requestScout', { ...plan, ...printed },
      panel.getByRole('button', { name: 'Record request', exact: true }), panel,
      { blockers: [['Scouting requests are available during an active Coordination phase.', 'source-coordination-not-open']] });
    const expected = wire.result;
    for (const key of ['sessionId', 'requestId', 'entitlementId', 'targetCoordinate']) assert.equal(expected[key], wire.request[key]);
    assert.equal(expected.cycle, original.cycle); assert.equal(expected.ownerRoleId, SCOUT_ROLES[plan.entitlementId]); assert.equal(expected.resolution, 'pending');
    assert.ok(['requested', 'replayed'].includes(expected.status));
    wire.row.status = 'observed'; wire.row.costs = { cadenceAttempts: 1 };
    const record = { reply: expected, original, plan: { ...plan, coordinate: printed.coordinate } };
    scoutRecords.set(plan.roleId, record); return record;
  }
  async function gmRecovery(record, required) {
    const selectedGm = await selected('gm'), { surface, original } = selectedGm;
    const queue = await readService(surface, original, '/src/lib/scoutResultService.ts', 'listPendingScoutRequests');
    const log = await readService(surface, original, '/src/lib/scoutResultService.ts', 'listGmScoutResolutionLog');
    const row = queue.find(entry => entry.requestId === record.reply.requestId);
    if (!row) {
      assert.ok(log.some(entry => entry.requestId === record.reply.requestId), 'Neither the real pending queue nor the resolution log contains this request.');
      if (required || requiredBranches.includes('gm-scout-recovery')) throw new Error('Required gm-scout-recovery is unavailable: source resolved automatically.');
      return pending('gm-scout-recovery', 'source-resolved-automatically', 'gm', original);
    }
    const panel = surface.page.getByRole('region', { name: 'GM scout reveals', exact: true });
    await surface.page.getByRole('button', { name: 'Refresh scout queue', exact: true }).click({ timeout: remaining() });
    const button = panel.getByRole('button', { name: `Reveal ${LABELS[record.reply.entitlementId]} scout at ${record.reply.targetCoordinate}`, exact: true });
    const offered = await waitForNavigationScoutPaint({ original, timeoutMs: remaining(), inspect: () => actor(surface),
      inspectPaint: async () => {
        if (!await panel.isVisible()) return { mounted: false };
        if (await button.isVisible() && await button.isEnabled()) return { mounted: true, current: true, eligible: true };
        const resultLog = surface.page.getByRole('region', { name: 'GM scouting result log', exact: true });
        if (await resultLog.isVisible()) {
          const text = await resultLog.innerText();
          if (text.includes(LABELS[record.reply.entitlementId]) && text.includes(record.reply.targetCoordinate) && text.includes(`Cycle ${record.reply.cycle}`)) {
            return { mounted: true, current: true, eligible: false, blocker: 'source-resolved-automatically' };
          }
        }
        return { mounted: true, current: true, eligible: false };
      } });
    if (offered.state === 'blocked') {
      const resolved = await readService(surface, original, '/src/lib/scoutResultService.ts', 'listGmScoutResolutionLog');
      assert.ok(resolved.some(entry => entry.requestId === record.reply.requestId), 'Confirm this exact automatically resolved source request.');
      if (required) throw new Error('Required gm-scout-recovery resolved automatically before its control was offered.');
      return pending('gm-scout-recovery', 'source-resolved-automatically', 'gm', original);
    }
    const wire = await action({ branch: 'gm-scout-recovery', roleId: 'gm' }, surface, original, 'resolvePendingScoutRequest',
      { requestId: row.requestId }, button, panel);
    const committedLog = await readService(surface, original, '/src/lib/scoutResultService.ts', 'listGmScoutResolutionLog');
    const mode = classifyScoutRecovery(committedLog.find(entry => entry.requestId === row.requestId), wire.result,
      { ...record.reply, sourceId: record.reply.entitlementId, requesterUid: record.original.uid });
    if (mode.state !== 'observed') {
      if (required) throw new Error(`Required gm-scout-recovery is uncredited: ${mode.reason}.`);
      return pending('gm-scout-recovery', mode.reason, 'gm', original);
    }
    wire.row.status = 'observed'; wire.row.reason = 'source-gm-recovery-committed';
  }
  async function reports(record, { branch = 'scout-report' } = {}) {
    const { surface, original } = await scoutSelected(record.plan);
    await openShuttle(surface, record.plan.entitlementId);
    const indexPanel = surface.page.getByRole('region', { name: 'Private scouting reports', exact: true });
    await indexPanel.waitFor({ state: 'visible', timeout: remaining() });
    const refresh = indexPanel.getByRole('button', { name: 'Refresh reports', exact: true });
    await paint(surface, original, indexPanel, refresh); await refresh.click({ timeout: remaining() });
    const reportPanel = indexPanel.getByRole('region', { name: `${LABELS[record.plan.entitlementId]} scout report`, exact: true });
    await waitForNavigationScoutPaint({ original, timeoutMs: remaining(), inspect: () => actor(surface), inspectPaint: async () => {
      const saved = indexPanel.getByLabel('Saved scout request', { exact: true });
      if (await saved.count() === 1 && await saved.isVisible() && await saved.inputValue() !== record.reply.requestId) {
        const options = await saved.locator('option').evaluateAll(nodes => nodes.map(node => node.value));
        if (options.includes(record.reply.requestId)) await chooseOption(saved, record.reply.requestId);
      }
      if (!await reportPanel.isVisible()) return { mounted: false };
      const text = await reportPanel.innerText();
      return { mounted: true, current: text.includes(`Cycle ${record.reply.cycle}`) && text.includes(record.reply.targetCoordinate),
        eligible: text.includes('Discovery note saved for this station.') };
    } });
    const entries = await readService(surface, original, '/src/lib/scoutResultService.ts', 'listMyScoutReports');
    const report = entries.find(entry => entry.requestId === record.reply.requestId);
    assert.ok(report, 'Actual requester report index must retain the exact committed request.');
    const result = await readService(surface, original, '/src/lib/scoutResultService.ts', 'readPrivateScoutResult', [record.reply.requestId]);
    const note = await readService(surface, original, '/src/lib/scoutResultService.ts', 'readMyScoutDiscoveryNote', [report.noteId]);
    const bundle = validateScoutBundle({ report, result, note }, { actor: original, reply: record.reply });
    for (const [selector, expectedText] of [['.scout-result-panel__code', `Site ${result.systemFact.code}`],
      ['.scout-result-panel__title', result.systemFact.title]]) {
      const fact = reportPanel.locator(selector);
      assert.equal(await fact.count(), 1, 'Show one exact actual private fact field.');
      assert.equal(await fact.isVisible(), true, 'The actual private fact must be visible.');
      assert.equal((await fact.textContent()).replace(/\s+/g, ' ').trim(), expectedText,
        'Show the exact actual private fact and saved note.');
    }
    record.bundle = bundle;
    add({ branch, status: 'observed', roleId: record.plan.roleId, actor: original, endpoint: 'readPrivateScoutResult',
      result: bundle, replay: 'read-only', nextActor: 'caller' }); return { surface, original, bundle };
  }
  async function candidateReader(record) {
    const { surface, original } = await scoutSelected(record.plan);
    const view = await readService(surface, original, '/src/lib/candidateService.ts', 'readCandidateWorkspace', [original.groupId]);
    assert.equal(view.type, 'candidate-workspace'); assert.equal(view.sessionId, original.sessionId); assert.equal(view.groupId, original.groupId);
    assert.equal(Object.hasOwn(view, 'privateCalculations'), false, 'Player Candidate readers must omit GM calculations.');
    assert.ok(view.paths.every(path => path.canSabotage === false));
    add({ branch: 'candidate-reader', status: 'observed', roleId: record.plan.roleId, actor: original,
      endpoint: 'readCandidateWorkspace', result: view, replay: 'read-only', nextActor: 'caller' });
  }
  async function foreignDenial(record, roleId, audienceOnly) {
    assert.ok(roleId && roleId !== record.plan.roleId, 'Choose a different original normally admitted actor explicitly.');
    const { surface, original } = await selected(roleId);
    assert.notEqual(original.uidHash, record.original.uidHash);
    const entries = await readService(surface, original, '/src/lib/scoutResultService.ts', 'listMyScoutReports');
    assert.ok(entries.every(entry => entry.requestId !== record.reply.requestId), 'Foreign source report index must withdraw the previous actor request.');
    const reports = surface.page.getByRole('region', { name: 'Private scouting reports', exact: true });
    const oldTitle = record.bundle.result.systemFact.title;
    if (await reports.count()) assert.equal(await reports.getByText(oldTitle, { exact: true }).isVisible(), false, 'No previous-actor private report may survive the real audience switch.');
    if (!audienceOnly) {
      const reply = await surface.callable('readPrivateScoutResult', { sessionId: original.sessionId, requestId: record.reply.requestId });
      assertNavigationScoutActor(await actor(surface), original);
      assert.equal(reply.status, 'rejected'); assert.ok(['permission-denied', 'not-found'].includes(reply.code));
      const note = await surface.callable('readMyScoutDiscoveryNote', { sessionId: original.sessionId, noteId: record.bundle.report.noteId });
      assertNavigationScoutActor(await actor(surface), original);
      assert.equal(note.status, 'rejected', 'Saved scouting notes are private to their actual requester.');
      assert.ok(['permission-denied', 'not-found'].includes(note.code));
      add({ branch: 'scout-foreign-denial', status: 'observed', roleId, actor: original, endpoint: 'readPrivateScoutResult',
        result: { code: reply.code, noteDenied: note.status === 'rejected' }, replay: 'read-only', nextActor: 'requester' });
    } else add({ branch: 'scout-audience-withdrawal', status: 'observed', roleId, actor: original,
      result: { previousRequestAbsent: true }, replay: 'read-only', nextActor: 'requester' });
  }
  async function reload(record) {
    const { surface, original } = await scoutSelected(record.plan);
    await surface.page.reload({ timeout: remaining() });
    await scoutSelected(record.plan);
    const current = await actor(surface);
    for (const key of ['sessionId', 'uidHash', 'profileRoleId', 'assignedRoleId', 'groupId', 'cycle', 'phase'])
      assert.equal(current[key], original[key], `Original ${key} must survive the genuine reload.`);
    await reports(record, { branch: 'scout-reload' });
  }
  async function offline(record) {
    const { surface, original } = await scoutSelected(record.plan);
    await openShuttle(surface, record.plan.entitlementId);
    try {
      await surface.page.context().setOffline(true);
      await surface.page.getByText('Reconnect to receive your current scouting reports.', { exact: true }).waitFor({ state: 'visible', timeout: remaining() });
      const current = await actor(surface);
      for (const key of ['uidHash', 'sessionId', 'profileRoleId']) assert.equal(current[key], original[key]);
      assert.equal(await surface.page.getByRole('region', { name: `${LABELS[record.plan.entitlementId]} scout report`, exact: true }).isVisible(), false,
        'Private report must withdraw during actual connection loss.');
    } finally { await surface.page.context().setOffline(false); }
    await ready(surface, original); await reports(record, { branch: 'scout-offline-withdrawal' });
  }
  async function onSetup(next) {
    context = next; stage();
    const surface = next.gm, original = await actor(surface);
    assert.ok(['lobby', 'casting', 'briefing'].includes(original.phase));
    const awaiting = surface.page.getByText('Awaiting GM start // scouting results open during active gameplay.', { exact: true });
    prestartSurface = surface;
    prestartListener = request => {
      const endpoint = new URL(request.url()).pathname.split('/').at(-1);
      if (request.method() !== 'POST') return;
      if (endpoint === 'startGame') {
        const data = request.postDataJSON()?.data;
        if (data?.sessionId !== original.sessionId || data?.instanceId !== original.instanceId) invalidPrestartStart = true;
        else prestartStartRequested = true;
      } else if (!prestartStartRequested && ['listPendingScoutRequests', 'listGmScoutResolutionLog', 'readCandidateWorkspace'].includes(endpoint)) {
        prestartReaderRequests++;
      }
    };
    surface.page.on('request', prestartListener);
    if (!await awaiting.isVisible() && !requiredBranches.includes('prestart-readers')) return pending('prestart-readers', 'prestart-source-not-mounted', 'gm', original);
    await awaiting.waitFor({ state: 'visible', timeout: remaining() }); await ready(surface, original);
    assert.equal(await surface.page.getByRole('region', { name: 'GM scout reveals', exact: true }).isVisible(), false);
    add({ branch: 'prestart-readers', status: 'observed', roleId: 'gm', actor: original,
      result: { mountedWaiting: true, activeReaderRequests: prestartReaderRequests }, replay: 'read-only', nextActor: 'gm' });
    await save();
  }
  async function onStarted(next) { stage(); await bind(next); await save(); }
  function startRun(deadlineAt) {
    assert.ok(deadlineAt === undefined || Number.isFinite(deadlineAt) && deadlineAt > Date.now(), 'Use the existing caller deadline.');
    runEnd = Math.min(Date.now() + 480_000, deadlineAt ?? Infinity); stage();
  }
  async function runNavigation(plan, { deadlineAt } = {}) {
    startRun(deadlineAt); await bind();
    assert.ok(Array.isArray(plan) && plan.length > 0 && plan.length <= 24, 'Provide a finite ordered navigation procedure plan.');
    for (const step of plan) {
      stage();
      try { await navigationStep(step); await save(); }
      catch (error) { add({ branch: step.branch, status: 'failed', roleId: step.roleId, reason: 'source-procedure-failed', nextActor: 'caller' }); await save(); throw error; }
    }
    return save();
  }
  async function runScoutReaders(plan, { deadlineAt } = {}) {
    startRun(deadlineAt); await bind();
    assert.ok(LABELS[plan?.entitlementId] && (plan.entitlementId === 'comms-officer' || SCOUT_ROLES[plan.entitlementId] === plan.roleId),
      'Choose one explicit original entitled scout role.');
    const branches = plan.branches ?? ['scout-request', 'scout-report', 'candidate-reader', 'scout-reload', 'scout-foreign-denial', 'scout-audience-withdrawal'];
    assert.ok(branches.every(branch => NAV_SCOUT_BRANCHES.includes(branch) && !NAVIGATION.has(branch) && branch !== 'prestart-readers'));
    assert.equal(new Set(branches).size, branches.length, 'Duplicate scout procedure branches.');
    let record = scoutRecords.get(plan.roleId);
    for (const branch of branches) {
      stage();
      try {
        if (branch === 'scout-request') record = await requestScout(plan);
        else {
          assert.ok(record, 'Read/recovery/lifecycle procedures require the actual request captured by this factory.');
          if (branch === 'gm-scout-recovery') await gmRecovery(record, plan.requireGmRecovery === true);
          else if (branch === 'scout-report') await reports(record);
          else if (branch === 'candidate-reader') await candidateReader(record);
          else if (branch === 'scout-reload') await reload(record);
          else if (branch === 'scout-offline-withdrawal') await offline(record);
          else if (branch === 'scout-foreign-denial' || branch === 'scout-audience-withdrawal') {
            assert.ok(record.bundle, 'Obtain the positive private source result before checking withdrawal or denial.');
            await foreignDenial(record, plan.foreignRoleId, branch === 'scout-audience-withdrawal');
          } else throw new Error('Unknown scout lifecycle procedure.');
        }
        await save();
      } catch (error) { add({ branch, status: 'failed', roleId: plan.roleId, reason: 'source-reader-procedure-failed', nextActor: 'caller' }); await save(); throw error; }
    }
    return save();
  }
  const summary = () => summarizeNavigationScoutBranches(rows, requiredBranches);
  return { onSetup, onStarted, runNavigation, runScoutReaders, save, summary };
}
