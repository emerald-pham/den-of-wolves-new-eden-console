import { observeUiReceipt } from './pc10-browser-ui-receipt.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { candidateGameplayTools } from './pc10-candidate-manual-ui-proof.mjs';
import { CANDIDATE_PROOF_SHIPS } from './pc10-candidate-proof-helpers.mjs';
const attackSummary = value => value && ({
  status: value.status, revision: value.revision, currentStep: value.currentStep,
  turn: value.turn, enemyCount: value.preparation?.shipIds?.length,
  stationRepeatStatus: value.pStationRepeat?.status,
});

/** Resolve an actually declared current attack. No roster, dice or survivor input. */
export async function resolveLiveWolfAttack(context, { tools = candidateGameplayTools(context),
  timeoutMs = 8 * 60_000, declareIfPlanned = false, verifyReplay = true } = {}) {
  const { gm, roster } = context;
  const replays = [];
  async function uiReceipt(surface, endpoint, decision) {
    let result;
    const response = await observeUiReceipt({
      waitForResponse: () => surface.page.waitForResponse(response => response.request().method() === 'POST' &&
        new URL(response.url()).pathname.endsWith(`/us-central1/${endpoint}`)),
      choose: async () => { result = await tools.receipt(surface, endpoint, decision); },
    });
    const request = response.request().postDataJSON()?.data;
    if (verifyReplay && typeof request?.requestId === 'string') {
      const replay = await surface.callable(endpoint, request);
      assert.equal(replay.status, 'committed', `${endpoint} original actor exact receipt recovery`);
      assert.deepEqual(replay.result, result, `${endpoint} exact receipt must preserve server rolls and consequences`);
      replays.push({ endpoint, requestFingerprint: createHash('sha256').update(JSON.stringify(request)).digest('hex'),
        resultFingerprint: createHash('sha256').update(JSON.stringify(result)).digest('hex'),
        transport: 'actual original browser Auth SDK, captured unchanged UI request', status: 'identical' });
    }
    return result;
  }
  const attack = () => tools.read('gm', 'wolfAttackState/current');
  async function afterChoice(previous) {
    const deadline = Date.now() + 60_000; let current;
    while (Date.now() < deadline) {
      current = await attack();
      if (current?.revision > previous.revision || current?.attackId !== previous.attackId) return current;
      await delay(200);
    }
    throw new Error(`Real Wolf choice did not commit: ${JSON.stringify(attackSummary(current))}`);
  }
  async function commanderRole(current) {
    const uid = current.decisionSummary?.commander?.actors?.[0]?.uid;
    if (!uid) return null;
    const uidHash = createHash('sha256').update(uid).digest('hex').slice(0, 16);
    const actor = roster.find(value => value.uidHash === uidHash);
    assert.ok(actor, 'The actual Commander must be one of the admitted accounts.');
    return actor.roleId;
  }
  async function targeting(current) {
    const roleId = await commanderRole(current);
    if (roleId && current.decisionSummary?.commander?.status === 'pending') {
      const surface = await tools.select(roleId, { enter: false });
      const url = new URL(surface.page.url()); url.hash = '/brief'; await surface.page.goto(url.href);
      await surface.until('Actual current Commander brief', value => value.sameActor && value.connection === 'live' && value.freshness === 'server');
      await uiReceipt(surface, 'finishWolfCommanderTargetingRerolls', () => surface.page.getByRole('button', { name: 'Finish rerolls', exact: true }).click());
      await afterChoice(current); return;
    }
    const wing = await tools.select('wing-commander');
    for (const label of ['Fighter Wing Alpha', 'Fighter Wing Bravo']) {
      const launch = wing.page.getByRole('button', { name: `Launch ${label}`, exact: true });
      if (await launch.isVisible() && await launch.isEnabled()) {
        const prior = await attack();
        await uiReceipt(wing, 'launchAegisFighterWing', () => launch.click());
        await afterChoice(prior); return;
      }
    }
    const executive = await tools.select('executive-officer');
    const enrich = executive.page.getByRole('button', { name: 'Enrich warheads // 5 ore', exact: true });
    if (await enrich.isVisible() && await enrich.isEnabled()) {
      await uiReceipt(executive, 'commitAegisEnrichedWarheadChoice', () => enrich.click());
      await afterChoice(current); return;
    }
    const cnc = executive.page.getByRole('button', { name: 'Pass Command and Control', exact: true });
    if (await cnc.isVisible() && await cnc.isEnabled()) {
      await uiReceipt(executive, 'passAegisCommandAndControl', () => cnc.click());
      await afterChoice(current); return;
    }
    await delay(350);
  }
  async function fighterRange(current) {
    if (current.currentStep === 'long-range') return false;
    const range = current.currentStep === 'medium-range' ? 'Medium Range' : 'Short Range';
    const wing = await tools.select('wing-commander');
    const panels = wing.page.getByRole('region', { name: new RegExp(`Fighter Wing (Alpha|Bravo) ${range} actions$`) });
    for (let p = 0; p < await panels.count(); p++) {
      const panel = panels.nth(p);
      const commit = panel.getByRole('button', { name: range === 'Medium Range' ? 'Resolve Medium actions' : 'Pass Short Range', exact: true });
      if (!(await commit.isVisible())) continue;
      if (range === 'Medium Range') {
        const actions = panel.getByRole('combobox', { name: /^Fighter \d+ action$/ });
        for (let i = 0; i < await actions.count(); i++) {
          const action = actions.nth(i), label = (await action.getAttribute('aria-label')).replace('action', 'target');
          await action.selectOption('attack');
          const target = panel.getByRole('combobox', { name: label, exact: true });
          const options = await target.locator('option').evaluateAll(nodes => nodes.filter(node => node.value && !node.disabled).map(node => ({ value: node.value, label: node.textContent })));
          if (!options.length) continue;
          const chosen = options.find(option => /battlestation/i.test(option.label)) ?? options[i % options.length];
          await target.selectOption(chosen.value);
        }
        if (!(await commit.isEnabled())) {
          const pass = panel.getByRole('button', { name: 'Pass Medium Range', exact: true });
          if (!(await pass.isEnabled())) continue;
          await uiReceipt(wing, 'commitWolfFighterRangeActionChoice', () => pass.click());
        } else await uiReceipt(wing, 'commitWolfFighterRangeActionChoice', () => commit.click());
      } else {
        for (const checkbox of await panel.getByRole('checkbox', { name: /^Fighter \d+ Short attack$/ }).all()) await checkbox.check();
        const attackButton = panel.getByRole('button', { name: /^(Resolve selected Short attacks|Pass Short Range)$/ });
        await uiReceipt(wing, 'commitWolfFighterRangeActionChoice', () => attackButton.click());
      }
      await afterChoice(current); return true;
    }
    return false;
  }
  async function supportRange(current) {
    const miner = await tools.select('icebreaker-miner');
    await miner.page.getByRole('link', { name: 'Open Highwall shuttle console', exact: true }).click();
    const range = { 'long-range': 'Long Range', 'medium-range': 'Medium Range', 'short-range': 'Short Range' }[current.currentStep];
    const panel = miner.page.getByRole('region', { name: `Highwall Cannon ${range} choice`, exact: true });
    if (!(await panel.isVisible())) return false;
    const use = panel.getByRole('button', { name: 'Use Highwall Cannon', exact: true });
    const pass = panel.getByRole('button', { name: 'Pass this range', exact: true });
    if (!(await pass.isVisible()) || !(await pass.isEnabled())) return false;
    await uiReceipt(miner, 'commitWolfRangeSupportActionChoice', () => (use.isEnabled().then(enabled => enabled ? use : pass)).then(button => button.click()));
    await afterChoice(current); return true;
  }
  async function aegisRange(current) {
    const executive = await tools.select('executive-officer');
    const panel = executive.page.getByRole('region', { name: 'Wolf range actions', exact: true });
    if (!(await panel.isVisible())) { await delay(350); return; }
    const use = panel.getByRole('button', { name: 'Use selected actions', exact: true });
    if (await use.isVisible()) {
      const checkboxes = panel.getByRole('checkbox');
      for (const box of await checkboxes.all()) await box.check();
      const button = await use.isEnabled() ? use : panel.getByRole('button', { name: 'Pass this range', exact: true });
      await uiReceipt(executive, 'commitWolfRangeActionChoice', () => button.click());
    } else {
      const selects = panel.getByRole('combobox');
      const assigned = new Map();
      for (const selector of await selects.all()) {
        const label = await selector.getAttribute('aria-label');
        const source = label.replace(/ hit \d+$/, '');
        const used = assigned.get(source) ?? [];
        const options = await selector.locator('option').evaluateAll(nodes => nodes.filter(node => node.value && !node.disabled).map(node => node.value));
        const chosen = options.find(value => !used.includes(value));
        assert.ok(chosen, 'Every actual target assignment must be distinct and live.');
        await selector.selectOption(chosen); assigned.set(source, [...used, chosen]);
      }
      const commit = panel.getByRole('button', { name: 'Commit target assignments', exact: true });
      if (!(await commit.isVisible())) { await delay(350); return; }
      await uiReceipt(executive, 'assignWolfRangeTargets', () => commit.click());
    }
    await afterChoice(current);
  }
  async function boarding(current) {
    const actors = ['executive-officer', 'refinery-124-pdf-colonel',
      ...Object.values(CANDIDATE_PROOF_SHIPS).map(ship => ship.engineer),
      ...roster.map(actor => actor.roleId).filter(roleId => roleId !== 'press-officer')];
    for (const roleId of [...new Set(actors)].filter(roleId => roster.some(actor => actor.roleId === roleId))) {
      const actor = await tools.select(roleId);
      const special = actor.page.getByRole('region', { name: 'Current boarding special choice', exact: true });
      if (await special.isVisible()) {
        const stay = special.getByRole('button', { name: /^Stay at / });
        const pass = special.getByRole('button', { name: 'Pass rerolls', exact: true });
        const militia = special.getByRole('button', { name: 'Commit Militia risk', exact: true });
        const button = await stay.isVisible() ? stay : await pass.isVisible() ? pass : await militia.isVisible() ? militia : null;
        if (button && await button.isEnabled()) {
          await uiReceipt(actor, 'commitWolfBoardingSpecialChoice', () => button.click());
          await afterChoice(current); return;
        }
      }
      const defend = actor.page.getByRole('button', { name: 'Commit defence', exact: true });
      if (await defend.isVisible()) {
        const panel = actor.page.getByRole('region', { name: / boarding defence$/i }).filter({ has: defend });
        const teams = panel.getByRole('combobox');
        const options = await teams.locator('option').evaluateAll(nodes => nodes.filter(node => node.value && !node.disabled).map(node => node.value));
        await teams.selectOption(options.at(-1));
        await uiReceipt(actor, 'commitWolfBoardingDefenceChoice', () => defend.click());
        await afterChoice(current); return;
      }
    }
    await delay(350);
  }
  let current = await attack();
  const setup = await tools.state();
  assert.equal(setup.phase, 'active');
  assert.ok(current, 'Only a real current GM-private attack can be resolved.');
  await tools.record('current real Wolf attack resolver setup', {
    cycle: setup.cycle, phase: setup.phase, airspace: setup.turnPhase?.airspace?.state,
    shipResources: setup.shipResources, shipSurvivors: setup.shipSurvivors,
    activeVesselIds: setup.activeVesselIds,
    charges: Object.fromEntries(Object.entries(setup.maintenanceCycles ?? {}).map(([id, cycle]) => [id, cycle.charges])),
    attack: attackSummary(current),
    limits: ['P11/P18/P20 confirmed core boarding actors are visited. Live Dione/Maliades, Boa, PDF Escort, replacement and facilitator rulings still require the actual source run; no native test establishes gameplay.'],
  });
  if (current.status === 'planned') {
    assert.ok(declareIfPlanned, 'Planned attack requires the explicit normal GM declaration option.');
    await tools.select('gm');
    const preparation = gm.page.getByRole('region', { name: 'Private Wolf attack preparation', exact: true });
    await uiReceipt(gm, 'declareWolfAttack', () => preparation.getByRole('button', { name: 'Declare Wolf attack', exact: true }).click());
    current = await attack();
  }
  assert.notEqual(current.status, 'planned', 'No planner or undeclared-source bypass.');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    current = await attack();
    assert.equal((await tools.state()).phase, 'active');
    if (current.status === 'resolved') break;
    if (current.currentStep === 'targeting') await targeting(current);
    else if (['long-range', 'medium-range', 'short-range'].includes(current.currentStep)) {
      if (await fighterRange(current)) continue;
      if (await supportRange(current)) continue;
      await aegisRange(current);
    } else if (current.currentStep === 'boarding') await boarding(current);
    else await delay(350);
  }
  assert.equal(current?.status, 'resolved', `Real attack must finalize. ${JSON.stringify(attackSummary(current))}`);
  await tools.record('real current Wolf attack finalized', { attack: attackSummary(current), exactReceiptReplays: replays });
  return current;
}
