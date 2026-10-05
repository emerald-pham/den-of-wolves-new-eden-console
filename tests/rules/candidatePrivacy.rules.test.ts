import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, it } from 'vitest';
const [host = '127.0.0.1', port = '8080'] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
let env: RulesTestEnvironment;
const paths = ['serverState/candidates', 'serverState/candidateStationLiberations', 'candidateActionReceipts/request1',
  'candidateCalculationAudits/request1', 'deepNebulaScans/request1'];
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'dow-candidate-privacy-rules-test',
    firestore: { host, port: Number(port), rules: readFileSync('firestore.rules', 'utf8') } });
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'sessions/session1'), { phase: 'active', ownerUid: 'gm' });
    for (const uid of ['actor', 'peer', 'gm']) await setDoc(doc(db, `sessions/session1/players/${uid}`), {
      uid, sessionId: 'session1', role: uid === 'gm' ? 'gm' : 'player', connected: true, fleetGroupId: 'fleet-1' });
    for (const path of paths) await setDoc(doc(db, `sessions/session1/${path}`), { privateCalculation: 'retained' });
  });
});
afterAll(async () => { await env?.cleanup(); });
it.each(paths)('requires authenticated callable authority instead of raw client access to %s', async path => {
  for (const uid of ['actor', 'peer', 'gm']) {
    const db = env.authenticatedContext(uid).firestore();
    await assertFails(getDoc(doc(db, `sessions/session1/${path}`)));
    await assertFails(getDocs(collection(db, `sessions/session1/${path.split('/')[0]}`)));
    await assertFails(setDoc(doc(db, `sessions/session1/${path}`), { outcome: 'forged' }));
  }
});
