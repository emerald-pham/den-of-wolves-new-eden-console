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
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

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
      fleetGroupId: 'fleet-1',
      connected: true,
    });
    await setDoc(doc(db, `${SESSION}/players/gm1`), {
      uid: 'gm1',
      role: 'gm',
      displayName: 'GM',
      seatId: null,
      fleetGroupId: 'fleet-1',
      connected: true,
    });
    await setDoc(doc(db, `${SESSION}/players/press`), {
      uid: 'press',
      role: 'player',
      displayName: 'Press Officer',
      seatId: null,
      fleetGroupId: 'fleet-1',
      connected: true,
      activeConsoleRoleId: 'press-officer',
    });
    await setDoc(doc(db, `${SESSION}/players/observer`), {
      uid: 'observer',
      role: 'observer',
      displayName: 'Observer',
      seatId: null,
      fleetGroupId: 'fleet-1',
      connected: true,
    });
    await setDoc(doc(db, `${SESSION}/players/captain`), {
      uid: 'captain', role: 'player', connected: true,
      assignedRoleId: 'icebreaker-captain', activeConsoleRoleId: 'icebreaker-captain',
      replacementRoleId: null,
    });
    await setDoc(doc(db, `${SESSION}/players/commissar`), {
      uid: 'commissar', role: 'player', connected: true,
      assignedRoleId: 'icebreaker-captain', activeConsoleRoleId: null,
      replacementRoleId: 'commissar',
    });
    await setDoc(doc(db, `${SESSION}/commissarPurgeAuthority/captain`), {
      type: 'commissar-purge-authority', sessionId: 's1', role: 'captain',
      captainRoleId: 'icebreaker-captain', shipId: 'icebreaker', revision: 0,
      consented: true, consentTurn: 1, consentVesselRevision: 0, usedThisTurn: false,
    });
    await setDoc(doc(db, `${SESSION}/commissarPurgeAuthority/commissar`), {
      type: 'commissar-purge-authority', sessionId: 's1', role: 'commissar',
      revision: 0, consents: {}, ledger: {},
    });
    await setDoc(doc(db, `${SESSION}/commissarPurgeState/current`), {
      type: 'commissar-purge-state',
      consents: { icebreaker: { turn: 1, captainUid: 'captain', captainRoleId: 'icebreaker-captain', vesselRevision: 0 } },
      ledger: {},
    });
    await setDoc(doc(db, `${SESSION}/gmInstances/bridge`), {
      uid: 'gm1',
      name: 'Bridge laptop',
      deviceLabel: 'macOS / Chrome',
    });
    await setDoc(doc(db, `${SESSION}/gmInstances/bridge/private/shipConsoleWriteGrant`), {
      type: 'gm-ship-console-write-grant', sessionId: 's1', instanceId: 'bridge',
      uid: 'gm1', shipId: 'aegis', grantedAt: new Date().toISOString(),
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
    await setDoc(doc(db, `${SESSION}/secrets/loyalty-alice-friend`), {
      visibleToUids: ['alice'],
      payload: {
        type: 'loyalty', kind: 'friend', suspicion: 0,
        partnerUid: 'press', partnerRoleId: 'press-officer',
      },
    });
    await setDoc(doc(db, `${SESSION}/secrets/loyalty-press-friend`), {
      visibleToUids: ['press'],
      payload: {
        type: 'loyalty', kind: 'friend', suspicion: 0,
        partnerUid: 'alice', partnerRoleId: 'admiral',
      },
    });
    await setDoc(doc(db, `${SESSION}/secrets/setup-receipt-start-1`), {
      visibleToUids: ['gm1'],
      payload: { type: 'setup-receipt', source: 'routine-start' },
    });
    await setDoc(doc(db, `${SESSION}/secrets/wolf-assignment`), {
      visibleToUids: ['gm1'],
      payload: { type: 'wolf-assignment', roleIds: ['admiral'] },
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
    await setDoc(doc(db, `${SESSION}/loyaltyCensus/current`), {
      type: 'loyalty-census',
      revision: 3,
      entries: [{ uid: 'alice', kind: 'fleet-loyalist', suspicion: 0 }],
    });
    await setDoc(doc(db, `${SESSION}/wolfCultIntelligenceAuthority/current`), {
      type: 'wolf-cult-intelligence-authority',
      sessionId: 's1',
      recipientUid: 'alice',
      revision: 1,
    });
    await setDoc(doc(db, `${SESSION}/wolfCultIntelligence/alice`), {
      type: 'wolf-cult-intelligence',
      sessionId: 's1',
      recipientUid: 'alice',
      visibleToUids: ['alice'],
      revision: 1,
      fortressCoordinate: '4454',
      suppliesCoordinate: '1964',
      agentUid: 'press',
      codeWord: 'NIGHTFALL',
      label: 'WOLF INTEL',
    });
    await setDoc(doc(db, `${SESSION}/wolfCultIntelligence/current`), {
      type: 'wolf-cult-intelligences',
      sessionId: 's1',
      recipientUid: 'alice',
      visibleToUids: ['gm1'],
      revision: 1,
      fortressCoordinate: '4454',
      suppliesCoordinate: '1964',
      agentUid: 'press',
      codeWord: 'NIGHTFALL',
      label: 'WOLF INTEL',
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

describe('Commissar purge private authority boundary', () => {
  it('allows only the live exact captain or Commissar projection and denies raw state/listing', async () => {
    await assertSucceeds(getDoc(doc(as('captain'), `${SESSION}/commissarPurgeAuthority/captain`)));
    await assertSucceeds(getDoc(doc(as('commissar'), `${SESSION}/commissarPurgeAuthority/commissar`)));
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/commissarPurgeAuthority/captain`)));
    await assertFails(getDoc(doc(as('commissar'), `${SESSION}/commissarPurgeAuthority/captain`)));
    await assertFails(getDocs(collection(as('commissar'), `${SESSION}/commissarPurgeAuthority`)));
    await assertFails(getDoc(doc(as('captain'), `${SESSION}/commissarPurgeState/current`)));
    await assertFails(getDoc(doc(as('commissar'), `${SESSION}/commissarPurgeState/current`)));
  });

  it('keeps an eligible absent projection listener authorized through create and later updates', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `${SESSION}/players/new-captain`), {
        uid: 'new-captain', role: 'player', connected: true,
        assignedRoleId: 'icebreaker-captain', activeConsoleRoleId: 'icebreaker-captain',
        replacementRoleId: null,
      });
      await setDoc(doc(db, `${SESSION}/players/new-commissar`), {
        uid: 'new-commissar', role: 'player', connected: true,
        assignedRoleId: 'icebreaker-captain', activeConsoleRoleId: null,
        replacementRoleId: 'commissar',
      });
    });
    const captainAuthority = doc(as('new-captain'), `${SESSION}/commissarPurgeAuthority/new-captain`);
    const commissarAuthority = doc(as('new-commissar'), `${SESSION}/commissarPurgeAuthority/new-commissar`);
    await assertSucceeds(getDoc(captainAuthority));
    await assertSucceeds(getDoc(commissarAuthority));
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `${SESSION}/commissarPurgeAuthority/new-captain`), {
        type: 'commissar-purge-authority', sessionId: 's1', role: 'captain',
        captainRoleId: 'icebreaker-captain', shipId: 'icebreaker', revision: 1,
        consented: false, usedThisTurn: false,
      });
      await setDoc(doc(db, `${SESSION}/commissarPurgeAuthority/new-commissar`), {
        type: 'commissar-purge-authority', sessionId: 's1', role: 'commissar',
        revision: 1, consents: {}, ledger: {},
      });
      await updateDoc(doc(db, `${SESSION}/commissarPurgeAuthority/new-captain`), {
        consented: true, consentTurn: 1, consentVesselRevision: 0,
      });
      await updateDoc(doc(db, `${SESSION}/commissarPurgeAuthority/new-commissar`), {
        revision: 2, ledger: { icebreaker: { turn: 1, revision: 1 } },
      });
    });
    await assertSucceeds(getDoc(captainAuthority));
    await assertSucceeds(getDoc(commissarAuthority));
  });

  it('revokes the old captain projection after handover without exposing a stale callback', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await updateDoc(doc(db, `${SESSION}/players/captain`), {
        connected: false, activeConsoleRoleId: null,
      });
      await setDoc(doc(db, `${SESSION}/players/new-captain`), {
        uid: 'new-captain', role: 'player', connected: true,
        assignedRoleId: 'icebreaker-captain', activeConsoleRoleId: 'icebreaker-captain',
        replacementRoleId: null,
      });
    });
    await assertFails(getDoc(doc(as('captain'), `${SESSION}/commissarPurgeAuthority/captain`)));
    await assertFails(getDoc(doc(as('new-captain'), `${SESSION}/commissarPurgeAuthority/captain`)));
  });
});

describe('role-private brief boundary', () => {
  it('lets a player read only their current assigned brief', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), `${SESSION}/roleBriefs/alice`)));
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/roleBriefs/bob`)));
    await assertFails(getDoc(doc(as('gm1'), `${SESSION}/roleBriefs/alice`)));
    await assertFails(getDoc(doc(as('observer'), `${SESSION}/roleBriefs/alice`)));
    await assertFails(getDoc(doc(as('stranger'), `${SESSION}/roleBriefs/alice`)));

    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `${SESSION}/players/alice`), {
        assignedRoleId: 'icebreaker-miner',
      });
    });
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/roleBriefs/alice`)));

    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `${SESSION}/players/alice`), {
        assignedRoleId: null,
      });
    });
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/roleBriefs/alice`)));
  });

  it('denies listing and every client write for role briefs', async () => {
    await assertFails(getDocs(collection(as('alice'), `${SESSION}/roleBriefs`)));
    const own = doc(as('alice'), `${SESSION}/roleBriefs/alice`);
    await assertFails(setDoc(own, { type: 'role-brief' }));
    await assertFails(updateDoc(own, { text: 'forged' }));
    await assertFails(deleteDoc(own));
  });

  it('authorizes a replacement brief only through the replacement pointer', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await updateDoc(doc(db, `${SESSION}/players/alice`), {
        replacementRoleId: 'wolf-commander',
      });
      await updateDoc(doc(db, `${SESSION}/roleBriefs/alice`), {
        roleId: 'wolf-commander',
      });
      await setDoc(doc(db, `${SESSION}/replacementEligibility/alice`), {
        eligible: true, reason: 'dead', revision: 1,
      });
      await setDoc(doc(db, `${SESSION}/replacementAssignments/assignment-1`), {
        targetUid: 'alice', replacementRoleId: 'wolf-commander', revision: 1,
      });
    });
    await assertSucceeds(getDoc(doc(as('alice'), `${SESSION}/roleBriefs/alice`)));
    await assertSucceeds(getDoc(doc(as('gm1'), `${SESSION}/replacementEligibility/alice`)));
    await assertSucceeds(getDoc(doc(as('gm1'), `${SESSION}/replacementAssignments/assignment-1`)));
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/replacementEligibility/alice`)));
    await assertFails(setDoc(doc(as('gm1'), `${SESSION}/replacementAssignments/forged`), {
      targetUid: 'alice', replacementRoleId: 'admiral',
    }));
  });
});

describe('private projection listener bootstrap', () => {
  it('permits exact GM and entitled-holder reads before server projection creation, then reads the created documents', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await deleteDoc(doc(db, `${SESSION}/arbourVisions/current`));
      await deleteDoc(doc(db, `${SESSION}/arbourVisions/alice`));
      await setDoc(doc(db, `${SESSION}/arbourVisionAuthority/current`), {
        type: 'arbour-vision-authority', sessionId: 's1',
        recipientUid: 'alice', revision: 8,
      });
      await deleteDoc(doc(db, `${SESSION}/wolfCultIntelligence/current`));
      await deleteDoc(doc(db, `${SESSION}/wolfCultIntelligence/alice`));
      await setDoc(doc(db, `${SESSION}/wolfCultIntelligenceAuthority/current`), {
        type: 'wolf-cult-intelligence-authority', sessionId: 's1',
        recipientUid: 'alice', revision: 8,
      });
    });
    await assertSucceeds(getDoc(doc(as('gm1'), `${SESSION}/arbourVisions/current`)));
    await assertSucceeds(getDoc(doc(as('alice'), `${SESSION}/arbourVisions/alice`)));
    await assertFails(getDoc(doc(as('press'), `${SESSION}/arbourVisions/alice`)));
    await assertSucceeds(getDoc(doc(as('gm1'), `${SESSION}/wolfCultIntelligence/current`)));
    await assertSucceeds(getDoc(doc(as('alice'), `${SESSION}/wolfCultIntelligence/alice`)));
    await assertFails(getDoc(doc(as('press'), `${SESSION}/wolfCultIntelligence/alice`)));

    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `${SESSION}/arbourVisions/current`), {
        type: 'arbour-visions', sessionId: 's1', recipientUid: 'alice',
        visibleToUids: ['gm1'], revision: 1, kind: 'danger', text: 'Created',
        label: 'FACILITATOR CALL',
      });
      await setDoc(doc(db, `${SESSION}/arbourVisions/alice`), {
        type: 'arbour-vision', sessionId: 's1', recipientUid: 'alice',
        visibleToUids: ['alice'], revision: 1, kind: 'danger', text: 'Created',
        label: 'FACILITATOR CALL',
      });
      await setDoc(doc(db, `${SESSION}/wolfCultIntelligence/current`), {
        type: 'wolf-cult-intelligences', sessionId: 's1', recipientUid: 'alice',
        visibleToUids: ['gm1'], revision: 1, fortressCoordinate: '4454',
        suppliesCoordinate: '1964', agentUid: 'press', codeWord: 'NIGHTFALL', label: 'WOLF INTEL',
      });
      await setDoc(doc(db, `${SESSION}/wolfCultIntelligence/alice`), {
        type: 'wolf-cult-intelligence', sessionId: 's1', recipientUid: 'alice',
        visibleToUids: ['alice'], revision: 1, fortressCoordinate: '4454',
        suppliesCoordinate: '1964', agentUid: 'press', codeWord: 'NIGHTFALL', label: 'WOLF INTEL',
      });
    });
    await assertSucceeds(getDoc(doc(as('gm1'), `${SESSION}/arbourVisions/current`)));
    await assertSucceeds(getDoc(doc(as('alice'), `${SESSION}/arbourVisions/alice`)));
    await assertSucceeds(getDoc(doc(as('gm1'), `${SESSION}/wolfCultIntelligence/current`)));
    await assertSucceeds(getDoc(doc(as('alice'), `${SESSION}/wolfCultIntelligence/alice`)));
  });

  it('permits a canonical legacy holder while authority is absent, then requires the backfilled pointer', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `${SESSION}/secrets/loyalty-alice`), {
        visibleToUids: ['alice'],
        payload: { type: 'loyalty', kind: 'universal-arbour', suspicion: 10 },
      });
      await deleteDoc(doc(db, `${SESSION}/arbourVisionAuthority/current`));
      await deleteDoc(doc(db, `${SESSION}/arbourVisions/alice`));

      await setDoc(doc(db, `${SESSION}/players/cult`), {
        uid: 'cult', role: 'player', connected: true, fleetGroupId: 'fleet-1',
      });
      await setDoc(doc(db, `${SESSION}/secrets/loyalty-cult`), {
        visibleToUids: ['cult'],
        payload: { type: 'loyalty', kind: 'wolf-cult', suspicion: 6 },
      });
      await deleteDoc(doc(db, `${SESSION}/wolfCultIntelligenceAuthority/current`));
      await deleteDoc(doc(db, `${SESSION}/wolfCultIntelligence/cult`));
    });

    // The exact current holders may subscribe before the first server
    // projection exists; unrelated members remain denied and no collection
    // listing is introduced by this compatibility path.
    await assertSucceeds(getDoc(doc(as('alice'), `${SESSION}/arbourVisions/alice`)));
    await assertFails(getDoc(doc(as('press'), `${SESSION}/arbourVisions/alice`)));
    await assertSucceeds(getDoc(doc(as('cult'), `${SESSION}/wolfCultIntelligence/cult`)));
    await assertFails(getDoc(doc(as('press'), `${SESSION}/wolfCultIntelligence/cult`)));
    await assertFails(getDocs(collection(as('alice'), `${SESSION}/arbourVisions`)));

    // A former holder cannot keep reading a stale server projection merely
    // because the authority pointer has not yet been backfilled.
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await updateDoc(doc(db, `${SESSION}/secrets/loyalty-alice`), {
        'payload.kind': 'fleet-loyalist',
      });
      await updateDoc(doc(db, `${SESSION}/secrets/loyalty-cult`), {
        'payload.kind': 'wolf-agent',
      });
    });
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/arbourVisions/alice`)));
    await assertFails(getDoc(doc(as('cult'), `${SESSION}/wolfCultIntelligence/cult`)));
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await updateDoc(doc(db, `${SESSION}/secrets/loyalty-alice`), {
        'payload.kind': 'universal-arbour',
      });
      await updateDoc(doc(db, `${SESSION}/secrets/loyalty-cult`), {
        'payload.kind': 'wolf-cult',
      });
    });

    // A legacy holder may bootstrap an absent projection, but an existing
    // document must still carry the complete private projection tuple. Test
    // each tuple field while the authority pointer is absent.
    const malformedProjections = [
      { arbour: { type: 'wrong-type' }, wolf: { type: 'wrong-type' } },
      { arbour: { sessionId: 'other-session' }, wolf: { sessionId: 'other-session' } },
      { arbour: { recipientUid: 'press' }, wolf: { recipientUid: 'press' } },
      { arbour: { visibleToUids: ['alice', 'press'] }, wolf: { visibleToUids: ['cult', 'press'] } },
    ];
    for (const malformed of malformedProjections) {
      await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, `${SESSION}/arbourVisions/alice`), {
          type: 'arbour-vision', sessionId: 's1', recipientUid: 'alice',
          visibleToUids: ['alice'], ...malformed.arbour,
        });
        await setDoc(doc(db, `${SESSION}/wolfCultIntelligence/cult`), {
          type: 'wolf-cult-intelligence', sessionId: 's1', recipientUid: 'cult',
          visibleToUids: ['cult'], ...malformed.wolf,
        });
      });
      await assertFails(getDoc(doc(as('alice'), `${SESSION}/arbourVisions/alice`)));
      await assertFails(getDoc(doc(as('cult'), `${SESSION}/wolfCultIntelligence/cult`)));
      await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await deleteDoc(doc(db, `${SESSION}/arbourVisions/alice`));
        await deleteDoc(doc(db, `${SESSION}/wolfCultIntelligence/cult`));
      });
    }

    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `${SESSION}/arbourVisionAuthority/current`), {
        type: 'arbour-vision-authority', sessionId: 's1', recipientUid: 'alice', revision: 9,
      });
      await setDoc(doc(db, `${SESSION}/wolfCultIntelligenceAuthority/current`), {
        type: 'wolf-cult-intelligence-authority', sessionId: 's1', recipientUid: 'cult', revision: 9,
      });
    });

    // The authority pointer does not relax the existing-document shape: its
    // recipient and type must agree with the private projection as well.
    for (const malformed of malformedProjections) {
      await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, `${SESSION}/arbourVisions/alice`), {
          type: 'arbour-vision', sessionId: 's1', recipientUid: 'alice',
          visibleToUids: ['alice'], ...malformed.arbour,
        });
        await setDoc(doc(db, `${SESSION}/wolfCultIntelligence/cult`), {
          type: 'wolf-cult-intelligence', sessionId: 's1', recipientUid: 'cult',
          visibleToUids: ['cult'], ...malformed.wolf,
        });
      });
      await assertFails(getDoc(doc(as('alice'), `${SESSION}/arbourVisions/alice`)));
      await assertFails(getDoc(doc(as('cult'), `${SESSION}/wolfCultIntelligence/cult`)));
      await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await deleteDoc(doc(db, `${SESSION}/arbourVisions/alice`));
        await deleteDoc(doc(db, `${SESSION}/wolfCultIntelligence/cult`));
      });
    }

    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `${SESSION}/arbourVisions/alice`), {
        type: 'arbour-vision', sessionId: 's1', recipientUid: 'alice',
        visibleToUids: ['alice'], revision: 1, kind: 'danger', text: 'Created', label: 'FACILITATOR CALL',
      });
    });
    await assertSucceeds(getDoc(doc(as('alice'), `${SESSION}/arbourVisions/alice`)));
    await assertSucceeds(getDoc(doc(as('cult'), `${SESSION}/wolfCultIntelligence/cult`)));

    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `${SESSION}/arbourVisionAuthority/current`), { recipientUid: null });
      await updateDoc(doc(ctx.firestore(), `${SESSION}/wolfCultIntelligenceAuthority/current`), { recipientUid: null });
    });
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/arbourVisions/alice`)));
    await assertFails(getDoc(doc(as('cult'), `${SESSION}/wolfCultIntelligence/cult`)));
  });
});

describe('Universal Arbour vision boundary', () => {
  it('allows only the current Arbour holder and connected GMs to read their respective projections', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `${SESSION}/secrets/loyalty-alice`), {
        visibleToUids: ['alice'],
        payload: { type: 'loyalty', kind: 'universal-arbour', suspicion: 10 },
      });
      await setDoc(doc(db, `${SESSION}/arbourVisions/alice`), {
        type: 'arbour-vision', sessionId: 's1', recipientUid: 'alice',
        visibleToUids: ['alice'], revision: 1, kind: 'danger',
        text: 'There is danger at the outer relay.', label: 'FACILITATOR CALL',
      });
      await setDoc(doc(db, `${SESSION}/arbourVisions/current`), {
        type: 'arbour-visions', sessionId: 's1', recipientUid: 'alice',
        visibleToUids: ['gm1'], revision: 1, kind: 'danger',
        text: 'There is danger at the outer relay.', label: 'FACILITATOR CALL',
      });
      await setDoc(doc(db, `${SESSION}/arbourVisionAuthority/current`), {
        type: 'arbour-vision-authority', sessionId: 's1', recipientUid: 'alice', revision: 4,
      });
    });

    await assertSucceeds(getDoc(doc(as('alice'), `${SESSION}/arbourVisions/alice`)));
    for (const uid of ['gm1', 'observer', 'stranger']) {
      await assertFails(getDoc(doc(as(uid), `${SESSION}/arbourVisions/alice`)));
    }
    await assertSucceeds(getDoc(doc(as('gm1'), `${SESSION}/arbourVisions/current`)));
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/arbourVisions/current`)));
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/arbourVisionAuthority/current`)));
    await assertFails(getDocs(collection(as('alice'), `${SESSION}/arbourVisions`)));
    await assertFails(setDoc(doc(as('alice'), `${SESSION}/arbourVisions/alice`), { text: 'forged' }));

    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `${SESSION}/secrets/loyalty-alice`), {
        'payload.kind': 'fleet-loyalist',
      });
      await updateDoc(doc(ctx.firestore(), `${SESSION}/arbourVisionAuthority/current`), {
        recipientUid: null, revision: 5,
      });
    });
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/arbourVisions/alice`)));
  });
});

describe('Intelligence Agent investigation boundary', () => {
  it('exposes only the current holder projection and keeps truth records server-only', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `${SESSION}/secrets/loyalty-alice`), {
        visibleToUids: ['alice'],
        payload: { type: 'loyalty', kind: 'intelligence-agent', suspicion: 6 },
      });
      await setDoc(doc(db, `${SESSION}/intelligenceInvestigations/alice`), {
        type: 'intelligence-investigation', sessionId: 's1',
        investigatorUid: 'alice', visibleToUids: ['alice'], requestId: 'investigate-1',
        cycle: 2, revision: 1, targetUid: 'press', targetDisplayName: 'Press Officer',
        reportedWolf: false,
      });
      await setDoc(doc(db, `${SESSION}/intelligenceInvestigationAudits/investigate-1`), {
        type: 'intelligence-investigation-audit', sessionId: 's1',
        investigatorUid: 'alice', targetUid: 'press', actualWolf: true,
        reportedWolf: false, accurate: false, accuracyRoll: 5,
      });
    });

    const holder = doc(as('alice'), `${SESSION}/intelligenceInvestigations/alice`);
    await assertSucceeds(getDoc(holder));
    await assertFails(getDoc(doc(as('press'), `${SESSION}/intelligenceInvestigations/alice`)));
    await assertFails(getDoc(doc(as('gm1'), `${SESSION}/intelligenceInvestigations/alice`)));
    await assertFails(getDoc(doc(as('observer'), `${SESSION}/intelligenceInvestigations/alice`)));
    await assertFails(getDocs(collection(as('alice'), `${SESSION}/intelligenceInvestigations`)));
    await assertFails(setDoc(holder, { reportedWolf: true }));

    for (const uid of ['alice', 'press', 'gm1']) {
      await assertFails(getDoc(doc(
        as(uid), `${SESSION}/intelligenceInvestigationAudits/investigate-1`,
      )));
      await assertFails(getDocs(collection(
        as(uid), `${SESSION}/intelligenceInvestigationAudits`,
      )));
    }

    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `${SESSION}/secrets/loyalty-alice`), {
        payload: { type: 'loyalty', kind: 'fleet-loyalist', suspicion: 5 },
      });
    });
    await assertFails(getDoc(holder));
  });

  it('permits an empty exact-holder listener before the first investigation', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `${SESSION}/secrets/loyalty-alice`), {
        visibleToUids: ['alice'],
        payload: { type: 'loyalty', kind: 'intelligence-agent', suspicion: 6 },
      });
    });
    await assertSucceeds(getDoc(doc(
      as('alice'), `${SESSION}/intelligenceInvestigations/alice`,
    )));
  });
});

describe('facilitator rule-call boundary', () => {
  it('keeps GM history private and exposes only an exact selected-player projection', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `${SESSION}/facilitatorRuleCalls/gm-current`), {
        type: 'facilitator-rule-call', sessionId: 's1', callId: 'call-1', revision: 1,
        ambiguity: 'Question', source: 'Reference', decision: 'Decision',
        audience: 'selected-player', recipientUid: 'alice', actorUid: 'gm1',
        label: 'FACILITATOR RULE CALL',
      });
      await setDoc(doc(db, `${SESSION}/facilitatorRuleCalls/history-call-1`), {
        type: 'facilitator-rule-call', sessionId: 's1', callId: 'call-1', revision: 1,
        ambiguity: 'Question', source: 'Reference', decision: 'Decision',
        audience: 'selected-player', recipientUid: 'alice', actorUid: 'gm1',
        label: 'FACILITATOR RULE CALL',
      });
      await setDoc(doc(db, `${SESSION}/facilitatorRuleCalls/audit-call-1`), {
        type: 'facilitator-rule-call-audit', sessionId: 's1', callId: 'call-1', actorUid: 'gm1',
      });
      await setDoc(doc(db, `${SESSION}/facilitatorRuleCalls/recipient-alice`), {
        type: 'facilitator-rule-call', sessionId: 's1', callId: 'call-1', revision: 1,
        ambiguity: 'Question', source: 'Reference', decision: 'Decision',
        audience: 'selected-player', recipientUid: 'alice', visibleToUids: ['alice'],
        label: 'FACILITATOR RULE CALL',
      });
    });

    await assertSucceeds(getDoc(doc(as('gm1'), `${SESSION}/facilitatorRuleCalls/gm-current`)));
    await assertSucceeds(getDoc(doc(as('gm1'), `${SESSION}/facilitatorRuleCalls/history-call-1`)));
    await assertSucceeds(getDoc(doc(as('gm1'), `${SESSION}/facilitatorRuleCalls/audit-call-1`)));
    await assertSucceeds(getDoc(doc(as('alice'), `${SESSION}/facilitatorRuleCalls/recipient-alice`)));
    await assertSucceeds(getDoc(doc(as('press'), `${SESSION}/facilitatorRuleCalls/recipient-press`)));
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/facilitatorRuleCalls/recipient-press`)));
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/facilitatorRuleCalls/recipient-missing`)));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `${SESSION}/facilitatorRuleCalls/recipient-alice`), {
        actorUid: 'gm1',
      });
    });
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/facilitatorRuleCalls/recipient-alice`)));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `${SESSION}/facilitatorRuleCalls/recipient-alice`), {
        type: 'facilitator-rule-call', sessionId: 's1', callId: 'call-1', revision: 0,
        ambiguity: 'Question', source: 'Reference', decision: 'Decision',
        audience: 'selected-player', recipientUid: 'alice', visibleToUids: ['alice'],
        label: 'FACILITATOR RULE CALL',
      });
    });
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/facilitatorRuleCalls/recipient-alice`)));
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/facilitatorRuleCalls/gm-current`)));
    await assertFails(getDoc(doc(as('gm1'), `${SESSION}/facilitatorRuleCalls/recipient-alice`)));
    await assertFails(getDocs(collection(as('alice'), `${SESSION}/facilitatorRuleCalls`)));
    await assertFails(setDoc(doc(as('alice'), `${SESSION}/facilitatorRuleCalls/recipient-alice`), {
      type: 'facilitator-rule-call', sessionId: 's1', audience: 'selected-player', recipientUid: 'alice',
    }));
  });
});

describe('crisis state boundary', () => {
  it('allows members to read only the public current report and forbids direct publication', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `${SESSION}/crisisReports/current`), {
        sessionId: 's1', crisisId: 'vessel', state: 'delivered', revision: 2, title: 'Report', body: 'Public facts',
      });
    });
    await assertSucceeds(getDoc(doc(as('alice'), `${SESSION}/crisisReports/current`)));
    await assertSucceeds(getDoc(doc(as('gm1'), `${SESSION}/crisisReports/current`)));
    await assertFails(getDoc(doc(as('outsider'), `${SESSION}/crisisReports/current`)));
    await assertFails(getDocs(collection(as('alice'), `${SESSION}/crisisReports`)));
    await assertFails(setDoc(doc(as('gm1'), `${SESSION}/crisisReports/current`), { body: 'Forged' }));
    await assertFails(setDoc(doc(as('alice'), `${SESSION}/crisisReports/current`), { body: 'Forged' }));
  });

  it('allows members to read the admitted Voyage projection while keeping admission audit GM-only', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `${SESSION}/voyage33Admission/current`), {
        type: 'voyage-admission', sessionId: 's1', id: 'voyage-33-0', status: 'admitted',
        crisisId: 'approach-1', crisisRevision: 3, population: 40000, unrest: 0,
        hostShipId: null,
        commitments: { requiresHostDocking: true, hostProvidesResources: true, maintenanceSteps: [1, 2, 3, 4], maxConsoleCharges: 1 },
      });
      await setDoc(doc(db, `${SESSION}/voyage33Admission/current/audit/admit-1`), {
        type: 'voyage-admission', actorUid: 'gm1', requestId: 'admit-1',
      });
    });
    await assertSucceeds(getDoc(doc(as('gm1'), `${SESSION}/voyage33Admission/current`)));
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/voyage33Admission/current`)));
    await assertFails(getDoc(doc(as('outsider'), `${SESSION}/voyage33Admission/current`)));
    await assertSucceeds(getDoc(doc(as('gm1'), `${SESSION}/voyage33Admission/current/audit/admit-1`)));
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/voyage33Admission/current/audit/admit-1`)));
    await assertFails(getDocs(collection(as('alice'), `${SESSION}/voyage33Admission`)));
    await assertFails(setDoc(doc(as('alice'), `${SESSION}/voyage33Admission/current`), { forged: true }));
  });

  it('keeps Voyage 33-0 arrival activation and audit metadata GM-only', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `${SESSION}/voyage33Arrival/current`), {
        type: 'voyage-arrival-activation', sessionId: 's1', vesselId: 'voyage-33-0',
        crisisId: 'approach-1', crisisRevision: 3, admissionRequestId: 'admit-1',
        motivatedRoleIds: ['refinery-124-captain'], actorUid: 'gm1', instanceId: 'gm-1',
      });
      await setDoc(doc(db, `${SESSION}/voyage33Arrival/current/audit/admit-1`), {
        type: 'voyage-arrival-activation', action: 'activate', actorUid: 'gm1', requestId: 'admit-1',
      });
    });
    await assertSucceeds(getDoc(doc(as('gm1'), `${SESSION}/voyage33Arrival/current`)));
    await assertSucceeds(getDoc(doc(as('gm1'), `${SESSION}/voyage33Arrival/current/audit/admit-1`)));
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/voyage33Arrival/current`)));
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/voyage33Arrival/current/audit/admit-1`)));
    await assertFails(getDoc(doc(as('outsider'), `${SESSION}/voyage33Arrival/current`)));
    await assertFails(getDocs(collection(as('gm1'), `${SESSION}/voyage33Arrival`)));
    await assertFails(setDoc(doc(as('gm1'), `${SESSION}/voyage33Arrival/current`), { forged: true }));
    await assertFails(setDoc(doc(as('alice'), `${SESSION}/voyage33Arrival/current`), { forged: true }));
  });

  it('keeps the durable crisis projection and audit private to connected GMs', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `${SESSION}/crisisState/current`), {
        type: 'crisis-state', sessionId: 's1', crisisId: 'approaching-vessel',
        state: 'debated', revision: 3, title: 'Approaching vessel', details: 'Private notes',
      });
      await setDoc(doc(db, `${SESSION}/crisisState/current/audit/revision-3`), {
        type: 'crisis-state', state: 'debated', revision: 3,
      });
    });
    await assertSucceeds(getDoc(doc(as('gm1'), `${SESSION}/crisisState/current`)));
    await assertSucceeds(getDoc(doc(as('gm1'), `${SESSION}/crisisState/current/audit/revision-3`)));
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/crisisState/current`)));
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/crisisState/current/audit/revision-3`)));
    await assertFails(getDocs(collection(as('gm1'), `${SESSION}/crisisState`)));
    await assertFails(setDoc(doc(as('gm1'), `${SESSION}/crisisState/current`), { forged: true }));
  });

  it('keeps Zealotry responses and their audit history private to connected GMs', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      const fields = {
        type: 'zealotry-response', sessionId: 's1', crisisId: 'zealotry-1',
        state: 'debated', crisisRevision: 3, revision: 1,
        actions: ['pressure', 'investigate'], rationale: 'Private rationale',
        loyaltyCensusRevision: 4,
      };
      await setDoc(doc(db, `${SESSION}/zealotryResponses/current`), fields);
      await setDoc(doc(db, `${SESSION}/zealotryResponses/history-response-1`), fields);
      await setDoc(doc(db, `${SESSION}/zealotryResponses/audit-response-1`), fields);
    });
    for (const documentId of ['current', 'history-response-1', 'audit-response-1']) {
      await assertSucceeds(getDoc(doc(as('gm1'), `${SESSION}/zealotryResponses/${documentId}`)));
      await assertFails(getDoc(doc(as('alice'), `${SESSION}/zealotryResponses/${documentId}`)));
      await assertFails(getDoc(doc(as('observer'), `${SESSION}/zealotryResponses/${documentId}`)));
      await assertFails(setDoc(doc(as('gm1'), `${SESSION}/zealotryResponses/${documentId}`), { forged: true }));
    }
    await assertFails(getDocs(collection(as('gm1'), `${SESSION}/zealotryResponses`)));
    await assertFails(setDoc(doc(as('alice'), `${SESSION}/zealotryResponses/current`), { forged: true }));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `${SESSION}/players/gm1`), { role: 'player' });
    });
    await assertFails(getDoc(doc(as('gm1'), `${SESSION}/zealotryResponses/current`)));
  });

  it('keeps Civil Unrest resolution current, history, and audit private to connected GMs', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      const fields = {
        type: 'civil-unrest-resolution', sessionId: 's1', crisisId: 'unrest-1',
        state: 'debated', crisisRevision: 3, revision: 1,
        presidentResponse: 'Facilitator-recorded response', consequence: 'Facilitator-recorded consequence',
        rationale: 'GM-only rationale', recordedBy: 'facilitator', actorUid: 'gm1', instanceId: 'gm-instance',
        grievanceRevisions: [
          { shipId: 'dione', revision: null }, { shipId: 'icebreaker', revision: 1 },
          { shipId: 'shepherd', revision: null }, { shipId: 'quellon', revision: null }, { shipId: 'refinery-124', revision: null },
        ],
      };
      await setDoc(doc(db, `${SESSION}/civilUnrestResolutions/current`), fields);
      await setDoc(doc(db, `${SESSION}/civilUnrestResolutions/history-resolution-1`), fields);
      await setDoc(doc(db, `${SESSION}/civilUnrestResolutions/audit-resolution-1`), fields);
    });
    for (const documentId of ['current', 'history-resolution-1', 'audit-resolution-1']) {
      await assertSucceeds(getDoc(doc(as('gm1'), `${SESSION}/civilUnrestResolutions/${documentId}`)));
      await assertFails(getDoc(doc(as('alice'), `${SESSION}/civilUnrestResolutions/${documentId}`)));
      await assertFails(getDoc(doc(as('press'), `${SESSION}/civilUnrestResolutions/${documentId}`)));
      await assertFails(setDoc(doc(as('gm1'), `${SESSION}/civilUnrestResolutions/${documentId}`), { forged: true }));
    }
    await assertFails(getDocs(collection(as('gm1'), `${SESSION}/civilUnrestResolutions`)));
    await assertFails(setDoc(doc(as('alice'), `${SESSION}/civilUnrestResolutions/current`), { forged: true }));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `${SESSION}/players/gm1`), { role: 'player' });
    });
    await assertFails(getDoc(doc(as('gm1'), `${SESSION}/civilUnrestResolutions/current`)));
  });

  it('keeps private grievances to the live team, publishes public text to members, and revokes stale team reads', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await updateDoc(doc(db, SESSION), {
        activeVesselIds: ['icebreaker'],
      });
      await setDoc(doc(db, `${SESSION}/crisisState/current`), {
        type: 'crisis-state', sessionId: 's1', crisisId: 'civil-unrest', crisisKind: 'civil-unrest',
        state: 'delivered', revision: 4, title: 'Civil unrest', details: 'GM notes',
      });
      await setDoc(doc(db, `${SESSION}/civilUnrestGrievances/icebreaker`), {
        type: 'civil-unrest-grievance', sessionId: 's1', crisisId: 'civil-unrest', shipId: 'icebreaker',
        visibility: 'private', text: 'Private team concern', revision: 1, crisisRevision: 4,
      });
      await setDoc(doc(db, `${SESSION}/civilUnrestGrievances/icebreaker/audit/request-1`), {
        type: 'civil-unrest-grievance', actorUid: 'captain', text: 'Private team concern', revision: 1,
      });
      await setDoc(doc(db, `${SESSION}/civilUnrestPublic/current`), {
        type: 'civil-unrest-public', sessionId: 's1', crisisId: 'civil-unrest', state: 'delivered',
        revision: 4, grievances: [{ shipId: 'icebreaker', text: 'Public concern', revision: 1 }],
      });
    });
    await assertSucceeds(getDoc(doc(as('captain'), `${SESSION}/civilUnrestGrievances/icebreaker`)));
    await assertSucceeds(getDoc(doc(as('gm1'), `${SESSION}/civilUnrestGrievances/icebreaker`)));
    await assertSucceeds(getDoc(doc(as('alice'), `${SESSION}/civilUnrestPublic/current`)));
    await assertSucceeds(getDoc(doc(as('press'), `${SESSION}/civilUnrestPublic/current`)));
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/civilUnrestGrievances/icebreaker`)));
    await assertFails(getDoc(doc(as('captain'), `${SESSION}/civilUnrestGrievances/icebreaker/audit/request-1`)));
    await assertFails(getDocs(collection(as('captain'), `${SESSION}/civilUnrestGrievances`)));
    await assertFails(setDoc(doc(as('captain'), `${SESSION}/civilUnrestGrievances/icebreaker`), { forged: true }));

    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `${SESSION}/players/captain`), {
        assignedRoleId: 'shepherd-captain', activeConsoleRoleId: 'shepherd-captain',
      });
    });
    await assertFails(getDoc(doc(as('captain'), `${SESSION}/civilUnrestGrievances/icebreaker`)));
  });
});

describe('Hummingbird harvest boundary', () => {
  it('keeps pending dice private to the active Quellon Explorer and denies client writes', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await updateDoc(doc(db, `${SESSION}/players/alice`), {
        activeConsoleRoleId: 'quellon-explorer',
      });
      await setDoc(doc(db, `${SESSION}/hummingbirdHarvests/alice`), {
        sessionId: 's1', ownerUid: 'alice', turn: 1, hostShipId: 'quellon', revision: 1,
        status: 'pending', rolls: [2, 5], requestId: 'roll-1', createdAt: '2026-09-12T00:00:00.000Z',
      });
      await setDoc(doc(db, `${SESSION}/hummingbirdHarvestRequests/roll-1`), {
        actorUid: 'alice', reply: { status: 'committed' },
      });
    });

    await assertSucceeds(getDoc(doc(as('alice'), `${SESSION}/hummingbirdHarvests/alice`)));
    for (const uid of ['gm1', 'observer', 'stranger']) {
      await assertFails(getDoc(doc(as(uid), `${SESSION}/hummingbirdHarvests/alice`)));
    }
    await assertFails(getDocs(collection(as('alice'), `${SESSION}/hummingbirdHarvests`)));
    await assertFails(setDoc(doc(as('alice'), `${SESSION}/hummingbirdHarvests/alice`), { forged: true }));
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/hummingbirdHarvestRequests/roll-1`)));

    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `${SESSION}/players/alice`), {
        activeConsoleRoleId: 'admiral',
      });
    });
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/hummingbirdHarvests/alice`)));

    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `${SESSION}/players/alice`), {
        activeConsoleRoleId: 'quellon-explorer', replacementRoleId: 'wolf-commander',
      });
    });
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/hummingbirdHarvests/alice`)));
  });
});

describe('session header', () => {
  it('denies chart selection and chart-lock writes from player and GM clients', async () => {
    for (const uid of ['alice', 'gm1']) {
      await assertFails(updateDoc(doc(as(uid), SESSION), { chartId: 'C', chartSelectionLocked: true }));
      await assertFails(updateDoc(doc(as(uid), SESSION), { chartSelectionLocked: false }));
    }
  });

  it('isolates player discovery projection reads and reserves organiser lookup for GMs', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `${SESSION}/playerDiscoveries/alice`), {
        groupId: 'fleet-1', shipId: 'aegis', knownCoordinates: ['0000'], navigationLogs: [],
        pursuitValue: 2, revision: 1,
      });
      await setDoc(doc(ctx.firestore(), `${SESSION}/playerDiscoveries/press`), {
        groupId: 'fleet-2', shipId: 'dione', knownCoordinates: ['0000'], navigationLogs: [],
        pursuitValue: 7, revision: 1,
      });
      await setDoc(doc(ctx.firestore(), `${SESSION}/gmDiscovery/current`), {
        knownSystems: { 'system-01': '0000' }, organiserSites: { '0000': { code: 'START' } },
        pursuitGroups: { 'fleet-1': 2, 'fleet-2': 7 },
        shipFleetGroupIds: { aegis: 'fleet-1', dione: 'fleet-2' }, revision: 1,
      });
      await setDoc(doc(ctx.firestore(), `${SESSION}/serverState/navigation`), {
        pursuitGroups: { 'fleet-1': 2, 'fleet-2': 7 }, revision: 1,
      });
    });

    const aliceProjection = await assertSucceeds(getDoc(doc(as('alice'), `${SESSION}/playerDiscoveries/alice`)));
    expect(aliceProjection.data()).toMatchObject({ groupId: 'fleet-1', pursuitValue: 2 });
    expect(aliceProjection.data()).not.toHaveProperty('pursuitGroups');
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/playerDiscoveries/press`)));
    await assertFails(getDocs(collection(as('alice'), `${SESSION}/playerDiscoveries`)));
    await assertFails(setDoc(doc(as('alice'), `${SESSION}/playerDiscoveries/alice`), { groupId: 'fleet-2' }));
    await assertFails(updateDoc(doc(as('alice'), `${SESSION}/playerDiscoveries/alice`), { groupId: 'fleet-2' }));

    const gmProjection = await assertSucceeds(getDoc(doc(as('gm1'), `${SESSION}/gmDiscovery/current`)));
    expect(gmProjection.data()).toMatchObject({
      pursuitGroups: { 'fleet-1': 2, 'fleet-2': 7 },
      shipFleetGroupIds: { aegis: 'fleet-1', dione: 'fleet-2' },
    });
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/gmDiscovery/current`)));
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/serverState/navigation`)));
    await assertFails(getDoc(doc(as('gm1'), `${SESSION}/serverState/navigation`)));
    await assertFails(getDocs(collection(as('gm1'), `${SESSION}/gmDiscovery`)));
    await assertFails(setDoc(doc(as('gm1'), `${SESSION}/gmDiscovery/current`), { revision: 2 }));

    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `${SESSION}/players/gm1`), { role: 'player' });
    });
    await assertFails(getDoc(doc(as('gm1'), `${SESSION}/gmDiscovery/current`)));
  });

  it('keeps fleet-group membership and vessel tuples server-only', async () => {
    const group = `${SESSION}/fleetGroups/fleet-1`;
    await assertFails(getDoc(doc(as('alice'), group)));
    await assertFails(getDoc(doc(as('gm1'), group)));
    await assertFails(getDocs(collection(as('gm1'), `${SESSION}/fleetGroups`)));
    await assertFails(setDoc(doc(as('gm1'), group), {
      id: 'fleet-1', vesselIds: ['aegis'], memberUids: ['gm1'],
    }));
  });

  it('exposes only the known loyalty census path to a connected GM', async () => {
    const gmCensus = doc(as('gm1'), `${SESSION}/loyaltyCensus/current`);
    const playerCensus = doc(as('alice'), `${SESSION}/loyaltyCensus/current`);

    await assertSucceeds(getDoc(gmCensus));
    await assertFails(getDoc(playerCensus));
    await assertFails(getDocs(collection(as('gm1'), `${SESSION}/loyaltyCensus`)));
    await assertFails(setDoc(gmCensus, { type: 'loyalty-census', revision: 99, entries: [] }));
    await assertSucceeds(getDocs(collection(as('gm1'), `${SESSION}/loyaltyCensus/current/audit`)));
    await assertFails(getDocs(collection(as('alice'), `${SESSION}/loyaltyCensus/current/audit`)));
    await assertFails(setDoc(doc(as('gm1'), `${SESSION}/loyaltyCensus/current/audit/note-1`), {
      type: 'loyalty-census-note',
    }));

    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `${SESSION}/players/gm1`), { role: 'player' });
    });
    await assertFails(getDoc(gmCensus));
  });

  it('keeps Wolf Cult intelligence private to the current holder and connected GMs', async () => {
    const holderProjection = doc(as('alice'), `${SESSION}/wolfCultIntelligence/alice`);
    const otherPlayerProjection = doc(as('press'), `${SESSION}/wolfCultIntelligence/alice`);
    const observerProjection = doc(as('observer'), `${SESSION}/wolfCultIntelligence/alice`);
    const gmProjection = doc(as('gm1'), `${SESSION}/wolfCultIntelligence/current`);
    const holderCurrent = doc(as('alice'), `${SESSION}/wolfCultIntelligence/current`);
    const gmAudit = collection(as('gm1'), `${SESSION}/wolfCultIntelligence/current/audit`);

    await assertSucceeds(getDoc(holderProjection));
    await assertFails(getDoc(otherPlayerProjection));
    await assertFails(getDoc(observerProjection));
    await assertSucceeds(getDoc(gmProjection));
    await assertFails(getDoc(holderCurrent));
    await assertSucceeds(getDocs(gmAudit));
    await assertFails(getDocs(collection(as('alice'), `${SESSION}/wolfCultIntelligence`)));
    await assertFails(setDoc(holderProjection, { codeWord: 'FORGED' }));
    await assertFails(setDoc(gmProjection, { codeWord: 'FORGED' }));

    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `${SESSION}/wolfCultIntelligenceAuthority/current`), {
        recipientUid: null,
      });
      await updateDoc(doc(ctx.firestore(), `${SESSION}/players/gm1`), { connected: false });
    });
    await assertFails(getDoc(holderProjection));
    await assertFails(getDoc(gmProjection));
    await assertFails(getDocs(gmAudit));
  });

  it('keeps the Wolf-attack timing marker and audit private to connected GMs', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `${SESSION}/wolfAttackWindow/current`), {
        status: 'due', turn: 1, revision: 1,
      });
      await setDoc(doc(ctx.firestore(), `${SESSION}/wolfAttackWindow/current/audit/wolf-1`), {
        type: 'wolf-attack-window', action: 'due', turn: 1, revision: 1, actorUid: 'gm1',
      });
    });
    const gmWindow = doc(as('gm1'), `${SESSION}/wolfAttackWindow/current`);
    const playerWindow = doc(as('alice'), `${SESSION}/wolfAttackWindow/current`);
    const gmAudit = collection(as('gm1'), `${SESSION}/wolfAttackWindow/current/audit`);
    const playerAudit = collection(as('alice'), `${SESSION}/wolfAttackWindow/current/audit`);

    await assertSucceeds(getDoc(gmWindow));
    await assertFails(getDoc(playerWindow));
    await assertSucceeds(getDocs(gmAudit));
    await assertFails(getDocs(playerAudit));
    await assertFails(setDoc(gmWindow, { status: 'resolved', turn: 1, revision: 2 }));

    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `${SESSION}/players/gm1`), { connected: false });
    });
    await assertFails(getDoc(gmWindow));
    await assertFails(getDocs(gmAudit));
  });

  it('shares the private Wolf preparation revision with every GM and no player', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `${SESSION}/wolfAttackPreparation/current`), {
        turn: 1,
        revision: 1,
        shipIds: ['wolf-fighter-wing'],
        targetMode: 'pre-rolled',
        targetAssignments: [{ cardIndex: 0, targetShipId: 'aegis' }],
        modifiers: ['aegis-command-and-control'],
        notes: 'Private GM note',
      });
      await setDoc(doc(ctx.firestore(), `${SESSION}/wolfAttackPreparation/current/audit/wolf-1`), {
        type: 'wolf-attack-preparation', turn: 1, revision: 1, actorUid: 'gm1',
      });
      await setDoc(doc(ctx.firestore(), `${SESSION}/players/gm2`), {
        uid: 'gm2', role: 'gm', connected: true,
      });
    });
    const gmPreparation = doc(as('gm1'), `${SESSION}/wolfAttackPreparation/current`);
    const secondGmPreparation = doc(as('gm2'), `${SESSION}/wolfAttackPreparation/current`);
    const playerPreparation = doc(as('alice'), `${SESSION}/wolfAttackPreparation/current`);
    const gmAudit = collection(as('gm1'), `${SESSION}/wolfAttackPreparation/current/audit`);

    await assertSucceeds(getDoc(gmPreparation));
    await assertSucceeds(getDoc(secondGmPreparation));
    await assertFails(getDoc(playerPreparation));
    await assertSucceeds(getDocs(gmAudit));
    await assertFails(setDoc(gmPreparation, { revision: 2 }));
    await assertFails(getDocs(collection(as('gm1'), `${SESSION}/wolfAttackPreparation`)));
  });

  it('keeps the declared Wolf attack state and calculation receipt GM-only', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `${SESSION}/wolfAttackState/current`), {
        type: 'wolf-attack-state',
        status: 'declared',
        currentStep: 'targeting',
        calculationReceipt: { targeting: [{ initialDie: 6 }] },
        preparation: { notes: 'private' },
      });
      await setDoc(doc(ctx.firestore(), `${SESSION}/wolfAttackState/current/audit/declaration-1`), {
        type: 'wolf-attack-declaration', actorUid: 'gm1',
      });
    });
    await assertSucceeds(getDoc(doc(as('gm1'), `${SESSION}/wolfAttackState/current`)));
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/wolfAttackState/current`)));
    await assertSucceeds(getDocs(collection(as('gm1'), `${SESSION}/wolfAttackState/current/audit`)));
    await assertFails(getDocs(collection(as('alice'), `${SESSION}/wolfAttackState/current/audit`)));
    await assertFails(setDoc(doc(as('gm1'), `${SESSION}/wolfAttackState/current`), { status: 'forged' }));
    await assertFails(getDocs(collection(as('gm1'), `${SESSION}/wolfAttackState`)));
  });

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

  it('keeps fighter-wing counts and correction receipts server-owned', async () => {
    const session = doc(as('gm1'), SESSION);
    await assertFails(updateDoc(session, {
      fighterWingCounts: {
        'fighter-wing-alpha': { count: 6, revision: 1 },
        'fighter-wing-bravo': { count: 4, revision: 0 },
      },
    }));
    const receipt = doc(as('gm1'), `${SESSION}/fighterWingCountRequests/wing-1`);
    await assertFails(getDoc(receipt));
    await assertFails(setDoc(receipt, { reply: { status: 'committed' } }));
  });

  it('cannot enable or retract the shared finale from a client', async () => {
    const session = doc(as('gm1'), SESSION);
    await assertFails(updateDoc(session, { debriefMode: { active: true, revision: 1 } }));
    await assertFails(updateDoc(session, { debriefMode: { active: false, revision: 2 } }));
  });

  it('cannot replay a turn transmission from the client', async () => {
    const session = doc(as('gm1'), SESSION);
    await assertFails(updateDoc(session, {
      currentTurn: 2,
      turnPhase: {
        turn: 2,
        teamPhaseEndsAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        openAirspaceEndsAt: new Date(Date.now() + 20 * 60_000).toISOString(),
        airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
      },
      turnStartAnnouncement: { turn: 2, survivorPopulation: 222_500, revision: 1 },
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

  it('cannot forge the Coordination completion transition event', async () => {
    await assertFails(setDoc(doc(as('gm1'), `${SESSION}/events/turn-advanced-1`), {
      type: 'turn-advanced',
      transition: 'coordination-to-next-turn',
      fromTurn: 1,
      toTurn: 2,
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

describe('private Wolf action commitments', () => {
  it('deny the actor, other players, observers, and GMs all direct access', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `${SESSION}/wolfActionState/alice`), {
        type: 'wolf-action-commitment', actorUid: 'alice', cycle: 2,
        action: 'sabotage-supplies', state: 'committed', revision: 1,
      });
      await setDoc(doc(db, `${SESSION}/wolfActionState/alice/audit/wolf-action-1`), {
        type: 'wolf-action-commitment', actorUid: 'alice', cycle: 2,
        action: 'sabotage-supplies', state: 'committed', revision: 1,
      });
    });

    for (const uid of ['alice', 'press', 'observer', 'gm1']) {
      const db = as(uid);
      const current = doc(db, `${SESSION}/wolfActionState/alice`);
      const audit = doc(db, `${SESSION}/wolfActionState/alice/audit/wolf-action-1`);
      await assertFails(getDoc(current));
      await assertFails(getDoc(audit));
      await assertFails(setDoc(current, { action: 'provide-intel' }));
      await assertFails(deleteDoc(current));
    }
    await assertFails(getDocs(collection(as('alice'), `${SESSION}/wolfActionState`)));
    await assertFails(getDocs(collection(as('gm1'), `${SESSION}/wolfActionState/alice/audit`)));
  });
});

describe('private Wolf console visits', () => {
  it('deny players, observers, and GMs every direct read, list, and write', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `${SESSION}/wolfConsoleVisits/visit-1`), {
        type: 'wolf-console-visit', status: 'observing', actorUid: 'alice',
        targetShipId: 'dione', cycle: 2, startedAtMillis: 1_000,
      });
    });
    for (const uid of ['alice', 'press', 'observer', 'gm1']) {
      const visit = doc(as(uid), `${SESSION}/wolfConsoleVisits/visit-1`);
      await assertFails(getDoc(visit));
      await assertFails(setDoc(visit, { status: 'resolved' }));
      await assertFails(deleteDoc(visit));
      await assertFails(getDocs(collection(as(uid), `${SESSION}/wolfConsoleVisits`)));
    }
  });
});

describe('facilitator Wolf clue disclosure', () => {
  it('allows only a GM to read the fixed projection and denies every client write or list', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `${SESSION}/wolfClueDisclosure/current`), {
        type: 'wolf-clue-disclosure', revision: 5, actorUid: 'alice',
        action: 'sabotage-supplies', cycle: 3, requestId: 'wolf-supply-1',
        oldSuspicion: 8, increment: 2, newSuspicion: 10,
        roll: 6, total: 16, clueTier: 'wolf-activity-hint',
        facilitatorInstruction: 'Point out the wolf activity, and give a hint.',
      });
    });

    const path = `${SESSION}/wolfClueDisclosure/current`;
    await assertSucceeds(getDoc(doc(as('gm1'), path)));
    for (const uid of ['alice', 'press', 'observer']) {
      await assertFails(getDoc(doc(as(uid), path)));
    }
    for (const uid of ['alice', 'gm1']) {
      const target = doc(as(uid), path);
      await assertFails(setDoc(target, { forged: true }));
      await assertFails(updateDoc(target, { forged: true }));
      await assertFails(deleteDoc(target));
      await assertFails(getDocs(collection(as(uid), `${SESSION}/wolfClueDisclosure`)));
    }
  });
});

describe('Wolf action receipt audiences', () => {
  it('allows only a GM to get the full fixed receipt and denies listing and client writes', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `${SESSION}/wolfActionReceipts/current`), {
        type: 'wolf-action-receipt', status: 'committed', action: 'sabotage-supplies',
        projectionRevision: 5, sessionId: 's1', requestId: 'wolf-supply-1', cycle: 3, revision: 1,
        actorUid: 'alice', actorRoleId: 'dione-engineer', vesselId: 'philia',
        phase: 'active', idempotencyKey: 'wolf-supply-1',
        auditId: 'wolf-supply-sabotage-wolf-supply-1',
        resourceId: 'food', destroyedAmount: 2, remainingAmount: 3,
        oldSuspicion: 0, suspicionIncrement: 2, newSuspicion: 2,
        roll: 1, total: 3, clueTier: 'none', facilitatorInstruction: 'Nothing.',
      });
    });

    const path = `${SESSION}/wolfActionReceipts/current`;
    await assertSucceeds(getDoc(doc(as('gm1'), path)));
    for (const uid of ['alice', 'press', 'observer']) {
      await assertFails(getDoc(doc(as(uid), path)));
    }
    for (const uid of ['alice', 'gm1']) {
      const target = doc(as(uid), path);
      await assertFails(setDoc(target, { forged: true }));
      await assertFails(updateDoc(target, { forged: true }));
      await assertFails(deleteDoc(target));
      await assertFails(getDocs(collection(as(uid), `${SESSION}/wolfActionReceipts`)));
    }
  });
});

describe('Wolf homing beacon pressure schedules', () => {
  it('allows facilitator audit and denies every lower audience and client write', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `${SESSION}/wolfAttackPressure/wolf-beacon-1`), {
        type: 'wolf-homing-beacon-pressure', status: 'scheduled', sessionId: 's1',
        requestId: 'wolf-beacon-1', actorUid: 'alice', actorRoleId: 'admiral',
        groupId: 'fleet-1', coordinate: '5143', sourceCycle: 2, dueCycle: 3,
        arrivalTiming: 'after-cycle-start',
      });
    });

    const path = `${SESSION}/wolfAttackPressure/wolf-beacon-1`;
    await assertSucceeds(getDoc(doc(as('gm1'), path)));
    await assertSucceeds(getDocs(collection(as('gm1'), `${SESSION}/wolfAttackPressure`)));
    for (const uid of ['alice', 'press', 'observer']) {
      await assertFails(getDoc(doc(as(uid), path)));
      await assertFails(getDocs(collection(as(uid), `${SESSION}/wolfAttackPressure`)));
    }
    for (const uid of ['alice', 'gm1']) {
      const target = doc(as(uid), path);
      await assertFails(setDoc(target, { forged: true }));
      await assertFails(updateDoc(target, { forged: true }));
      await assertFails(deleteDoc(target));
    }
  });
});

describe('private Wolf suspicion history', () => {
  it('allows facilitators to audit history and denies every lower audience and client write', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `${SESSION}/wolfSuspicionHistory/wolf-supply-1`), {
        type: 'wolf-suspicion-history', status: 'committed',
        action: 'sabotage-supplies', source: 'wolf-supply-sabotage',
        sessionId: 's1', requestId: 'wolf-supply-1', cycle: 3,
        actorUid: 'alice', actorRoleId: 'dione-engineer',
        oldSuspicion: 0, increment: 2, newSuspicion: 2,
        roll: 1, total: 3, clueTier: 'none', disclosure: 'Nothing.',
        auditId: 'wolf-supply-sabotage-wolf-supply-1', createdAt: 'server-time',
      });
    });

    const path = `${SESSION}/wolfSuspicionHistory/wolf-supply-1`;
    await assertSucceeds(getDoc(doc(as('gm1'), path)));
    await assertSucceeds(getDocs(collection(as('gm1'), `${SESSION}/wolfSuspicionHistory`)));
    for (const uid of ['alice', 'press', 'observer']) {
      await assertFails(getDoc(doc(as(uid), path)));
      await assertFails(getDocs(collection(as(uid), `${SESSION}/wolfSuspicionHistory`)));
    }
    for (const uid of ['alice', 'gm1']) {
      const target = doc(as(uid), path);
      await assertFails(setDoc(target, { forged: true }));
      await assertFails(updateDoc(target, { forged: true }));
      await assertFails(deleteDoc(target));
    }
  });
});

describe('players', () => {
  it('bounds ordinary roster reads to the caller current connected fleet group', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `${SESSION}/players/other-group`), {
        uid: 'other-group', role: 'player', displayName: 'Other Group', seatId: null,
        fleetGroupId: 'fleet-2', connected: true,
      });
      await setDoc(doc(db, `${SESSION}/players/disconnected`), {
        uid: 'disconnected', role: 'player', displayName: 'Disconnected', seatId: null,
        fleetGroupId: 'fleet-1', connected: false,
      });
      await setDoc(doc(db, `${SESSION}/players/malformed-group`), {
        uid: 'malformed-group', role: 'player', displayName: 'Malformed Group', seatId: null,
        fleetGroupId: ['fleet-1'], connected: true,
      });
    });

    await assertSucceeds(getDoc(doc(as('alice'), `${SESSION}/players/press`)));
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/players/other-group`)));
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/players/disconnected`)));
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/players/malformed-group`)));
    await assertSucceeds(getDocs(query(
      collection(as('alice'), `${SESSION}/players`),
      where('connected', '==', true),
      where('fleetGroupId', '==', 'fleet-1'),
    )));
    await assertFails(getDocs(query(
      collection(as('alice'), `${SESSION}/players`),
      where('connected', '==', true),
      where('fleetGroupId', '==', 'fleet-2'),
    )));

    // The explicit facilitator view retains the full connected roster.
    await assertSucceeds(getDocs(query(
      collection(as('gm1'), `${SESSION}/players`),
      where('connected', '==', true),
    )));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `${SESSION}/players/gm1`), { role: 'player' });
    });
    await assertFails(getDoc(doc(as('gm1'), `${SESSION}/players/other-group`)));
    await assertSucceeds(getDocs(query(
      collection(as('gm1'), `${SESSION}/players`),
      where('connected', '==', true),
      where('fleetGroupId', '==', 'fleet-1'),
    )));
  });

  it('revokes a stale group query immediately after a server membership move', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `${SESSION}/players/alice`), { fleetGroupId: 'fleet-2' });
    });

    await assertFails(getDocs(query(
      collection(as('alice'), `${SESSION}/players`),
      where('connected', '==', true),
      where('fleetGroupId', '==', 'fleet-1'),
    )));
    await assertSucceeds(getDocs(query(
      collection(as('alice'), `${SESSION}/players`),
      where('connected', '==', true),
      where('fleetGroupId', '==', 'fleet-2'),
    )));
  });

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

describe('shuttle departure privacy', () => {
  it('scopes an exact pending route to its fleet group and denies enumeration or client writes', async () => {
    const path = `${SESSION}/shuttleDepartures/starlight`;
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `${SESSION}/players/foreign`), {
        uid: 'foreign', role: 'player', displayName: 'Foreign Group', seatId: null,
        fleetGroupId: 'fleet-2', connected: true,
      });
      await setDoc(doc(db, path), {
        status: 'requested', requestId: 'departure-1', shuttleId: 'starlight',
        holderUid: 'alice', fleetGroupId: 'fleet-1', originShipId: 'aegis',
        destinationShipId: 'icebreaker', cycle: 2, controlRevision: 1,
        requestedAt: '2026-09-21T05:00:00.000Z',
      });
    });

    await assertSucceeds(getDoc(doc(as('alice'), path)));
    await assertSucceeds(getDoc(doc(as('gm1'), path)));
    await assertFails(getDoc(doc(as('foreign'), path)));
    await assertFails(getDoc(doc(as('stranger'), path)));
    await assertFails(getDocs(collection(as('alice'), `${SESSION}/shuttleDepartures`)));
    await assertFails(setDoc(doc(as('alice'), path), { destinationShipId: 'dione' }));
    await assertFails(updateDoc(doc(as('gm1'), path), { destinationShipId: 'dione' }));
    await assertFails(deleteDoc(doc(as('gm1'), path)));
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

  it('keeps ship-console write grants server-only', async () => {
    const grant = `${SESSION}/gmInstances/bridge/private/shipConsoleWriteGrant`;
    for (const uid of ['alice', 'gm1', 'observer', 'stranger']) {
      await assertFails(getDoc(doc(as(uid), grant)));
    }
    await assertFails(getDocs(collection(as('alice'), `${SESSION}/gmInstances/bridge/private`)));
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
    await assertSucceeds(getDoc(doc(as('gm1'), `${SESSION}/secrets/wolf-assignment`)));
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/secrets/wolf-assignment`)));
  });

  it('revokes GM-private reads after the allowlisted GM is demoted', async () => {
    await assertSucceeds(getDoc(doc(as('gm1'), `${SESSION}/secrets/setup-receipt-start-1`)));
    await assertSucceeds(getDoc(doc(as('gm1'), `${SESSION}/secrets/wolf-assignment`)));

    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `${SESSION}/players/gm1`), { role: 'player' });
    });

    await assertFails(getDoc(doc(as('gm1'), `${SESSION}/secrets/setup-receipt-start-1`)));
    await assertFails(getDoc(doc(as('gm1'), `${SESSION}/secrets/wolf-assignment`)));
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

  it('keeps reciprocal Friend cards private to their exact holders', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), `${SESSION}/secrets/loyalty-alice-friend`)));
    await assertSucceeds(getDoc(doc(as('press'), `${SESSION}/secrets/loyalty-press-friend`)));
    await assertFails(getDoc(doc(as('press'), `${SESSION}/secrets/loyalty-alice-friend`)));
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/secrets/loyalty-press-friend`)));
    await assertFails(getDoc(doc(as('gm1'), `${SESSION}/secrets/loyalty-alice-friend`)));
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

it('denies connected member reads and listing of the server-owned craft manifest', async () => {
  const db = as('alice');
  await assertFails(getDoc(doc(db, SESSION + '/craftOwnership/manifest')));
  await assertFails(getDocs(collection(db, SESSION + '/craftOwnership')));
});

it('keeps the authoritative mission deck server-only, including from GMs', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `${SESSION}/serverState/missionDeck`), {
      schemaVersion: 1,
      deckId: 'away-mission-v1',
      order: ['A♥'],
    });
  });

  for (const uid of ['alice', 'gm1']) {
    const db = as(uid);
    const deck = doc(db, `${SESSION}/serverState/missionDeck`);
    await assertFails(getDoc(deck));
    await assertFails(setDoc(deck, { forged: true }));
    await assertFails(updateDoc(deck, { forged: true }));
    await assertFails(deleteDoc(deck));
    await assertFails(getDocs(collection(db, `${SESSION}/serverState`)));
  }
});

it('keeps away-mission hands private to the participant and current GMs', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `${SESSION}/awayMissionHands/mission-1-alice`), {
      type: 'away-mission-hand',
      sessionId: 's1',
      missionId: 'mission-1',
      participantUid: 'alice',
      cardId: 'A♥',
      rank: 'A',
      suit: 'hearts',
      value: 10,
    });
    await setDoc(doc(db, `${SESSION}/players/gm2`), {
      uid: 'gm2', role: 'gm', connected: true,
    });
  });

  const handPath = `${SESSION}/awayMissionHands/mission-1-alice`;
  await assertSucceeds(getDoc(doc(as('alice'), handPath)));
  await assertSucceeds(getDoc(doc(as('gm1'), handPath)));
  await assertFails(getDoc(doc(as('bob'), handPath)));
  await assertFails(getDocs(collection(as('alice'), `${SESSION}/awayMissionHands`)));

  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), `${SESSION}/players/gm1`), { role: 'player' });
  });
  await assertFails(getDoc(doc(as('gm1'), handPath)));
  await assertSucceeds(getDoc(doc(as('gm2'), handPath)));
});

it('keeps overlapping away-mission pointers private and revokes stale GM access', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const pointer = (missionId: string, handId: string) => ({
      type: 'away-mission-hand-pointer',
      sessionId: 's1',
      participantUid: 'alice',
      missionId,
      handId,
      phase: 'discarding',
      revision: 1,
      discarded: false,
    });
    await setDoc(doc(db, `${SESSION}/awayMissionHandPointers/m9_mission-1u5_alice`), pointer('mission-1', 'm9_mission-1u5_alice'));
    await setDoc(doc(db, `${SESSION}/awayMissionHandPointers/m9_mission-2u5_alice`), pointer('mission-2', 'm9_mission-2u5_alice'));
    await setDoc(doc(db, `${SESSION}/awayMissionHandPointers/wrong-session`), {
      type: 'away-mission-hand-pointer', participantUid: 'alice', missionId: 'mission-x',
      handId: 'm9_mission-xu5_alice', phase: 'discarding', revision: 1, discarded: false,
      sessionId: 's2',
    });
  });

  const pointers = `${SESSION}/awayMissionHandPointers`;
  await assertSucceeds(getDoc(doc(as('alice'), `${pointers}/m9_mission-1u5_alice`)));
  await assertSucceeds(getDoc(doc(as('alice'), `${pointers}/m9_mission-2u5_alice`)));
  await assertFails(getDoc(doc(as('bob'), `${pointers}/m9_mission-1u5_alice`)));
  await assertSucceeds(getDoc(doc(as('gm1'), `${pointers}/m9_mission-1u5_alice`)));
  const gmPointers = await assertSucceeds(getDocs(query(
    collection(as('gm1'), pointers),
    where('sessionId', '==', 's1'),
  )));
  expect(gmPointers.docs.map((entry) => entry.id).sort()).toEqual([
    'm9_mission-1u5_alice', 'm9_mission-2u5_alice',
  ]);
  const alicePointers = await assertSucceeds(getDocs(query(
    collection(as('alice'), pointers),
    where('participantUid', '==', 'alice'),
    where('sessionId', '==', 's1'),
  )));
  expect(alicePointers.docs.map((entry) => entry.id).sort()).toEqual([
    'm9_mission-1u5_alice', 'm9_mission-2u5_alice',
  ]);
  await assertFails(getDocs(query(collection(as('gm1'), pointers), where('participantUid', '==', 'alice'))));
  await assertFails(getDocs(collection(as('alice'), pointers)));

  for (const uid of ['alice', 'gm1']) {
    await assertFails(setDoc(doc(as(uid), `${pointers}/forged`), { forged: true }));
    await assertFails(updateDoc(doc(as(uid), `${pointers}/m9_mission-1u5_alice`), { phase: 'assignment-ready' }));
    await assertFails(deleteDoc(doc(as(uid), `${pointers}/m9_mission-1u5_alice`)));
  }

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `${SESSION}/awayMissionHandPointers/field-mismatch`), {
      type: 'away-mission-hand-pointer', sessionId: 's1', participantUid: 'bob',
      missionId: 'mission-x', handId: 'm9_mission-xu3_bob', phase: 'discarding',
      revision: 1, discarded: false,
    });
  });
  await assertFails(getDoc(doc(as('alice'), `${pointers}/wrong-session`)));
  await assertFails(getDoc(doc(as('alice'), `${pointers}/field-mismatch`)));
  await assertFails(getDoc(doc(as('gm1'), `${pointers}/wrong-session`)));
  await assertFails(getDoc(doc(as('gm1'), `${pointers}/field-mismatch`)));

  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), `${SESSION}/players/gm1`), { role: 'player' });
  });
  await assertFails(getDoc(doc(as('gm1'), `${pointers}/m9_mission-1u5_alice`)));
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), `${SESSION}/players/gm1`), { role: 'gm', connected: false });
  });
  await assertFails(getDoc(doc(as('gm1'), `${pointers}/m9_mission-1u5_alice`)));
});

it('keeps Dione VIP hands private to the owner and server-written', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `${SESSION}/vipHands/alice`), {
      sessionId: 's1', ownerUid: 'alice', revision: 1,
      cards: [{ id: 'party-deck', name: 'Party Deck', status: 'available' }],
    });
  });

  const handPath = `${SESSION}/vipHands/alice`;
  await assertSucceeds(getDoc(doc(as('alice'), handPath)));
  await assertFails(getDoc(doc(as('press'), handPath)));
  await assertFails(getDoc(doc(as('gm1'), handPath)));
  await assertFails(getDocs(collection(as('alice'), `${SESSION}/vipHands`)));
  await assertFails(setDoc(doc(as('alice'), handPath), { forged: true }));
  await assertFails(updateDoc(doc(as('alice'), handPath), { cards: [] }));
  await assertFails(deleteDoc(doc(as('alice'), handPath)));
});

describe('complete server-owned denial matrix', () => {
  it('keeps destroyed-ship store reconciliation private from players and GMs', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), SESSION + '/shipStoreScavenges/aegis'), {
        sourceShipId: 'aegis', transfers: [{ recipientShipId: 'dione' }],
      });
      await setDoc(doc(ctx.firestore(), SESSION + '/shipStoreScavenges/aegis/audit/scavenge-1'), {
        requestId: 'scavenge-1', actorUid: 'gm1',
      });
    });
    for (const uid of ['alice', 'gm1']) {
      const db = as(uid);
      for (const path of [
        SESSION + '/shipStoreScavenges/aegis',
        SESSION + '/shipStoreScavenges/aegis/audit/scavenge-1',
      ]) {
        await assertFails(getDoc(doc(db, path)));
        await assertFails(setDoc(doc(db, path), { forged: true }));
        await assertFails(deleteDoc(doc(db, path)));
      }
    }
  });

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

  it('denies clients from forging final-turn lifecycle state or terminal receipts', async () => {
    for (const uid of ['alice', 'gm1']) {
      await assertFails(updateDoc(doc(as(uid), SESSION), {
        phase: 'debrief',
        currentTurn: 6,
        turnPhase: {
          turn: 6,
          airspace: { state: 'lifted' },
        },
        turnState: {
          currentTurn: 6,
          maxTurn: 6,
          phase: 'coordination',
        },
        turnStartAnnouncement: {
          turn: 6,
          survivorPopulation: 242500,
        },
      }));
      await assertFails(setDoc(doc(as(uid), SESSION + '/commandReceipts/final-turn-1'), {
        fingerprint: { action: 'advance-turn' },
        result: { currentTurn: 6, phase: 'debrief' },
      }));
    }
  });

  it('denies every client write to authority-only collections', async () => {
    const db = as('alice');
    const targets = [
      SESSION + '/events/forged',
      SESSION + '/maintenanceRequests/maintenance-1',
      SESSION + '/voyage33MaintenanceRequests/maintenance-1',
      SESSION + '/damageDraws/forged',
      SESSION + '/seats/seat1',
      SESSION + '/shipConfetti/aegis',
      SESSION + '/maintenanceUndo/aegis',
      SESSION + '/craftOwnership/manifest',
      SESSION + '/fleetGroups/fleet-1',
      SESSION + '/shipStoreScavenges/aegis',
      SESSION + '/shipStoreScavenges/aegis/audit/scavenge-1',
      SESSION + '/shuttleControlRequests/handoff-1',
      SESSION + '/shuttleControlAudit/handoff-1',
      SESSION + '/arbourVisionAuthority/current',
      'joinCodes/482109',
      'activeMemberships/alice',
    ];

    for (const path of targets) {
      const target = doc(db, path);
      await assertFails(setDoc(target, { forged: true }));
      await assertFails(deleteDoc(target));
    }
  });

  it('keeps shuttle-control receipts private and exposes server audits only to the GM', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `${SESSION}/shuttleControlRequests/handoff-1`), { private: true });
      await setDoc(doc(ctx.firestore(), `${SESSION}/shuttleControlAudit/handoff-1`), {
        type: 'shuttle-control-audit', shuttleId: 'starlight', holderUid: 'alice',
      });
    });
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/shuttleControlRequests/handoff-1`)));
    await assertFails(getDoc(doc(as('gm1'), `${SESSION}/shuttleControlRequests/handoff-1`)));
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/shuttleControlAudit/handoff-1`)));
    await assertSucceeds(getDoc(doc(as('gm1'), `${SESSION}/shuttleControlAudit/handoff-1`)));
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
      'voyage33MaintenanceRequests',
      'damageDraws',
      'gmInstances',
      'secrets',
      'shipConfetti',
      'craftOwnership',
      'fleetGroups',
      'shipStoreScavenges',
      'shuttleControlRequests',
      'shuttleControlAudit',
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
    for (const field of ['currentTurn', 'maintenanceCycles', 'voyage33Maintenance', 'shuttleCargo', 'shuttleFuelled', 'shipUpgrades', 'pressDispatch', 'fleetTicker']) {
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
