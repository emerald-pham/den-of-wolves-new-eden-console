import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { runFreshFullGameDemoUi } from './pc10-full-game-demo-ui-proof.mjs';
import { assertSelectedActor } from './pc10-full-game-demo-proof-helpers.mjs';
import { runPursuitLimitEnding } from './pc10-full-game-cycle-ending.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scenario = process.argv[2] ?? 'joint';
const directory = process.env.PC10_EVIDENCE_DIRECTORY ?? `/tmp/dow-pc10-evidence/extra-roles/${scenario}-${Date.now()}`;
const receipts = [], surfaces = [], stages = [];
const evidence = { schemaVersion: 1, scenario, sourceBase: '05f7b64589030b390f82aee37035a40418f3236d',
  actualBrowserProcesses: 2, actualBrowserContexts: 2, actualHumans: 0, actualHumanDevices: 0,
  adminGameplayWrites: false, acceleratedClock: false, seededPrivateHands: false,
  sourceForcedRandomness: false, everyRoleFunctionComplete: false, receipts, surfaces, stages };

async function binding() {
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
    indexSha256: files.find(([name]) => name === 'index.js')[1], compiledFileCount: files.length,
    compiledTreeSha256: createHash('sha256').update(files.map(([name, hash]) => `${name}\0${hash}\n`).join('')).digest('hex') };
}
async function save() { await writeFile(`${directory}/extra-role-receipts.json`, `${JSON.stringify(evidence, null, 2)}\n`); }
async function stage(name) { stages.push({ name, at: new Date().toISOString() }); console.log(JSON.stringify({ stage: name })); await save(); }

async function state(surface) {
  return surface.page.evaluate(async moduleUrl => {
    const { useSessionStore } = await import(moduleUrl);
    const { session, me, connection, sessionSnapshotFreshness } = useSessionStore.getState();
    return { sessionId: session?.id, cycle: session?.currentTurn, phase: session?.phase,
      setupRevision: session?.setupRevision, activeConsoleRoleId: me?.activeConsoleRoleId,
      assignedRoleId: me?.assignedRoleId, replacementRoleId: me?.replacementRoleId ?? null,
      seatId: me?.seatId ?? null, live: connection === 'live' && sessionSnapshotFreshness === 'server',
      resources: session?.shipResources, maintenance: session?.maintenanceCycles,
      damage: session?.shipDamage, vesselRevisions: session?.vesselActionRevisions,
      shuttleFuelled: session?.shuttleFuelled, shuttleDockings: session?.shuttleDockings,
      recharge: session?.serviceShuttleRecharges, allyRepairs: session?.allyRepairs,
      smallShips: session?.smallShipStates };
  }, surface.storeModuleUrl());
}
async function waitState(surface, description, predicate, timeout = 40_000) {
  const deadline = Date.now() + timeout;
  let current;
  do { current = await state(surface); if (predicate(current)) return current; await delay(250); } while (Date.now() < deadline);
  throw Error(`${description}: ${JSON.stringify({ sessionId: current?.sessionId, cycle: current?.cycle,
    phase: current?.phase, live: current?.live, activeConsoleRoleId: current?.activeConsoleRoleId,
    assignedRoleId: current?.assignedRoleId, replacementRoleId: current?.replacementRoleId })}`);
}
async function selectActor(context, anchorRoleId, route) {
  const { crew, initial, roster } = context;
  const actor = roster.find(actor => actor.roleId === anchorRoleId);
  assert.ok(actor, `Use an actually admitted ${anchorRoleId} persona.`);
  await crew.page.getByLabel('Current actor', { exact: true }).selectOption(anchorRoleId);
  await crew.page.waitForURL(url => url.searchParams.get('demoActor') === `${initial.sessionId}~${anchorRoleId}`);
  const observed = await crew.until(`Same ordinary ${anchorRoleId} restored`, value =>
    value.sameActor && value.uidHash === actor.uidHash && value.sessionId === initial.sessionId &&
    value.profileRoleId === anchorRoleId && value.connection === 'live' && value.freshness === 'server');
  assertSelectedActor(observed, { ...actor, sessionId: initial.sessionId });
  if (route) {
    const url = new URL(crew.page.url()); url.hash = route;
    await crew.page.goto(url.href);
    await crew.until(`Same actor and session after ordinary route ${route}`, value =>
      value.sameActor && value.uidHash === actor.uidHash && value.sessionId === initial.sessionId &&
      value.profileRoleId === anchorRoleId && value.connection === 'live' && value.freshness === 'server');
  }
  return actor;
}
async function inventory(context, anchorRoleId, roleId) {
  const { crew, initial, roster } = context;
  const observed = await crew.observe();
  assertSelectedActor(observed, { ...roster.find(actor => actor.roleId === anchorRoleId), sessionId: initial.sessionId });
  const actual = await state(crew);
  const affordances = await crew.page.evaluate(() => ({
    headings: [...document.querySelectorAll('main h1, main h2, main h3, main h4')].map(element => element.textContent.trim()),
    regions: [...document.querySelectorAll('main [aria-label]')].filter(element =>
      element.matches('section, nav, aside, [role="region"]')).map(element => element.getAttribute('aria-label')),
    buttons: [...document.querySelectorAll('main button')].map(button => ({ name: button.textContent.trim(),
      disabled: button.disabled, ariaLabel: button.getAttribute('aria-label'), title: button.getAttribute('title'),
      description: (button.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)
        .map(id => document.getElementById(id)?.textContent?.trim()).filter(Boolean).join(' ') })),
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
  }));
  surfaces.push({ anchorRoleId, currentRoleId: actual.replacementRoleId ?? actual.activeConsoleRoleId,
    intendedRoleId: roleId, uidHash: observed.uidHash, sameActor: observed.sameActor,
    briefRoleId: observed.briefRoleId, briefMatchesActor: observed.briefMatchesActor,
    pendingCommandCount: observed.pendingCommandCount, ...affordances });
  await crew.page.screenshot({ path: `${directory}/${roleId}-surface.png` });
  await save();
}
async function uiCommand(surface, endpoint, locator, details = {}, { replay = false } = {}) {
  const responsePromise = surface.page.waitForResponse(response =>
    new URL(response.url()).pathname.endsWith(`/us-central1/${endpoint}`) && response.request().method() === 'POST');
  await locator.click();
  const response = await responsePromise;
  const body = await response.json();
  const data = response.request().postDataJSON()?.data;
  const result = body.result;
  const record = { ...details, endpoint, transport: 'connected ordinary UI and actual browser Firebase SDK',
    httpStatus: response.status(), requestId: data?.requestId ?? null, status: result?.status ?? null,
    at: new Date().toISOString() };
  receipts.push(record); await save();
  assert.equal(response.status(), 200, `${endpoint}: ${body.error?.message ?? response.status()}`);
  if (replay) {
    const repeated = await surface.callable(endpoint, data);
    record.exactSdkReplay = { status: repeated.status, resultStatus: repeated.result?.status ?? null, code: repeated.code ?? null };
    await save();
    assert.equal(repeated.status, 'committed', `Same unchanged ${endpoint} request must remain recoverable.`);
  }
  return { result, data, record };
}

async function chooseUnionHosts({ gm, initial }) {
  for (const [craft, host] of [['Wobbly', 'quellon'], ['Ally', 'shepherd']]) {
    const panel = gm.page.getByRole('region', { name: `${craft} starting host`, exact: true });
    await panel.getByLabel(`${craft} starting host`, { exact: true }).selectOption(host);
    await uiCommand(gm, 'setUnionCraftStartingHost', panel.getByRole('button', { name: `Save ${craft} starting host`, exact: true }),
      { function: 'explicit normal GM initial dock choice', craftId: craft.toLowerCase(), hostShipId: host }, { replay: true });
    await waitState(gm, `${craft} actual initial dock`, value => value.sessionId === initial.sessionId &&
      value.shuttleDockings?.some(entry => entry.shuttleId === craft.toLowerCase() && entry.shipId === host));
  }
}

async function maintenance(context, anchorRoleId, shipId, fuelCraft) {
  const { crew, gm } = context;
  await selectActor(context, anchorRoleId, `/union/roles/${anchorRoleId}`);
  await crew.page.getByRole('navigation', { name: 'Engineering ship selection', exact: true })
    .getByRole('button', { name: new RegExp(shipId === 'refinery-124' ? 'Refinery' : shipId, 'i') }).click();
  await waitState(crew, 'Actual Joint engineering station authority', value => value.live && value.activeConsoleRoleId === anchorRoleId);
  await inventory(context, anchorRoleId, `${anchorRoleId}-${shipId}`);
  await stage(`actual ${anchorRoleId} maintenance on ${shipId}`);
  const begin = crew.page.getByRole('button', { name: 'Begin Maintenance Cycle: Cycle 1', exact: true });
  await begin.click();
  await uiCommand(crew, 'runMaintenance', crew.page.getByRole('button', { name: 'ARE YOU SURE?', exact: true }),
    { roleId: anchorRoleId, shipId, function: 'begin maintenance' }, { replay: true });
  for (const [action, name] of [['storage', 'Check storage'], ['rations', 'Proceed with rations'],
    ['unrest', 'Run unrest check'], ['riot', 'Run riot check'], ['reactor', 'Power up reactor'],
    ['bays', 'Proceed with refuelling'], ['end', 'End maintenance cycle']]) {
    const locator = crew.page.getByRole('button', { name, exact: true });
    await locator.waitFor();
    const deadline = Date.now() + 35_000;
    while (!(await locator.isEnabled()) && Date.now() < deadline) await delay(200);
    assert.equal(await locator.isEnabled(), true, `${shipId} ${action} must use the normal available UI.`);
    if (action === 'rations') {
      await crew.page.getByLabel('Food ration level', { exact: true }).selectOption('3');
      await crew.page.getByLabel('Water ration level', { exact: true }).selectOption('3');
    }
    if (action === 'bays' && fuelCraft) {
      const choices = crew.page.locator('select[aria-label$="refuelling"]');
      let selected = false;
      for (const choice of await choices.all()) {
        if (await choice.isEnabled() && await choice.locator(`option[value="${fuelCraft}"]`).count()) {
          await choice.selectOption(fuelCraft); selected = true; break;
        }
      }
      assert.equal(selected, true, `An operational actual bay must fuel ${fuelCraft}.`);
    }
    if (action === 'reactor') {
      // No production console is selected; the genuine refuelling path remains available.
      await locator.click();
      await uiCommand(crew, 'runMaintenance', crew.page.getByRole('button', { name: 'ARE YOU SURE?', exact: true }),
        { roleId: anchorRoleId, shipId, function: action });
    } else await uiCommand(crew, 'runMaintenance', locator, { roleId: anchorRoleId, shipId, function: action });
  }
  await waitState(gm, `${shipId} maintenance actually completed`, value => value.maintenance?.[shipId]?.turn === 1 &&
    value.maintenance[shipId].step === 7 && value.maintenance[shipId].results?.['7']);
  if (fuelCraft) await waitState(gm, `${fuelCraft} actually fuelled`, value => value.shuttleFuelled?.[fuelCraft] === true);
}

async function runJoint(context) {
  const qr = 'joint-engineering-quellon-refinery', si = 'joint-engineering-shepherd-icebreaker';
  for (const [role, ship, craft] of [[qr, 'quellon', 'wobbly'], [qr, 'refinery-124'],
    [si, 'shepherd', 'ally'], [si, 'icebreaker']]) await maintenance(context, role, ship, craft);
  const { gm, crew } = context;
  await uiCommand(gm, 'advanceFullGameDemoPhase', gm.page.getByRole('button', { name: 'Open Coordination manually', exact: true }),
    { function: 'normal live GM manual Team to Coordination' });
  await gm.until('Genuine manual Coordination', value => value.airspace === 'lifted' && value.cycle === 1);
  await selectActor(context, qr, '/shuttles/wobbly');
  await inventory(context, qr, 'wobbly');
  const recharge = crew.page.getByRole('region', { name: 'Service shuttle recharge', exact: true });
  await recharge.getByLabel('Host console', { exact: true }).selectOption('water-production');
  const charged = await uiCommand(crew, 'rechargeHostConsoleFromShuttle', recharge.getByRole('button', { name: 'Recharge console', exact: true }),
    { roleId: qr, craftId: 'wobbly', function: 'fuelled immediate host-console recharge' }, { replay: true });
  receipts.at(-1).rechargeConsoleId = charged.result?.consoleId;
  await selectActor(context, si, '/shuttles/ally');
  await inventory(context, si, 'ally');
  await stage('genuine GM random damage choice for Ally repair exercise');
  const before = await state(gm);
  const requestId = crypto.randomUUID();
  const damage = await gm.callable('addShipDamage', { sessionId: context.initial.sessionId,
    instanceId: (await gm.observe()).instanceId, shipId: 'shepherd', requestId,
    expectedRevision: before.vesselRevisions?.shepherd ?? 0 });
  receipts.push({ endpoint: 'addShipDamage', function: 'actual labelled GM training damage choice; random result unforced',
    transport: 'actual authenticated GM browser SDK supplement', shipId: 'shepherd', requestId,
    status: damage.status, recycled: damage.result?.recycled ?? null, destroyed: damage.result?.destroyed ?? null });
  await save(); assert.equal(damage.status, 'committed'); assert.equal(damage.result.destroyed, false);
  await waitState(crew, 'Actual repairable damage reaches holder projection', value => value.damage?.shepherd?.damagedSystemIds?.length >= 1);
  const repair = crew.page.getByRole('region', { name: 'Ally console repair', exact: true });
  await repair.getByRole('checkbox').first().check();
  await uiCommand(crew, 'repairConsolesFromAlly', repair.getByRole('button', { name: 'Repair selected consoles', exact: true }),
    { roleId: si, craftId: 'ally', function: 'repair actual docked-host damage at four materials per console' }, { replay: true });
  await stage('joint run genuine pursuit-limit terminal');
  await runPursuitLimitEnding(context);
  evidence.terminalCompleted = true;
}

export async function runExtraRoleProof() {
  assert.equal(scenario, 'joint', 'Only implemented genuine scenarios may run.');
  await mkdir(directory, { recursive: true });
  evidence.bindingAtStart = await binding(); await save();
  try {
    await runFreshFullGameDemoUi({ sourceRoot: root, baseUrl: 'http://127.0.0.1:5182', projectId: 'demo-pc10-extra-roles',
      ports: { auth: 9189, functions: 5091, firestore: 8170 }, directory, playerCount: 8, includePress: true,
      capybaraEnabled: true, chartId: 'B', gameplayOnly: true, onStage: stage,
      onBeforeStart: chooseUnionHosts, runEnding: runJoint });
    evidence.status = 'passed scoped actions';
  } catch (error) { evidence.status = 'failed'; evidence.failure = error.message; throw error; }
  finally {
    evidence.bindingAtEnd = await binding();
    evidence.sourceAndCompiledRuntimeUnchanged = JSON.stringify(evidence.bindingAtStart) === JSON.stringify(evidence.bindingAtEnd);
    await save();
    assert.equal(evidence.sourceAndCompiledRuntimeUnchanged, true);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  runExtraRoleProof().catch(error => { console.error(error.message); process.exitCode = 1; });
