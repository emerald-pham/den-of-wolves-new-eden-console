import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  selectBaseMissionTeam,
  selectCurrentBaseMissionCarriers,
} from './pc10-base-post-combat-choice-policy.mjs';

const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 16);
const roster = [
  { roleId: 'dione-captain', displayName: 'Mara', uidHash: hash('mara') },
  { roleId: 'shepherd-scientist', displayName: 'Sera', uidHash: hash('sera') },
];
const opportunity = { id: 'arrival-fleet-4-A-1413', groupId: 'fleet-4', chart: 'A', coordinate: '1413',
  siteCode: 'D', sourceShipId: 'shepherd', sourceTransitionId: 'jump-current', sourceCycle: 2 };
const currentSession = { sessionId: 'session-current', phase: 'active', currentTurn: 2, live: true,
  activeRoleIds: ['dione-captain', 'shepherd-scientist'], activeVesselIds: ['dione', 'shepherd'],
  shipFleetGroupIds: { dione: 'fleet-4', shepherd: 'fleet-4' },
  shipGalacticCoordinates: { dione: '1413', shepherd: '1413' },
  shuttleDockings: [{ shuttleId: 'endeavour', shipId: 'shepherd', dockedAt: 'cycle-1' }],
  shuttleControl: { endeavour: { shuttleId: 'endeavour', ownerRoleId: 'shepherd-scientist', holderUid: 'sera' } } };
const readiness = {
  'dione-captain': { status: 'eligible', cycle: 2, fleetGroupId: 'fleet-4', actorUidHash: hash('mara') },
  'shepherd-scientist': { status: 'eligible', cycle: 2, fleetGroupId: 'fleet-4', actorUidHash: hash('sera') },
};

test('mission participants come from the current mounted group labels, with only current original actors selected', () => {
  const result = selectBaseMissionTeam({ opportunity,
    mountedParticipantLabels: ['Mara // dione-captain', 'Sera // shepherd-scientist'],
    roster, activeRoleIds: currentSession.activeRoleIds, readinessByRoleId: readiness, maxParticipants: 2 });
  assert.deepEqual(result, { status: 'ready', participantRoleIds: ['shepherd-scientist', 'dione-captain'],
    missionLeaderRoleId: 'shepherd-scientist' });
  const duplicate = selectBaseMissionTeam({ opportunity,
    mountedParticipantLabels: ['Mara // dione-captain', 'Sera // shepherd-scientist', 'Mara // dione-captain'],
    roster, activeRoleIds: currentSession.activeRoleIds, readinessByRoleId: readiness, maxParticipants: 2 });
  assert.deepEqual(duplicate.participantRoleIds, ['shepherd-scientist']);
  assert.equal(selectBaseMissionTeam({ opportunity, mountedParticipantLabels: ['Mara // dione-captain'], roster,
    activeRoleIds: currentSession.activeRoleIds,
    readinessByRoleId: { 'dione-captain': { ...readiness['dione-captain'], fleetGroupId: 'fleet-3' } } }).status, 'pending');
});

function carrierInput(changes = {}) {
  return { opportunity, currentSession, navigationRead: { status: 'ok', fromCache: false, hasPendingWrites: false,
    value: { revision: 19, shipGalacticCoordinates: currentSession.shipGalacticCoordinates } },
    fleetGroupRead: { status: 'ok', fromCache: false, hasPendingWrites: false,
      value: { id: 'fleet-4', vesselIds: ['dione', 'shepherd'], memberUids: ['sera'] } },
    roster, readinessByRoleId: readiness,
    departureByCraftId: { endeavour: null }, retainedShuttles: {},
    ...changes };
}

test('mission carrier eligibility is bound to current server navigation, group, original holder and docked source craft', () => {
  assert.deepEqual(selectCurrentBaseMissionCarriers(carrierInput()), {
    status: 'ready', carrierCraftIds: ['endeavour'], blockers: [],
  });
  for (const change of [
    { navigationRead: { status: 'ok', fromCache: true, hasPendingWrites: false,
      value: { revision: 19, shipGalacticCoordinates: currentSession.shipGalacticCoordinates } } },
    { navigationRead: { status: 'ok', fromCache: false, hasPendingWrites: false,
      value: { revision: 19, shipGalacticCoordinates: { ...currentSession.shipGalacticCoordinates, shepherd: '0000' } } } },
    { currentSession: { ...currentSession, shipFleetGroupIds: { ...currentSession.shipFleetGroupIds, shepherd: 'fleet-3' } } },
    { fleetGroupRead: { status: 'ok', fromCache: false, hasPendingWrites: false,
      value: { id: 'fleet-4', vesselIds: ['dione', 'shepherd'], memberUids: ['different-current-member'] } } },
    { currentSession: { ...currentSession, activeVesselIds: ['dione'] } },
    { currentSession: { ...currentSession, shuttleDockings: [
      ...currentSession.shuttleDockings, { shuttleId: 'endeavour', shipId: 'shepherd', dockedAt: 'duplicate' },
    ] } },
    { currentSession: { ...currentSession, shuttleControl: { endeavour: { ...currentSession.shuttleControl.endeavour,
      holderUid: 'another-original' } } } },
    { departureByCraftId: { endeavour: { status: 'in-transit' } } },
    { retainedShuttles: { endeavour: { status: 'retained' } } },
    { readinessByRoleId: { ...readiness, 'shepherd-scientist': { status: 'pending', blockers: ['actor-escaped'] } } },
  ]) {
    const blocked = selectCurrentBaseMissionCarriers(carrierInput(change));
    assert.equal(blocked.status, 'pending');
    assert.deepEqual(blocked.carrierCraftIds, []);
    assert.ok(blocked.blockers.length > 0);
  }
});
