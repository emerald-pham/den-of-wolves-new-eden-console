import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { createPc07AuthenticatedSession } from './pc07-authenticated-session.mjs';
import { runPc08UnionScenario as runUnionScenario } from './pc08-union-proof.mjs';

const evidencePath = process.env.PC08_DRADIS_EVIDENCE_PATH;
const uiDirectory = process.env.PC08_DRADIS_UI_DIR;
const localEmulatorEnv = Object.fromEntries((await readFile('.env.emulators.local', 'utf8'))
  .trim().split('\n').map(line => line.split('=')));
const appOrigin = process.env.PC08_DRADIS_APP_ORIGIN ??
  `http://127.0.0.1:${localEmulatorEnv.VITE_DEV_SERVER_PORT}`;
process.env.PC07_LOCAL_GM_ORIGIN ??= appOrigin;
assert.ok(evidencePath && uiDirectory, 'External PC08 evidence and UI paths are required.');
await mkdir(uiDirectory, { recursive: true });

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { ROLE_OWNED_CRAFT_CATALOG } = require('../functions/lib/craftOwnership.js');
const { SHIP_DAMAGE_DECKS } = require('../functions/lib/shipDamage.js');
const hostIds = ['aegis', 'dione', 'icebreaker', 'capybara', 'shepherd', 'quellon', 'refinery-124'];
const rolesByHost = {
  aegis: ['admiral', 'executive-officer', 'wing-commander'],
  dione: ['dione-captain', 'dione-engineer', 'dione-president'],
  icebreaker: ['icebreaker-captain', 'icebreaker-engineer', 'icebreaker-miner'],
  capybara: ['capybara-captain', 'capybara-recycler'],
  shepherd: ['shepherd-captain', 'shepherd-engineer', 'shepherd-scientist'],
  quellon: ['quellon-captain', 'quellon-engineer', 'quellon-explorer'],
  'refinery-124': ['refinery-124-captain', 'refinery-124-engineer', 'refinery-124-pdf-colonel'],
};
const standardShuttleOwner = Object.fromEntries(ROLE_OWNED_CRAFT_CATALOG
  .filter(craft => craft.kind === 'shuttle' && craft.enabledMode === 'standard')
  .map(craft => [craft.id, craft.ownerRoleId]));
const fleetShuttles = Object.keys(standardShuttleOwner).sort();
const fighterWingHosts = {
  'fighter-wing-alpha': { ownerRoleId: 'wing-commander', hostShipId: 'aegis' },
  'fighter-wing-bravo': { ownerRoleId: 'wing-commander', hostShipId: 'aegis' },
  'pdf-escort-fighter-wing': { ownerRoleId: 'refinery-124-pdf-colonel', hostShipId: 'refinery-124' },
};
function expectedFighterWingRows(activeRoleIds, ships) {
  return Object.entries(fighterWingHosts).flatMap(([wingId, printed]) =>
    activeRoleIds.includes(printed.ownerRoleId) && ships.some(ship => ship.shipId === printed.hostShipId)
      ? [{ wingId, fleetGroupId: ships[0]?.fleetGroupId, hostShipId: printed.hostShipId }]
      : []).sort((left, right) => left.wingId.localeCompare(right.wingId));
}
function expectedAttackCraftIds(activeRoleIds, enabledUnionCraftIds = []) {
  const active = new Set(activeRoleIds);
  const enabledUnion = new Set(enabledUnionCraftIds);
  return ROLE_OWNED_CRAFT_CATALOG.filter(craft =>
    (craft.ownerRoleId === 'press-officer' || active.has(craft.ownerRoleId)) &&
    (craft.enabledMode === 'standard' || enabledUnion.has(craft.id)))
    .map(craft => craft.id).sort();
}
assert.equal(fleetShuttles.length, 15, 'The standard roster has fifteen printed shuttle types.');
const waveOne = ['starlight', 'pallas', 'snn-press-shuttle', 'highwall', 'macaw', 'endeavour', 'hummingbird', 'chacau'];
const waveTwo = ['maliades', 'philia', 'blacksmith', 'boa', 'black-sheep', 'condor', 'chepu'];
assert.deepEqual([...waveOne, ...waveTwo].sort(), fleetShuttles);

let browser;
let playerContext;
let playerPage;
let pressContext;
const browserErrors = [];

async function joinUiPlayer(joinCode, roleName) {
  if (!browser) browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  page.on('pageerror', error => browserErrors.push(error.message));
  if (roleName === 'wing-commander') {
    await page.addInitScript(() => {
      window.__pc08FirstScaleAnimations = [];
      window.__pc08FirstScaleCancellations = [];
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (keyframes, timing) {
        const animation = animate.call(this, keyframes, timing);
        if (Array.isArray(keyframes) && keyframes[0]?.transform === 'scale(2)') {
          const contact = this.closest('.contact-plot__contact');
          // The first-scale acceptance follows an ordinary stationary return,
          // not a temporary ambient contact or an in-flight object that may
          // correctly leave the current sample before its paint completes.
          if (!contact || contact.dataset.ambient === 'true' || contact.dataset.moving === 'true') return animation;
          const id = `${performance.now()}-${window.__pc08FirstScaleAnimations.length}`;
          const plot = contact.closest('.contact-plot');
          const shipPlot = contact.closest('.ship-plot');
          window.__pc08FirstScaleAnimations.push({ id, animation, capturedAt: performance.now(),
            contact, plot, shipPlot, routeHash: location.hash,
            contactLabel: contact.querySelector('.contact-plot__tag')?.textContent.trim() ?? '',
            ambient: contact.dataset.ambient, moving: contact.dataset.moving,
            plotCountAtCapture: document.querySelectorAll('.contact-plot').length });
          animation.addEventListener('cancel', () => window.__pc08FirstScaleCancellations.push({
            id, cancelledAt: performance.now(), contactConnected: contact.isConnected,
            contactLabel: contact.querySelector('.contact-plot__tag')?.textContent.trim() ?? '',
            ambient: contact.dataset.ambient, moving: contact.dataset.moving,
            routeHash: location.hash, plotConnected: plot?.isConnected ?? false,
            shipPlotConnected: shipPlot?.isConnected ?? false,
            currentPlotCount: document.querySelectorAll('.contact-plot').length,
            currentHeading: document.querySelector('h1')?.textContent.trim() ?? null,
            motion: document.documentElement.dataset.motion,
          }), { once: true });
        }
        return animation;
      };
    });
  }
  await page.bringToFront();
  await page.goto(appOrigin);
  const reduced = page.getByRole('button', { name: /^REDUCED MOTION/i });
  const normal = page.getByRole('button', { name: /^NORMAL MOTION/i });
  if (await reduced.count()) await normal.click();
  await page.getByRole('textbox', { name: 'Session code', exact: true }).fill(joinCode);
  await page.getByRole('button', { name: 'Join a session', exact: true }).click();
  await page.getByRole('dialog', { name: 'CODE OF CONDUCT', exact: true }).waitFor();
  const waiverCheckboxes = await page.getByRole('checkbox', { name: /^Acknowledge regulation/ }).all();
  assert.equal(waiverCheckboxes.length, 3, 'The current conduct gate presents each regulation.');
  for (const checkbox of waiverCheckboxes) {
    await checkbox.check();
  }
  const acknowledge = page.getByRole('button', { name: 'Acknowledge regulations and continue', exact: true });
  try {
    await page.waitForFunction(() => {
      const checkboxes = [...document.querySelectorAll('.session-waiver__check input[type="checkbox"]')];
      const button = document.querySelector('.session-waiver__acknowledge');
      return checkboxes.length === 3 && checkboxes.every(checkbox => checkbox.checked) &&
        button instanceof HTMLButtonElement && !button.disabled;
    }, null, { timeout: 45000 });
  } catch (error) {
    const waiverState = await page.evaluate(async () => {
      const checkboxes = [...document.querySelectorAll('.session-waiver__check input[type="checkbox"]')];
      const button = document.querySelector('.session-waiver__acknowledge');
      const [{ useSessionStore }, { auth }] = await Promise.all([
        import('/src/store/useSessionStore.ts'), import('/src/lib/firebase.ts'),
      ]);
      const sessionState = useSessionStore.getState();
      return { checkboxCount: checkboxes.length, checked: checkboxes.map(checkbox => checkbox.checked),
        buttonDisabled: button instanceof HTMLButtonElement ? button.disabled : null,
        countdown: document.querySelector('.session-waiver__countdown')?.textContent ?? null,
        dialogVisible: Boolean(document.querySelector('[role="dialog"]')),
        url: location.href, heading: document.querySelector('h1')?.textContent ?? null,
        sessionReady: Boolean(sessionState.me && auth().currentUser && sessionState.connection === 'live' &&
          sessionState.sessionSnapshotFreshness === 'server') };
    });
    await page.screenshot({ path: uiDirectory + '/conduct-timeout.png', fullPage: true }).catch(() => undefined);
    throw new Error('Authenticated UI conduct gate did not become ready: ' + JSON.stringify(waiverState),
      { cause: error });
  }
  await acknowledge.click();
  const sessionReadyDeadline = Date.now() + 30000;
  let sessionReady = false;
  while (Date.now() < sessionReadyDeadline && !sessionReady) {
    sessionReady = await page.evaluate(async () => {
      const [{ useSessionStore }, { auth }] = await Promise.all([
        import('/src/store/useSessionStore.ts'), import('/src/lib/firebase.ts'),
      ]);
      const state = useSessionStore.getState();
      return Boolean(state.me && auth().currentUser && state.connection === 'live' &&
        state.sessionSnapshotFreshness === 'server');
    });
    if (!sessionReady) await page.waitForTimeout(100);
  }
  assert.ok(sessionReady, 'The authenticated browser must receive its current session before rendering.');
  const actor = await page.evaluate(async () => {
    const { auth } = await import('/src/lib/firebase.ts');
    return { localId: auth().currentUser.uid, idToken: await auth().currentUser.getIdToken() };
  });
  if (roleName === 'wing-commander') {
    playerContext = context;
    playerPage = page;
  } else {
    pressContext = context;
  }
  return actor;
}

async function joinPressPlayer(joinCode) {
  return joinUiPlayer(joinCode, 'press-officer');
}

const f = await createPc07AuthenticatedSession('PC08 authenticated DRADIS shuttle catalog', 20, {
  keepAlive: true,
  expansion: 'capybara',
  capybaraEnabled: true,
  browserRoleId: 'wing-commander',
  joinBrowserPlayer: joinCode => joinUiPlayer(joinCode, 'wing-commander'),
  joinPressPlayer,
});
const { db, session, sessionId, gm, press, instanceId, call, ok, roles } = f;
console.log('PC08 DRADIS: 20-player authenticated session and normal role setup committed.');
const navigationRef = db.doc('sessions/' + sessionId + '/serverState/navigation');
const checks = {};
const actions = [];
const alertAcknowledgements = [];

async function command(actor, name, data = {}) {
  const payload = { sessionId, ...data };
  let reply = await call(actor, name, payload);
  for (let retry = 0; reply.status === 429 && retry < 12; retry++) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    reply = await call(actor, name, payload);
  }
  const result = ok(reply, name);
  assert.notEqual(result?.status, 'stale', name + ' returned stale authority.');
  actions.push({ name, status: result?.status ?? 'committed' });
  return result;
}

async function denied(actor, name, data = {}) {
  let reply = await call(actor, name, { sessionId, ...data });
  for (let retry = 0; reply.status === 429 && retry < 12; retry++) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    reply = await call(actor, name, { sessionId, ...data });
  }
  assert.notEqual(reply.status, 200, name + ' must be denied.');
  assert.ok(['FAILED_PRECONDITION', 'PERMISSION_DENIED', 'INVALID_ARGUMENT'].includes(reply.error.status),
    name + ' returned an unexpected denial.');
  return reply;
}

async function hostOf(actor) {
  const player = await db.doc('sessions/' + sessionId + '/players/' + actor.localId).get();
  const berth = (await db.doc('sessions/' + sessionId + '/fleetGroups/' + player.get('fleetGroupId')).get())
    .get('memberShipIds')?.[actor.localId];
  return berth ?? null;
}

function actorForRole(roleId) {
  return roleId === 'press-officer' ? press : f.byRole(roleId);
}

function otherHostRole(host, ownerRoleId) {
  return rolesByHost[host].find(roleId => roleId !== ownerRoleId) ?? rolesByHost[host][0];
}

async function dockingHost(shuttleId) {
  const current = (await session.get()).get('shuttleDockings') ?? [];
  const match = current.filter(docking => docking.shuttleId === shuttleId);
  assert.equal(match.length, 1, shuttleId + ' must have exactly one current docking.');
  return match[0].shipId;
}

async function openAirspace(cycle) {
  const phase = (await session.get()).get('turnPhase');
  // Only disposable local clock deadlines are accelerated. Every airspace,
  // departure, transit and arrival transition goes through a normal actor.
  await session.update({ turnPhase: { ...phase,
    teamPhaseEndsAt: new Date(Date.now() - 1000).toISOString(),
    openAirspaceEndsAt: new Date(Date.now() + 600000).toISOString(),
  } });
  await command(f.byRole('wing-commander'), 'beginOpenAirspacePhase', { expectedTurn: cycle });
}

async function advanceCycle() {
  await command(gm, 'advanceTurn', {
    instanceId, requestId: randomUUID(), expectedTurn: (await session.get()).get('currentTurn'),
    overridePhaseTimer: true,
  });
  const turnPhase = (await session.get()).get('turnPhase');
  const pause = turnPhase.timerPause;
  await command(f.byRole('executive-officer'), 'clearTurnAdvanceInterstitial', {
    requestId: randomUUID(), expectedCycle: turnPhase.turn, expectedPausedAt: pause.pausedAt,
  });
}

async function grantHost(shipId, lease) {
  await command(gm, 'setGmShipConsoleWriteGrant', {
    instanceId, shipId, enabled: true,
    claimedAt: typeof lease.claimedAt === 'string' ? lease.claimedAt : lease.claimedAt.toDate().toISOString(),
  });
}

async function acknowledgeShipAlerts(shipId, cycle) {
  const dismissed = [];
  for (const [field, action] of [['unrestAlerts', 'dismissUnrestAlert'],
    ['populationAlerts', 'dismissPopulationAlert']]) {
    const current = (await session.get()).data();
    if (!current[field]?.[shipId]) continue;
    const expectedRevision = current.vesselActionRevisions?.[shipId] ?? 0;
    const result = await command(gm, action, {
      instanceId, shipId, requestId: randomUUID(), expectedRevision,
    });
    assert.equal(result.dismissed, true, 'A GM must explicitly acknowledge the current ship alert.');
    dismissed.push(action);
    alertAcknowledgements.push({ cycle, shipId, action, expectedRevision, nextRevision: result.revision });
  }
  return dismissed;
}

async function maintainHost(shipId, refuelledShuttleIds, cycle, lease) {
  await grantHost(shipId, lease);
  await acknowledgeShipAlerts(shipId, cycle);
  const bays = SHIP_DAMAGE_DECKS[shipId]
    .filter(card => card.systemId.startsWith('shuttle-bay'))
    .map(card => card.systemId);
  const bayCount = shipId === 'aegis' ? 2 : 1;
  const steps = ['begin', 'storage', 'rations', 'unrest', 'riot', 'reactor',
    ...Array(bayCount).fill('bays'), 'end'];
  let revision = (await session.get()).get('maintenanceCycles')?.[shipId]?.revision ?? 0;
  let bayIndex = 0;
  for (const action of steps) {
    if (action === 'reactor' &&
        (await session.get()).get('shipDamage')?.[shipId]?.damagedSystemIds?.length) {
      await command(gm, 'repairAllShipDamage', {
        instanceId, shipId, requestId: randomUUID(),
        expectedRevision: (await session.get()).get('vesselActionRevisions')?.[shipId] ?? 0,
      });
    }
    let refuels = {};
    if (action === 'bays') {
      const selected = refuelledShuttleIds[bayIndex];
      const bayId = shipId === 'aegis'
        ? (bayIndex === 0 ? 'shuttle-bay-zeta' : 'shuttle-bay-omega')
        : bays[0];
      if (selected) refuels = { [bayId]: selected };
      bayIndex += 1;
    }
    const result = await command(gm, 'runMaintenance', {
      instanceId, shipId, action, expectedRevision: revision, requestId: randomUUID(),
      ...(action === 'rations' ? { foodLevel: 1, waterLevel: 1 } : {}),
      ...(action === 'reactor' ? { consoles: ['jump-drive'] } : {}),
      ...(action === 'bays' ? { refuels } : {}),
    });
    revision = result.cycle.revision;
  }
  const current = (await session.get()).data();
  assert.equal(current.maintenanceCycles[shipId].turn, cycle);
  for (const shuttleId of refuelledShuttleIds) assert.equal(current.shuttleFuelled[shuttleId], true);
}

async function maintainWave(cycle, assignments, lease) {
  for (const shipId of hostIds) await maintainHost(shipId, assignments[shipId] ?? [], cycle, lease);
}

async function sample(actor) {
  const player = await db.doc('sessions/' + sessionId + '/players/' + actor.localId).get();
  const navigation = await navigationRef.get();
  const expectedGroupId = player.get('fleetGroupId');
  const result = await command(actor, 'readFleetGroupNavigation', {
    requestId: randomUUID(), expectedGroupId,
    expectedNavigationRevision: navigation.get('revision'),
    expectedFleetPartitionRevision: (await session.get()).get('fleetPartitionRevision') ?? 0,
  });
  assert.equal(result.groupId, expectedGroupId);
  return result;
}

async function launchShuttle(shuttleId, destinationShipId, actor = actorForRole(standardShuttleOwner[shuttleId])) {
  const before = (await session.get()).data();
  const control = before.shuttleControl[shuttleId];
  assert.ok(control, shuttleId + ' has normal initialized control.');
  if (control.holderUid !== actor.localId) {
    actor = [gm, ...f.players, press].find(candidate => candidate?.localId === control.holderUid);
  }
  assert.ok(actor, shuttleId + ' has a current authenticated holder.');
  assert.equal(control.holderUid, actor.localId, shuttleId + ' is held by its current role owner.');
  const requestId = randomUUID();
  const request = await command(actor, 'requestShuttleDeparture', {
    requestId, shuttleId, destinationShipId,
    expectedControlRevision: control.revision, expectedCycle: before.currentTurn,
  });
  assert.equal(request.status, 'requested');
  await command(actor, 'beginShuttleTransit', {
    requestId: randomUUID(), shuttleId, expectedDepartureRequestId: requestId,
    expectedControlRevision: control.revision, expectedCycle: before.currentTurn,
  });
  return requestId;
}

async function waitForReachedArrivals(shuttleIds) {
  const deadline = Date.now() + 150000;
  while (Date.now() < deadline) {
    const allReached = await Promise.all(shuttleIds.map(async shuttleId => {
      const route = await db.doc('sessions/' + sessionId + '/shuttleDepartures/' + shuttleId).get();
      return route.exists && Date.now() >= Date.parse(route.get('arrivesAt'));
    }));
    if (allReached.every(Boolean)) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('The authoritative 60-second shuttle routes did not reach their destinations.');
}

async function completeArrivals(shuttleIds) {
  for (const shuttleId of shuttleIds) {
    const route = await db.doc('sessions/' + sessionId + '/shuttleDepartures/' + shuttleId).get();
    assert.equal(route.get('status'), 'in-transit');
    const control = (await session.get()).get('shuttleControl')[shuttleId];
    const holder = [gm, ...f.players, press].find(actor => actor?.localId === control.holderUid);
    assert.ok(holder, shuttleId + ' has a current normal holder.');
    const request = {
      shuttleId, transitRequestId: route.get('transitRequestId'),
      expectedControlRevision: control.revision,
    };
    const arrived = await command(holder, 'completeShuttleArrival', request);
    assert.equal(arrived.status, 'arrived');
    const replay = await command(holder, 'completeShuttleArrival', request);
    assert.equal(replay.status, 'replayed', 'Arrival commit must deduplicate its exact retry.');
  }
}

async function currentDockedSample(expectedCount) {
  const projection = await sample(f.byRole('wing-commander'));
  assert.equal(projection.transits.length, 0);
  assert.equal(projection.dockedShuttles.length, expectedCount);
  assert.ok(projection.dockedShuttles.every(docking => docking.fleetGroupId === projection.groupId));
  assert.ok(projection.dockedShuttles.every(docking =>
    Object.keys(docking).sort().join(',') === 'fleetGroupId,hostShipId,shuttleId'));
  const activeRoleIds = (await session.get()).get('activeRoleIds');
  assert.deepEqual(projection.dockedFighterWings,
    expectedFighterWingRows(activeRoleIds, projection.ships),
    'Only nonzero fighter wings at printed hosts in this current group are projected.');
  return projection;
}

async function verifyFirstSweepEnlargementDuration() {
  await playerPage.waitForFunction(() => window.__pc08FirstScaleAnimations?.length > 0,
    null, { timeout: 30000 });
  const first = await playerPage.evaluate(() => {
    const capture = window.__pc08FirstScaleAnimations[0];
    const animation = capture.animation;
    return { capturedAt: capture.capturedAt, duration: animation.effect.getComputedTiming().duration,
      currentTime: Number(animation.currentTime), playState: animation.playState,
      contactLabel: capture.contactLabel, ambient: capture.ambient, moving: capture.moving,
      contactConnected: capture.contact.isConnected,
      routeHashAtCapture: capture.routeHash, currentRouteHash: location.hash,
      plotCountAtCapture: capture.plotCountAtCapture,
      plotConnected: capture.plot?.isConnected ?? false,
      shipPlotConnected: capture.shipPlot?.isConnected ?? false,
      currentPlotCount: document.querySelectorAll('.contact-plot').length };
  });
  assert.equal(first.duration, 1120, 'The first real sweep acquisition keeps its original 1.12-second enlargement.');
  if (first.playState !== 'finished') {
    await playerPage.waitForTimeout(Math.max(0, first.duration - first.currentTime + 80));
  }
  const completed = await playerPage.evaluate(() => {
    const capture = window.__pc08FirstScaleAnimations[0];
    const animation = capture.animation;
    return { currentTime: Number(animation.currentTime), playState: animation.playState,
      contactConnected: capture.contact.isConnected,
      cancellations: window.__pc08FirstScaleCancellations.filter(event => event.id === capture.id) };
  });
  assert.equal(completed.playState, 'finished', 'The same first-sweep object must finish without cancellation: ' +
    JSON.stringify({ capturedAt: first.capturedAt, duration: first.duration, currentTimeAtCapture: first.currentTime,
      playStateAtCapture: first.playState, contactLabel: first.contactLabel, ambient: first.ambient,
      moving: first.moving, contactConnectedAtCapture: first.contactConnected,
      routeHashAtCapture: first.routeHashAtCapture, currentRouteHash: first.currentRouteHash,
      plotCountAtCapture: first.plotCountAtCapture, currentPlotCount: first.currentPlotCount,
      contactConnectedAtFinish: completed.contactConnected, currentTimeAtFinish: completed.currentTime,
      playStateAtFinish: completed.playState, cancellations: completed.cancellations }));
  assert.ok(completed.currentTime >= first.duration);
  assert.deepEqual(completed.cancellations, [], 'A repeat sweep cannot cancel the original enlargement.');
  return { capturedAtMs: first.capturedAt, durationMs: first.duration,
    currentTimeAtCaptureMs: first.currentTime, playStateAtCapture: first.playState,
    currentTimeAtFinishMs: completed.currentTime, playStateAtFinish: completed.playState,
    contactLabel: first.contactLabel, contactConnectedAtFinish: completed.contactConnected,
    routeHash: first.routeHashAtCapture,
    cancellations: completed.cancellations, cancelledOrRestarted: false };
}

async function transferHome(shuttleId) {
  const ownerRoleId = standardShuttleOwner[shuttleId];
  const owner = actorForRole(ownerRoleId);
  const ownerShip = shuttleId === 'snn-press-shuttle' ? 'dione'
    : Object.entries(rolesByHost).find(([, roleIds]) => roleIds.includes(ownerRoleId))?.[0];
  assert.ok(ownerShip, shuttleId + ' has a host in the printed role-to-ship mapping.');
  let current = (await session.get()).get('shuttleControl')[shuttleId];
  if (current.holderUid !== owner.localId) {
    await command(owner, 'transferShuttleControlCommand', {
      requestId: randomUUID(), shuttleId, action: 'reclaim', expectedRevision: current.revision,
    });
    current = (await session.get()).get('shuttleControl')[shuttleId];
  }
  const currentHost = await dockingHost(shuttleId);
  const awayHost = hostIds.find(hostId => hostId !== currentHost && hostId !== ownerShip) ??
    hostIds.find(hostId => hostId !== currentHost);
  assert.ok(awayHost, shuttleId + ' has an available printed host for the transfer proof.');
  const awayRecipient = actorForRole(otherHostRole(awayHost, ownerRoleId));
  const outbound = { requestId: randomUUID(), shuttleId, action: 'handoff',
    targetUid: awayRecipient.localId, expectedRevision: current.revision };
  const movedAway = await command(owner, 'transferShuttleControlCommand', outbound);
  assert.equal(movedAway.status, 'committed');
  assert.equal(await dockingHost(shuttleId), awayHost);
  assert.equal((await command(owner, 'transferShuttleControlCommand', outbound)).status, 'replayed');
  await command(owner, 'transferShuttleControlCommand', {
    requestId: randomUUID(), shuttleId, action: 'reclaim', expectedRevision: movedAway.revision,
  });

  const homeRecipient = actorForRole(otherHostRole(ownerShip, ownerRoleId));
  current = (await session.get()).get('shuttleControl')[shuttleId];
  const homeward = { requestId: randomUUID(), shuttleId, action: 'handoff',
    targetUid: homeRecipient.localId, expectedRevision: current.revision };
  const movedHome = await command(owner, 'transferShuttleControlCommand', homeward);
  assert.equal(movedHome.status, 'committed');
  assert.equal(await dockingHost(shuttleId), ownerShip);
  assert.equal((await command(owner, 'transferShuttleControlCommand', homeward)).status, 'replayed');
  await command(owner, 'transferShuttleControlCommand', {
    requestId: randomUUID(), shuttleId, action: 'reclaim', expectedRevision: movedHome.revision,
  });
  const final = (await session.get()).get('shuttleControl')[shuttleId];
  assert.equal(final.holderUid, owner.localId);
  assert.equal(await dockingHost(shuttleId), ownerShip);
}

async function inspectRenderedPlot(viewport, motion) {
  const [width, height, name] = viewport;
  await playerPage.emulateMedia({ reducedMotion: motion === 'reduce' ? 'reduce' : 'no-preference' });
  await playerPage.setViewportSize({ width, height });
  await playerPage.evaluate(async () => {
    const motionPreference = await import('/src/lib/motionPreference.ts');
    motionPreference.setMotionOverride('system');
    await document.fonts.ready;
  });
  await playerPage.waitForFunction((expected) =>
    document.querySelector('[data-motion]')?.getAttribute('data-motion') === expected,
  motion === 'reduce' ? 'reduce' : 'full');
  const plot = playerPage.locator('.contact-plot');
  await plot.waitFor();
  await playerPage.waitForFunction(() => document.querySelector('.contact-plot__origin')?.textContent.includes('DOCKED // STARLIGHT'));
  assert.ok(await playerPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    name + ' ' + width + 'x' + height + ' must not overflow horizontally.');
  const sweepState = await plot.locator('.contact-plot__sweep').evaluateAll(elements => elements.map(element => {
    const style = getComputedStyle(element);
    return { name: style.animationName, duration: style.animationDuration };
  }));
  assert.deepEqual(sweepState.map(({ name }) => name), motion === 'reduce'
    ? ['none', 'none'] : ['plot-sweep', 'plot-sweep-polar']);
  assert.deepEqual(sweepState.map(({ duration }) => duration), motion === 'reduce'
    ? ['0s', '0s'] : ['14s', '23.8s']);
  const compactZoom = playerPage.getByRole('button', { name: 'Zoom into DRADIS panel', exact: true });
  await compactZoom.waitFor({ state: 'visible' });
  const rendered = await plot.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const fontFamily = getComputedStyle(element.querySelector('.contact-plot__origin')).fontFamily;
    const readAlpha = node => {
      let value = 1;
      for (let current = node; current; current = current.parentElement) {
        const style = getComputedStyle(current);
        if (style.display === 'none' || style.visibility === 'hidden') return 0;
        const opacity = Number.parseFloat(style.opacity);
        value *= Number.isFinite(opacity) ? opacity : 1;
        if (current.classList.contains('contact-plot')) break;
      }
      return value;
    };
    const contacts = [...element.querySelectorAll('.contact-plot__contact')].map(contact => {
      const tag = contact.querySelector('.contact-plot__tag');
      const blip = contact.querySelector('.contact-plot__blip');
      const apparent = contact.querySelector('.contact-plot__apparent');
      const jitter = contact.querySelector('.contact-plot__jitter');
      const tagRect = tag.getBoundingClientRect();
      return { text: tag.textContent.trim(),
        primaryTag: tag.querySelector(':scope > span:first-child')?.textContent.trim() ?? '',
        ambient: contact.dataset.ambient, moving: contact.dataset.moving,
        departing: contact.dataset.departing,
        acquired: apparent.dataset.acquired === 'true',
        apparentAlpha: readAlpha(apparent), jitterAlpha: readAlpha(jitter),
        inside: tagRect.left >= bounds.left && tagRect.top >= bounds.top &&
          tagRect.right <= bounds.right && tagRect.bottom <= bounds.bottom,
        boundToReturn: tag.closest('.contact-plot__apparent') === blip.closest('.contact-plot__apparent'),
        tagAlpha: readAlpha(tag), blipAlpha: readAlpha(blip),
        tagAnimations: tag.getAnimations().map(animation => ({ playState: animation.playState,
          currentTime: Number(animation.currentTime), duration: animation.effect?.getComputedTiming().duration })),
      };
    });
    return { contacts, fontFamily, origin: element.querySelector('.contact-plot__origin').textContent.trim() };
  });
  assert.match(rendered.fontFamily, /SFMono-Regular/,
    name + ' uses the issued CIC monospace face after the browser font set settles.');
  assert.ok(rendered.origin.includes('DOCKED // STARLIGHT'),
    name + ' shows the docked shuttle as host-attached origin metadata.');
  assert.ok(rendered.origin.includes('DOCKED // FIGHTER WING ALPHA') &&
    rendered.origin.includes('DOCKED // FIGHTER WING BRAVO'),
  name + ' folds both nonzero AEGIS fighter wings onto their printed host.');
  assert.ok(!rendered.contacts.some(contact => contact.primaryTag.includes('FIGHTER WING')),
    name + ' does not create an independent fighter-wing blip.');
  if (rendered.contacts.some(contact => contact.tagAlpha > 0.05 && !contact.acquired)) {
    await playerPage.screenshot({ path: uiDirectory + '/' + name + '-' + motion + '-unacquired-label.png', fullPage: true });
  }
  for (const contact of rendered.contacts) {
    if (contact.tagAlpha > 0.05) {
      assert.ok(contact.inside, name + ' keeps each visible name fully inside the plot.');
      assert.ok(contact.boundToReturn,
        name + ' binds each visible name to the same acquired return.');
      const scanRequired = motion === 'full' || contact.ambient === 'true' || contact.moving === 'true';
      if (scanRequired) {
        assert.ok(contact.acquired, name + ' labels only a sweep-qualified contact: ' + JSON.stringify(contact));
      } else if (!contact.acquired) {
        assert.ok(contact.blipAlpha > 0.05,
          name + ' shows a reduced-motion static label only with its visibly painted contact: ' + JSON.stringify(contact));
      }
    }
  }
  if (name === 'desktop' && motion === 'full') {
    await compactZoom.click();
    await playerPage.locator('.ship-plot[data-expanded="true"]').waitFor();
    const close = playerPage.getByRole('button', { name: 'Close DRADIS', exact: true });
    await close.waitFor({ state: 'visible' });
    assert.equal(await compactZoom.isVisible(), false,
      'The minimized Zoom control yields to the expanded DRADIS view.');
    await close.click();
    await playerPage.locator('.ship-plot[data-expanded="false"]').waitFor();
    await compactZoom.waitFor({ state: 'visible' });
  }
  await playerPage.screenshot({ path: uiDirectory + '/' + name + '-' + motion + '.png', fullPage: true });
  return { viewport: name, width, height, motion, sweeps: sweepState, contacts: rendered.contacts.length,
    visibleNames: rendered.contacts.filter(contact => contact.tagAlpha > 0.05).length,
    dockedAtOrigin: true, horizontalOverflow: false };
}


let finalProjection;
try {
  assert.equal(roles.length, 20);
  const fixture = (await session.get()).data();
  assert.equal(fixture.expansion, 'capybara');
  assert.equal(press?.activeConsoleRoleId ?? (await db.doc('sessions/' + sessionId + '/players/' + press.localId).get()).get('activeConsoleRoleId'),
    'press-officer');
  assert.deepEqual((fixture.shuttleDockings ?? []).map(docking => docking.shuttleId).sort(), fleetShuttles);
  assert.ok(fleetShuttles.includes('snn-press-shuttle'));
  checks.normalAuthenticatedTwentyRoleCapybaraSetupAndCompleteStandardRoster = true;

  // All maintenance and refuelling stays in the live Team Phase. Aegis gains
  // Maliades only after airspace opens, ready for its next-cycle bay.
  const gmLease = (await db.doc('sessions/' + sessionId + '/gmInstances/' + instanceId).get()).data();
  const waveOneRefuels = {
    aegis: ['starlight', 'pallas'],
    dione: ['snn-press-shuttle'],
    icebreaker: ['highwall'],
    capybara: ['macaw'],
    shepherd: ['endeavour'],
    quellon: ['hummingbird'],
    'refinery-124': ['chacau'],
  };
  await maintainWave(1, waveOneRefuels, gmLease);
  await openAirspace(1);
  const deferredAttack = await command(gm, 'setWolfAttackWindow', { instanceId,
    requestId: randomUUID(), expectedRevision: 0, status: 'deferred' });
  assert.equal(deferredAttack.turn, 2);
  checks.firstQualifyingAttackSweepRemainsDeferredForFullCycle = true;
  const maliadesOwner = f.byRole('dione-engineer');
  const aegisRecipient = f.byRole('admiral');
  const maliadesControl = (await session.get()).get('shuttleControl').maliades;
  await command(maliadesOwner, 'transferShuttleControlCommand', {
    requestId: randomUUID(), shuttleId: 'maliades', action: 'handoff',
    targetUid: aegisRecipient.localId, expectedRevision: maliadesControl.revision,
  });
  assert.equal(await dockingHost('maliades'), 'aegis');
  checks.normalCoordinationPhaseControlHandoffMovesDockingHost = true;

  const firstLegs = new Map();
  const firstDestinations = {
    starlight: 'icebreaker', pallas: 'quellon', 'snn-press-shuttle': 'aegis',
    highwall: 'aegis', macaw: 'dione', endeavour: 'aegis',
    hummingbird: 'aegis', chacau: 'aegis',
  };
  for (const shuttleId of waveOne) {
    const routeId = await launchShuttle(shuttleId, firstDestinations[shuttleId]);
    firstLegs.set(shuttleId, routeId);
  }
  const starlightTransit = await db.doc('sessions/' + sessionId + '/shuttleDepartures/starlight').get();
  const retarget = await command(f.byRole('wing-commander'), 'retargetShuttleTransit', {
    requestId: randomUUID(), shuttleId: 'starlight',
    transitRequestId: starlightTransit.get('transitRequestId'),
    destinationShipId: 'dione', expectedControlRevision: 0, expectedCycle: 1,
  });
  assert.equal(retarget.destinationShipId, 'dione');
  const flightSample = await sample(f.byRole('wing-commander'));
  assert.equal(flightSample.transits.length, waveOne.length);
  assert.equal(flightSample.dockedShuttles.length, fleetShuttles.length - waveOne.length);
  assert.ok(flightSample.transits.every(transit => transit.sampledAt === flightSample.sampledAt));
  assert.ok(flightSample.transits.every(transit =>
    Object.keys(transit).sort().join(',') === 'arrivesAt,currentPosition,destinationShipId,fleetGroupId,sampledAt,shuttleId'));
  assert.equal(flightSample.transits.find(transit => transit.shuttleId === 'starlight').destinationShipId, 'dione');
  assert.ok(!flightSample.transits.some(transit => Object.hasOwn(transit, 'originShipId') ||
    Object.hasOwn(transit, 'holderUid') || Object.hasOwn(transit, 'ownerUid') || Object.hasOwn(transit, 'routeLegs')));
  checks.authoritativeCurrentGroupTransitRetargetAndHiddenRouteMetadataIsolation = true;

  await waitForReachedArrivals(waveOne);
  await completeArrivals(waveOne);
  let docked = await currentDockedSample(fleetShuttles.length);
  assert.ok(docked.dockedShuttles.some(row =>
    row.shuttleId === 'starlight' && row.hostShipId === 'dione'),
  'The post-arrival sample replaces the stale in-flight row with current docking.');
  checks.latestArrivalSampleRemovesStaleTransitAndKeepsHostDocking = true;
  console.log('PC08 DRADIS: wave-one arrivals, exact retry, and current docked sample verified.');

  // Use the normal GM crisis lifecycle and quarantine callable, then prove the
  // current policy allows one inbound shuttle but denies a second in the cycle.
  const disease = {
    affectedShipIds: ['icebreaker'],
    workRestrictions: 'Medical checks limit work during this local proof.',
    escalationRisk: 'A second case may spread while transfers continue.',
  };
  const crisisBase = { instanceId, crisisId: 'pc08dradisoutbreak', crisisKind: 'disease-outbreak',
    title: 'Local shuttle quarantine proof', details: 'Disposable emulator test authority.' };
  const draft = await command(gm, 'transitionCrisis', { ...crisisBase, requestId: randomUUID(),
    expectedRevision: 0, state: 'draft', diseaseOutbreak: disease });
  const delivered = await command(gm, 'transitionCrisis', { ...crisisBase, requestId: randomUUID(),
    expectedRevision: draft.revision, state: 'delivered', diseaseOutbreak: disease });
  const quarantine = await command(gm, 'setDiseaseQuarantine', { instanceId, requestId: randomUUID(),
    action: 'activate', expectedCrisisRevision: delivered.revision, expectedQuarantineRevision: 0 });
  assert.equal(quarantine.affectedShipIds[0], 'icebreaker');
  const firstInbound = {
    requestId: randomUUID(), shuttleId: 'starlight', action: 'handoff',
    targetUid: f.byRole('icebreaker-engineer').localId,
    expectedRevision: (await session.get()).get('shuttleControl').starlight.revision,
  };
  await command(f.byRole('wing-commander'), 'transferShuttleControlCommand', firstInbound);
  assert.equal(await dockingHost('starlight'), 'icebreaker');
  await denied(f.byRole('quellon-engineer'), 'transferShuttleControlCommand', {
    requestId: randomUUID(), shuttleId: 'hummingbird', action: 'handoff',
    targetUid: f.byRole('icebreaker-engineer').localId,
    expectedRevision: (await session.get()).get('shuttleControl').hummingbird.revision,
  });
  assert.equal((await session.get()).get('quarantineDocking').acceptedByShip.icebreaker.shuttleId, 'starlight');
  const quarantineAfterAcceptedDocking = (await session.get()).get('quarantineDocking');
  const released = await command(gm, 'setDiseaseQuarantine', { instanceId, requestId: randomUUID(),
    action: 'release', expectedCrisisRevision: delivered.revision,
    expectedQuarantineRevision: quarantineAfterAcceptedDocking.revision });
  assert.equal(released.communications, 'allowed');
  checks.normalDiseaseQuarantineAllowsOneInboundAndDeniesSecondWithoutSeededPolicy = true;

  await advanceCycle();
  const teamPhase = (await session.get()).get('turnPhase');
  assert.equal(teamPhase.turn, 2);
  assert.equal(teamPhase.airspace.state, 'restricted', 'The newly advanced cycle starts with restricted airspace.');
  assert.equal(teamPhase.timerPause, undefined, 'The ordinary interstitial has been cleared before gameplay.');
  const pallasControlAtTeamStart = (await session.get()).get('shuttleControl').pallas;
  await denied(f.byRole('wing-commander'), 'requestShuttleDeparture', {
    requestId: randomUUID(), shuttleId: 'pallas', destinationShipId: 'icebreaker',
    expectedControlRevision: pallasControlAtTeamStart.revision, expectedCycle: 2,
  });
  checks.restrictedTeamPhaseDeniesOrdinaryDeparture = true;
  const pressControlAtTeamStart = (await session.get()).get('shuttleControl')['snn-press-shuttle'];
  await denied(press, 'requestShuttleDeparture', {
    requestId: randomUUID(), shuttleId: 'snn-press-shuttle', destinationShipId: 'aegis',
    expectedControlRevision: pressControlAtTeamStart.revision, expectedCycle: 2,
  });
  await grantHost('aegis', gmLease);
  await command(gm, 'unlockPressAirspace', { instanceId });
  assert.equal((await session.get()).get('turnPhase').airspace.pressAccess, true,
    'The Admiral grants only the printed SNN Press airspace exception.');
  const pressOrigin = await dockingHost('snn-press-shuttle');
  const pressDestination = hostIds.find(hostId => hostId !== pressOrigin);
  assert.ok(pressDestination);
  await launchShuttle('snn-press-shuttle', pressDestination, press);
  assert.equal((await session.get()).get('turnPhase').airspace.state, 'restricted');
  checks.pressRestrictionDeniesUntilAdmiralExceptionAndAllowsOnlyItsOwnCraft = true;
  const waveTwoRefuels = {
    aegis: ['maliades'],
    dione: ['philia'],
    icebreaker: ['blacksmith'],
    capybara: ['boa'],
    shepherd: ['black-sheep'],
    quellon: ['condor'],
    'refinery-124': ['chepu'],
  };
  await maintainWave(2, waveTwoRefuels, gmLease);
  await openAirspace(2);

  const navigation = await navigationRef.get();
  const coordinates = navigation.get('shipGalacticCoordinates');
  const { STAR_CHART_COORDINATES, jumpDistanceBetween } = require('../functions/lib/starChartGraph.js');
  const originalCoordinate = coordinates.aegis;
  const nearby = STAR_CHART_COORDINATES.find(coordinate =>
    coordinate !== originalCoordinate && jumpDistanceBetween(originalCoordinate, coordinate) === 1);
  assert.ok(nearby);
  const splitShips = ['icebreaker', 'shepherd'];
  for (const shipId of splitShips) {
    const actionRevision = (await session.get()).get('vesselActionRevisions')?.[shipId] ?? 0;
    await command(gm, 'moveShipToLocation', {
      instanceId, requestId: randomUUID(), shipId, destination: nearby,
      expectedRevision: actionRevision,
    });
  }
  const splitRequest = { instanceId, requestId: randomUUID(),
    expectedNavigationRevision: (await navigationRef.get()).get('revision') };
  const split = await command(gm, 'confirmFleetPartition', splitRequest);
  assert.equal((await hostOf(f.byRole('icebreaker-engineer'))), 'icebreaker');
  const wingGroup = (await db.doc('sessions/' + sessionId + '/players/' + f.byRole('wing-commander').localId).get()).get('fleetGroupId');
  const iceGroup = (await db.doc('sessions/' + sessionId + '/players/' + f.byRole('icebreaker-engineer').localId).get()).get('fleetGroupId');
  const shepherdGroup = (await db.doc('sessions/' + sessionId + '/players/' + f.byRole('shepherd-engineer').localId).get()).get('fleetGroupId');
  assert.notEqual(wingGroup, iceGroup);
  assert.equal(iceGroup, shepherdGroup);
  const ownSplit = await sample(f.byRole('wing-commander'));
  assert.ok(ownSplit.ships.every(ship => ship.fleetGroupId === wingGroup));
  await denied(f.byRole('wing-commander'), 'readFleetGroupNavigation', {
    requestId: randomUUID(), expectedGroupId: iceGroup,
    expectedNavigationRevision: (await navigationRef.get()).get('revision'),
    expectedFleetPartitionRevision: (await session.get()).get('fleetPartitionRevision'),
  });
  checks.currentGroupIsolationAndForeignAudienceDenied = true;

  const secondDestinations = {
    maliades: 'dione', philia: 'aegis', blacksmith: 'shepherd', boa: 'aegis',
    'black-sheep': 'icebreaker', condor: 'aegis', chepu: 'aegis',
  };
  for (const shuttleId of waveTwo) await launchShuttle(shuttleId, secondDestinations[shuttleId]);
  const localIsolatedSample = await sample(f.byRole('icebreaker-engineer'));
  assert.deepEqual(localIsolatedSample.transits.map(transit => transit.shuttleId).sort(),
    ['black-sheep', 'blacksmith']);
  const foreignSuppression = await sample(f.byRole('wing-commander'));
  assert.ok(!foreignSuppression.transits.some(transit =>
    transit.shuttleId === 'black-sheep' || transit.shuttleId === 'blacksmith'));
  assert.ok(foreignSuppression.transits.every(transit => transit.fleetGroupId === wingGroup));
  checks.authoritativeLocalTransitSampleAndForeignFlightSuppression = true;

  const secondWave = [...waveTwo, 'snn-press-shuttle'];
  await waitForReachedArrivals(secondWave);
  await completeArrivals(secondWave);
  const localParked = await sample(f.byRole('icebreaker-engineer'));
  assert.equal(localParked.transits.length, 0);
  assert.ok(localParked.dockedShuttles.every(docking => docking.fleetGroupId === iceGroup));
  checks.groupLocalDockedRowsAndArrivalRetirements = true;

  for (const shipId of splitShips) {
    const actionRevision = (await session.get()).get('vesselActionRevisions')?.[shipId] ?? 0;
    await command(gm, 'moveShipToLocation', {
      instanceId, requestId: randomUUID(), shipId, destination: originalCoordinate,
      expectedRevision: actionRevision,
    });
  }
  const rejoinRequest = { instanceId, requestId: randomUUID(),
    expectedNavigationRevision: (await navigationRef.get()).get('revision') };
  const rejoined = await command(gm, 'confirmFleetPartition', rejoinRequest);
  assert.deepEqual(await command(gm, 'confirmFleetPartition', rejoinRequest), rejoined);
  const afterRejoin = await sample(f.byRole('wing-commander'));
  assert.equal(afterRejoin.transits.length, 0);
  assert.ok(afterRejoin.ships.some(ship => ship.shipId === 'icebreaker'));
  assert.ok(afterRejoin.ships.some(ship => ship.shipId === 'shepherd'));
  checks.committedRejoinAndExactPartitionRetryDeduplicated = true;

  // Every shuttle is handed to a player at another real hull and reclaimed by
  // its printed owner. The Press craft uses its ordinary Press owner actor.
  for (const shuttleId of fleetShuttles) await transferHome(shuttleId);
  docked = await currentDockedSample(fleetShuttles.length);
  assert.equal(new Set(docked.dockedShuttles.map(row => row.shuttleId)).size, fleetShuttles.length);
  checks.everyStandardShuttleCompletesTravelDockControlTransferAndReclaim = true;
  console.log('PC08 DRADIS: all 15 standard shuttle travel, docking, control handoff, and reclaim paths verified.');

  const directSessionWrite = await fetch(
    'http://127.0.0.1:' + f.config.firestorePort + '/v1/projects/' + f.project +
      '/databases/(default)/documents/sessions/' + sessionId + '?updateMask.fieldPaths=shuttleDockings',
    { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + f.byRole('wing-commander').idToken },
      body: JSON.stringify({ fields: { shuttleDockings: { arrayValue: { values: [] } } } }) });
  assert.equal(directSessionWrite.status, 403, 'A player cannot rewrite the docking projection directly.');
  const directTransitWrite = await fetch(
    'http://127.0.0.1:' + f.config.firestorePort + '/v1/projects/' + f.project +
      '/databases/(default)/documents/sessions/' + sessionId + '/shuttleDepartures/forged',
    { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + f.byRole('wing-commander').idToken },
      body: JSON.stringify({ fields: { shuttleId: { stringValue: 'starlight' }, status: { stringValue: 'in-transit' } } }) });
  assert.equal(directTransitWrite.status, 403, 'A player cannot author shuttle movement state.');
  checks.directClientDockingAndTransitWritesDenied = true;

  await playerPage.bringToFront();
  await playerPage.evaluate(() => {
    if (window.location.hash !== '#/console') window.location.hash = '#/console';
  });
  await playerPage.getByRole('heading', { name: 'Stations and consoles', exact: true }).waitFor({ state: 'visible' });
  const expectedWing = f.byRole('wing-commander');
  const consoleSnapshotDeadline = Date.now() + 30000;
  let consoleSnapshot;
  while (Date.now() < consoleSnapshotDeadline) {
    consoleSnapshot = await playerPage.evaluate(async () => {
      const [{ useSessionStore }, { auth }] = await Promise.all([
        import('/src/store/useSessionStore.ts'), import('/src/lib/firebase.ts'),
      ]);
      const state = useSessionStore.getState();
      return { authUid: auth().currentUser?.uid ?? null, meUid: state.me?.uid ?? null,
        sessionId: state.session?.id ?? null, roleId: state.me?.activeConsoleRoleId ?? null,
        connection: state.connection, freshness: state.sessionSnapshotFreshness };
    });
    if (consoleSnapshot.authUid === expectedWing.localId && consoleSnapshot.meUid === expectedWing.localId &&
        consoleSnapshot.sessionId === sessionId && consoleSnapshot.roleId === 'wing-commander' &&
        consoleSnapshot.connection === 'live' && consoleSnapshot.freshness === 'server') break;
    await playerPage.waitForTimeout(100);
  }
  assert.ok(consoleSnapshot?.authUid === expectedWing.localId && consoleSnapshot.meUid === expectedWing.localId &&
    consoleSnapshot.sessionId === sessionId && consoleSnapshot.roleId === 'wing-commander' &&
    consoleSnapshot.connection === 'live' && consoleSnapshot.freshness === 'server',
  'The real stations page must hold the current Auth and fresh assigned-role snapshot before entering DRADIS.');
  await playerPage.evaluate(async () => {
    const motionPreference = await import('/src/lib/motionPreference.ts');
    motionPreference.setMotionOverride('system');
    await document.fonts.ready;
  });
  await playerPage.evaluate(() => {
    window.__pc08FirstScaleAnimations.length = 0;
    window.__pc08FirstScaleCancellations.length = 0;
  });
  await playerPage.getByRole('link', {
    name: 'AEGIS // Wing Commander // HELD BY YOU', exact: true,
  }).click();
  await playerPage.locator('.ship-console__identity h1#ship-name').waitFor({ state: 'visible' });
  await playerPage.waitForFunction(() => window.location.hash === '#/ships/aegis/roles/wing-commander');
  await playerPage.locator('.contact-plot').waitFor();
  const roleSnapshotDeadline = Date.now() + 30000;
  let roleSnapshot;
  while (Date.now() < roleSnapshotDeadline) {
    roleSnapshot = await playerPage.evaluate(async () => {
      const [{ useSessionStore }, { auth }] = await Promise.all([
        import('/src/store/useSessionStore.ts'), import('/src/lib/firebase.ts'),
      ]);
      const state = useSessionStore.getState();
      return { authUid: auth().currentUser?.uid ?? null, meUid: state.me?.uid ?? null,
        sessionId: state.session?.id ?? null, roleId: state.me?.activeConsoleRoleId ?? null,
        connection: state.connection, freshness: state.sessionSnapshotFreshness };
    });
    if (roleSnapshot.authUid === expectedWing.localId && roleSnapshot.meUid === expectedWing.localId &&
        roleSnapshot.sessionId === sessionId && roleSnapshot.roleId === 'wing-commander' &&
        roleSnapshot.connection === 'live' && roleSnapshot.freshness === 'server') break;
    await playerPage.waitForTimeout(100);
  }
  assert.ok(roleSnapshot?.authUid === expectedWing.localId && roleSnapshot.meUid === expectedWing.localId &&
    roleSnapshot.sessionId === sessionId && roleSnapshot.roleId === 'wing-commander' &&
    roleSnapshot.connection === 'live' && roleSnapshot.freshness === 'server',
  'The AEGIS console must retain the same authenticated player, assigned role and current server snapshot.');
  await playerPage.waitForFunction(() =>
    document.querySelector('.contact-plot__origin')?.textContent.includes('DOCKED // STARLIGHT'));
  const firstSweepEnlargement = await verifyFirstSweepEnlargementDuration();
  const visualMatrix = [];
  for (const viewport of [[320, 844, 'narrow-phone'], [390, 844, 'phone'],
    [844, 390, 'short-landscape'], [1440, 900, 'desktop']]) {
    for (const motion of ['full', 'reduce']) {
      visualMatrix.push(await inspectRenderedPlot(viewport, motion));
    }
  }
  assert.deepEqual(browserErrors, []);
  checks.normalAuthenticatedRenderedPlotFourViewportsTwoMotionModesAndRotation = true;
  console.log('PC08 DRADIS: first acquisition and eight responsive motion/orientation render states verified.');

  // Render before the API-only reconnect so the real-time client stays attached
  // while its ordinary navigation hook refreshes. The authenticated reconnect
  // below still proves the current parked sample after rejoin.
  const wing = f.byRole('wing-commander');
  await command(wing, 'disconnectFromSession', {});
  await new Promise(resolve => setTimeout(resolve, 300));
  await command(wing, 'resumeSession', {});
  await command(wing, 'refreshPresence', { activeConsoleRoleId: 'wing-commander' });
  finalProjection = await sample(wing);
  assert.equal(finalProjection.transits.length, 0);
  assert.equal(finalProjection.dockedShuttles.length, fleetShuttles.length);
  checks.reconnectUsesLatestCommittedParkedSample = true;

  const dueAttack = await command(gm, 'setWolfAttackWindow', { instanceId,
    requestId: randomUUID(), expectedRevision: deferredAttack.revision, status: 'due' });
  assert.equal(dueAttack.turn, 2);
  const attackPreparation = await command(gm, 'stageWolfAttackPreparation', { instanceId,
    requestId: randomUUID(), expectedRevision: 0, turn: 2,
    shipIds: ['wolf-battlestation', 'wolf-battlestation', 'wolf-cruiser'],
    targetMode: 'pre-rolled', targetAssignments: [], modifiers: [], notes: '' });
  const attackDeclaration = await command(gm, 'declareWolfAttack', { instanceId,
    requestId: randomUUID(), expectedRevision: attackPreparation.revision });
  const attackState = (await db.doc('sessions/' + sessionId + '/wolfAttackState/current').get()).data();
  const expectedParked = expectedAttackCraftIds(fixture.activeRoleIds);
  assert.equal(attackDeclaration.airspaceLocked, true);
  assert.deepEqual(attackState.parkedCraftIds.slice().sort(), expectedParked,
    'Normal attack parking includes every enabled shuttle and combat-capable wing.');
  const expectedParkedShuttles = expectedParked.filter(craftId =>
    ROLE_OWNED_CRAFT_CATALOG.some(craft => craft.id === craftId && craft.kind === 'shuttle'));
  assert.deepEqual(attackState.parkedShuttleDockings.map(row => row.shuttleId).sort(), expectedParkedShuttles);
  const expectedBattleCraft = expectedParked.filter(craftId => ROLE_OWNED_CRAFT_CATALOG.some(craft =>
    craft.id === craftId && craft.wolfAttackRole === 'battle-table'));
  assert.deepEqual(attackState.battleTableCraftActions.map(row => row.craftId).sort(), expectedBattleCraft);
  assert.ok(attackState.battleTableCraftActions.filter(row => row.kind === 'fighter-wing')
    .every(row => fighterWingHosts[row.craftId]?.ownerRoleId === row.ownerRoleId),
  'Attacking wings retain their printed fighter-wing kind and role owner.');
  checks.attackParkingProjectsEveryEnabledCraftAndOnlyCombatCraftToBattleTable = true;
  await command(f.byRole('wing-commander'), 'disconnectFromSession', {});
  await new Promise(resolve => setTimeout(resolve, 300));
  await command(f.byRole('wing-commander'), 'resumeSession', {});
  await command(f.byRole('wing-commander'), 'refreshPresence', { activeConsoleRoleId: 'wing-commander' });
  finalProjection = await sample(f.byRole('wing-commander'));
  assert.equal(finalProjection.transits.length, 0);
  assert.equal(finalProjection.dockedShuttles.length, fleetShuttles.length);
  assert.deepEqual(finalProjection.dockedFighterWings,
    expectedFighterWingRows(fixture.activeRoleIds, finalProjection.ships));
  checks.reconnectAfterAttackParkingReadsCurrentHostFoldedCraft = true;

  const unionScenario = await runUnionScenario();
  checks.authenticatedEightPlayerUnionHostTravelReplayRestrictionsAndReconnect = true;
  console.log('PC08 DRADIS: eight-player Wobbly/Ally setup, paired-host travel, parking, and reconnect verified.');

  const evidence = {
    kind: 'normal-authenticated-local-emulator-http-and-rendered-gameplay',
    rosterSize: 20,
    standardShuttleIds: fleetShuttles,
    unionScenario,
    checks,
    renderedBeforeHelperApiReconnect: true,
    ordinaryPresenceHeartbeatFailures: f.heartbeatFailures,
    normalGmAlertAcknowledgements: alertAcknowledgements,
    visualMatrix,
    firstSweepEnlargement,
    actions,
    localNavigationContract: {
      dockedShuttles: 'LocalDradisNavigation.dockedShuttles: { shuttleId, fleetGroupId, hostShipId }[]',
      dockedFighterWings: 'LocalDradisNavigation.dockedFighterWings?: { wingId, fleetGroupId, hostShipId }[]; live Functions responses always include the current nonzero rows',
      sample: { shuttleId: 'starlight', fleetGroupId: finalProjection.groupId, hostShipId: 'aegis' },
      fighterWingSample: { wingId: 'fighter-wing-alpha', fleetGroupId: finalProjection.groupId, hostShipId: 'aegis' },
    },
    fixtureAccelerations: ['disposable Team/Open-Airspace clock deadlines only'],
    fixtureChanges: ['normal facilitator-initiated Disease Outbreak lifecycle and quarantine policy',
      'normal facilitator-authored chart movement for fleet split and rejoin'],
    preparedReviewScene: false,
    identitiesRetained: false,
    productionGameplay: false,
    completedAt: new Date().toISOString(),
  };
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
  console.log('PC08 normal authenticated shuttle catalog, partition, privacy, restriction, reconnect and rendered DRADIS proof passed.');
} catch (error) {
  await writeFile(evidencePath + '.failure.log', String(error?.stack ?? error) +
    '\nOrdinary presence heartbeat failures: ' + JSON.stringify(f.heartbeatFailures) + '\n').catch(() => undefined);
  throw error;
} finally {
  await f.cleanup().catch(error => console.error('session cleanup failed:', error.message));
  await playerContext?.close().catch(() => undefined);
  await pressContext?.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
}
