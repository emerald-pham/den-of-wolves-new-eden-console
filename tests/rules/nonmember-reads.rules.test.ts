import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';

// Populated records ensure denial cannot pass merely because a document is absent.
// Include the server-only records and nested histories as well as player views.
const records = [
  'players/member', 'gmInstances/current', 'gmInstances/current/private/grant',
  'seats/bridge', 'secrets/outsider', 'awayMissionHands/current',
  'awayMissionHandPointers/current', 'vipHands/outsider', 'roleBriefs/outsider',
  'commissarPurgeState/current', 'commissarPurgeAuthority/outsider',
  'wolfCultIntelligence/current', 'wolfCultIntelligence/current/audit/request',
  'wolfCultIntelligenceAuthority/current', 'arbourVisions/current',
  'arbourVisions/current/audit/request', 'arbourVisionAuthority/current',
  'facilitatorRuleCalls/gm-current', 'facilitatorRuleCalls/player-current',
  'hummingbirdHarvests/outsider', 'hummingbirdHarvestRequests/request',
  'replacementEligibility/outsider', 'replacementEligibility/outsider/audit/request',
  'replacementAssignments/current', 'replacementAssignments/current/audit/request',
  'loyaltyCensus/current', 'loyaltyCensus/current/audit/request',
  'wolfAttackWindow/current', 'wolfAttackWindow/current/audit/request',
  'wolfAttackPreparation/current', 'wolfAttackPreparation/current/audit/request',
  'wolfAttackState/current', 'wolfAttackState/current/audit/request',
  'crisisReports/current', 'civilUnrestGrievances/icebreaker',
  'civilUnrestGrievances/icebreaker/audit/request', 'civilUnrestPublic/current',
  'crisisState/current', 'crisisState/current/audit/request',
  'zealotryResponses/current', 'zealotryResponses/history-request',
  'zealotryResponses/audit-request', 'serverState/current',
  'civilUnrestResolutions/current', 'civilUnrestResolutions/history-request',
  'civilUnrestResolutions/audit-request',
  'serverState/current/private/hidden', 'playerDiscoveries/outsider',
  'gmDiscovery/current', 'events/event', 'loyaltyAssignmentRequests/request',
  'commandReceipts/request', 'maintenanceRequests/request',
  'maintenanceRollbackRequests/request', 'smallShipRequests/request',
  'presenceReconciliations/u1',
  'fighterWingCountRequests/request', 'damageDraws/draw', 'shipConfetti/icebreaker',
  'unrecognizedCollection/current',
] as const;
const sessionPath = 'sessions/protected-table';
let env: RulesTestEnvironment;

beforeAll(async () => {
  const [host = '127.0.0.1', port = '8080'] =
    (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
  env = await initializeTestEnvironment({
    projectId: 'dow-new-eden-nonmember-rules-test',
    firestore: { host, port: Number(port), rules: readFileSync('firestore.rules', 'utf8') },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, sessionPath), { name: 'Protected table', ownerUid: 'gm', phase: 'active' });
    await Promise.all(records.map((path) => setDoc(doc(db, `${sessionPath}/${path}`), {
      sessionId: 'protected-table', uid: 'outsider', ownerUid: 'outsider', recipientUid: 'outsider',
      connected: true, role: 'player', fleetGroupId: 'fleet-1', revision: 1,
      crisisId: 'civil-unrest', crisisKind: 'civil-unrest', state: 'debated',
      visibility: 'public', text: 'Existing protected record',
    })));
    await setDoc(doc(db, `${sessionPath}/players/gm`), { connected: true, role: 'gm' });
    await setDoc(doc(db, `${sessionPath}/players/disconnected`), { connected: false, role: 'gm' });
    await setDoc(doc(db, 'sessions/other-table/players/outsider'), { connected: true, role: 'gm' });
  });
});

afterAll(async () => { await env?.cleanup(); });

it('keeps permitted member and facilitator reads available as positive controls', async () => {
  const member = env.authenticatedContext('member').firestore();
  const gm = env.authenticatedContext('gm').firestore();
  expect((await getDoc(doc(member, sessionPath))).exists()).toBe(true);
  expect((await getDoc(doc(member, `${sessionPath}/crisisReports/current`))).exists()).toBe(true);
  expect((await getDoc(doc(gm, `${sessionPath}/crisisState/current`))).exists()).toBe(true);
});

it.each(['signed-out', 'other-table-gm', 'disconnected-gm'] as const)(
  'denies document reads and collection enumeration to %s', async (identity) => {
    const db = identity === 'signed-out' ? env.unauthenticatedContext().firestore()
      : env.authenticatedContext(identity === 'other-table-gm' ? 'outsider' : 'disconnected').firestore();
    const paths = [sessionPath, ...records.map((path) => `${sessionPath}/${path}`)];
    for (const path of paths) {
      await expect(getDoc(doc(db, path)), path).rejects.toMatchObject({ code: 'permission-denied' });
    }
    const collections = new Set(paths.map((path) => path.slice(0, path.lastIndexOf('/'))));
    for (const path of collections) {
      await expect(getDocs(collection(db, path)), path).rejects.toMatchObject({ code: 'permission-denied' });
    }
  },
);

it.each(['member', 'gm'] as const)('denies direct gameplay mutations even to a connected %s', async (uid) => {
  const db = env.authenticatedContext(uid).firestore();
  const paths = [sessionPath, ...records.map((path) => `${sessionPath}/${path}`)];
  for (const path of paths) {
    await expect(setDoc(doc(db, path), { forgedOutcome: 'client decision' }, { merge: true }), path)
      .rejects.toMatchObject({ code: 'permission-denied' });
    await expect(deleteDoc(doc(db, path)), path)
      .rejects.toMatchObject({ code: 'permission-denied' });
  }
  const collections = new Set(paths.map((path) => path.slice(0, path.lastIndexOf('/'))));
  for (const path of collections) {
    await expect(setDoc(doc(db, `${path}/client-created`), {
      sessionId: 'protected-table', ownerUid: uid, actorUid: uid, revision: 1,
    }), path).rejects.toMatchObject({ code: 'permission-denied' });
  }
});

it('allows a connected player to edit their own display name but not gameplay authority', async () => {
  const db = env.authenticatedContext('member').firestore();
  const player = doc(db, `${sessionPath}/players/member`);
  await updateDoc(player, { displayName: 'Updated callsign' });
  expect((await getDoc(player)).get('displayName')).toBe('Updated callsign');
  for (const patch of [
    { role: 'gm' }, { assignedRoleId: 'president' }, { seatId: 'bridge' },
    { fleetGroupId: 'other-fleet' }, { connected: false },
  ]) {
    await expect(updateDoc(player, patch)).rejects.toMatchObject({ code: 'permission-denied' });
  }
});
