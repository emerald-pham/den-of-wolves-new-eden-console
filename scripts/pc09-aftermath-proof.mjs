import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const DEFAULT_BRANCHES = Object.freeze([
  'doctor', 'warrior-salvage', 'macaw-scrap', 'boa-scrap', 'macaw-repair',
  'press-publication', 'member-audience', 'fighter-build',
]);
const BRANCHES = new Set(DEFAULT_BRANCHES);

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function restValue(value) {
  if (!isRecord(value)) return undefined;
  if (Object.hasOwn(value, 'nullValue')) return null;
  if (Object.hasOwn(value, 'stringValue')) return value.stringValue;
  if (Object.hasOwn(value, 'integerValue')) return Number(value.integerValue);
  if (Object.hasOwn(value, 'doubleValue')) return value.doubleValue;
  if (Object.hasOwn(value, 'booleanValue')) return value.booleanValue;
  if (Object.hasOwn(value, 'timestampValue')) return value.timestampValue;
  if (Object.hasOwn(value, 'referenceValue')) return value.referenceValue;
  if (Object.hasOwn(value, 'bytesValue')) return value.bytesValue;
  if (isRecord(value.mapValue)) return restMap(value.mapValue.fields ?? {});
  if (isRecord(value.arrayValue)) return (value.arrayValue.values ?? []).map(restValue);
  return undefined;
}

function restMap(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, restValue(value)]));
}

function decodeDocument(document) {
  return isRecord(document?.fields) ? restMap(document.fields) : undefined;
}

function documentUrl(f, path) {
  return `http://127.0.0.1:${f.config.firestorePort}/v1/projects/${f.project}/databases/(default)/documents/sessions/${f.sessionId}${path}`;
}

async function authenticatedGet(f, actor, path) {
  assert.ok(actor?.idToken, 'A live authenticated actor token is required for Rules-enforced reads.');
  const response = await fetch(documentUrl(f, path), {
    headers: { Authorization: `Bearer ${actor.idToken}` },
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
  return { status: response.status, body, data: response.ok ? decodeDocument(body) : undefined };
}

async function readPressLog(f, actor) {
  assert.ok(actor?.idToken, 'A live Press actor token is required for the Rules-enforced Press read.');
  const url = `http://127.0.0.1:${f.config.firestorePort}/v1/projects/${f.project}/databases/(default)/documents/sessions/${f.sessionId}:runQuery`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${actor.idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'pressLog' }] } }),
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : []; } catch { body = []; }
  return { status: response.status, rows: Array.isArray(body)
    ? body.flatMap((row) => decodeDocument(row?.document) ?? []) : [] };
}

function failWithBlockers(directory, blockers) {
  const error = new Error(`PC09 aftermath proof has missing ordinary outcomes: ${blockers.map(({ branch, reason }) => `${branch}: ${reason}`).join('; ')}`);
  error.code = 'PC09_ORDINARY_BRANCH_MISSING';
  error.blockers = blockers;
  if (!directory) throw error;
  return mkdir(directory, { recursive: true })
    .then(() => writeFile(join(directory, 'pc09-aftermath-proof.blocked.json'),
      `${JSON.stringify({ status: 'blocked', blockers }, null, 2)}\n`))
    .then(() => { throw error; });
}

function assertCounter(value, label) {
  assert.ok(Number.isSafeInteger(value) && value >= 0, `${label} must be a non-negative integer.`);
  return value;
}

function damageRows(finalState) {
  const rows = finalState?.calculationReceipt?.fleetDamage;
  assert.ok(Array.isArray(rows), 'A complete ordinary combat damage receipt is required.');
  return rows.map((row) => {
    assert.ok(isRecord(row) && typeof row.target === 'string' && isRecord(row.state) &&
      Array.isArray(row.draws), 'The ordinary fleet damage receipt is malformed.');
    assertCounter(row.amount, `${row.target} combat damage`);
    assertCounter(row.populationBefore, `${row.target} initial population`);
    assertCounter(row.population, `${row.target} final population`);
    assert.ok(row.draws.every((draw) => isRecord(draw) && typeof draw.casualty === 'boolean'),
      `${row.target} draw results are malformed.`);
    return row;
  });
}

function currentQualifyingScrapTargets(rows, dockings) {
  const damageByShip = new Map(rows.map((row) => [row.target, row]));
  const dockedByShuttle = new Map(['macaw', 'boa'].map((shuttleId) => {
    const matches = dockings.filter((row) => isRecord(row) && row.shuttleId === shuttleId);
    return [shuttleId, matches.length === 1 ? matches[0].shipId : undefined];
  }));
  const chosen = {};
  for (const shuttleId of ['macaw', 'boa']) {
    const hostId = dockedByShuttle.get(shuttleId);
    const hostRow = damageByShip.get(hostId);
    if (hostRow?.amount >= 3 && hostRow.state.destroyed === false) chosen[shuttleId] = hostId;
  }
  if (chosen.macaw && chosen.boa && chosen.macaw === chosen.boa) {
    const alternative = rows.find((row) => row.target !== chosen.macaw && row.amount >= 3 &&
      row.state.destroyed === false && dockedByShuttle.get('boa') === row.target);
    if (alternative) chosen.boa = alternative.target;
    else delete chosen.boa;
  }
  return chosen;
}

function damagePoints(finalState) {
  const receipt = finalState.calculationReceipt;
  const range = (receipt.ranges ?? []).reduce((sum, item) => {
    assert.ok(isRecord(item?.damageByInstance), 'Warrior range damage receipts are malformed.');
    return sum + Object.values(item.damageByInstance).reduce((count, amount) => count + assertCounter(amount, 'Wolf range damage'), 0);
  }, 0);
  const fleet = damageRows(finalState).reduce((sum, item) => sum + item.amount, 0);
  const fighterAce = (finalState.memberResults ?? []).reduce((sum, row) =>
    row?.sourceId === 'pdf-fighter-ace' && isRecord(row.outcome)
      ? sum + assertCounter(row.outcome.damage, 'Fighter Ace combat damage') : sum, 0);
  return range + fleet + fighterAce;
}

function sameReplyIgnoringStatus(first, replay) {
  const strip = (value) => { const result = { ...value }; delete result.status; return result; };
  assert.deepEqual(strip(replay), strip(first), 'An exact aftermath retry must return the same committed receipt.');
}

async function command(f, actor, name, data) {
  assert.ok(actor?.idToken && actor?.localId, `${name} requires the assigned connected actor.`);
  return f.ok(await f.call(actor, name, { sessionId: f.sessionId, ...data }), name);
}

async function gmStateRead(f, gm) {
  const reply = await authenticatedGet(f, gm, '/wolfAttackState/current');
  assert.equal(reply.status, 200, 'The authenticated GM Rules path must read the private Wolf receipt.');
  assert.ok(reply.data?.status === 'resolved' && isRecord(reply.data.calculationReceipt),
    'The entitled GM document must contain the complete resolved private calculation receipt.');
  return reply.data;
}

async function verifyPressFacts(f, press, attacks) {
  const read = await readPressLog(f, press);
  assert.equal(read.status, 200, 'The Press role must read published survivor facts through Firestore Rules.');
  const expected = attacks.flatMap(({ state, rows }) => rows.filter((row) => row.population !== row.populationBefore)
    .map((row) => ({ sourceId: `wolf-attack:${state.attackId}:${row.target}`, vesselId: row.target,
      fromPopulation: row.populationBefore, toPopulation: row.population })));
  assert.ok(expected.length > 0, 'At least one genuine damage casualty is required for Press aftermath publication.');
  const events = read.rows.filter((row) => row?.type === 'survivor-change' && row?.cause === 'ship-damage');
  for (const fact of expected) assert.ok(events.some((event) => event.sourceId === fact.sourceId &&
    event.vesselId === fact.vesselId && event.fromPopulation === fact.fromPopulation &&
    event.toPopulation === fact.toPopulation), `Press is missing the committed damage survivor fact for ${fact.vesselId}.`);
  const safeFields = new Set(['type', 'sourceId', 'cause', 'vesselId', 'cycle', 'recordedAt', 'fromPopulation', 'toPopulation']);
  for (const event of events.filter(({ sourceId }) => expected.some((fact) => fact.sourceId === sourceId))) {
    assert.ok(Object.keys(event).every((key) => safeFields.has(key)), 'Press aftermath must contain only source-backed public facts.');
  }
  return { count: expected.length, authenticatedPressRead: true, rawWolfDetailsExcluded: true };
}

/**
 * Prove normal, authenticated PC09 consequences after an ordinary attack.
 * `actorAllocations` contains real authenticated actor objects, not uid strings:
 * doctor, warrior, macaw, boa, wingCommander, press, and optionally
 * The separate `advanceNextTeam({ f, attackTurn })` callback owns the caller's ordinary turn/maintenance path.
 * Set `requiredBranches` only when deliberately splitting a bounded proof across
 * distinct normal attacks; omitted means every assigned branch is mandatory.
 */
export async function runPc09AftermathProof(f, { directory, finalState, actorAllocations = {}, advanceNextTeam } = {}) {
  assert.ok(f?.sessionId && f?.session && f?.config?.firestorePort && f?.project,
    'A live authenticated PC09 session fixture is required.');
  assert.ok(isRecord(finalState) && finalState.status === 'resolved' && finalState.currentStep === 'resolved' &&
    typeof finalState.attackId === 'string' && Number.isSafeInteger(finalState.turn),
  'Pass the real final state of one completely resolved ordinary attack.');
  const branches = actorAllocations.requiredBranches ?? DEFAULT_BRANCHES;
  assert.ok(Array.isArray(branches) && branches.length > 0 && branches.every((branch) => BRANCHES.has(branch)),
    `requiredBranches must be a nonempty allowlist of ${[...BRANCHES].join(', ')}.`);
  const requested = new Set(branches);
  const rows = damageRows(finalState);
  const receipt = finalState.calculationReceipt;
  const damageTotal = damagePoints(finalState);
  const sessionBefore = (await f.session.get()).data();
  assert.ok(sessionBefore?.phase === 'active' && sessionBefore.currentTurn === finalState.turn,
    'Aftermath must be resolved before the ordinary cycle advances.');
  const blockers = [];
  const blocker = (branch, reason) => blockers.push({ branch, reason });
  const casualtyCandidates = rows.filter((row) => row.draws.some((draw) => draw.casualty) &&
    row.state.destroyed === false && sessionBefore.shipDamage?.[row.target]?.destroyed !== true);
  const doctorCandidates = casualtyCandidates.filter((row) => {
    const resources = sessionBefore.shipResources?.[row.target];
    return isRecord(resources) && Number.isSafeInteger(resources.food) && resources.food >= 0 &&
      Number.isSafeInteger(resources.water) && resources.water >= 0;
  });
  const freeDoctorShip = doctorCandidates[0];
  const additionalDoctorShip = doctorCandidates.find((row) => row.target !== freeDoctorShip?.target &&
    sessionBefore.shipResources[row.target].food >= 3 && sessionBefore.shipResources[row.target].water >= 3);
  const selectedDoctorShips = [freeDoctorShip, additionalDoctorShip].filter(Boolean).map(({ target }) => target);
  if (requested.has('doctor') && (selectedDoctorShips.length < 2 ||
      !isRecord(actorAllocations.doctor))) {
    blocker('doctor', selectedDoctorShips.length < 2
      ? `needs two distinct live damaged ships with printed casualties and at least 3 food plus 3 water in the additional ship's stores; found ${selectedDoctorShips.length}`
      : 'a connected current Doctor actor is required');
  }
  const warriorState = sessionBefore.smallShipStates?.warrior;
  const warriorReady = isRecord(warriorState) && warriorState.hostShipId &&
    sessionBefore.activeVesselIds?.includes(warriorState.hostShipId) &&
    warriorState.cycle?.turn === finalState.turn && warriorState.cycle?.charges?.includes('salvage-drones') &&
    Number.isSafeInteger(warriorState.unrest) && warriorState.unrest < 8 &&
    warriorState.mutiny?.status !== 'active' && damageTotal > 0;
  if (requested.has('warrior-salvage') && (!warriorReady || !isRecord(actorAllocations.warrior))) {
    blocker('warrior-salvage', !damageTotal
      ? 'the attack has no positive server-recorded Wolf damage points to salvage'
      : 'needs a connected Warrior Captain, normal Warrior admission/docking, current-cycle Salvage Drones charge, and no mutiny');
  }
  const scrapTargets = currentQualifyingScrapTargets(rows, sessionBefore.shuttleDockings ?? []);
  if (requested.has('macaw-scrap') && (!scrapTargets.macaw || !isRecord(actorAllocations.macaw))) {
    blocker('macaw-scrap', 'needs one nondestroyed ship with at least 3 committed damage, uniquely docked to the connected Macaw holder');
  }
  if (requested.has('boa-scrap') && (!scrapTargets.boa || !isRecord(actorAllocations.boa))) {
    blocker('boa-scrap', 'needs a second distinct nondestroyed ship with at least 3 committed damage, uniquely docked to the connected Boa Recycler');
  }
  const repairHostShipId = actorAllocations.repairHostShipId ?? scrapTargets.macaw;
  const repairHostDamage = typeof repairHostShipId === 'string' ? sessionBefore.shipDamage?.[repairHostShipId] : undefined;
  const macawDocksAtRepairHost = (sessionBefore.shuttleDockings ?? []).filter((row) =>
    isRecord(row) && row.shuttleId === 'macaw' && row.shipId === repairHostShipId).length === 1;
  const capybaraScrap = sessionBefore.shipResources?.capybara?.scrap;
  const phase = sessionBefore.turnPhase;
  const repairWindowOpen = isRecord(phase) && isRecord(phase.airspace) && phase.airspace.state === 'lifted' &&
    typeof phase.openAirspaceEndsAt === 'string' && Date.parse(phase.openAirspaceEndsAt) > Date.now();
  if (requested.has('macaw-repair') && (!isRecord(actorAllocations.macaw) || !repairHostDamage ||
      repairHostDamage.destroyed === true || !Array.isArray(repairHostDamage.damagedSystemIds) ||
      repairHostDamage.damagedSystemIds.length === 0 || !macawDocksAtRepairHost ||
      !Number.isSafeInteger(capybaraScrap) || capybaraScrap < 1 || !repairWindowOpen)) {
    blocker('macaw-repair', 'needs an intact damaged host, Macaw uniquely docked there, one Capybara Scrap, and a live Coordination window');
  }
  for (const [branch, actor] of [['press-publication', actorAllocations.press],
    ['member-audience', actorAllocations.wingCommander]]) {
    if (requested.has(branch) && !isRecord(actor)) blocker(branch, 'a connected, Rules-entitled actor is required');
  }
  if (requested.has('press-publication') && !rows.some((row) => row.population !== row.populationBefore)) {
    blocker('press-publication', 'the attack must produce an actual survivor-count change');
  }
  if (requested.has('fighter-build') && typeof advanceNextTeam !== 'function') {
    blocker('fighter-build', 'the root driver must supply its ordinary next-Team transition and charged AEGIS maintenance callback');
  }
  const initialGm = await gmStateRead(f, f.gm);
  assert.equal(initialGm.attackId, finalState.attackId, 'The authenticated GM reader must expose this current attack.');
  assert.deepEqual(initialGm.calculationReceipt, receipt,
    'The authenticated GM reader must expose the complete immutable server receipt, including every card, casualty, and survivor result.');
  assert.ok(Array.isArray(initialGm.calculationReceipt.fleetDamage) &&
    Array.isArray(initialGm.calculationReceipt.ranges) &&
    Array.isArray(initialGm.calculationReceipt.boarding),
  'The authenticated GM receipt must expose its complete ranges, damage cards, and boarding outcomes.');
  for (const row of initialGm.calculationReceipt.fleetDamage) {
    assert.ok(isRecord(row) && Array.isArray(row.draws), 'The GM receipt must retain each damage draw.');
    for (const draw of row.draws) {
      assert.ok(isRecord(draw) && typeof draw.destroyed === 'boolean' && typeof draw.casualty === 'boolean',
        'The GM receipt must retain the complete outcome for every required draw.');
      if (!draw.destroyed) assert.ok(isRecord(draw.card) && typeof draw.card.card === 'string' &&
        typeof draw.card.systemId === 'string' && typeof draw.card.systemName === 'string' &&
        typeof draw.recycled === 'boolean', 'A non-catastrophe GM damage draw must retain its card and recycling result.');
    }
  }
  assert.equal(initialGm.calculationReceipt.survivingWolfShips?.length,
    receipt.survivingWolfShips?.length, 'Finalization must persist every surviving Wolf ship in its immutable receipt.');
  if (blockers.length) return failWithBlockers(directory, blockers);

  const checks = {};
  const committed = {};
  const doctorBefore = structuredClone(sessionBefore);
  const currentAttack = () => f.db.doc(`sessions/${f.sessionId}/wolfAttackState/current`).get();
  let liveState = finalState;

  if (requested.has('doctor')) {
    const actorState = await f.db.doc(`sessions/${f.sessionId}/players/${actorAllocations.doctor.localId}`).get();
    assert.equal(actorState.get('replacementRoleId'), 'doctor', 'The Doctor authority must be a real current replacement.');
    const request = { attackId: finalState.attackId, requestId: randomUUID(), action: 'doctor',
      selectedShipIds: selectedDoctorShips };
    const first = await command(f, actorAllocations.doctor, 'resolveWolfAttackAftermath', request);
    assert.equal(first.status, 'committed');
    assert.deepEqual(first.mitigated.map(({ foodSpent, waterSpent }) => [foodSpent, waterSpent]), [[0, 0], [3, 3]],
      'The first selected ship is free; the additional ship pays the printed 3 food and 3 water.');
    const afterFirst = (await f.session.get()).data();
    const stateAfterFirst = await currentAttack();
    const revisionAfterFirst = stateAfterFirst.get('revision');
    const replay = await command(f, actorAllocations.doctor, 'resolveWolfAttackAftermath', request);
    assert.equal(replay.status, 'replayed');
    sameReplyIgnoringStatus(first, replay);
    assert.equal((await f.session.get()).get('shipSurvivors')[selectedDoctorShips[0]], afterFirst.shipSurvivors[selectedDoctorShips[0]],
      'Exact Doctor replay must not restore a casualty twice.');
    assert.equal((await currentAttack()).get('revision'), revisionAfterFirst, 'Exact Doctor replay must not advance the result revision.');
    const expectedSecond = doctorBefore.shipResources[selectedDoctorShips[1]];
    assert.equal(afterFirst.shipResources[selectedDoctorShips[1]].food, expectedSecond.food - 3);
    assert.equal(afterFirst.shipResources[selectedDoctorShips[1]].water, expectedSecond.water - 3);
    liveState = (await currentAttack()).data();
    committed.doctor = { selectedShipIds: [...selectedDoctorShips], freeFirstTarget: true,
      additionalTargetFoodSpent: 3, additionalTargetWaterSpent: 3, exactReplayNoDoubleSpend: true };
    checks.doctorTwoShipMitigationAndPrintedCost = true;
  }

  if (requested.has('warrior-salvage')) {
    const before = (await f.session.get()).data();
    const beforeMaterials = before.shipResources.aegis.materials;
    const request = { attackId: finalState.attackId, requestId: randomUUID(), action: 'warrior-salvage' };
    const first = await command(f, actorAllocations.warrior, 'resolveWolfAttackAftermath', request);
    assert.equal(first.status, 'committed');
    assert.equal(first.damageDice.length, damageTotal, 'Warrior must roll exactly once per point of committed attack damage.');
    assert.ok(first.damageDice.every((die) => Number.isSafeInteger(die) && die >= 1 && die <= 6),
      'Every Warrior result is a server-owned d6.');
    assert.equal(first.materialsGained, first.damageDice.filter((die) => die >= 5).length);
    const afterFirst = (await f.session.get()).data();
    assert.equal(afterFirst.shipResources.aegis.materials, beforeMaterials + first.materialsGained);
    const revisionAfterFirst = (await currentAttack()).get('revision');
    const replay = await command(f, actorAllocations.warrior, 'resolveWolfAttackAftermath', request);
    assert.equal(replay.status, 'replayed');
    sameReplyIgnoringStatus(first, replay);
    assert.equal((await f.session.get()).get('shipResources').aegis.materials,
      beforeMaterials + first.materialsGained, 'Exact Warrior retry must not pay salvage twice.');
    assert.equal((await currentAttack()).get('revision'), revisionAfterFirst);
    committed.warriorSalvage = { serverDiceCount: first.damageDice.length,
      materialsGained: first.materialsGained, exactReplayNoDoublePay: true };
    checks.warriorOneServerDiePerDamagePoint = true;
  }

  for (const shuttleId of ['macaw', 'boa']) {
    const branch = `${shuttleId}-scrap`;
    if (!requested.has(branch)) continue;
    const actor = actorAllocations[shuttleId];
    const targetShipId = scrapTargets[shuttleId];
    const before = (await f.session.get()).data();
    const beforeCargo = before.shuttleCargo?.[shuttleId]?.scrap ?? 0;
    const request = { attackId: finalState.attackId, requestId: randomUUID(), action: 'collect-scrap',
      shuttleId, targetShipId };
    const first = await command(f, actor, 'resolveWolfAttackAftermath', request);
    assert.equal(first.status, 'committed');
    assert.equal(first.scrapGained, 1, 'Each qualifying ship yields one Scrap for one shuttle.');
    const afterFirst = (await f.session.get()).data();
    assert.equal(afterFirst.shuttleCargo[shuttleId].scrap, beforeCargo + 1);
    const revisionAfterFirst = (await currentAttack()).get('revision');
    const replay = await command(f, actor, 'resolveWolfAttackAftermath', request);
    assert.equal(replay.status, 'replayed');
    sameReplyIgnoringStatus(first, replay);
    assert.equal((await f.session.get()).get('shuttleCargo')[shuttleId].scrap, beforeCargo + 1,
      'Exact Scrap retry must not duplicate cargo.');
    assert.equal((await currentAttack()).get('revision'), revisionAfterFirst);
    committed[branch] = { targetShipId, scrapGained: 1, exactReplayNoDuplicateCargo: true };
    checks[branch] = true;
  }

  if (requested.has('macaw-repair')) {
    const current = (await f.session.get()).data();
    const target = actorAllocations.repairHostShipId ?? repairHostShipId;
    const damaged = current.shipDamage?.[target];
    const systemIds = actorAllocations.repairSystemIds ?? damaged?.damagedSystemIds?.slice(0, 1);
    assert.ok(Array.isArray(systemIds) && systemIds.length === 1 && systemIds.every((id) => damaged.damagedSystemIds.includes(id)),
      'A normal Macaw repair must select one currently damaged console.');
    const request = { requestId: randomUUID(), expectedControlRevision: current.shuttleControl.macaw.revision,
      expectedRepairRevision: current.macawRepairs?.revision ?? 0, expectedCycle: current.currentTurn,
      expectedHostShipId: target, systemIds };
    const beforeScrap = current.shipResources.capybara.scrap;
    const beforeDamage = [...damaged.damagedSystemIds];
    const reply = await command(f, actorAllocations.macaw, 'repairConsolesFromMacaw', request);
    assert.equal(reply.status, 'committed');
    const after = (await f.session.get()).data();
    assert.equal(after.shipResources.capybara.scrap, beforeScrap - 1,
      'The ordinary Macaw repair spends one Capybara Scrap.');
    assert.ok(!after.shipDamage[target].damagedSystemIds.includes(systemIds[0]));
    assert.equal(beforeDamage.length - after.shipDamage[target].damagedSystemIds.length, 1);
    committed.macawRepair = { hostShipId: target, systemIds: [...systemIds], scrapSpent: 1,
      historicalDrawRetained: true, currentPendingDamageCleared: true };
    checks.normalMacawRepairClearsCurrentPendingWork = true;
  }

  if (requested.has('member-audience')) {
    const memberRead = await authenticatedGet(f, actorAllocations.wingCommander, '/wolfAttackAudience/current');
    assert.equal(memberRead.status, 200, 'The connected member must read the allowlisted immediate result projection.');
    const audience = memberRead.data;
    assert.equal(audience?.attackId, finalState.attackId);
    assert.equal(audience?.status, 'resolved');
    const serialized = JSON.stringify(audience);
    assert.ok(!serialized.includes('"instanceId"') && !serialized.includes('"actorUid"') &&
      !serialized.includes('damageDice') && !serialized.includes('"rolls"'),
    'The member projection must omit concrete Wolf identities, actor identities, and hidden dice.');
    if (requested.has('doctor')) assert.ok(audience.results.some((row) => row.sourceId === 'doctor-medical-aid'));
    if (requested.has('warrior-salvage')) assert.ok(audience.results.some((row) => row.sourceId === 'warrior-salvage-drones'));
    if (requested.has('macaw-scrap')) assert.ok(audience.results.some((row) => row.sourceId === 'capybara-scrap-collection-macaw'));
    if (requested.has('boa-scrap')) assert.ok(audience.results.some((row) => row.sourceId === 'capybara-scrap-collection-boa'));
    assert.equal(audience.remainingThreatCount, receipt.survivingWolfShips.length);
    assert.equal(audience.returningThreatCount, receipt.returningInstanceIds.length);
    checks.authenticatedImmediateAudienceHasOnlySafeResults = true;
  }

  if (requested.has('press-publication')) {
    committed.press = await verifyPressFacts(f, actorAllocations.press, [{ state: finalState, rows }]);
    checks.pressReadsRealCasualtyFactsUnderRules = true;
  }

  const memberReader = actorAllocations.wingCommander ?? actorAllocations.doctor ?? actorAllocations.macaw;
  const memberPrivateRead = await authenticatedGet(f, memberReader, '/wolfAttackState/current');
  assert.equal(memberPrivateRead.status, 403, 'An ordinary member must not read the private GM root.');
  const finalGm = await gmStateRead(f, f.gm);
  assert.equal(finalGm.attackId, finalState.attackId);
  if (requested.has('doctor')) assert.ok(isRecord(finalGm.aftermath?.doctor),
    'The private GM receipt must show the committed Doctor selection.');
  if (requested.has('warrior-salvage')) assert.ok(isRecord(finalGm.aftermath?.warriorSalvage),
    'The private GM receipt must show server dice and materials from Warrior salvage.');
  if (requested.has('macaw-scrap') || requested.has('boa-scrap')) {
    assert.ok(isRecord(finalGm.aftermath?.scrapClaims), 'The private GM receipt must show each collected Scrap opportunity.');
    for (const shuttleId of ['macaw', 'boa']) if (requested.has(`${shuttleId}-scrap`)) {
      assert.equal(finalGm.aftermath.scrapClaims[committed[`${shuttleId}-scrap`].targetShipId]?.shuttleId, shuttleId);
    }
  }
  checks.authenticatedGmReadsCompletePrivateReceiptAndMemberDenied = true;
  if (requested.has('macaw-repair')) {
    const gmSession = await authenticatedGet(f, f.gm, '');
    assert.equal(gmSession.status, 200, 'The entitled GM reads current session ship damage through Rules.');
    const currentDamage = gmSession.data?.shipDamage?.[repairHostShipId];
    assert.ok(currentDamage && !currentDamage.damagedSystemIds.includes(committed.macawRepair.systemIds[0]),
      'The GM view source must show the actual repaired current system as no longer pending.');
    const historical = finalGm.calculationReceipt.fleetDamage.find((row) => row.target === repairHostShipId);
    assert.ok(historical, 'The immutable historical damage draw stays in the private attack receipt after repair.');
    checks.historicalDamageAndCurrentRepairStayDistinct = true;
  }

  if (requested.has('fighter-build')) {
    const transitionResult = await advanceNextTeam({ f, attackTurn: finalState.turn });
    assert.notEqual(transitionResult?.status, 'blocked', 'The ordinary next-Team callback must complete.');
    const current = (await f.session.get()).data();
    const { fighterWingCapacity } = createRequire(new URL('../functions/package.json', import.meta.url))('../functions/lib/fighterWings.js');
    const capacity = fighterWingCapacity(current.shipUpgrades);
    assert.equal(current.turnPhase?.turn, current.currentTurn);
    assert.ok(current.currentTurn > finalState.turn, 'Fighter rebuilding must occur on the next ordinary Team cycle.');
    assert.ok(current.maintenanceCycles?.aegis?.charges?.includes('construction-bay'),
      'Normal AEGIS maintenance must charge the Construction Bay this Team cycle.');
    assert.equal(current.shipDamage?.aegis?.destroyed, false);
    assert.ok(!current.shipDamage?.aegis?.damagedSystemIds?.includes('construction-bay'));
    const free = Object.values(current.fighterWingCounts).reduce((sum, wing) => sum + Math.max(0, capacity - wing.count), 0);
    assert.ok(free >= (actorAllocations.reserveUiBuild === false ? 1 : 2),
      'At least one additional legal capacity slot must remain for the real Wing Commander UI build check.');
    const wingId = actorAllocations.buildWingId ?? Object.keys(current.fighterWingCounts)
      .filter((id) => current.fighterWingCounts[id].count < capacity)
      .sort((left, right) => current.fighterWingCounts[left].count - current.fighterWingCounts[right].count)[0];
    assert.ok(wingId && current.fighterWingCounts[wingId].count < capacity,
      'A normal replacement fighter must fit in a printed wing capacity slot.');
    const beforeCount = current.fighterWingCounts[wingId].count;
    const beforeMaterials = current.shipResources.aegis.materials;
    assert.ok(beforeMaterials >= 1, 'AEGIS must have one ordinary construction material available.');
    const request = { requestId: randomUUID(), wingId, expectedRevision: current.vesselActionRevisions.aegis };
    const built = await command(f, actorAllocations.wingCommander, 'buildFighter', request);
    assert.equal(built.status, 'committed');
    const afterBuild = (await f.session.get()).data();
    assert.equal(afterBuild.fighterWingCounts[wingId].count, beforeCount + 1);
    assert.equal(afterBuild.shipResources.aegis.materials, beforeMaterials - 1,
      'A normal fighter replacement spends one construction material.');
    const revision = afterBuild.vesselActionRevisions.aegis;
    const replay = await command(f, actorAllocations.wingCommander, 'buildFighter', request);
    assert.equal(replay.status, 'replayed');
    sameReplyIgnoringStatus(built, replay);
    const afterReplay = (await f.session.get()).data();
    assert.equal(afterReplay.fighterWingCounts[wingId].count, beforeCount + 1);
    assert.equal(afterReplay.shipResources.aegis.materials, beforeMaterials - 1);
    assert.equal(afterReplay.vesselActionRevisions.aegis, revision,
      'Exact fighter-build replay must not build twice or consume another material.');
    committed.fighterBuild = { wingId, countIncreasedBy: 1, materialsSpent: 1,
      nextUiBuildSlotReserved: free >= 2, exactReplayNoDoubleBuild: true };
    checks.nextTeamFighterBuildUsesOneMaterialAndReservesUiCapacity = true;
  }

  const proof = { kind: 'normal-authenticated-pc09-aftermath-http-proof', status: 'complete',
    attackId: finalState.attackId, turn: finalState.turn, requestedBranches: [...requested],
    checks, committed, ordinarySetupAssumptions: {
      noAdminDamageOrReceiptSeeding: true, noGmRepairAll: true, randomCombatOutcomesPreserved: true,
    }, completedAt: new Date().toISOString() };
  if (directory) {
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'pc09-aftermath-proof.json'), `${JSON.stringify(proof, null, 2)}\n`);
  }
  return proof;
}
