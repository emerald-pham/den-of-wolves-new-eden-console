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
  query,
  setDoc,
  updateDoc,
  where,
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
      assignedRoleId: 'admiral',
      connected: true,
    });
    await setDoc(doc(db, `${SESSION}/players/gm1`), {
      uid: 'gm1',
      role: 'gm',
      displayName: 'GM',
      seatId: null,
      connected: true,
    });
    await setDoc(doc(db, `${SESSION}/players/press`), {
      uid: 'press',
      role: 'player',
      displayName: 'Press Officer',
      seatId: null,
      connected: true,
      activeConsoleRoleId: 'press-officer',
    });
    await setDoc(doc(db, `${SESSION}/players/observer`), {
      uid: 'observer',
      role: 'observer',
      displayName: 'Observer',
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
    await setDoc(doc(db, `${SESSION}/secrets/loyalty-press`), {
      visibleToUids: ['press'],
      payload: { type: 'loyalty', kind: 'fleet-loyalist', suspicion: 5 },
    });
    await setDoc(doc(db, `${SESSION}/secrets/setup-receipt-start-1`), {
      visibleToUids: ['gm1'],
      payload: { type: 'setup-receipt', source: 'routine-start' },
    });
    await setDoc(doc(db, `${SESSION}/roleBriefs/alice`), {
      type: 'role-brief',
      sessionId: 's1',
      assignmentUid: 'alice',
      visibleToUids: ['alice'],
      roleId: 'admiral',
      roleName: 'Admiral',
      vesselName: 'AEGIS',
      text: 'Coordinate AEGIS.',
      commonRules: 'Keep this private.',
      setupRevision: 1,
    });
    await setDoc(doc(db, `${SESSION}/roleBriefs/bob`), {
      type: 'role-brief',
      sessionId: 's1',
      assignmentUid: 'bob',
      visibleToUids: ['bob'],
      roleId: 'icebreaker-miner',
      roleName: 'Miner',
      vesselName: 'Icebreaker',
      text: 'Mine materials.',
      commonRules: 'Keep this private.',
      setupRevision: 1,
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

describe('role-private brief boundary', () => {
  it('lets a player read only their current assigned brief', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), `${SESSION}/roleBriefs/alice`)));
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/roleBriefs/bob`)));
    await assertFails(getDoc(doc(as('gm1'), `${SESSION}/roleBriefs/alice`)));
    await assertFails(getDoc(doc(as('observer'), `${SESSION}/roleBriefs/alice`)));
    await assertFails(getDoc(doc(as('stranger'), `${SESSION}/roleBriefs/alice`)));
  });

  it('denies listing and every client write for role briefs', async () => {
    await assertFails(getDocs(collection(as('alice'), `${SESSION}/roleBriefs`)));
    const own = doc(as('alice'), `${SESSION}/roleBriefs/alice`);
    await assertFails(setDoc(own, { type: 'role-brief' }));
    await assertFails(updateDoc(own, { text: 'forged' }));
    await assertFails(deleteDoc(own));
  });
});

describe('session header', () => {
  it('shares drawn damage cards with members but denies strangers and every client write', async () => {
    const playerDraw = doc(as('alice'), `${SESSION}/damageDraws/draw1`);
    const gmDraw = doc(as('gm1'), `${SESSION}/damageDraws/draw1`);
    const strangerDraw = doc(as('stranger'), `${SESSION}/damageDraws/draw1`);

    await assertSucceeds(getDoc(playerDraw));
    await assertSucceeds(getDoc(gmDraw));
    await assertFails(getDoc(strangerDraw));
    await assertFails(setDoc(playerDraw, { card: 'A♠' }));
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

  it('cannot forge turn clocks or an airspace exception from the client', async () => {
    const session = doc(as('gm1'), SESSION);
    await assertFails(updateDoc(session, {
      turnPhase: {
        turn: 1,
        teamPhaseEndsAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        openAirspaceEndsAt: new Date(Date.now() + 30 * 60_000).toISOString(),
        airspace: { state: 'lifted', tickerActive: false, pressAccess: true },
        timerPause: {
          window: 'open', remainingMs: 120_000,
          pausedAt: new Date().toISOString(),
        },
      },
    }));
  });

  it('cannot change the GM registration and Setup lock from the client', async () => {
    await assertFails(updateDoc(doc(as('gm1'), SESSION), { gmControlsLocked: true }));
  });

  it('cannot enable or retract the shared finale from a client', async () => {
    const session = doc(as('gm1'), SESSION);
    await assertFails(updateDoc(session, { debriefMode: { active: true, revision: 1 } }));
    await assertFails(updateDoc(session, { debriefMode: { active: false, revision: 2 } }));
  });

  it('cannot replay a turn transmission from the client', async () => {
    await assertFails(updateDoc(doc(as('gm1'), SESSION), {
      turnStartAnnouncement: { turn: 1, survivorPopulation: 222_500, revision: 1 },
    }));
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

  it('cannot change Press availability or its CAS revision from the client', async () => {
    for (const uid of ['alice', 'gm1']) {
      const session = doc(as(uid), SESSION);
      await assertFails(updateDoc(session, { pressEnabled: false }));
      await assertFails(updateDoc(session, { pressAvailabilityRevision: 1 }));
    }
  });

  it('cannot forge a fleetwide DRADIS contact trigger from the client', async () => {
    await assertFails(updateDoc(doc(as('gm1'), SESSION), {
      dradisContactTriggeredAt: new Date().toISOString(),
    }));
  });

  it('cannot change authoritative ship stores, jump state, unrest, or unrest alerts from the client', async () => {
    const session = doc(as('gm1'), SESSION);
    await assertFails(updateDoc(session, { 'shipResources.aegis.fuel': 99 }));
    await assertFails(updateDoc(session, { 'shipJumpStates.aegis': { lastJumpTurn: 99 } }));
    await assertFails(updateDoc(session, {
      'shipJumpTransitions.aegis': {
        id: 'forged', shipId: 'aegis', origin: '0000', destination: '5143',
        occurredAt: new Date().toISOString(),
      },
    }));
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

  it('denies event audit reads to strangers and disconnected members', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `${SESSION}/events/decision-1`), {
        type: 'role-assignment', targetUid: 'alice', roleId: 'admiral',
      });
      await updateDoc(doc(ctx.firestore(), `${SESSION}/players/alice`), { connected: false });
    });

    await assertSucceeds(getDoc(doc(as('gm1'), `${SESSION}/events/decision-1`)));
    await assertFails(getDoc(doc(as('stranger'), `${SESSION}/events/decision-1`)));
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/events/decision-1`)));
    await assertFails(getDocs(collection(as('stranger'), `${SESSION}/events`)));
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

// The join-code index makes legacy four-digit and current six-digit codes
// redeemable. It is only useful to the server: if a client could read it, it
// could enumerate tables, and if it could write it, it could point an existing
// code at a session it controls.
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

describe('join attempt limits', () => {
  it('remain server-only so a player cannot clear their own cooldown', async () => {
    const limit = doc(as('alice'), 'joinAttemptLimits/alice');
    await assertFails(getDoc(limit));
    await assertFails(setDoc(limit, { attempts: 0 }));
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

  it('denies direct setup, command-receipt, seat-receipt, responsibility-receipt, loyalty-receipt, and event writes', async () => {
    const db = as('gm1');
    const targets = [
      `${SESSION}/setupMutationRequests/request-1`,
      `${SESSION}/seatMutationRequests/request-1`,
      `${SESSION}/gmResponsibilityRequests/request-1`,
      `${SESSION}/loyaltyAssignmentRequests/request-1`,
      `${SESSION}/commandReceipts/request-1`,
      `sessionStartRequests/s1_start-1`,
      `${SESSION}/events/setup-confirm-request-1`,
      `${SESSION}/events/seat-claim-request-1`,
    ];

    for (const path of targets) {
      const target = doc(db, path);
      await assertFails(setDoc(target, { forged: true }));
      await assertFails(updateDoc(target, { forged: true }));
      await assertFails(deleteDoc(target));
    }
    await assertFails(getDoc(doc(db, `${SESSION}/loyaltyAssignmentRequests/request-1`)));
    await assertFails(getDoc(doc(db, `${SESSION}/commandReceipts/request-1`)));
    await assertFails(updateDoc(doc(db, SESSION), {
      setup: {
        playerCount: 8,
        chartId: 'A',
        expansion: 'base',
        turnLimit: 6,
        dioneEnabled: true,
        capybaraEnabled: false,
        activeRoleIds: ['admiral'],
        activeVesselIds: ['aegis'],
      },
      activeVesselIds: ['aegis'],
      setupRevision: 99,
    }));
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

  it('rejects malformed or oversized player names', async () => {
    await assertFails(
      updateDoc(doc(as('alice'), `${SESSION}/players/alice`), {
        displayName: { text: 'Alice' },
      }),
    );
    await assertFails(
      updateDoc(doc(as('alice'), `${SESSION}/players/alice`), {
        displayName: 'A'.repeat(41),
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

  it('cannot mark its browser as kicked or clear a server kick marker', async () => {
    await assertFails(
      updateDoc(doc(as('alice'), `${SESSION}/players/alice`), {
        kickedAt: new Date(),
      }),
    );
  });
});

describe('player authority', () => {
  it('allows only a display-name change on the caller own connected player record', async () => {
    const ownPlayer = doc(as('alice'), SESSION + '/players/alice');
    for (const fields of [
      { connected: false },
      { seatId: 'seat1' },
      { activeConsoleRoleId: 'admiral' },
      { sessionId: 's2' },
      { role: 'gm' },
    ]) {
      await assertFails(updateDoc(ownPlayer, fields));
    }
    await assertFails(deleteDoc(ownPlayer));
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

  it('are readable by an allowlisted active GM', async () => {
    await assertSucceeds(getDoc(doc(as('gm1'), `${SESSION}/secrets/setup-receipt-start-1`)));
  });

  it('revokes GM-private reads after the allowlisted GM is demoted', async () => {
    await assertSucceeds(getDoc(doc(as('gm1'), `${SESSION}/secrets/setup-receipt-start-1`)));

    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `${SESSION}/players/gm1`), { role: 'player' });
    });

    await assertFails(getDoc(doc(as('gm1'), `${SESSION}/secrets/setup-receipt-start-1`)));
    await assertFails(getDocs(query(
      collection(as('gm1'), `${SESSION}/secrets`),
      where('visibleToUids', 'array-contains', 'gm1'),
    )));
  });

  it('allows an allowlisted GM to query only its setup receipts', async () => {
    await assertSucceeds(getDocs(query(
      collection(as('gm1'), `${SESSION}/secrets`),
      where('visibleToUids', 'array-contains', 'gm1'),
    )));
    await assertFails(getDocs(collection(as('gm1'), `${SESSION}/loyaltyAssignmentRequests`)));
  });

  it('deny unlisted or stale GMs and every other non-allowlisted reader', async () => {
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/secrets/sec2`)));
    await assertFails(getDoc(doc(as('gm1'), `${SESSION}/secrets/sec2`)));
    await assertFails(getDoc(doc(as('observer'), `${SESSION}/secrets/sec1`)));
    await assertFails(getDoc(doc(as('stranger'), `${SESSION}/secrets/sec1`)));
    await assertFails(getDoc(doc(as('alice'), 'sessions/s2/secrets/sec1')));

    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `${SESSION}/players/gm1`), { connected: false });
    });
    await assertFails(getDoc(doc(as('gm1'), `${SESSION}/secrets/setup-receipt-start-1`)));
  });

  it('lets Press hydrate only its own loyalty and keeps every other secret private', async () => {
    await assertSucceeds(getDoc(doc(as('press'), `${SESSION}/secrets/loyalty-press`)));
    await assertFails(getDoc(doc(as('press'), `${SESSION}/secrets/sec1`)));
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/secrets/loyalty-press`)));
    await assertFails(getDoc(doc(as('stranger'), `${SESSION}/secrets/loyalty-press`)));
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/secrets/setup-receipt-start-1`)));
    await assertFails(getDoc(doc(as('gm1'), `${SESSION}/secrets/sec1`)));
  });

  it('denies every client write', async () => {
    for (const uid of ['alice', 'gm1']) {
      const secret = doc(as(uid), `${SESSION}/secrets/sec3`);
      await assertFails(setDoc(secret, { visibleToUids: [uid], payload: {} }));
      await assertFails(updateDoc(doc(as(uid), `${SESSION}/secrets/sec1`), { payload: {} }));
      await assertFails(deleteDoc(doc(as(uid), `${SESSION}/secrets/sec1`)));
    }
  });
});

it('denies secret collection listing that could reveal another player private record', async () => {
  await assertFails(getDocs(collection(as('alice'), SESSION + '/secrets')));
});

describe('complete server-owned denial matrix', () => {
  it('denies direct lifecycle and retention changes from both players and GMs', async () => {
    for (const uid of ['alice', 'gm1']) {
      const header = doc(as(uid), SESSION);
      for (const fields of [
        { ownerUid: 'alice' },
        { joinCode: '999999' },
        { deleteAfter: new Date() },
        { deletingAt: new Date() },
      ]) {
        await assertFails(updateDoc(header, fields));
      }
    }
  });

  it('denies every client write to authority-only collections', async () => {
    const db = as('alice');
    const targets = [
      SESSION + '/events/forged',
      SESSION + '/maintenanceRequests/maintenance-1',
      SESSION + '/damageDraws/forged',
      SESSION + '/seats/seat1',
      SESSION + '/shipConfetti/aegis',
      SESSION + '/maintenanceUndo/aegis',
      'joinCodes/482109',
      'activeMemberships/alice',
    ];

    for (const path of targets) {
      const target = doc(db, path);
      await assertFails(setDoc(target, { forged: true }));
      await assertFails(deleteDoc(target));
    }
  });

  it('denies signed-out and stranger reads of private session collections', async () => {
    const signedOut = env.unauthenticatedContext().firestore();
    const stranger = as('stranger');
    const protectedCollections = [
      'players',
      'seats',
      'events',
      'loyaltyAssignmentRequests',
      'commandReceipts',
      'maintenanceRequests',
      'damageDraws',
      'gmInstances',
      'secrets',
      'shipConfetti',
    ];

    for (const name of protectedCollections) {
      await assertFails(getDocs(collection(signedOut, SESSION + '/' + name)));
      await assertFails(getDocs(collection(stranger, SESSION + '/' + name)));
    }
  });
});

it('denies player and GM client writes to maintenance, charges, cargo and shuttle fuel', async () => {
  for (const uid of ['alice', 'gm1']) {
    const db = env.authenticatedContext(uid).firestore();
    await assertSucceeds(getDoc(doc(db, SESSION)));
    for (const field of ['currentTurn', 'maintenanceCycles', 'shuttleCargo', 'shuttleFuelled', 'shipUpgrades', 'pressDispatch']) {
      await assertFails(updateDoc(doc(db, SESSION), { [field]: { aegis: { step: 7 } } }));
    }
  }
});

describe('fleet red alert authority', () => {
  it('allows member reads but denies player and GM direct alert writes', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), SESSION)));
    for (const uid of ['alice', 'gm1']) {
      await assertFails(updateDoc(doc(as(uid), SESSION), { fleetRedAlert: { active: true, revision: 1, text: 'forged alert message' } }));
      await assertFails(updateDoc(doc(as(uid), SESSION), { fleetRedAlert: { active: false, revision: 2 } }));
    }
    await assertFails(getDoc(doc(as('outsider'), SESSION)));
  });
});

it('denies client access to maintenance rollback snapshots, including GM clients', async () => {
  for (const uid of ['alice', 'gm1']) {
    const undo = doc(as(uid), `${SESSION}/maintenanceUndo/aegis`);
    await assertFails(getDoc(undo));
    await assertFails(setDoc(undo, { turn: 1, entries: [] }));
    const receipt = doc(as(uid), `${SESSION}/maintenanceRollbackRequests/rollback-1`);
    await assertFails(getDoc(receipt));
    await assertFails(setDoc(receipt, { forged: true }));
  }
});
