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

const [firestoreHost = '127.0.0.1', firestorePort = '8080'] =
  (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: firestoreHost,
      port: Number(firestorePort),
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
    await setDoc(doc(db, `${SESSION}/damageDraws/draw1`), {
      shipId: 'aegis',
      card: '10♥',
      systemId: 'reactor',
      systemName: 'Reactor',
      recycled: false,
    });
  });
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();

describe('app-wide arrival state', () => {
  it('cannot be read or changed directly by a client', async () => {
    const state = doc(as('alice'), 'appState/arrival');

    await assertFails(getDoc(state));
    await assertFails(setDoc(state, { survivorPopulation: 222_501 }));
  });
});

describe('session header', () => {
  it('keeps damage card draws GM-only and denies every client write', async () => {
    const playerDraw = doc(as('alice'), `${SESSION}/damageDraws/draw1`);
    const gmDraw = doc(as('gm1'), `${SESSION}/damageDraws/draw1`);

    await assertFails(getDoc(playerDraw));
    await assertSucceeds(getDoc(gmDraw));
    await assertFails(setDoc(gmDraw, { card: 'A♠' }));
  });

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

  it('cannot change the GM registration and Setup lock from the client', async () => {
    await assertFails(updateDoc(doc(as('gm1'), SESSION), { gmControlsLocked: true }));
  });

  it('cannot change active role availability from the client', async () => {
    await assertFails(updateDoc(doc(as('gm1'), SESSION), {
      activeRoleIds: ['admiral'],
    }));
  });

  it('cannot change ship availability from the client', async () => {
    const session = doc(as('gm1'), SESSION);
    await assertFails(updateDoc(session, { capybaraEnabled: false }));
    await assertFails(updateDoc(session, { dioneEnabled: false }));
  });

  it('cannot forge a fleetwide DRADIS contact trigger from the client', async () => {
    await assertFails(updateDoc(doc(as('gm1'), SESSION), {
      dradisContactTriggeredAt: new Date().toISOString(),
    }));
  });

  it('cannot change authoritative ship stores, unrest, or unrest alerts from the client', async () => {
    const session = doc(as('gm1'), SESSION);
    await assertFails(updateDoc(session, { 'shipResources.aegis.fuel': 99 }));
    await assertFails(updateDoc(session, { 'shipUnrest.aegis': 10 }));
    await assertFails(updateDoc(session, {
      'unrestAlerts.aegis': {
        shipId: 'aegis',
        shipName: 'AEGIS',
        targetGmInstanceIds: ['bridge'],
      },
    }));
  });

  it('allows members to read census but denies player and GM client mutations', async () => {
    for (const uid of ['alice', 'gm1']) {
      const session = doc(as(uid), SESSION);
      await assertSucceeds(getDoc(session));
      await assertFails(updateDoc(session, { 'shipSurvivors.capybara': 0 }));
      await assertFails(updateDoc(session, { populationAlerts: {} }));
    }
  });

  it('denies direct damage draws, repairs, and destruction changes', async () => {
    for (const uid of ['alice', 'gm1']) {
      const session = doc(as(uid), SESSION);
      await assertFails(updateDoc(session, {
        'shipDamage.aegis': { damagedSystemIds: ['reactor'], destroyed: false },
      }));
      await assertFails(updateDoc(session, {
        'shipDamage.aegis': { damagedSystemIds: [], destroyed: false },
      }));
      await assertFails(updateDoc(session, {
        'shipDamage.aegis.destroyed': true,
      }));
    }
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

describe('events', () => {
  it('can be read by members but not forged by clients', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `${SESSION}/events/confetti-1`), {
        type: 'ship-confetti', shipId: 'aegis', shipName: 'AEGIS', actorName: 'Alice',
      });
    });
    await assertSucceeds(getDoc(doc(as('alice'), `${SESSION}/events/confetti-1`)));
    await assertFails(setDoc(doc(as('alice'), `${SESSION}/events/confetti-2`), {
      type: 'ship-confetti', shipId: 'aegis',
    }));
  });
});

describe('ship confetti signals', () => {
  it('can be read by members but not forged or reset by clients', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `${SESSION}/shipConfetti/aegis`), {
        type: 'ship-confetti', shipId: 'aegis', createdAt: new Date(),
      });
    });
    const signal = doc(as('alice'), `${SESSION}/shipConfetti/aegis`);
    await assertSucceeds(getDoc(signal));
    await assertFails(updateDoc(signal, { createdAt: new Date() }));
    await assertFails(deleteDoc(signal));
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

it('denies player and GM client writes to maintenance, charges, cargo and shuttle fuel', async () => {
  for (const uid of ['alice', 'gm1']) {
    const db = env.authenticatedContext(uid).firestore();
    await assertSucceeds(getDoc(doc(db, SESSION)));
    for (const field of ['maintenanceCycles', 'shuttleCargo', 'shuttleFuelled', 'shipUpgrades']) {
      await assertFails(updateDoc(doc(db, SESSION), { [field]: { aegis: { step: 7 } } }));
    }
  }
});
