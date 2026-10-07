import { observeUiReceipt } from './pc10-browser-ui-receipt.mjs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { completeOfferedTurnAdvance, isObservedGameEnding } from './pc10-full-game-demo-proof-helpers.mjs';
import { runPursuitLimitEnding } from './pc10-full-game-cycle-ending.mjs';
import { extraRoleScenario, createExtraRoleMatrix, extraRoleCoverage, recordExtraRoleResult,
  choosePrintedRation, isCompletedMaintenanceForCycle } from './pc10-extra-role-proof-helpers.mjs';
import { ExtraRoleActions, publicState, untilPublic, chooseVisibleOption } from './pc10-extra-role-actions.mjs';
export { guardExtraRoleCommand } from './pc10-extra-role-actions.mjs';

const ownRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const JOINT = [['joint-engineering-quellon-refinery', 'quellon', 'wobbly'],
  ['joint-engineering-quellon-refinery', 'refinery-124'],
  ['joint-engineering-shepherd-icebreaker', 'shepherd', 'ally'],
  ['joint-engineering-shepherd-icebreaker', 'icebreaker']];
const SMALL_HOSTS = { gorgoneion: 'aegis', 'capybara-small': 'dione', warrior: 'shepherd', vulcan: 'quellon' };

export function extraRoleProcedureStep(scenario, row, { jumpLength = 'short' } = {}) {
  if (row.physicalFactRequired || row.unavailableReason) return { kind: 'blocked' };
  const suffix = row.id.slice(row.roleId.length + 1);
  if (suffix === 'eligibility' || suffix === 'assignment')
    return { kind: 'replacement-transition', roleId: row.roleId, action: suffix };
  if (scenario === 'replacements' && row.roleId === 'warrior-captain' && suffix === 'cargo-transfer')
    return { kind: 'warrior-cargo-transfer', roleId: row.roleId, craftId: 'warrior' };
  if (scenario === 'replacements' && ['warrior', 'vulcan'].includes(row.roleId.replace('-captain', '')) && suffix === 'jump-drive')
    return { kind: 'small-craft-jump', roleId: row.roleId, craftId: row.roleId.replace('-captain', ''), range: jumpLength };
  const laserRange = scenario === 'replacements' && row.roleId === 'vulcan-captain'
    ? suffix.match(/^laser-cannon-(medium|short)$/)?.[1] : undefined;
  if (laserRange) return { kind: 'vulcan-laser-range', roleId: row.roleId, range: `${laserRange}-range` };
  if (scenario === 'joint') {
    const maintenance = JOINT.find(([role, ship, craft]) => role === row.roleId &&
      (suffix.startsWith(`${ship}-`) || suffix === `${craft}-fuel`));
    if (maintenance) {
      const [roleId, shipId, craftId] = maintenance;
      return { kind: 'joint-maintenance', roleId, shipId, ...(craftId ? { craftId } : {}),
        action: suffix === `${craftId}-fuel` ? 'bays' : suffix.slice(shipId.length + 1) };
    }
    return { kind: 'craft' };
  }
  if (suffix.startsWith('maintenance-')) return { kind: 'small-maintenance',
    shipId: row.roleId.replace('-captain', ''), action: suffix.slice('maintenance-'.length) };
  return { kind: 'replacement-action' };
}

export function extraRoleActionRoute(roleId) {
  if (roleId === 'vip-host') return '/ships/dione/roles/vip-host';
  if (roleId === 'commissar') return '/ships/icebreaker/roles/commissar';
  if (['comms-officer', 'doctor', 'pdf-fighter-ace', 'rosal-militia-leader'].includes(roleId))
    return `/replacement/${roleId}`;
  return '/brief';
}

export function validateExtraRoleRoster(plan, roster) {
  assert.ok(Array.isArray(roster) && roster.length, 'The actual ordinary admission roster is required.');
  assert.equal(new Set(roster.map(actor => actor.uidHash)).size, roster.length, 'Ordinary actors must have distinct real Auth UIDs.');
  assert.ok(roster.every(actor => actor.roleId && actor.uidHash && actor.displayName), 'Original actor metadata is required.');
  for (const { anchorRoleId } of plan.actors) assert.equal(roster.filter(actor => actor.roleId === anchorRoleId).length, 1,
    `Exactly one original admitted actor ${anchorRoleId} must remain in the roster.`);
}

async function binding(root) {
  const files = [];
  async function walk(path, relative = '') {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(`${path}/${entry.name}`, name);
      else if (entry.isFile()) files.push([name, createHash('sha256').update(await readFile(`${path}/${entry.name}`)).digest('hex')]);
    }
  }
  await walk(`${root}/functions/lib`);
  files.sort(([left], [right]) => left.localeCompare(right));
  return { sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    indexSha256: files.find(([name]) => name === 'index.js')?.[1], compiledFileCount: files.length,
    compiledTreeSha256: createHash('sha256').update(files.map(([name, hash]) => `${name}\0${hash}\n`).join('')).digest('hex') };
}

/** Constructing callback recipes has no IO, Auth, or browser side effects.
 * Different printed ranges/charges run in separate fresh cases. Their unexecuted
 * branches stay pending; no role visit or fixture gains function credit. */
export function createExtraRoleCallbacks({ scenario = 'joint', variant = 'coordination',
  aceRange = 'long', jumpLength = 'short', directory = '/tmp/dow-pc10-evidence/extra-roles',
  missionCoordinate, terminal = runPursuitLimitEnding } = {}) {
  const plan = extraRoleScenario(scenario);
  assert.ok(['coordination', 'wolf', 'mission'].includes(variant), 'Use a supported source variant.');
  assert.ok(['long', 'medium', 'short'].includes(aceRange), 'Use a source Fighter Ace range.');
  assert.ok(['long', 'medium', 'short'].includes(jumpLength), 'Use a source jump range.');
  assert.ok(missionCoordinate === undefined || /^\d{4}$/.test(missionCoordinate), 'A mission destination must be a real printed coordinate.');
  const matrix = createExtraRoleMatrix(scenario);
  const evidence = { schemaVersion: 2, scenario, variant, aceRange, jumpLength,
    actualBrowserProcesses: 0, actualBrowserContexts: 0, actualAuthAccounts: null,
    actualHumans: 0, actualHumanDevices: 0, adminGameplayWrites: false,
    acceleratedClock: false, seededPrivateHands: false, sourceForcedRandomness: false,
    receipts: [], surfaces: [], stages: [], recovery: [], trainingChoices: [], uiGaps: [], matrix,
    everyRoleFunctionComplete: false, terminalCompleted: false };
  let live;
  const save = async () => {
    Object.assign(evidence, extraRoleCoverage(matrix));
    await writeFile(`${directory}/extra-role-receipts.json`, `${JSON.stringify(evidence, null, 2)}\n`);
  };
  const stage = async name => {
    evidence.stages.push({ name, at: new Date().toISOString() });
    console.log(JSON.stringify({ extraRoleStage: name })); await save();
  };
  async function init(context) {
    validateExtraRoleRoster(plan, context.roster);
    if (!live) live = new ExtraRoleActions({ context, plan, matrix, evidence, save, stage, directory });
    assert.equal(context.initial.sessionId, live.context.initial.sessionId, 'A callback cannot silently adopt another fresh game.');
    await live.inspectGm();
    evidence.actualBrowserProcesses = 2; evidence.actualBrowserContexts = 2;
    if (evidence.controllerUidHash) {
      const gm = await context.gm.observe();
      const actualUids = new Set([...context.roster.map(actor => actor.uidHash), gm.uidHash, evidence.controllerUidHash]);
      assert.equal(actualUids.size, context.roster.length + 2, 'The actual GM, controller and ordinary role actors must have distinct Auth UIDs.');
      evidence.actualAuthAccounts = actualUids.size;
    }
    return live;
  }
  const actorFor = roleId => plan.actors.find(actor => actor.roleId === roleId)?.anchorRoleId ?? roleId;
  const selectRole = (roleId, route = extraRoleActionRoute(roleId)) => live.select(actorFor(roleId), roleId, route);
  async function button(id, expected, scope, name, configure, actionOptions = {}) {
    const row = matrix.find(row => row.id === id); assert.ok(row?.endpoint);
    if (await scope.count()) await configure?.(scope);
    const locator = scope.getByRole('button', { name, exact: typeof name === 'string' }).first();
    if (!await live.offered(id, locator, scope)) return false;
    await live.ui(expected ? live.context.crew : live.context.gm, row.endpoint, locator,
      { id, expected, replay: true, ...actionOptions });
    return true;
  }
  async function recovery(expected, label) {
    await live.context.crew.page.reload(); await live.inspectCrew(expected);
    evidence.recovery.push({ label, anchorRoleId: expected.anchorRoleId, currentRoleId: expected.roleId,
      uidHash: expected.uidHash, sameOriginalUid: true, privateAudienceVerified: true, emptyOutbox: true }); await save();
  }
  async function unionHosts(context) {
    const gm = context.gm;
    for (const [craft, host] of [['Wobbly', 'quellon'], ['Ally', 'shepherd']]) {
      const before = await gm.until('Normal owned live Cycle0 GM for Union host choice', value =>
        value.sameActor && value.playerRole === 'gm' && value.gmInstanceOwned && value.sessionId === context.initial.sessionId &&
        value.cycle === 0 && value.connection === 'live' && value.freshness === 'server');
      const panel = gm.page.getByRole('region', { name: `${craft} starting host`, exact: true });
      await panel.getByLabel(`${craft} starting host`, { exact: true }).selectOption(host);
      const response = await observeUiReceipt({ page: gm.page,
        consumed: { endpoint: 'setUnionCraftStartingHost', before },
        waitForResponse: () => gm.page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/us-central1/setUnionCraftStartingHost')
          && response.request().method() === 'POST'),
        choose: () => panel.getByRole('button', { name: `Save ${craft} starting host`, exact: true }).click(),
      });
      const data = response.request().postDataJSON()?.data;
      assert.equal(response.status(), 200); assert.equal(data?.sessionId, context.initial.sessionId);
      assert.equal((await gm.callable('setUnionCraftStartingHost', data)).status, 'committed');
      const after = await gm.observe(); assert.equal(after.uidHash, before.uidHash);
      assert.ok(after.instanceId === before.instanceId, 'The original owned GM instance must remain unchanged.');
      evidence.receipts.push({ endpoint: 'setUnionCraftStartingHost', httpStatus: 200, requestId: data.requestId,
        transport: 'ordinary-ui', identityVerified: true, exactOrdinarySdkReplayAccepted: true,
        craftId: craft.toLowerCase(), hostShipId: host, trainingChoice: 'Explicit normal GM initial Union dock choice.' });
    }
    await save();
  }
  async function jointMaintenance(roleId, shipId, craftId, onlyAction) {
    const expected = await selectRole(roleId, `/union/roles/${roleId}`), crew = live.context.crew;
    await crew.page.getByRole('navigation', { name: 'Engineering ship selection', exact: true })
      .getByRole('button', { name: new RegExp(shipId === 'refinery-124' ? 'Refinery' : shipId, 'i') }).click();
    await live.inspectCrew(expected); await live.inventory(expected, `${roleId}-${shipId}`);
    const turn = (await publicState(crew)).cycle;
    const names = { begin: `Begin Maintenance Cycle: Cycle ${turn}`, storage: 'Check storage', rations: 'Proceed with rations',
      unrest: 'Run unrest check', riot: 'Run riot check', reactor: 'Power up reactor', bays: 'Proceed with refuelling', end: 'End maintenance cycle' };
    for (const action of onlyAction ? [onlyAction] : Object.keys(names)) {
      assert.ok(Object.hasOwn(names, action), 'Use an actual printed Joint maintenance step.');
      const id = `${roleId}:${shipId}-${action}`, scope = crew.page.locator('main');
      if (action === 'rations') {
        const current = await publicState(live.context.gm);
        for (const resource of ['Food', 'Water']) {
          const choice = scope.getByLabel(`${resource} ration level`, { exact: true });
          const options = await choice.locator('option').evaluateAll(options => options.map(option => ({ value: option.value, text: option.textContent.trim() })));
          await choice.selectOption(choosePrintedRation(options, current.resources?.[shipId]?.[resource.toLowerCase()]));
        }
      }
      if (action === 'bays' && craftId) {
        let selected = false;
        for (const choice of await scope.locator('select[aria-label$="refuelling"]').all())
          if (await choice.isEnabled() && await choice.locator(`option[value="${craftId}"]`).count()) {
            await choice.selectOption(craftId); selected = true; break;
          }
        if (!selected) await live.block(`${roleId}:${craftId}-fuel`, 'No current operational bay offers this actual craft.', roleId);
      }
      let locator = scope.getByRole('button', { name: names[action], exact: true });
      if (!await live.offered(id, locator, scope)) break;
      if (action === 'begin' || action === 'reactor') { await locator.click(); locator = scope.getByRole('button', { name: 'ARE YOU SURE?', exact: true }); }
      const { receipt } = await live.ui(crew, 'runMaintenance', locator, { id, expected, replay: true });
      if (action === 'bays' && craftId) {
        const fuel = await untilPublic(live.context.gm, 'Actual companion fuel result', state => state.live &&
          state.shuttleFuelled?.[craftId] === true);
        if (fuel.shuttleFuelled?.[craftId] === true) recordExtraRoleResult(matrix, `${roleId}:${craftId}-fuel`,
          { status: 'committed', receipt: { ...receipt, transport: 'source-automatic' } });
      }
      if (action === 'end') await untilPublic(live.context.gm, 'Actual current maintenance completion', state =>
        isCompletedMaintenanceForCycle(state.maintenance?.[shipId], turn));
    }
    await recovery(expected, `Joint ${shipId} restoration after real maintenance`);
  }
  async function craftProcedure(row) {
    const craftId = row.id.includes(':wobbly-') ? 'wobbly' : 'ally';
    const expected = await selectRole(row.roleId, `/shuttles/${craftId}`), page = live.context.crew.page;
    const action = row.id.split(`:${craftId}-`)[1];
    if (action === 'fuel') return live.block(row.id, 'Fuel requires the actual Joint bays receipt.', row.roleId);
    if (action === 'recharge') return button(row.id, expected, page.getByRole('region', { name: 'Service shuttle recharge', exact: true }), 'Recharge console',
      panel => chooseVisibleOption(panel.getByLabel('Host console', { exact: true })));
    if (action === 'repair') {
      if (!await live.damage('shepherd')) return live.block(row.id, 'The genuine unforced damage draw destroyed the host.', 'GM: separate fresh repair case');
      await untilPublic(live.context.crew, 'Actual host damage reaches holder', state => Boolean(state.damage?.shepherd?.damagedSystemIds?.length));
      return button(row.id, expected, page.getByRole('region', { name: 'Ally console repair', exact: true }), 'Repair selected consoles',
        async panel => { const choices = panel.getByRole('checkbox'); if (await choices.count()) await choices.first().check(); });
    }
    if (action === 'cargo-load' || action === 'cargo-unload') return button(row.id, expected,
      page.getByRole('region', { name: 'Shuttle cargo transfer', exact: true }), action === 'cargo-load' ? 'Load shuttle' : 'Unload shuttle', async panel => {
        await chooseVisibleOption(panel.getByLabel('Resource', { exact: true })); await panel.getByLabel('Amount', { exact: true }).fill('1');
      });
    const departure = page.getByRole('region', { name: 'Shuttle departure', exact: true });
    if (action === 'departure') return button(row.id, expected, departure, 'Request departure',
      panel => chooseVisibleOption(panel.getByLabel('Destination ship', { exact: true })));
    if (action === 'transit') return button(row.id, expected, departure, 'Begin transit');
    if (action === 'retarget') return button(row.id, expected, departure, 'Retarget shuttle',
      panel => chooseVisibleOption(panel.getByLabel('New destination ship', { exact: true })));
    if (action === 'arrival') {
      const arrival = departure.getByRole('button', { name: 'Complete arrival', exact: true });
      if (!await departure.getByText(/In transit to /).count()) return live.block(row.id, 'No real in-flight movement offers arrival.', row.roleId);
      const deadline = Date.now() + 90_000;
      while ((!await arrival.count() || !await arrival.isEnabled()) && Date.now() < deadline) await delay(250); // natural source transit; no clock writes
      return button(row.id, expected, departure, 'Complete arrival');
    }
    if (action === 'evacuation') return button(row.id, expected, page.getByRole('region', { name: 'Survivor evacuation', exact: true }), 'Move survivors',
      async panel => { await chooseVisibleOption(panel.getByLabel('Receiving ship', { exact: true }));
        const choice = panel.getByLabel('Survivors', { exact: true });
        if (await choice.count()) await chooseVisibleOption(choice, option => Number(option.value) > 0); });
    if (action === 'handoff') return button(row.id, expected, page.getByRole('region', { name: 'Shuttle control', exact: true }), 'Hand off control', async panel => {
      const recipient = live.context.roster.find(actor => actor.roleId === 'admiral');
      await chooseVisibleOption(panel.getByLabel('Hand off to', { exact: true }), option => option.text.includes(recipient.displayName));
    });
    if (action === 'reclaim') return button(row.id, expected, page.getByRole('region', { name: 'Shuttle control', exact: true }), 'Reclaim control');
    if (action === 'boarding') return boarding(row, expected);
    if (action?.startsWith('dismantle-')) return dismantle(row, expected, action.slice('dismantle-'.length));
    throw Error(`Uncomposed craft procedure ${row.id}.`);
  }
  async function dismantle(row, expected, action) {
    const crew = live.context.crew;
    if (action === 'proposal' || action === 'apply') {
      const panel = crew.page.getByRole('region', { name: 'Permissioned dismantling proposal', exact: true });
      if (action === 'proposal' && await panel.count()) {
        const reset = panel.getByRole('button', { name: /^(Start a new permission request|Start another request)$/ });
        if (await reset.count() && await reset.isEnabled()) await reset.click();
        await chooseVisibleOption(panel.getByLabel('Undamaged target console', { exact: true }));
      }
      return button(row.id, expected, panel, action === 'proposal' ? 'Request target-player permission' : 'Apply consented dismantling');
    }
    const target = await live.select('shepherd-captain', 'shepherd-captain', '/ships/shepherd/roles/shepherd-captain');
    return button(row.id, target, crew.page.getByRole('region', { name: 'Permissioned dismantling request', exact: true }).first(),
      { consent: 'Grant permission', decline: 'Decline request', revoke: 'Revoke consent' }[action]);
  }
  async function assign(roleId, onlyAction) {
    const actor = plan.actors.find(actor => actor.roleId === roleId);
    const original = live.context.roster.find(entry => entry.roleId === actor.anchorRoleId);
    const panel = live.context.gm.page.getByRole('region', { name: 'Facilitator replacement roles', exact: true });
    const selected = await chooseVisibleOption(panel.getByLabel('Player record', { exact: true }), option => option.text.startsWith(original.displayName));
    assert.ok(selected, 'Select the actual original player record, never a fabricated UID.');
    if (onlyAction !== 'assignment') {
      await panel.getByLabel('Eligibility reason', { exact: true }).selectOption('removed');
      const choice = 'Normal GM simulated-station retirement ruling: removed; no death, arrest or physical attendance asserted.';
      evidence.trainingChoices.push({ roleId, anchorRoleId: actor.anchorRoleId, choice });
      await live.ui(live.context.gm, 'setReplacementEligibility', panel.getByRole('button', { name: 'Record eligibility', exact: true }),
        { id: `${roleId}:eligibility`, replay: true, trainingChoice: choice });
    }
    if (onlyAction === 'eligibility') return true;
    if (!await panel.getByLabel('Replacement role', { exact: true }).locator(`option[value="${roleId}"]`).count()) {
      await live.block(`${roleId}:assignment`, 'Normal GM catalog does not offer this source role in the current actual state.', 'GM: satisfy source catalog availability'); return false;
    }
    await panel.getByLabel('Replacement role', { exact: true }).selectOption(roleId);
    await live.ui(live.context.gm, 'assignReplacementRole', panel.getByRole('button', { name: 'Assign replacement role', exact: true }),
      { id: `${roleId}:assignment`, replay: true });
    live.replacements.add(roleId);
    const expected = await selectRole(roleId); await live.inventory(expected, roleId);
    await recovery(expected, `${roleId} original UID/current private brief restoration`); return true;
  }
  async function smallPanel(shipId) {
    const name = await live.context.gm.page.evaluate(async id => {
      const { SMALL_SHIPS } = await import('/src/data/ships.ts'); return SMALL_SHIPS.find(ship => ship.id === id)?.name;
    }, shipId);
    assert.ok(name, 'Use the real printed small-ship catalog name.');
    return { name, panel: live.context.gm.page.getByRole('region', { name: `${name} small-ship operations`, exact: true }) };
  }
  async function docking(shipId, docked) {
    const { name, panel } = await smallPanel(shipId), id = `${shipId}-captain:${docked ? 'docking' : 'undock'}`;
    if (docked && await panel.getByLabel(`${name} host ship`, { exact: true }).isEnabled())
      await panel.getByLabel(`${name} host ship`, { exact: true }).selectOption(SMALL_HOSTS[shipId]);
    return button(id, null, panel, docked ? 'Dock for Team / Wolf Attack' : 'Undock after cycle');
  }
  async function smallMaintenance(shipId, round, onlyAction) {
    const roleId = `${shipId}-captain`, { name, panel } = await smallPanel(shipId);
    const cycle = (await publicState(live.context.gm)).cycle;
    const names = { begin: `Begin small-ship cycle // Cycle ${cycle}`, rations: 'Apply host-funded rations',
      unrest: 'Run unrest roll // server dice', riot: 'Run population / riot roll // server dice', reactor: 'Charge selected consoles', end: 'End small-ship cycle' };
    for (const action of onlyAction ? [onlyAction] : Object.keys(names)) {
      assert.ok(Object.hasOwn(names, action), 'Use an actual printed small-ship maintenance step.');
      const id = `${roleId}:maintenance-${action}`;
      if (action === 'rations') {
        const current = await publicState(live.context.gm), host = current.smallShips?.[shipId]?.hostShipId;
        for (const resource of ['food', 'water']) {
          const choice = panel.getByLabel(`${name} ${resource} ration`, { exact: true });
          if (!await choice.count()) break;
          const options = await choice.locator('option').evaluateAll(options => options.map(option => ({ value: option.value, text: option.textContent.trim() })));
          await choice.selectOption(choosePrintedRation(options, current.resources?.[host]?.[resource]));
        }
      }
      if (action === 'reactor') {
        for (const choice of await panel.getByRole('checkbox').all())
          if (await choice.isChecked() && await choice.isEnabled()) await choice.uncheck();
        const chargeLaserForRealAttack = shipId === 'vulcan' && variant === 'wolf' && round === 0;
        const printed = shipId === 'gorgoneion' ? variant === 'wolf' ? ['Force Field Projector', 'Missile Array'] : ['Repair Drones', 'Jump Drive']
          : shipId === 'capybara-small' ? round === 0 ? ['Water Reclimator', 'Hydroponics'] : ['Fuel Processor', 'Jump Drive']
            : shipId === 'warrior' ? [variant === 'wolf' ? 'Salvage Drones' : round === 0 ? 'Repair Drones' : 'Reclamator']
              : chargeLaserForRealAttack ? ['Laser Cannon', 'Additional Labour 1'] : ['Additional Labour 1', 'Additional Labour 2'];
        for (const label of printed) { const choice = panel.getByRole('checkbox', { name: label, exact: true });
          if (await choice.count() && await choice.isEnabled()) await choice.check(); }
        if (chargeLaserForRealAttack) evidence.trainingChoices.push({ roleId, cycle: cycle,
          choice: 'Normal GM selects the printed Laser Cannon charge for the unforced current Wolf Medium/Short choice; the second reactor slot remains Additional Labour 1.' });
        if (shipId === 'warrior' && variant === 'wolf' && !await panel.getByRole('checkbox', { name: 'Salvage Drones', exact: true }).count()) {
          const current = await publicState(live.context.gm), small = current.smallShips?.warrior;
          if (small?.cycle?.step === 4) {
            const actual = await live.sdk(live.context.gm, 'runSmallShipMaintenance', await live.gmPayload({
              smallShipId: 'warrior', action: 'reactor', expectedRevision: small.cycle.revision, consoles: ['salvage-drones'],
            }), { id, replay: true, trainingChoice: 'Normal GM printed Salvage Drones choice at actual reactor step4; source capacity and dice intact.' });
            evidence.uiGaps.push({ roleId, procedure: 'Salvage Drones charge',
              gap: 'GM checkbox is not mounted; ordinary SDK maintenance supplement is separately disclosed.', requestId: actual.receipt.requestId });
            continue;
          }
        }
        if (round === 2 && ['gorgoneion', 'capybara-small'].includes(shipId) && variant !== 'wolf') {
          const expected = await selectRole(roleId), captain = live.context.crew.page.getByRole('button', { name: 'Charge Jump Drive', exact: true }).first();
          if (await live.offered(`${roleId}:charge-jump`, captain, live.context.crew.page.locator('main'))) {
            const charged = await live.ui(live.context.crew, 'runSmallShipMaintenance', captain, { id: `${roleId}:charge-jump`, expected, replay: true });
            recordExtraRoleResult(matrix, id, { status: 'committed', receipt: charged.receipt }); continue;
          }
        }
      }
      if (action === 'end' && shipId === 'capybara-small') for (const consoleId of ['water-reclimator', 'hydroponics', 'fuel-processor']) {
        const label = { 'water-reclimator': 'Water Reclimator', hydroponics: 'Hydroponics', 'fuel-processor': 'Fuel Processor' }[consoleId];
        const ore = panel.getByLabel('Fuel Processor ore amount', { exact: true });
        if (consoleId === 'fuel-processor' && await ore.count()) await ore.selectOption('1');
        await button(`${roleId}:${consoleId}`, null, panel, new RegExp(`^Run ${label} //`));
      }
      const trainingChoice = action === 'reactor' && shipId === 'vulcan' && variant === 'wolf' && round === 0
        ? 'Normal GM selects the printed Laser Cannon charge and one Additional Labour charge; server charging eligibility and current reactor capacity remain authoritative.'
        : undefined;
      const committed = await button(id, null, panel, names[action], undefined,
        trainingChoice ? { trainingChoice } : {});
      if (!committed) break;
      if (action === 'end') await untilPublic(live.context.gm, `Actual ${name} cycle completion`, state => {
        const cycleState = state.smallShips?.[shipId]?.cycle;
        return state.live && cycleState?.turn === state.cycle && cycleState.step === 0 &&
          typeof cycleState.completedAt === 'string' && Number.isFinite(Date.parse(cycleState.completedAt));
      });
    }
  }
  async function replacementProcedure(row) {
    if (!live.replacements.has(row.roleId)) return live.block(row.id, 'Normal replacement assignment has not committed.', 'GM: source eligibility and assignment');
    const route = extraRoleActionRoute(row.roleId);
    const expected = await selectRole(row.roleId, route), page = live.context.crew.page, suffix = row.id.split(':')[1];
    if (row.roleId === 'comms-officer') {
      const actual = await publicState(live.context.crew);
      const coordinate = Object.values(actual.knownSystems ?? {}).find(value => /^\d{4}$/.test(String(value)));
      if (!coordinate) return live.block(row.id, 'No entitled real printed coordinate is projected.', 'Comms Officer: actual printed chart coordinate');
      return button(row.id, expected, page.getByRole('region', { name: 'Comms Officer scouting request', exact: true }), 'Record request',
        panel => panel.getByLabel('Printed system coordinate', { exact: true }).fill(String(coordinate)));
    }
    if (row.roleId === 'vip-host') return button(row.id, expected, page.getByRole('region', { name: 'Dione VIP cards', exact: true }),
      { draw: 'Draw private VIP card', transfer: 'Transfer card', 'discard-reroll': 'Discard card and reroll one die' }[suffix], async panel => {
        if (suffix === 'transfer') { await chooseVisibleOption(panel.getByLabel('VIP card to transfer', { exact: true }));
          const recipient = live.context.roster.find(actor => actor.roleId === 'dione-captain');
          await chooseVisibleOption(panel.getByLabel('VIP card recipient', { exact: true }), option => option.text === recipient.displayName);
        } else if (suffix === 'discard-reroll') { await chooseVisibleOption(panel.getByLabel('VIP card to discard', { exact: true }));
          await chooseVisibleOption(panel.getByLabel('Unrest die to reroll', { exact: true })); }
      });
    if (row.roleId === 'commissar') {
      if (suffix === 'captain-consent') { const captain = await live.select('icebreaker-captain', 'icebreaker-captain', '/ships/icebreaker/roles/icebreaker-captain');
        return button(row.id, captain, page.getByRole('region', { name: 'Commissar purge', exact: true }), 'Consent to Commissar purge'); }
      return button(row.id, expected, page.getByRole('region', { name: 'Commissar purge', exact: true }), 'Purge survivors and reduce unrest',
        panel => panel.getByLabel('Target ship', { exact: true }).selectOption('icebreaker'));
    }
    if (row.roleId === 'doctor') return button(row.id, expected, page.getByRole('region', { name: 'Doctor Medical Aid', exact: true }), 'Record Medical Aid',
      async panel => { const targets = panel.getByRole('checkbox'); if (await targets.count()) await targets.first().check(); });
    if (row.roleId === 'rosal-militia-leader') return boarding(row, expected);
    if (row.roleId === 'wolf-commander') return commander(row, expected);
    if (row.roleId === 'pdf-fighter-ace') return fighterAce(row, expected);
    if (suffix === 'repair') {
      const shipId = row.roleId.replace('-captain', ''), host = (await publicState(live.context.gm)).smallShips?.[shipId]?.hostShipId;
      if (!host || !await live.damage(host)) return live.block(row.id, 'No actual docked surviving host with repairable damage.', 'GM: source-supported fresh repair case');
      await untilPublic(live.context.crew, 'Actual repairable host projection', state => state.damage?.[host]?.damagedSystemIds?.length > 0);
      return button(row.id, expected, page.getByRole('region', { name: shipId === 'gorgoneion' ? 'Gorgoneion Repair Drones' : 'Warrior Repair Drones', exact: true }),
        shipId === 'gorgoneion' ? 'Repair one console' : 'Repair selected consoles', async panel => {
          if (shipId === 'gorgoneion') await chooseVisibleOption(panel.getByLabel('Gorgoneion repair console', { exact: true }));
          else { const targets = panel.getByRole('checkbox'); if (await targets.count()) await targets.first().check(); }
        });
    }
    if (suffix.startsWith('labour-')) {
      const charges = (await publicState(live.context.crew)).smallShips?.vulcan?.cycle?.charges
        ?.filter(id => ['additional-labour-1', 'additional-labour-2'].includes(id)) ?? [];
      if (charges[0] !== `additional-${suffix}`) return live.block(row.id,
        'The next source-selected independent labour charge does not match this procedure; no other charge is substituted.',
        'Vulcan Captain: use the actual earlier charge first, or GM: a fresh source-supported Team cycle');
      return button(row.id, expected, page.getByRole('region', { name: 'Additional Labour', exact: true }), /^Use Additional Labour \/\//,
        async panel => {
        const state = await publicState(live.context.crew);
        const ships = panel.getByLabel('Additional Labour target ship', { exact: true });
        const offeredShips = await ships.locator('option').evaluateAll(options => options.filter(option => !option.disabled && option.value).map(option => option.value));
        for (const shipId of offeredShips) {
          await ships.selectOption(shipId);
          const target = await chooseVisibleOption(panel.getByLabel('Additional Labour target console', { exact: true }), option =>
            !state.maintenance?.[shipId]?.charges?.includes(option.value) &&
            (option.value === 'jump-drive' || !state.damage?.[shipId]?.damagedSystemIds?.includes(option.value)) &&
            !['fuel-refinery', 'fuel-refinery-ii'].includes(option.value));
          if (target) break;
        }
        });
    }
    if (suffix === 'cargo-load' || suffix === 'cargo-unload') return button(row.id, expected, page.getByRole('region', { name: 'Cargo Transfer', exact: true }), 'Transfer cargo',
      async panel => { await panel.getByLabel('Direction', { exact: true }).selectOption(suffix === 'cargo-load' ? 'load' : 'unload');
        await chooseVisibleOption(panel.getByLabel('Resource', { exact: true })); await panel.getByLabel('Positive whole amount', { exact: true }).fill('1'); });
    if (suffix.startsWith('jump-')) return button(row.id, expected, page.getByRole('region', { name: /Jump Drive workspace/ }).first(), 'Execute jump',
      panel => chooseVisibleOption(panel.getByLabel('Known destination', { exact: true }), option => option.text.includes(`// ${suffix.slice(5)} //`)));
    if (suffix === 'charge-jump') return button(row.id, expected, page.getByRole('region', { name: /Jump Drive workspace/ }).first(), 'Charge Jump Drive');
    if (suffix === 'mission-support') return button(row.id, expected, page.locator('.gorgoneion-mission-support').first(), 'Apply deck support',
      async panel => { for (const option of await panel.getByRole('radio', { name: 'Move to bottom', exact: true }).all()) await option.check(); });
    if (suffix === 'force-field') return button(row.id, expected, page.getByRole('region', { name: 'Gorgoneion Force Field Projector', exact: true }), 'Protect selected ship',
      async panel => { const targets = panel.getByRole('radio'); if (await targets.count()) await targets.first().check(); });
    if (suffix.startsWith('missile-')) {
      const range = suffix.slice('missile-'.length), label = range[0].toUpperCase() + range.slice(1);
      return button(row.id, expected, page.getByRole('region', { name: `Gorgoneion Missile Array ${label} Range choice`, exact: true }), 'Use Gorgoneion Missile Array');
    }
    if (suffix === 'salvage') return button(row.id, expected, page.getByRole('region', { name: 'Warrior Salvage Drones', exact: true }), 'Resolve Salvage Drones');
    if (suffix === 'reclamator' || suffix === 'bulk-haulage') return missionProcedure(row, expected);
    throw Error(`Uncomposed replacement procedure ${row.id}.`);
  }
  async function commander(row, expected) {
    const page = live.context.crew.page, suffix = row.id.split(':')[1];
    if (suffix === 'cycle-dial') return button(row.id, expected, page.getByRole('region', { name: 'Wolf fleet dial', exact: true }), 'Commit this cycle attack dial',
      panel => chooseVisibleOption(panel.getByLabel('Target fleet group', { exact: true })));
    if (suffix === 'address' || suffix === 'amnesty') return button(row.id, expected, page.getByRole('region', { name: 'Commander address and amnesty', exact: true }),
      suffix === 'address' ? 'Address fleet // no expiry in demo' : 'Offer amnesty', async panel => {
        if (suffix === 'address') await panel.getByLabel('Fleet address', { exact: true }).fill('Isolated simulated-crew training address.');
        else await panel.getByLabel('Target ship', { exact: true }).selectOption('dione');
      });
    if (suffix === 'captain-amnesty-response') { const captain = await live.select('dione-captain', 'dione-captain');
      return button(row.id, captain, page.getByRole('region', { name: 'Wolf amnesty offer', exact: true }), 'Decline offer'); }
    if (suffix === 'gm-amnesty-ruling') return button(row.id, null, live.context.gm.page.getByRole('region', { name: 'Facilitator amnesty ruling', exact: true }),
      'Record facilitator consequence', panel => panel.getByLabel('Facilitator consequence', { exact: true })
        .fill('Training ruling: actual Captain declined; no surrender or physical bargain recorded.'));
    if (suffix === 'range-dial') return button(row.id, expected, page.getByRole('region', { name: 'Range target dial', exact: true }), 'Move target one step up the ring',
      panel => chooseVisibleOption(panel.getByLabel('Wolf ship', { exact: true })));
    if (suffix === 'target-reroll' || suffix === 'finish-rerolls') return button(row.id, expected,
      page.getByRole('region', { name: 'Targeting dice', exact: true }), suffix === 'target-reroll' ? 'Reroll selected dice' : 'Finish rerolls', async panel => {
        if (suffix === 'target-reroll') { for (const option of await panel.getByRole('checkbox').all())
          if (await option.isEnabled()) { await option.check(); break; } }
        else for (const option of await panel.getByRole('checkbox').all()) if (await option.isChecked()) await option.uncheck();
      });
    throw Error(`Uncomposed Commander procedure ${row.id}.`);
  }
  async function fighterAce(row, expected) {
    const page = live.context.crew.page, suffix = row.id.split(':')[1];
    if (suffix === 'permission') { const colonel = await live.select('refinery-124-pdf-colonel', 'refinery-124-pdf-colonel', '/ships/refinery-124/roles/refinery-124-pdf-colonel');
      return button(row.id, colonel, page.getByRole('region', { name: 'Fighter Ace source permission', exact: true }), 'Authorize Fighter Ace',
        panel => chooseVisibleOption(panel.getByLabel('Fighter slot', { exact: true }), option => /^\d+$/.test(option.value))); }
    if (suffix !== aceRange) return live.block(row.id, 'One Fighter Ace action per attack; this fresh case chooses a different printed range.', `Root: separate fresh ${suffix} range case`);
    return button(row.id, expected, page.getByRole('region', { name: 'PDF Fighter Ace personal combat', exact: true }).last(), 'Commit Fighter Ace action', async panel => {
      await chooseVisibleOption(panel.getByLabel('Fighter source', { exact: true })); await chooseVisibleOption(panel.getByLabel('Wolf contact', { exact: true }));
      if (suffix === 'medium') await panel.getByLabel('Optional targeting shift', { exact: true }).selectOption('1');
      if (suffix === 'short') await chooseVisibleOption(panel.getByLabel('Optional second target', { exact: true }));
    });
  }
  async function boarding(row, expected) {
    const crew = live.context.crew;
    if (row.roleId === 'rosal-militia-leader') {
      await live.inspectCrew(expected);
      const read = await crew.callable('getWolfBoardingSpecialChoice', { sessionId: live.context.initial.sessionId });
      await live.inspectCrew(expected);
      if (read.status !== 'committed' || read.result?.choice?.kind !== 'militia') return live.block(row.id,
        'Protected current view offers no Rosal decision; its replacement route also lacks a mounted Militia panel.', 'Rosal: genuine eligible Shepherd boarding');
      const view = read.result, choice = view.choice;
      return live.sdk(crew, row.endpoint, await live.crewPayload({ expectedTurn: view.turn, expectedRevision: view.revision,
        choice: { kind: 'militia', targetShipId: choice.targetShipId, militiaDoubleTeams: choice.doubleDiceAvailable === true,
          militiaFrontLineDice: Math.min(1, choice.maxFrontLineDice) } }), { id: row.id, expected, replay: true });
    }
    return button(row.id, expected, crew.page.getByRole('region', { name: /boarding defence/ }).first(), 'Commit defence',
      panel => chooseVisibleOption(panel.getByLabel('Security Teams committed', { exact: true }), option => Number(option.value) >= 1));
  }
  let mission = null;
  async function missionProcedure(row, expected) {
    if (!mission) return live.block(row.id, 'No genuine newly arrived mission with actual participants and privately dealt cards exists.',
      'Admiral / current Captain: ordinary source jump, then GM starts the real team');
    if (row.id.endsWith(':reclamator')) return button(row.id, expected,
      live.context.crew.page.getByRole('region', { name: 'Warrior Reclamator salvage', exact: true }), 'Salvage entire hand with Warrior Reclamator', async panel => {
        await chooseVisibleOption(panel.getByLabel('Reclamator salvage opportunity', { exact: true }));
        for (const choice of await panel.locator('select').all()) if (await choice.locator('option[value="food"]').count()) await choice.selectOption('food');
      });
    return live.block(row.id, 'Bulk Haulage is credited only from an actual winning resource resolution with bulkHaulageApplied true.',
      'Actual base-craft contributor and Mission Leader: finish normal mission assignments/resolution');
  }
  async function warriorCargoTransfer(row) {
    const expected = await selectRole('warrior-captain'), crew = live.context.crew;
    const panel = crew.page.getByRole('region', { name: 'Cargo Transfer', exact: true });
    await panel.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined);
    if (!await panel.count()) return live.block(row.id, 'The current Warrior station does not mount Cargo Transfer.', 'Warrior Captain: open the offered Warrior station');
    const before = await publicState(crew), gmBefore = await publicState(live.context.gm);
    const craft = before.smallShips?.warrior, hostShipId = craft?.hostShipId;
    if (!before.live || before.cycle < 1 || before.airspace !== 'lifted' || before.phase !== 'active')
      return live.block(row.id, 'The current actor projection is not live during Coordination.', 'GM: open actual Coordination; Warrior Captain: reconnect');
    if (!hostShipId || !before.groups?.includes(hostShipId) || before.warriorCargo?.inventory === undefined)
      return live.block(row.id, 'The current entitled Warrior/host/cargo projection is incomplete.', 'GM: admit and dock Warrior; Warrior Captain: remain aboard its current host');
    if (gmBefore.smallShips?.warrior?.hostShipId !== hostShipId ||
        gmBefore.warriorCargo?.revision !== before.warriorCargo.revision)
      return live.block(row.id, 'The entitled Warrior projection does not yet match current GM host/cargo state.', 'Warrior Captain: reconnect after the current station/cargo projection settles');
    if (craft.mutiny?.status === 'active' || !before.resources?.[hostShipId] || gmBefore.damage?.[hostShipId]?.destroyed !== false)
      return live.block(row.id, 'Warrior mutiny, unavailable host inventory, or destroyed host blocks Cargo Transfer.', 'GM: restore current source prerequisites');
    const resource = panel.getByLabel('Resource', { exact: true });
    const options = await resource.locator('option').evaluateAll(elements => elements.map(element => ({ value: element.value, disabled: element.disabled })));
    const selected = options.find(option => !option.disabled && Number.isSafeInteger(before.resources[hostShipId]?.[option.value]) &&
      before.resources[hostShipId][option.value] > 0 && Number.isSafeInteger(before.warriorCargo.inventory[option.value]) &&
      before.warriorCargo.inventory[option.value] < Number.MAX_SAFE_INTEGER);
    if (!selected) return live.block(row.id, 'No current host resource can fund one legal positive whole Warrior load.', 'GM: preserve a current positive source inventory');
    if (gmBefore.warriorCargo?.inventory?.[selected.value] !== before.warriorCargo.inventory[selected.value] ||
        gmBefore.resources?.[hostShipId]?.[selected.value] !== before.resources[hostShipId][selected.value])
      return live.block(row.id, 'The selected resource projection does not match current GM host/cargo ledgers.', 'Warrior Captain: reconnect after the current selected-resource projection settles');
    await resource.selectOption(selected.value);
    await panel.getByLabel('Direction', { exact: true }).selectOption('load');
    await panel.getByLabel('Positive whole amount', { exact: true }).fill('1');
    const action = panel.getByRole('button', { name: 'Transfer cargo', exact: true });
    if (!await live.offered(row.id, action, panel)) return false;
    const actual = await live.ui(crew, row.endpoint, action, { expected, replay: true });
    assert.equal(actual.data?.direction, 'load');
    assert.equal(actual.data?.resourceId, selected.value);
    assert.equal(actual.data?.amount, 1);
    assert.equal(actual.data?.expectedHostShipId, hostShipId);
    assert.equal(actual.result?.status, 'committed');
    assert.equal(actual.result?.hostShipId, hostShipId);
    assert.equal(actual.result?.cargoRevision, (before.warriorCargo.revision ?? 0) + 1);
    const expectedHostAmount = before.resources[hostShipId][selected.value] - 1;
    const expectedCargoAmount = before.warriorCargo.inventory[selected.value] + 1;
    const crewAfter = await untilPublic(crew, 'Warrior private cargo and host projection commit', state => state.live &&
      state.warriorCargo?.revision === actual.result.cargoRevision &&
      state.warriorCargo.inventory?.[selected.value] === expectedCargoAmount &&
      state.resources?.[hostShipId]?.[selected.value] === expectedHostAmount);
    const gmAfter = await untilPublic(live.context.gm, 'GM host/cargo ledger commit', state => state.live &&
      state.warriorCargo?.revision === actual.result.cargoRevision &&
      state.warriorCargo.inventory?.[selected.value] === expectedCargoAmount &&
      state.resources?.[hostShipId]?.[selected.value] === expectedHostAmount);
    await live.inspectCrew(expected); await live.inspectGm();
    assert.equal(crewAfter.cycle, before.cycle);
    assert.equal(gmAfter.smallShips?.warrior?.hostShipId, hostShipId);
    actual.receipt.warriorCargo = { hostShipId, resourceId: selected.value, direction: 'load', amount: 1,
      hostBefore: before.resources[hostShipId][selected.value], hostAfter: expectedHostAmount,
      cargoBefore: before.warriorCargo.inventory[selected.value], cargoAfter: expectedCargoAmount,
      cargoRevision: actual.result.cargoRevision };
    recordExtraRoleResult(matrix, row.id, { status: 'committed', receipt: actual.receipt });
    await live.save();
    return true;
  }
  async function smallCraftJump(row, step) {
    const expected = await selectRole(step.roleId), crew = live.context.crew;
    const panel = crew.page.getByRole('region', { name: 'Small-craft Jump Drive workspace', exact: true });
    await panel.waitFor({ state: 'visible', timeout: 12_000 }).catch(() => undefined);
    if (!await panel.count()) return live.block(row.id, 'The current small-craft station does not mount its Jump Drive workspace.', `${step.roleId}: open the offered craft station`);
    assert.match(await panel.innerText(), /This Jump Drive does not need a reactor charge/i,
      'The mounted source projection must confirm this craft uses the no-charge jump rule.');
    const before = await publicState(crew), gmBefore = await publicState(live.context.gm);
    const small = before.smallShips?.[step.craftId], gmSmall = gmBefore.smallShips?.[step.craftId], hostShipId = small?.hostShipId;
    if (!before.live || !hostShipId || !before.groups?.includes(hostShipId) || before.phase !== 'active' || before.airspace !== 'lifted')
      return live.block(row.id, 'A live Captain aboard the docked active host during Coordination is required.', 'GM: preserve a docked host; current craft Captain: reconnect during Coordination');
    if (gmSmall?.hostShipId !== hostShipId || gmSmall?.cycle?.revision !== small.cycle?.revision ||
        gmBefore.resources?.[hostShipId]?.fuel !== before.resources?.[hostShipId]?.fuel)
      return live.block(row.id, 'Current entitled Captain and GM host/movement projections do not match.', 'GM and current craft Captain: refresh the current admitted-host projection');
    if (small.cycle?.turn !== before.cycle || small.cycle?.step !== 0 ||
        typeof small.cycle?.completedAt !== 'string' || !Number.isFinite(Date.parse(small.cycle.completedAt)))
      return live.block(row.id, 'Current-cycle small-craft Team maintenance is not complete.', 'GM: complete the real craft maintenance cycle before Coordination');
    if (gmBefore.damage?.[hostShipId]?.destroyed !== false || !Number.isSafeInteger(gmBefore.resources?.[hostShipId]?.fuel))
      return live.block(row.id, 'The current docked host fuel/damage authority is unavailable.', 'GM: preserve an active undestroyed host and fuel ledger');
    const route = panel.getByLabel('Known destination', { exact: true });
    let option;
    const projectionDeadline = Date.now() + 12_000;
    do {
      option = await chooseVisibleOption(route, candidate => candidate.text.includes(`// ${step.range} //`));
      if (!option) await delay(250);
    } while (!option && Date.now() < projectionDeadline);
    if (!option) return live.block(row.id, `The current Captain has no known ${step.range} destination in the live Jump Drive projection.`, `${step.roleId}: acquire a genuinely known ${step.range} route or choose a separate fresh case`);
    const fuelMatch = option.text.match(/\/\/\s*(?:short|medium|long)\s*\/\/\s*(\d+)\s+host fuel/i);
    assert.ok(fuelMatch, 'The chosen route must show its actual host fuel cost.');
    const fuelCost = Number(fuelMatch[1]), fuelBefore = gmBefore.resources[hostShipId].fuel;
    if (!Number.isSafeInteger(fuelCost) || fuelBefore < fuelCost)
      return live.block(row.id, 'The actual host ledger cannot fund the selected known route.', 'GM: preserve printed host fuel through ordinary play');
    const action = panel.getByRole('button', { name: 'Execute jump', exact: true });
    if (!await live.offered(row.id, action, panel)) return false;
    const actual = await live.ui(crew, row.endpoint, action, { expected, replay: true });
    assert.equal(actual.data?.smallShipId, step.craftId);
    assert.equal(actual.data?.hostShipId, hostShipId);
    assert.ok(actual.data?.destination === option.value, 'The UI-issued jump must use the Captain-selected known route.');
    assert.equal(actual.result?.status, 'committed');
    assert.equal(actual.result?.smallShipId, step.craftId);
    assert.equal(actual.result?.length, step.range);
    assert.equal(actual.result?.fuelCost, fuelCost);
    assert.equal(actual.result?.remainingHostFuel, fuelBefore - fuelCost);
    assert.equal(actual.result?.detached, true);
    const gmAfter = await untilPublic(live.context.gm, 'GM small-craft jump and exact host fuel debit', state => state.live &&
      state.smallShips?.[step.craftId]?.hostShipId === null &&
      state.resources?.[hostShipId]?.fuel === fuelBefore - fuelCost);
    await live.inspectCrew(expected);
    const crewAfter = await untilPublic(crew, 'Original Captain current-server movement projection', state => state.live &&
      state.cycle === before.cycle && state.resources?.[hostShipId]?.fuel === fuelBefore - fuelCost);
    await live.inspectCrew(expected); await live.inspectGm();
    assert.equal(gmAfter.cycle, before.cycle);
    actual.receipt.smallCraftJump = { smallShipId: step.craftId, hostShipId, range: step.range,
      fuelCost, hostFuelBefore: fuelBefore, hostFuelAfter: fuelBefore - fuelCost,
      detachedAfterCommit: gmAfter.smallShips[step.craftId].hostShipId === null,
      currentActorProjectionFresh: crewAfter.live };
    recordExtraRoleResult(matrix, row.id, { status: 'committed', receipt: actual.receipt });
    await live.save();
    return true;
  }
  async function vulcanLaserRange(row, step) {
    const expected = await selectRole(step.roleId), crew = live.context.crew;
    const rangeLabel = step.range === 'medium-range' ? 'Medium' : 'Short';
    const panel = crew.page.getByRole('region', { name: `Vulcan Laser Cannon ${rangeLabel} Range choice`, exact: true });
    await panel.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);
    if (!await panel.count()) return live.block(row.id, `The current ${rangeLabel} Wolf range has no mounted Vulcan Laser Cannon choice.`, 'GM: resolve an actual Wolf attack to this range; Vulcan Captain: open its admitted host station');
    const [actorBefore, shipBefore, attackBefore] = await Promise.all([
      publicState(crew), publicState(live.context.gm), wolfMetadata(),
    ]);
    const actorVulcan = actorBefore.smallShips?.vulcan;
    const gmVulcan = shipBefore.smallShips?.vulcan;
    if (!actorBefore.live || !actorVulcan?.hostShipId || actorVulcan.hostShipId !== gmVulcan?.hostShipId ||
        !actorBefore.groups?.includes(actorVulcan.hostShipId) ||
        actorVulcan.cycle?.turn !== gmVulcan?.cycle?.turn ||
        actorVulcan.cycle?.charges?.includes('laser-cannon') !== gmVulcan?.cycle?.charges?.includes('laser-cannon') ||
        attackBefore?.currentStep !== step.range || attackBefore.turn !== actorBefore.cycle)
      return live.block(row.id, 'A current original Vulcan Captain aboard its admitted host during the matching actual Wolf range is required.', 'GM: preserve the actual range; Vulcan Captain: reconnect aboard its current host');
    const charged = actorBefore.smallShips?.vulcan?.cycle?.turn === actorBefore.cycle &&
      actorBefore.smallShips?.vulcan?.cycle?.charges?.includes('laser-cannon');
    const use = panel.getByRole('button', { name: 'Use Vulcan Laser Cannon', exact: true });
    const pass = panel.getByRole('button', { name: 'Pass this range', exact: true });
    let action, choice;
    if (charged) {
      if (!await use.count() || !await use.isEnabled())
        return live.block(row.id, 'Laser Cannon is charged, but the mounted current source view does not offer Use.', 'GM: preserve matching admitted Vulcan host/range authority');
      action = use; choice = 'used';
    } else {
      const unavailable = panel.getByRole('status').filter({ hasText: /no usable fuel, charge, or Scrap/i });
      if (!await unavailable.count() || !await pass.count() || !await pass.isEnabled())
        return live.block(row.id, 'The server did not expose a safe pass for an uncharged current Vulcan source.', 'Vulcan Captain: complete a genuine Laser Cannon charge before its next eligible range');
      action = pass; choice = 'passed';
    }
    const trainingChoice = choice === 'used'
      ? 'Vulcan Captain chose Use at the actual printed range; server dice and target resolution remain unforced.'
      : 'Vulcan Captain chose Pass because the current server source view reported no usable Laser Cannon charge.';
    const actual = await live.ui(crew, row.endpoint, action,
      { expected, replay: true, trainingChoice });
    assert.equal(actual.data?.sourceId, 'vulcan-laser-cannon');
    assert.equal(actual.data?.range, step.range);
    assert.equal(actual.data?.use, choice === 'used');
    const progressed = await (async () => {
      const deadline = Date.now() + 45_000;
      let current, notice = false;
      do {
        current = await wolfMetadata();
        notice = await panel.getByText(/Vulcan Laser Cannon (?:use committed|pass committed)/i).count() > 0 ||
          await panel.getByText('Choice committed', { exact: true }).count() > 0;
        const panelStillVisible = await panel.count() > 0 && await panel.isVisible().catch(() => false);
        const crewSourceProjectionReceived = notice || (!panelStillVisible && current?.currentStep !== step.range);
        if (current?.revision > attackBefore.revision && crewSourceProjectionReceived) return current;
        await delay(250);
      } while (Date.now() < deadline);
      throw Error(`Vulcan ${rangeLabel} choice did not reach a current GM/player projection; revision ${current?.revision ?? 'unavailable'}.`);
    })();
    assert.ok(progressed.revision > attackBefore.revision, 'The authoritative Wolf revision must advance for the committed choice.');
    await live.inspectCrew(expected); await live.inspectGm();
    actual.receipt.vulcanRangeChoice = { range: step.range, choice, turn: attackBefore.turn,
      revisionBefore: attackBefore.revision, revisionAfter: progressed.revision,
      laserChargeObserved: charged, currentHostShipId: actorBefore.smallShips.vulcan.hostShipId,
      normalTrainingChoice: trainingChoice };
    recordExtraRoleResult(matrix, row.id, { status: 'committed', receipt: actual.receipt });
    await live.save();
    return true;
  }
  async function execute(row) {
    const step = extraRoleProcedureStep(scenario, row, { jumpLength });
    if (step.kind === 'blocked') return live.block(row.id, row.unavailableReason ?? row.prerequisite, row.nextActor);
    if (step.kind === 'replacement-transition') return assign(step.roleId, step.action);
    if (step.kind === 'joint-maintenance') return jointMaintenance(step.roleId, step.shipId, step.craftId, step.action);
    if (step.kind === 'craft') return craftProcedure(row);
    if (step.kind === 'small-maintenance') return smallMaintenance(step.shipId, 0, step.action);
    if (step.kind === 'warrior-cargo-transfer') return warriorCargoTransfer(row);
    if (step.kind === 'small-craft-jump') return smallCraftJump(row, step);
    if (step.kind === 'vulcan-laser-range') return vulcanLaserRange(row, step);
    if (row.id.endsWith(':docking') || row.id.endsWith(':undock')) return docking(row.roleId.replace('-captain', ''), row.id.endsWith(':docking'));
    const production = { 'water-reclimator': 'Water Reclimator', hydroponics: 'Hydroponics', 'fuel-processor': 'Fuel Processor' }[row.id.split(':')[1]];
    if (production) return button(row.id, null, (await smallPanel('capybara-small')).panel, new RegExp(`^Run ${production} //`));
    return replacementProcedure(row);
  }
  const procedures = matrix.map(row => ({ id: row.id, endpoint: row.endpoint,
    executable: !row.physicalFactRequired && !row.unavailableReason,
    ...(row.physicalFactRequired || row.unavailableReason ? { blocker: row.unavailableReason ?? row.prerequisite, nextActor: row.nextActor } : {}),
    execute: async context => { await init(context); return execute(row); } }));
  const perform = async id => {
    const procedure = procedures.find(procedure => procedure.id === id); assert.ok(procedure, `No silent omission of ${id}.`);
    try { return await procedure.execute(live.context); }
    catch (error) { recordExtraRoleResult(matrix, id, { status: 'failed', blocker: String(error.message).slice(0, 500),
      nextActor: matrix.find(row => row.id === id).nextActor }); await save(); throw error; }
  };
  async function advanceActualCycle() {
    const gm = live.context.gm, observed = await gm.observe(), state = await publicState(gm);
    assert.equal(state.airspace, 'lifted');
    const confirm = gm.page.getByRole('button', { name: `ARE YOU SURE? // Advance to Cycle ${state.cycle + 1}`, exact: true });
    let captured;
    const capture = request => { if (new URL(request.url()).pathname.endsWith('/us-central1/advanceTurn') && request.method() === 'POST') captured = request.postDataJSON()?.data; };
    gm.page.on('request', capture);
    try {
      const result = await completeOfferedTurnAdvance({ expected: { sessionId: live.context.initial.sessionId,
        uidHash: observed.uidHash, instanceId: observed.instanceId, cycle: state.cycle },
      inspect: async () => ({ ...(await gm.observe()), confirmationOffered: await confirm.isVisible() }),
      clickAdvance: () => gm.page.getByRole('button', { name: `Advance to Cycle ${state.cycle + 1}`, exact: true }).click(),
      clickConfirmation: () => confirm.click() });
      assert.equal(captured?.expectedTurn, state.cycle);
      const replay = await gm.callable('advanceTurn', captured); assert.equal(replay.status, 'committed');
      evidence.receipts.push({ endpoint: 'advanceTurn', requestId: captured.requestId, transport: 'ordinary-ui', httpStatus: 200,
        identityVerified: true, exactOrdinarySdkReplayAccepted: true, confirmationActuallyOffered: result.confirmationClicked, fromCycle: state.cycle });
    } finally { gm.page.off('request', capture); }
    await save();
  }
  async function coreMaintenance(shipId, { beforeRiot, beforeBays, fuelPdf = false } = {}) {
    const actions = ['begin', 'storage', 'rations', 'unrest', 'riot', 'reactor', 'bays',
      ...(shipId === 'aegis' ? ['bays'] : []), 'end'];
    for (const action of actions) {
      await live.inspectGm();
      let choices = {};
      if (action === 'rations') choices = await live.context.gm.page.evaluate(async ship => {
        const { useSessionStore } = await import('/src/store/useSessionStore.ts');
        const { shipRationSchedule } = await import('/src/data/shipPopulation.ts');
        const { session } = useSessionStore.getState();
        const schedule = shipRationSchedule(ship, session.shipSurvivors[ship]);
        return Object.fromEntries(['food', 'water'].map(resource => [resource + 'Level',
          schedule[resource].reduce((level, cost, index) => cost <= session.shipResources[ship][resource] ? index : level, 0)]));
      }, shipId);
      if (action === 'reactor') choices = { consoles: shipId === 'dione' ? ['vip-lounge'] : shipId === 'refinery-124' ? ['fighter-bay'] : ['jump-drive'] };
      if (action === 'bays' && fuelPdf) choices = await live.context.gm.page.evaluate(async ship => {
        const { useSessionStore } = await import('/src/store/useSessionStore.ts');
        const { SHIPS } = await import('/src/data/ships.ts');
        const { session } = useSessionStore.getState();
        const wing = session.shuttleDockings?.find(entry => entry.shipId === ship && entry.shuttleId === 'pdf-escort-fighter-wing');
        const bay = SHIPS.find(value => value.id === ship)?.systems?.find(system => system.timing === 6 &&
          !session.shipDamage?.[ship]?.damagedSystemIds.includes(system.id));
        return wing && bay ? { refuels: { [bay.id]: wing.shuttleId } } : {};
      }, shipId);
      if (action === 'riot') await beforeRiot?.();
      const latestCycle = (await publicState(live.context.gm)).maintenance?.[shipId];
      await live.sdk(live.context.gm, 'runMaintenance', await live.gmPayload({ shipId, action,
        expectedRevision: latestCycle?.revision ?? 0, ...choices }), { replay: true,
        trainingChoice: 'Explicit normal GM maintenance supplement for a retired Engineer; actual printed costs, revision and dice retained.' });
      await untilPublic(live.context.gm, 'Actual core maintenance revision arrives', state => state.live &&
        state.maintenance?.[shipId]?.revision > (latestCycle?.revision ?? 0));
      if (action === 'reactor') await beforeBays?.();
    }
  }
  async function wolfMetadata() {
    await live.inspectGm();
    return live.context.gm.page.evaluate(async sid => {
      const { db } = await import('/src/lib/firestore.ts');
      const { doc, getDocFromServer } = await import('/node_modules/.vite/deps/firebase_firestore.js');
      const snapshot = await getDocFromServer(doc(db(), 'sessions', sid, 'wolfAttackAudience', 'current'));
      if (!snapshot.exists()) return null;
      const value = snapshot.data(); return { status: value.status, currentStep: value.currentStep, revision: value.revision, turn: value.turn };
    }, live.context.initial.sessionId); // real authenticated read, bounded public metadata only
  }
  async function normalBoardingCaptains() {
    for (const anchor of ['admiral', 'dione-captain', 'icebreaker-captain', 'shepherd-captain', 'quellon-captain', 'refinery-124-captain', 'refinery-124-pdf-colonel']) {
      if (!live.context.roster.some(actor => actor.roleId === anchor)) continue;
      if (live.replacements.has(plan.actors.find(actor => actor.anchorRoleId === anchor)?.roleId)) continue;
      const ship = anchor === 'admiral' ? 'aegis' : anchor === 'refinery-124-pdf-colonel' ? 'refinery-124' : anchor.replace('-captain', '');
      const expected = await live.select(anchor, anchor, `/ships/${ship}/roles/${anchor}`);
      const scope = live.context.crew.page.getByRole('region', { name: /boarding defence/ }).first();
      if (!await scope.count()) continue;
      await chooseVisibleOption(scope.getByLabel('Security Teams committed', { exact: true }), option => Number(option.value) >= 1);
      const action = scope.getByRole('button', { name: 'Commit defence', exact: true });
      if (await action.count() && await action.isEnabled()) await live.ui(live.context.crew, 'commitWolfBoardingDefenceChoice', action, { expected, replay: true });
    }
  }
  async function actualWolf() {
    const gm = live.context.gm, panel = gm.page.getByRole('region', { name: 'Private Wolf attack preparation', exact: true });
    const due = gm.page.getByRole('region', { name: 'Wolf attack timing controls', exact: true })
      .getByRole('button', { name: /^(Mark timing due|Mark next attack window due)$/ }).first();
    if (!await due.count() || !await due.isEnabled()) return stage('Wolf pending: source timing due control unavailable');
    await live.ui(gm, 'setWolfAttackWindow', due, { replay: true, trainingChoice: 'Normal GM chooses actual attack timing due.' });
    const counts = { 'Fighter Wing': 1, 'Assault Transport': 1, Destroyer: 1, Cruiser: 0, 'Fleet Strikecarrier': 0, Battlestation: 0 };
    for (const [label, count] of Object.entries(counts)) await panel.getByLabel(`${label} count`, { exact: true }).fill(String(count));
    evidence.trainingChoices.push({ choice: 'Explicit normal private GM composition; targets, deck and random combat results unforced.', counts });
    await live.ui(gm, 'stageWolfAttackPreparation', panel.getByRole('button', { name: 'Save private attack draft', exact: true }), { replay: true });
    await live.ui(gm, 'declareWolfAttack', panel.getByRole('button', { name: 'Declare Wolf attack', exact: true }), { replay: true });
    const deadline = Date.now() + 120_000; let priorKey = '';
    do {
      const view = await wolfMetadata(); if (!view || view.status === 'resolved') break;
      const key = `${view.revision}:${view.currentStep}`;
      if (key === priorKey) { await delay(500); continue; }
      priorKey = key; await stage(`Actual source attack ${view.currentStep} revision ${view.revision}`);
      if (view.currentStep === 'targeting' && scenario === 'replacements') {
        await perform('gorgoneion-captain:force-field'); await perform('wolf-commander:target-reroll'); await perform('wolf-commander:finish-rerolls');
      }
      if (['long-range', 'medium-range', 'short-range'].includes(view.currentStep) && scenario === 'replacements') {
        const range = view.currentStep.replace('-range', '');
        const colonel = await live.select('refinery-124-pdf-colonel', 'refinery-124-pdf-colonel', '/ships/refinery-124/roles/refinery-124-pdf-colonel');
        const launch = live.context.crew.page.getByRole('button', { name: 'Launch PDF Escort Wing', exact: true });
        if (await launch.count() && await launch.isEnabled()) await live.ui(live.context.crew, 'launchPdfEscortWing', launch, { expected: colonel, replay: true });
        if (range === 'medium' || range === 'short') await perform(`vulcan-captain:laser-cannon-${range}`);
        await perform('wolf-commander:range-dial'); await perform(`gorgoneion-captain:missile-${range}`);
        if (range === aceRange) { await perform('pdf-fighter-ace:permission'); await perform(`pdf-fighter-ace:${range}`); }
      }
      if (view.currentStep === 'boarding') {
        if (scenario === 'replacements') await perform('rosal-militia-leader:boarding');
        else for (const [role, craft] of [['joint-engineering-quellon-refinery', 'wobbly'], ['joint-engineering-shepherd-icebreaker', 'ally']]) await perform(`${role}:${craft}-boarding`);
        await normalBoardingCaptains();
      }
      await delay(500);
    } while (Date.now() < deadline);
    const actual = await wolfMetadata();
    if (actual?.status !== 'resolved') throw Error(`Actual attack awaits current choices at ${actual?.currentStep ?? 'not projected'}. No resolution bypass used.`);
    if (scenario === 'replacements') { await perform('doctor:medical-aid'); await perform('warrior-captain:salvage'); }
  }
  async function actualMission() {
    const gm = live.context.gm, start = gm.page.getByRole('region', { name: 'New-location mission start', exact: true });
    const startButton = start.getByRole('button', { name: 'Start mission', exact: true });
    if (!await startButton.count()) { await stage('Mission pending: no actual source new-location opportunity'); return; }
    await chooseVisibleOption(start.getByLabel('Mission opportunity', { exact: true }));
    for (const role of ['capybara-small-captain', 'warrior-captain']) {
      const actor = live.context.roster.find(actor => actor.roleId === actorFor(role));
      const offered = start.getByRole('checkbox', { name: new RegExp(actor.displayName) });
      if (await offered.count() && await offered.isEnabled()) await offered.check();
    }
    const leader = live.context.roster.find(actor => actor.roleId === actorFor('capybara-small-captain'));
    await chooseVisibleOption(start.getByLabel('Mission Leader', { exact: true }), option => option.text.startsWith(leader.displayName));
    if (!await startButton.isEnabled()) { await stage('Mission pending: current source participant/leader/craft prerequisites not satisfied'); return; }
    const begun = await live.ui(gm, 'dealPrivateInitialCards', startButton, { replay: true }); mission = begun.result?.missionId;
    assert.ok(mission, 'Actual source mission start must name its resulting mission.');
    const workspace = gm.page.getByRole('region', { name: `Away mission // ${mission}`, exact: true });
    await live.ui(gm, 'commitAwayMissionLifecycleCommand', workspace.getByRole('button', { name: 'Open private discards', exact: true }), { replay: true });
    await perform('warrior-captain:reclamator');
    const captain = await selectRole('capybara-small-captain');
    const cards = live.context.crew.page.getByRole('region', { name: 'Your private mission cards', exact: true });
    const discard = cards.getByRole('button', { name: /^Discard .* secretly$/ }).first();
    if (await discard.count() && await discard.isEnabled()) await live.ui(live.context.crew, 'commitAwayMissionLifecycleCommand', discard, { expected: captain, replay: true });
    for (const role of ['warrior-captain', 'capybara-small-captain']) {
      const expected = await selectRole(role), privatePanel = live.context.crew.page.getByRole('region', { name: 'Your private mission cards', exact: true });
      for (const choice of await privatePanel.locator('select').all()) await chooseVisibleOption(choice);
      const assignCards = privatePanel.getByRole('button', { name: 'Submit mission assignments', exact: true });
      if (await assignCards.count() && await assignCards.isEnabled()) await live.ui(live.context.crew, 'commitAwayMissionLifecycleCommand', assignCards, { expected, replay: true });
    }
    for (const name of ['Add facilitator cards', 'Resolve away mission']) {
      const action = workspace.getByRole('button', { name, exact: true });
      if (!await action.count() || !await action.isEnabled()) { await stage(`Mission pending: source awaits ${name}; no card/status bypass`); return; }
      const actual = await live.ui(gm, 'commitAwayMissionLifecycleCommand', action, { replay: true });
      if (name === 'Resolve away mission' && actual.result?.missionId === mission &&
          actual.result.publicState?.missionId === mission && actual.result.publicState.status === 'resolved' &&
          actual.result.publicState.rewards?.some(reward => reward.bulkHaulageApplied === true &&
            Object.values(reward.resources).some(amount => Number.isSafeInteger(amount) && amount > 0) &&
            actual.result.publicState.outcomes?.some(outcome => outcome.opportunityId === reward.opportunityId &&
              ['success', 'critical-success'].includes(outcome.outcome) &&
              reward.branch === (outcome.outcome === 'success' ? 'success' : 'critical'))))
        recordExtraRoleResult(matrix, 'capybara-small-captain:bulk-haulage', { status: 'committed',
          receipt: { ...actual.receipt, transport: 'source-automatic' } });
    }
    const leaderExpected = await selectRole('capybara-small-captain'), custody = live.context.crew.page.getByRole('region', { name: 'Mission reward custody', exact: true });
    if (await custody.count()) { await chooseVisibleOption(custody.getByLabel('Ship for reward drop-off', { exact: true }));
      const drop = custody.getByRole('button', { name: 'Drop mission rewards at selected ship', exact: true });
      if (await drop.count() && await drop.isEnabled()) await live.ui(live.context.crew, 'commitAwayMissionLifecycleCommand', drop, { expected: leaderExpected, replay: true }); }
  }
  async function reachActualMissionLocation() {
    const expected = await live.select('admiral', 'admiral', '/ships/aegis/roles/admiral');
    const state = await publicState(live.context.crew);
    const known = Object.values(state.knownSystems ?? {});
    const current = await live.context.crew.page.evaluate(async moduleUrl => {
      const { useSessionStore } = await import(moduleUrl);
      return useSessionStore.getState().session?.playerDiscovery?.currentCoordinate;
    }, live.context.crew.storeModuleUrl());
    const destination = missionCoordinate ?? known.find(coordinate => /^\d{4}$/.test(coordinate) && coordinate !== current);
    if (!destination || !known.includes(destination) || destination === current) {
      await stage('Mission pending: no selected different destination belongs to this actual Captain’s known chart'); return false;
    }
    const panel = live.context.crew.page.getByRole('region', { name: /Jump Drive control$/ }).first();
    if (!await panel.count()) { await stage('Mission pending: normal Admiral Jump Drive control not offered'); return false; }
    for (let index = 0; index < 4; index++) {
      const readout = panel.locator(`[aria-label="Coordinate digit ${index + 1} value"]`);
      const increase = panel.getByRole('button', { name: `Increase coordinate digit ${index + 1}`, exact: true });
      for (let presses = 0; await readout.textContent() !== destination[index] && presses < 10; presses++) {
        if (!await increase.isEnabled()) { await stage('Mission pending: actual coordinate dial currently locked'); return false; }
        await increase.click();
      }
      assert.equal(await readout.textContent(), destination[index]);
    }
    const lock = panel.getByRole('button', { name: 'Lock destination coordinates', exact: true });
    if (!await lock.isEnabled()) { await stage('Mission pending: normal source destination lock unavailable'); return false; }
    await lock.click();
    const power = panel.getByRole('slider', { name: 'Jump drive power', exact: true });
    if (!await power.isEnabled()) { await stage('Mission pending: normal Jump Drive power unavailable'); return false; }
    await power.focus(); await power.press('End'); // actual offered keyboard control, no store/DOM-value injection
    const launch = panel.getByRole('button', { name: `Jump to ${destination}`, exact: true });
    if (!await launch.isEnabled()) { await stage('Mission pending: actual source jump charge/fuel/phase blocker'); return false; }
    const actual = await live.ui(live.context.crew, 'jumpShip', launch, { expected, replay: true });
    if (actual.result?.status !== 'jumped') { await stage(`Mission pending: actual unforced jump status ${actual.result?.status ?? 'unknown'}`); return false; }
    await stage('Actual normal Admiral arrival; mission opportunity remains source-selected');
    await perform('gorgoneion-captain:mission-support'); return true;
  }
  async function closeActualEarlyEnding() {
    const { gm, crew } = live.context;
    let observed = await gm.observe();
    if (observed.phase === 'failure') { await gm.page.getByRole('button', { name: 'Freeze failure into debrief', exact: true }).click();
      observed = await gm.until('Actual authoritative early failure debrief', isObservedGameEnding); }
    assert.ok(isObservedGameEnding(observed), 'Only a real server-produced ending can count.');
    const identity = await live.inspectGm(), read = { sessionId: identity.sessionId, instanceId: identity.instanceId };
    const detailed = await gm.callable('getSessionDebrief', read); assert.equal(detailed.status, 'committed');
    const ordinary = await crew.callable('getSessionDebrief', read); assert.equal(ordinary.status, 'denied'); assert.match(ordinary.code, /permission-denied$/);
    await gm.page.getByRole('button', { name: 'Close session', exact: true }).click();
    await gm.until('Real closure of source-produced terminal', value => value.phase === 'closed');
    const closed = await gm.callable('getSessionDebrief', read);
    assert.ok(JSON.stringify(closed.result) === JSON.stringify(detailed.result), 'Closure must preserve the actual frozen snapshot.');
    await crew.page.reload();
    await crew.until('Original ordinary actor entitled closed history after reload', value => value.sameActor && value.sessionId === identity.sessionId && value.phase === 'closed');
  }
  async function runEnding(context) {
    await init(context); await stage(`Actual ${scenario} ${variant} source procedures`);
    for (const row of matrix.filter(row => row.physicalFactRequired || row.unavailableReason)) await execute(row);
    if (scenario === 'joint') {
      for (const [role, ship, craft] of JOINT) await jointMaintenance(role, ship, craft);
      await live.coordination();
      for (const [role, craft] of [['joint-engineering-quellon-refinery', 'wobbly'], ['joint-engineering-shepherd-icebreaker', 'ally']]) {
        for (const action of ['cargo-load', 'cargo-unload', craft === 'wobbly' ? 'recharge' : 'repair']) await perform(`${role}:${craft}-${action}`);
        if (craft === 'ally') for (const branch of [['proposal', 'decline'], ['proposal', 'consent', 'revoke'], ['proposal', 'consent', 'apply']])
          for (const action of branch) await perform(`${role}:ally-dismantle-${action}`);
        for (const action of ['evacuation', 'handoff', 'reclaim', 'departure', 'transit', 'retarget', 'arrival']) await perform(`${role}:${craft}-${action}`);
      }
      if (variant === 'wolf') { await advanceActualCycle();
        for (const [role, ship, craft] of JOINT) await jointMaintenance(role, ship, craft);
        await actualWolf(); await live.coordination(); }
    } else {
      await live.coordination();
      for (const shipId of Object.keys(SMALL_HOSTS)) await docking(shipId, true);
      for (const actor of plan.actors) await assign(actor.roleId);
      for (const id of ['comms-officer:scout', 'commissar:captain-consent', 'commissar:purge', 'gorgoneion-captain:mission-support',
        'capybara-small-captain:cargo-load', 'capybara-small-captain:cargo-unload',
        'warrior-captain:cargo-transfer']) await perform(id);
      const rounds = variant === 'wolf' ? 1 : 3;
      for (let round = 0; round < rounds; round++) {
        await advanceActualCycle(); if ((await publicState(live.context.gm)).phase !== 'active') break;
        for (const shipId of Object.keys(SMALL_HOSTS)) await smallMaintenance(shipId, round);
        await coreMaintenance('dione', { beforeRiot: round > 0 ? () => perform('vip-host:discard-reroll') : undefined,
          beforeBays: () => perform('vip-host:draw') });
        for (const id of ['wolf-commander:cycle-dial', 'wolf-commander:address', 'wolf-commander:amnesty',
          'wolf-commander:captain-amnesty-response', 'wolf-commander:gm-amnesty-ruling']) await perform(id);
        if (variant === 'wolf') { await coreMaintenance('refinery-124', { fuelPdf: true }); await actualWolf(); }
        if (variant === 'mission' && round === 1) await coreMaintenance('aegis');
        await live.coordination();
        if (round === 0) for (const shipId of Object.keys(SMALL_HOSTS)) {
          if ((await publicState(live.context.gm)).smallShips?.[shipId]?.cycle?.step === 0) {
            await docking(shipId, false); await docking(shipId, true);
          }
        }
        // Retain the real Cycle2 card for the next Team reroll; transfer the
        // newly drawn Cycle3 card to a distinct actual Captain afterward.
        if (round > 0) await perform('vip-host:transfer');
        for (const id of ['gorgoneion-captain:repair', 'warrior-captain:repair', 'vulcan-captain:labour-1', 'vulcan-captain:labour-2']) await perform(id);
        if (variant === 'mission' && round === 1) {
          if (await reachActualMissionLocation()) await actualMission();
        }
        if (round === 0 && variant === 'wolf') for (const id of [
          'warrior-captain:jump-drive', 'vulcan-captain:jump-drive',
        ]) await perform(id);
        if (round === 2 && variant !== 'wolf') for (const id of [
          'gorgoneion-captain:jump-' + jumpLength,
          'capybara-small-captain:jump-' + jumpLength,
          'warrior-captain:jump-drive',
          'vulcan-captain:jump-drive',
        ]) await perform(id);
      }
      for (const shipId of Object.keys(SMALL_HOSTS)) await docking(shipId, false);
    }
    for (const row of matrix.filter(row => row.status === 'pending')) await live.block(row.id,
      `This actual fresh ${variant} case did not meet the source prerequisite: ${row.prerequisite}`, row.nextActor);
    await stage('Actual terminal callback; ending branch must be produced by source gameplay');
    const current = await live.context.gm.observe();
    if (current.phase === 'failure' || isObservedGameEnding(current)) await closeActualEarlyEnding(); else await terminal(context);
    const final = await publicState(live.context.gm); assert.equal(final.phase, 'closed'); assert.ok(final.terminal);
    evidence.terminalCompleted = true; evidence.terminal = final.terminal; await save();
  }
  return { plan, procedures, onBeforeStart: async context => {
    validateExtraRoleRoster(plan, context.roster); await mkdir(directory, { recursive: true });
    const controller = await context.crew.observe();
    assert.ok(controller.sameActor && controller.profileRoleId === 'controller' && controller.sessionId === context.initial.sessionId,
      'Capture the actual ordinary controller before any actor selection.');
    evidence.controllerUidHash = controller.uidHash;
    if (scenario === 'joint') await unionHosts(context);
  }, runEnding, summary: () => ({ ...evidence, ...extraRoleCoverage(matrix) }), save };
}

/** Parent owns the explicit sequential runtime window. Calling the pure factory
 * above does not launch it; this entry point uses the canonical generic driver. */
export async function runExtraRoleProof(options = {}) {
  const scenario = options.scenario ?? process.argv[2] ?? 'joint', variant = options.variant ?? process.argv[3] ?? 'coordination';
  const sourceRoot = options.sourceRoot ?? process.env.PC10_SOURCE_ROOT ?? ownRoot;
  const directory = options.directory ?? process.env.PC10_EVIDENCE_DIRECTORY ?? `/tmp/dow-pc10-evidence/extra-roles/${scenario}-${variant}-${Date.now()}`;
  const baseUrl = options.baseUrl ?? process.env.PC10_BASE_URL ?? 'http://127.0.0.1:5182';
  const projectId = options.projectId ?? process.env.PC10_PROJECT_ID ?? 'demo-pc10-extra-roles';
  assert.ok(projectId.startsWith('demo-'), 'An isolated emulator project is required.');
  const origin = new URL(baseUrl);
  assert.ok(origin.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(origin.hostname) &&
    !origin.username && !origin.password, 'Only a local emulator browser origin without credentials is permitted.');
  const ports = options.ports ?? { auth: Number(process.env.PC10_AUTH_PORT ?? 9189), functions: Number(process.env.PC10_FUNCTIONS_PORT ?? 5091), firestore: Number(process.env.PC10_FIRESTORE_PORT ?? 8170) };
  assert.ok(Object.values(ports).every(port => Number.isSafeInteger(port) && port > 1024 && port < 65536));
  await mkdir(directory, { recursive: true });
  const callbacks = createExtraRoleCallbacks({ ...options, scenario, variant, directory }), before = await binding(sourceRoot);
  let failure;
  try {
    const { runFreshFullGameDemoUi } = await import('./pc10-full-game-demo-ui-proof.mjs');
    await runFreshFullGameDemoUi({ sourceRoot, baseUrl, projectId, ports, directory, playerCount: callbacks.plan.playerCount,
      includePress: true, capybaraEnabled: true, chartId: 'B', gameplayOnly: true,
      onBeforeStart: callbacks.onBeforeStart, runEnding: callbacks.runEnding });
  } catch (error) { failure = String(error.message).slice(0, 800); throw error; }
  finally {
    const after = await binding(sourceRoot), unchanged = JSON.stringify(before) === JSON.stringify(after);
    await writeFile(`${directory}/extra-role-source-runtime-binding.json`, `${JSON.stringify({ before, after, unchanged,
      ...(failure ? { failure } : {}), codeOnlyTestsAreNotBrowserProof: true }, null, 2)}\n`);
    await callbacks.save(); assert.equal(unchanged, true, 'Actual source and complete compiled runtime must remain unchanged.');
  }
  return callbacks.summary();
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  runExtraRoleProof().catch(error => { console.error(error.message); process.exitCode = 1; });
