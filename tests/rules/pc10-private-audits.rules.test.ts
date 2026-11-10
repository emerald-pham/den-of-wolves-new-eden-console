import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, it } from 'vitest';

let env: RulesTestEnvironment;
const session = 'sessions/privacy-matrix';
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'dow-pc10-security-rules',
    firestore: { host, port: Number(port), rules: readFileSync('firestore.rules', 'utf8') } });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, session), { phase: 'active', activeVesselIds: ['aegis'], activeRoleIds: ['executive-officer'] });
    for (const [uid, role] of [['alice', 'player'], ['bob', 'player'], ['press', 'player'], ['gm', 'gm']]) {
      await setDoc(doc(db, `${session}/players/${uid}`), { role, connected: true, fleetGroupId: 'fleet-1' });
    }
    for (const path of [
      'serverState/missionDeck', 'deepNebulaScans/scan-1', 'scoutResults/scout-1',
      'playerDiscoveryNotes/alice/notes/note-1', 'intelligenceInvestigationAudits/investigation-1',
      'serverState/awayMission-1', 'wolfActionState/alice',
    ]) await setDoc(doc(db, `${session}/${path}`), { private: 'HIDDEN-ROLL-BONUS-NOTE-DECK' });
    await setDoc(doc(db, `${session}/secrets/loyalty-alice`), { visibleToUids: ['alice'], payload: { type: 'loyalty', kind: 'wolf-agent' } });
    await setDoc(doc(db, `${session}/secrets/wolf-assignment`), { visibleToUids: ['gm'], payload: { private: 'WOLF-IDENTITY' } });
    await setDoc(doc(db, `${session}/awayMissionHands/hand-alice`), { sessionId: 'privacy-matrix', participantUid: 'alice', cards: ['PRIVATE-HAND'] });
    await setDoc(doc(db, `${session}/gmDiscovery/current`), { chart: 'ORGANISER-PRIVATE' });
  });
});
afterAll(async () => { await env?.cleanup(); });

// Rules-fixture proof imported from the PC10 candidate audit matrix (blocks 1-3);
// the audit-collection block depends on rules that main does not have.
describe('PC10 complete private audience denial matrix', () => {
  it('keeps loyalty and hands accessible only to their entitled readers', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertSucceeds(getDoc(doc(alice, `${session}/secrets/loyalty-alice`)));
    await assertSucceeds(getDoc(doc(alice, `${session}/awayMissionHands/hand-alice`)));
    for (const uid of ['bob', 'press', 'outsider']) {
      const db = env.authenticatedContext(uid).firestore();
      await assertFails(getDoc(doc(db, `${session}/secrets/loyalty-alice`)));
      await assertFails(getDoc(doc(db, `${session}/awayMissionHands/hand-alice`)));
    }
    await assertSucceeds(getDoc(doc(env.authenticatedContext('gm').firestore(), `${session}/awayMissionHands/hand-alice`)));
  });

  it('keeps Wolf identity and organiser chart inside the current GM audience', async () => {
    const gm = env.authenticatedContext('gm').firestore();
    for (const path of ['secrets/wolf-assignment', 'gmDiscovery/current']) {
      await assertSucceeds(getDoc(doc(gm, `${session}/${path}`)));
      for (const uid of ['alice', 'bob', 'press', 'outsider']) await assertFails(getDoc(doc(env.authenticatedContext(uid).firestore(), `${session}/${path}`)));
    }
  });

  it('denies raw hidden rolls, bonuses, decks and requester notes to every direct client', async () => {
    for (const uid of ['alice', 'bob', 'press', 'gm', 'outsider']) {
      const db = env.authenticatedContext(uid).firestore();
      for (const path of ['serverState/missionDeck', 'deepNebulaScans/scan-1', 'scoutResults/scout-1',
        'playerDiscoveryNotes/alice/notes/note-1', 'intelligenceInvestigationAudits/investigation-1', 'serverState/awayMission-1', 'wolfActionState/alice']) {
        await assertFails(getDoc(doc(db, `${session}/${path}`)));
        await assertFails(setDoc(doc(db, `${session}/${path}`), { forged: true }));
      }
    }
  });
});
