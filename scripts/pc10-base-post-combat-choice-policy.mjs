import { createHash } from 'node:crypto';

export const BASE_MISSION_ROLE_PRIORITY = Object.freeze([
  'wing-commander', 'shepherd-scientist', 'quellon-explorer',
]);

const BASE_SHIP_IDS = new Set(['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124']);
const BASE_SHIP_ROLE_ORDER = Object.freeze({
  aegis: Object.freeze(['executive-officer', 'admiral']),
  dione: Object.freeze(['dione-engineer', 'dione-captain']),
  icebreaker: Object.freeze(['icebreaker-engineer', 'icebreaker-captain']),
  shepherd: Object.freeze(['shepherd-engineer', 'shepherd-captain']),
  quellon: Object.freeze(['quellon-engineer', 'quellon-captain']),
  'refinery-124': Object.freeze(['refinery-124-engineer', 'refinery-124-captain']),
});
const KNOWN_BASE_MISSION_CARRIERS = new Set([
  'starlight', 'highwall', 'endeavour', 'hummingbird', 'pdf-escort-fighter-wing', 'boa',
]);
const BASE_SCOUT_ENTITLEMENTS = Object.freeze({
  'wing-commander': Object.freeze({ entitlementId: 'starlight', anchorShipId: 'aegis' }),
  'quellon-explorer': Object.freeze({ entitlementId: 'hummingbird', anchorShipId: 'quellon' }),
});

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmpty(value) {
  return typeof value === 'string' && value.length > 0;
}

function uniqueStrings(value) {
  return Array.isArray(value) && value.every(nonEmpty) && new Set(value).size === value.length;
}

function roleEntries(roster, roleId) {
  return Array.isArray(roster) ? roster.filter(actor => actor?.roleId === roleId) : [];
}

function uidHash(uid) {
  return createHash('sha256').update(uid).digest('hex').slice(0, 16);
}

/** The same Base role-to-ship relationship used by the current crew-access source. */
export function baseShipForRole(roleId) {
  if (!nonEmpty(roleId)) return undefined;
  if (['admiral', 'executive-officer', 'wing-commander'].includes(roleId)) return 'aegis';
  if (roleId === 'press-officer' || roleId.startsWith('joint-engineering-')) return undefined;
  const shipId = roleId.startsWith('refinery-124-') ? 'refinery-124' : roleId.split('-')[0];
  return BASE_SHIP_IDS.has(shipId) ? shipId : undefined;
}

/** Candidate roles are the existing ship engineer/captain pair, in printed helper order. */
export function baseShipRoleCandidates({ roster, activeRoleIds, shipId } = {}) {
  const preference = BASE_SHIP_ROLE_ORDER[shipId];
  if (!preference || !Array.isArray(roster) || !uniqueStrings(activeRoleIds)) return [];
  return preference.filter(roleId => {
    const matches = roleEntries(roster, roleId);
    return matches.length === 1 && nonEmpty(matches[0]?.uidHash) && activeRoleIds.includes(roleId) &&
      baseShipForRole(roleId) === shipId;
  });
}

/** Fail closed unless each action still belongs to the original live GM and original current actor. */
export function assessLiveBaseAction({ sessionId, expectedCycle, shipId, roleId, expectedGroupId,
  sourceGm, originalGm, currentSession, ship, originalActor, currentActor, requireConsole = false } = {}) {
  const blockers = [];
  const block = code => { if (!blockers.includes(code)) blockers.push(code); };
  if (!nonEmpty(sessionId) || !Number.isSafeInteger(expectedCycle) || expectedCycle < 1) block('invalid-current-cycle');
  if (!BASE_SHIP_IDS.has(shipId) || baseShipForRole(roleId) !== shipId) block('role-does-not-own-current-hull');
  if (!isRecord(originalGm) || !nonEmpty(originalGm.uidHash) || !nonEmpty(originalGm.instanceId) ||
      originalGm.sessionId !== sessionId || originalGm.playerRole !== 'gm') block('original-gm-identity-missing');
  if (!isRecord(sourceGm) || sourceGm.sessionId !== sessionId ||
      sourceGm.uidHash !== originalGm?.uidHash || sourceGm.instanceId !== originalGm?.instanceId ||
      sourceGm.playerRole !== 'gm' || sourceGm.gmInstanceOwned !== true) block('original-gm-instance-not-current');
  if (sourceGm?.phase !== 'active' || sourceGm?.cycle !== expectedCycle ||
      sourceGm?.connection !== 'live' || sourceGm?.freshness !== 'server') block('original-gm-not-live-at-current-cycle');
  if (!isRecord(currentSession) || currentSession.sessionId !== sessionId || currentSession.phase !== 'active' ||
      currentSession.currentTurn !== expectedCycle || currentSession.live !== true ||
      !uniqueStrings(currentSession.activeRoleIds) || !currentSession.activeRoleIds.includes(roleId)) {
    block('current-server-session-or-role-mismatch');
  }
  if (!Array.isArray(currentSession?.activeVesselIds) || !currentSession.activeVesselIds.includes(shipId)) {
    block('hull-not-in-current-active-vessel-projection');
  }
  if (!isRecord(ship) || ship.shipId !== shipId || ship.currentTurn !== expectedCycle ||
      !isRecord(ship.damage) || ship.damage.destroyed !== false) block('hull-not-current-and-undestroyed');
  if (!isRecord(originalActor) || originalActor.roleId !== roleId || !nonEmpty(originalActor.uidHash)) {
    block('original-role-account-missing');
  }
  if (!isRecord(currentActor) || currentActor.sessionId !== sessionId || currentActor.meSessionId !== sessionId ||
      currentActor.uidHash !== originalActor?.uidHash || currentActor.hasAuth !== true || currentActor.sameActor !== true ||
      currentActor.profileRoleId !== roleId || currentActor.playerRole !== 'player' ||
      currentActor.assignedRoleId !== roleId || currentActor.replacementRoleId != null ||
      currentActor.replacementStatus != null || currentActor.escapeLocked !== false || currentActor.connected !== true ||
      currentActor.connection !== 'live' || currentActor.freshness !== 'server' || !nonEmpty(currentActor.fleetGroupId)) {
    block('original-actor-not-current-live-and-assigned');
  }
  if (expectedGroupId !== undefined && currentActor?.fleetGroupId !== expectedGroupId) {
    block('original-actor-not-in-current-opportunity-group');
  }
  if (requireConsole && currentActor?.activeConsoleRoleId !== roleId) block('original-role-console-not-current');
  return { status: blockers.length ? 'pending' : 'eligible', blockers };
}

/** Select only a same-hull candidate proven by the caller against this cycle's current source view. */
export function chooseAvailableBaseShipRole({ candidates, readinessByRoleId, expectedCycle } = {}) {
  if (!Array.isArray(candidates) || !isRecord(readinessByRoleId)) {
    return { status: 'pending', roleId: null, blockers: ['current-role-readiness-missing'] };
  }
  const blockers = [];
  for (const roleId of candidates) {
    const readiness = readinessByRoleId[roleId];
    if (readiness?.status !== 'eligible' || expectedCycle !== undefined && readiness.cycle !== expectedCycle) {
      blockers.push(...(Array.isArray(readiness?.blockers) ? readiness.blockers : ['current-role-not-eligible']));
      continue;
    }
    return { status: 'eligible', roleId, blockers: [] };
  }
  return { status: 'pending', roleId: null, blockers: [...new Set(blockers.length ? blockers : ['no-current-original-ship-role'])] };
}

/** Use only exact labels painted by the current mission panel and exact original role actors. */
export function selectBaseMissionTeam({ opportunity, mountedParticipantLabels, roster, activeRoleIds,
  readinessByRoleId, maxParticipants = 3 } = {}) {
  const groupId = opportunity?.groupId;
  if (!/^fleet-[1-9][0-9]*$/.test(groupId ?? '') || !Array.isArray(mountedParticipantLabels) ||
      !uniqueStrings(activeRoleIds) || !Array.isArray(roster) || !isRecord(readinessByRoleId) ||
      !Number.isSafeInteger(maxParticipants) || maxParticipants < 1 || maxParticipants > 3) {
    return { status: 'pending', participantRoleIds: [] };
  }
  const mountedCandidates = [];
  for (const [rosterIndex, actor] of roster.entries()) {
    const roleId = actor?.roleId;
    if (!nonEmpty(roleId) || baseShipForRole(roleId) === undefined || roleEntries(roster, roleId).length !== 1 ||
        !nonEmpty(actor.displayName) || !nonEmpty(actor.uidHash) || !activeRoleIds.includes(roleId)) continue;
    const label = `${actor.displayName} // ${roleId}`;
    if (mountedParticipantLabels.filter(value => value === label).length !== 1) continue;
    const readiness = readinessByRoleId[roleId];
    if (readiness?.status !== 'eligible' || readiness?.fleetGroupId !== groupId ||
        readiness?.actorUidHash !== actor.uidHash || !Number.isSafeInteger(readiness?.cycle) || readiness.cycle < 1) continue;
    mountedCandidates.push({ roleId, rosterIndex });
  }
  const priority = new Map(BASE_MISSION_ROLE_PRIORITY.map((roleId, index) => [roleId, index]));
  mountedCandidates.sort((a, b) => (priority.get(a.roleId) ?? BASE_MISSION_ROLE_PRIORITY.length) -
    (priority.get(b.roleId) ?? BASE_MISSION_ROLE_PRIORITY.length) || a.rosterIndex - b.rosterIndex);
  const participantRoleIds = mountedCandidates.slice(0, maxParticipants).map(value => value.roleId);
  if (participantRoleIds.length === 0) return { status: 'pending', participantRoleIds: [] };
  return { status: 'ready', participantRoleIds,
    missionLeaderRoleId: participantRoleIds[0] };
}

/** Accept only the server's exact pending scout request for the selected original craft owner. */
export function validateBaseScoutRequestReceipt({ receipt, sessionId, expectedCycle, roleId, targetCoordinate } = {}) {
  const fail = () => { throw new Error('Base scout request receipt does not match the current source choice.'); };
  const entitlement = BASE_SCOUT_ENTITLEMENTS[roleId];
  if (!isRecord(receipt) || !entitlement || !nonEmpty(sessionId) || !Number.isSafeInteger(expectedCycle) ||
      expectedCycle < 1 || !/^\d{4}$/.test(targetCoordinate ?? '') ||
      !['requested', 'replayed'].includes(receipt.status) || receipt.resolution !== 'pending' ||
      !nonEmpty(receipt.requestId) || receipt.sessionId !== sessionId || receipt.cycle !== expectedCycle ||
      receipt.entitlementId !== entitlement.entitlementId || receipt.source !== 'craft' ||
      receipt.ownerRoleId !== roleId || receipt.anchorShipId !== entitlement.anchorShipId ||
      !BASE_SHIP_IDS.has(receipt.receivingShipId) || receipt.targetCoordinate !== targetCoordinate) fail();
  return { status: 'committed', requestId: receipt.requestId, cycle: expectedCycle, roleId,
    entitlementId: entitlement.entitlementId, anchorShipId: entitlement.anchorShipId, targetCoordinate };
}

const BASE_MISSION_SHUTTLE_OWNERS = Object.freeze([
  Object.freeze({ roleId: 'wing-commander', craftId: 'starlight' }),
  Object.freeze({ roleId: 'icebreaker-miner', craftId: 'highwall' }),
  Object.freeze({ roleId: 'shepherd-scientist', craftId: 'endeavour' }),
  Object.freeze({ roleId: 'quellon-explorer', craftId: 'hummingbird' }),
]);

/** Check the exact current source shuttle carrier facts before the mounted deal. */
export function selectCurrentBaseMissionCarriers({ opportunity, currentSession, navigationRead, fleetGroupRead, roster,
  readinessByRoleId, departureByCraftId, retainedShuttles } = {}) {
  const blockers = [];
  const block = code => { if (!blockers.includes(code)) blockers.push(code); };
  const groupId = opportunity?.groupId;
  if (!isRecord(opportunity) || !nonEmpty(opportunity.id) || !/^fleet-[1-9][0-9]*$/.test(groupId ?? '') ||
      !['A', 'B', 'C'].includes(opportunity.chart) || !/^\d{4}$/.test(opportunity.coordinate ?? '') ||
      !nonEmpty(opportunity.sourceShipId) || !nonEmpty(opportunity.sourceTransitionId) ||
      !Number.isSafeInteger(opportunity.sourceCycle) || opportunity.sourceCycle < 1) block('current-source-opportunity-malformed');
  if (!isRecord(currentSession) || !nonEmpty(currentSession.sessionId) || currentSession.phase !== 'active' ||
      currentSession.live !== true || !Number.isSafeInteger(currentSession.currentTurn) ||
      currentSession.currentTurn < opportunity?.sourceCycle || !uniqueStrings(currentSession.activeRoleIds) ||
      !Array.isArray(currentSession.activeVesselIds) || !isRecord(currentSession.shipFleetGroupIds) ||
      !Array.isArray(currentSession.shuttleDockings) || !isRecord(currentSession.shuttleControl)) {
    block('current-server-session-projection-missing');
  }
  if (!isRecord(navigationRead) || navigationRead.status !== 'ok' || navigationRead.fromCache !== false ||
      navigationRead.hasPendingWrites !== false || !isRecord(navigationRead.value) ||
      !Number.isSafeInteger(navigationRead.value.revision) || navigationRead.value.revision < 0 ||
      !isRecord(navigationRead.value.shipGalacticCoordinates)) block('current-server-navigation-read-missing');
  if (!isRecord(fleetGroupRead) || fleetGroupRead.status !== 'ok' || fleetGroupRead.fromCache !== false ||
      fleetGroupRead.hasPendingWrites !== false || !isRecord(fleetGroupRead.value) ||
      fleetGroupRead.value.id !== groupId || !uniqueStrings(fleetGroupRead.value.vesselIds) ||
      !Array.isArray(fleetGroupRead.value.memberUids) ||
      !fleetGroupRead.value.memberUids.every(nonEmpty) ||
      new Set(fleetGroupRead.value.memberUids).size !== fleetGroupRead.value.memberUids.length) {
    block('current-server-fleet-group-read-missing');
  }
  if (!Array.isArray(roster) || !isRecord(readinessByRoleId) || !isRecord(departureByCraftId) ||
      !isRecord(retainedShuttles)) block('current-carrier-source-views-missing');
  if (blockers.length) return { status: 'pending', carrierCraftIds: [], blockers };

  const coordinates = navigationRead.value.shipGalacticCoordinates;
  const group = fleetGroupRead.value;
  if (!currentSession.activeVesselIds.includes(opportunity.sourceShipId) ||
      currentSession.shipFleetGroupIds[opportunity.sourceShipId] !== groupId ||
      !group.vesselIds.includes(opportunity.sourceShipId) ||
      coordinates[opportunity.sourceShipId] !== opportunity.coordinate) block('opportunity-source-ship-not-current-in-group');
  const carriers = [];
  for (const { roleId, craftId } of BASE_MISSION_SHUTTLE_OWNERS) {
    if (!currentSession.activeRoleIds.includes(roleId)) continue;
    const actors = roleEntries(roster, roleId);
    const control = currentSession.shuttleControl[craftId];
    if (actors.length !== 1 || !nonEmpty(actors[0]?.uidHash) || !isRecord(control) ||
        control.shuttleId !== craftId || control.ownerRoleId !== roleId || !nonEmpty(control.holderUid) ||
        uidHash(control.holderUid) !== actors[0]?.uidHash) continue;
    const readiness = readinessByRoleId[roleId];
    if (readiness?.status !== 'eligible' || readiness.cycle !== currentSession.currentTurn ||
        readiness.fleetGroupId !== groupId || readiness.actorUidHash !== actors[0].uidHash) continue;
    const dockings = currentSession.shuttleDockings.filter(value => value?.shuttleId === craftId);
    if (dockings.length !== 1) continue;
    const docking = dockings[0];
    if (!isRecord(docking) || !nonEmpty(docking.shipId) || !nonEmpty(docking.dockedAt) ||
        docking.inTransit === true || docking.transit === true || docking.status === 'in-transit' ||
        docking.state === 'in-transit' || docking.dockingState === 'in-transit' ||
        !currentSession.activeVesselIds.includes(docking.shipId) ||
        !group.vesselIds.includes(docking.shipId) || !group.memberUids.includes(control.holderUid) ||
        currentSession.shipFleetGroupIds[docking.shipId] !== groupId ||
        coordinates[docking.shipId] !== opportunity.coordinate ||
        !Object.hasOwn(departureByCraftId, craftId) || departureByCraftId[craftId] !== null ||
        Object.hasOwn(retainedShuttles, craftId)) continue;
    carriers.push(craftId);
  }
  if (carriers.length === 0) block('no-current-original-group-carrier');
  return { status: blockers.length ? 'pending' : 'ready',
    carrierCraftIds: blockers.length ? [] : carriers, blockers };
}

/** Validate the current server-authored mission-start receipt without retaining private actor IDs. */
export function validateBaseMissionStartReceipt({ receipt, opportunity, sessionId, roster,
  participantRoleIds, missionLeaderRoleId } = {}) {
  const fail = message => { throw new Error(message); };
  if (!isRecord(receipt) || !isRecord(opportunity) || receipt.type !== 'away-mission-start-snapshot' ||
      receipt.schemaVersion !== 1 || receipt.sessionId !== sessionId || receipt.id !== opportunity.id ||
      receipt.opportunityId !== opportunity.id || receipt.missionId !== `mission-${opportunity.id}` ||
      receipt.groupId !== opportunity.groupId || receipt.chart !== opportunity.chart ||
      receipt.coordinate !== opportunity.coordinate || receipt.siteCode !== opportunity.siteCode ||
      receipt.sourceShipId !== opportunity.sourceShipId || receipt.sourceTransitionId !== opportunity.sourceTransitionId ||
      receipt.sourceCycle !== opportunity.sourceCycle) fail('Current server mission-start receipt does not match the offered opportunity.');
  const carrierCraftIds = receipt.inputs?.availableCarrierCraftIds;
  if (!Array.isArray(carrierCraftIds) || carrierCraftIds.length === 0 || !uniqueStrings(carrierCraftIds) ||
      carrierCraftIds.some(craftId => !KNOWN_BASE_MISSION_CARRIERS.has(craftId))) {
    fail('Current server mission-start receipt has no valid source carrier.');
  }
  if (!Array.isArray(participantRoleIds) || participantRoleIds.length === 0 ||
      new Set(participantRoleIds).size !== participantRoleIds.length || !Array.isArray(roster)) {
    fail('Current source mission participant selection is invalid.');
  }
  const snapshots = receipt.inputs?.participantSnapshots;
  if (!Array.isArray(snapshots) || snapshots.length !== participantRoleIds.length ||
      snapshots.some(value => !isRecord(value) || !nonEmpty(value.uid) || !nonEmpty(value.roleId))) {
    fail('Current server mission-start receipt has no exact participant snapshots.');
  }
  const snapshotRoleIds = snapshots.map(value => value.roleId);
  if (snapshotRoleIds.length !== participantRoleIds.length ||
      participantRoleIds.some(roleId => snapshotRoleIds.filter(value => value === roleId).length !== 1)) {
    fail('Current server mission-start receipt does not match the mounted participant roles.');
  }
  for (const snapshot of snapshots) {
    const actor = roleEntries(roster, snapshot.roleId);
    if (actor.length !== 1 || actor[0].uidHash !== uidHash(snapshot.uid)) {
      fail('Current server mission-start receipt does not bind to the original role accounts.');
    }
  }
  const leader = receipt.missionLeader;
  const leaderActor = roleEntries(roster, missionLeaderRoleId);
  if (leaderActor.length !== 1 || leader?.roleId !== missionLeaderRoleId || !nonEmpty(leader.uid) ||
      leaderActor[0].uidHash !== uidHash(leader.uid) || receipt.inputs.missionLeaderUid !== leader.uid ||
      !participantRoleIds.includes(missionLeaderRoleId)) {
    fail('Current server mission-start receipt does not bind the selected original Mission Leader.');
  }
  return { status: 'committed', sourceShipId: receipt.sourceShipId, groupId: receipt.groupId,
    sourceCycle: receipt.sourceCycle, carrierCraftIds: [...carrierCraftIds].sort(),
    participantRoleIds: [...snapshotRoleIds], missionLeaderRoleId };
}
