import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { runFreshFullGameDemoUi } from './pc10-full-game-demo-ui-proof.mjs';
import { createTwoBrowserGameplay } from './pc10-two-browser-gameplay.mjs';
import { completeOfferedTurnAdvance } from './pc10-full-game-demo-proof-helpers.mjs';
import { runStationEnding } from './pc10-candidate-station-ui-proof.mjs';

const SHIPS = {
  aegis: { name: 'AEGIS', engineer: 'executive-officer', captain: 'admiral' },
  dione: { name: 'Dione', engineer: 'dione-engineer', captain: 'dione-captain' },
  icebreaker: { name: 'Icebreaker', engineer: 'icebreaker-engineer', captain: 'icebreaker-captain' },
  shepherd: { name: 'Shepherd', engineer: 'shepherd-engineer', captain: 'shepherd-captain' },
  quellon: { name: 'Quellon', engineer: 'quellon-engineer', captain: 'quellon-captain' },
  'refinery-124': { name: 'Refinery 124', engineer: 'refinery-124-engineer', captain: 'refinery-124-captain' },
};
const TRACKS = ['reactor', 'jump-drive', 'hydroponics', 'water-reclamation', 'advanced-hydroponics'];

/** All choices below use the current named browser actor and connected controls. */
export function candidateGameplayTools(context) {
  const tools = createTwoBrowserGameplay(context);
  const { gm, crew, directory } = context;
  const receipts = [], choices = [];
  async function waitState(description, predicate) {
    const end = Date.now() + 60_000; let current;
    while (Date.now() < end) {
      current = await tools.state();
      if (current.live && predicate(current)) return current;
      await delay(200);
    }
    throw new Error(`${description}: ${JSON.stringify(current)}`);
  }
  async function record(stage, details = {}) {
    choices.push({ stage, at: new Date().toISOString(), ...details });
    await tools.save('candidate-gameplay-progress.json', { choices, receipts });
    console.log(JSON.stringify({ candidateStage: stage, ...details }));
  }
  async function receipt(surface, endpoint, decision) {
    const response = surface.page.waitForResponse(value => value.request().method() === 'POST' &&
      new URL(value.url()).pathname.endsWith(`/us-central1/${endpoint}`));
    await decision();
    const actual = await response, body = await actual.json();
    const request = actual.request().postDataJSON()?.data;
    assert.equal(actual.status(), 200, `${endpoint}: ${JSON.stringify(body)}`);
    assert.ok(body.result, `Real ${endpoint} response has a result.`);
    assert.notEqual(body.result.status, 'stale', `Observe current UI state before another ${endpoint} choice.`);
    receipts.push({ endpoint, actor: surface.label, request, result: body.result,
      transport: 'actual connected UI request and unmodified server response' });
    return body.result;
  }
  async function cycle(target) {
    const current = await gm.observe();
    assert.equal(current.phaseProgression, 'manual');
    assert.equal(current.phase, 'active');
    assert.equal(target, current.cycle + 1);
    await receipt(gm, 'advanceTurn', async () => {
      const confirmation = gm.page.getByRole('button', { name: `ARE YOU SURE? // Advance to Cycle ${target}`, exact: true });
      await completeOfferedTurnAdvance({ expected: { sessionId: context.initial.sessionId,
        uidHash: current.uidHash, instanceId: current.instanceId, cycle: current.cycle },
      inspect: async () => ({ ...(await gm.observe()), confirmationOffered: await confirmation.isVisible() }),
      clickAdvance: () => gm.page.getByRole('button', { name: `Advance to Cycle ${target}`, exact: true }).click(),
      clickConfirmation: () => confirmation.click() });
    });
    await gm.until(`Actual manual Team ${target}`, value => value.cycle === target && value.airspace === 'restricted');
    await record('manual GM next Team phase', { cycle: target });
  }
  async function coordination() {
    const current = await gm.observe();
    assert.equal(current.phaseProgression, 'manual');
    assert.equal(current.airspace, 'restricted');
    await receipt(gm, 'advanceFullGameDemoPhase', () =>
      gm.page.getByRole('button', { name: 'Open Coordination manually', exact: true }).click());
    await gm.until(`Actual manual Coordination ${current.cycle}`, value => value.cycle === current.cycle && value.airspace === 'lifted');
    await record('manual GM Coordination', { cycle: current.cycle });
  }
  async function gmSupplies(shipId, resourceId, minimum) {
    await tools.select('gm');
    const panel = gm.page.getByRole('region', { name: 'Fleet resource controls', exact: true });
    const button = panel.getByRole('button', { name: 'Ship numbers write mode', exact: true });
    if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
    const before = (await tools.state()).shipResources[shipId][resourceId];
    const count = Math.max(0, minimum - before);
    if (!count) return;
    const resource = { ore: 'Strytium Ore', fuel: 'Strytium Fuel', food: 'Food', water: 'Water', materials: 'Materials' }[resourceId];
    assert.ok(resource, 'Use a real displayed resource counter label.');
    const row = panel.getByRole('group', { name: `${SHIPS[shipId].name} resource controls`, exact: true });
    for (let i = 0; i < count;) {
      await tools.select('gm');
      const steps = 1;
      let result;
      try {
        result = await receipt(gm, 'applyShipCounterSteps', async () => {
          const control = row.getByRole('button', { name: `Increase ${resource}`, exact: true });
          for (let click = 0; click < steps; click++) await control.click();
          await delay(500);
          await writeFile(`${directory}/counter-control-observation.json`, JSON.stringify({
            shipId, resourceId, firstStep: i + 1, steps, before, expected: before + i + steps,
            enabled: await control.isEnabled(), row: await row.innerText(),
            state: await tools.state(),
          }, null, 2));
        });
      } catch (cause) {
        await row.screenshot({ path: `${directory}/counter-control-failure.png` });
        throw cause;
      }
      assert.equal(result.amount, before + i + steps, 'Each bounded visible click run must commit before the next choice.');
      await waitState(`Actual GM ${shipId} ${resourceId} counter steps ${i + 1}-${i + steps}`, current =>
        current.shipResources[shipId][resourceId] === result.amount);
      i += steps;
    }
    await record('explicit normal GM demo counter choice', { shipId, resourceId, before, after: minimum,
      mechanism: 'actual resource controls; no Admin or hidden inventory write' });
  }
  async function printedRationBudget(cyclesByShip) {
    const budget = await gm.page.evaluate(async cycles => {
      const { SHIPS } = await import('/src/data/ships.ts');
      const { AEGIS_ROLE_CONSOLES } = await import('/src/data/aegisConsoles.ts');
      return Object.fromEntries(Object.entries(cycles).map(([shipId, count]) => {
        const ship = SHIPS.find(value => value.id === shipId);
        const schedule = ship?.maintenance ?? (shipId === 'aegis' ? AEGIS_ROLE_CONSOLES.admiral.rations : null);
        if (!schedule) throw new Error('Use the actual displayed full-ship ration schedule.');
        return [shipId, { cycles: count, food: schedule.food[3] * count, water: schedule.water[3] * count }];
      }));
    }, cyclesByShip);
    await record('explicit GM demo ration budget from public printed console schedule', { budget,
      mechanism: 'read-only actual served ship data; normal resource buttons apply every chosen increment' });
    return budget;
  }
  async function research(cycleNumber) {
    const scientist = await tools.select('shepherd-scientist');
    await scientist.page.getByRole('link', { name: 'Open Endeavour shuttle console', exact: true }).click();
    const panel = scientist.page.getByRole('region', { name: 'Endeavour research controls', exact: true });
    await panel.waitFor();
    await writeFile(`${directory}/research-panel-before-cycle-${cycleNumber}.json`, JSON.stringify({
      text: await panel.innerText(), labels: await panel.getByRole('combobox').evaluateAll(nodes =>
        nodes.map(node => ({ ariaLabel: node.getAttribute('aria-label'), labels: [...node.labels].map(label => label.textContent), options: [...node.options].map(option => option.value) }))),
    }, null, 2));
    for (const [index, trackId] of TRACKS.entries()) {
      await panel.getByRole('combobox', { name: 'Research track', exact: true }).selectOption(trackId);
      const label = index < 3 ? 'Advance standard research' : 'Advance with 5 Shepherd ore';
      const result = await receipt(scientist, 'advanceEndeavourResearchTrack', () => panel.getByRole('button', { name: label, exact: true }).click());
      assert.equal(result.status, 'committed');
      await record('actual Scientist research choice', { cycle: cycleNumber, trackId,
        funding: index < 3 ? 'standard' : 'five Shepherd ore' });
    }
    await scientist.page.screenshot({ path: `${directory}/N-research-cycle-${cycleNumber}.png` });
  }
  async function gmRepair(shipId) {
    const before = (await tools.state()).shipDamage[shipId];
    assert.equal(before.destroyed, false, 'A destroyed ship cannot be resurrected for the proof.');
    if (!before.damagedSystemIds.length) return;
    const priorUrl = gm.page.url(), target = new URL(priorUrl);
    target.hash = `/ships/${shipId}/observer`;
    await gm.page.goto(target.href);
    await gm.until('Actual normally authenticated GM observer', value => value.gmInstanceOwned && value.connection === 'live' && value.freshness === 'server');
    const grant = gm.page.getByRole('button', { name: 'GM ship console read write access', exact: true });
    if ((await grant.getAttribute('aria-pressed')) !== 'true') {
      await grant.click();
      await receipt(gm, 'setGmShipConsoleWriteGrant', () =>
        gm.page.getByRole('alertdialog', { name: 'Are you sure?', exact: true }).getByRole('button', { name: 'ARE YOU SURE?', exact: true }).click());
    }
    await receipt(gm, 'repairAllShipDamage', () => gm.page.getByRole('button', { name: 'Repair all damage', exact: true }).click());
    await waitState('Ordinary GM damage repair committed', current => current.shipDamage[shipId].damagedSystemIds.length === 0);
    await gm.page.goto(priorUrl);
    await gm.until('GM console restored after ordinary repair', value => value.gmInstanceOwned && value.connection === 'live' && value.freshness === 'server');
    await record('explicit normal GM demo damage repair', { shipId, repairedSystemIds: before.damagedSystemIds,
      mechanism: 'actual scoped observer grant and damage control; no injected result' });
  }
  async function jump(shipId, coordinate) {
    const entry = SHIPS[shipId];
    const roleId = context.roster.some(actor => actor.roleId === entry.captain) ? entry.captain : entry.engineer;
    const surface = await tools.select(roleId);
    const panel = surface.page.getByRole('region', { name: `${entry.name} Jump Drive control`, exact: true });
    await panel.waitFor();
    for (let i = 0; i < 4; i++) {
      const digit = Number(await panel.getByLabel(`Coordinate digit ${i + 1} value`, { exact: true }).textContent());
      const steps = (Number(coordinate[i]) - digit + 10) % 10;
      for (let n = 0; n < steps; n++) await panel.getByRole('button', { name: `Increase coordinate digit ${i + 1}`, exact: true }).click();
    }
    await panel.getByRole('button', { name: 'Lock destination coordinates', exact: true }).click();
    const power = panel.getByRole('slider', { name: 'Jump drive power', exact: true });
    await power.focus(); await power.press('End');
    assert.equal(await power.inputValue(), '100');
    const before = (await tools.state()).shipResources[shipId].fuel;
    const result = await receipt(surface, 'jumpShip', () =>
      panel.getByRole('button', { name: `Jump to ${coordinate}`, exact: true }).click());
    assert.equal(result.status, 'jumped', `${shipId} ordinary source jump must commit: ${JSON.stringify(result)}`);
    await waitState(`${shipId} paid physical candidate arrival`, current =>
      current.shipGalacticCoordinates[shipId] === coordinate);
    const after = (await tools.state()).shipResources[shipId].fuel;
    assert.equal(before - after, result.fuelCost);
    await record('actual charged paid ship jump', { shipId, fuelSpent: result.fuelCost });
  }
  async function scout(roleId, craft, coordinate) {
    const surface = await tools.select(roleId);
    const label = craft === 'endeavour' ? 'Endeavour' : craft === 'hummingbird' ? 'Hummingbird' : 'Starlight';
    await surface.page.getByRole('link', { name: `Open ${label} shuttle console`, exact: true }).click();
    const panel = surface.page.getByRole('region', { name: `${label} scouting request`, exact: true });
    await panel.getByLabel('Printed system coordinate', { exact: true }).fill(coordinate);
    const result = await receipt(surface, 'requestScout', () => panel.getByRole('button', { name: 'Record request', exact: true }).click());
    assert.equal(result.status, 'requested');
    await surface.page.getByRole('region', { name: `${label} scout report`, exact: true }).getByText('Site O', { exact: true }).waitFor();
    await record('actual entitled Nebula scouting request', { craft, cycle: (await gm.observe()).cycle,
      serverResolution: 'automatic private result; bonus never supplied by the caller' });
  }
  async function candidateGroup(shipId) {
    await tools.select('gm');
    const current = await tools.state();
    const groupId = current.shipFleetGroupIds[shipId];
    const groups = [...new Set(Object.values(current.shipFleetGroupIds))];
    assert.ok(groups.includes(groupId), 'Use the real current vessel group.');
    const panel = gm.page.getByRole('region', { name: 'Candidate preparation and actions', exact: true });
    await panel.waitFor();
    if (groups.length > 1) {
      const selector = panel.getByRole('combobox', { name: 'Fleet group', exact: true });
      await selector.waitFor();
      await selector.selectOption(groupId);
    }
    await panel.getByRole('button', { name: 'Refresh candidate operations', exact: true }).click();
    return panel;
  }
  async function confirmPhysicalGroups() {
    await tools.select('gm');
    const result = await receipt(gm, 'confirmFleetPartition', () => gm.page
      .getByRole('region', { name: 'Fleet group communication', exact: true })
      .getByRole('button', { name: 'Confirm separated fleet groups', exact: true }).click());
    const current = await waitState('Actual physical fleet groups observed', value =>
      JSON.stringify([...new Set(Object.values(value.shipFleetGroupIds ?? {}))].sort()) ===
        JSON.stringify([...result.groupIds].sort()));
    await record('actual GM confirms physical vessel groups', {
      groupCount: new Set(Object.values(current.shipFleetGroupIds)).size,
      mechanism: 'normal connected GM partition control; no audience or pursuit assignment' });
    return current;
  }
  async function gmCandidateShip(shipId) {
    const panel = await candidateGroup(shipId);
    await panel.getByRole('combobox', { name: 'GM candidate vessel', exact: true }).selectOption(shipId);
    const grant = panel.getByRole('button', { name: 'Enable GM candidate ship control', exact: true });
    if (await grant.isVisible()) await receipt(gm, 'setGmShipConsoleWriteGrant', () => grant.click());
    return panel;
  }
  async function candidateGeometry(surface, code, stage) {
    const panel = surface.page.getByRole('region', { name: 'Candidate preparation and actions', exact: true });
    await panel.waitFor();
    const previous = surface.page.viewportSize();
    const viewports = [];
    for (const size of [{ width: 320, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
      await surface.page.setViewportSize(size);
      await panel.scrollIntoViewIfNeeded();
      const geometry = await panel.evaluate(element => {
        const visible = node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden';
        const measure = node => { const rect = node.getBoundingClientRect(); return {
          name: node.getAttribute('aria-label') || node.textContent.trim(), x: rect.x, width: rect.width, height: rect.height,
          disabled: node.disabled === true, font: getComputedStyle(node).fontFamily,
        }; };
        return { noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth,
          controls: [...element.querySelectorAll('button,select,input[type="number"],summary')].filter(visible).map(measure),
          checkboxTargets: [...element.querySelectorAll('input[type="checkbox"]')].filter(visible).map(node => measure(node.closest('label'))),
          text: element.innerText, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches };
      });
      const controls = panel.getByRole('button').and(surface.page.locator(':enabled'));
      const first = controls.first();
      let keyboardFocusReached = false;
      for (let count = 0; count < 50 && !keyboardFocusReached; count++) {
        await surface.page.keyboard.press('Tab');
        keyboardFocusReached = await panel.evaluate(element => element.contains(document.activeElement));
      }
      if (await first.isVisible()) await first.scrollIntoViewIfNeeded();
      viewports.push({ ...size, ...geometry, keyboardFocusReached });
      await surface.page.screenshot({ path: `${directory}/${code}-${stage}-${size.width}x${size.height}.png` });
    }
    if (previous) await surface.page.setViewportSize(previous);
    await writeFile(`${directory}/${code}-${stage}-geometry.json`, `${JSON.stringify(viewports, null, 2)}\n`);
    assert.ok(viewports.every(value => value.noHorizontalOverflow && value.keyboardFocusReached), 'Actual candidate choices must fit and be keyboard reachable.');
    assert.ok(viewports.every(value => [...value.controls, ...value.checkboxTargets].every(control => control.height >= 43.99)), 'Actual candidate controls and research activation targets must retain their mandatory 44px targets.');
    await record('actual candidate controls/costs/blockers/next actor at three viewports', { candidateCode: code, stage,
      checkboxTargetShortfalls: viewports.flatMap(value => value.checkboxTargets.filter(target => target.height < 43.99).map(target => ({ width: value.width, name: target.name, height: target.height }))) });
  }
  async function complete(code) {
    await gm.until(`Immutable ${code} server ending`, value => value.phase === 'debrief' && value.fullGameDemo?.status === 'complete');
    await gm.page.getByRole('dialog', { name: 'Endgame evaluation', exact: true }).waitFor();
    const state = await tools.state();
    assert.equal(state.debriefSnapshot.source, 'candidate');
    assert.equal(state.debriefSnapshot.result, 'success');
    assert.equal(state.debriefSnapshot.candidate.code, code);
    await gm.page.screenshot({ path: `${directory}/${code}-GM-ending.png` });
    await crew.page.reload();
    await crew.until(`Entitled ${code} crew ending after real reload`, value => value.phase === 'debrief' && value.sameActor);
    await crew.page.getByRole('dialog', { name: 'Endgame evaluation', exact: true }).waitFor();
    await crew.page.screenshot({ path: `${directory}/${code}-crew-ending.png` });
    await tools.save('candidate-gameplay.json', { status: 'passed', candidateCode: code, choices, receipts,
      ending: state.debriefSnapshot, scope: 'Genuine fresh ordinary admission and manually progressed candidate path via two browser contexts. Explicit GM demo counter choices are listed.' });
  }
  return { ...tools, context, record, waitState, receipt, cycle, coordination, gmSupplies, printedRationBudget, gmRepair, research, jump, scout, confirmPhysicalGroups,
    candidateGroup, gmCandidateShip, candidateGeometry, complete };
}

export async function runRingEnding(context) {
  const tools = candidateGameplayTools(context);
  const { gm, crew, directory } = context;
  const start = await tools.state();
  const coordinate = Object.entries(start.organiserSites).find(([, site]) => site.code === 'N')?.[0];
  assert.match(coordinate, /^\d{4}$/, 'The real GM-only chart must supply the candidate destination.');
  await tools.record('entitled live GM source chart selected N', { candidateCode: 'N', cycle: 1 });
  await tools.gmSupplies('shepherd', 'ore', 40);
  await tools.gmSupplies('aegis', 'materials', 10);
  const budget = await tools.printedRationBudget(Object.fromEntries(start.activeVesselIds.map(id => [id, 4])));
  for (const shipId of start.activeVesselIds) {
    await tools.gmSupplies(shipId, 'food', budget[shipId].food);
    await tools.gmSupplies(shipId, 'water', budget[shipId].water);
    await tools.gmSupplies(shipId, 'fuel', 30);
  }
  for (let cycle = 1; cycle <= 4; cycle++) {
    await tools.research(cycle);
    for (const shipId of start.activeVesselIds) await tools.maintenanceUi(shipId, SHIPS[shipId].engineer, {
      afterBegin: () => tools.gmRepair(shipId), afterRiot: () => tools.gmRepair(shipId),
    });
    await tools.coordination();
    if (cycle < 4) await tools.cycle(cycle + 1);
  }
  for (const shipId of start.activeVesselIds) await tools.jump(shipId, coordinate);
  const materialPanel = await tools.gmCandidateShip('aegis');
  await materialPanel.getByLabel('Materials to contribute', { exact: true }).fill('10');
  await tools.receipt(gm, 'executeCandidateAction', () => materialPanel.getByRole('button', { name: 'Contribute Ring materials', exact: true }).click());
  await tools.record('actual ten Ring materials', { shipId: 'aegis', materials: 10 });
  const scientist = await tools.select('shepherd-scientist');
  const researchPanel = scientist.page.getByRole('region', { name: 'Candidate preparation and actions', exact: true });
  const tracks = researchPanel.getByRole('group', { name: 'Choose distinct four-cross research tracks', exact: true });
  await tools.candidateGeometry(scientist, 'N', 'research-choice');
  for (const name of ['Reactor', 'Jump Drive', 'Hydroponics', 'Water Reclamation', 'Advanced Hydroponics'])
    await tracks.getByRole('checkbox', { name, exact: true }).check();
  await tools.receipt(scientist, 'executeCandidateAction', () => researchPanel.getByRole('button', { name: 'Commit chosen research', exact: true }).click());
  await tools.record('actual Scientist commits five distinct four-cross tracks');
  const repairPanel = await tools.gmCandidateShip('aegis');
  const availableCrafts = await repairPanel.getByRole('combobox', { name: 'Engineering Shuttle', exact: true }).locator('option').evaluateAll(options =>
    options.filter(option => !option.disabled && option.value).map(option => option.value));
  assert.ok(availableCrafts.length, 'A genuine available Engineering Shuttle must be shown.');
  await repairPanel.getByRole('combobox', { name: 'Engineering Shuttle', exact: true }).selectOption(availableCrafts[0]);
  await tools.receipt(gm, 'executeCandidateAction', () => repairPanel.getByRole('button', { name: 'Commit Engineering Shuttle', exact: true }).click());
  await tools.record('actual Engineering Shuttle permanently consumed', { shuttleId: availableCrafts[0] });
  await gm.page.screenshot({ path: `${directory}/N-repaired-costs-blockers.png` });
  await tools.candidateGeometry(gm, 'N', 'repaired');
  for (const shipId of start.activeVesselIds) {
    const surface = await tools.select(SHIPS[shipId].captain);
    const panel = surface.page.getByRole('region', { name: 'Candidate preparation and actions', exact: true });
    const result = await tools.receipt(surface, 'executeCandidateAction', () =>
      panel.getByRole('button', { name: `Cross Ring // ${shipId} // five fuel`, exact: true }).click());
    assert.equal(result.outcome, 'crossed'); assert.equal(result.fuelSpent, 5);
    await tools.record('actual paid Ring passage', { shipId, fuelSpent: 5 });
  }
  const finalPanel = await tools.candidateGroup('aegis');
  await tools.receipt(gm, 'executeCandidateAction', () => finalPanel.getByRole('button', { name: 'Sabotage Ring from the far side', exact: true }).click());
  await tools.record('actual human GM far-side sabotage');
  await tools.complete('N');
  assert.equal((await crew.observe()).cycle, 4);
}

/** One genuine paid loss, followed by physically entitled scans and source-paid safe attempts. */
export async function runNebulaEnding(context) {
  const tools = candidateGameplayTools(context);
  const { crew, directory } = context;
  const start = await tools.state();
  const coordinate = Object.entries(start.organiserSites).find(([, site]) => site.code === 'O')?.[0];
  assert.match(coordinate, /^\d{4}$/);
  await tools.record('entitled live GM source chart selected O', { candidateCode: 'O' });
  const budget = await tools.printedRationBudget(Object.fromEntries(start.activeVesselIds.map(id => [id, id === 'aegis' ? 2 : 5])));
  for (const shipId of start.activeVesselIds) {
    await tools.gmSupplies(shipId, 'food', budget[shipId].food);
    await tools.gmSupplies(shipId, 'water', budget[shipId].water);
    await tools.gmSupplies(shipId, 'fuel', 40);
    await tools.maintenanceUi(shipId, SHIPS[shipId].engineer, {
      afterBegin: () => tools.gmRepair(shipId), afterRiot: () => tools.gmRepair(shipId),
    });
  }
  await tools.coordination();
  for (const shipId of ['aegis', 'shepherd', 'quellon']) await tools.jump(shipId, coordinate);
  await tools.confirmPhysicalGroups();
  assert.notEqual((await tools.state()).shipFleetGroupIds.aegis, (await tools.state()).shipFleetGroupIds.icebreaker,
    'Only committed physical partitions establish the separate audience.');
  await tools.cycle(2);
  for (const shipId of start.activeVesselIds) await tools.maintenanceUi(shipId, SHIPS[shipId].engineer, {
    afterBegin: () => tools.gmRepair(shipId), afterRiot: () => tools.gmRepair(shipId),
  });
  await tools.coordination();
  const actor = await tools.select('executive-officer');
  const panel = actor.page.getByRole('region', { name: 'Candidate preparation and actions', exact: true });
  const button = panel.getByRole('button', { name: /^Long jump into Nebula \/\/ aegis \/\/ \d+ fuel$/ });
  const fuelBefore = (await tools.state()).shipResources.aegis.fuel;
  await tools.candidateGeometry(actor, 'O', 'paid-loss-choice');
  const loss = await tools.receipt(actor, 'executeCandidateAction', () => button.click());
  assert.equal(loss.outcome, 'lost', 'No scouts exist yet: the actual paid server die alone cannot reach nine.');
  await tools.waitState('Actual paid loss while a separate group remains', value =>
    value.shipDamage.aegis.destroyed === true && value.shipSurvivors.aegis === 0 && value.phase === 'active');
  const afterLoss = await tools.state();
  assert.equal(fuelBefore - afterLoss.shipResources.aegis.fuel, loss.fuelSpent);
  assert.notEqual(afterLoss.shipFleetGroupIds.aegis, afterLoss.shipFleetGroupIds.icebreaker);
  await tools.record('actual server-dice paid Nebula loss while another group remains', {
    shipId: 'aegis', fuelSpent: loss.fuelSpent, sessionStillActive: true, otherGroupRemains: true,
  });
  await crew.page.screenshot({ path: `${directory}/O-paid-loss-other-group-active.png` });
  for (const shipId of start.activeVesselIds.filter(id => !['aegis', 'shepherd', 'quellon'].includes(id)))
    await tools.jump(shipId, coordinate);
  await tools.confirmPhysicalGroups();
  const survivors = start.activeVesselIds.filter(id => id !== 'aegis');
  for (let cycle = 2; cycle <= 5; cycle++) {
    if (cycle > 2) {
      await tools.cycle(cycle);
      for (const shipId of survivors) await tools.maintenanceUi(shipId, SHIPS[shipId].engineer, {
        afterBegin: () => tools.gmRepair(shipId), afterRiot: () => tools.gmRepair(shipId),
      });
      await tools.coordination();
    }
    await tools.scout('shepherd-scientist', 'endeavour', coordinate);
    await tools.scout('quellon-explorer', 'hummingbird', coordinate);
  }
  const scans = await tools.read('gm', 'deepNebulaScans', { collection: true });
  assert.equal(scans.length, 8, 'Eight real private server scan records must exist before safe attempts.');
  await tools.record('private GM scan verification', { count: 8,
    mechanism: 'entitled read-only browser Firestore SDK; no scan or die write' });
  for (const shipId of survivors) {
    const surface = await tools.select(SHIPS[shipId].captain);
    const candidate = surface.page.getByRole('region', { name: 'Candidate preparation and actions', exact: true });
    assert.equal(await candidate.locator('details').count(), 0, 'A normal member has no private GM calculation disclosure.');
    const result = await tools.receipt(surface, 'executeCandidateAction', () =>
      candidate.getByRole('button', { name: new RegExp(`^Long jump into Nebula \\/\\/ ${shipId} \\/\\/ \\d+ fuel$`) }).click());
    assert.equal(result.outcome, 'reached'); assert.ok(result.fuelSpent > 0);
    await tools.record('actual source-paid successful Nebula attempt', { shipId, fuelSpent: result.fuelSpent });
  }
  await tools.complete('O');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const code = process.env.PC10_CANDIDATE_PATH ?? 'N';
  assert.ok(['N', 'O', 'P'].includes(code), 'Every source path needs its explicit genuine gameplay callback.');
  await runFreshFullGameDemoUi({ sourceRoot: process.cwd(), baseUrl: 'http://127.0.0.1:5175',
    projectId: 'demo-pc10-candidate-manual', ports: { auth: 9119, functions: 5021, firestore: 8100 },
    directory: process.env.PC10_EVIDENCE_DIRECTORY ?? '/tmp/dow-pc10-evidence/candidates/manual-206389/N4-attempt1',
    playerCount: code === 'P' ? 11 : 18, chartId: code === 'P' ? 'B' : 'A',
    includePress: true, capybaraEnabled: false, gameplayOnly: true,
    runEnding: code === 'P' ? runStationEnding : code === 'O' ? runNebulaEnding : runRingEnding });
}
