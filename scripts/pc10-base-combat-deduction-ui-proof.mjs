import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { createTwoBrowserGameplay } from './pc10-two-browser-gameplay.mjs';
import { resolveLiveWolfAttack } from './pc10-live-wolf-attack-ui-proof.mjs';
import { assertWolfChoiceActor, observeWolfChoiceActor } from './pc10-combat-choice-readiness.mjs';
import { selectBaseRangeTargetControls } from './pc10-base-range-target-controls.mjs';
import { assertBaseCombatPrerequisites, assertOriginalBaseActor, assertRequiredBaseBranches, baseMemberRowsMatch, baseWolfActionExpectation,
  BASE_COMBAT_CONTROL_LABELS, baseResearchPaintMatches, captureBaseUiReceipt,
  openingWolfCounts, openBaseEndeavourResearchRoute, originalRoleForUid, proofHash, uidHash, validatePrivateDeductionReply,
  waitForBaseMemberAftermath, waitForBaseResearchReceipt, waitForOriginalBaseActor,
} from './pc10-base-combat-deduction-contracts.mjs';
export { createBaseDeductionSetupHooks } from './pc10-base-deduction-setup-ui-proof.mjs';

const cardLabels = { 'wolf-fighter-wing': 'Fighter Wing', 'wolf-assault-transport': 'Assault Transport',
  'wolf-destroyer': 'Destroyer', 'wolf-cruiser': 'Cruiser', 'wolf-strikecarrier': 'Fleet Strikecarrier',
  'wolf-battlestation': 'Battlestation' };
const attackSummary = value => value && ({ attackFingerprint: proofHash(value.attackId), turn: value.turn,
  revision: value.revision, status: value.status, currentStep: value.currentStep,
  remainingThreatCount: value.calculationReceipt?.survivingWolfShips?.length });

/** Match visible presenter fields without letting CSS uppercase identifiers or hide missing paint. */
export async function renderedBaseMemberAftermath(surface, view) {
  if (view.status !== 'resolved' || view.currentStep !== 'resolved') return false;
  const panel = surface.page.getByRole('region', { name: 'Wolf attack status', exact: true });
  const visibleText = async field => {
    if (await field.count() !== 1 || !(await field.isVisible())) return null;
    const text = await field.textContent();
    return text === null ? null : text.replace(/\s+/g, ' ').trim();
  };
  if (await panel.count() !== 1 || !(await panel.isVisible())) return false;
  // textContent preserves the source spelling; visibility is checked on each
  // semantic field before it can count as paint. No identifier case-folding.
  if (await visibleText(panel.locator('.wolf-attack-status__header .eyebrow')) !== `Fleet alert // cycle ${view.turn}` ||
      await visibleText(panel.locator('.wolf-attack-status__phase')) !== 'Attack complete') return false;
  const deadline = panel.locator('.wolf-attack-status__deadline'), time = deadline.locator('time');
  if (await visibleText(deadline) !== `Resolution committed // ${view.deadlineAt}` ||
      await visibleText(time) !== view.deadlineAt || await time.getAttribute('datetime') !== view.deadlineAt) return false;
  const list = panel.getByRole('list', { name: 'Committed attack results', exact: true });
  const painted = [];
  if (view.results.length) {
    if (await list.count() !== 1 || !(await list.isVisible())) return false;
    const rows = await list.locator(':scope > li').all();
    if (rows.length !== view.results.length) return false;
    for (const row of rows) {
      if (!(await row.isVisible())) return false;
      const spans = await row.locator(':scope > span').all();
      if (spans.length !== 2) return false;
      const fields = await Promise.all([row.locator(':scope > strong'), ...spans,
        row.locator(':scope > small')].map(visibleText));
      if (fields.some(text => text === null)) return false;
      painted.push(fields.join(' '));
    }
  } else if (await list.count() !== 0 || await visibleText(panel.locator('.wolf-attack-status__pending')) !==
      'Attack progress is server recorded. Results appear here when a step commits.') return false;
  const threats = panel.getByLabel('Remaining Wolf threat count', { exact: true });
  return baseMemberRowsMatch(view, painted, await visibleText(threats));
}

/** Caller owns Team/Coordination changes, setup, resources, and the genuine ending. */
export function createBaseCombatDeductionCallback(options = {}) {
  return context => runBaseCombatAndDeduction(context, options);
}

/** Importing is inert. This callback never starts browsers, prepares a fixture, or changes phases. */
export async function runBaseCombatAndDeduction(context, options = {}) {
  const { gm, crew, initial, started, roster, directory } = context;
  const a = createTwoBrowserGameplay(context);
  const combat = options.combat ?? 'opening';
  assert.ok(['opening', 'current', 'none'].includes(combat));
  const first = await gm.observe(), cycle = options.expectedCycle ?? (combat === 'opening' ? 1 : first.cycle);
  assert.ok(Number.isSafeInteger(cycle) && cycle >= 1 && cycle <= 8, 'Bind to the caller’s actual current cycle.');
  const originalGm = await waitForOriginalBaseActor({ inspect: () => gm.observe(), original: { ...first,
    sessionId: initial.sessionId, uidHash: started.uidHash, instanceId: started.instanceId,
    playerRole: 'gm', phase: 'active', cycle } });
  assert.equal(originalGm.phaseProgression, 'manual', 'Use the genuine full-game manual phase composition.');
  const required = options.requiredBranches ?? (combat === 'none' ? [] : ['wolf-resolution', 'member-aftermath']);
  assert.ok(Array.isArray(required) && required.every(value => typeof value === 'string'));
  const report = { schemaVersion: 1, status: 'in-progress', cycle: originalGm.cycle,
    actualHumans: 0, physicalAttendanceProof: false, adminGameplayWrites: false, acceleratedClock: false,
    fixtures: false, phaseChanges: 0, endingPerformed: false, wholeGameAcceptance: false,
    branches: {}, requests: [], guidance: [], observations: [],
    prerequisites: { combat: 'Caller opens genuine Coordination1 (or genuinely deferredCycle2). Ordinary AEGIS maintenance charges both Fighter Bays, C&C, Missile Launchers and Point Defence Lasers. Initial four fighters per wing are server-owned; actual losses need normal Construction Bay/build choices in a later Team.',
      research: 'Caller-owned Team cycles and current Scientist/Endeavour authority; one Detector cross per Team using one of three standard allowances, or explicitly offered5 Shepherd ore funding. Canonical readiness requires four crosses. Printed18/12/7/5 are material-cost entries, not ore debits. This callback proves research readiness and testing, not a printed device-purchase debit.',
      deduction: 'Actual normal loyalty setup/current private holder, eligible current-group target, cycle-local allowance. No fabricated physical sabotage/attendance or truth/die input.' } };
  const evidenceName = options.evidenceName ?? `base-combat-deduction-cycle-${originalGm.cycle}.json`;
  assert.match(evidenceName, /^[a-z0-9-]+\.json$/);
  const save = () => writeFile(`${directory}/${evidenceName}`, `${JSON.stringify(report, null, 2)}\n`);
  const recordRequest = async entry => { report.requests.push(entry); await save(); };
  const combatReadiness = new WeakMap();
  const branch = (id, value) => { report.branches[id] = value; };
  const blocked = (id, blocker, nextActor) => branch(id, { status: 'blocked', credited: false, blocker, nextActor });
  const committed = (id, details = {}) => branch(id, { status: 'committed', ...details });

  async function select(roleId, { brief = false, enter = true, deadlineAt } = {}) {
    const surface = await a.select(roleId, { enter: brief ? false : enter, deadlineAt });
    const observed = await surface.observe();
    if (roleId === 'gm') assertOriginalBaseActor(observed, originalGm);
    else {
      assert.equal(observed.uidHash, roster.find(value => value.roleId === roleId)?.uidHash);
      assert.equal(observed.profileRoleId, roleId); assert.equal(observed.playerRole, 'player');
      assert.equal(observed.sessionId, initial.sessionId); assert.equal(observed.cycle, originalGm.cycle);
      assertOriginalBaseActor(observed, observed);
    }
    if (brief) {
      const url = new URL(surface.page.url()); url.hash = '/brief'; await surface.page.goto(url.href);
      await surface.until('Original actor private brief is current', value => value.sameActor &&
        value.uidHash === observed.uidHash && value.sessionId === initial.sessionId &&
        value.cycle === originalGm.cycle && value.connection === 'live' && value.freshness === 'server' &&
        value.privateLoyaltyPresent && value.briefMatchesActor);
      assertOriginalBaseActor(await surface.observe(), observed);
    }
    return surface;
  }
  async function readGm(suffix, options = {}) {
    if (options.serverOnly === true) {
      const budget = () => assert.ok(Number.isFinite(options.deadlineAt) && Date.now() < options.deadlineAt,
        'The original combat source reinspection deadline expired.');
      budget();
      assertOriginalBaseActor(await gm.observe(), originalGm); budget();
      const value = await a.read('gm', suffix, options); budget();
      assertOriginalBaseActor(await gm.observe(), originalGm); budget();
      return value;
    }
    await waitForOriginalBaseActor({ inspect: () => gm.observe(), original: originalGm });
    const value = await a.read('gm', suffix);
    await waitForOriginalBaseActor({ inspect: () => gm.observe(), original: originalGm });
    return value;
  }
  async function state() {
    await waitForOriginalBaseActor({ inspect: () => gm.observe(), original: originalGm });
    const value = await a.state();
    assertOriginalBaseActor(await gm.observe(), originalGm);
    assert.equal(value.cycle, originalGm.cycle); assert.equal(value.phase, 'active');
    return value;
  }
  async function rpc(surface, endpoint, decision, expectedRequest = {}) {
    const actor = await surface.observe();
    if (surface === gm) assertOriginalBaseActor(actor, originalGm);
    else assert.ok(roster.some(value => value.uidHash === actor.uidHash && value.roleId === actor.profileRoleId));
    assert.equal(actor.cycle, originalGm.cycle);
    return captureBaseUiReceipt({ surface, endpoint, expectedActor: actor, expectedRequest,
      decision, record: recordRequest });
  }
  async function guidance(roleId, panel, source) {
    const before = await (roleId === 'gm' ? gm : crew).observe();
    const text = (await panel.innerText()).replace(/\s+/g, ' ').trim().slice(0, 1600);
    const controls = await panel.getByRole('button').evaluateAll(nodes => nodes.map(node =>
      ({ label: node.textContent.trim(), enabled: !node.disabled })).slice(0, 20));
    assertOriginalBaseActor(await (roleId === 'gm' ? gm : crew).observe(), before);
    report.guidance.push({ roleId, uidHash: before.uidHash, audience: roleId === 'gm' ? 'gm' : 'actor',
      source, controls, displayedCostsBlockersAndNextActor: text });
    await save();
  }
  async function waitAttack(previous, deadlineAt = Infinity) {
    const deadline = Math.min(Date.now() + 60_000, deadlineAt);
    while (Date.now() < deadline) {
      const current = await readGm('wolfAttackState/current');
      if (current?.attackId !== previous?.attackId || current?.revision > (previous?.revision ?? -1)) return current;
      await delay(200);
    }
    throw new Error('The actual source attack revision did not advance; no phase or actor bypass.');
  }
  async function receiptForAttack(surface, endpoint, decision, expectedAction = {}) {
    const current = await readGm('wolfAttackState/current');
    assert.ok(current && current.status !== 'resolved');
    assert.equal(current.turn, originalGm.cycle);
    const ready = combatReadiness.get(surface);
    if (ready) {
      assertWolfChoiceActor(await observeWolfChoiceActor(surface), ready.actor);
      for (const key of ['attackId', 'turn', 'revision', 'currentStep', 'status'])
        assert.equal(current[key], ready.expected[key], `Current source ${key} changed before the UI choice.`);
      assert.ok(Date.now() < ready.deadlineAt, 'Keep the original current combat decision budget.');
    }
    const result = await rpc(surface, endpoint, async () => {
      if (ready) {
        assertWolfChoiceActor(await observeWolfChoiceActor(surface), ready.actor);
        assert.ok(Date.now() < ready.deadlineAt, 'Do not click an expired current combat decision.');
      }
      return decision();
    }, { ...expectedAction, ...baseWolfActionExpectation(endpoint, current) });
    if (ready) assertWolfChoiceActor(await observeWolfChoiceActor(surface), ready.actor);
    await waitAttack(current, ready?.deadlineAt); return result;
  }
  async function firstAvailableTarget(selectControl, preferred) {
    const options = await selectControl.locator('option').evaluateAll(nodes => nodes
      .filter(node => node.value && !node.disabled).map(node => node.value));
    assert.ok(options.length, 'Use only a current enabled opaque contact.');
    const chosen = preferred ?? options[0];
    assert.ok(options.includes(chosen), 'The actual intended target must be currently offered to this actor.');
    await selectControl.selectOption(chosen); return chosen;
  }

  async function currentActorRead(surface, endpoint, payload = {}) {
    const original = await surface.observe(); assertOriginalBaseActor(original, original);
    const reply = await surface.callable(endpoint, { sessionId: initial.sessionId, ...payload });
    assertOriginalBaseActor(await surface.observe(), original);
    report.requests.push({ endpoint, uidHash: original.uidHash, roleId: original.profileRoleId,
      cycle: original.cycle, transport: 'labeled read-only original browser SDK supplement for exact actor workspace/revision; all choices use UI',
      status: reply.status, resultFingerprint: proofHash(reply.result ?? null), gameplayMutation: false });
    await save(); assert.equal(reply.status, 'committed');
    assert.equal(reply.result?.sessionId, initial.sessionId); return reply.result;
  }

  // Supplement the existing complete server lifecycle; these are actual source controls.
  async function chooseNext(current, { waitChoice, deadlineAt }) {
    const paint = async (surface, kind, fields = {}) => {
      const result = await waitChoice(surface, current, { kind, ...fields });
      combatReadiness.delete(surface);
      if (result.status === 'eligible') combatReadiness.set(surface, { expected: result.expected, actor: result.originalActor, deadlineAt });
      return result;
    };
    const chooseActor = (roleId, options = {}) => select(roleId, { ...options, deadlineAt });
    const range = { 'long-range': 'Long Range', 'medium-range': 'Medium Range', 'short-range': 'Short Range' }[current.currentStep];
    if (current.currentStep === 'targeting') {
      const commanderUid = current.decisionSummary?.commander?.status === 'pending' && current.decisionSummary?.commander?.actors?.[0]?.uid;
      if (commanderUid) {
        const role = originalRoleForUid(commanderUid, roster), surface = await chooseActor(role, { brief: true });
        const ready = await paint(surface, 'commander-targeting');
        if (ready.status === 'source-changed') return true;
        assert.equal(ready.status, 'eligible', 'The current required Commander choice must actually be offered.');
        const button = surface.page.getByRole('button', { name: 'Finish rerolls', exact: true });
        await button.waitFor();
        await receiptForAttack(surface, 'finishWolfCommanderTargetingRerolls', () => button.click());
        committed('commander-targeting-choice', { uidHash: uidHash(commanderUid), choice: 'Explicitly finish current rerolls; no caller dice.' });
        return true;
      }
      const forceActor = current.decisionSummary?.forceField?.actor;
      if (current.decisionSummary?.forceField?.status === 'pending' && forceActor) {
        const role = originalRoleForUid(forceActor.uid, roster), surface = await chooseActor(role);
        const ready = await paint(surface, 'force-field');
        if (ready.status === 'source-changed') return true;
        assert.equal(ready.status, 'eligible', 'The current required Captain choice must actually be offered.');
        const panel = surface.page.getByRole('region', { name: 'Gorgoneion Force Field Projector', exact: true });
        await panel.waitFor(); await guidance(role, panel, 'force-field');
        const radios = panel.getByRole('radio');
        if (await radios.count()) await radios.first().check();
        const protect = panel.getByRole('button', { name: 'Protect selected ship', exact: true });
        const pass = panel.getByRole('button', { name: 'Pass Force Field', exact: true });
        await receiptForAttack(surface, 'commitWolfForceFieldChoice', () => (radios.count().then(count => count ? protect : pass)).then(button => button.click()));
        return true;
      }
      const wing = await chooseActor('wing-commander'), launchPanel = wing.page.getByRole('region', { name: 'AEGIS fighter wing launches', exact: true });
      {
        for (const [label, id] of [['Fighter Wing Alpha', 'alpha'], ['Fighter Wing Bravo', 'bravo']]) {
          const ready = await paint(wing, 'aegis-launch', { sourceId: `fighter-wing-${id}` });
          if (ready.status === 'source-changed') return true;
          if (ready.status !== 'eligible') continue;
          const launch = launchPanel.getByRole('button', { name: `Launch ${label}`, exact: true });
          if (await launch.isVisible() && await launch.isEnabled()) {
            await guidance('wing-commander', launchPanel, `aegis-${id}-launch`);
            const result = await receiptForAttack(wing, 'launchAegisFighterWing', () => launch.click());
            committed(`aegis-${id}-launch`, { resultFingerprint: proofHash(result), nextActor: 'Current range choices; server preserves actual wing count.' });
            return true;
          }
          const pass = launchPanel.getByRole('button', { name: `Pass ${label}`, exact: true });
          if (await pass.isVisible() && await pass.isEnabled()) {
            await guidance('wing-commander', launchPanel, `aegis-${id}-launch`);
            await receiptForAttack(wing, 'passWolfFighterLaunchChoice', () => pass.click());
            blocked(`aegis-${id}-launch`, 'Current source cannot launch; explicit offered pass committed.', 'Wing Commander / later ordinary Fighter Bay maintenance');
            return true;
          }
        }
      }
      for (const [role, label, endpoint, passLabel] of [
        ['dione-engineer', 'Launch Maliades', 'launchDioneMaliades', 'Pass Maliades'],
        ['refinery-124-pdf-colonel', 'Launch PDF Escort Wing', 'launchPdfEscortWing', 'Pass PDF Escort Wing']]) {
        if (!roster.some(value => value.roleId === role)) continue;
        const surface = await chooseActor(role);
        const ready = await paint(surface, role === 'dione-engineer' ? 'maliades-launch' : 'pdf-launch');
        if (ready.status === 'source-changed') return true;
        if (ready.status !== 'eligible') continue;
        const launch = surface.page.getByRole('button', { name: label, exact: true });
        const pass = surface.page.getByRole('button', { name: passLabel, exact: true });
        if (await launch.isVisible() && await launch.isEnabled()) {
          await receiptForAttack(surface, endpoint, () => launch.click()); return true;
        }
        if (await pass.isVisible() && await pass.isEnabled()) {
          await receiptForAttack(surface, 'passWolfFighterLaunchChoice', () => pass.click()); return true;
        }
      }
      const executive = await chooseActor('executive-officer');
      const warheads = executive.page.getByRole('region', { name: 'Enriched warheads', exact: true });
      const warheadReady = await paint(executive, 'warheads');
      if (warheadReady.status === 'source-changed') return true;
      if (warheadReady.status === 'eligible') {
        const enrich = warheads.getByRole('button', { name: 'Enrich warheads // 5 ore', exact: true });
        const pass = warheads.getByRole('button', { name: 'Pass enriched warheads', exact: true });
        if (await pass.isVisible() && await pass.isEnabled()) {
          await guidance('executive-officer', warheads, 'enriched-warheads');
          const paid = options.enrichWarheads !== false && await enrich.isVisible() && await enrich.isEnabled();
          const result = await receiptForAttack(executive, 'commitAegisEnrichedWarheadChoice', () => (paid ? enrich : pass).click());
          committed('enriched-warhead-choice', { choice: paid ? 'Source-offered five-ore enrichment' : 'Explicit offered pass', resultFingerprint: proofHash(result) });
          return true;
        }
      }
      const cnc = executive.page.getByRole('region', { name: 'Command and Control', exact: true });
      const pass = cnc.getByRole('button', { name: 'Pass Command and Control', exact: true });
      const commandReady = await paint(executive, 'command-and-control');
      if (commandReady.status === 'source-changed') return true;
      if (commandReady.status === 'eligible') {
        await guidance('executive-officer', cnc, 'command-and-control');
        if (options.commandAndControl === 'redirect') {
          await cnc.getByRole('radio').first().check();
          await receiptForAttack(executive, 'applyAegisCommandAndControl', () => cnc.getByRole('button', { name: 'Redirect selected ship', exact: true }).click());
        } else await receiptForAttack(executive, 'passAegisCommandAndControl', () => pass.click());
        committed('command-and-control-choice', { choice: options.commandAndControl === 'redirect' ? 'Redirect current selected ship' : 'Explicit offered pass' });
        return true;
      }
    }
    if (range) {
      if (current.currentStep !== 'long-range') {
        const surface = await chooseActor('wing-commander');
        for (const label of ['Fighter Wing Alpha', 'Fighter Wing Bravo']) {
          const ready = await paint(surface, 'fighter-range', { sourceId: label.endsWith('Alpha') ? 'fighter-wing-alpha' : 'fighter-wing-bravo', range: current.currentStep });
          if (ready.status === 'source-changed') return true;
          if (ready.status !== 'eligible') continue;
          const panel = surface.page.getByRole('region', { name: `${label} ${range} actions`, exact: true });
          const pass = panel.getByRole('button', { name: `Pass ${range}`, exact: true });
          const use = panel.getByRole('button', { name: current.currentStep === 'medium-range' ? 'Resolve Medium actions' : 'Resolve selected Short attacks', exact: true });
          if (!(await pass.isVisible()) || !(await pass.isEnabled())) continue;
          await guidance('wing-commander', panel, `${label}-${range}`);
          if (current.currentStep === 'medium-range') {
            for (const action of await panel.getByRole('combobox', { name: /^Fighter \d+ action$/ }).all()) {
              await action.selectOption('attack');
              const targetName = (await action.getAttribute('aria-label')).replace('action', 'target');
              const target = panel.getByRole('combobox', { name: targetName, exact: true });
              if (await target.locator('option').evaluateAll(nodes => nodes.some(node => node.value && !node.disabled))) await firstAvailableTarget(target);
            }
          } else for (const box of await panel.getByRole('checkbox', { name: /^Fighter \d+ Short attack$/ }).all()) await box.check();
          const choose = await use.isVisible() && await use.isEnabled() ? use : pass;
          await receiptForAttack(surface, 'commitWolfFighterRangeActionChoice', () => choose.click()); return true;
        }
      }
      for (const [role, label] of [['dione-engineer', 'Maliades'], ['refinery-124-pdf-colonel', 'P.D.F. Escort Fighter Wing']]) {
        if (!roster.some(value => value.roleId === role)) continue;
        if (current.currentStep === 'long-range') continue; // Escort controls exist only at Medium and Short.
        const surface = await chooseActor(role);
        const ready = await paint(surface, 'escort-range', { sourceId: role === 'dione-engineer' ? 'maliades' : 'pdf-escort-fighter-wing', range: current.currentStep });
        if (ready.status === 'source-changed') return true;
        if (ready.status !== 'eligible') continue;
        const panel = surface.page.getByRole('region', { name: `${label} ${range} actions`, exact: true });
        await guidance(role, panel, `${label}-${range}`);
        if (label === 'Maliades') {
          const pass = panel.getByRole('button', { name: `Pass Maliades ${range}`, exact: true });
          if (!(await pass.isVisible()) || !(await pass.isEnabled())) continue;
          const targets = panel.getByRole('combobox', { name: current.currentStep === 'medium-range'
            ? 'Maliades Medium attack target' : /^Maliades Short attack \d+ target$/ });
          if (await targets.count()) await firstAvailableTarget(targets.first());
          const use = panel.getByRole('button', { name: current.currentStep === 'medium-range'
            ? 'Commit Maliades Medium choices' : BASE_COMBAT_CONTROL_LABELS.maliadesShort, exact: true });
          await receiptForAttack(surface, 'commitWolfEscortRangeActionChoice', () =>
            (use.isEnabled().then(enabled => enabled ? use : pass)).then(button => button.click()));
        } else {
          const pass = panel.getByRole('button', { name: `Pass ${range}`, exact: true });
          if (!(await pass.isVisible()) || !(await pass.isEnabled())) continue;
          if (current.currentStep === 'medium-range') {
            for (const action of await panel.getByRole('combobox', { name: /^Fighter \d+ action$/ }).all()) {
              const targetLabel = (await action.getAttribute('aria-label')).replace('action', 'target');
              await action.selectOption('attack'); await firstAvailableTarget(panel.getByRole('combobox', { name: targetLabel, exact: true }));
            }
          } else for (const box of await panel.getByRole('checkbox', { name: /^Fighter \d+ Short attack$/ }).all()) await box.check();
          const use = panel.getByRole('button', { name: current.currentStep === 'medium-range' ? 'Resolve Medium actions' : 'Resolve selected Short attacks', exact: true });
          await receiptForAttack(surface, 'commitWolfEscortRangeActionChoice', () =>
            (use.isVisible().then(async visible => visible && await use.isEnabled() ? use : pass)).then(button => button.click()));
        }
        return true;
      }
      for (const [role, label, link] of [
        ['icebreaker-miner', 'Highwall Cannon', 'Open Highwall shuttle console'],
        ['gorgoneion-captain', 'Gorgoneion Missile Array', null],
        ['capybara-recycler', 'Boa Scrap Strike', 'Open Boa shuttle console']]) {
        if (!roster.some(value => value.roleId === role)) continue;
        const surface = await chooseActor(role);
        if (link) {
          const open = surface.page.getByRole('link', { name: link, exact: true });
          await open.waitFor({ state: 'visible', timeout: Math.max(1, Math.min(35_000, deadlineAt - Date.now())) }); await open.click();
        }
        const ready = await paint(surface, 'range-support', { sourceId: role === 'icebreaker-miner' ? 'highwall' : role === 'capybara-recycler' ? 'boa' : 'gorgoneion-missile-array', range: current.currentStep });
        if (ready.status === 'source-changed') return true;
        if (ready.status !== 'eligible') continue;
        const panel = surface.page.getByRole('region', { name: `${label} ${range} choice`, exact: true });
        const pass = panel.getByRole('button', { name: 'Pass this range', exact: true });
        if (!(await pass.isVisible()) || !(await pass.isEnabled())) continue;
        await guidance(role, panel, `${label}-${range}`);
        const target = panel.getByRole('combobox', { name: 'Boa target', exact: true });
        if (await target.isVisible()) {
          const options = await target.locator('option').evaluateAll(nodes => nodes.filter(node => node.value && !node.disabled).map(node => node.value));
          if (options.length) await target.selectOption(options[0]);
        }
        const use = panel.getByRole('button', { name: `Use ${label}`, exact: true });
        await receiptForAttack(surface, 'commitWolfRangeSupportActionChoice', () =>
          (use.isEnabled().then(enabled => enabled ? use : pass)).then(button => button.click())); return true;
      }
      const executive = await chooseActor('executive-officer');
      const rangeReady = await paint(executive, 'range-actions');
      if (rangeReady.status === 'source-changed') return true;
      const panel = executive.page.getByRole('region', { name: 'Wolf range actions', exact: true });
      if (rangeReady.status === 'eligible') {
        await guidance('executive-officer', panel, `aegis-${range}`);
        const use = panel.getByRole('button', { name: 'Use selected actions', exact: true });
        const pass = panel.getByRole('button', { name: 'Pass this range', exact: true });
        if (await use.isVisible()) {
          for (const box of await panel.getByRole('checkbox').all()) await box.check();
          const choose = await use.isEnabled() ? use : pass;
          await receiptForAttack(executive, 'commitWolfRangeActionChoice', () => choose.click()); return true;
        }
        const commit = panel.getByRole('button', { name: 'Commit target assignments', exact: true });
        if (await commit.isVisible()) {
          const view = options.protectedShipPriority === undefined
            ? rangeReady.choice
            : { ...rangeReady.choice, protectedShipPriority: options.protectedShipPriority };
          assert.equal(view.turn, current.turn); assert.equal(view.revision, current.revision); assert.equal(view.currentStep, current.currentStep);
          const currentReadiness = combatReadiness.get(executive);
          assert.ok(currentReadiness, 'The current original actor and decision budget are required.');
          const assignments = await selectBaseRangeTargetControls({ panel, view,
            deadlineAt: currentReadiness.deadlineAt,
            checkpoint: async () => assertWolfChoiceActor(await observeWolfChoiceActor(executive), currentReadiness.actor),
          });
          await receiptForAttack(executive, 'assignWolfRangeTargets', () => commit.click(), { assignments }); return true;
        }
      }
    }
    if (current.currentStep === 'boarding') {
      const commanderUid = current.decisionSummary?.commander?.actors?.[0]?.uid;
      if (commanderUid) {
        const role = originalRoleForUid(commanderUid, roster), surface = await chooseActor(role, { brief: true });
        const ready = await paint(surface, 'boarding-special');
        if (ready.status === 'source-changed') return true;
        if (ready.status === 'source-excluded' && ready.reason === 'no-special-choice')
          return { status: 'current-ui-blocked', reason: 'The current source boarding choices are complete; wait for normal finalization or its explicit Commander ruling.',
            boardingSourceClosed: { surface, readiness: ready } };
        const pass = surface.page.getByRole('button', { name: 'Do not lead', exact: true });
        if (ready.status === 'eligible' && await pass.isVisible() && await pass.isEnabled()) {
          await receiptForAttack(surface, 'commitWolfBoardingSpecialChoice', () => pass.click()); return true;
        }
      }
      const rulingTarget = current.boardingCommanderRulingRequiredTarget;
      if (rulingTarget !== undefined) {
        assert.ok(typeof rulingTarget === 'string' && rulingTarget,
          'Only an explicit current source-requested Commander ruling may select the GM.');
        assert.equal(rulingTarget, current.boardingCommanderChoice?.targetShipId);
        if (current.boardingCommanderRuling === undefined) {
          const surface = await chooseActor('gm');
          const gmReady = await paint(surface, 'boarding-special');
          if (gmReady.status === 'source-changed') return true;
          const panel = surface.page.getByRole('region', { name: 'Facilitator ruling for destroyed Commander-led parties', exact: true });
          if (gmReady.status === 'eligible' && gmReady.choice.choice?.kind === 'commander-ruling') {
            assert.equal(gmReady.choice.choice.targetShipId, rulingTarget);
            await guidance('gm', panel, 'commander-consequence');
            assert.ok(typeof options.commanderRuling === 'string' && options.commanderRuling.trim(),
              'An actual required Commander consequence needs the caller’s explicit GM ruling; no invented ruling.');
            await panel.getByRole('textbox', { name: 'Facilitator ruling', exact: true }).fill(options.commanderRuling);
            await receiptForAttack(surface, 'commitWolfBoardingSpecialChoice', () => panel.getByRole('button', { name: BASE_COMBAT_CONTROL_LABELS.commanderRuling, exact: true }).click()); return true;
          }
        }
      }
      const roles = [...new Set(['executive-officer', 'refinery-124-pdf-colonel', ...roster.map(actor => actor.roleId)])]
        .filter(role => role !== 'press-officer' && roster.some(actor => actor.roleId === role));
      for (const role of roles) {
        const currentActor = await chooseActor(role), special = currentActor.page.getByRole('region', { name: 'Current boarding special choice', exact: true });
        const specialReady = await paint(currentActor, 'boarding-special');
        if (specialReady.status === 'source-changed') return true;
        if (specialReady.status === 'source-excluded' && specialReady.reason === 'no-special-choice')
          return { status: 'current-ui-blocked', reason: 'The current source boarding choices are complete; wait for normal finalization or its explicit Commander ruling.',
            boardingSourceClosed: { surface: currentActor, readiness: specialReady } };
        if (specialReady.status === 'eligible') {
          await guidance(role, special, 'source-boarding-special');
          const stay = special.getByRole('button', { name: /^Stay at / });
          const pass = special.getByRole('button', { name: 'Pass rerolls', exact: true });
          const militia = special.getByRole('button', { name: 'Commit Militia risk', exact: true });
          const offered = await stay.isVisible() ? stay : await pass.isVisible() ? pass : await militia.isVisible() ? militia : null;
          if (offered && await offered.isEnabled()) {
            await receiptForAttack(currentActor, 'commitWolfBoardingSpecialChoice', () => offered.click()); return true;
          }
        }
        const defenceReady = await paint(currentActor, 'boarding-defence');
        if (defenceReady.status === 'source-changed') return true;
        if (defenceReady.status !== 'eligible') continue;
        const defence = currentActor.page.getByRole('region', { name: / boarding defence$/i });
        const commit = defence.getByRole('button', { name: 'Commit defence', exact: true });
        if (await commit.isVisible()) {
          await guidance(role, defence, 'boarding-security-teams');
          const control = defence.getByRole('combobox'), available = await control.locator('option').evaluateAll(nodes => nodes.filter(node => node.value && !node.disabled).map(node => node.value));
          assert.ok(available.length); await control.selectOption(available.at(-1));
          await receiptForAttack(currentActor, 'commitWolfBoardingDefenceChoice', () => commit.click()); return true;
        }
      }
    }
    return { status: 'current-ui-blocked', reason: 'Every inspected current source choice was explicitly unavailable or intentionally belongs to another actor; no role reload or SDK mutation fallback.' };
  }

  async function combatProcedure() {
    let current = await readGm('wolfAttackState/current');
    if (combat === 'opening') {
      const s = await state(), window = await readGm('wolfAttackWindow/current');
      const counts = openingWolfCounts({ cycle: s.cycle, window, attack: current });
      const prerequisites = assertBaseCombatPrerequisites(s, originalGm.cycle);
      report.observations.push({ stage: 'current paid AEGIS combat prerequisite', cycle: s.cycle,
        ...prerequisites,
        constructionRule: 'An intact charged Construction Bay and real materials are required only for ordinary replacement builds after actual losses.' });
      const surface = await select('gm'), timing = gm.page.getByRole('region', { name: 'Wolf attack timing controls', exact: true });
      await guidance('gm', timing, 'opening-window');
      if (window?.status !== 'due') {
        const due = timing.getByRole('button', { name: 'Mark timing due', exact: true });
        assert.equal(await due.isEnabled(), true, 'Only the currently offered ordinary due window is legal.');
        await rpc(surface, 'setWolfAttackWindow', () => due.click(), { expectedRevision: window?.revision ?? 0, status: 'due' });
      }
      const preparation = gm.page.getByRole('region', { name: 'Private Wolf attack preparation', exact: true });
      for (const [id, count] of Object.entries(counts)) await preparation.getByLabel(`${cardLabels[id]} count`, { exact: true }).fill(String(count));
      const priorDraft = await readGm('wolfAttackPreparation/current');
      await rpc(surface, 'stageWolfAttackPreparation', () => preparation.getByRole('button', { name: 'Save private attack draft', exact: true }).click(),
        { expectedRevision: priorDraft?.revision ?? 0 });
      const draft = await readGm('wolfAttackPreparation/current');
      assert.equal(draft.turn, s.cycle); assert.equal(draft.shipIds.length, 15);
      assert.equal(draft.shipIds.filter(id => id === 'wolf-fighter-wing').length, 10);
      assert.equal(draft.shipIds.filter(id => id === 'wolf-assault-transport').length, 5);
      await rpc(surface, 'declareWolfAttack', () => preparation.getByRole('button', { name: 'Declare Wolf attack', exact: true }).click(), { expectedRevision: draft.revision });
      current = await readGm('wolfAttackState/current');
    }
    assert.ok(current?.status === 'declared', 'Current combat mode requires the genuine already-declared attack.');
    assert.equal(current.turn, originalGm.cycle);
    const tools = { ...a, state, read: (_role, suffix, options) => readGm(suffix, options), select,
      receipt: receiptForAttack, record: async (stage, details) => {
        report.observations.push({ stage, ...details }); await save();
      } };
    const resolved = await resolveLiveWolfAttack(context, { tools, verifyReplay: false, chooseNext,
      timeoutMs: options.timeoutMs ?? 8 * 60_000 });
    assert.equal(resolved.currentStep, 'resolved'); assert.ok(Array.isArray(resolved.calculationReceipt?.fleetDamage));
    committed('wolf-resolution', { attack: attackSummary(resolved), serverCalculationFingerprint: proofHash(resolved.calculationReceipt) });
    const surface = await select('executive-officer'), original = await surface.observe();
    const view = await waitForBaseMemberAftermath({ inspect: () => surface.observe(), original, expected: resolved,
      read: () => a.read('executive-officer', 'wolfAttackAudience/current'), renderedReady: value => renderedBaseMemberAftermath(surface, value) });
    await guidance('executive-officer', surface.page.getByRole('region', { name: 'Wolf attack status', exact: true }), 'committed public aftermath');
    committed('member-aftermath', { audience: 'members', resultCount: view.results.length,
      revision: view.revision, remainingThreatCount: view.remainingThreatCount, returningThreatCount: view.returningThreatCount });
    report.observations.push({ source: 'authoritative after-state', fleetDamage: resolved.calculationReceipt.fleetDamage.map(row =>
      ({ shipId: row.target, amount: row.amount, populationBefore: row.populationBefore, populationAfter: row.population, destroyed: row.state?.destroyed })),
      nextActor: 'Current ship engineers / eligible Doctor, Warrior or Capybara holders; caller owns further Team maintenance.' });
  }

  async function researchAndDetector() {
    const role = 'shepherd-scientist';
    if (!roster.some(value => value.roleId === role)) { blocked('agent-detector', 'No current Scientist in confirmed roster.', role); return; }
    let intendedTarget;
    if (options.detectorTest) intendedTarget = await availableWolfTarget();
    const surface = await select(role), originalResearchActor = await surface.observe();
    await openBaseEndeavourResearchRoute({ page: surface.page,
      checkpoint: async () => assertOriginalBaseActor(await surface.observe(), originalResearchActor) });
    const research = surface.page.getByRole('region', { name: 'Endeavour research controls', exact: true });
    await research.waitFor(); await guidance(role, research, 'research-readiness');
    async function renderedResearch(workspace, receipt) {
      const busy = await research.getAttribute('aria-busy');
      if (busy !== 'false') return false;
      const progress = research.getByRole('list', { name: 'Research progress', exact: true });
      if (!(await progress.isVisible())) return false;
      const rows = await progress.getByRole('listitem').allTextContents();
      return baseResearchPaintMatches({ busy, progressVisible: true, rows, text: await research.innerText(),
        detectorVisible: await surface.page.getByRole('region', { name: 'Wolf Agent Detector', exact: true }).isVisible() }, workspace, receipt);
    }
    if (options.researchDetector) {
      const original = await surface.observe();
      const workspace = await currentActorRead(surface, 'readEndeavourResearchWorkspace');
      const paintedDeadline = Date.now() + 60_000;
      let painted = false;
      while (Date.now() < paintedDeadline) {
        assertOriginalBaseActor(await surface.observe(), original);
        painted = await renderedResearch(workspace);
        if (painted) break;
        await delay(200);
      }
      assert.equal(painted, true, 'Wait for the actual current Scientist research workspace before choosing.');
      const control = research.getByRole('combobox', { name: 'Research track', exact: true });
      const available = await control.locator('option').evaluateAll(nodes => nodes.some(node => node.value === 'wolf-agent-detector' && !node.disabled));
      if (!available) {
        blocked('detector-research-cross', 'The actual current track is already complete/chosen or unavailable; no duplicate cross.', role);
      } else {
        await control.selectOption('wolf-agent-detector');
        const funding = options.researchFunding ?? 'standard';
        assert.ok(['standard', 'shepherd-ore'].includes(funding));
        const button = research.getByRole('button', { name: funding === 'shepherd-ore' ? 'Advance with 5 Shepherd ore' : 'Advance standard research', exact: true });
        if (await button.isEnabled()) {
          const current = await state();
          const result = await rpc(surface, 'advanceEndeavourResearchTrack', () => button.click(), {
            expectedCycle: report.cycle, expectedResearchRevision: workspace.researchRevision,
            expectedControlRevision: current.shuttleControl?.endeavour?.revision, trackId: 'wolf-agent-detector', funding });
          await waitForBaseResearchReceipt({ inspect: () => surface.observe(), original, receipt: result,
            read: () => currentActorRead(surface, 'readEndeavourResearchWorkspace'),
            renderedReady: value => renderedResearch(value, result) });
          committed('detector-research-cross', { audience: 'actor', cycle: report.cycle,
            researchRevision: result.researchRevision, crossedBoxes: result.progress['wolf-agent-detector'],
            oreSpent: result.oreCost, exactSourceAndRenderedReceipt: true });
        } else blocked('detector-research-cross', 'Actual Team/control/cadence/resources block the offered research action.', role);
      }
    }
    const panel = surface.page.getByRole('region', { name: 'Wolf Agent Detector', exact: true });
    if (!(await panel.isVisible())) { blocked('agent-detector', 'Canonical Detector research is not complete; caller must make genuine Team research choices.', role); return; }
    await guidance(role, panel, 'agent-detector');
    const button = panel.getByRole('button', { name: 'Run detector test', exact: true });
    if (!options.detectorTest) { blocked('agent-detector', 'Eligible action observed; caller did not select a private test.', role); return; }
    if (!intendedTarget) { blocked('agent-detector', 'No current original Wolf holder can be an actual entitled target.', 'Current GM source census / Scientist'); return; }
    const target = await firstAvailableTarget(panel.getByRole('combobox', { name: 'Player to test', exact: true }), intendedTarget.uid);
    originalRoleForUid(target, roster);
    if (!(await button.isEnabled())) { blocked('agent-detector', 'Current source target/three-tests allowance/live authority blocks a test.', role); return; }
    const result = await rpc(surface, 'runWolfAgentDetectorTest', () => button.click(), { expectedCycle: report.cycle, targetUid: target });
    validatePrivateDeductionReply(result, { sessionId: initial.sessionId, cycle: report.cycle,
      investigatorUid: result.investigatorUid, targetUid: target });
    assert.equal(uidHash(result.investigatorUid), (await surface.observe()).uidHash);
    committed('agent-detector', { audience: 'actor', uidHash: uidHash(result.investigatorUid), targetHash: uidHash(target), revision: result.revision,
      reportedResultFingerprint: proofHash(result.reportedWolf), hiddenTruthRecorded: false });
  }
  async function availableWolfTarget() {
    const census = await readGm('loyaltyCensus/current');
    const entry = census?.entries?.find(value => value.kind === 'wolf-agent' &&
      roster.some(actor => actor.uidHash === uidHash(value.uid) && (!options.targetRoleId || actor.roleId === options.targetRoleId)));
    if (!entry) return null;
    const roleId = originalRoleForUid(entry.uid, roster);
    await select(roleId); // Normal original BrowserB actor selection supplies current connection, not a fabricated target.
    return { uid: entry.uid, roleId };
  }
  async function privateDeduction() {
    const census = await readGm('loyaltyCensus/current');
    for (const [id, kinds, requested] of [
      ['wolf-intelligence', ['wolf-agent', 'wolf-cult'], options.sendWolfIntelligence],
      ['intelligence-investigation', ['intelligence-agent'], options.investigate]]) {
      const entry = census?.entries?.find(value => kinds.includes(value.kind) && roster.some(actor => actor.uidHash === uidHash(value.uid)));
      if (!entry) { blocked(id, 'No actually assigned current private holder in the ordinary roster.', 'Normal GM optional loyalty setup before start / current private holder'); continue; }
      const role = originalRoleForUid(entry.uid, roster);
      const intendedTarget = id === 'intelligence-investigation' && requested ? await availableWolfTarget() : null;
      const surface = await select(role, { brief: true });
      if (id === 'wolf-intelligence') {
        const panel = surface.page.getByRole('region', { name: 'Private Wolf action', exact: true });
        await panel.waitFor(); await guidance(role, panel, id);
        if (!requested) { blocked(id, 'Current private action observed; handler message choice not requested.', role); continue; }
        await panel.getByRole('textbox', { name: 'Short handler message', exact: true }).fill(`Observed fleet status: active cycle ${report.cycle}.`);
        const button = panel.getByRole('button', { name: 'Send private intelligence', exact: true });
        if (!(await button.isEnabled())) { blocked(id, 'Actual private authority or action state blocks this handler message.', role); continue; }
        const result = await rpc(surface, 'submitWolfIntelligence', () => button.click(), { expectedCycle: report.cycle });
        assert.equal(result.sessionId, initial.sessionId); assert.equal(result.cycle, report.cycle);
        assert.equal(result.coverRoleId, role); assert.equal(result.suspicion, entry.suspicion + 3);
        committed(id, { audience: 'actor', uidHash: uidHash(entry.uid), resultFingerprint: proofHash(result),
          suspicionBefore: entry.suspicion, suspicionAfter: result.suspicion, suspicionCost: 3,
          nextActor: 'Current GM reads the server clue instruction; no human clue delivery is inferred.',
          sourceMessage: 'Current observed cycle only; no invented intelligence.' });
      } else {
        const panel = surface.page.getByRole('region', { name: BASE_COMBAT_CONTROL_LABELS.investigationRegion, exact: true });
        await panel.waitFor(); await guidance(role, panel, id);
        const button = panel.getByRole('button', { name: 'Run private investigation', exact: true });
        if (!requested) { blocked(id, 'Eligible private investigation observed; no target choice requested.', role); continue; }
        if (!intendedTarget) { blocked(id, 'No actual current original Wolf target is eligible for this private report.', 'Current GM source census / Intelligence Agent'); continue; }
        const target = await firstAvailableTarget(panel.getByRole('combobox', { name: 'Investigation target', exact: true }), intendedTarget.uid);
        originalRoleForUid(target, roster);
        if (!(await button.isEnabled())) { blocked(id, 'One-per-cycle allowance/target/current authority blocks investigation.', role); continue; }
        const result = await rpc(surface, 'investigateAsIntelligenceAgent', () => button.click(), { expectedCycle: report.cycle, targetUid: target });
        validatePrivateDeductionReply(result, { sessionId: initial.sessionId, cycle: report.cycle, investigatorUid: entry.uid, targetUid: target });
        committed(id, { audience: 'actor', uidHash: uidHash(entry.uid), targetHash: uidHash(target), revision: result.revision,
          suspicionBefore: entry.suspicion, suspicionAfter: result.suspicion, reportedResultFingerprint: proofHash(result.reportedWolf), hiddenTruthRecorded: false });
        assert.equal(result.suspicion, entry.suspicion + 2);
      }
    }
    await select('gm');
    const clue = gm.page.getByRole('region', { name: 'Latest Wolf suspicion clue', exact: true });
    if (await clue.isVisible()) {
      const current = await readGm('wolfClueDisclosure/current');
      assert.equal(current?.cycle, report.cycle);
      assert.equal(typeof current.facilitatorInstruction, 'string');
      assert.ok((await clue.innerText()).includes(current.facilitatorInstruction));
      committed('suspicion-guidance', { audience: 'gm', currentClueFingerprint: proofHash(current),
        instructionDisplayed: true, rawInstructionOrUidOrRollRecorded: false,
        clueDeliveryAttested: false, nextActor: 'GM chooses an entitled recipient using the actual displayed source instruction.' });
    } else blocked('suspicion-guidance', 'No actual Wolf action has produced a current facilitator clue.', 'Current Wolf private action / GM');
  }

  await save();
  try {
    if (combat !== 'none') await combatProcedure();
    if (options.deduction !== false) { await researchAndDetector(); await privateDeduction(); }
    assertRequiredBaseBranches(report.branches, required);
    assertOriginalBaseActor(await gm.observe(), originalGm);
    report.status = Object.values(report.branches).some(value => value.status === 'blocked') ? 'partial-explicit-uncredited-branches' : 'requested-procedures-committed-ending-pending';
    await save(); return report;
  } catch (error) {
    report.status = 'failed-or-incomplete'; report.failure = { message: error.message, nextActor: 'Caller/root; preserve current source state and normal authority.' };
    await save(); throw error;
  }
}

/** One real Team research action. Repeat only after caller-owned genuine later Team phases. */
export const advanceBaseDetectorResearch = (context, options = {}) => runBaseCombatAndDeduction(context,
  { ...options, combat: 'none', researchDetector: true, requiredBranches: ['detector-research-cross'] });
