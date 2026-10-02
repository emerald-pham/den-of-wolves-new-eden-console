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
  readonly writes: Array<{ kind: 'set' | 'update' | 'delete'; path: string; value?: Stored }> = [];
  failWritePath: string | undefined;
  private tail: Promise<unknown> = Promise.resolve();

  doc(path: string) {
    return { path };
  }

  runTransaction<T>(work: (tx: unknown) => Promise<T>): Promise<T> {
    const transaction = this.tail.then(async () => {
      const staged: Array<{ kind: 'set' | 'update' | 'delete'; path: string; value?: Stored; mergeFields?: string[] }> = [];
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
        set: (reference: { path: string }, value: Stored, options?: { mergeFields?: string[] }) => {
          if (reference.path === this.failWritePath) throw new Error('simulated transaction write failure');
          staged.push({ kind: 'set', path: reference.path, value: structuredClone(value), mergeFields: options?.mergeFields });
        },
        update: (reference: { path: string }, value: Stored) => {
          if (!this.documents.has(reference.path)) throw new Error('document missing');
          if (reference.path === this.failWritePath) throw new Error('simulated transaction write failure');
          staged.push({ kind: 'update', path: reference.path, value: structuredClone(value) });
        },
        delete: (reference: { path: string }) => {
          if (reference.path === this.failWritePath) throw new Error('simulated transaction write failure');
          staged.push({ kind: 'delete', path: reference.path });
        },
      };

      const result = await work(tx);
      for (const write of staged) {
        this.writes.push(write);
        if (write.kind === 'delete') this.documents.delete(write.path);
        else if (write.kind === 'set') {
          if (write.mergeFields) this.applyMaskedSet(write.path, write.value!, write.mergeFields);
          else this.documents.set(write.path, write.value!);
        } else this.applyUpdate(write.path, write.value!);
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
      if (isDeleteField(value)) delete target[segments.at(-1)!];
      else target[segments.at(-1)!] = structuredClone(value);
    }
    this.documents.set(path, next);
  }

  private applyMaskedSet(path: string, value: Stored, fields: string[]) {
    const next = structuredClone(this.documents.get(path) ?? {});
    for (const field of fields) {
      const fieldValue = value[field];
      if (isDeleteField(fieldValue)) delete next[field];
      else if (fieldValue !== undefined) next[field] = structuredClone(fieldValue);
    }
    this.documents.set(path, next);
  }
}

function isDeleteField(value: unknown): boolean {
  return typeof value === 'object' && value !== null && (value as { __deleteField?: boolean }).__deleteField === true;
}

const sessionPath = 'sessions/s1';
const navigationPath = navigationStateDocumentPath('s1');
const movementPath = 'sessions/s1/serverState/voyage33Movement';
const gmDiscoveryPath = 'sessions/s1/gmDiscovery/current';
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
    cycle: { ...state.cycle, turn: 2, charges: ['hydroponics'] },
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
  db.documents.set(gmDiscoveryPath, {
    shipGalacticCoordinates: { aegis: '0000', dione: '0000' },
    shipNavigationLogs: { aegis: [{ turn: 1, coordinate: '0000' }] },
    knownSystems: { LYS: '0000' },
    revision: 4,
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
    deleteField: () => ({ __deleteField: true }),
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
    expect(committed).not.toHaveProperty('voyage33Movement');
    expect(committed).toMatchObject({ voyage33Maintenance: { hostShipId: 'aegis', dockingRevision: 1 } });
    expect(db.documents.get(movementPath)).toMatchObject({
      movementState: { coordinate: '0000', revision: 0 },
    });
    expect(db.documents.get(gmDiscoveryPath)).toMatchObject({
      voyage33Movement: { coordinate: '0000', revision: 0 },
      voyage33MovementSessionId: 's1',
      shipNavigationLogs: { aegis: [{ turn: 1, coordinate: '0000' }] },
      knownSystems: { LYS: '0000' },
    });
    expect(db.documents.has('sessions/s1/voyage33MovementRequests/dock-1')).toBe(true);
    expect(db.documents.get('sessions/s1/commandReceipts/dock-1')).toMatchObject({
      fingerprint: {
        action: 'dock-voyage-33-0', sessionId: 's1', requestId: 'dock-1', actorUid: 'u1',
        instanceId: null, expectedRevision: 0,
        payload: { shipId: VOYAGE_33_ID, expectedDockingRevision: 0, hostShipId: 'aegis', destination: null },
      },
      result: { status: 'committed', sessionId: 's1', requestId: 'dock-1' },
    });
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
        cycle: { revision: 1, charges: ['hydroponics'] },
      },
      transition: { shipId: VOYAGE_33_ID, origin: '0000', destination, id: 'voyage-jump-jump-1' },
      fuelSpent: cost,
    });
    expect(db.documents.get('sessions/s1/commandReceipts/jump-1')).toMatchObject({
      fingerprint: {
        action: 'jump-voyage-33-0', sessionId: 's1', requestId: 'jump-1', actorUid: 'u1',
        instanceId: null, expectedRevision: 0,
        payload: { shipId: VOYAGE_33_ID, expectedDockingRevision: 3, hostShipId: 'aegis', destination },
      },
      result: { status: 'jumped', sessionId: 's1', requestId: 'jump-1' },
    });
    expect(result).not.toHaveProperty('actorUid');
    expect(result).not.toHaveProperty('fingerprint');
    expect(result).not.toHaveProperty('hostResources');
    expect(db.documents.get(sessionPath)).not.toHaveProperty('voyage33Movement');
    expect(db.documents.get(sessionPath)).toMatchObject({
      shipResources: { aegis: { fuel: 0 } },
      voyage33Maintenance: { hostShipId: null, dockingRevision: 4 },
    });
    expect(db.documents.get(movementPath)).toMatchObject({ movementState: { coordinate: destination, revision: 1 } });
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
    const afterLegacyMigration = structuredClone(db.documents.get(sessionPath)!);
    delete afterLegacyMigration.voyage33Movement;
    const beforeWithoutLegacyCoordinate = structuredClone(before);
    delete beforeWithoutLegacyCoordinate.voyage33Movement;
    beforeWithoutLegacyCoordinate.updatedAt = 'server-time';
    expect(afterLegacyMigration).toEqual(beforeWithoutLegacyCoordinate);
    expect(db.documents.get(movementPath)).toMatchObject({ movementState: emptyVoyage33MovementState('0000') });
    await expect(callables.jumpVoyage33(request({
      ...jumpRequest, requestId: 'stale-dock', expectedDockingRevision: 2,
    }))).resolves.toMatchObject({
      status: 'stale', expectedDockingRevision: 2, currentDockingRevision: 3,
    });
    expect(db.documents.get('sessions/s1/commandReceipts/stale-dock')).toMatchObject({
      fingerprint: {
        action: 'jump-voyage-33-0', requestId: 'stale-dock', actorUid: 'u1',
      },
      result: { status: 'stale', requestId: 'stale-dock' },
    });
    expect(db.documents.get(sessionPath)).not.toHaveProperty('voyage33Movement');
    expect(db.documents.get(sessionPath)).toMatchObject({ updatedAt: 'server-time' });
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

  it('rejects a client-resolved result but permits an uncharged legal Voyage jump', async () => {
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
      .resolves.toMatchObject({ status: 'jumped', fuelSpent: 1 });
    expect(db.writes).toHaveLength(0);
    expect(uncharged.db.writes.length).toBeGreaterThan(0);
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

  it.each([
    ['domain receipt', 'sessions/s1/voyage33MovementRequests/atomic'],
    ['shared command marker', 'sessions/s1/commandReceipts/atomic'],
  ])('keeps the movement and host ledger unchanged if writing the %s fails', async (_label, failWritePath) => {
    const { db, callables } = seed();
    const before = structuredClone(db.documents.get(sessionPath));
    db.failWritePath = failWritePath;
    await expect(callables.jumpVoyage33(request({ ...jumpRequest, requestId: 'atomic' })))
      .rejects.toThrow('simulated transaction write failure');
    expect(db.documents.get(sessionPath)).toEqual(before);
    expect(db.documents.has(db.failWritePath)).toBe(false);
    expect(db.writes).toHaveLength(0);
  });

  it.each([
    ['another action', 'record-player-action', 'u1', 'failed-precondition'],
    ['the same action from another actor', 'jump-voyage-33-0', 'u2', 'permission-denied'],
  ])('rejects a shared request-id marker for %s before movement mutation', async (_label, action, actorUid, code) => {
    const { db, callables } = seed();
    db.documents.set('sessions/s1/commandReceipts/jump-1', {
      fingerprint: {
        action,
        sessionId: 's1',
        requestId: 'jump-1',
        actorUid,
        instanceId: null,
        expectedRevision: 0,
        payload: { command: 'existing' },
      },
      result: { status: 'committed' },
    });
    const before = structuredClone(db.documents.get(sessionPath));
    await expect(callables.jumpVoyage33(request(jumpRequest))).rejects.toMatchObject({ code });
    expect(db.documents.get(sessionPath)).toEqual(before);
    expect(db.documents.has('sessions/s1/voyage33MovementRequests/jump-1')).toBe(false);
    expect(db.writes).toHaveLength(0);
  });

  it('serializes competing jumps so only one request can spend the host ledger at a revision', async () => {
    const { db, callables } = seed();
    const [left, right] = await Promise.all([
      callables.jumpVoyage33(request({ ...jumpRequest, requestId: 'compete-a' })),
      callables.jumpVoyage33(request({ ...jumpRequest, requestId: 'compete-b' })),
    ]);
    expect([left.status, right.status].sort()).toEqual(['jumped', 'stale']);
    expect(db.documents.get(sessionPath)).not.toHaveProperty('voyage33Movement');
    expect(db.documents.get(sessionPath)).toMatchObject({
      shipResources: { aegis: { fuel: 1 } },
      voyage33Maintenance: { dockingRevision: 4 },
    });
    expect(db.documents.get(movementPath)).toMatchObject({ movementState: { revision: 1 } });
  });
});
