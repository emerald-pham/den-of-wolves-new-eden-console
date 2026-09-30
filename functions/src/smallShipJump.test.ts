import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import { emptySmallShipState } from './smallShip';
import { navigationStateDocumentPath } from './navigationProjection';
import { createSmallShipJumpCallables, smallShipMovementDocumentPath } from './smallShipJump';

type Stored = Record<string, unknown>;

class MemoryFirestore {
  readonly documents = new Map<string, Stored>();
  readonly writes: Array<{ kind: 'set' | 'update'; path: string; value: Stored }> = [];
  private tail: Promise<unknown> = Promise.resolve();

  doc(path: string) { return { path }; }

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
          staged.push({ kind: 'set', path: reference.path, value: structuredClone(value) });
        },
        update: (reference: { path: string }, value: Stored) => {
          if (!this.documents.has(reference.path)) throw new Error('document missing');
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
    const next = structuredClone(this.documents.get(path)!);
    for (const [fieldPath, value] of Object.entries(patch)) {
      const segments = fieldPath.split('.');
      let target = next;
      for (const segment of segments.slice(0, -1)) {
        const child = target[segment];
        target[segment] = typeof child === 'object' && child !== null && !Array.isArray(child)
          ? child : {};
        target = target[segment] as Stored;
      }
      target[segments.at(-1)!] = structuredClone(value);
    }
    this.documents.set(path, next);
  }
}

const sessionPath = 'sessions/s1';
const movementPath = smallShipMovementDocumentPath('s1', 'gorgoneion');
const now = new Date('2026-09-30T18:00:00.000Z');

function session(overrides: Stored = {}): Stored {
  const smallShip = emptySmallShipState('gorgoneion', 'aegis');
  smallShip.dockingRevision = 1;
  smallShip.cycle = {
    ...smallShip.cycle, step: 0, revision: 8, turn: 3, charges: ['jump-drive'],
  };
  return {
    phase: 'active', currentTurn: 3,
    turnPhase: {
      turn: 3,
      teamPhaseEndsAt: '2026-09-30T17:30:00.000Z',
      openAirspaceEndsAt: '2026-09-30T18:30:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
    },
    activeVesselIds: ['aegis', 'dione'], expansion: 'base', capybaraEnabled: true,
    chartId: 'A', chartSelectionLocked: true,
    smallShipStates: { gorgoneion: smallShip },
    missionCraftCommitments: {},
    shipResources: {
      aegis: { ore: 0, fuel: 5, food: 8, water: 6, materials: 1, securityTeams: 2 },
      dione: { ore: 0, fuel: 4, food: 8, water: 6, materials: 1, securityTeams: 2 },
    },
    shipDamage: {
      aegis: { damagedSystemIds: [], destroyed: false },
      dione: { damagedSystemIds: [], destroyed: false },
    },
    ...overrides,
  };
}

function movement(coordinate = '0000', revision = 0): Stored {
  return {
    type: 'small-ship-movement', sessionId: 's1', smallShipId: 'gorgoneion',
    coordinate, revision, lastJumpTurn: null, captainArrivalsByUid: {},
  };
}

function seed(overrides: Stored = {}) {
  const db = new MemoryFirestore();
  db.documents.set(sessionPath, session(overrides));
  db.documents.set(navigationStateDocumentPath('s1'), {
    revision: 5,
    shipGalacticCoordinates: { aegis: '0000', dione: '5143' },
    shipNavigationLogs: {},
  });
  db.documents.set('sessions/s1/playerDiscoveries/u1', {
    revision: 5, knownCoordinates: ['0000', '5143', '1413'],
  });
  db.documents.set(movementPath, movement());
  const requireSmallShipCaptainAuthority = vi.fn(async (
    _tx: unknown, _sessionId: string, uid: string, _instanceId: string | undefined,
    _smallShipId: string,
  ) => {
    if (uid !== 'u1') throw new HttpsError('permission-denied', 'Active small-craft Captain required.');
    const playerDoc = db.documents.get('sessions/s1/players/u1') ?? {};
    return {
      player: { get: (key: string) => key in playerDoc ? playerDoc[key] :
        key === 'role' ? 'player' : key === 'replacementRoleId' ? 'gorgoneion-captain' : null },
      session: {
        exists: true,
        get: (key: string) => (db.documents.get(sessionPath) ?? {})[key],
      },
    };
  });
  const callables = createSmallShipJumpCallables({
    db: db as never,
    requireUid: (auth) => {
      if (!auth?.uid) throw new HttpsError('unauthenticated', 'Sign in first.');
      return auth.uid;
    },
    requireSmallShipCaptainAuthority: requireSmallShipCaptainAuthority as never,
    requireSmallShipMode: () => undefined,
    serverTimestamp: () => 'server-time',
    now: () => now,
  });
  return { db, callables, requireSmallShipCaptainAuthority };
}

function request(data: Stored, uid = 'u1') {
  return { data, auth: { uid } };
}

const jump = {
  sessionId: 's1', smallShipId: 'gorgoneion', hostShipId: 'aegis',
  destination: '5143', requestId: 'jump-1', expectedMovementRevision: 0,
  expectedDockingRevision: 1, expectedCycleRevision: 8,
};

describe('small-craft Jump Drive authority', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('commits movement, host fuel, charge consumption, docking, and private arrival knowledge once', async () => {
    const { db, callables } = seed();

    await expect(callables.jumpSmallShip(request(jump))).resolves.toMatchObject({
      status: 'committed', smallShipId: 'gorgoneion', origin: '0000', destination: '5143',
      length: 'short', fuelCost: 1, remainingHostFuel: 4,
      movementRevision: 1, dockingRevision: 2, cycleRevision: 9,
    });
    expect(db.documents.get(sessionPath)).toMatchObject({
      shipResources: { aegis: { fuel: 4 } },
      smallShipStates: { gorgoneion: {
        hostShipId: null, dockingRevision: 2,
        cycle: { revision: 9, charges: [], turn: 3 },
      } },
      activeVesselIds: ['aegis', 'dione'],
    });
    expect(db.documents.get(movementPath)).toMatchObject({
      coordinate: '5143', revision: 1, lastJumpTurn: 3,
      captainArrivalsByUid: { u1: ['0000', '5143'] },
    });
    expect(db.writes.filter((write) => write.path.includes('smallShipJumpRequests/'))).toHaveLength(1);
  });

  it('replays the exact committed request without spending host fuel or charge again', async () => {
    const { db, callables } = seed();
    const first = await callables.jumpSmallShip(request(jump));
    const writeCount = db.writes.length;
    await expect(callables.jumpSmallShip(request(jump))).resolves.toMatchObject({
      ...first as Stored, status: 'replayed',
    });
    expect(db.writes).toHaveLength(writeCount);
    expect(db.documents.get(sessionPath)).toMatchObject({ shipResources: { aegis: { fuel: 4 } } });
  });

  it('offers only the current Captain’s known chart nodes and a GM-safe diagnostic projection', async () => {
    const { db, callables } = seed();
    const view = await callables.getSmallShipJumpWorkspace(request({
      sessionId: 's1', smallShipId: 'gorgoneion',
    }));
    expect(view).toMatchObject({
      viewer: 'captain', currentCoordinate: '0000', hostShipId: 'aegis', hostFuel: 5,
      knownDestinations: [
        { coordinate: '5143', length: 'short', fuelCost: 1 },
        { coordinate: '1413', length: 'short', fuelCost: 1 },
      ],
    });
    expect(view).not.toHaveProperty('organiserSites');
    expect(view).not.toHaveProperty('chartCoordinates');

    db.documents.set('sessions/s1/players/u1', { role: 'gm' });
    const gmView = await callables.getSmallShipJumpWorkspace(request({
      sessionId: 's1', smallShipId: 'gorgoneion', instanceId: 'gm-1',
    }));
    expect(gmView).toMatchObject({ viewer: 'gm', currentCoordinate: '0000', movementRevision: 0 });
    expect(gmView).not.toHaveProperty('knownDestinations');
    expect(gmView).not.toHaveProperty('arrivalCoordinates');
  });

  it('uses the live docked host coordinate instead of a stale detached coordinate', async () => {
    const { db, callables } = seed();
    db.documents.set(navigationStateDocumentPath('s1'), {
      revision: 6, shipGalacticCoordinates: { aegis: '5143', dione: '0000' }, shipNavigationLogs: {},
    });
    db.documents.set('sessions/s1/playerDiscoveries/u1', {
      revision: 6, knownCoordinates: ['0000', '5143', '1413'],
    });
    await expect(callables.getSmallShipJumpWorkspace(request({
      sessionId: 's1', smallShipId: 'gorgoneion',
    }))).resolves.toMatchObject({ currentCoordinate: '5143' });
  });

  it('returns stale when the live host moved after the Captain loaded the jump projection', async () => {
    const { db, callables } = seed();
    db.documents.set(navigationStateDocumentPath('s1'), {
      revision: 6, shipGalacticCoordinates: { aegis: '1413', dione: '5143' }, shipNavigationLogs: {},
    });
    db.documents.set('sessions/s1/playerDiscoveries/u1', {
      revision: 6, knownCoordinates: ['0000', '5143', '1413'],
    });

    await expect(callables.jumpSmallShip(request({ ...jump, expectedOrigin: '0000' }))).resolves.toMatchObject({
      status: 'stale', expectedOrigin: '0000', currentOrigin: '1413',
    });
    expect(db.documents.get(sessionPath)).toMatchObject({ shipResources: { aegis: { fuel: 5 } } });
    expect(db.documents.get(movementPath)).toMatchObject({ coordinate: '0000', revision: 0 });
  });

  it('rejects an uncharted-to-the-Captain destination without writes', async () => {
    const { db, callables } = seed();
    await expect(callables.jumpSmallShip(request({ ...jump, destination: '9997' })))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(db.writes).toHaveLength(0);
  });

  it.each([
    ['small craft', ['gorgoneion']],
    ['docked host', ['aegis']],
  ])('blocks movement when the %s is committed to a mission', async (_label, craftIds) => {
    const { db, callables } = seed({ missionCraftCommitments: [{ craftIds }] });
    await expect(callables.jumpSmallShip(request(jump))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(db.writes).toHaveLength(0);
  });

  it('returns a minimal stale response when movement, docking, or charge context changed', async () => {
    const { db, callables } = seed();
    const state = db.documents.get(sessionPath)!;
    const ships = state.smallShipStates as Stored;
    const current = ships.gorgoneion as Stored;
    (current.cycle as Stored).revision = 9;
    await expect(callables.jumpSmallShip(request(jump))).resolves.toMatchObject({
      status: 'stale', expectedMovementRevision: 0, expectedDockingRevision: 1,
      currentMovementRevision: 0, currentDockingRevision: 1, currentCycleRevision: 9,
    });
    expect(db.documents.get(sessionPath)).toMatchObject({ shipResources: { aegis: { fuel: 5 } } });
    expect(db.documents.get(movementPath)).toMatchObject({ coordinate: '0000', revision: 0 });
  });

  it('fails closed for an uncharged drive, a destroyed host, insufficient host fuel, and a non-Captain', async () => {
    const uncharged = seed();
    const unchargedSession = uncharged.db.documents.get(sessionPath)!;
    const unchargedShips = unchargedSession.smallShipStates as Stored;
    const unchargedCraft = unchargedShips.gorgoneion as Stored;
    (unchargedCraft.cycle as Stored).charges = [];
    await expect(uncharged.callables.jumpSmallShip(request(jump))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(uncharged.db.writes).toHaveLength(0);

    const destroyed = seed({ shipDamage: { aegis: { damagedSystemIds: [], destroyed: true } } });
    await expect(destroyed.callables.jumpSmallShip(request(jump))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(destroyed.db.writes).toHaveLength(0);

    const fuelStarved = seed({ shipResources: {
      aegis: { ore: 0, fuel: 0, food: 8, water: 6, materials: 1, securityTeams: 2 },
    } });
    await expect(fuelStarved.callables.jumpSmallShip(request(jump))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(fuelStarved.db.writes).toHaveLength(0);

    const unauthorized = seed();
    unauthorized.db.documents.set('sessions/s1/players/u1', { role: 'player', replacementRoleId: 'aegis-admiral' });
    await expect(unauthorized.callables.jumpSmallShip(request(jump))).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(unauthorized.db.writes).toHaveLength(0);
  });
});
