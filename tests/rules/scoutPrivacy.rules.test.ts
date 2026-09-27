import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, it } from 'vitest';

const [host = '127.0.0.1', port = '8080'] =
  (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'dow-scout-privacy-rules-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host, port: Number(port) },
  });
});

afterAll(async () => { await env?.cleanup(); });

describe('scout private storage rules', () => {
  it.each([
    'scoutRequests/r1',
    'scoutCadence/4-endeavour',
    'scoutResults/r1',
    'scoutResolutionAudits/r1',
    'deepNebulaScans/r1',
    'playerDiscoveryNotes/requester/notes/n1',
  ])('denies reads and writes to %s for requester, peer, and GM clients', async (path) => {
    for (const uid of ['requester', 'peer', 'gm']) {
      const db = env.authenticatedContext(uid).firestore();
      const target = doc(db, `sessions/session-1/${path}`);
      await assertFails(getDoc(target));
      await assertFails(setDoc(target, { type: 'forged' }));
    }
  });
});
