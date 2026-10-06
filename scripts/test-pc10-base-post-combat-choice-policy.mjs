import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  BASE_MISSION_ROLE_PRIORITY,
  assessLiveBaseAction,
  baseShipForRole,
  baseShipRoleCandidates,
  chooseAvailableBaseShipRole,
  selectBaseMissionTeam,
  validateBaseMissionStartReceipt,
} from './pc10-base-post-combat-choice-policy.mjs';

const sessionId = 'session-original';
const hashUid = value => createHash('sha256').update(value).digest('hex').slice(0, 16);
const gm = { sessionId, uidHash: 'gm-hash', instanceId: 'owned-gm-instance', gmInstanceOwned: true,
  playerRole: 'gm', phase: 'active', cycle: 2, connection: 'live', freshness: 'server' };
const session = { sessionId, phase: 'active', currentTurn: 2, live: true,
  activeRoleIds: ['shepherd-engineer', 'shepherd-captain', 'shepherd-scientist', 'quellon-explorer', 'wing-commander'],
  activeVesselIds: ['shepherd', 'quellon', 'aegis'],
  ship: { shipId: 'shepherd', currentTurn: 2, damage: { destroyed: false } } };
const roster = [
  { roleId: 'shepherd-engineer', displayName: 'Mara', uidHash: hashUid('private-engineer-uid') },
  { roleId: 'shepherd-captain', displayName: 'Rin', uidHash: hashUid('private-captain-uid') },
  { roleId: 'shepherd-scientist', displayName: 'Sera', uidHash: hashUid('private-scientist-uid') },
  { roleId: 'quellon-explorer', displayName: 'Venn', uidHash: hashUid('private-explorer-uid') },
  { roleId: 'wing-commander', displayName: 'Ivo', uidHash: hashUid('private-leader-uid') },
];
function actor(roleId, changes = {}) {
  const original = roster.find(value => value.roleId === roleId);
  const shipId = baseShipForRole(roleId);
  return { sessionId, meSessionId: sessionId, uidHash: original.uidHash, hasAuth: true, sameActor: true,
    profileRoleId: roleId, playerRole: 'player', assignedRoleId: roleId, activeConsoleRoleId: roleId,
    replacementRoleId: null, replacementStatus: null, escapeLocked: false, connected: true,
    connection: 'live', freshness: 'server', fleetGroupId: 'fleet-1', shipId, ...changes };
}
function eligible(roleId, groupId = 'fleet-1') {
  return { ...assessLiveBaseAction({ sessionId, expectedCycle: 2, shipId: baseShipForRole(roleId), roleId,
    expectedGroupId: groupId, sourceGm: gm, originalGm: gm, currentSession: session,
    ship: { ...session.ship, shipId: baseShipForRole(roleId) }, originalActor: roster.find(value => value.roleId === roleId),
    currentActor: actor(roleId, { fleetGroupId: groupId }) }), cycle: 2, fleetGroupId: groupId,
    actorUidHash: roster.find(value => value.roleId === roleId).uidHash };
}

test('maps only current Base source roles to their printed owning ship', () => {
  assert.equal(baseShipForRole('admiral'), 'aegis');
  assert.equal(baseShipForRole('executive-officer'), 'aegis');
  assert.equal(baseShipForRole('shepherd-scientist'), 'shepherd');
  assert.equal(baseShipForRole('quellon-explorer'), 'quellon');
  assert.equal(baseShipForRole('refinery-124-pdf-colonel'), 'refinery-124');
  assert.equal(baseShipForRole('press-officer'), undefined);
  assert.equal(baseShipForRole('joint-engineering-shepherd-icebreaker'), undefined);
});

test('ship-role candidates stay inside the active original roster and preserve engineer-first source preference', () => {
  assert.deepEqual(baseShipRoleCandidates({ roster, activeRoleIds: session.activeRoleIds, shipId: 'shepherd' }),
    ['shepherd-engineer', 'shepherd-captain']);
  assert.deepEqual(baseShipRoleCandidates({ roster, activeRoleIds: ['shepherd-captain'], shipId: 'shepherd' }),
    ['shepherd-captain']);
  assert.deepEqual(baseShipRoleCandidates({ roster, activeRoleIds: session.activeRoleIds, shipId: 'dione' }), []);
});

test('a live original GM, fresh same-cycle server hull, and current unescaped assigned actor are all required', () => {
  const source = { ...session, ship: session.ship };
  assert.deepEqual(assessLiveBaseAction({ sessionId, expectedCycle: 2, shipId: 'shepherd', roleId: 'shepherd-engineer',
    sourceGm: gm, originalGm: gm, currentSession: source, ship: source.ship,
    originalActor: roster[0], currentActor: actor('shepherd-engineer') }), { status: 'eligible', blockers: [] });
  for (const invalid of [
    { sourceGm: { ...gm, instanceId: 'another-instance' } },
    { sourceGm: { ...gm, gmInstanceOwned: false } },
    { currentSession: { ...source, live: false } },
    { currentSession: { ...source, currentTurn: 3 } },
    { currentSession: { ...source, activeRoleIds: ['shepherd-captain'] } },
    { currentSession: { ...source, activeVesselIds: ['quellon'] } },
    { ship: { ...source.ship, damage: { destroyed: true } } },
    { currentActor: actor('shepherd-engineer', { escapeLocked: true }) },
    { currentActor: actor('shepherd-engineer', { assignedRoleId: 'shepherd-captain' }) },
    { currentActor: actor('shepherd-engineer', { replacementRoleId: 'shepherd-captain' }) },
    { currentActor: actor('shepherd-engineer', { connection: 'offline' }) },
    { currentActor: actor('shepherd-engineer', { uidHash: 'different-original' }) },
  ]) {
    const result = assessLiveBaseAction({ sessionId, expectedCycle: 2, shipId: 'shepherd', roleId: 'shepherd-engineer',
      sourceGm: invalid.sourceGm ?? gm, originalGm: gm, currentSession: invalid.currentSession ?? source,
      ship: invalid.ship ?? source.ship, originalActor: roster[0], currentActor: invalid.currentActor ?? actor('shepherd-engineer') });
    assert.equal(result.status, 'pending');
    assert.ok(result.blockers.length);
  }
});

test('role selection falls back only to a current source-authorized crew role and never caches a prior cycle', () => {
  const candidates = baseShipRoleCandidates({ roster, activeRoleIds: session.activeRoleIds, shipId: 'shepherd' });
  const chosen = chooseAvailableBaseShipRole({ candidates, readinessByRoleId: {
    'shepherd-engineer': { status: 'pending', blockers: ['actor-escaped'] },
    'shepherd-captain': { status: 'eligible', blockers: [] },
  } });
  assert.equal(chosen.roleId, 'shepherd-captain');
  assert.equal(chooseAvailableBaseShipRole({ candidates, readinessByRoleId: {
    'shepherd-engineer': { status: 'eligible', blockers: [] },
    'shepherd-captain': { status: 'eligible', blockers: [] },
  } }).roleId, 'shepherd-engineer');
  assert.equal(chooseAvailableBaseShipRole({ candidates, readinessByRoleId: {
    'shepherd-engineer': { status: 'eligible', blockers: [], cycle: 1 },
    'shepherd-captain': { status: 'pending', blockers: ['hull-destroyed'], cycle: 2 },
  }, expectedCycle: 2 }).status, 'pending');
});

test('mission team choices come only from the mounted group roster and live original appropriate roles', () => {
  const result = selectBaseMissionTeam({
    opportunity: { id: 'arrival-fleet-1-A-1413', groupId: 'fleet-1', chart: 'A', coordinate: '1413',
      sourceShipId: 'shepherd', sourceTransitionId: 'jump-original', sourceCycle: 2 },
    mountedParticipantLabels: ['Ivo // wing-commander', 'Sera // shepherd-scientist', 'Venn // quellon-explorer',
      'Other // refinery-124-engineer'],
    roster,
    activeRoleIds: session.activeRoleIds,
    readinessByRoleId: {
      'wing-commander': eligible('wing-commander'),
      'shepherd-scientist': eligible('shepherd-scientist'),
      'quellon-explorer': eligible('quellon-explorer'),
    },
  });
  assert.deepEqual(result, { status: 'ready', participantRoleIds: [...BASE_MISSION_ROLE_PRIORITY],
    missionLeaderRoleId: 'wing-commander' });
  const blocked = selectBaseMissionTeam({
    opportunity: { groupId: 'fleet-9' }, mountedParticipantLabels: ['Sera // shepherd-scientist'], roster,
    activeRoleIds: session.activeRoleIds,
    readinessByRoleId: { 'shepherd-scientist': { ...eligible('shepherd-scientist'), fleetGroupId: 'fleet-1',
      actorUidHash: roster.find(value => value.roleId === 'shepherd-scientist').uidHash } },
  });
  assert.equal(blocked.status, 'pending');
  assert.deepEqual(blocked.participantRoleIds, []);
  const noInventedRole = selectBaseMissionTeam({
    opportunity: { groupId: 'fleet-1' }, mountedParticipantLabels: ['Unadmitted // wing-commander'], roster,
    activeRoleIds: session.activeRoleIds, readinessByRoleId: { 'wing-commander': eligible('wing-commander') },
  });
  assert.equal(noInventedRole.status, 'pending');
});

test('mission carrier and participant acceptance requires the exact server source receipt and emits only safe summary fields', () => {
  const opportunity = { id: 'arrival-fleet-1-A-1413', groupId: 'fleet-1', chart: 'A', coordinate: '1413',
    siteCode: 'D', sourceShipId: 'shepherd', sourceTransitionId: 'jump-original', sourceCycle: 2 };
  const receipt = { id: opportunity.id, type: 'away-mission-start-snapshot', schemaVersion: 1,
    sessionId, opportunityId: opportunity.id, missionId: `mission-${opportunity.id}`,
    groupId: opportunity.groupId, chart: opportunity.chart, coordinate: opportunity.coordinate, siteCode: opportunity.siteCode,
    sourceShipId: opportunity.sourceShipId, sourceTransitionId: opportunity.sourceTransitionId, sourceCycle: opportunity.sourceCycle,
    missionLeader: { uid: 'private-leader-uid', roleId: 'wing-commander' },
    inputs: { missionLeaderUid: 'private-leader-uid', availableCarrierCraftIds: ['endeavour', 'hummingbird'],
      participantSnapshots: [
        { uid: 'private-leader-uid', roleId: 'wing-commander' },
        { uid: 'private-scientist-uid', roleId: 'shepherd-scientist' },
        { uid: 'private-explorer-uid', roleId: 'quellon-explorer' },
      ] } };
  const summary = validateBaseMissionStartReceipt({ receipt, opportunity, sessionId, roster,
    participantRoleIds: BASE_MISSION_ROLE_PRIORITY, missionLeaderRoleId: 'wing-commander' });
  assert.deepEqual(summary, { status: 'committed', sourceShipId: 'shepherd', groupId: 'fleet-1',
    sourceCycle: 2, carrierCraftIds: ['endeavour', 'hummingbird'],
    participantRoleIds: [...BASE_MISSION_ROLE_PRIORITY], missionLeaderRoleId: 'wing-commander' });
  assert.equal(JSON.stringify(summary).includes('private-'), false);
  assert.throws(() => validateBaseMissionStartReceipt({ receipt: { ...receipt, inputs: {
    ...receipt.inputs, availableCarrierCraftIds: [] } }, opportunity, sessionId, roster,
    participantRoleIds: BASE_MISSION_ROLE_PRIORITY, missionLeaderRoleId: 'wing-commander' }), /carrier/i);
  assert.throws(() => validateBaseMissionStartReceipt({ receipt, opportunity: { ...opportunity, groupId: 'fleet-2' },
    sessionId, roster, participantRoleIds: BASE_MISSION_ROLE_PRIORITY, missionLeaderRoleId: 'wing-commander' }), /opportunity/i);
});

test('selection policy is tied to mounted and server source contracts', async () => {
  const read = path => readFile(new URL(path, import.meta.url), 'utf8');
  const [crewAccess, shipProjection, missionPanel, missionCallable, missionCraft] = await Promise.all([
    read('../functions/src/crewAccess.ts'), read('../src/lib/shipStateProjection.ts'),
    read('../src/components/AwayMissionStartPanel.tsx'), read('../functions/src/index.ts'),
    read('../functions/src/awayMissionCards.ts'),
  ]);
  assert.match(crewAccess, /\['admiral', 'executive-officer', 'wing-commander'\]\.includes\(roleId\).*return 'aegis'/s);
  assert.match(crewAccess, /roleId\.startsWith\('refinery-124-'\) \? 'refinery-124' : roleId\.split\('-'\)\[0\]/);
  assert.match(shipProjection, /const damage = damageState\(session\.shipDamage\?\.\[shipId\]\)/);
  assert.match(shipProjection, /typeof raw\.destroyed !== 'boolean'/);
  assert.match(missionPanel, /player\.connected !== true.*player\.fleetGroupId !== selectedOpportunity\.groupId/s);
  assert.match(missionPanel, /activeRoleIds\.has\(player\.assignedRoleId\)/);
  assert.match(missionPanel, /Newly reached \{selectedOpportunity\.siteCode\} location from \{selectedOpportunity\.sourceShipId\}/);
  assert.match(missionCallable, /opportunityGroup\.vesselIds\.includes\(docking\.shipId\)/);
  assert.match(missionCallable, /currentNavigation\.shipGalacticCoordinates\[docking\.shipId\] !== opportunity\.coordinate/);
  assert.match(missionCallable, /The opportunity group has no currently usable source-authorized craft at this location/);
  assert.match(missionCallable, /availableCarrierCraftIds: \[\.\.\.carrierCraftIds\]/);
  assert.match(missionCraft, /'shepherd-scientist': \['endeavour'\]/);
  assert.match(missionCraft, /'quellon-explorer': \['hummingbird'\]/);
});
