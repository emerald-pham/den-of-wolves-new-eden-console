import { observeUiReceipt } from './pc10-browser-ui-receipt.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { assertExtraActor, recordExtraRoleResult } from './pc10-extra-role-proof-helpers.mjs';

/** Harness guard tests are fixtures, not gameplay receipts. The live adapter below
 * supplies observations from the ordinary authenticated browser store. */
export async function guardExtraRoleCommand({ inspect, perform }) {
  const before = await inspect();
  const receipt = await perform();
  assert.equal(receipt.httpStatus, 200, 'An actual successful HTTP receipt is required.');
  assert.equal(receipt.logicalStatus, 'committed', 'A stale/denied logical receipt cannot count.');
  const after = await inspect();
  assert.ok(JSON.stringify(after) === JSON.stringify(before), 'The original authenticated actor changed while the command was in flight.');
  return { ...receipt, identityVerified: true, actor: { sessionId: before.sessionId,
    uidHash: before.uidHash, ...(before.profileRoleId ? { anchorRoleId: before.profileRoleId } : {}),
    ...(before.roleId ? { currentRoleId: before.roleId } : {}) } };
}

export async function publicState(surface) {
  return surface.page.evaluate(async moduleUrl => {
    const { useSessionStore } = await import(moduleUrl);
    const { session: s, me, connection, sessionSnapshotFreshness } = useSessionStore.getState();
    return { sessionId: s?.id, cycle: s?.currentTurn, phase: s?.phase,
      setupRevision: s?.setupRevision, activeConsoleRoleId: me?.activeConsoleRoleId ?? null,
      assignedRoleId: me?.assignedRoleId ?? null, replacementRoleId: me?.replacementRoleId ?? null,
      seatId: me?.seatId ?? null, live: connection === 'live' && sessionSnapshotFreshness === 'server',
      resources: s?.shipResources, maintenance: s?.maintenanceCycles, damage: s?.shipDamage,
      vesselRevisions: s?.vesselActionRevisions, shuttleFuelled: s?.shuttleFuelled,
      shuttleDockings: s?.shuttleDockings, shuttleControl: s?.shuttleControl,
      shuttleCargo: s?.shuttleCargo, warriorCargo: s?.warriorCargo, smallShips: s?.smallShipStates,
      knownSystems: s?.playerDiscovery?.knownSystems,
      groups: s?.playerDiscovery?.fleetGroupVesselIds,
      airspace: s?.turnPhase?.airspace.state, progression: s?.turnPhase?.progression,
      terminal: s?.debriefSnapshot ? { source: s.debriefSnapshot.source,
        result: s.debriefSnapshot.result, cause: s.debriefSnapshot.cause, cycle: s.debriefSnapshot.cycle } : null };
  }, surface.storeModuleUrl());
}

export async function untilPublic(surface, description, predicate, timeout = 45_000) {
  const deadline = Date.now() + timeout;
  let current;
  do {
    current = await publicState(surface);
    if (predicate(current)) return current;
    await delay(250);
  } while (Date.now() < deadline);
  throw Error(`${description}: ${JSON.stringify({ sessionId: current?.sessionId, cycle: current?.cycle,
    phase: current?.phase, live: current?.live, assignedRoleId: current?.assignedRoleId,
    replacementRoleId: current?.replacementRoleId, activeConsoleRoleId: current?.activeConsoleRoleId })}`);
}

export async function chooseVisibleOption(select, predicate = option => Boolean(option.value)) {
  if (!await select.count() || !await select.isEnabled()) return null;
  const options = await select.locator('option').evaluateAll(elements => elements.map(element => ({
    value: element.value, text: element.textContent?.trim() ?? '', disabled: element.disabled,
  })));
  const option = options.find(option => !option.disabled && predicate(option));
  if (!option) return null;
  await select.selectOption(option.value);
  return option;
}

const PRIVATE_MASK = '[aria-label="Your private VIP cards"], [aria-label="Your private mission cards"], '
  + '.role-brief__copy, .role-brief__rules--arbour-vision, .role-brief__rules--facilitator-call, '
  + '.gorgoneion-mission-support__cards, .small-ship-jump-panel';

// Public procedure labels only. Never serialize the full SDK request: it may
// contain a raw UID, GM capability, private card ID or authored private content.
export const redactedProcedureFields = data => Object.fromEntries([
  'shipId', 'smallShipId', 'action', 'sourceConsoleId', 'resourceId', 'direction',
  'expectedHostShipId', 'range', 'sourceId',
].filter(field => typeof data?.[field] === 'string').map(field => [field, data[field]])
  .concat(['amount', 'expectedCycle', 'expectedRevision', 'expectedDockingRevision', 'expectedMovementRevision',
    'expectedCycleRevision', 'expectedTurn', 'use']
    .filter(field => typeof data?.[field] === 'number' || typeof data?.[field] === 'boolean')
    .map(field => [field, data[field]])));

/** One ordinary crew surface; persona anchors never become replacement Auth IDs. */
export class ExtraRoleActions {
  constructor({ context, plan, matrix, evidence, save, stage, directory }) {
    Object.assign(this, { context, plan, matrix, evidence, save, stage, directory });
    this.gmIdentity = null;
    this.replacements = new Set();
    this.craftHandedOff = new Map();
  }
  expected(anchorRoleId, roleId = anchorRoleId) {
    const actor = this.context.roster.find(actor => actor.roleId === anchorRoleId);
    assert.ok(actor?.uidHash, `An original admitted ${anchorRoleId} actor is required.`);
    return { sessionId: this.context.initial.sessionId, uidHash: actor.uidHash,
      anchorRoleId, roleId };
  }
  async inspectCrew(expected) {
    const observed = await this.context.crew.until('Original ordinary actor, private audience and empty outbox', value =>
      value.sameActor && value.sessionId === expected.sessionId && value.uidHash === expected.uidHash &&
      value.profileRoleId === expected.anchorRoleId && value.connection === 'live' && value.freshness === 'server' &&
      value.briefMatchesActor && value.briefRoleId === expected.roleId && value.pendingCommandCount === 0);
    const station = await publicState(this.context.crew);
    assertExtraActor(observed, station, expected);
    return { sessionId: observed.sessionId, uidHash: observed.uidHash,
      profileRoleId: observed.profileRoleId, roleId: observed.briefRoleId };
  }
  async inspectGm() {
    const gm = this.context.gm;
    const observed = await gm.until('Original normally authenticated owned live GM', value =>
      value.sameActor && value.sessionId === this.context.initial.sessionId && value.playerRole === 'gm' &&
      value.gmInstanceOwned && value.connection === 'live' && value.freshness === 'server' &&
      value.pendingCommandCount === 0);
    const identity = { sessionId: observed.sessionId, uidHash: observed.uidHash, instanceId: observed.instanceId };
    assert.ok(identity.instanceId);
    if (this.gmIdentity) assert.ok(JSON.stringify(identity) === JSON.stringify(this.gmIdentity), 'GM authority cannot be substituted to finish a scenario.');
    else this.gmIdentity = identity;
    return identity;
  }
  async select(anchorRoleId, roleId = anchorRoleId, route = '/brief') {
    const { crew, initial } = this.context;
    const expected = this.expected(anchorRoleId, roleId);
    const selector = crew.page.getByLabel('Current actor', { exact: true });
    if (await selector.inputValue() === anchorRoleId && new URL(crew.page.url()).hash === `#${route}`) {
      await this.inspectCrew(expected);
      return expected;
    }
    if (await selector.inputValue() !== anchorRoleId) {
      await selector.selectOption(anchorRoleId);
      await crew.page.waitForURL(url => url.searchParams.get('demoActor') === `${initial.sessionId}~${anchorRoleId}`);
    } else await crew.page.reload(); // actual interrupted-document restoration of the same SDK account
    await this.inspectCrew(expected);
    if (new URL(crew.page.url()).hash === '#/demo-actors') {
      await crew.page.getByRole('link', { name: "Enter this actor's stations", exact: true }).click();
    } else if (new URL(crew.page.url()).hash !== '#/console') {
      const roles = crew.page.locator('a[href$="/console"]').first();
      assert.ok(await roles.count(), 'The selected station must expose its real return-to-Roles link.');
      await roles.click();
    }
    await crew.page.waitForURL(url => url.hash === '#/console');
    if (route && route !== '/console') {
      if (route.startsWith('/shuttles/'))
        await crew.page.locator(`a[href$="/roles/${anchorRoleId}"]`).first().click();
      let offered = crew.page.locator(`a[href$="${route}"]`).first();
      // VIP/Commissar are ordinary offered replacement entries in the ship's
      // role chooser, rather than core entries on the station catalog.
      if (!await offered.count() && /^\/ships\/[^/]+\/roles\//.test(route)) {
        const parent = route.slice(0, route.lastIndexOf('/'));
        const shipRoles = crew.page.locator(`a[href$="${parent}"]`).first();
        assert.ok(await shipRoles.count(), 'The actual ship role chooser must be offered.');
        await shipRoles.click();
        offered = crew.page.locator(`a[href$="${route}"]`).first();
      }
      assert.ok(await offered.count(), `The current actor must be offered its actual route ${route}.`);
      await offered.click();
    }
    await this.inspectCrew(expected);
    return expected;
  }
  async inventory(expected, label) {
    await this.inspectCrew(expected);
    const { crew } = this.context;
    // Record only controls and their guidance. No private brief, card face, loyalty,
    // raw UID, card ID, or full page text enters this shareable action matrix.
    const controls = await crew.page.evaluate(() => {
      const privateElement = element => Boolean(element.closest('[aria-label="Your private mission cards"], '
        + '[aria-label="Your private VIP cards"], .gorgoneion-mission-support__cards, .role-brief__copy, '
        + '.role-brief__rules--arbour-vision, .role-brief__rules--facilitator-call, .small-ship-jump-panel'));
      const clean = value => String(value ?? '').replace(/Private card \S+/g, 'Private card [redacted]')
        .replace(/Discard \S+ secretly/g, 'Discard [private card] secretly');
      return {
        controls: [...document.querySelectorAll('main button')].filter(button => !privateElement(button))
          .map(button => ({ name: clean(button.textContent?.trim()), disabled: button.disabled,
            title: clean(button.getAttribute('title')), description: clean((button.getAttribute('aria-describedby') ?? '')
              .split(/\s+/).filter(Boolean).map(id => document.getElementById(id)?.textContent?.trim()).filter(Boolean).join(' ')) })),
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      };
    });
    this.evidence.surfaces.push({ label, anchorRoleId: expected.anchorRoleId, currentRoleId: expected.roleId,
      uidHash: expected.uidHash, currentPrivateAudienceVerified: true, emptyOutbox: true, ...controls });
    // Screenshot the offered controls, not the complete private brief document.
    const workspace = crew.page.locator('.extra-ship-workspace, .joint-engineering-console, .replacement-role-workspace').first();
    if (await workspace.count()) await workspace.screenshot({ path: `${this.directory}/${label}-controls.png`, mask: crew.page.locator(PRIVATE_MASK) });
    await this.save();
  }
  block(id, blocker, nextActor) {
    const row = this.matrix.find(row => row.id === id);
    assert.ok(row, id);
    recordExtraRoleResult(this.matrix, id, { status: 'blocked', blocker,
      nextActor: nextActor ?? row.nextActor, at: new Date().toISOString() });
    return this.save();
  }
  async offered(id, locator, scope, nextActor) {
    const readyBy = Date.now() + 3_000;
    while (await locator.count() && await locator.isVisible() && !await locator.isEnabled() && Date.now() < readyBy)
      await delay(150); // bounded real render/ack settlement, never promote cached authority
    if (await locator.count() && await locator.isVisible() && await locator.isEnabled()) return true;
    const row = this.matrix.find(row => row.id === id);
    const description = await scope.evaluate(element => [...element.querySelectorAll('[role="status"], [role="alert"]')]
      .filter(node => !node.closest('[aria-label="Your private VIP cards"], [aria-label="Your private mission cards"], '
        + '.gorgoneion-mission-support__cards, .role-brief__copy, .role-brief__rules--arbour-vision, .role-brief__rules--facilitator-call'))
      .slice(0, 10).map(node => node.textContent?.trim()).filter(Boolean).join(' ')).catch(() => 'Control not mounted on the current actual station.');
    await this.block(id, description || row.prerequisite, nextActor);
    return false;
  }
  async ui(surface, endpoint, locator, { id, expected, replay = false, trainingChoice, prepare } = {}) {
    const inspect = expected ? () => this.inspectCrew(expected) : () => this.inspectGm();
    await inspect();
    await prepare?.();
    let data, result;
    const receipt = await guardExtraRoleCommand({ inspect, perform: async () => {
      const response = await observeUiReceipt({ page: surface.page, consumed: { endpoint },
        waitForResponse: () => surface.page.waitForResponse(response => new URL(response.url()).pathname.endsWith(`/us-central1/${endpoint}`)
          && response.request().method() === 'POST', { timeout: 45_000 }),
        choose: () => locator.click(),
      });
      const body = await response.json();
      data = response.request().postDataJSON()?.data;
      result = body.result;
      assert.equal(data?.sessionId, this.context.initial.sessionId, 'Only the UI-issued current-session request may count.');
      if (result?.sessionId !== undefined) assert.equal(result.sessionId, data.sessionId);
      if (result?.requestId !== undefined) assert.equal(result.requestId, data.requestId);
      const status = body.error || !result || typeof result !== 'object' || Array.isArray(result) ||
        ['stale', 'denied', 'rejected', 'invalid'].includes(result?.status) ? 'denied' : 'committed';
      return { endpoint, httpStatus: response.status(), logicalStatus: status, requestId: data?.requestId,
        requestFields: redactedProcedureFields(data),
        transport: 'ordinary-ui', ...(trainingChoice ? { trainingChoice } : {}), at: new Date().toISOString() };
    } });
    this.evidence.receipts.push(receipt);
    if (id) recordExtraRoleResult(this.matrix, id, { status: 'committed', receipt });
    if (replay) {
      await inspect();
      const repeated = await surface.callable(endpoint, data);
      assert.equal(repeated.status, 'committed', 'Only the identical actual UI request may be replayed.');
      assert.ok(!['stale', 'denied', 'rejected', 'invalid'].includes(repeated.result?.status));
      await inspect();
      receipt.exactOrdinarySdkReplayAccepted = true;
    }
    await this.save();
    return { receipt, data, result };
  }
  async sdk(surface, endpoint, data, { id, expected, trainingChoice, replay = false } = {}) {
    const inspect = expected ? () => this.inspectCrew(expected) : () => this.inspectGm();
    const identity = await inspect();
    assert.equal(data.sessionId, identity.sessionId);
    if (!expected) assert.equal(data.instanceId, identity.instanceId);
    let result;
    const receipt = await guardExtraRoleCommand({ inspect, perform: async () => {
      const response = await surface.callable(endpoint, data);
      result = response.result;
      if (result?.sessionId !== undefined) assert.equal(result.sessionId, data.sessionId);
      if (result?.requestId !== undefined) assert.equal(result.requestId, data.requestId);
      return { endpoint, httpStatus: response.status === 'committed' ? 200 : null,
        logicalStatus: response.status === 'committed' && !['stale', 'denied', 'rejected', 'invalid'].includes(result?.status) ? 'committed' : 'denied',
        requestId: data.requestId, transport: 'ordinary-sdk', trainingChoice,
        requestFields: redactedProcedureFields(data),
        at: new Date().toISOString() };
    } });
    this.evidence.receipts.push(receipt);
    if (id) recordExtraRoleResult(this.matrix, id, { status: 'committed', receipt });
    if (replay) {
      const repeated = await surface.callable(endpoint, data);
      assert.equal(repeated.status, 'committed');
      assert.ok(!['stale', 'denied', 'rejected', 'invalid'].includes(repeated.result?.status));
      await inspect();
      receipt.exactOrdinarySdkReplayAccepted = true;
    }
    await this.save();
    return { receipt, data, result };
  }
  async gmPayload(fields) {
    return { sessionId: this.context.initial.sessionId, instanceId: (await this.inspectGm()).instanceId,
      requestId: randomUUID(), ...fields };
  }
  async crewPayload(fields) { return { sessionId: this.context.initial.sessionId, requestId: randomUUID(), ...fields }; }
  async damage(shipId) {
    const before = await publicState(this.context.gm);
    if (before.damage?.[shipId]?.damagedSystemIds?.length) return true;
    const { result } = await this.sdk(this.context.gm, 'addShipDamage', await this.gmPayload({
      shipId, expectedRevision: before.vesselRevisions?.[shipId] ?? 0,
    }), { trainingChoice: 'Explicit ordinary GM training damage choice; server deck/random outcome unforced.' });
    // A legitimate armour recycle creates no repair target. Retain that real
    // outcome; do not repeat the random draw just to make a repair branch pass.
    if (result?.destroyed || result?.recycled === true) return false;
    await untilPublic(this.context.gm, 'Actual random damage projection', state => state.live &&
      Boolean(state.damage?.[shipId]?.damagedSystemIds?.length || state.damage?.[shipId]?.destroyed));
    return !(await publicState(this.context.gm)).damage?.[shipId]?.destroyed;
  }
  async coordination() {
    const state = await publicState(this.context.gm);
    if (state.airspace === 'lifted') return;
    assert.equal(state.airspace, 'restricted');
    await this.ui(this.context.gm, 'advanceFullGameDemoPhase',
      this.context.gm.page.getByRole('button', { name: 'Open Coordination manually', exact: true }),
      { trainingChoice: 'Normal live GM opens manual Coordination after current source prerequisites.' });
    await this.context.gm.until('Actual manual Coordination', value => value.cycle === state.cycle && value.airspace === 'lifted');
  }
}
