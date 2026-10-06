import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createTwoBrowserGameplay } from './pc10-two-browser-gameplay.mjs';
import { readActionState } from './pc10-pending-procedure-ui-recipes.mjs';
import { observeLifecycleActor } from './pc10-member-gm-lifecycle-ui-proof.mjs';
import { assertOriginalActor, assertLateReplyAuthority } from './pc10-member-gm-lifecycle-contracts.mjs';
import { readWolfActor } from './pc10-private-actions-ui-proof.mjs';
import { assertLiveWolfActorFence, assertSameWolfActorFence } from './pc10-private-actions-proof-contracts.mjs';
import { observeUiReceipt } from './pc10-browser-ui-receipt.mjs';

const ROLE = 'executive-officer', SHUTTLE = 'pallas', HOST = 'aegis', RESOURCE = 'securityTeams', AMOUNT = 2;
const hashUid = value => typeof value === 'string' ? createHash('sha256').update(value).digest('hex').slice(0, 16) : null;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const inventory = value => record(value) && Object.keys(value).every(key =>
  ['ore', 'fuel', 'food', 'water', 'materials', 'securityTeams', 'scrap'].includes(key)) &&
  Object.values(value).every(amount => Number.isSafeInteger(amount) && amount >= 0);

/** One normal Pallas load before the original EO spends its Wolf action slot.
 * The generic core cargo recipe and its one-unit choices remain unchanged.
 */
export async function prepareWolfSupplyCargo(context, actor) {
  const { gm, crew, initial, started } = context;
  const deadlineAt = Date.now() + 60_000;
  const remaining = maximum => {
    assert.ok(Date.now() < deadlineAt, 'The original supply preparation deadline is exhausted.');
    return Math.max(1, Math.min(maximum, deadlineAt - Date.now()));
  };
  const blocked = reason => ({ status: 'blocked', normalCargoLoadObserved: false, reason });
  assert.equal(actor?.roleId, ROLE);
  assert.equal(context.roster.filter(row => row.roleId === ROLE && row.uidHash === actor.uidHash).length, 1);
  const originalGm = await observeLifecycleActor(gm, initial.sessionId);
  assertOriginalActor(originalGm, originalGm, { gm: true });
  assert.equal(originalGm.uidHash, initial.uidHash); assert.equal(originalGm.uidHash, started.uidHash);
  assert.equal(originalGm.instanceId, started.instanceId);
  assert.ok(typeof originalGm.claimedAt === 'string' && Number.isFinite(Date.parse(originalGm.claimedAt)));
  assert.ok(Number.isSafeInteger(originalGm.hydrationRevision) && originalGm.hydrationRevision >= 1);
  const originalGmDocument = (await gm.observe()).documentTimeOrigin;
  assert.ok(Number.isFinite(originalGmDocument) && originalGmDocument > 0);
  async function holdGm() {
    remaining(60_000);
    const current = await observeLifecycleActor(gm, initial.sessionId);
    assertLateReplyAuthority(originalGm, current);
    assert.equal(current.cycle, 1); assert.equal(current.phase, 'active');
    assert.deepEqual(current.fullGameDemo, { status: 'active', progression: 'manual' });
    assert.equal(current.phaseProgression, 'manual');
    assert.equal((await gm.observe()).documentTimeOrigin, originalGmDocument);
    remaining(60_000);
    return current;
  }
  const currentGm = await holdGm();
  if (currentGm.airspace === 'restricted') {
    const open = gm.page.getByRole('button', { name: 'Open Coordination manually', exact: true });
    if (await open.count() !== 1 || !await open.isVisible() || !await open.isEnabled()) {
      return blocked('The original GM has no enabled normal manual Coordination control.');
    }
    await holdGm(); await open.click({ timeout: remaining(35_000) });
    await gm.until('Normal manual Coordination before Pallas cargo transfer', state =>
      state.sameActor && state.sessionId === initial.sessionId && state.uidHash === originalGm.uidHash &&
      state.instanceId === originalGm.instanceId && state.gmInstanceOwned &&
      state.connection === 'live' && state.freshness === 'server' && state.cycle === 1 &&
      state.phase === 'active' && state.phaseProgression === 'manual' && state.airspace === 'lifted', remaining(60_000));
  }
  assert.equal((await holdGm()).airspace, 'lifted');
  const game = createTwoBrowserGameplay(context);
  await game.select(ROLE, { deadlineAt });
  const wolfBefore = await readWolfActor(crew);
  const wolfFence = assertLiveWolfActorFence(wolfBefore, { sessionId: initial.sessionId,
    uidHash: actor.uidHash, roleId: ROLE, cycle: 1 });
  const before = await readActionState(crew, SHUTTLE);
  const authority = before?.currentDocumentAuthority;
  assert.ok(authority, 'The original EO current-member document and craft audience must be confirmed.');
  assert.equal(authority.uidHash, actor.uidHash); assert.equal(authority.roleId, ROLE);
  assert.equal(authority.sessionId, initial.sessionId); assert.equal(authority.groupId, wolfBefore.fleetGroupId);
  assert.equal(authority.shuttleAuthorized, true);
  const control = before.shuttleControl?.[SHUTTLE];
  const docking = before.shuttleDockings?.filter(row => row.shuttleId === SHUTTLE);
  if (!control || control.shuttleId !== SHUTTLE || control.ownerRoleId !== ROLE ||
      hashUid(control.ownerUid) !== actor.uidHash || hashUid(control.holderUid) !== actor.uidHash ||
      !Number.isSafeInteger(control.revision) || control.revision < 0 || docking?.length !== 1 ||
      docking[0].shipId !== HOST || !before.activeVesselIds?.includes(HOST) ||
      before.currentMemberScope?.groupId !== authority.groupId ||
      !before.currentMemberScope.vesselIds.includes(HOST) || !before.currentMemberScope.craftIds.includes(SHUTTLE)) {
    return blocked('The original EO must hold Pallas at one current same-group AEGIS berth.');
  }
  const shipInventory = before.shipResources?.[HOST], cargoRoot = before.shuttleCargo ?? {};
  const shuttleInventory = cargoRoot[SHUTTLE] === undefined ? {} : cargoRoot[SHUTTLE];
  if (!inventory(shipInventory) || !Object.hasOwn(shipInventory, RESOURCE) ||
      !record(cargoRoot) || !inventory(shuttleInventory)) return blocked('Current source cargo inventories are not safely readable.');
  const hostAmount = shipInventory[RESOURCE], shuttleAmount = shuttleInventory[RESOURCE] ?? 0;
  if (hostAmount < AMOUNT || shuttleAmount > Number.MAX_SAFE_INTEGER - AMOUNT) {
    return blocked('Current AEGIS stock or Pallas capacity cannot support the normal two-team load.');
  }
  async function holdCrew({ afterLoad = false } = {}) {
    remaining(60_000); await holdGm();
    assertSameWolfActorFence(wolfFence, await readWolfActor(crew));
    const state = await readActionState(crew, SHUTTLE);
    assert.equal(state?.live, true); assert.equal(state.sessionId, initial.sessionId);
    assert.equal(state.cycle, 1); assert.equal(state.phase, 'active');
    assert.equal(state.turnPhase?.progression, 'manual'); assert.equal(state.turnPhase?.airspace.state, 'lifted');
    assert.deepEqual(state.currentDocumentAuthority, authority, 'The accepted EO document, hydration, group and private audience must remain current.');
    assert.deepEqual(state.shuttleControl?.[SHUTTLE], control, 'Pallas custody changed during the source load.');
    assert.deepEqual(state.shuttleDockings?.filter(row => row.shuttleId === SHUTTLE), docking);
    assert.equal(state.activeVesselIds?.includes(HOST), true);
    assert.equal(state.currentMemberScope?.vesselIds.includes(HOST), true);
    if (!afterLoad) {
      assert.deepEqual(state.shipResources?.[HOST], shipInventory, 'Current AEGIS inventory changed before the load.');
      assert.deepEqual(state.shuttleCargo?.[SHUTTLE] ?? {}, shuttleInventory, 'Current Pallas cargo changed before the load.');
    }
    remaining(60_000);
    return state;
  }
  await holdCrew();
  if (new URL(crew.page.url()).hash !== `#/shuttles/${SHUTTLE}`) {
    const route = crew.page.getByRole('link', { name: 'Open Pallas shuttle console', exact: true })
      .and(crew.page.locator(`a[href$="/shuttles/${SHUTTLE}"]`));
    if (await route.count() !== 1 || !await route.isVisible()) return blocked('The current EO has no unique mounted Pallas navigation control.');
    await holdCrew(); await route.click({ timeout: remaining(35_000) });
    await crew.page.waitForURL(url => url.hash === `#/shuttles/${SHUTTLE}`, { timeout: remaining(10_000) });
    await holdCrew();
  }
  const panel = crew.page.getByRole('region', { name: 'Shuttle cargo transfer', exact: true });
  await panel.waitFor({ state: 'visible', timeout: remaining(35_000) });
  if (await panel.count() !== 1 || !await panel.isVisible()) return blocked('The current Pallas cargo form is not mounted uniquely.');
  const resource = panel.getByLabel('Resource', { exact: true }), amount = panel.getByLabel('Amount', { exact: true });
  if (await resource.count() !== 1 || !await resource.isVisible() || !await resource.isEnabled() ||
      await amount.count() !== 1 || !await amount.isVisible() || !await amount.isEnabled()) {
    return blocked('The current EO cannot edit the source cargo controls.');
  }
  const options = await resource.locator('option').evaluateAll(nodes => nodes.filter(node => node.value)
    .map(node => ({ value: node.value, disabled: node.disabled })));
  if (options.length !== 1 || options[0].value !== RESOURCE || options[0].disabled) {
    return blocked('The mounted Pallas form does not offer its printed security-teams-only cargo.');
  }
  await resource.selectOption(RESOURCE, { timeout: remaining(35_000) });
  await amount.fill(String(AMOUNT), { timeout: remaining(35_000) });
  const load = panel.getByRole('button', { name: 'Load shuttle', exact: true });
  if (await load.count() !== 1 || !await load.isVisible() || !await load.isEnabled()) return blocked('The source two-team load is not currently enabled.');
  const response = await observeUiReceipt({
    waitForResponse: () => crew.page.waitForResponse(value => value.request().method() === 'POST' &&
      new URL(value.url()).pathname.endsWith('/us-central1/transferShuttleCargoCommand'), { timeout: remaining(60_000) }),
    choose: async () => {
      await holdCrew(); assert.equal(new URL(crew.page.url()).hash, `#/shuttles/${SHUTTLE}`);
      assert.equal(await load.count(), 1); assert.equal(await load.isVisible(), true); assert.equal(await load.isEnabled(), true);
      assert.equal(await resource.inputValue(), RESOURCE); assert.equal(await amount.inputValue(), String(AMOUNT));
      await load.click({ timeout: remaining(35_000) });
    },
  });
  remaining(60_000);
  assert.equal(response.status(), 200);
  const request = response.request().postDataJSON()?.data, result = (await response.json()).result;
  assert.ok(record(request) && record(result));
  assert.deepEqual(Object.keys(request).sort(), ['sessionId', 'requestId', 'shuttleId', 'resourceId', 'direction', 'amount', 'expectedControlRevision'].sort());
  assert.ok(typeof request.requestId === 'string' && /^[\w-]{1,128}$/.test(request.requestId));
  assert.equal(request.sessionId, initial.sessionId); assert.equal(request.shuttleId, SHUTTLE);
  assert.equal(request.resourceId, RESOURCE); assert.equal(request.direction, 'load');
  assert.equal(request.amount, AMOUNT); assert.equal(request.expectedControlRevision, control.revision);
  assert.deepEqual(result, { status: 'committed', sessionId: initial.sessionId, requestId: request.requestId,
    shuttleId: SHUTTLE, hostShipId: HOST, resourceId: RESOURCE, direction: 'load', amount: AMOUNT,
    shipAmount: hostAmount - AMOUNT, shuttleAmount: shuttleAmount + AMOUNT });
  await holdCrew({ afterLoad: true });
  const replay = await crew.callable('transferShuttleCargoCommand', request);
  assert.equal(replay.status, 'committed'); assert.deepEqual(replay.result, { ...result, status: 'replayed' });
  let balancesMatched = false;
  while (!balancesMatched) {
    const current = await holdCrew({ afterLoad: true }), gmState = await readActionState(gm);
    assert.equal(gmState?.live, true); assert.equal(gmState.sessionId, initial.sessionId);
    assert.equal(gmState.cycle, 1); assert.equal(gmState.phase, 'active');
    if (current.shipResources?.[HOST]?.[RESOURCE] === result.shipAmount && current.shuttleCargo?.[SHUTTLE]?.[RESOURCE] === result.shuttleAmount &&
        gmState.shipResources?.[HOST]?.[RESOURCE] === result.shipAmount && gmState.shuttleCargo?.[SHUTTLE]?.[RESOURCE] === result.shuttleAmount) balancesMatched = true;
    if (!balancesMatched) await delay(Math.min(250, remaining(60_000)));
  }
  const visible = panel.getByRole('status').filter({ hasText: 'Loaded 2 Security Teams.' });
  await visible.waitFor({ state: 'visible', timeout: remaining(60_000) });
  await holdCrew({ afterLoad: true });
  return { status: 'committed', normalCargoLoadObserved: true, amount: AMOUNT,
    currentHostStockAndCapacityObserved: true, uiRequestAndReplyCaptured: true,
    exactAuthenticatedSdkReplay: true, currentGmAndEntitledCrewBalancesMatched: true,
    originalActorDocumentGroupAndControlHeld: true };
}
