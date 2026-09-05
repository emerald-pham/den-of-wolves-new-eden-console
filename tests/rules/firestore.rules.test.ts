import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/**
 * Run with: npm run test:rules
 * (that wraps this in `firebase emulators:exec --only firestore`)
 */

const PROJECT_ID = 'dow-new-eden-rules-test';
const SESSION = 'sessions/s1';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, SESSION), {
      name: 'Test table',
      joinCode: 'WOLF',
      phase: 'lobby',
      ownerUid: 'gm1',
    });
    await setDoc(doc(db, `${SESSION}/players/alice`), {
      uid: 'alice',
      role: 'player',
      displayName: 'Alice',
      seatId: null,
    });
    await setDoc(doc(db, `${SESSION}/players/gm1`), {
      uid: 'gm1',
      role: 'gm',
      displayName: 'GM',
      seatId: null,
    });
    await setDoc(doc(db, `${SESSION}/seats/seat1`), {
      label: 'Seat 1',
      status: 'open',
      holderUid: null,
      factionId: null,
    });
    await setDoc(doc(db, `${SESSION}/secrets/sec1`), {
      visibleToUids: ['alice'],
      payload: { hand: ['ace'] },
    });
    await setDoc(doc(db, `${SESSION}/secrets/sec2`), {
      visibleToUids: ['bob'],
      payload: { hand: ['king'] },
    });
  });
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();

describe('session header', () => {
  it('is readable by any signed-in user (so they can find it by code)', async () => {
    await assertSucceeds(getDoc(doc(as('stranger'), SESSION)));
  });

  it('is unreadable when signed out', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), SESSION)));
  });

  it('cannot be phase-changed from the client', async () => {
    await assertFails(updateDoc(doc(as('gm1'), SESSION), { phase: 'active' }));
  });
});

describe('seats', () => {
  it('are readable by members', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), `${SESSION}/seats/seat1`)));
  });

  it('are not readable by non-members', async () => {
    await assertFails(getDoc(doc(as('stranger'), `${SESSION}/seats/seat1`)));
  });

  it('cannot be claimed by writing directly -- claims go through a function', async () => {
    await assertFails(
      updateDoc(doc(as('alice'), `${SESSION}/seats/seat1`), {
        status: 'claimed',
        holderUid: 'alice',
      }),
    );
  });
});

describe('players', () => {
  it('a user may register their own presence as a player', async () => {
    await assertSucceeds(
      setDoc(doc(as('bob'), `${SESSION}/players/bob`), {
        uid: 'bob',
        role: 'player',
        displayName: 'Bob',
        seatId: null,
      }),
    );
  });

  it('a user may not register themselves as gm', async () => {
    await assertFails(
      setDoc(doc(as('bob'), `${SESSION}/players/bob`), {
        uid: 'bob',
        role: 'gm',
        displayName: 'Bob',
        seatId: null,
      }),
    );
  });

  it('a user may not self-elevate to gm afterwards', async () => {
    await assertFails(
      updateDoc(doc(as('alice'), `${SESSION}/players/alice`), { role: 'gm' }),
    );
  });

  it('a user may rename themselves', async () => {
    await assertSucceeds(
      updateDoc(doc(as('alice'), `${SESSION}/players/alice`), {
        displayName: 'Alice B.',
      }),
    );
  });

  it('a user may not write another player document', async () => {
    await assertFails(
      updateDoc(doc(as('alice'), `${SESSION}/players/gm1`), {
        displayName: 'pwned',
      }),
    );
  });
});

describe('secrets', () => {
  it('are readable by a listed player', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), `${SESSION}/secrets/sec1`)));
  });

  it('are not readable by an unlisted player', async () => {
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/secrets/sec2`)));
  });

  it('are readable by the gm', async () => {
    await assertSucceeds(getDoc(doc(as('gm1'), `${SESSION}/secrets/sec2`)));
  });

  it('cannot be written from the client', async () => {
    await assertFails(
      setDoc(doc(as('gm1'), `${SESSION}/secrets/sec3`), {
        visibleToUids: ['gm1'],
        payload: {},
      }),
    );
  });
});
