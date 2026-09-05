import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
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
      connected: true,
    });
    await setDoc(doc(db, `${SESSION}/players/gm1`), {
      uid: 'gm1',
      role: 'gm',
      displayName: 'GM',
      seatId: null,
      connected: true,
    });
    await setDoc(doc(db, `${SESSION}/gmInstances/bridge`), {
      uid: 'gm1',
      name: 'Bridge laptop',
      deviceLabel: 'macOS / Chrome',
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
  it('is readable by a session member', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), SESSION)));
  });

  it('is unreadable by a signed-in stranger', async () => {
    await assertFails(getDoc(doc(as('stranger'), SESSION)));
  });

  it('is unreadable by a player who disconnected', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `${SESSION}/players/alice`), { connected: false });
    });
    await assertFails(getDoc(doc(as('alice'), SESSION)));
  });

  it('cannot be listed to enumerate join codes', async () => {
    await assertFails(getDocs(collection(as('stranger'), 'sessions')));
  });

  it('is unreadable when signed out', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), SESSION)));
  });

  it('cannot be phase-changed from the client', async () => {
    await assertFails(updateDoc(doc(as('gm1'), SESSION), { phase: 'active' }));
  });

  // This denial is the whole reason createSession has to be a callable: a
  // client that could write its own session header could mint a join code
  // that collides with someone else's table, and name itself owner.
  it('cannot be created from the client -- creation goes through a function', async () => {
    await assertFails(
      setDoc(doc(as('stranger'), 'sessions/s2'), {
        name: 'Mine',
        joinCode: '1234',
        phase: 'lobby',
        ownerUid: 'stranger',
      }),
    );
  });

  it('cannot be created with someone else named as owner either', async () => {
    await assertFails(
      setDoc(doc(as('stranger'), 'sessions/s3'), {
        name: 'Not mine',
        joinCode: '5678',
        phase: 'lobby',
        ownerUid: 'gm1',
      }),
    );
  });

  it('cannot be deleted from the client', async () => {
    await assertFails(deleteDoc(doc(as('gm1'), SESSION)));
  });
});

// The join-code index is what makes a four-digit code redeemable. It is only
// useful to the server: if a client could read it, ten thousand GETs would
// enumerate every table in existence, and if it could write it, one client
// could point an existing code at a session it controls.
describe('join codes', () => {
  it('cannot be read from the client', async () => {
    await assertFails(getDoc(doc(as('stranger'), 'joinCodes/1234')));
  });

  it('cannot be read by a member of a session either', async () => {
    await assertFails(getDoc(doc(as('alice'), 'joinCodes/1234')));
  });

  it('cannot be written from the client', async () => {
    await assertFails(
      setDoc(doc(as('stranger'), 'joinCodes/1234'), { sessionId: 's1' }),
    );
  });
});

describe('active membership locks', () => {
  it('cannot be read or changed by a client', async () => {
    const lock = doc(as('alice'), 'activeMemberships/alice');
    await assertFails(getDoc(lock));
    await assertFails(setDoc(lock, { sessionId: 's1' }));
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
  it('cannot self-register without redeeming a join code through the callable', async () => {
    await assertFails(
      setDoc(doc(as('bob'), `${SESSION}/players/bob`), {
        uid: 'bob',
        role: 'player',
        displayName: 'Bob',
        seatId: null,
        connected: true,
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

describe('GM instances', () => {
  it('are readable and listable by session members', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), `${SESSION}/gmInstances/bridge`)));
    await assertSucceeds(getDocs(collection(as('alice'), `${SESSION}/gmInstances`)));
  });

  it('are not readable by non-members', async () => {
    await assertFails(getDoc(doc(as('stranger'), `${SESSION}/gmInstances/bridge`)));
    await assertFails(getDocs(collection(as('stranger'), `${SESSION}/gmInstances`)));
  });

  it('cannot be claimed, changed, or released directly by a client', async () => {
    const target = doc(as('alice'), `${SESSION}/gmInstances/rogue`);
    await assertFails(setDoc(target, {
      uid: 'alice', name: 'Rogue browser', deviceLabel: 'Unknown browser',
    }));
    await assertFails(updateDoc(doc(as('gm1'), `${SESSION}/gmInstances/bridge`), {
      name: 'Hijacked',
    }));
    await assertFails(deleteDoc(doc(as('gm1'), `${SESSION}/gmInstances/bridge`)));
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
