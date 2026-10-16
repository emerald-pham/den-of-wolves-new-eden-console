import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { candidateGameplayTools } from './pc10-candidate-manual-ui-proof.mjs';
import { resolveLiveWolfAttack } from './pc10-live-wolf-attack-ui-proof.mjs';
import { candidateShipRole, contributeStationReactors } from './pc10-candidate-proof-helpers.mjs';
import { rememberProofFailure } from './pc10-proof-failure-evidence.mjs';
import { assertWolfChoiceActor, observeWolfChoiceActor } from './pc10-combat-choice-readiness.mjs';

function remaining(deadlineAt, description) {
  const timeout = deadlineAt - Date.now();
  assert.ok(timeout > 0, `${description} exceeded its original operation deadline.`);
  return timeout;
}

function stationProjection(text) {
  const headers = [...text.matchAll(/(?:^|\n)Cycle (\d+) \/\/ candidate revision (\d+)(?=\n|$)/g)];
  const charges = [...text.matchAll(/(\d+)\/18 charge capacity/g)];
  assert.equal(headers.length, 1, 'The live Station panel must expose one current candidate revision.');
  assert.equal(charges.length, 1, 'The live Station panel must expose one current Reactor capacity.');
  assert.match(text, /Station liberated/, 'A real committed liberation must precede Reactor contribution.');
  return { cycle: Number(headers[0][1]), revision: Number(headers[0][2]), chargeCapacity: Number(charges[0][1]) };
}

function sameStationActor(current, original, { sessionId, roleId }) {
  assertWolfChoiceActor(current, original);
  assert.equal(current.profileSessionId, original.profileSessionId,
    "The original Station actor's profile session must survive reconnect.");
  assert.equal(current.sessionId, sessionId);
  assert.equal(current.profileSessionId, sessionId);
  assert.equal(current.profileRoleId, roleId);
  assert.equal(current.activeConsoleRoleId, roleId);
  assert.equal(current.playerRole, 'player');
  assert.equal(current.phase, 'active');
  assert.equal(current.cycle, original.cycle);
  assert.equal(current.fleetGroupId, original.fleetGroupId);
  assert.ok(Number.isSafeInteger(current.connectionGeneration) && current.connectionGeneration >= 1);
}

function sameStationGmLease(current, original, sessionId) {
  for (const key of ['sessionId', 'uidHash', 'instanceId', 'instanceClaimedAt', 'phase', 'cycle',
    'documentTimeOrigin', 'connectionGeneration', 'identityHydrationRevision'])
    assert.deepEqual(current[key], original[key], `The original GM ${key} must remain bound.`);
  assert.equal(current.sessionId, sessionId);
  assert.equal(current.playerRole, 'gm');
  assert.equal(current.hasAuth, true);
  assert.equal(current.sameActor, true);
  assert.equal(current.gmInstanceOwned, true);
  assert.equal(current.connection, 'live');
  assert.equal(current.freshness, 'server');
}

/** Bind the generic GM observer to its current Auth/store lease, including the claim timestamp. */
async function observeStationGmLease(surface) {
  const before = await surface.observe();
  const source = await surface.page.evaluate(async moduleUrl => {
    const { auth } = await import('/src/lib/firebase.ts');
    const { useSessionStore } = await import(moduleUrl);
    const originalUid = auth().currentUser?.uid;
    const uidHash = originalUid ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
      new TextEncoder().encode(originalUid)))).map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16) : null;
    const snapshot = useSessionStore.getState(), me = snapshot.me, session = snapshot.session, instance = snapshot.gmInstance;
    const currentUid = auth().currentUser?.uid;
    if (currentUid !== originalUid) throw new Error('Original GM Auth UID changed during the current source lease read.');
    return { hasAuth: !!currentUid, sameActor: !!currentUid && me?.uid === currentUid, uidHash,
      sessionId: session?.id ?? null, phase: session?.phase ?? null, cycle: session?.currentTurn ?? null,
      playerRole: me?.role ?? null, instanceId: instance?.id ?? null,
      instanceClaimedAt: instance?.claimedAt ?? null,
      gmInstanceOwned: !!instance && instance.uid === me?.uid && instance.sessionId === session?.id,
      connection: snapshot.connection, freshness: snapshot.sessionSnapshotFreshness,
      documentTimeOrigin: performance.timeOrigin,
      connectionGeneration: me?.connectionGeneration ?? null,
      identityHydrationRevision: snapshot.identityHydrationRevision ?? null };
  }, surface.storeModuleUrl());
  const current = await surface.observe();
  for (const key of ['hasAuth', 'sameActor', 'uidHash', 'sessionId', 'phase', 'cycle', 'playerRole',
    'instanceId', 'gmInstanceOwned', 'connection', 'freshness', 'documentTimeOrigin'])
    assert.deepEqual(current[key], before[key], `The original Station GM ${key} must survive its source lease read.`);
  for (const key of ['hasAuth', 'sameActor', 'uidHash', 'sessionId', 'phase', 'cycle', 'playerRole',
    'instanceId', 'gmInstanceOwned', 'connection', 'freshness', 'documentTimeOrigin'])
    assert.deepEqual(source[key], current[key], `The current Station GM source ${key} must match its authenticated observer.`);
  assert.equal(source.playerRole, 'gm');
  assert.equal(source.gmInstanceOwned, true);
  assert.equal(source.connection, 'live');
  assert.equal(source.freshness, 'server');
  assert.ok(source.instanceId);
  assert.ok(source.instanceClaimedAt);
  assert.ok(Number.isSafeInteger(source.connectionGeneration) && source.connectionGeneration >= 1);
  assert.ok(Number.isSafeInteger(source.identityHydrationRevision) && source.identityHydrationRevision >= 0);
  return { ...current, ...source };
}

/** Recover one real P Reactor action through the mounted exact-retry control after a cold reload. */
export async function recoverStationReactorContribution({ actor, gm, tools, shipId, roleId,
  coordinate, sessionId, liberation, expectActivation = false, deadlineAt }) {
  const deadline = Math.min(Number.isFinite(deadlineAt) ? deadlineAt : Date.now() + 60_000,
    Date.now() + 60_000);
  const panel = actor.page.getByRole('region', { name: 'Candidate preparation and actions', exact: true });
  const before = stationProjection(await panel.innerText({ timeout: remaining(deadline, 'Station contribution observation') }));
  const reactor = panel.getByRole('button', {
    name: new RegExp(`^Cannibalise Reactor \/\/ ${shipId} \/\/ \\d+ capacity$`),
  });
  assert.equal(await reactor.count(), 1, `The actual ${shipId} Reactor control must be unique.`);
  const capacityMatch = (await reactor.textContent()).match(/\/\/ (\d+) capacity$/);
  const capacity = Number(capacityMatch?.[1]);
  assert.ok(Number.isSafeInteger(capacity) && capacity > 0, 'Use the capacity printed by the live Reactor control.');
  assert.equal(expectActivation, before.chargeCapacity + capacity >= 18,
    'Recovery activation expectation must come from the current rendered capacity and Reactor cost.');

  assert.equal(liberation?.pStationRepeat?.status, 'stopped', 'Use the finalized empty-survivor Station attack.');
  assert.ok(typeof liberation.attackId === 'string' && liberation.attackId.length);
  assert.ok(Number.isSafeInteger(liberation.revision) && liberation.revision >= 0);
  assert.ok(typeof liberation.pStationRepeat.sequenceId === 'string' && liberation.pStationRepeat.sequenceId.length);

  const originalActor = await observeWolfChoiceActor(actor);
  assert.equal(originalActor.hasAuth, true); assert.equal(originalActor.sameActor, true);
  assert.equal(originalActor.sessionId, sessionId); assert.equal(originalActor.playerRole, 'player');
  assert.equal(originalActor.profileSessionId, sessionId);
  assert.equal(originalActor.profileRoleId, roleId); assert.equal(originalActor.activeConsoleRoleId, roleId);
  assert.equal(originalActor.connection, 'live'); assert.equal(originalActor.freshness, 'server');
  assert.ok(typeof originalActor.uidHash === 'string' && originalActor.uidHash.length);
  assert.ok(typeof originalActor.fleetGroupId === 'string' && originalActor.fleetGroupId.length);
  assert.equal(originalActor.phase, 'active'); assert.equal(originalActor.cycle, before.cycle);
  assert.ok(Number.isFinite(originalActor.documentTimeOrigin) && originalActor.documentTimeOrigin > 0);
  assert.ok(Number.isSafeInteger(originalActor.connectionGeneration) && originalActor.connectionGeneration >= 1);
  const originalGm = await observeStationGmLease(gm);
  assert.equal(originalGm.sessionId, sessionId); assert.equal(originalGm.playerRole, 'gm');
  assert.equal(originalGm.phase, 'active'); assert.equal(originalGm.cycle, before.cycle);
  assert.equal(originalGm.gmInstanceOwned, true); assert.ok(originalGm.instanceId); assert.ok(originalGm.instanceClaimedAt);
  assert.ok(originalGm.sameActor && originalGm.hasAuth && originalGm.connection === 'live' && originalGm.freshness === 'server');

  const routePattern = '**/us-central1/executeCandidateAction';
  let originalRequest, originalResult, replayRequest, routeFailure;
  const routeHandler = async route => {
    let delegated = false;
    try {
      const request = route.request();
      if (request.method() !== 'POST') { await route.fallback(); delegated = true; return; }
      const data = request.postDataJSON()?.data;
      if (!originalRequest) {
        originalRequest = structuredClone(data);
        assert.deepEqual(Object.keys(originalRequest).sort(),
          ['action', 'code', 'coordinate', 'expectedGroupId', 'expectedRevision', 'requestId', 'sessionId', 'shipId'],
          'Use the original player-owned action payload without outcome, cost or random inputs.');
        assert.equal(originalRequest.sessionId, sessionId);
        assert.equal(originalRequest.code, 'P'); assert.equal(originalRequest.coordinate, coordinate);
        assert.equal(originalRequest.action, 'contribute-reactor'); assert.equal(originalRequest.shipId, shipId);
        assert.equal(originalRequest.expectedGroupId, originalActor.fleetGroupId);
        assert.equal(originalRequest.expectedRevision, before.revision);
        assert.ok(typeof originalRequest.requestId === 'string' && originalRequest.requestId.length);
        const response = await route.fetch({ timeout: remaining(deadline, 'Station committed Reactor request') });
        assert.equal(response.status(), 200, 'The live source callable must commit before its acknowledgement is interrupted.');
        const body = await response.json();
        assert.deepEqual(Object.keys(body ?? {}).sort(), ['result']);
        originalResult = body.result;
        assert.equal(originalResult.type, 'candidate-action-result');
        assert.equal(originalResult.status, 'committed');
        assert.equal(originalResult.sessionId, sessionId); assert.equal(originalResult.requestId, originalRequest.requestId);
        assert.equal(originalResult.revision, before.revision + 1);
        assert.equal(originalResult.code, 'P'); assert.equal(originalResult.action, 'contribute-reactor');
        assert.equal(originalResult.outcome, expectActivation ? 'activated' : undefined);
        assert.match(originalResult.summary, new RegExp(`^${before.chargeCapacity + capacity}\/18 Station charge capacity committed`));
        await route.abort('failed');
        delegated = true;
        return;
      }
      assert.equal(replayRequest, undefined, 'Only one exact UI replay is permitted.');
      assert.deepEqual(data, originalRequest, 'Reconnect must resend the exact original action and request ID.');
      replayRequest = structuredClone(data);
      await route.fallback();
      delegated = true;
    } catch (error) {
      routeFailure ??= error;
    } finally {
      if (!delegated) {
        try { await route.abort('failed'); }
        catch (error) { routeFailure ??= error; }
      }
    }
  };

  let primaryError, routeInstalled = false;
  try {
    await actor.page.route(routePattern, routeHandler);
    routeInstalled = true;
    await reactor.click({ timeout: remaining(deadline, 'Station Reactor action') });
    const retry = panel.getByRole('button', { name: 'Retry original candidate request', exact: true });
    try { await retry.waitFor({ state: 'visible', timeout: remaining(deadline, 'Lost Station receipt recovery control') }); }
    catch (error) { if (routeFailure) throw routeFailure; throw error; }
    if (routeFailure) throw routeFailure;
    assert.ok(originalRequest && originalResult, 'The committed server receipt must be captured before dropping the browser acknowledgement.');

    await actor.page.reload({ timeout: remaining(deadline, 'Station actor cold reload') });
    await actor.until('The same Station crew actor is live after its cold reload', current =>
      current.sessionId === sessionId && current.uidHash === originalActor.uidHash &&
      current.profileRoleId === roleId && current.connection === 'live' && current.freshness === 'server' &&
      current.documentTimeOrigin !== originalActor.documentTimeOrigin,
    remaining(deadline, 'Station actor reconnection'));
    const reloadedActor = await observeWolfChoiceActor(actor);
    sameStationActor(reloadedActor, originalActor, { sessionId, roleId });
    assert.notEqual(reloadedActor.documentTimeOrigin, originalActor.documentTimeOrigin,
      'The proof must cross a real page-document reload.');
    const reloadedGm = await observeStationGmLease(gm);
    sameStationGmLease(reloadedGm, originalGm, sessionId);

    const afterCommit = stationProjection(await panel.innerText({ timeout: remaining(deadline, 'Station committed state after reload') }));
    assert.equal(afterCommit.chargeCapacity, before.chargeCapacity + capacity,
      'The committed Reactor capacity must be visible exactly once after reconnect.');
    assert.equal(afterCommit.revision, originalResult.revision);
    await retry.waitFor({ state: 'visible', timeout: remaining(deadline, 'Original Station retry after reload') });

    let replay;
    try {
      replay = await tools.receipt(actor, 'executeCandidateAction',
        () => retry.click({ timeout: remaining(deadline, 'Original Station UI retry') }),
        { deadlineAt: deadline, expectedRequest: originalRequest });
    } catch (error) { if (routeFailure) throw routeFailure; throw error; }
    if (routeFailure) throw routeFailure;
    assert.deepEqual(replay, { ...originalResult, status: 'replayed' },
      'The same actor must receive the original committed result with replay status.');
    assert.deepEqual(replayRequest, originalRequest);
    assert.equal(replay.revision, afterCommit.revision, 'Exact replay cannot create another candidate revision.');
    await retry.waitFor({ state: 'hidden', timeout: remaining(deadline, 'Station original request receipt clear') });
    const afterReplay = stationProjection(await panel.innerText({ timeout: remaining(deadline, 'Station state after exact replay') }));
    assert.equal(afterReplay.chargeCapacity, afterCommit.chargeCapacity, 'Exact replay cannot spend the Reactor twice.');
    assert.equal(afterReplay.revision, afterCommit.revision, 'Exact replay cannot increment the candidate revision twice.');
    assert.equal(await panel.getByRole('button', {
      name: new RegExp(`^Cannibalise Reactor \/\/ ${shipId} \/\/ \\d+ capacity$`),
    }).count(), 0, 'A committed Reactor cannot remain available for a second contribution.');
    const currentGm = await observeStationGmLease(gm);
    sameStationGmLease(currentGm, originalGm, sessionId);

    await tools.record('actual Station Reactor receipt recovered after same-actor cold reload', {
      sessionId, candidateCode: 'P', coordinate, shipId, roleId,
      actor: { uidHash: originalActor.uidHash, playerRole: originalActor.playerRole,
        profileRoleId: originalActor.profileRoleId, assignedRoleId: originalActor.assignedRoleId,
        profileSessionId: originalActor.profileSessionId, activeConsoleRoleId: originalActor.activeConsoleRoleId,
        phase: originalActor.phase,
        cycle: originalActor.cycle, fleetGroupId: originalActor.fleetGroupId, seatId: originalActor.seatId,
        replacementRoleId: originalActor.replacementRoleId, replacementStatus: originalActor.replacementStatus,
        connectionGenerationBefore: originalActor.connectionGeneration,
        connectionGenerationAfter: reloadedActor.connectionGeneration,
        identityHydrationRevisionBefore: originalActor.identityHydrationRevision,
        identityHydrationRevisionAfter: reloadedActor.identityHydrationRevision,
        documentTimeOriginBefore: originalActor.documentTimeOrigin,
        documentTimeOriginAfter: reloadedActor.documentTimeOrigin,
        documentTimeOriginChanged: reloadedActor.documentTimeOrigin !== originalActor.documentTimeOrigin },
      gmLease: { uidHash: originalGm.uidHash, instanceId: originalGm.instanceId,
        instanceClaimedAt: originalGm.instanceClaimedAt,
        phase: originalGm.phase, cycle: originalGm.cycle, documentTimeOrigin: originalGm.documentTimeOrigin,
        connectionGeneration: originalGm.connectionGeneration,
        identityHydrationRevision: originalGm.identityHydrationRevision,
        sameSession: currentGm.sessionId === originalGm.sessionId, stillOwned: currentGm.gmInstanceOwned === true },
      liberation: { attackId: liberation.attackId, revision: liberation.revision,
        threatSourceId: liberation.threatSourceId ?? null, sequenceId: liberation.pStationRepeat.sequenceId,
        repeatStatus: liberation.pStationRepeat.status },
      request: originalRequest, committedResult: originalResult, replayedResult: replay,
      reactorCapacity: capacity, chargeBefore: before.chargeCapacity, chargeAfterCommit: afterCommit.chargeCapacity,
      candidateRevisionBefore: before.revision, candidateRevisionAfter: afterReplay.revision,
      firstAckDroppedAfterServerCommit: true, repeatedEffect: false,
    });
    // The exact replay was verified and recorded above; the surrounding
    // contribution loop consumes the original server-committed result shape.
    return originalResult;
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (routeInstalled) {
      try { await actor.page.unroute(routePattern, routeHandler); }
      catch (cleanupError) {
        if (primaryError) rememberProofFailure(primaryError, { operation: 'Station Reactor recovery route cleanup', cleanupError });
        else throw cleanupError;
      }
    }
  }
}

/** Fresh source arrival, current audited combat choices, then unique physical Reactors. */
export async function runStationEnding(context) {
  const tools = candidateGameplayTools(context);
  const { gm, crew, directory } = context;
  const start = await tools.begin('P');
  const coordinate = Object.entries(start.organiserSites).find(([, site]) => site.code === 'P')?.[0];
  assert.match(coordinate, /^\d{4}$/);
  await tools.record('entitled live GM chart selected P with the confirmed source roster', {
    candidateCode: 'P', vesselCount: start.activeVesselIds.length, namedRoleCount: context.roster.length });
  const budget = await tools.printedRationBudget(Object.fromEntries(start.activeVesselIds.map(shipId => [shipId, 2])));
  for (const shipId of start.activeVesselIds) {
    for (const [resource, minimum] of [['food', budget[shipId].food], ['water', budget[shipId].water], ['fuel', 20]])
      await tools.gmSupplies(shipId, resource, minimum);
    await tools.maintenanceUi(shipId, candidateShipRole(context.roster, shipId), {
      afterBegin: () => tools.gmRepair(shipId), afterRiot: () => tools.gmRepair(shipId),
    });
  }
  await tools.coordination();
  for (const shipId of start.activeVesselIds) await tools.jump(shipId, coordinate);
  await tools.cycle(2);
  for (const shipId of start.activeVesselIds) await tools.maintenanceUi(shipId, candidateShipRole(context.roster, shipId), {
    consoles: shipId === 'aegis' ? ['Fighter Bay Alpha', 'Fighter Bay Bravo', 'Command and Control', 'Missile Launchers', 'Point Defence Lasers'] : [],
    refuels: shipId === 'icebreaker' ? { 'Shuttle Bay': 'highwall' } : {},
    afterBegin: () => tools.gmRepair(shipId), afterRiot: () => tools.gmRepair(shipId),
  });
  await tools.coordination();
  await tools.select('gm');
  const timing = gm.page.getByRole('region', { name: 'Wolf attack timing controls', exact: true });
  await timing.getByLabel('Target fleet group', { exact: true }).selectOption((await tools.state()).shipFleetGroupIds.aegis);
  const source = timing.getByLabel('Triggered Wolf site', { exact: true });
  const sourceDeadline = Date.now() + 60_000; let sourceId;
  while (Date.now() < sourceDeadline && !sourceId) {
    sourceId = await source.locator('option').evaluateAll(options => options.find(option => !option.disabled && /^P \/\//.test(option.textContent.trim()))?.value);
    if (!sourceId) await delay(200);
  }
  assert.ok(sourceId, 'Actual paid Station arrivals must produce the live GM source option.');
  await source.selectOption(sourceId);
  await tools.receipt(gm, 'setWolfAttackWindow', () => timing.getByRole('button', { name: 'Mark threat source due', exact: true }).click());
  const preparation = gm.page.getByRole('region', { name: 'Private Wolf attack preparation', exact: true });
  await preparation.getByLabel('Battlestation count', { exact: true }).fill('1');
  await preparation.getByLabel('Fleet Strikecarrier count', { exact: true }).fill('4');
  await tools.receipt(gm, 'stageWolfAttackPreparation', () => preparation.getByRole('button', { name: 'Save private attack draft', exact: true }).click());
  await tools.record('actual GM Station source composition', { battlestations: 1, otherDamageCapacity: 20,
    mechanism: 'current source option and normal audited GM draft UI' });
  let waves = 0, liberated = false;
  let liberation;
  while (waves < 12 && !liberated) {
    waves++;
    for (const shipId of start.activeVesselIds) await tools.gmRepair(shipId);
    await tools.gmSupplies('aegis', 'ore', 5);
    await tools.select('gm');
    await tools.receipt(gm, 'declareWolfAttack', () => preparation.getByRole('button', { name: 'Declare Wolf attack', exact: true }).click());
    const current = await resolveLiveWolfAttack(context, { tools });
    assert.ok(['repeat', 'stopped'].includes(current.pStationRepeat?.status), 'Only finalized current source survivors control the repeat.');
    liberated = current.pStationRepeat.status === 'stopped';
    if (liberated) liberation = current;
    await tools.record('actual source Station combat finalized', { wave: waves, liberated,
      survivorCount: current.pStationRepeat.survivors?.length ?? 0,
      mechanism: 'actual source-owned choices and server rolls; no supplied die or survivor roster' });
    await gm.page.screenshot({ path: `${directory}/P-source-wave-${waves}.png` });
  }
  assert.ok(liberated, 'Only zero authoritative Station Wolves permits Reactor contribution.');
  assert.ok(liberation, 'Retain the actual finalized zero-survivor attack for Reactor recovery evidence.');
  for (const shipId of start.activeVesselIds) await tools.gmRepair(shipId);
  let recoveredFirstContribution = false;
  await contributeStationReactors({ shipIds: start.activeVesselIds, contribute: async shipId => {
    const actor = await tools.select(candidateShipRole(context.roster, shipId));
    const panel = actor.page.getByRole('region', { name: 'Candidate preparation and actions', exact: true });
    if (shipId === 'aegis') await tools.candidateGeometry(actor, 'P', 'reactor-choice');
    const button = panel.getByRole('button', { name: new RegExp(`^Cannibalise Reactor \\/\\/ ${shipId} \\/\\/ \\d+ capacity$`) });
    const capacity = Number((await button.textContent()).match(/\/\/ (\d+) capacity$/)?.[1]);
    assert.ok(Number.isSafeInteger(capacity) && capacity > 0, 'Record the actual displayed available Reactor capacity.');
    const before = stationProjection(await panel.innerText());
    const expectActivation = before.chargeCapacity + capacity >= 18;
    const recover = !recoveredFirstContribution || expectActivation;
    const result = recover
      ? await recoverStationReactorContribution({ actor, gm, tools, shipId,
        roleId: candidateShipRole(context.roster, shipId), coordinate, sessionId: start.sessionId,
        liberation, expectActivation, deadlineAt: context.deadlineAt })
      : await tools.receipt(actor, 'executeCandidateAction', () => button.click());
    if (recover) recoveredFirstContribution = true;
    assert.equal(result.outcome, expectActivation ? 'activated' : undefined,
      'Only the source-owned 18-capacity threshold activates Station defences.');
    await tools.record('actual unique Reactor contribution', { shipId, capacity, activated: result.outcome === 'activated',
      interruptedReceiptRecovered: recover, mechanism: 'current available physical Reactor; source permanently consumed' });
    return result;
  } });
  await tools.complete('P');
  assert.equal((await crew.observe()).cycle, 2);
}
