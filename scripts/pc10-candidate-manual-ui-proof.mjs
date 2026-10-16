import { observeUiReceipt } from './pc10-browser-ui-receipt.mjs';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { projectCandidateWorkspaceReadiness, summarizeCandidateKeyboardTraversal } from './pc10-candidate-manual-ui-geometry.mjs';
import { runFreshFullGameDemoUi } from './pc10-full-game-demo-ui-proof.mjs';
import { createTwoBrowserGameplay } from './pc10-two-browser-gameplay.mjs';
import { completeOfferedTurnAdvance } from './pc10-full-game-demo-proof-helpers.mjs';
import { runStationEnding } from './pc10-candidate-station-ui-proof.mjs';
import { observeWolfChoiceActor } from './pc10-combat-choice-readiness.mjs';
import { CANDIDATE_PROOF_SHIPS as SHIPS, candidateShipRole, candidateProofOptions,
  assertCandidateAdmission, waitForFreshCandidateStart, prepareCandidateEvidenceDirectory,
  candidateEvidenceEnvelope, chooseOfferedRingEngineeringShuttle, waitForCandidateChoice } from './pc10-candidate-proof-helpers.mjs';

const TRACKS = ['reactor', 'jump-drive', 'hydroponics', 'water-reclamation', 'advanced-hydroponics'];

export function candidateGeometrySnapshot(element) {
  const visible = node => !!node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden' &&
    !node.closest('[aria-hidden="true"], [inert]');
  const enabled = node => !node.matches(':disabled') && !node.closest('fieldset:disabled');
  const focusable = root => [...root.querySelectorAll(
    'a[href],button,input,select,textarea,summary,[tabindex],[contenteditable="true"]')]
    .filter(node => visible(node) && enabled(node) && node.tabIndex >= 0);
  const targetKey = (node, index) => {
    const label = node.labels ? [...node.labels].map(value => value.innerText.trim()).join(' // ') : '';
    const name = node.getAttribute('aria-label') || label || node.innerText?.trim() || node.textContent?.trim() || '';
    return `${node.tagName.toLowerCase()}|${node.type || ''}|${name}|${index}`;
  };
  const panelTargets = focusable(element);
  const documentTabStops = focusable(document);
  const researchGroups = [...element.querySelectorAll('fieldset')].filter(fieldset =>
    fieldset.querySelector('legend')?.innerText.trim() === 'Choose distinct four-cross research tracks');
  const researchInputs = researchGroups.flatMap(fieldset => [...fieldset.querySelectorAll('input[type="checkbox"]')]);
  const researchNames = researchInputs.map(input => input.closest('label')?.innerText.trim() ?? '');
  const fleetGroupSelectors = [...element.querySelectorAll('select')].filter(select =>
    [...(select.labels ?? [])].some(label => label.innerText.trim().startsWith('Fleet group')));
  const shipSelection = (root, name) => {
    const selectors = [...root.querySelectorAll('select')].filter(select => [...(select.labels ?? [])].some(label =>
      [...label.childNodes].filter(node => node.nodeType === 3).map(node => node.textContent).join('')
        .replace(/\s+/g, ' ').trim() === name));
    const select = selectors.length === 1 ? selectors[0] : null;
    const options = select ? [...select.options] : [];
    return { count: selectors.length, visible: !!select && visible(select), enabled: !!select && enabled(select),
      selectedShipId: select?.value ?? null, optionCount: options.length,
      offeredShipIds: options.filter(option => !option.disabled && !option.hidden &&
        !option.closest('optgroup:disabled')).map(option => option.value) };
  };
  const visibleWithin = node => visible(node) && element.contains(node);
  const measure = node => {
    const rect = node.getBoundingClientRect();
    return { name: node.getAttribute('aria-label') || node.innerText?.trim() || node.textContent.trim(),
      x: rect.x, width: rect.width, height: rect.height,
      disabled: node.disabled === true || node.matches(':disabled'), font: getComputedStyle(node).fontFamily };
  };
  const text = element.innerText;
  const headers = [...text.matchAll(/(?:^|\n)Cycle (\d+) \/\/ candidate revision (\d+)(?=\n|$)/g)];
  const activeIndex = panelTargets.indexOf(document.activeElement);
  return {
    noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth,
    controls: [...element.querySelectorAll('button,select,input[type="number"],summary')].filter(visibleWithin).map(measure),
    checkboxTargets: [...element.querySelectorAll('input[type="checkbox"]')].filter(visibleWithin)
      .map(node => measure(node.closest('label') ?? node)),
    text, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    receiving: text.includes('Receiving current candidate operations…'),
    headerCount: headers.length, cycle: headers.length === 1 ? Number(headers[0][1]) : null,
    revision: headers.length === 1 ? Number(headers[0][2]) : null,
    pathHeadings: [...element.querySelectorAll('article h3')].filter(visible).map(node => node.innerText.trim()),
    researchGroupVisible: researchGroups.length === 1 && visible(researchGroups[0]),
    researchTrackNames: researchNames,
    researchTrackEnabledCount: researchInputs.filter(input => enabled(input)).length,
    commitResearchButtonCount: researchGroups.length === 1 &&
      [...researchGroups[0].querySelectorAll('button')].filter(visible).filter(button =>
        button.textContent.replace(/\s+/g, ' ').trim() === 'Commit chosen research').length,
    ringButtons: [...element.querySelectorAll('button')].filter(visible).map(button => ({
      name: button.textContent.replace(/\s+/g, ' ').trim(), enabled: enabled(button) && !button.disabled,
    })).filter(button => button.name.startsWith('Cross Ring // ')),
    nebulaJumpButtons: [...element.querySelectorAll('button')].filter(visible).map(button => ({
      name: button.textContent.replace(/\s+/g, ' ').trim(), enabled: enabled(button) && !button.disabled,
    })).filter(button => button.name.startsWith('Long jump into Nebula // ')),
    reactorButtons: [...element.querySelectorAll('button')].filter(visible).map(button => ({
      name: button.textContent.replace(/\s+/g, ' ').trim(), enabled: enabled(button) && !button.disabled,
    })).filter(button => button.name.startsWith('Cannibalise Reactor // ')),
    pathShipSelections: [...element.querySelectorAll('article')].filter(visible).map(article => ({
      title: article.querySelector('h3')?.innerText.trim() ?? '', actingShip: shipSelection(article, 'Acting ship'),
    })),
    gmShipSelection: shipSelection(element, 'GM candidate vessel'),
    fleetGroupSelectorCount: fleetGroupSelectors.length,
    selectedFleetGroup: fleetGroupSelectors.length === 1 ? fleetGroupSelectors[0].value : null,
    tabStopKeys: panelTargets.map(targetKey), documentTabStopCount: documentTabStops.length,
    activeTargetKey: activeIndex < 0 ? null : targetKey(panelTargets[activeIndex], activeIndex),
  };
}

async function readCandidateSourceState(surface) {
  return surface.page.evaluate(async moduleUrl => {
    const { useSessionStore } = await import(moduleUrl);
    const current = useSessionStore.getState();
    const session = current.session, me = current.me, instance = current.gmInstance;
    return { sourceKind: 'candidate-workspace-current-source', sessionId: session?.id ?? null,
      cycle: session?.currentTurn ?? null, phase: session?.phase ?? null,
      sessionUpdatedAt: session?.updatedAt ?? null, documentTimeOrigin: performance.timeOrigin,
      connectionGeneration: me?.connectionGeneration ?? null,
      identityHydrationRevision: current.identityHydrationRevision ?? null,
      ordinaryBriefingHeld: session?.turnPhase?.timerPause?.reason === 'turn-interstitial',
      groupId: me?.fleetGroupId ?? null, shipFleetGroupIds: session?.shipFleetGroupIds ?? {},
      playerRole: me?.role ?? null, instanceId: instance?.id ?? null,
      instanceClaimedAt: instance?.claimedAt ?? null,
      gmInstanceOwned: !!instance && instance.uid === me?.uid && instance.sessionId === session?.id,
      live: current.connection === 'live' && current.sessionSnapshotFreshness === 'server' };
  }, surface.storeModuleUrl());
}

/** All choices below use the current named browser actor and connected controls. */
export function candidateGameplayTools(context) {
  const tools = createTwoBrowserGameplay(context);
  const { gm, crew, directory } = context;
  const receipts = [], choices = [];
  async function begin(code) {
    const current = await waitForFreshCandidateStart({ started: context.started,
      roster: context.roster, inspect: () => gm.observe() });
    await record('genuine original manual Team1 candidate callback', {
      candidateCode: code, sessionId: current.sessionId, cycle: current.cycle,
      coreRoleAccounts: current.activeRoleIds.length, namedRoleAccounts: context.roster.length,
      ...(context.admission ? { actualAuthenticatedActors: context.admission.actualAuthenticatedActors } : {}),
      authority: 'same ordinary live GM and originally started owned instance; source roster unchanged',
    });
    return tools.state();
  }
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
  async function receipt(surface, endpoint, decision, { deadlineAt, now = Date.now, expectedRequest } = {}) {
    const budget = () => {
      if (deadlineAt !== undefined) assert.ok(now() < deadlineAt, 'Current candidate choice readiness deadline expired before its original UI receipt.');
    };
    budget();
    const actual = await observeUiReceipt({ page: surface.page,
      waitForResponse: () => surface.page.waitForResponse(value => value.request().method() === 'POST' &&
        new URL(value.url()).pathname.endsWith(`/us-central1/${endpoint}`),
      ...(deadlineAt === undefined ? [] : [{ timeout: deadlineAt - now() }])),
      choose: decision,
    });
    budget(); const body = await actual.json(); budget();
    const request = actual.request().postDataJSON()?.data;
    assert.equal(actual.status(), 200, `${endpoint}: ${JSON.stringify(body)}`);
    assert.ok(body.result, `Real ${endpoint} response has a result.`);
    assert.notEqual(body.result.status, 'stale', `Observe current UI state before another ${endpoint} choice.`);
    for (const [key, value] of Object.entries(expectedRequest ?? {}))
      assert.deepEqual(request?.[key], value, `Current candidate request payload ${key} must match the offered choice.`);
    receipts.push({ endpoint, actor: surface.label, request, result: body.result,
      transport: 'actual connected UI request and unmodified server response' });
    return body.result;
  }
  /** Recover only the mounted Ring crossing control; no callable read or mutation fallback. */
  async function candidateChoice(surface, shipId, { deadlineAt = context.deadlineAt ?? Infinity, now = Date.now, wait } = {}) {
    assert.ok(SHIPS[shipId], 'A source-supported Ring ship is required.');
    const panel = surface.page.getByRole('region', { name: 'Candidate preparation and actions', exact: true });
    const buttonName = `Cross Ring // ${shipId} // five fuel`;
    const remaining = deadline => {
      const timeout = deadline - now();
      assert.ok(timeout > 0, 'Current candidate choice readiness deadline expired before a mounted control.');
      return { timeout };
    };
    async function control(name) {
      const locator = panel.getByRole('button', { name, exact: true }), count = await locator.count();
      return { count, visible: count === 1 && await locator.isVisible(), enabled: count === 1 && await locator.isEnabled() };
    }
    return waitForCandidateChoice({ deadlineAt, now, ...(wait ? { wait } : {}),
      observeActor: () => observeWolfChoiceActor(surface),
      expectedReceipt: receipts.findLast(value => value.endpoint === 'executeCandidateAction'),
      inspectPanel: async ({ deadlineAt }) => {
        const panelCount = await panel.count(), panelVisible = panelCount === 1 && await panel.isVisible();
        if (!panelVisible) return { panelCount, panelVisible };
        const text = await panel.innerText(remaining(deadlineAt));
        const headers = [...text.matchAll(/(?:^|\n)Cycle (\d+) \/\/ candidate revision (\d+)(?=\n|$)/g)];
        return { panelCount, panelVisible, headerCount: headers.length,
          cycle: headers.length === 1 ? Number(headers[0][1]) : undefined,
          revision: headers.length === 1 ? Number(headers[0][2]) : undefined,
          receiving: text.includes('Receiving current candidate operations…'),
          messages: await panel.getByRole('status').allTextContents(),
          pendingAttempt: (await panel.getByRole('button', { name: 'Retry original candidate request', exact: true }).count()) > 0,
          control: await control(buttonName), refresh: await control('Refresh candidate operations') };
      },
      refresh: ({ deadlineAt }) => panel.getByRole('button', { name: 'Refresh candidate operations', exact: true }).click(remaining(deadlineAt)),
      choose: ready => receipt(surface, 'executeCandidateAction', () =>
        panel.getByRole('button', { name: buttonName, exact: true }).click(remaining(ready.deadlineAt)),
      { deadlineAt: ready.deadlineAt, now, expectedRequest: { sessionId: ready.original.sessionId,
        expectedGroupId: ready.original.fleetGroupId, expectedRevision: ready.revision, code: 'N', action: 'ring-passage', shipId } }),
    });
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
    const roleId = candidateShipRole(context.roster, shipId, 'captain');
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
  async function candidateGeometry(surface, code, stage, { readinessTimeoutMs = 30_000 } = {}) {
    assert.ok(Number.isSafeInteger(readinessTimeoutMs) && readinessTimeoutMs > 0);
    const deadlineAt = Date.now() + readinessTimeoutMs;
    const deadlineError = () => new Error('Candidate workspace source report did not finish rendering: original readiness deadline expired.');
    const remaining = () => { const timeout = deadlineAt - Date.now(); if (timeout <= 0) throw deadlineError(); return timeout; };
    async function withinBudget(operation) {
      const timeout = remaining(); let timer;
      try {
        const result = await Promise.race([operation(), new Promise((resolve, reject) => {
          timer = setTimeout(() => reject(deadlineError()), timeout);
        })]);
        remaining(); return result;
      } finally { clearTimeout(timer); }
    }
    const panel = surface.page.getByRole('region', { name: 'Candidate preparation and actions', exact: true });
    await withinBudget(() => panel.waitFor({ state: 'visible', timeout: remaining() }));
    const observedActor = await withinBudget(() => surface.observe());
    const originalSource = await withinBudget(() => readCandidateSourceState(surface));
    const expectedActor = { ...observedActor, instanceClaimedAt: originalSource.instanceClaimedAt };
    assert.equal(expectedActor.hasAuth, true, 'Candidate geometry requires the current authenticated browser actor.');
    assert.equal(expectedActor.sameActor, true, 'Candidate geometry must retain the actor in its live session store.');
    assert.equal(expectedActor.sessionId, context.initial.sessionId, 'Candidate geometry stays in the originally admitted session.');
    assert.equal(originalSource.sessionId, context.initial.sessionId);
    assert.equal(originalSource.live, true);
    assert.equal(expectedActor.connection, 'live');
    assert.equal(expectedActor.freshness, 'server');
    if (expectedActor.playerRole === 'player') {
      const originalAccount = context.roster.find(actor => actor.roleId === expectedActor.profileRoleId);
      assert.ok(originalAccount, 'The mounted member must be one of the original named, admitted accounts.');
      assert.equal(expectedActor.uidHash, originalAccount.uidHash, 'Use the original named member account.');
    }
    const groupSelector = panel.getByRole('combobox', { name: 'Fleet group', exact: true });
    const groupSelectorCount = await withinBudget(() => groupSelector.count());
    const expectedGroupId = groupSelectorCount === 1
      ? await withinBudget(() => groupSelector.inputValue())
      : expectedActor.playerRole === 'player'
        ? originalSource.groupId
        : originalSource.groupId || [...new Set(Object.values(originalSource.shipFleetGroupIds ?? {}))][0] || 'fleet-1';
    assert.equal(typeof expectedGroupId, 'string');
    assert.ok(expectedGroupId.length > 0, 'The current mounted candidate group must be explicit.');
    const refresh = panel.getByRole('button', { name: 'Refresh candidate operations', exact: true });
    assert.equal(await withinBudget(() => refresh.count()), 1, 'One mounted current-report refresh control is required.');
    assert.equal(await withinBudget(() => refresh.isVisible()), true);
    assert.equal(await withinBudget(() => refresh.isEnabled()), true, 'The live actor must be able to request the current report.');
    const projectId = context.projectId;
    const functionsPort = context.ports?.functions;
    assert.match(projectId ?? '', /^demo-[a-z0-9-]+$/, 'Candidate refresh must use the configured local Firebase project.');
    assert.ok(Number.isSafeInteger(functionsPort) && functionsPort > 0 && functionsPort <= 65535,
      'Candidate refresh must use the configured local Functions emulator port.');
    const expectedOrigin = `http://127.0.0.1:${functionsPort}`;
    const expectedPath = `/${projectId}/us-central1/readCandidateWorkspace`;
    const expectedRequestKeys = expectedActor.playerRole === 'gm'
      ? ['expectedGroupId', 'instanceId', 'sessionId'] : ['expectedGroupId', 'sessionId'];
    function isCurrentWorkspaceRequest(request) {
      if (request.method() !== 'POST') return false;
      let url, payload;
      try {
        url = new URL(request.url());
        payload = request.postDataJSON()?.data;
      } catch { return false; }
      return url.origin === expectedOrigin && url.pathname === expectedPath && !url.search && !url.hash &&
        payload !== null && typeof payload === 'object' && !Array.isArray(payload) &&
        JSON.stringify(Object.keys(payload ?? {}).sort()) === JSON.stringify(expectedRequestKeys) &&
        payload.sessionId === expectedActor.sessionId && payload.expectedGroupId === expectedGroupId &&
        (expectedActor.playerRole === 'gm' ? payload.instanceId === expectedActor.instanceId : true);
    }
    function assertHeldSource(currentActor, currentSource) {
      assert.equal(currentActor.hasAuth, true); assert.equal(currentActor.sameActor, true);
      assert.equal(currentActor.connection, 'live'); assert.equal(currentActor.freshness, 'server');
      for (const key of ['uidHash', 'sessionId', 'playerRole', 'profileRoleId', 'assignedRoleId', 'activeConsoleRoleId', 'instanceId'])
        assert.equal(currentActor[key], expectedActor[key], `Candidate workspace original actor ${key} changed.`);
      assert.equal(currentSource.live, true);
      for (const key of ['sessionId', 'cycle', 'phase', 'playerRole', 'instanceId', 'instanceClaimedAt', 'gmInstanceOwned',
        'documentTimeOrigin', 'connectionGeneration', 'identityHydrationRevision'])
        assert.equal(currentSource[key], originalSource[key], `Candidate workspace original source ${key} changed.`);
    }
    const currentGroup = (snapshot, source) => snapshot.fleetGroupSelectorCount === 1 ? snapshot.selectedFleetGroup :
      source.groupId || [...new Set(Object.values(source.shipFleetGroupIds ?? {}))][0] || 'fleet-1';
    const mountedReception = () => withinBudget(() => surface.page.evaluate(() => {
      // candidate-workspace-mounted-reception: inspect the source DOM, never synthesize a native report.
      const panels = [...document.querySelectorAll('[aria-label="Candidate preparation and actions"]')];
      const element = panels.length === 1 ? panels[0] : null;
      const visible = !!element && element.isConnected && element.ownerDocument === document &&
        !!element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden' &&
        !element.closest('[aria-hidden="true"], [inert]');
      return { panelCount: panels.length, panelVisible: visible,
        normalPresentationDetached: !document.querySelector('.turn-start-announcement__console, .turn-interstitial-clear, ' +
          '[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]'),
        pendingMutation: !!element && [...element.querySelectorAll('button')].some(button =>
          button.textContent.replace(/\s+/g, ' ').trim() === 'Retry original candidate request'),
        transmitting: !!element && element.textContent.includes('Transmitting candidate choice…') };
    }));
    let previousReception = null, qualifiedSourceKey;
    while (Date.now() < deadlineAt) {
      const painted = await withinBudget(() => surface.page.evaluate(timeout => new Promise(resolvePaint => {
        // candidate-workspace-source-paint: one actual RAF between each source qualification.
        let frame;
        const finish = painted => { clearTimeout(timer); cancelAnimationFrame(frame); resolvePaint(painted); };
        const timer = setTimeout(() => finish(false), timeout);
        frame = requestAnimationFrame(() => finish(true));
      }), remaining()));
      assert.equal(painted, true, 'Candidate workspace source report did not finish rendering: original document paint unavailable.');
      const currentActor = await withinBudget(() => surface.observe());
      const currentSource = await withinBudget(() => readCandidateSourceState(surface));
      assertHeldSource(currentActor, currentSource);
      const mounted = await mountedReception();
      let reception = null;
      if (mounted?.panelCount === 1 && mounted.panelVisible === true && mounted.normalPresentationDetached === true &&
          currentSource.ordinaryBriefingHeld === false && !mounted.pendingMutation && !mounted.transmitting &&
          Number.isFinite(originalSource.documentTimeOrigin) && originalSource.documentTimeOrigin > 0 &&
          Number.isSafeInteger(originalSource.identityHydrationRevision) && originalSource.identityHydrationRevision > 0 &&
          originalSource.phase === 'active' && Number.isSafeInteger(originalSource.cycle) && originalSource.cycle > 0) {
        const snapshot = await withinBudget(() => panel.evaluate(candidateGeometrySnapshot));
        if (snapshot.receiving === false && snapshot.headerCount === 1 && snapshot.cycle === originalSource.cycle &&
            Number.isSafeInteger(snapshot.revision) && snapshot.revision >= 0 &&
            currentGroup(snapshot, currentSource) === expectedGroupId && [0, 1].includes(snapshot.fleetGroupSelectorCount) &&
            await withinBudget(() => refresh.count()) === 1 && await withinBudget(() => refresh.isVisible()) &&
            await withinBudget(() => refresh.isEnabled())) {
          reception = JSON.stringify([currentSource.sessionUpdatedAt, snapshot.cycle, snapshot.revision, expectedGroupId]);
        }
      }
      if (reception && reception === previousReception) { qualifiedSourceKey = currentSource.sessionUpdatedAt; break; }
      previousReception = reception;
    }
    assert.ok(previousReception && qualifiedSourceKey !== undefined,
      'Candidate workspace source report did not finish rendering: initial reception needs two current source paints.');
    remaining();
    const refreshRequests = new Set();
    let refreshStarted = false;
    const rememberRefreshRequest = request => {
      if (refreshStarted && isCurrentWorkspaceRequest(request)) refreshRequests.add(request);
    };
    surface.page.on('request', rememberRefreshRequest);
    let response;
    try {
      response = await observeUiReceipt({ page: surface.page,
        waitForResponse: () => surface.page.waitForResponse(value =>
          refreshRequests.has(value.request()) && isCurrentWorkspaceRequest(value.request()),
        { timeout: remaining() }),
        choose: async () => { refreshStarted = true; await withinBudget(() => refresh.click({ timeout: remaining() })); },
      });
    } finally {
      refreshStarted = false;
      surface.page.off('request', rememberRefreshRequest);
    }
    assert.equal(refreshRequests.size, 1, 'Exactly one current scoped workspace read must belong to the mounted refresh.');
    assert.strictEqual(response.request(), [...refreshRequests][0],
      'The accepted native response must belong to the unique request initiated by the mounted refresh.');
    assert.equal(response.status(), 200, 'The mounted current-workspace read must return a successful native response.');
    const envelope = await withinBudget(() => response.json());
    const report = envelope?.result;
    const request = response.request().postDataJSON()?.data;
    assert.deepEqual(Object.keys(request ?? {}).sort(), expectedRequestKeys,
      'The native current-workspace request must retain the actual UI session, group, and owned instance scope.');
    assert.equal(report?.type, 'candidate-workspace', 'A missing or error native response cannot satisfy readiness.');

    const projectSourceState = source => ({ live: source.live, sessionId: source.sessionId, cycle: source.cycle,
      phase: source.phase, playerRole: source.playerRole, groupId: source.groupId,
      instanceId: source.instanceId, instanceClaimedAt: source.instanceClaimedAt,
      gmInstanceOwned: source.gmInstanceOwned });
    async function observeReadiness() {
      const currentActor = await withinBudget(() => surface.observe());
      const currentSource = await withinBudget(() => readCandidateSourceState(surface));
      assertHeldSource(currentActor, currentSource);
      assert.equal(currentSource.sessionUpdatedAt, qualifiedSourceKey, 'Candidate workspace original qualified source key changed after refresh.');
      const mounted = await mountedReception();
      const snapshot = await withinBudget(() => panel.evaluate(candidateGeometrySnapshot));
      const currentGroupId = currentGroup(snapshot, currentSource);
      const rendered = { ...snapshot, currentGroupId };
      const decision = projectCandidateWorkspaceReadiness({ expectedActor,
        currentActor: { ...currentActor, instanceClaimedAt: currentSource.instanceClaimedAt },
        sourceState: projectSourceState(currentSource), request, report, expectedGroupId, code, stage, rendered });
      if (decision.state === 'ready' && (mounted?.normalPresentationDetached !== true || currentSource.ordinaryBriefingHeld !== false)) {
        return { decision: { state: 'pending', reason: 'current-candidate-presentation-has-not-naturally-detached' }, rendered, currentSource };
      }
      return { decision, rendered, currentSource };
    }
    async function waitForReadySource() {
      let last;
      do {
        last = await observeReadiness();
        if (last.decision.state === 'ready') return last;
        if (last.decision.state === 'blocked') {
          throw new Error(`Candidate workspace source readiness blocked: ${last.decision.reason}`);
        }
        if (Date.now() < deadlineAt) await delay(Math.min(100, remaining()));
      } while (Date.now() < deadlineAt);
      throw new Error(`Candidate workspace source report did not finish rendering: ${last?.decision.reason ?? 'timeout'}`);
    }
    const initialReadiness = await waitForReadySource();
    const previous = surface.page.viewportSize();
    const viewports = [];
    const keyboardDiagnostics = [];
    try {
      for (const size of [{ width: 320, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
        await withinBudget(() => surface.page.setViewportSize(size));
        await withinBudget(() => panel.scrollIntoViewIfNeeded({ timeout: remaining() }));
        const beforeTraversal = await waitForReadySource();
        const geometry = beforeTraversal.rendered;
        const intendedTargets = [...geometry.tabStopKeys];
        const tabPressLimit = geometry.documentTabStopCount + 1;
        const visitedTargets = new Set();
        const targetOrdinal = key => {
          const ordinal = key == null ? -1 : intendedTargets.indexOf(key);
          return ordinal < 0 ? null : ordinal;
        };
        const diagnosticSample = snapshot => ({ activeTargetOrdinal: targetOrdinal(snapshot.activeTargetKey),
          documentTabStopCount: Number.isSafeInteger(snapshot.documentTabStopCount) ? snapshot.documentTabStopCount : null });
        // Retain only already-returned samples if this operation later fails.
        // Initial focus is informational; only the original post-Tab Set earns credit.
        const keyboardDiagnostic = { targets: intendedTargets.map((key, ordinal) => {
          const [tag, type] = key.split('|');
          return { ordinal, tag, type, keySha256: createHash('sha256').update(key).digest('hex') };
        }), initial: diagnosticSample(geometry), pressTrace: [], visitedTargetOrdinals: [],
        missingTargetOrdinals: [], afterTraversal: null, afterScreenshot: null };
        let tabPresses = 0;
        while (visitedTargets.size < intendedTargets.length && tabPresses < tabPressLimit) {
          await withinBudget(() => surface.page.keyboard.press('Tab'));
          tabPresses++;
          const snapshot = await withinBudget(() => panel.evaluate(candidateGeometrySnapshot));
          assert.deepEqual(snapshot.tabStopKeys, intendedTargets,
            'The current enabled panel tab stops must stay stable during native keyboard traversal.');
          keyboardDiagnostic.pressTrace.push({ pressOrdinal: tabPresses, ...diagnosticSample(snapshot) });
          if (snapshot.activeTargetKey) visitedTargets.add(snapshot.activeTargetKey);
        }
        const keyboardTraversal = summarizeCandidateKeyboardTraversal({
          documentTabStopCount: geometry.documentTabStopCount, intendedTargets,
          visitedTargets: [...visitedTargets], tabPresses, programmaticFocusUsed: false,
        });
        const afterTraversal = await waitForReadySource();
        assert.deepEqual(afterTraversal.decision, initialReadiness.decision,
          'The same original actor, current cycle, source revision, and native path must remain mounted through Tab traversal.');
        keyboardDiagnostic.afterTraversal = { ...diagnosticSample(afterTraversal.rendered), sourceCheckpointAccepted: true };
        intendedTargets.forEach((key, ordinal) => {
          (visitedTargets.has(key) ? keyboardDiagnostic.visitedTargetOrdinals : keyboardDiagnostic.missingTargetOrdinals).push(ordinal);
        });
        viewports.push({ ...size,
          noHorizontalOverflow: geometry.noHorizontalOverflow, controls: geometry.controls,
          checkboxTargets: geometry.checkboxTargets, text: geometry.text, reducedMotion: geometry.reducedMotion,
          readiness: afterTraversal.decision, keyboardFocusReached: keyboardTraversal.allEnabledTargetsReached,
          keyboardTraversal });
        keyboardDiagnostics.push(keyboardDiagnostic);
        await withinBudget(() => surface.page.screenshot({ path: `${directory}/${code}-${stage}-${size.width}x${size.height}.png`, timeout: remaining() }));
        const afterScreenshot = await waitForReadySource();
        assert.deepEqual(afterScreenshot.decision, initialReadiness.decision,
          'Source actor, cycle, report revision, and candidate path must still match after capture.');
        keyboardDiagnostic.afterScreenshot = { ...diagnosticSample(afterScreenshot.rendered), sourceCheckpointAccepted: true };
      }
      assert.ok(viewports.every(value => value.noHorizontalOverflow && value.keyboardFocusReached), 'Actual candidate choices must fit and be keyboard reachable.');
      assert.ok(viewports.every(value => [...value.controls, ...value.checkboxTargets].every(control => control.height >= 43.99)), 'Actual candidate controls and research activation targets must retain their mandatory 44px targets.');
      remaining();
      await writeFile(`${directory}/${code}-${stage}-geometry.json`, `${JSON.stringify(viewports, null, 2)}\n`);
    } catch (error) {
      if (viewports.length) await writeFile(`${directory}/${code}-${stage}-geometry-uncredited.json`, `${JSON.stringify({
        status: 'failed-uncredited', candidateCode: code, stage,
        failureCategory: error?.name === 'AssertionError' ? 'assertion' : 'operation-failed',
        viewports: viewports.map((viewport, index) => ({ width: viewport.width, height: viewport.height,
          noHorizontalOverflow: viewport.noHorizontalOverflow, keyboardFocusReached: viewport.keyboardFocusReached,
          keyboardTraversal: viewport.keyboardTraversal,
          keyboardDiagnostic: keyboardDiagnostics[index],
          controlTargetShortfallCount: viewport.controls.filter(control => control.height < 43.99).length,
          checkboxTargetShortfallCount: viewport.checkboxTargets.filter(target => target.height < 43.99).length,
        })),
      }, null, 2)}\n`).catch(() => {});
      throw error;
    } finally {
      if (previous) await surface.page.setViewportSize(previous);
    }
    remaining();
    await record('actual candidate controls/costs/blockers/next actor at three viewports', { candidateCode: code, stage,
      sourceReadiness: initialReadiness.decision,
      checkboxTargetShortfalls: viewports.flatMap(value => value.checkboxTargets.filter(target => target.height < 43.99).map(target => ({ width: value.width, name: target.name, height: target.height }))) });
  }
  async function complete(code) {
    const deadlineAt = Math.min(context.deadlineAt ?? Date.now() + 60_000, Date.now() + 60_000);
    const remaining = () => {
      const timeout = deadlineAt - Date.now();
      assert.ok(timeout > 0, 'Committed facilitator debrief readiness deadline expired.');
      return timeout;
    };
    const expectedInstanceId = context.started?.instanceId;
    assert.ok(typeof expectedInstanceId === 'string' && expectedInstanceId.length > 0,
      'The original live GM instance must be bound before reading its committed debrief.');
    const debriefResponse = gm.page.waitForResponse(response => {
      const request = response.request();
      if (request.method() !== 'POST' || !new URL(response.url()).pathname.endsWith('/us-central1/getSessionDebrief')) return false;
      const body = request.postDataJSON()?.data;
      return body && Object.keys(body).length === 2 && body.sessionId === context.initial.sessionId &&
        body.instanceId === expectedInstanceId;
    }, { timeout: remaining() }).then(response => ({ response }), error => ({ error }));
    await gm.until(`Immutable ${code} server ending`, value => value.phase === 'debrief' && value.fullGameDemo?.status === 'complete');
    const dialog = gm.page.getByRole('dialog', { name: 'Endgame evaluation', exact: true });
    await dialog.waitFor({ state: 'visible', timeout: remaining() });
    const observedDebrief = await debriefResponse;
    if ('error' in observedDebrief) throw observedDebrief.error;
    const response = observedDebrief.response;
    if (response.status() !== 200) {
      const failure = await response.json();
      const code = failure?.error?.status;
      throw new Error(`The entitled facilitator debrief read failed with HTTP ${response.status()}${typeof code === 'string' ? ` (${code})` : ''}.`);
    }
    const body = await response.json();
    assert.deepEqual(Object.keys(body ?? {}).sort(), ['result'], 'The callable must return one Firebase result envelope.');
    const receipt = body.result;
    assert.deepEqual(Object.keys(receipt ?? {}).sort(), ['sessionId', 'snapshot', 'type']);
    assert.equal(receipt.type, 'session-debrief');
    assert.equal(receipt.sessionId, context.initial.sessionId);
    const ending = receipt.snapshot;
    assert.equal(ending?.type, 'session-debrief');
    assert.equal(ending?.version, 1);
    assert.equal(ending?.source, 'candidate');
    assert.equal(ending?.result, 'success');
    assert.equal(ending?.candidate?.code, code);
    const resultLabel = ending.result.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    const readableResult = `${resultLabel[0].toUpperCase()}${resultLabel.slice(1)}`;
    await dialog.getByText(`Server result // ${readableResult} // Cycle ${ending.cycle}`, { exact: true })
      .waitFor({ state: 'visible', timeout: remaining() });
    await gm.page.screenshot({ path: `${directory}/${code}-GM-ending.png` });
    const originalCrew = await crew.observe();
    await crew.page.reload();
    await crew.until(`Entitled ${code} crew ending after real reload`, value => value.phase === 'debrief' && value.sameActor);
    const reloadedCrew = await crew.observe();
    for (const key of ['sessionId', 'uidHash', 'profileRoleId']) assert.equal(reloadedCrew[key], originalCrew[key]);
    await crew.page.getByRole('dialog', { name: 'Endgame evaluation', exact: true }).waitFor();
    await crew.page.screenshot({ path: `${directory}/${code}-crew-ending.png` });
    await tools.save('candidate-gameplay.json', { status: 'passed', candidateCode: code, candidateEndingObserved: true,
      ...(context.admission ? { admission: context.admission } : {}), choices, receipts,
      ending, scope: 'Genuine fresh ordinary admission and manually progressed candidate path via two browser contexts. Explicit GM demo counter choices are listed.' });
  }
  return { ...tools, context, begin, record, waitState, receipt, candidateChoice, cycle, coordination, gmSupplies, printedRationBudget, gmRepair, research, jump, scout, confirmPhysicalGroups,
    candidateGroup, gmCandidateShip, candidateGeometry, complete };
}

export async function runRingEnding(context) {
  const tools = candidateGameplayTools(context);
  const { gm, crew, directory } = context;
  const start = await tools.begin('N');
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
    for (const shipId of start.activeVesselIds) await tools.maintenanceUi(shipId, candidateShipRole(context.roster, shipId), {
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
  const offeredCraft = await chooseOfferedRingEngineeringShuttle(
    repairPanel.getByRole('combobox', { name: 'Engineering Shuttle', exact: true }));
  await tools.receipt(gm, 'executeCandidateAction', () => repairPanel.getByRole('button', { name: 'Commit Engineering Shuttle', exact: true }).click());
  await tools.record('actual Engineering Shuttle permanently consumed', { shuttleId: offeredCraft });
  await gm.page.screenshot({ path: `${directory}/N-repaired-costs-blockers.png` });
  await tools.candidateGeometry(gm, 'N', 'repaired');
  for (const shipId of start.activeVesselIds) {
    const surface = await tools.select(candidateShipRole(context.roster, shipId, 'captain'));
    const result = await tools.candidateChoice(surface, shipId);
    assert.equal(result.outcome, 'crossed'); assert.equal(result.fuelSpent, 5);
    await tools.record('actual paid Ring passage', { shipId, fuelSpent: 5 });
  }
  const finalPanel = await tools.candidateGroup('aegis');
  await tools.receipt(gm, 'executeCandidateAction', () => finalPanel.getByRole('button', { name: 'Sabotage Ring from the far side', exact: true }).click());
  await tools.record('normal GM far-side sabotage choice');
  await tools.complete('N');
  assert.equal((await crew.observe()).cycle, 4);
}

/** Qualify the captured paid O attempt through the existing private GM reader.
 * Scan marks remain server-only; neither the driver nor a member enumerates them. */
export async function readNebulaCandidateCalculation(context, tools, shipId, receipt) {
  assert.equal(receipt.sessionId, context.initial.sessionId);
  assert.equal(receipt.code, 'O'); assert.equal(receipt.action, 'nebula-jump');
  assert.ok(typeof receipt.requestId === 'string' && receipt.requestId.length);
  const gm = await tools.select('gm', { enter: false });
  assert.equal(gm, context.gm, 'Use the original GM browser for its private calculation.');
  const original = await gm.observe();
  const requireGm = actor => {
    assert.ok(actor.hasAuth && actor.sameActor && actor.gmInstanceOwned, 'Keep original live GM authority.');
    assert.equal(actor.playerRole, 'gm');
    assert.equal(actor.sessionId, context.initial.sessionId);
    assert.equal(actor.uidHash, context.started.uidHash, 'Keep the original GM identity.');
    assert.equal(actor.instanceId, context.started.instanceId, 'Keep the original GM instance.');
    assert.equal(actor.connection, 'live'); assert.equal(actor.freshness, 'server');
  };
  requireGm(original);
  const source = await tools.state(), groupId = source.shipFleetGroupIds[shipId];
  assert.equal(source.sessionId, context.initial.sessionId);
  assert.match(groupId, /^fleet-[1-9]\d*$/);
  const workspace = await gm.page.evaluate(async expectedGroupId => {
    const { readCandidateWorkspace } = await import('/src/lib/candidateService.ts');
    return readCandidateWorkspace(expectedGroupId);
  }, groupId);
  const currentSource = await tools.state(), current = await gm.observe();
  requireGm(current);
  for (const key of ['documentTimeOrigin', 'sessionId', 'uidHash', 'instanceId', 'cycle', 'phase'])
    assert.equal(current[key], original[key], 'Original GM calculation authority changed during the read.');
  assert.equal(currentSource.sessionId, source.sessionId);
  assert.equal(currentSource.shipFleetGroupIds[shipId], groupId, 'Original paid ship group changed.');
  assert.equal(workspace.sessionId, source.sessionId); assert.equal(workspace.groupId, groupId);
  const calculations = workspace.privateCalculations?.filter(audit =>
    audit.requestId === receipt.requestId && audit.code === 'O') ?? [];
  assert.equal(calculations.length, 1, 'The original paid Nebula receipt needs its exact private GM calculation.');
  const audit = calculations[0];
  assert.equal(audit.result, receipt.outcome, 'The private calculation must describe the captured paid result.');
  assert.equal(audit.calculation.scouts, 8, 'The actual paid calculation must count eight qualifying scout marks.');
  return { requestId: audit.requestId, count: audit.calculation.scouts };
}

/** One genuine paid loss, followed by physically entitled scans and source-paid safe attempts. */
export async function runNebulaEnding(context) {
  const tools = candidateGameplayTools(context);
  const { crew, directory } = context;
  const start = await tools.begin('O');
  const coordinate = Object.entries(start.organiserSites).find(([, site]) => site.code === 'O')?.[0];
  assert.match(coordinate, /^\d{4}$/);
  await tools.record('entitled live GM source chart selected O', { candidateCode: 'O' });
  const budget = await tools.printedRationBudget(Object.fromEntries(start.activeVesselIds.map(id => [id, id === 'aegis' ? 2 : 5])));
  for (const shipId of start.activeVesselIds) {
    await tools.gmSupplies(shipId, 'food', budget[shipId].food);
    await tools.gmSupplies(shipId, 'water', budget[shipId].water);
    await tools.gmSupplies(shipId, 'fuel', 40);
    await tools.maintenanceUi(shipId, candidateShipRole(context.roster, shipId), {
      afterBegin: () => tools.gmRepair(shipId), afterRiot: () => tools.gmRepair(shipId),
    });
  }
  await tools.coordination();
  for (const shipId of ['aegis', 'shepherd', 'quellon']) await tools.jump(shipId, coordinate);
  await tools.confirmPhysicalGroups();
  assert.notEqual((await tools.state()).shipFleetGroupIds.aegis, (await tools.state()).shipFleetGroupIds.icebreaker,
    'Only committed physical partitions establish the separate audience.');
  await tools.cycle(2);
  for (const shipId of start.activeVesselIds) await tools.maintenanceUi(shipId, candidateShipRole(context.roster, shipId), {
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
      for (const shipId of survivors) await tools.maintenanceUi(shipId, candidateShipRole(context.roster, shipId), {
        afterBegin: () => tools.gmRepair(shipId), afterRiot: () => tools.gmRepair(shipId),
      });
      await tools.coordination();
    }
    await tools.scout('shepherd-scientist', 'endeavour', coordinate);
    await tools.scout('quellon-explorer', 'hummingbird', coordinate);
  }
  for (const shipId of survivors) {
    const surface = await tools.select(candidateShipRole(context.roster, shipId, 'captain'));
    const candidate = surface.page.getByRole('region', { name: 'Candidate preparation and actions', exact: true });
    assert.equal(await candidate.locator('details').count(), 0, 'A normal member has no private GM calculation disclosure.');
    const result = await tools.receipt(surface, 'executeCandidateAction', () =>
      candidate.getByRole('button', { name: new RegExp(`^Long jump into Nebula \\/\\/ ${shipId} \\/\\/ \\d+ fuel$`) }).click());
    assert.equal(result.outcome, 'reached'); assert.ok(result.fuelSpent > 0);
    const calculation = await readNebulaCandidateCalculation(context, tools, shipId, result);
    await tools.record('private GM paid Nebula scout modifier verification', { shipId, ...calculation,
      mechanism: 'original GM readCandidateWorkspace projection for the captured paid attempt; no scan or die write' });
    await tools.record('actual source-paid successful Nebula attempt', { shipId, fuelSpent: result.fuelSpent });
  }
  await tools.complete('O');
}

export function candidateEndingFor(code) {
  assert.ok(['N', 'O', 'P'].includes(code));
  return code === 'P' ? runStationEnding : code === 'O' ? runNebulaEnding : runRingEnding;
}

/** Optional direct callback for the root generic driver's PC10_DEMO_ENDING_DRIVER API. */
export async function runEnding(context) {
  assert.ok(process.env.PC10_CANDIDATE_PATH, 'Set the explicit candidate code before composing the root ending callback.');
  return candidateEndingFor(process.env.PC10_CANDIDATE_PATH)(context);
}

/** Additive hooks only; the root runner retains setup, ordinary Auth, casting and start ownership. */
export function candidateDriverOptions(input) {
  const configuration = candidateProofOptions(input);
  let confirmed, admission;
  return { ...configuration,
    onSetup: async context => { await configuration.onSetup?.(context); },
    onBeforeStart: async context => {
      await configuration.onBeforeStart?.(context);
      confirmed = context.confirmed;
      admission = assertCandidateAdmission({ confirmed, roster: context.roster,
        gm: await context.gm.observe(), controller: await context.crew.observe() }, configuration);
      await writeFile(`${context.directory}/candidate-admission.json`, `${JSON.stringify(candidateEvidenceEnvelope({
        status: 'in-progress', candidateCode: configuration.candidateCode, ...admission,
        activeRoleIds: confirmed.activeRoleIds, activeVesselIds: confirmed.activeVesselIds,
      }), null, 2)}\n`, { flag: 'wx' });
    },
    onStarted: async context => {
      await waitForFreshCandidateStart({ started: context.started, roster: context.roster,
        inspect: () => context.gm.observe() });
      await configuration.onStarted?.({ ...context, confirmed, admission });
    },
    runEnding: context => candidateEndingFor(configuration.candidateCode)({ ...context, confirmed, admission,
      projectId: configuration.projectId, ports: configuration.ports }),
  };
}

/** Invoke only after root returns the sequential runtime window; importing this module is side-effect free. */
export async function runFreshCandidateManualProof(input = {}) {
  const configuration = candidateProofOptions(input);
  const driverRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: configuration.sourceRoot, encoding: 'utf8' }).trim();
  const driverCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: driverRoot, encoding: 'utf8' }).trim();
  const builtRuntimeIndexSha256 = createHash('sha256').update(await readFile(`${configuration.sourceRoot}/functions/lib/index.js`)).digest('hex');
  if (configuration.expectedSourceCommit) assert.equal(sourceCommit, configuration.expectedSourceCommit);
  if (configuration.expectedRuntimeIndexSha256) assert.equal(builtRuntimeIndexSha256, configuration.expectedRuntimeIndexSha256);
  const driverModules = ['pc10-candidate-manual-ui-proof', 'pc10-candidate-station-ui-proof',
    'pc10-live-wolf-attack-ui-proof', 'pc10-two-browser-gameplay', 'pc10-candidate-proof-helpers',
    'pc10-full-game-demo-ui-proof', 'pc10-full-game-demo-proof-helpers'];
  const moduleSha256 = Object.fromEntries(await Promise.all(driverModules.map(async name => [name,
    createHash('sha256').update(await readFile(new URL(`./${name}.mjs`, import.meta.url))).digest('hex')])));
  await prepareCandidateEvidenceDirectory(configuration.directory, { sourceCommit, driverCommit,
    builtRuntimeIndexSha256, moduleSha256, candidateCode: configuration.candidateCode,
    playerCount: configuration.playerCount, includePress: configuration.includePress,
    capybaraEnabled: configuration.capybaraEnabled, chartId: configuration.chartId,
    projectId: configuration.projectId, ports: configuration.ports,
    expectedOrdinaryAuthAccounts: configuration.playerCount + Number(configuration.includePress) + 2,
    dependencies: { genericDriver: 'root 9681f7aa API', admission: 'confirmed.activeRoleIds + optional Press + controller + GM',
      gameplay: 'normal audited requests, actual manual GM controls and server randomness; explicit GM demo counters disclosed' },
  });
  return runFreshFullGameDemoUi(candidateDriverOptions(configuration));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.env.PC10_PROOF_DIR, undefined, 'Use PC10_EVIDENCE_DIRECTORY; the old variable never selected candidate evidence.');
  const booleanEnv = name => {
    const value = process.env[name];
    if (value === undefined) return undefined;
    assert.ok(['true', 'false'].includes(value), `${name} must be true or false.`);
    return value === 'true';
  };
  await runFreshCandidateManualProof({
    candidateCode: process.env.PC10_CANDIDATE_PATH ?? 'N',
    playerCount: process.env.PC10_PLAYER_COUNT === undefined ? 18 : Number(process.env.PC10_PLAYER_COUNT),
    includePress: booleanEnv('PC10_INCLUDE_PRESS'), capybaraEnabled: booleanEnv('PC10_CAPYBARA_ENABLED'),
    chartId: process.env.PC10_CHART_ID, directory: process.env.PC10_EVIDENCE_DIRECTORY,
    sourceRoot: process.env.PC10_SOURCE_ROOT ?? process.cwd(), baseUrl: process.env.PC10_UI_URL,
    projectId: process.env.PC10_DEMO_PROJECT, expectedSourceCommit: process.env.PC10_EXPECTED_SOURCE_SHA,
    expectedRuntimeIndexSha256: process.env.PC10_EXPECTED_INDEX_SHA256,
  });
}
