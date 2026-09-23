import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc,
} from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';

const SESSION = 'endeavour-research-private-state';
const progressPath = `sessions/${SESSION}/serverState/endeavourResearch`;
const cadencePath = `sessions/${SESSION}/serverState/endeavourResearchCadence`;
let env: RulesTestEnvironment;

beforeAll(async () => {
  const [host = '127.0.0.1', port = '8080'] =
    (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
  env = await initializeTestEnvironment({
    projectId: 'dow-new-eden-endeavour-research-privacy-test',
    firestore: { host, port: Number(port), rules: readFileSync('firestore.rules', 'utf8') },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await setDoc(doc(firestore, `sessions/${SESSION}`), {
      phase: 'active', ownerUid: 'gm', name: 'Research privacy test',
    });
    await setDoc(doc(firestore, progressPath), { reactor: 2, jumpDrive: 1 });
    await setDoc(doc(firestore, cadencePath), {
      cycle: 3, revision: 4,
      choices: [
        { trackId: 'reactor', funding: 'standard', oreCost: 0 },
        { trackId: 'jump-drive', funding: 'shepherd-ore', oreCost: 5 },
      ],
    });
  });
});

afterAll(async () => { await env?.cleanup(); });

it.each(['scientist', 'other-player', 'gm'] as const)(
  'keeps private Endeavour progress and cycle cadence unreadable and uneditable by %s', async (uid) => {
    const db = env.authenticatedContext(uid).firestore();
    for (const path of [progressPath, cadencePath]) {
      const reference = doc(db, path);
      await expect(getDoc(reference), path).rejects.toMatchObject({ code: 'permission-denied' });
      await expect(setDoc(reference, { forged: true }), path)
        .rejects.toMatchObject({ code: 'permission-denied' });
      await expect(updateDoc(reference, { forged: true }), path)
        .rejects.toMatchObject({ code: 'permission-denied' });
      await expect(deleteDoc(reference), path).rejects.toMatchObject({ code: 'permission-denied' });
    }
    await expect(getDocs(collection(db, `sessions/${SESSION}/serverState`)))
      .rejects.toMatchObject({ code: 'permission-denied' });
  },
);
