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
        groupId: 'fleet-1', shipId: 'aegis', knownCoordinates: ['0000'], navigationLogs: [], revision: 1,
      });
      await setDoc(doc(ctx.firestore(), `${SESSION}/playerDiscoveries/press`), {
        groupId: 'fleet-2', shipId: 'dione', knownCoordinates: ['0000'], navigationLogs: [], revision: 1,
      });
      await setDoc(doc(ctx.firestore(), `${SESSION}/gmDiscovery/current`), {
        knownSystems: { 'system-01': '0000' }, organiserSites: { '0000': { code: 'START' } }, revision: 1,
      });
    });

    await assertSucceeds(getDoc(doc(as('alice'), `${SESSION}/playerDiscoveries/alice`)));
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/playerDiscoveries/press`)));
    await assertFails(getDocs(collection(as('alice'), `${SESSION}/playerDiscoveries`)));
    await assertFails(setDoc(doc(as('alice'), `${SESSION}/playerDiscoveries/alice`), { groupId: 'fleet-2' }));
    await assertFails(updateDoc(doc(as('alice'), `${SESSION}/playerDiscoveries/alice`), { groupId: 'fleet-2' }));

    await assertSucceeds(getDoc(doc(as('gm1'), `${SESSION}/gmDiscovery/current`)));
    await assertFails(getDoc(doc(as('alice'), `${SESSION}/gmDiscovery/current`)));
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
      SESSION + '/damageDraws/forged',
      SESSION + '/seats/seat1',
      SESSION + '/shipConfetti/aegis',
      SESSION + '/maintenanceUndo/aegis',
      SESSION + '/craftOwnership/manifest',
      SESSION + '/fleetGroups/fleet-1',
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
      'craftOwnership',
      'fleetGroups',
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
    for (const field of ['currentTurn', 'maintenanceCycles', 'shuttleCargo', 'shuttleFuelled', 'shipUpgrades', 'pressDispatch', 'fleetTicker']) {
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
