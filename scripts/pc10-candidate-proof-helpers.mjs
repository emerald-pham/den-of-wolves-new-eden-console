import assert from 'node:assert/strict';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { assertWolfChoiceActor } from './pc10-combat-choice-readiness.mjs';

export const CANDIDATE_PROOF_SHIPS = Object.freeze({
  aegis: { name: 'AEGIS', engineer: 'executive-officer', captain: 'admiral' },
  dione: { name: 'Dione', engineer: 'dione-engineer', captain: 'dione-captain' },
  icebreaker: { name: 'Icebreaker', engineer: 'icebreaker-engineer', captain: 'icebreaker-captain' },
  shepherd: { name: 'Shepherd', engineer: 'shepherd-engineer', captain: 'shepherd-captain' },
  quellon: { name: 'Quellon', engineer: 'quellon-engineer', captain: 'quellon-captain' },
  'refinery-124': { name: 'Refinery 124', engineer: 'refinery-124-engineer', captain: 'refinery-124-captain' },
  capybara: { name: 'Capybara', engineer: 'capybara-recycler', captain: 'capybara-captain' },
});

/** Refreshing the real panel can remove its selector until the current read returns. */
export async function chooseOfferedRingEngineeringShuttle(select) {
  await select.waitFor({ state: 'visible', timeout: 60_000 });
  const available = await select.locator('option').evaluateAll(options => options
    .filter(option => !option.disabled && option.value).map(option => option.value));
  assert.ok(available.length, 'A genuine available Engineering Shuttle must be shown.');
  await select.selectOption(available[0]);
  return available[0];
}

const candidateStaleCursor = 'Candidate session authority changed. Refresh the live report.';

/** The mounted candidate report, one offered refresh and its choice share the original35s budget. */
export async function waitForCandidateChoice({ observeActor, inspectPanel, refresh, choose,
  expectedReceipt, deadlineAt = Infinity, now = Date.now, wait = remaining => delay(Math.min(200, remaining)) }) {
  const deadline = Math.min(now() + 35_000, deadlineAt);
  const budget = () => {
    assert.ok(now() < deadline, 'Current candidate choice readiness deadline expired; no fallback or new request.');
  };
  budget();
  const original = await observeActor(); budget();
  assert.equal(original.phase, 'active', 'Original candidate actor must be in active gameplay.');
  assert.ok(Number.isSafeInteger(original.cycle) && original.cycle >= 1);
  for (const key of ['sessionId', 'uidHash', 'profileRoleId', 'assignedRoleId', 'activeConsoleRoleId', 'fleetGroupId'])
    assert.ok(typeof original[key] === 'string' && original[key].length, `Original candidate ${key} is required.`);
  assert.ok(Number.isSafeInteger(original.connectionGeneration) && original.connectionGeneration >= 1,
    'Original candidate connection generation is required.');
  assertWolfChoiceActor(original, original);
  assert.equal(original.pendingCommandCount, 0, 'A pending original candidate mutation cannot acquire another choice.');
  let expectedRevision;
  if (expectedReceipt) {
    assert.equal(expectedReceipt.endpoint, 'executeCandidateAction', 'Use the latest actual candidate receipt.');
    for (const source of [expectedReceipt.request, expectedReceipt.result]) {
      assert.equal(source?.sessionId, original.sessionId, 'Latest candidate receipt session must remain current.');
      assert.equal(source?.code, 'N', 'Latest Ring receipt must be the same candidate source.');
    }
    assert.equal(expectedReceipt.request.expectedGroupId, original.fleetGroupId, 'Latest candidate receipt group must remain current.');
    assert.ok(['committed', 'replayed'].includes(expectedReceipt.result.status), 'A stale candidate receipt cannot enable another choice.');
    expectedRevision = expectedReceipt.result.revision;
    assert.ok(Number.isSafeInteger(expectedRevision) && expectedRevision >= 0, 'Latest candidate receipt revision must be safe.');
  }
  let refreshCount = 0;
  async function authority() {
    budget(); const current = await observeActor(); budget();
    assertWolfChoiceActor(current, original);
    assert.equal(current.pendingCommandCount, 0, 'A pending candidate mutation cannot enable another choice.');
  }
  function currentPaint(paint) {
    assert.ok(Number.isSafeInteger(paint.panelCount) && paint.panelCount >= 0 && paint.panelCount <= 1,
      'Exactly one candidate panel is required; duplicate cardinality cannot choose the first.');
    if (!paint.panelCount || !paint.panelVisible) return false;
    assert.equal(paint.pendingAttempt, false, 'A pending candidate attempt must recover its original request first.');
    assert.ok(Array.isArray(paint.messages));
    assert.ok(!paint.messages.includes('Transmitting candidate choice…'), 'A pending candidate transmission cannot become a new choice.');
    assert.ok(paint.messages.every(message => message === candidateStaleCursor), 'Unclassified current candidate status cannot refresh or choose.');
    assert.ok(Number.isSafeInteger(paint.headerCount) && paint.headerCount >= 0 && paint.headerCount <= 1,
      'The current candidate header must be unique.');
    assert.ok(Number.isSafeInteger(paint.control.count) && paint.control.count >= 0 && paint.control.count <= 1,
      'Exactly one requested candidate control is required; duplicate cardinality cannot choose the first.');
    if (!paint.headerCount) return false;
    assert.equal(paint.cycle, original.cycle, 'Current candidate cycle must match the original actor.');
    assert.ok(Number.isSafeInteger(paint.revision) && paint.revision >= 0, 'Current candidate revision must be safe.');
    if (expectedRevision !== undefined) assert.equal(paint.revision, expectedRevision, 'Current candidate revision must match the latest actual receipt.');
    return !paint.receiving && paint.control.count === 1 && paint.control.visible && paint.control.enabled;
  }
  async function paint() {
    await authority();
    const current = await inspectPanel({ deadlineAt: deadline }); budget();
    await authority();
    return { current, ready: currentPaint(current) };
  }
  await authority();
  while (now() < deadline) {
    const { current, ready } = await paint();
    if (ready) {
      const final = await paint();
      if (final.ready) {
        assert.equal(final.current.revision, current.revision, 'Current candidate revision changed before the offered choice.');
        await authority(); budget();
        const result = await choose({ original, cycle: current.cycle, revision: current.revision,
          deadlineAt: deadline, refreshCount });
        // A paid crossing can release this console. Keep its original response and
        // budget without treating that authoritative consequence as a new actor.
        budget(); return result;
      }
    } else if (!refreshCount && current.panelCount === 1 && current.panelVisible && current.messages.includes(candidateStaleCursor)) {
      assert.ok(Number.isSafeInteger(current.refresh.count) && current.refresh.count >= 0 && current.refresh.count <= 1,
        'Exactly one mounted candidate refresh is required.');
      if (current.refresh.count === 1 && current.refresh.visible && current.refresh.enabled) {
        await authority(); budget(); refreshCount++;
        await refresh({ deadlineAt: deadline }); budget();
        await authority();
      }
    }
    budget(); await wait(deadline - now());
  }
  budget();
}

/** Configure the ordinary root runner; no runtime or actor is created here. */
export function candidateProofOptions(input = {}) {
  const candidateCode = input.candidateCode ?? 'N';
  const playerCount = input.playerCount ?? 18, includePress = input.includePress ?? true;
  const chartId = input.chartId ?? (candidateCode === 'P' ? 'B' : 'A');
  const capybaraEnabled = input.capybaraEnabled ?? playerCount >= 19;
  assert.ok(['N', 'O', 'P'].includes(candidateCode), 'Choose candidate N, O or P.');
  assert.ok(Number.isSafeInteger(playerCount) && playerCount >= 8 && playerCount <= 20, 'Choose 8–20 core players.');
  assert.equal(typeof includePress, 'boolean'); assert.equal(typeof capybaraEnabled, 'boolean');
  assert.equal(capybaraEnabled, playerCount >= 19,
    'This candidate harness explicitly disables base Capybara; 19/20 require the expansion pair.');
  assert.ok(['A', 'B', 'C'].includes(chartId));
  assert.ok(typeof input.directory === 'string' && isAbsolute(input.directory),
    'Supply a new absolute PC10_EVIDENCE_DIRECTORY for this attempt.');
  const sourceRoot = resolve(input.sourceRoot ?? process.cwd()), directory = resolve(input.directory);
  const inSource = relative(sourceRoot, directory);
  assert.ok(inSource.startsWith('..') || isAbsolute(inSource), 'Keep private proof evidence outside the Git source checkout.');
  const baseUrl = input.baseUrl ?? 'http://127.0.0.1:5175';
  const url = new URL(baseUrl);
  assert.ok(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname), 'Use the isolated loopback UI.');
  const projectId = input.projectId ?? 'demo-pc10-candidate-manual';
  assert.match(projectId, /^demo-[a-z0-9-]+$/, 'Use the explicitly reserved local demo project.');
  const ports = input.ports ?? { auth: 9119, functions: 5021, firestore: 8100 };
  assert.deepEqual(Object.keys(ports).sort(), ['auth', 'firestore', 'functions']);
  assert.ok(Object.values(ports).every(port => Number.isSafeInteger(port) && port > 0 && port <= 65535));
  assert.equal(new Set([...Object.values(ports), Number(url.port || 80)]).size, 4, 'Use four distinct owned runtime ports.');
  for (const [key, pattern] of [['expectedSourceCommit', /^[a-f0-9]{40}$/], ['expectedRuntimeIndexSha256', /^[a-f0-9]{64}$/]]) {
    if (input[key] !== undefined) assert.match(input[key], pattern, `Supply the exact ${key}.`);
  }
  for (const key of ['onSetup', 'onBeforeStart', 'onStarted', 'onStage']) {
    if (input[key] !== undefined) assert.equal(typeof input[key], 'function');
  }
  return { ...input, candidateCode, playerCount, includePress, capybaraEnabled, chartId,
    directory, sourceRoot, baseUrl, projectId, ports, gameplayOnly: true };
}

/** This proof uses exactly the root runner's two browsers; caller details cannot relabel it. */
export function candidateEvidenceEnvelope(details = {}) {
  return { ...details, schemaVersion: 2, actualBrowserProcesses: 2, actualBrowserContexts: 2,
    actualHumans: 0, physicalAttendanceProof: false, adminGameplayWrites: false,
    acceleratedClock: false, callableFixtures: false, wholeGameProof: false };
}

export async function prepareCandidateEvidenceDirectory(directory, plan) {
  await mkdir(directory, { recursive: true });
  assert.equal((await readdir(directory)).length, 0, 'Refuse to reuse an existing nonempty evidence directory.');
  const evidence = { ...candidateEvidenceEnvelope(plan), status: 'planned', candidateEndingObserved: false,
    actualBrowserProcesses: 0, actualBrowserContexts: 0, actualAuthenticatedActors: 0,
    expectedBrowserProcesses: 2, expectedBrowserContexts: 2 };
  await writeFile(`${directory}/candidate-harness-plan.json`, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
}

function liveActor(actor, sessionId) {
  assert.ok(actor?.hasAuth && actor.sameActor && actor.sessionId === sessionId,
    'Use the same ordinary authenticated session member.');
  assert.equal(actor.connection, 'live'); assert.equal(actor.freshness, 'server');
  assert.ok(typeof actor.uidHash === 'string' && actor.uidHash.length > 0);
}

/** Counts come from normal confirmed setup and actual independently admitted identities. */
export function assertCandidateAdmission({ confirmed, gm, controller, roster }, configuration) {
  assert.ok(confirmed?.setupConfirmed && confirmed.cycle === 0);
  assert.equal(confirmed.activeRoleIds.length, configuration.playerCount);
  assert.equal(confirmed.pressEnabled, configuration.includePress);
  assert.equal(confirmed.capybaraEnabled, configuration.capybaraEnabled);
  assert.equal(new Set(confirmed.activeRoleIds).size, confirmed.activeRoleIds.length);
  liveActor(gm, confirmed.sessionId); liveActor(controller, confirmed.sessionId);
  assert.equal(gm.uidHash, confirmed.uidHash, 'Keep the original GM account from confirmed setup.');
  assert.equal(gm.instanceId, confirmed.instanceId, 'Keep the original owned GM instance from confirmed setup.');
  assert.equal(gm.playerRole, 'gm'); assert.equal(gm.gmInstanceOwned, true);
  assert.ok(gm.instanceId); assert.equal(gm.cycle, 0);
  assert.equal(controller.profileRoleId, 'controller'); assert.equal(controller.cycle, 0);
  const roles = [...confirmed.activeRoleIds, ...(configuration.includePress ? ['press-officer'] : [])];
  assert.deepEqual(roster.map(actor => actor.roleId).sort(), [...roles].sort(), 'Every confirmed named role must have its real account.');
  assert.ok(roster.every(actor => typeof actor.uidHash === 'string' && actor.uidHash.length > 0));
  const identities = [gm.uidHash, controller.uidHash, ...roster.map(actor => actor.uidHash)];
  assert.equal(new Set(identities).size, identities.length, 'Named actors, controller and GM must be distinct ordinary Auth identities.');
  return candidateEvidenceEnvelope({ actualAuthenticatedActors: identities.length, namedRoleAccounts: roster.length,
    coreRoleAccounts: confirmed.activeRoleIds.length, pressAccounts: Number(configuration.includePress),
    controllerAccounts: 1, gmAccounts: 1, sameSession: true, liveOwnedGmInstance: true });
}

export function candidateShipRole(roster, shipId, kind = 'engineer') {
  const ship = CANDIDATE_PROOF_SHIPS[shipId];
  assert.ok(ship, 'Only an implemented full-fleet vessel can enter this bounded candidate callback.');
  assert.ok(['engineer', 'captain'].includes(kind));
  const chosen = [ship[kind], ship[kind === 'captain' ? 'engineer' : 'captain']]
    .find(roleId => roster.some(actor => actor.roleId === roleId));
  assert.ok(chosen, `${shipId} requires its genuinely admitted ${kind} or source-authorized crew fallback.`);
  return chosen;
}

/** The callbacks enter once at a real manual Team1 start, without seed/cache/fault scenes. */
export function assertFreshCandidateStart({ current, started, roster }) {
  liveActor(current, started.sessionId);
  assert.equal(current.uidHash, started.uidHash); assert.equal(current.instanceId, started.instanceId);
  assert.equal(current.playerRole, 'gm'); assert.equal(current.gmInstanceOwned, true);
  assert.equal(current.phase, 'active'); assert.equal(current.cycle, 1);
  assert.equal(current.phaseProgression, 'manual'); assert.equal(current.airspace, 'restricted');
  assert.equal(current.turnStatePhase, 'team');
  assert.deepEqual(current.fullGameDemo, { status: 'active', progression: 'manual' });
  const roles = roster.filter(actor => actor.roleId !== 'press-officer').map(actor => actor.roleId);
  assert.deepEqual([...current.activeRoleIds].sort(), roles.sort());
  assert.ok(current.activeVesselIds.length > 0);
  for (const shipId of current.activeVesselIds) candidateShipRole(roster, shipId);
  for (const roleId of ['executive-officer', 'wing-commander', 'icebreaker-miner', 'shepherd-scientist', 'quellon-explorer']) {
    assert.ok(roster.some(actor => actor.roleId === roleId), `${roleId} must be genuinely admitted before this callback starts.`);
  }
}

/** Await the ordinary post-action server projection without reissuing start. */
export async function waitForFreshCandidateStart({ started, roster, inspect,
  timeoutMs = 60_000, now = Date.now, wait = () => delay(250) }) {
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    const current = await inspect();
    assert.ok(current?.hasAuth && current.sameActor, 'Retain the original GM authentication.');
    assert.equal(current.sessionId, started.sessionId, 'Retain the original GM session.');
    assert.equal(current.uidHash, started.uidHash, 'Retain the original GM identity.');
    assert.equal(current.instanceId, started.instanceId, 'Retain the original GM instance.');
    assert.equal(current.playerRole, 'gm', 'Retain the original GM role.');
    assert.equal(current.gmInstanceOwned, true, 'Retain the original GM instance ownership.');
    if (current.connection === 'live' && current.freshness === 'server') {
      assertFreshCandidateStart({ current, started, roster });
      return current;
    }
    await wait();
  }
  throw new Error('The live original GM candidate start did not return before its existing deadline.');
}

/** A captured receipt cannot enable another paid step from just the faster observer. */
export async function waitForMaintenanceReceipt({ shipId, cycle, revision, expectedActor,
  expectedMaintenance, inspectGm, inspectCrew, inspectActor, inspectRendered,
  timeoutMs = 60_000, now = Date.now, wait = () => delay(200) }) {
  assert.ok(Number.isSafeInteger(cycle) && Number.isSafeInteger(revision));
  if (expectedMaintenance) {
    assert.equal(expectedMaintenance.turn, cycle); assert.equal(expectedMaintenance.revision, revision);
    assert.equal(typeof inspectRendered, 'function', 'Observe the actual rendered maintenance closure before another click.');
  }
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    const actor = await inspectActor();
    for (const key of ['sessionId', 'uidHash', 'profileRoleId', 'activeConsoleRoleId']) {
      assert.equal(actor[key], expectedActor[key], 'Keep the original crew actor while recovering maintenance.');
    }
    assert.ok(actor.sameActor); assert.equal(actor.connection, 'live'); assert.equal(actor.freshness, 'server');
    const gm = await inspectGm(), crew = await inspectCrew();
    const projectionsMatch = [gm, crew].every(value => {
      const projection = Object.hasOwn(value, 'shipProjection') ? value.shipProjection : {
        shipId, currentTurn: value.cycle ?? value.maintenanceCycles?.[shipId]?.turn,
        maintenanceCycle: value.maintenanceCycles?.[shipId],
      };
      return value.live && value.sessionId === expectedActor.sessionId && projection?.shipId === shipId &&
        projection.currentTurn === cycle && projection.maintenanceCycle?.turn === cycle &&
        projection.maintenanceCycle.revision === revision && (!expectedMaintenance ||
          projection.maintenanceCycle.step === expectedMaintenance.step &&
          Object.entries(expectedMaintenance.results ?? {}).every(([key, result]) => projection.maintenanceCycle.results?.[key] === result));
    });
    let renderMatches = !expectedMaintenance;
    if (projectionsMatch && expectedMaintenance) {
      const rendered = await inspectRendered();
      const normalize = value => value.replace(/\s+/g, ' ').trim();
      const currentStep = expectedMaintenance.step === 0 || (expectedMaintenance.step === 7 && shipId !== 'aegis')
        ? null : expectedMaintenance.step;
      renderMatches = rendered.currentStep === currentStep &&
        (expectedMaintenance.step !== 7 || shipId === 'aegis' || rendered.endEnabled === true) &&
        Object.values(expectedMaintenance.results ?? {}).filter(result => typeof result === 'string' && result.trim()).every(result =>
          rendered.results.some(actual => normalize(actual) === normalize(result)));
    }
    if (projectionsMatch && renderMatches) {
      return { cycle, revision, uidHash: actor.uidHash };
    }
    await wait();
  }
  throw new Error(`${shipId} original crew and GM must both observe maintenance cycle ${cycle}, revision ${revision}, with the current rendered step and receipt results.`);
}

/** Stop on the actual source-owned activation; untouched vessels keep their original fate. */
export async function contributeStationReactors({ shipIds, contribute }) {
  for (const shipId of shipIds) {
    const reply = await contribute(shipId);
    assert.equal(reply.type, 'candidate-action-result'); assert.equal(reply.status, 'committed');
    assert.equal(reply.code, 'P'); assert.equal(reply.action, 'contribute-reactor');
    if (reply.outcome === 'activated') return reply;
    assert.equal(reply.outcome, undefined, 'Only the current Station activation reply ends Reactor contributions.');
  }
  throw new Error('The actual contributions did not produce Station activation.');
}
