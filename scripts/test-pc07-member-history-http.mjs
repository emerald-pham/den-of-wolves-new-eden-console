import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { createPc07AuthenticatedSession } from './pc07-authenticated-session.mjs';

// Disposable authority fixtures isolate an earlier foreign visit; they do not
// claim that this script performs normal partitioning or normal repair actions.
const f = await createPc07AuthenticatedSession('PC07 current-member history privacy', 12);
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { emptySmallShipState } = require('../functions/lib/smallShip.js');
const { session, sessionId, db, call, ok } = f;
const actor = f.byRole('wing-commander');
try {
  assert.ok(actor, 'A genuine current AEGIS officer is required.');
  const original = (await session.get()).data();
  const groupRef = db.doc(`sessions/${sessionId}/fleetGroups/fleet-1`);
  const group = (await groupRef.get()).data();
  assert.ok(group?.memberShipIds, 'Use actual recorded physical berths.');
  const localShips = ['aegis', 'shepherd'];
  const foreignShips = group.vesselIds.filter(id => !localShips.includes(id));
  const localBerths = Object.fromEntries(Object.entries(group.memberShipIds).filter(([, ship]) => localShips.includes(ship)));
  const foreignBerths = Object.fromEntries(Object.entries(group.memberShipIds).filter(([, ship]) => foreignShips.includes(ship)));
  assert.equal(localBerths[actor.localId], 'aegis');
  assert.equal(Object.keys(localBerths).length + Object.keys(foreignBerths).length, f.players.length);
  const facilitatorUids = group.memberUids.filter(uid => !Object.hasOwn(group.memberShipIds, uid));
  assert.deepEqual(facilitatorUids, [f.gm.localId]);
  const batch = db.batch();
  batch.set(groupRef, { ...group, vesselIds: localShips, memberUids: [...Object.keys(localBerths), ...facilitatorUids], memberShipIds: localBerths });
  batch.set(db.doc(`sessions/${sessionId}/fleetGroups/fleet-2`), {
    ...group, id: 'fleet-2', vesselIds: foreignShips, memberUids: Object.keys(foreignBerths), memberShipIds: foreignBerths,
  });
  for (const uid of Object.keys(foreignBerths)) batch.update(db.doc(`sessions/${sessionId}/players/${uid}`), { fleetGroupId: 'fleet-2' });
  await batch.commit();
  const history = { cycle: 1, revision: 2, hosts: [
    { shipId: 'icebreaker', systemIds: ['storage'] }, { shipId: 'quellon', systemIds: ['reactor'] },
  ] };
  const ledgers = Object.fromEntries(['blacksmithRepairs', 'macawRepairs', 'chacauRepairs', 'philiaRepairs'].map(key => [key, history]));
  ledgers.allyRepairs = { cycle: 1, revision: 2, hosts: [
    { shipId: 'shepherd', systemIds: ['reactor'] }, { shipId: 'icebreaker', systemIds: ['storage'] },
  ] };
  const fixture = {
    ...ledgers, fleetPartitionRevision: 2,
    shuttleDockings: [
      ...original.shuttleDockings.filter(item => !['blacksmith', 'macaw', 'chacau', 'philia', 'ally', 'wobbly'].includes(item.shuttleId)),
      ...['blacksmith', 'macaw', 'chacau', 'philia', 'ally', 'wobbly'].map(shuttleId => ({ shuttleId, shipId: 'shepherd' })),
    ],
    smallShipStates: { ...original.smallShipStates,
      gorgoneion: { ...emptySmallShipState('gorgoneion', 'shepherd'), dockingRevision: 1 },
      warrior: { ...emptySmallShipState('warrior', 'shepherd'), dockingRevision: 1 },
    },
    gorgoneionRepairDrones: { cycle: 1, revision: 1, hostShipId: 'icebreaker', systemId: 'reactor' },
    warriorRepairDrones: { cycle: 1, revision: 1, hostShipId: 'quellon', systemIds: ['storage'] },
    serviceShuttleRecharges: { wobbly: { cycle: 1, revision: 1, hostShipId: 'icebreaker', consoleId: 'jump-drive' } },
  };
  await session.update(fixture);
  const before = (await session.get()).data();
  const projected = ok(await call(actor, 'getCurrentMemberSession', { sessionId }), 'current member read');
  assert.equal(projected.actorUid, actor.localId);
  assert.equal(projected.groupId, 'fleet-1');
  assert.deepEqual(projected.session.turnPhase, JSON.parse(JSON.stringify(before.turnPhase)));
  for (const key of ['blacksmithRepairs', 'macawRepairs', 'chacauRepairs', 'philiaRepairs']) {
    assert.deepEqual(projected.session[key], { cycle: 1, revision: 2, totalHostsUsed: 2, hosts: [] }, key);
  }
  assert.deepEqual(projected.session.allyRepairs, { cycle: 1, revision: 2, totalHostsUsed: 2,
    hosts: [{ shipId: 'shepherd', systemIds: ['reactor'] }] });
  const used = { cycle: 1, revision: 1, redacted: true };
  assert.deepEqual(projected.session.gorgoneionRepairDrones, used);
  assert.deepEqual(projected.session.warriorRepairDrones, used);
  assert.deepEqual(projected.session.serviceShuttleRecharges, { wobbly: used });
  for (const key of ['blacksmithRepairs', 'macawRepairs', 'chacauRepairs', 'philiaRepairs', 'allyRepairs',
    'gorgoneionRepairDrones', 'warriorRepairDrones', 'serviceShuttleRecharges']) {
    assert.equal(JSON.stringify(projected.session[key]).includes('icebreaker'), false);
    assert.equal(JSON.stringify(projected.session[key]).includes('quellon'), false);
  }
  const documentUrl = `http://127.0.0.1:${f.config.firestorePort}/v1/projects/${f.project}/databases/(default)/documents/sessions/${sessionId}`;
  const memberRaw = await fetch(documentUrl, { headers: { Authorization: `Bearer ${actor.idToken}` } });
  assert.equal(memberRaw.status, 403);
  const gmRaw = await fetch(documentUrl, { headers: { Authorization: `Bearer ${f.gm.idToken}` } });
  assert.equal(gmRaw.status, 200);
  const forgedAudience = await call(actor, 'getCurrentMemberSession', { sessionId, groupId: 'fleet-2' });
  assert.equal(forgedAudience.error?.status, 'INVALID_ARGUMENT');
  await db.doc(`sessions/${sessionId}/players/${actor.localId}`).update({ connected: false });
  const disconnected = await call(actor, 'getCurrentMemberSession', { sessionId });
  assert.equal(disconnected.error?.status, 'PERMISSION_DENIED');
  await db.doc(`sessions/${sessionId}/players/${actor.localId}`).update({ connected: true });
  const recovered = ok(await call(actor, 'getCurrentMemberSession', { sessionId }), 'fresh read after reconnect');
  assert.deepEqual(recovered.session.serviceShuttleRecharges, { wobbly: used });
  const after = (await session.get()).data();
  assert.deepEqual(after, before, 'Reads leave the authoritative full ledgers and shared clock unchanged.');
  const evidence = {
    kind: 'normal-authenticated-local-emulator-http-rules-with-disposable-current-group-and-history-fixtures',
    checks: { normalAuthAndRoster12: true, actualPhysicalBerthsRetained: true, actorBoundGroup: true,
      fiveRepairCountersPreserved: true, localAllyDetailPreserved: true, foreignHostAndSystemDetailsWithheld: true,
      droneAndRechargeUsePreserved: true, sharedClockUnchanged: true, authoritativeLedgersUnchanged: true,
      memberRawRootDenied: true, gmRawRootAllowed: true, forgedAudienceDenied: true,
      disconnectedReadDenied: true, reconnectFreshProjection: true },
    fixtureChanges: ['consistent current-group partition and actor group assignment', 'current craft docking',
      'earlier foreign host repair/drone/service histories; includes retained Macaw history without claiming an admission or repair action'],
    normalPartitionAction: false, normalHistoryCreation: false, preparedReviewScene: false, productionGameplay: false,
    identitiesRetained: false, completedAt: new Date().toISOString(),
  };
  assert.ok(process.env.PC07_MEMBER_HISTORY_EVIDENCE_PATH, 'External evidence path required.');
  await writeFile(process.env.PC07_MEMBER_HISTORY_EVIDENCE_PATH, JSON.stringify(evidence, null, 2) + '\n');
  console.log('PC07 authenticated member-history privacy, counters, reconnect and raw Rules proof passed.');
} finally { await f.cleanup(); }
