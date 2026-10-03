import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createPc07AuthenticatedSession } from './pc07-authenticated-session.mjs';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { ROLE_OWNED_CRAFT_CATALOG } = require('../functions/lib/craftOwnership.js');
function expectedAttackCraftIds(activeRoleIds, enabledUnionCraftIds = []) {
  const active = new Set(activeRoleIds);
  const enabledUnion = new Set(enabledUnionCraftIds);
  return ROLE_OWNED_CRAFT_CATALOG.filter(craft =>
    (craft.ownerRoleId === 'press-officer' || active.has(craft.ownerRoleId)) &&
    (craft.enabledMode === 'standard' || enabledUnion.has(craft.id)))
    .map(craft => craft.id).sort();
}
const rolesByHost = {
  aegis: ['admiral', 'executive-officer', 'wing-commander'],
  dione: ['dione-captain', 'dione-engineer', 'dione-president'],
  icebreaker: ['icebreaker-captain', 'icebreaker-engineer', 'icebreaker-miner'],
  capybara: ['capybara-captain', 'capybara-recycler'],
  shepherd: ['shepherd-captain', 'shepherd-engineer', 'shepherd-scientist'],
  quellon: ['quellon-captain', 'quellon-engineer', 'quellon-explorer'],
  'refinery-124': ['refinery-124-captain', 'refinery-124-engineer', 'refinery-124-pdf-colonel'],
};
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


async function runUnionScenario() {
  const { recommendedRoleIds } = require('../functions/lib/roleConfiguration.js');
  const activeRoleIds = [...recommendedRoleIds(8)];
  const u = await createPc07AuthenticatedSession('PC08 authenticated Union craft travel', 8, {
    activeRoleIdsOverride: activeRoleIds,
    unionCraftStartingHosts: { wobbly: 'quellon', ally: 'shepherd' },
    keepAlive: true,
  });
  const navigationRef = u.db.doc('sessions/' + u.sessionId + '/serverState/navigation');
  const unionActions = [];
  const unionChecks = {};
  async function command(actor, name, data = {}) {
    const reply = await u.call(actor, name, { sessionId: u.sessionId, ...data });
    const result = u.ok(reply, name);
    assert.notEqual(result?.status, 'stale', name + ' returned stale authority.');
    unionActions.push({ name, status: result?.status ?? 'committed' });
    return result;
  }
  async function denied(actor, name, data = {}) {
    const reply = await u.call(actor, name, { sessionId: u.sessionId, ...data });
    assert.notEqual(reply.status, 200, name + ' must be denied.');
    assert.ok(['FAILED_PRECONDITION', 'PERMISSION_DENIED', 'INVALID_ARGUMENT'].includes(reply.error.status),
      name + ' returned an unexpected denial.');
    return reply;
  }
  async function hostOf(actor) {
    const player = await u.db.doc('sessions/' + u.sessionId + '/players/' + actor.localId).get();
    const group = await u.db.doc('sessions/' + u.sessionId + '/fleetGroups/' + player.get('fleetGroupId')).get();
    return group.get('memberShipIds')?.[actor.localId] ?? null;
  }
  async function dockingHost(shuttleId) {
    const current = (await u.session.get()).get('shuttleDockings') ?? [];
    const matches = current.filter(docking => docking.shuttleId === shuttleId);
    assert.equal(matches.length, 1, shuttleId + ' must have exactly one current docking.');
    return matches[0].shipId;
  }
  async function sample(actor) {
    const player = await u.db.doc('sessions/' + u.sessionId + '/players/' + actor.localId).get();
    const navigation = await navigationRef.get();
    const projection = await command(actor, 'readFleetGroupNavigation', {
      requestId: randomUUID(), expectedGroupId: player.get('fleetGroupId'),
      expectedNavigationRevision: navigation.get('revision'),
      expectedFleetPartitionRevision: (await u.session.get()).get('fleetPartitionRevision') ?? 0,
    });
    assert.equal(projection.groupId, player.get('fleetGroupId'));
    return projection;
  }
  async function launch(actor, shuttleId, destinationShipId) {
    const current = (await u.session.get()).data();
    const control = current.shuttleControl[shuttleId];
    assert.equal(control.holderUid, actor.localId, shuttleId + ' is held by its authenticated current owner.');
    const requestId = randomUUID();
    const request = await command(actor, 'requestShuttleDeparture', {
      requestId, shuttleId, destinationShipId,
      expectedControlRevision: control.revision, expectedCycle: current.currentTurn,
    });
    assert.equal(request.status, 'requested');
    await command(actor, 'beginShuttleTransit', {
      requestId: randomUUID(), shuttleId, expectedDepartureRequestId: requestId,
      expectedControlRevision: control.revision, expectedCycle: current.currentTurn,
    });
  }
  async function waitForArrival(shuttleIds) {
    const deadline = Date.now() + 150000;
    while (Date.now() < deadline) {
      const ready = await Promise.all(shuttleIds.map(async shuttleId => {
        const route = await u.db.doc('sessions/' + u.sessionId + '/shuttleDepartures/' + shuttleId).get();
        return route.exists && Date.now() >= Date.parse(route.get('arrivesAt'));
      }));
      if (ready.every(Boolean)) return;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error('The authoritative Union shuttle routes did not reach their destinations.');
  }
  async function complete(actor, shuttleId) {
    const route = await u.db.doc('sessions/' + u.sessionId + '/shuttleDepartures/' + shuttleId).get();
    const control = (await u.session.get()).get('shuttleControl')[shuttleId];
    const request = { shuttleId, transitRequestId: route.get('transitRequestId'),
      expectedControlRevision: control.revision };
    assert.equal((await command(actor, 'completeShuttleArrival', request)).status, 'arrived');
    assert.equal((await command(actor, 'completeShuttleArrival', request)).status, 'replayed');
  }

  try {
    assert.deepEqual(u.roles, activeRoleIds,
      'The scenario uses the printed legal eight-player preset with both J.E.U. roles.');
    assert.deepEqual(u.unionCraftSetupProof.map(row => [row.craftId, row.hostShipId, row.firstStatus,
      row.replayStatus, row.staleHostDenied]), [
      ['wobbly', 'quellon', 'committed', 'committed', true],
      ['ally', 'shepherd', 'committed', 'committed', true],
    ]);
    const startingHosts = { wobbly: 'quellon', ally: 'shepherd' };
    const counterpartHosts = { wobbly: 'refinery-124', ally: 'icebreaker' };
    const otherPairHosts = { wobbly: 'shepherd', ally: 'quellon' };
    const counterpartRoles = { wobbly: 'refinery-124-pdf-colonel', ally: 'icebreaker-miner' };
    const ownerRoles = { wobbly: 'joint-engineering-quellon-refinery', ally: 'joint-engineering-shepherd-icebreaker' };
    const craftIds = ['wobbly', 'ally'];
    const start = (await u.session.get()).data();
    for (const shuttleId of craftIds) {
      const owner = u.byRole(ownerRoles[shuttleId]);
      assert.equal(start.shuttleControl[shuttleId].holderUid, owner.localId,
        shuttleId + ' starts with the authoritative paired Union role holder.');
      assert.equal(await dockingHost(shuttleId), startingHosts[shuttleId]);
    }
    const startedSample = await sample(u.byRole('wing-commander'));
    const expectedUnionWings = expectedFighterWingRows(activeRoleIds, startedSample.ships);
    assert.deepEqual(startedSample.dockedFighterWings, expectedUnionWings,
      'Nonzero fighter wings appear only at their printed host in the current group.');
    for (const shuttleId of craftIds) {
      assert.ok(startedSample.dockedShuttles.some(row => row.shuttleId === shuttleId &&
        row.hostShipId === startingHosts[shuttleId] && row.fleetGroupId === startedSample.groupId));
    }
    unionChecks.legalEightPlayerUnionHostsAndGroupLocalStartingProjection = true;

    const phase = start.turnPhase;
    await u.session.update({ turnPhase: { ...phase,
      teamPhaseEndsAt: new Date(Date.now() - 1000).toISOString(),
      openAirspaceEndsAt: new Date(Date.now() + 600000).toISOString(),
    } });
    await command(u.byRole('wing-commander'), 'beginOpenAirspacePhase', { expectedTurn: start.currentTurn });
    for (const shuttleId of craftIds) {
      const owner = u.byRole(ownerRoles[shuttleId]);
      const control = (await u.session.get()).get('shuttleControl')[shuttleId];
      await denied(owner, 'requestShuttleDeparture', {
        requestId: randomUUID(), shuttleId, destinationShipId: otherPairHosts[shuttleId],
        expectedControlRevision: control.revision, expectedCycle: start.currentTurn,
      });
    }
    unionChecks.bothUnionShuttlesDenyTravelOutsideTheirPrintedPair = true;

    for (const shuttleId of craftIds) {
      await launch(u.byRole(ownerRoles[shuttleId]), shuttleId, counterpartHosts[shuttleId]);
      const control = (await u.session.get()).get('shuttleControl')[shuttleId];
      const route = await u.db.doc('sessions/' + u.sessionId + '/shuttleDepartures/' + shuttleId).get();
      await denied(u.byRole(ownerRoles[shuttleId]), 'retargetShuttleTransit', {
        requestId: randomUUID(), shuttleId, transitRequestId: route.get('transitRequestId'),
        destinationShipId: otherPairHosts[shuttleId], expectedControlRevision: control.revision,
        expectedCycle: start.currentTurn,
      });
    }
    const inFlight = await sample(u.byRole('wing-commander'));
    assert.deepEqual(inFlight.transits.map(row => row.shuttleId).sort(), craftIds.slice().sort());
    assert.ok(inFlight.transits.every(row => row.fleetGroupId === inFlight.groupId &&
      row.sampledAt === inFlight.sampledAt));
    assert.ok(!inFlight.transits.some(row => Object.hasOwn(row, 'originShipId') ||
      Object.hasOwn(row, 'holderUid') || Object.hasOwn(row, 'ownerUid')));
    unionChecks.bothUnionShuttlesUseAuthoritativePairBoundTransitAndRedactedSamples = true;

    await waitForArrival(craftIds);
    for (const shuttleId of craftIds) await complete(u.byRole(ownerRoles[shuttleId]), shuttleId);
    const docked = await sample(u.byRole('wing-commander'));
    assert.equal(docked.transits.length, 0);
    for (const shuttleId of craftIds) {
      assert.ok(docked.dockedShuttles.some(row => row.shuttleId === shuttleId &&
        row.hostShipId === counterpartHosts[shuttleId]));
    }
    unionChecks.bothUnionArrivalsCommitOnceAtPairHostAndRetireTransit = true;

    for (const shuttleId of craftIds) {
      const owner = u.byRole(ownerRoles[shuttleId]);
      const counterpart = u.byRole(counterpartRoles[shuttleId]);
      const disallowed = u.byRole(shuttleId === 'wobbly' ? 'icebreaker-miner' : 'refinery-124-pdf-colonel');
      let current = (await u.session.get()).get('shuttleControl')[shuttleId];
      const invalidHandoff = { requestId: randomUUID(), shuttleId, action: 'handoff',
        targetUid: disallowed.localId, expectedRevision: current.revision };
      await denied(owner, 'transferShuttleControlCommand', invalidHandoff);
      const handoff = { requestId: randomUUID(), shuttleId, action: 'handoff',
        targetUid: counterpart.localId, expectedRevision: current.revision };
      const moved = await command(owner, 'transferShuttleControlCommand', handoff);
      assert.equal(moved.status, 'committed');
      assert.equal(await dockingHost(shuttleId), counterpartHosts[shuttleId]);
      assert.equal((await command(owner, 'transferShuttleControlCommand', handoff)).status, 'replayed');
      current = (await u.session.get()).get('shuttleControl')[shuttleId];
      assert.equal(current.holderUid, counterpart.localId);
      await launch(counterpart, shuttleId, startingHosts[shuttleId]);
    }
    await waitForArrival(craftIds);
    for (const shuttleId of craftIds) await complete(u.byRole(counterpartRoles[shuttleId]), shuttleId);
    for (const shuttleId of craftIds) {
      const owner = u.byRole(ownerRoles[shuttleId]);
      const current = (await u.session.get()).get('shuttleControl')[shuttleId];
      await command(owner, 'transferShuttleControlCommand', {
        requestId: randomUUID(), shuttleId, action: 'reclaim', expectedRevision: current.revision,
      });
      assert.equal((await u.session.get()).get('shuttleControl')[shuttleId].holderUid, owner.localId);
      assert.equal(await dockingHost(shuttleId), startingHosts[shuttleId]);
    }
    unionChecks.transfereePerformsPairedReturnTravelAndOwnerReclaimsBothCraft = true;

    const reconnectingOwner = u.byRole(ownerRoles.wobbly);
    const due = await command(u.gm, 'setWolfAttackWindow', { instanceId: u.instanceId,
      requestId: randomUUID(), expectedRevision: 0, status: 'due' });
    assert.equal(due.status, 'due');
    const preparation = await command(u.gm, 'stageWolfAttackPreparation', { instanceId: u.instanceId,
      requestId: randomUUID(), expectedRevision: 0, turn: 1,
      shipIds: [...Array(10).fill('wolf-fighter-wing'), ...Array(5).fill('wolf-assault-transport')],
      targetMode: 'pre-rolled', targetAssignments: [], modifiers: [], notes: '' });
    const declaration = await command(u.gm, 'declareWolfAttack', { instanceId: u.instanceId,
      requestId: randomUUID(), expectedRevision: preparation.revision });
    const attackState = (await u.db.doc('sessions/' + u.sessionId + '/wolfAttackState/current').get()).data();
    const unionCraftIds = u.unionCraftSetupProof.map(row => row.craftId);
    const expectedParked = expectedAttackCraftIds(activeRoleIds, unionCraftIds);
    assert.equal(declaration.airspaceLocked, true);
    assert.deepEqual(attackState.parkedCraftIds.slice().sort(), expectedParked,
      'The normal attack declaration parks every enabled craft, including both Union shuttles and all wings.');
    const expectedParkedShuttles = expectedParked.filter(craftId =>
      ROLE_OWNED_CRAFT_CATALOG.some(craft => craft.id === craftId && craft.kind === 'shuttle'));
    assert.deepEqual(attackState.parkedShuttleDockings.map(row => row.shuttleId).sort(), expectedParkedShuttles);
    assert.deepEqual(attackState.battleTableCraftActions.map(row => row.craftId).sort(),
      expectedParked.filter(craftId => ROLE_OWNED_CRAFT_CATALOG.some(craft =>
        craft.id === craftId && craft.wolfAttackRole === 'battle-table')));
    unionChecks.attackParkingIncludesBothUnionShuttlesAndCombatWingsButKeepsWingKind = true;

    await command(reconnectingOwner, 'disconnectFromSession', {});
    await new Promise(resolve => setTimeout(resolve, 300));
    await command(reconnectingOwner, 'resumeSession', {});
    await command(reconnectingOwner, 'refreshPresence', { activeConsoleRoleId: ownerRoles.wobbly });
    const recovered = await sample(reconnectingOwner);
    assert.equal(recovered.transits.length, 0);
    assert.ok(craftIds.every(shuttleId => recovered.dockedShuttles.some(row =>
      row.shuttleId === shuttleId && row.hostShipId === startingHosts[shuttleId])));
    assert.deepEqual(recovered.dockedFighterWings, expectedUnionWings);
    unionChecks.ownerReconnectReadsCurrentUnionAndWingParking = true;

    return {
      kind: 'normal-authenticated-local-emulator-union-shuttle-gameplay',
      activeRoleIds,
      unionCraftSetupProof: u.unionCraftSetupProof,
      unionShuttleIds: craftIds,
      checks: unionChecks,
      actions: unionActions,
      preparedReviewScene: false,
      identitiesRetained: false,
      productionGameplay: false,
    };
  } finally {
    await u.cleanup().catch(error => console.error('Union scenario cleanup failed:', error.message));
  }
}


export { runUnionScenario as runPc08UnionScenario };
