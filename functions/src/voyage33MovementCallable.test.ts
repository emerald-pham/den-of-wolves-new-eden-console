import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import { emptyVoyage33MovementState } from './voyage33Movement';
import { VOYAGE_33_ID, VOYAGE_33_COMMITMENTS } from './voyageAdmission';
import { emptyVoyage33MaintenanceState } from './voyage33Maintenance';
import { navigationStateDocumentPath } from './navigationProjection';
import { createVoyage33MovementCallables } from './voyage33MovementCallable';

type Stored = Record<string, unknown>;

class MemoryFirestore {
  readonly documents = new Map<string, Stored>();
  readonly writes: Array<{ kind: 'set' | 'update'; path: string; value: Stored }> = [];
  failWritePath: string | undefined;
  private tail: Promise<unknown> = Promise.resolve();

  doc(path: string) {
    return { path };
  }

  runTransaction<T>(work: (tx: unknown) => Promise<T>): Promise<T> {
    const transaction = this.tail.then(async () => {
      const staged: Array<{ kind: 'set' | 'update'; path: string; value: Stored }> = [];
      const tx = {
        get: async (reference: { path: string }) => {
          const value = this.documents.get(reference.path);
          const data = value === undefined ? undefined : structuredClone(value);
          return {
            exists: data !== undefined,
            id: reference.path.split('/').at(-1),
            ref: reference,
            get: (key: string) => data?.[key],
            data: () => data,
          };
        },
        set: (reference: { path: string }, value: Stored) => {
          if (reference.path === this.failWritePath) throw new Error('simulated transaction write failure');
          staged.push({ kind: 'set', path: reference.path, value: structuredClone(value) });
        },
        update: (reference: { path: string }, value: Stored) => {
          if (!this.documents.has(reference.path)) throw new Error('document missing');
          if (reference.path === this.failWritePath) throw new Error('simulated transaction write failure');
          staged.push({ kind: 'update', path: reference.path, value: structuredClone(value) });
        },
      };

      const result = await work(tx);
      for (const write of staged) {
        this.writes.push(write);
        if (write.kind === 'set') this.documents.set(write.path, write.value);
        else this.applyUpdate(write.path, write.value);
      }
      return result;
    });
    this.tail = transaction.then(() => undefined, () => undefined);
    return transaction;
  }

  private applyUpdate(path: string, patch: Stored) {
    const previous = this.documents.get(path)!;
    const next = structuredClone(previous);
    for (const [fieldPath, value] of Object.entries(patch)) {
      const segments = fieldPath.split('.');
      let target = next;
      for (const segment of segments.slice(0, -1)) {
        const child = target[segment];
        target[segment] = typeof child === 'object' && child !== null && !Array.isArray(child)
          ? child
          : {};
        target = target[segment] as Stored;
      }
      target[segments.at(-1)!] = structuredClone(value);
    }
    this.documents.set(path, next);
  }
}

const sessionPath = 'sessions/s1';
const navigationPath = navigationStateDocumentPath('s1');
const currentTime = new Date('2026-09-30T15:00:00.000Z');
const admission = {
  type: 'voyage-admission',
  sessionId: 's1',
  id: VOYAGE_33_ID,
  status: 'admitted',
  crisisId: 'approach-1',
  crisisRevision: 2,
  population: 40_000,
  unrest: 0,
  hostShipId: null,
  commitments: VOYAGE_33_COMMITMENTS,
};

function phase(state: 'restricted' | 'lifted', turn = 2) {
  return {
    turn,
    teamPhaseEndsAt: '2026-09-30T15:10:00.000Z',
    openAirspaceEndsAt: '2026-09-30T15:30:00.000Z',
    airspace: { state, tickerActive: true, pressAccess: false },
  };
}

function maintenance(hostShipId: string | null = 'aegis', dockingRevision = 3) {
  const state = emptyVoyage33MaintenanceState(hostShipId);
  return {
    ...state,
    dockingRevision,
    cycle: { ...state.cycle, turn: 2, charges: ['jump-drive'] },
  };
}

function session(overrides: Stored = {}): Stored {
  return {
    phase: 'active',
    currentTurn: 2,
    turnPhase: phase('lifted'),
    activeVesselIds: ['aegis', 'dione'],
    admittedVesselIds: [VOYAGE_33_ID],
    voyage33Admission: admission,
    voyage33Movement: emptyVoyage33MovementState('0000'),
    voyage33Maintenance: maintenance(),
    shipResources: {
      aegis: { ore: 0, fuel: 2, food: 8, water: 6, materials: 1, securityTeams: 2 },
      dione: { ore: 0, fuel: 2, food: 8, water: 6, materials: 1, securityTeams: 2 },
    },
    shipDamage: {
      aegis: { damagedSystemIds: [], destroyed: false },
      dione: { damagedSystemIds: [], destroyed: false },
    },
    ...overrides,
  };
}

function seed(overrides: Stored = {}) {
  const db = new MemoryFirestore();
  db.documents.set(sessionPath, session(overrides));
  db.documents.set(navigationPath, {
    shipGalacticCoordinates: { aegis: '0000', dione: '0000' },
    shipNavigationLogs: {},
  });
  const requireShipCounterAuthority = vi.fn(async (_tx: unknown, _sessionId: string, uid: string) => {
    if (uid !== 'u1') throw new HttpsError('permission-denied', 'Active ship authority required.');
  });
  const callables = createVoyage33MovementCallables({
    db: db as never,
    requireUid: (auth) => {
      if (!auth?.uid) throw new HttpsError('unauthenticated', 'Sign in first.');
      return auth.uid;
    },
    requireShipCounterAuthority,
    serverTimestamp: () => 'server-time',
    now: () => currentTime,
  });
  return { db, callables, requireShipCounterAuthority };
}

function request(data: Stored, uid = 'u1') {
  return { data, auth: { uid } };
}

const dockRequest = {
  sessionId: 's1', shipId: VOYAGE_33_ID, hostShipId: 'aegis',
  requestId: 'dock-1', expectedMovementRevision: 0, expectedDockingRevision: 0,
};

const jumpRequest = {
  sessionId: 's1', shipId: VOYAGE_33_ID, hostShipId: 'aegis', destination: '5143',
  requestId: 'jump-1', expectedMovementRevision: 0, expectedDockingRevision: 3,
};

describe('Voyage 33-0 movement callable adapter', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('docks the admitted vessel during Team at the live host system and replays exactly once', async () => {
    const initial = session({
      turnPhase: phase('restricted'),
      voyage33Movement: undefined,
      voyage33Maintenance: emptyVoyage33MaintenanceState(),
    });
    const { db, callables } = seed(initial);
    await expect(callables.dockVoyage33(request(dockRequest))).resolves.toMatchObject({
      status: 'committed',
      movementState: { id: VOYAGE_33_ID, coordinate: '0000', revision: 0 },
      maintenanceState: { hostShipId: 'aegis', dockingRevision: 1 },
    });

    const committed = db.documents.get(sessionPath)!;
    expect(committed).toMatchObject({
      voyage33Movement: { coordinate: '0000', revision: 0 },
      voyage33Maintenance: { hostShipId: 'aegis', dockingRevision: 1 },
    });
    expect(db.documents.has('sessions/s1/voyage33MovementRequests/dock-1')).toBe(true);
    const writesBeforeReplay = db.writes.length;
    await expect(callables.dockVoyage33(request(dockRequest))).resolves.toMatchObject({ status: 'replayed' });
    expect(db.writes).toHaveLength(writesBeforeReplay);
  });

  it.each([
    ['missing admission', { voyage33Admission: undefined }],
    ['wrong session admission', { voyage33Admission: { ...admission, sessionId: 'another-session' } }],
    ['Coordination phase', { turnPhase: phase('lifted') }],
    ['stale Team clock', { currentTurn: 3, turnPhase: phase('restricted', 2) }],
  ])('rejects docking with %s before any write', async (_label, overrides) => {
    const { db, callables } = seed({ ...session({ turnPhase: phase('restricted') }), ...overrides });
    await expect(callables.dockVoyage33(request(dockRequest))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(db.writes).toHaveLength(0);
  });

  it('does not move Voyage through a different or missing session id', async () => {
    const { db, callables } = seed({ turnPhase: phase('restricted') });
    await expect(callables.dockVoyage33(request({ ...dockRequest, sessionId: 's2' })))
      .rejects.toMatchObject({ code: 'not-found' });
    expect(db.writes).toHaveLength(0);
  });

  it.each([
    ['non-core host', 'warrior', ['aegis', 'dione'], { aegis: { damagedSystemIds: [], destroyed: false } }],
    ['inactive host', 'dione', ['aegis'], { aegis: { damagedSystemIds: [], destroyed: false } }],
    ['destroyed host', 'aegis', ['aegis'], { aegis: { damagedSystemIds: [], destroyed: true } }],
  ])('rejects docking with an invalid %s', async (_label, hostShipId, activeVesselIds, shipDamage) => {
    const { db, callables } = seed({
      turnPhase: phase('restricted'), activeVesselIds, shipDamage,
    });
    await expect(callables.dockVoyage33(request({ ...dockRequest, hostShipId })))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(db.writes).toHaveLength(0);
  });

  it('requires the active host operator and does not disclose state to another actor', async () => {
    const { db, callables, requireShipCounterAuthority } = seed({ turnPhase: phase('restricted') });
    await expect(callables.dockVoyage33(request(dockRequest, 'u2')))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(requireShipCounterAuthority).toHaveBeenCalledWith(
      expect.anything(), 's1', 'u2', 'aegis', undefined,
    );
    expect(db.writes).toHaveLength(0);
  });

  it.each([
    ['short', '5143', 1],
    ['medium', '9997', 1],
    ['long', '4888', 2],
  ] as const)('server-resolves a %s jump and spends exactly %i host fuel', async (_length, destination, cost) => {
    const { db, callables } = seed({
      shipResources: {
        aegis: { ore: 0, fuel: cost, food: 8, water: 6, materials: 1, securityTeams: 2 },
        dione: { ore: 0, fuel: 2, food: 8, water: 6, materials: 1, securityTeams: 2 },
      },
    });
    const result = await callables.jumpVoyage33(request({ ...jumpRequest, destination }));
    expect(result).toMatchObject({
      status: 'jumped',
      movementState: { coordinate: destination, revision: 1, jumpState: { lastJumpTurn: 2 } },
      maintenanceState: {
        hostShipId: null, dockingRevision: 4,
        cycle: { revision: 1, charges: [] },
      },
      transition: { shipId: VOYAGE_33_ID, origin: '0000', destination, id: 'voyage-jump-jump-1' },
      fuelSpent: cost,
    });
    expect(result).not.toHaveProperty('actorUid');
    expect(result).not.toHaveProperty('fingerprint');
    expect(result).not.toHaveProperty('hostResources');
    expect(db.documents.get(sessionPath)).toMatchObject({
      shipResources: { aegis: { fuel: 0 } },
      voyage33Movement: { coordinate: destination, revision: 1 },
      voyage33Maintenance: { hostShipId: null, dockingRevision: 4 },
    });
  });

  it('rejects insufficient host fuel without movement, undocking, or a partial debit', async () => {
    const { db, callables } = seed({
      shipResources: {
        aegis: { ore: 0, fuel: 1, food: 8, water: 6, materials: 1, securityTeams: 2 },
        dione: { ore: 0, fuel: 2, food: 8, water: 6, materials: 1, securityTeams: 2 },
      },
    });
    const before = structuredClone(db.documents.get(sessionPath));
    await expect(callables.jumpVoyage33(request({ ...jumpRequest, destination: '4888' })))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(db.documents.get(sessionPath)).toEqual(before);
    expect(db.writes).toHaveLength(0);
  });

  it('rejects stale movement and docking revisions without mutating state', async () => {
    const { db, callables } = seed();
    const before = structuredClone(db.documents.get(sessionPath));
    await expect(callables.jumpVoyage33(request({ ...jumpRequest, expectedMovementRevision: 1 })))
      .resolves.toMatchObject({ status: 'stale', expectedMovementRevision: 1, currentMovementRevision: 0 });
    expect(db.documents.get(sessionPath)).toEqual(before);
    await expect(callables.jumpVoyage33(request({
      ...jumpRequest, requestId: 'stale-dock', expectedDockingRevision: 2,
    }))).resolves.toMatchObject({
      status: 'stale', expectedDockingRevision: 2, currentDockingRevision: 3,
    });
    expect(db.documents.get(sessionPath)).toEqual(before);
  });

  it.each([
    ['missing admission', { voyage33Admission: undefined }],
    ['wrong phase', { turnPhase: phase('restricted') }],
    ['wrong current cycle', { currentTurn: 3, turnPhase: phase('lifted', 2) }],
    ['undocked Voyage', { voyage33Maintenance: maintenance(null, 3) }],
    ['non-core host', { voyage33Maintenance: maintenance('warrior', 3) }],
    ['inactive host', { activeVesselIds: ['dione'] }],
    ['destroyed host', { shipDamage: { aegis: { damagedSystemIds: [], destroyed: true } } }],
  ])('rejects jumping with %s before a write', async (_label, overrides) => {
    const { db, callables } = seed(overrides);
    await expect(callables.jumpVoyage33(request(jumpRequest))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(db.writes).toHaveLength(0);
  });

  it('rejects a client-resolved jump result and requires a server-charged Jump Drive', async () => {
    const { db, callables } = seed();
    const forged = {
      ...jumpRequest,
      jumpResult: {
        status: 'jumped', origin: '0000', destination: '4888', fuelCost: 0,
        remainingFuel: 99, transition: { id: 'forged', shipId: 'aegis' },
      },
    };
    await expect(callables.jumpVoyage33(request(forged))).rejects.toMatchObject({ code: 'invalid-argument' });

    const uncharged = seed({
      voyage33Maintenance: {
        ...maintenance(), cycle: { ...maintenance().cycle, turn: 1, charges: [] },
      },
    });
    await expect(uncharged.callables.jumpVoyage33(request(jumpRequest)))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(db.writes).toHaveLength(0);
    expect(uncharged.db.writes).toHaveLength(0);
  });

  it('does not allow a second jump in the same cycle', async () => {
    const { db, callables } = seed({
      voyage33Movement: { ...emptyVoyage33MovementState('0000'), jumpState: { lastJumpTurn: 2 } },
    });
    await expect(callables.jumpVoyage33(request(jumpRequest)))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(db.writes).toHaveLength(0);
  });

  it('replays an exact jump without a second host-fuel debit and rejects request-id reuse', async () => {
    const { db, callables } = seed();
    const first = await callables.jumpVoyage33(request(jumpRequest));
    await expect(callables.jumpVoyage33(request(jumpRequest))).resolves.toMatchObject({
      ...first, status: 'replayed',
    });
    expect(db.documents.get(sessionPath)).toMatchObject({ shipResources: { aegis: { fuel: 1 } } });
    await expect(callables.jumpVoyage33(request({ ...jumpRequest, destination: '4888' })))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(db.documents.get(sessionPath)).toMatchObject({ shipResources: { aegis: { fuel: 1 } } });
  });

  it('keeps the movement and host ledger unchanged if writing the receipt fails', async () => {
    const { db, callables } = seed();
    const before = structuredClone(db.documents.get(sessionPath));
    db.failWritePath = 'sessions/s1/voyage33MovementRequests/atomic';
    await expect(callables.jumpVoyage33(request({ ...jumpRequest, requestId: 'atomic' })))
      .rejects.toThrow('simulated transaction write failure');
    expect(db.documents.get(sessionPath)).toEqual(before);
    expect(db.documents.has(db.failWritePath)).toBe(false);
    expect(db.writes).toHaveLength(0);
  });

  it('serializes competing jumps so only one request can spend the host ledger at a revision', async () => {
    const { db, callables } = seed();
    const [left, right] = await Promise.all([
      callables.jumpVoyage33(request({ ...jumpRequest, requestId: 'compete-a' })),
      callables.jumpVoyage33(request({ ...jumpRequest, requestId: 'compete-b' })),
    ]);
    expect([left.status, right.status].sort()).toEqual(['jumped', 'stale']);
    expect(db.documents.get(sessionPath)).toMatchObject({
      shipResources: { aegis: { fuel: 1 } },
      voyage33Movement: { revision: 1 },
      voyage33Maintenance: { dockingRevision: 4 },
    });
  });
});
