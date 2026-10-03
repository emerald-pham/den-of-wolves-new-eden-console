import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const mock = vi.hoisted(() => {
  class MockTimestamp {
    constructor(private readonly value: Date) {}

    static fromDate(value: Date) {
      return new MockTimestamp(value);
    }

    static now() {
      return new MockTimestamp(new Date());
    }

    toDate() {
      return this.value;
    }
  }

  return {
    get: vi.fn(),
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    enforceReadOrder: false,
    committedWrites: new Map<string, { fields: Record<string, unknown>; replace: boolean }>(),
    Timestamp: MockTimestamp,
  };
});

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: (path: string) => {
      const ref = { path, id: path.split('/').at(-1) ?? '', get: () => mock.get(ref) };
      return ref;
    },
    collection: (path: string) => ({
      path,
      doc: (id = 'generated-session') => ({ path: `${path}/${id}` }),
    }),
    runTransaction: (callback: (tx: unknown) => unknown) => {
      let writeStarted = false;
      const remember = (reference: { path: string }, fields: Record<string, unknown>, replace = false) => {
        const prior = mock.committedWrites.get(reference.path);
        mock.committedWrites.set(reference.path, {
          fields: replace ? { ...fields } : { ...prior?.fields, ...fields },
          replace: replace || prior?.replace === true,
        });
      };
      const readFixture = async (reference: { path: string }) => {
        let base;
        try { base = await mock.get(reference); }
        catch (error) {
          if (reference.path !== 'sessions/s1/fleetGroups' && reference.path !== 'sessions/s1/shuttleDepartures') throw error;
          base = { docs: [] };
        }
        if (reference.path === 'sessions/s1/fleetGroups' || reference.path === 'sessions/s1/shuttleDepartures') {
          const byId = new Map<string, { id: string; data: () => Record<string, unknown>; get: (field: string) => unknown }>(
            (base.docs ?? []).map((doc: { id: string }) => [doc.id, doc]),
          );
          for (const [path, write] of mock.committedWrites) {
            if (!path.startsWith(reference.path + '/')) continue;
            const id = path.split('/').at(-1)!;
            const previous = byId.get(id)?.data() ?? {};
            const fields = write.replace ? write.fields : { ...previous, ...write.fields };
            byId.set(id, { id, data: () => fields, get: field => fields[field] });
          }
          return { docs: [...byId.values()] };
        }
        const write = mock.committedWrites.get(reference.path);
        if (!write) return base;
        const fields = write.replace ? { ...write.fields } : { ...base?.data?.(), ...write.fields };
        for (const [field, value] of Object.entries(fields)) if (value === 'delete-field') delete fields[field];
        return { exists: true, id: reference.path.split('/').at(-1)!, data: () => fields, get: (field: string) => fields[field] };
      };
      return callback({
        get: (...args: unknown[]) => {
          if (mock.enforceReadOrder && writeStarted) {
            throw new Error('Firestore transactions require all reads to be executed before all writes.');
          }
          return readFixture(args[0] as { path: string });
        },
        set: (...args: unknown[]) => {
          writeStarted = true;
          remember(args[0] as { path: string }, args[1] as Record<string, unknown>, !(args[2] as { merge?: boolean } | undefined)?.merge);
          return mock.set(...args);
        },
        update: (...args: unknown[]) => {
          writeStarted = true;
          remember(args[0] as { path: string }, args[1] as Record<string, unknown>);
          return mock.update(...args);
        },
        delete: (...args: unknown[]) => {
          writeStarted = true;
          return mock.delete(...args);
        },
      });
    },
  }),
  FieldValue: { delete: () => 'delete-field', serverTimestamp: () => 'server-time' },
  Timestamp: mock.Timestamp,
}));

import { getCurrentMemberSession, joinSession } from './index';
import { activeVesselIdsForRoles } from './gameSetup';
import { recommendedRoleIds } from './roleConfiguration';

const PRIVATE_SNAPSHOT_KEYS = new Set([
  'brief', 'deck', 'deckOrder', 'decks', 'facilitatorNotes', 'loyalty', 'loyaltyAssignment',
  'loyaltyAssignments', 'loyalties', 'notes', 'privateBrief', 'privateBriefs', 'privateCard',
  'privateCards', 'privateNotes', 'roleBrief', 'roleBriefs', 'setupReceipt', 'wolfAssignment',
]);

function privateSnapshotKeys(value: unknown, path = 'session'): string[] {
  if (Array.isArray(value)) return value.flatMap((entry, index) => privateSnapshotKeys(entry, `${path}[${index}]`));
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, entry]) => PRIVATE_SNAPSHOT_KEYS.has(key)
    ? [`${path}.${key}`]
    : privateSnapshotKeys(entry, `${path}.${key}`));
}

function request(joinCode: string) {
  return {
    data: { joinCode },
    auth: { uid: 'u1' },
  } as CallableRequest<{ joinCode: string }>;
}

function snapshot(
  fields: Record<string, unknown>,
  exists = true,
  id = '',
  docs: readonly unknown[] = [],
) {
  return { exists, id, data: () => fields, docs, get: (field: string) => fields[field] };
}

beforeEach(() => {
  mock.get.mockReset();
  mock.set.mockReset();
  mock.update.mockReset();
  mock.delete.mockReset();
  mock.enforceReadOrder = false;
  mock.committedWrites.clear();
});

it('records an allowed code attempt before looking up the code', async () => {
  mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'sessions/s1/fleetGroups/fleet-1') return snapshot({}, false);
    if (path === 'joinAttemptLimits/u1') return snapshot({}, false);
    if (path === 'joinCodes/482109') return snapshot({}, false);
    if (path === 'sessions/s1/wolfAttackState/current') return snapshot({}, false);
    if (path === 'sessions/s1/serverState/navigation') return snapshot({}, false);
    throw new Error(`Unexpected read: ${path}`);
  });

  await expect(joinSession.run(request('482109'))).rejects.toMatchObject({ code: 'not-found' });

  expect(mock.set).toHaveBeenCalledWith(expect.objectContaining({ path: 'joinAttemptLimits/u1' }), expect.objectContaining({
    attempts: 1,
    expiresAt: expect.any(mock.Timestamp),
  }));
  expect(mock.get).toHaveBeenCalledWith(expect.objectContaining({ path: 'joinCodes/482109' }));
});

it.each(['4821', '482109'])('redeems a valid %s legacy or current code', async (joinCode) => {
  mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'sessions/s1/fleetGroups/fleet-1') return snapshot({}, false);
    if (path === 'joinAttemptLimits/u1') return snapshot({}, false);
    if (path === `joinCodes/${joinCode}`) return snapshot({ sessionId: 's1' });
    if (path === 'sessions/s1') return snapshot({ name: 'Table one', phase: 'lobby', joinCode });
    if (path === 'sessions/s1/players/u1') return snapshot({}, false);
    if (path === 'sessions/s1/players') return snapshot({}, true);
    if (path === 'activeMemberships/u1') return snapshot({}, false);
    if (path.startsWith('sessions/s1/seats/')) return snapshot({}, false);
    if (path === 'sessions/s1/wolfAttackState/current') return snapshot({}, false);
    if (path === 'sessions/s1/serverState/navigation') return snapshot({}, false);
    if (path === 'sessions/s1/serverState/voyage33Movement') return snapshot({}, false);
    throw new Error(`Unexpected read: ${path}`);
  });

  await expect(joinSession.run(request(joinCode))).resolves.toMatchObject({
    session: { id: 's1', joinCode },
  });
});

it.each([
  { status: 'open', holderUid: null, expectedSeat: 'seat-1', claims: true },
  { status: 'claimed', holderUid: 'u1', expectedSeat: 'seat-1', claims: false },
  { status: 'claimed', holderUid: 'u2', expectedSeat: null, claims: false },
  { status: 'locked', holderUid: null, expectedSeat: null, claims: false },
])('reconciles returning join intent for $status / $holderUid without taking another seat', async ({ status, holderUid, expectedSeat, claims }) => {
  mock.enforceReadOrder = true;
  mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'joinAttemptLimits/u1') return snapshot({}, false);
    if (path === 'joinCodes/482109') return snapshot({ sessionId: 's1' });
    if (path === 'sessions/s1') return snapshot({ name: 'Table one', phase: 'lobby' });
    if (path === 'sessions/s1/players/u1') return snapshot({
      uid: 'u1', sessionId: 's1', displayName: 'Returning player', role: 'player', seatId: 'seat-1',
    });
    if (path === 'sessions/s1/players') return snapshot({}, true);
    if (path === 'activeMemberships/u1' || path === 'sessions/s1/fleetGroups/fleet-1' ||
        path === 'sessions/s1/serverState/navigation') return snapshot({}, false);
    if (path === 'sessions/s1/seats/seat-1') return snapshot({ status, holderUid });
    if (path.startsWith('sessions/s1/seats/')) return snapshot({}, false);
    if (path === 'sessions/s1/serverState/voyage33Movement') return snapshot({}, false);
    throw new Error(`Unexpected read: ${path}`);
  });
  await expect(joinSession.run(request('482109'))).resolves.toMatchObject({ player: { seatId: expectedSeat } });
  const seatRef = expect.objectContaining({ path: 'sessions/s1/seats/seat-1' });
  if (claims) {
    expect(mock.update).toHaveBeenCalledWith(seatRef, expect.objectContaining({ status: 'claimed', holderUid: 'u1' }));
  } else {
    expect(mock.update).not.toHaveBeenCalledWith(seatRef, expect.anything());
  }
  expect(mock.set).not.toHaveBeenCalledWith(seatRef, expect.anything());
});

it('reclaims a canonical missing seat after setup hydration without clearing its pointer', async () => {
  mock.enforceReadOrder = true;
  const activeRoleIds = [...recommendedRoleIds(8)];
  const playerFields = {
    uid: 'u1', sessionId: 's1', displayName: 'Returning player', role: 'player',
    seatId: activeRoleIds[0], activeConsoleRoleId: null, fleetGroupId: 'fleet-1',
  };
  mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'joinAttemptLimits/u1') return snapshot({}, false);
    if (path === 'joinCodes/482109') return snapshot({ sessionId: 's1' });
    if (path === 'sessions/s1') return snapshot({
      name: 'Table one', phase: 'lobby', playerCount: 8, activeRoleIds,
      activeVesselIds: activeVesselIdsForRoles(activeRoleIds), chartId: 'A',
      expansion: 'base', turnLimit: 8, dioneEnabled: false, capybaraEnabled: true,
    });
    if (path === 'sessions/s1/players/u1') return snapshot(playerFields);
    if (path === 'sessions/s1/players') return snapshot({}, true);
    if (path === 'activeMemberships/u1') return snapshot({}, false);
    if (path === 'sessions/s1/fleetGroups/fleet-1') return snapshot({}, false);
    if (path.startsWith('sessions/s1/seats/')) return snapshot({}, false);
    if (path === 'sessions/s1/wolfAttackState/current') return snapshot({}, false);
    if (path === 'sessions/s1/serverState/navigation') return snapshot({}, false);
    if (path === 'sessions/s1/serverState/voyage33Movement') return snapshot({}, false);
    throw new Error(`Unexpected read: ${path}`);
  });

  await expect(joinSession.run(request('482109'))).resolves.toMatchObject({
    player: { seatId: activeRoleIds[0] },
  });
  expect(mock.set).toHaveBeenCalledWith(
    expect.objectContaining({ path: `sessions/s1/seats/${activeRoleIds[0]}` }),
    expect.objectContaining({ status: 'open', holderUid: null }),
  );
  expect(mock.update).toHaveBeenCalledWith(
    expect.objectContaining({ path: `sessions/s1/seats/${activeRoleIds[0]}` }),
    expect.objectContaining({ status: 'claimed', holderUid: 'u1' }),
  );
  expect(mock.update).not.toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/players/u1' }),
    expect.objectContaining({ seatId: null }),
  );
});

it('persists the Turn 0 ATC bulletin when joining an existing empty stream', async () => {
  mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'sessions/s1/fleetGroups/fleet-1') return snapshot({}, false);
    if (path === 'joinAttemptLimits/u1') return snapshot({}, false);
    if (path === 'joinCodes/482109') return snapshot({ sessionId: 's1' });
    if (path === 'sessions/s1') return snapshot({ name: 'Table one', phase: 'lobby', currentTurn: 0 });
    if (path === 'sessions/s1/players/u1') return snapshot({}, false);
    if (path === 'sessions/s1/players') return snapshot({}, true);
    if (path === 'activeMemberships/u1') return snapshot({}, false);
    if (path.startsWith('sessions/s1/seats/')) return snapshot({}, false);
    if (path === 'sessions/s1/wolfAttackState/current') return snapshot({}, false);
    if (path === 'sessions/s1/serverState/navigation') return snapshot({}, false);
    if (path === 'sessions/s1/serverState/voyage33Movement') return snapshot({}, false);
    throw new Error(`Unexpected read: ${path}`);
  });

  await joinSession.run(request('482109'));

  expect(mock.update).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1' }),
    expect.objectContaining({
      fleetTicker: expect.objectContaining({
        revision: 1,
        current: expect.objectContaining({
          sourceId: 'turn-zero-atc',
          text: 'AIRSPACE CONTROL // AIRSPACE CLOSED',
        }),
      }),
    }),
  );
});

it('omits a valid-shaped turn entity when it disagrees with the current phase or configured limit', async () => {
  mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'sessions/s1/fleetGroups/fleet-1') return snapshot({}, false);
    if (path === 'joinAttemptLimits/u1') return snapshot({}, false);
    if (path === 'joinCodes/482109') return snapshot({ sessionId: 's1' });
    if (path === 'sessions/s1') return snapshot({
      name: 'Table one', phase: 'active', currentTurn: 2, turnLimit: 7,
      turnPhase: {
        turn: 2,
        teamPhaseEndsAt: '2026-01-01T00:05:00.000Z',
        openAirspaceEndsAt: '2026-01-01T00:20:00.000Z',
        airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
      },
      turnState: {
        currentTurn: 2,
        maxTurn: 8,
        phase: 'coordination',
        phaseRevision: 2,
        startedAt: '2026-01-01T00:05:00.000Z',
        endsAt: '2026-01-01T00:20:00.000Z',
      },
    });
    if (path === 'sessions/s1/players/u1') return snapshot({}, false);
    if (path === 'sessions/s1/players') return snapshot({}, true);
    if (path === 'activeMemberships/u1') return snapshot({}, false);
    if (path.startsWith('sessions/s1/seats/')) return snapshot({}, false);
    if (path === 'sessions/s1/wolfAttackState/current') return snapshot({}, false);
    if (path === 'sessions/s1/serverState/navigation') return snapshot({}, false);
    if (path === 'sessions/s1/serverState/voyage33Movement') return snapshot({}, false);
    throw new Error(`Unexpected read: ${path}`);
  });

  const response = await joinSession.run(request('482109')) as { session: Record<string, unknown> };

  expect(response.session).not.toHaveProperty('turnState');
});

it('projects only the public fleet ticker fields on join', async () => {
  mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'sessions/s1/fleetGroups/fleet-1') return snapshot({}, false);
    if (path === 'joinAttemptLimits/u1') return snapshot({}, false);
    if (path === 'joinCodes/482109') return snapshot({ sessionId: 's1' });
    if (path === 'sessions/s1') return snapshot({
      name: 'Table one', phase: 'active', currentTurn: 1,
      fleetTicker: {
        revision: 2, nextSequence: 2, replayCursor: 2,
        internal: 'do-not-project',
        current: {
          id: 's1:fleet-ticker:2', sequence: 2, source: 'admiral', priority: 80,
          text: 'RED ALERT', tone: 'danger', gap: 'standard', createdAt: '2026-09-12T13:00:00.000Z',
          internal: 'do-not-project',
        },
        queued: [], draining: [], dismissed: [],
      },
    });
    if (path === 'sessions/s1/players/u1') return snapshot({}, false);
    if (path === 'sessions/s1/players') return snapshot({}, true);
    if (path === 'activeMemberships/u1') return snapshot({}, false);
    if (path.startsWith('sessions/s1/seats/')) return snapshot({}, false);
    if (path === 'sessions/s1/wolfAttackState/current') return snapshot({}, false);
    if (path === 'sessions/s1/serverState/navigation') return snapshot({}, false);
    if (path === 'sessions/s1/serverState/voyage33Movement') return snapshot({}, false);
    throw new Error(`Unexpected read: ${path}`);
  });

  const response = await joinSession.run(request('482109')) as { session: Record<string, unknown> };
  const ticker = response.session.fleetTicker as Record<string, unknown>;
  expect(ticker).toMatchObject({
    revision: 2,
    current: { id: 's1:fleet-ticker:2', text: 'RED ALERT' },
  });
  expect(ticker).not.toHaveProperty('internal');
  expect(ticker.current).not.toHaveProperty('internal');
});

it('does not project a retained Press shuttle as docked when legacy docking fields are absent', async () => {
  mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'sessions/s1/fleetGroups/fleet-1') return snapshot({}, false);
    if (path === 'joinAttemptLimits/u1') return snapshot({}, false);
    if (path === 'joinCodes/482109') return snapshot({ sessionId: 's1' });
    if (path === 'sessions/s1') return snapshot({
      name: 'Table one', phase: 'active', currentTurn: 1,
      retainedShuttles: {
        'snn-press-shuttle': {
          status: 'retained', shuttleId: 'snn-press-shuttle', ownerRoleId: 'press-officer',
          holderUid: 'u1', destroyedHostShipId: 'dione', controlRevision: 1,
          retainedAt: '2026-09-21T12:00:00.000Z',
        },
      },
      quarantineDocking: {
        type: 'quarantine-docking', status: 'active', crisisId: 'outbreak-1',
        crisisRevision: 2, revision: 1, affectedShipIds: ['aegis'],
        acceptedByShip: {}, communications: 'allowed',
      },
    });
    if (path === 'sessions/s1/players/u1') return snapshot({}, false);
    if (path === 'sessions/s1/players') return snapshot({}, true);
    if (path === 'activeMemberships/u1') return snapshot({}, false);
    if (path.startsWith('sessions/s1/seats/')) return snapshot({}, false);
    if (path === 'sessions/s1/wolfAttackState/current') return snapshot({}, false);
    if (path === 'sessions/s1/serverState/navigation') return snapshot({}, false);
    if (path === 'sessions/s1/serverState/voyage33Movement') return snapshot({}, false);
    throw new Error(`Unexpected read: ${path}`);
  });

  const response = await joinSession.run(request('482109')) as { session: Record<string, unknown> };
  expect(response.session.retainedShuttles).toHaveProperty('snn-press-shuttle');
  expect(response.session.quarantineDocking).toMatchObject({
    status: 'active', affectedShipIds: ['aegis'], communications: 'allowed',
  });
  expect(response.session.shuttleDockings).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ shuttleId: 'snn-press-shuttle' }),
  ]));
  expect(response.session.shuttleVisitLog).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ shuttleId: 'snn-press-shuttle' }),
  ]));
});

it('recovers an active legacy press dispatch from an old authoritative drain on join', async () => {
  mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'sessions/s1/fleetGroups/fleet-1') return snapshot({}, false);
    if (path === 'joinAttemptLimits/u1') return snapshot({}, false);
    if (path === 'joinCodes/482109') return snapshot({ sessionId: 's1' });
    if (path === 'sessions/s1') return snapshot({
      name: 'Table one', phase: 'active', currentTurn: 1,
      fleetTicker: {
        revision: 3, nextSequence: 3, replayCursor: 3,
        current: null, queued: [],
        draining: [{
          id: 's1:fleet-ticker:1', sequence: 1, source: 'press', priority: 20,
          text: 'SNN // FIRST REPORT', tone: 'normal', gap: 'long', sourceId: 'press-1',
          createdAt: '2026-09-12T13:00:00.000Z',
        }],
        dismissed: [],
      },
      pressDispatch: {
        dispatches: [{ id: 'press-1', text: 'SNN // FIRST REPORT' }], revision: 1,
      },
    });
    if (path === 'sessions/s1/players/u1') return snapshot({}, false);
    if (path === 'sessions/s1/players') return snapshot({}, true);
    if (path === 'activeMemberships/u1') return snapshot({}, false);
    if (path.startsWith('sessions/s1/seats/')) return snapshot({}, false);
    if (path === 'sessions/s1/wolfAttackState/current') return snapshot({}, false);
    if (path === 'sessions/s1/serverState/navigation') return snapshot({}, false);
    if (path === 'sessions/s1/serverState/voyage33Movement') return snapshot({}, false);
    throw new Error(`Unexpected read: ${path}`);
  });

  const response = await joinSession.run(request('482109')) as { session: Record<string, unknown> };
  expect(response.session.fleetTicker).toMatchObject({
    revision: 3,
    current: { source: 'press', sourceId: 'press-1', text: 'SNN // FIRST REPORT' },
  });
  expect(mock.update).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1' }),
    expect.objectContaining({
      fleetTicker: expect.objectContaining({
        current: expect.objectContaining({ sourceId: 'press-1' }),
      }),
    }),
  );
});

it('keeps a legacy inactive alert streamless until its server command writes a deadline', async () => {
  mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'sessions/s1/fleetGroups/fleet-1') return snapshot({}, false);
    if (path === 'joinAttemptLimits/u1') return snapshot({}, false);
    if (path === 'joinCodes/482109') return snapshot({ sessionId: 's1' });
    if (path === 'sessions/s1') return snapshot({
      name: 'Table one', phase: 'active', currentTurn: 1,
      fleetRedAlert: { active: false, revision: 1 },
    });
    if (path === 'sessions/s1/players/u1') return snapshot({}, false);
    if (path === 'sessions/s1/players') return snapshot({}, true);
    if (path === 'activeMemberships/u1') return snapshot({}, false);
    if (path.startsWith('sessions/s1/seats/')) return snapshot({}, false);
    if (path === 'sessions/s1/wolfAttackState/current') return snapshot({}, false);
    if (path === 'sessions/s1/serverState/navigation') return snapshot({}, false);
    if (path === 'sessions/s1/serverState/voyage33Movement') return snapshot({}, false);
    throw new Error(`Unexpected read: ${path}`);
  });

  const response = await joinSession.run(request('482109')) as { session: Record<string, unknown> };
  expect(response.session.fleetTicker).toEqual({
    revision: 0, nextSequence: 0, replayCursor: 0,
    current: null, queued: [], draining: [], dismissed: [],
  });
});

it('returns only the public session projection when the persisted root has private-shaped fields', async () => {
  mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'sessions/s1/fleetGroups/fleet-1') return snapshot({}, false);
    if (path === 'joinAttemptLimits/u1') return snapshot({}, false);
    if (path === 'joinCodes/482109') return snapshot({ sessionId: 's1' });
    if (path === 'sessions/s1') return snapshot({
      name: 'Table one',
      phase: 'active',
      currentTurn: 1,
      activeVesselIds: ['aegis'],
      roleBriefs: [{ text: 'private role brief' }],
      loyaltyAssignments: { u1: { kind: 'wolf-agent' } },
      decks: { aegis: ['hidden card'] },
      notes: ['facilitator note'],
      setupReceipt: { selectedWolfRoleIds: ['admiral'] },
      maintenanceCycles: {
        aegis: {
          step: 2, revision: 1, results: { '1': 'Storage intact.' }, charges: [], refuelled: [],
          facilitatorNotes: 'hidden adjudication',
        },
      },
      shuttleCargo: {
        starlight: { food: 3, privateCard: 'hidden' }, wolfAssignment: { food: 1 },
      },
      shuttleFuelled: { starlight: true, wolfAssignment: true, candidateBonus: true },
      shipDamage: { aegis: { damagedSystemIds: ['storage'], destroyed: false, deckOrder: ['5d'] } },
      fighterWingCounts: {
        'fighter-wing-alpha': { count: 4, revision: 0 },
        'fighter-wing-bravo': { count: 3, revision: 2 },
      },
      shipUpgrades: { aegis: ['storage', { candidateBonus: 2 }] },
      shuttleVisitLog: [{
        id: 'starlight-initial-aegis-docking', shuttleId: 'starlight', shipId: 'aegis',
        action: 'docked', occurredAt: 'SESSION START', deckOrder: ['5d'],
      }, {
        id: 'secret-visit', shuttleId: 'wolfAssignment', shipId: 'aegis',
        action: 'docked', occurredAt: 'SESSION START', wolfAssignment: 'hidden',
      }, {
        id: 'secret-host', shuttleId: 'starlight', shipId: 'wolfAssignment',
        action: 'docked', occurredAt: 'SESSION START',
      }],
      shuttleDockings: [{
        shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'SESSION START', facilitatorNote: 'hidden',
      }, {
        shuttleId: 'wolfAssignment', shipId: 'aegis', dockedAt: 'SESSION START',
      }, {
        shuttleId: 'starlight', shipId: 'wolfAssignment', dockedAt: 'SESSION START',
      }],
      confettiUsedShipIds: ['aegis', { candidateBonus: 4 }, 'wolfAssignment'],
      populationAlerts: {
        aegis: {
          shipId: 'aegis', shipName: 'AEGIS', targetGmInstanceIds: ['bridge'], population: 1,
          createdAt: 'TURN 1', facilitatorNote: 'hidden',
        },
      },
    });
    if (path === 'sessions/s1/players/u1') return snapshot({}, false);
    if (path === 'sessions/s1/players') return snapshot({}, true);
    if (path === 'activeMemberships/u1') return snapshot({}, false);
    if (path.startsWith('sessions/s1/seats/')) return snapshot({}, false);
    if (path === 'sessions/s1/wolfAttackState/current') return snapshot({}, false);
    if (path === 'sessions/s1/serverState/navigation') return snapshot({}, false);
    if (path === 'sessions/s1/serverState/voyage33Movement') return snapshot({}, false);
    throw new Error(`Unexpected read: ${path}`);
  });

  const response = await joinSession.run(request('482109')) as { session: Record<string, unknown> };

  expect(response.session).toMatchObject({
    id: 's1', phase: 'active', currentTurn: 1, activeVesselIds: expect.arrayContaining(['aegis']),
    shuttleDockings: [{ shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'SESSION START' }],
    shuttleVisitLog: [{
      id: 'starlight-initial-aegis-docking', shuttleId: 'starlight', shipId: 'aegis',
      action: 'docked', occurredAt: 'SESSION START',
    }],
    confettiUsedShipIds: ['aegis'],
    shuttleFuelled: { starlight: true },
    fighterWingCounts: {
      'fighter-wing-alpha': { count: 4, revision: 0 },
      'fighter-wing-bravo': { count: 3, revision: 2 },
    },
  });
  expect(privateSnapshotKeys(response.session)).toEqual([]);
});

it('does not redeem a code while its session is being retired', async () => {
  mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'sessions/s1/fleetGroups/fleet-1') return snapshot({}, false);
    if (path === 'joinAttemptLimits/u1') return snapshot({}, false);
    if (path === 'joinCodes/4821') return snapshot({ sessionId: 's1' });
    if (path === 'sessions/s1') return snapshot({ phase: 'lobby', deletingAt: 'server-time' });
    return snapshot({}, false);
  });

  await expect(joinSession.run(request('4821'))).rejects.toMatchObject({
    code: 'not-found',
    message: 'That session is being retired.',
  });
  expect(mock.update).not.toHaveBeenCalled();
});

it('does not reveal another code after the identity bucket is exhausted', async () => {
  const now = new Date();
  mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'sessions/s1/fleetGroups/fleet-1') return snapshot({}, false);
    if (path === 'joinAttemptLimits/u1') {
      return snapshot({
        windowStartedAt: mock.Timestamp.fromDate(now),
        attempts: 6,
      });
    }
    throw new Error(`The code lookup must not run while blocked: ${path}`);
  });

  await expect(joinSession.run(request('4821'))).rejects.toMatchObject({
    code: 'resource-exhausted',
    details: {
      commandError: 'unavailable-service',
      retryAfterSeconds: expect.any(Number),
    },
  });

  expect(mock.get).toHaveBeenCalledTimes(1);
  expect(mock.set).not.toHaveBeenCalled();
});

it('rejects an unsupported code shape without spending a limiter attempt', async () => {
  await expect(joinSession.run(request('48210'))).rejects.toMatchObject({
    code: 'invalid-argument',
    message: 'Enter a complete session code.',
  });

  expect(mock.get).not.toHaveBeenCalled();
});

it('replaces a stale membership lock when the same identity joins its remembered table', async () => {
  let playerReads = 0;
  mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'sessions/s1/fleetGroups/fleet-1') return snapshot({}, false);
    if (path === 'joinAttemptLimits/u1') return snapshot({}, false);
    if (path === 'joinCodes/482109') return snapshot({ sessionId: 's1' });
    if (path === 'sessions/s1') return snapshot({
      name: 'Table one',
      phase: 'lobby',
      ownerUid: 'owner',
    });
    if (path === 'sessions/s1/players/u1') return snapshot({
      connectionGeneration: playerReads++ === 0 ? 1 : 3,
      displayName: 'Returning player',
      role: 'player',
      seatId: null,
      activeConsoleRoleId: null,
    });
    if (path === 'sessions/s1/players') return snapshot({}, true);
    if (path === 'activeMemberships/u1') return snapshot({ sessionId: 's2' });
    if (path === 'sessions/s2/players/u1') return snapshot({ connected: false });
    if (path.startsWith('sessions/s1/seats/')) return snapshot({}, false);
    if (path === 'sessions/s1/wolfAttackState/current') return snapshot({}, false);
    if (path === 'sessions/s1/serverState/navigation') return snapshot({}, false);
    if (path === 'sessions/s1/serverState/voyage33Movement') return snapshot({}, false);
    throw new Error('Unexpected read: ' + path);
  });

  const response = await joinSession.run(request('482109'));
  expect(response).toMatchObject({
    session: { id: 's1' },
    player: { seatId: null, connectionGeneration: 2 },
  });

  expect(mock.delete).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'activeMemberships/u1' }),
  );
  expect(mock.set).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'activeMemberships/u1' }),
    expect.objectContaining({ sessionId: 's1' }),
  );
});

it('rejects a browser that was kicked from this session', async () => {
  mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'sessions/s1/fleetGroups/fleet-1') return snapshot({}, false);
    if (path === 'joinAttemptLimits/u1') return snapshot({}, false);
    if (path === 'joinCodes/482109') return snapshot({ sessionId: 's1' });
    if (path === 'sessions/s1') return snapshot({ phase: 'lobby' });
    if (path === 'sessions/s1/players/u1') return snapshot({ kickedAt: 'server-time' });
    if (path === 'sessions/s1/players') return snapshot({}, true);
    if (path === 'activeMemberships/u1') return snapshot({}, false);
    if (path === 'sessions/s1/wolfAttackState/current') return snapshot({}, false);
    if (path === 'sessions/s1/serverState/navigation') return snapshot({}, false);
    if (path === 'sessions/s1/serverState/voyage33Movement') return snapshot({}, false);
    throw new Error('Unexpected read: ' + path);
  });

  await expect(joinSession.run(request('482109'))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: 'This browser was kicked from that session and cannot rejoin.',
  });
  expect(mock.update).not.toHaveBeenCalled();
});

it('refuses to displace an identity that is actively connected in another session', async () => {
  mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'sessions/s1/fleetGroups/fleet-1') return snapshot({}, false);
    if (path === 'joinAttemptLimits/u1') return snapshot({}, false);
    if (path === 'joinCodes/482109') return snapshot({ sessionId: 's1' });
    if (path === 'sessions/s1') return snapshot({ phase: 'lobby' });
    if (path === 'sessions/s1/players/u1') return snapshot({}, false);
    if (path === 'sessions/s1/players') return snapshot({}, true);
    if (path === 'activeMemberships/u1') return snapshot({ sessionId: 's2' });
    if (path === 'sessions/s2/players/u1') return snapshot({
      connected: true,
      lastSeenAt: mock.Timestamp.fromDate(new Date()),
    });
    if (path === 'sessions/s1/wolfAttackState/current') return snapshot({}, false);
    if (path === 'sessions/s1/serverState/navigation') return snapshot({}, false);
    if (path === 'sessions/s1/serverState/voyage33Movement') return snapshot({}, false);
    throw new Error('Unexpected read: ' + path);
  });

  await expect(joinSession.run(request('482109'))).rejects.toMatchObject({
    code: 'failed-precondition',
  });

  expect(mock.update).not.toHaveBeenCalled();
});

it('treats a legacy connected player without a heartbeat as active elsewhere', async () => {
  mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'sessions/s1/fleetGroups/fleet-1') return snapshot({}, false);
    if (path === 'joinAttemptLimits/u1') return snapshot({}, false);
    if (path === 'joinCodes/482109') return snapshot({ sessionId: 's1' });
    if (path === 'sessions/s1') return snapshot({ phase: 'lobby' });
    if (path === 'sessions/s1/players/u1') return snapshot({}, false);
    if (path === 'sessions/s1/players') return snapshot({}, true);
    if (path === 'activeMemberships/u1') return snapshot({ sessionId: 's2' });
    if (path === 'sessions/s2/players/u1') return snapshot({ connected: true });
    if (path === 'sessions/s1/wolfAttackState/current') return snapshot({}, false);
    if (path === 'sessions/s1/serverState/navigation') return snapshot({}, false);
    if (path === 'sessions/s1/serverState/voyage33Movement') return snapshot({}, false);
    throw new Error('Unexpected read: ' + path);
  });

  await expect(joinSession.run(request('482109'))).rejects.toMatchObject({
    code: 'failed-precondition',
  });
  expect(mock.delete).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('migrates every non-kicked legacy player into the stable group and backfills pointers', async () => {
  const activeRoleIds = [...recommendedRoleIds(8)];
  const activeVesselIds = activeVesselIdsForRoles(activeRoleIds);
  const playerFields: Record<string, unknown> = {
    uid: 'u1', role: 'player', seatId: null, activeConsoleRoleId: null,
  };
  const legacyPlayers = [
    snapshot({ uid: 'u1', role: 'player' }, true, 'u1'),
    snapshot({ uid: 'u2', role: 'gm' }, true, 'u2'),
    snapshot({ uid: 'observer', role: 'player', connected: false }, true, 'observer'),
  ];
  mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'joinAttemptLimits/u1') return snapshot({}, false);
    if (path === 'joinCodes/482109') return snapshot({ sessionId: 's1' });
    if (path === 'sessions/s1') return snapshot({
      name: 'Legacy table', phase: 'lobby', playerCount: 8, activeRoleIds, activeVesselIds,
    });
    if (path === 'sessions/s1/players/u1') return snapshot(playerFields, true, 'u1');
    if (path === 'sessions/s1/players') return snapshot({}, true, '', legacyPlayers);
    if (path === 'activeMemberships/u1') return snapshot({}, false);
    if (path === 'sessions/s1/fleetGroups/fleet-1') return snapshot({}, false);
    if (path.startsWith('sessions/s1/seats/')) return snapshot({}, false);
    if (path === 'sessions/s1/wolfAttackState/current') return snapshot({}, false);
    if (path === 'sessions/s1/serverState/navigation') return snapshot({}, false);
    if (path === 'sessions/s1/serverState/voyage33Movement') return snapshot({}, false);
    throw new Error(`Unexpected read: ${path}`);
  });
  mock.update.mockImplementation((ref: { path: string }, fields: Record<string, unknown>) => {
    if (ref.path === 'sessions/s1/players/u1') Object.assign(playerFields, fields);
  });

  await expect(joinSession.run(request('482109'))).resolves.toMatchObject({
    player: { fleetGroupId: 'fleet-1' },
  });

  expect(mock.set).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/fleetGroups/fleet-1' }),
    expect.objectContaining({
      id: 'fleet-1', vesselIds: activeVesselIds, memberUids: ['u1', 'u2', 'observer'],
    }),
  );
  expect(mock.update).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/players/u2' }),
    { fleetGroupId: 'fleet-1' },
  );
  expect(mock.update).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/players/observer' }),
    { fleetGroupId: 'fleet-1' },
  );
});

it('assigns a joining identity to the stable group once across repeated joins', async () => {
  const activeRoleIds = [...recommendedRoleIds(8)];
  const activeVesselIds = activeVesselIdsForRoles(activeRoleIds);
  const sessionFields = {
    name: 'Table one',
    phase: 'lobby',
    playerCount: 8,
    activeRoleIds,
    activeVesselIds,
  };
  const playerFields: Record<string, unknown> = {};
  let playerExists = false;
  let groupFields: Record<string, unknown> | undefined;
  let groupWrites = 0;
  mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'joinAttemptLimits/u1') return snapshot({}, false);
    if (path === 'joinCodes/482109') return snapshot({ sessionId: 's1' });
    if (path === 'sessions/s1') return snapshot(sessionFields);
    if (path === 'sessions/s1/players/u1') return snapshot(playerFields, playerExists);
    if (path === 'sessions/s1/players') return snapshot({}, true);
    if (path === 'activeMemberships/u1') return snapshot({}, false);
    if (path === 'sessions/s1/fleetGroups/fleet-1') return snapshot(groupFields ?? {}, groupFields !== undefined);
    if (path.startsWith('sessions/s1/seats/')) return snapshot({}, false);
    if (path === 'sessions/s1/wolfAttackState/current') return snapshot({}, false);
    if (path === 'sessions/s1/serverState/navigation') return snapshot({}, false);
    if (path === 'sessions/s1/serverState/voyage33Movement') return snapshot({}, false);
    throw new Error(`Unexpected read: ${path}`);
  });
  mock.set.mockImplementation((ref: { path: string }, fields: Record<string, unknown>) => {
    if (ref.path === 'sessions/s1/players/u1') {
      Object.assign(playerFields, fields);
      playerExists = true;
    }
    if (ref.path === 'sessions/s1/fleetGroups/fleet-1') {
      groupFields = { ...fields };
      groupWrites += 1;
    }
  });
  mock.update.mockImplementation((ref: { path: string }, fields: Record<string, unknown>) => {
    if (ref.path === 'sessions/s1/players/u1') Object.assign(playerFields, fields);
    if (ref.path === 'sessions/s1/fleetGroups/fleet-1') groupFields = { ...(groupFields ?? {}), ...fields };
  });

  await expect(joinSession.run(request('482109'))).resolves.toMatchObject({
    player: { fleetGroupId: 'fleet-1' },
  });
  await expect(joinSession.run(request('482109'))).resolves.toMatchObject({
    player: { fleetGroupId: 'fleet-1' },
  });
  expect(groupFields).toMatchObject({ id: 'fleet-1', vesselIds: activeVesselIds, memberUids: ['u1'] });
  expect(groupWrites).toBe(1);
});

it('resumes the preserved timer when a newly authenticated participant joins an empty session', async () => {
  const now = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-06T18:00:00.000Z'));
  const sessionData: Record<string, unknown> = {
    name: 'Table one', phase: 'active', currentTurn: 2,
    turnPhase: {
      turn: 2,
      teamPhaseEndsAt: '2026-09-06T15:03:00.000Z',
      openAirspaceEndsAt: '2026-09-06T15:18:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
      timerPause: { reason: 'empty-session', window: 'restricted', remainingMs: 180_000, pausedAt: '2026-09-06T15:00:00.000Z' },
    },
  };
  mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'joinCodes/482109') return snapshot({ sessionId: 's1' });
    if (path === 'sessions/s1') return snapshot(sessionData);
    if (path === 'sessions/s1/players') return snapshot({}, true);
    return snapshot({}, false);
  });
  mock.update.mockImplementation((ref: { path: string }, fields: object) => {
    if (ref.path === 'sessions/s1') Object.assign(sessionData, fields);
  });
  try {
    const result = await joinSession.run(request('482109'));
    expect(result.session.turnPhase).toMatchObject({
      teamPhaseEndsAt: '2026-09-06T18:03:00.000Z',
      openAirspaceEndsAt: '2026-09-06T18:18:00.000Z',
    });
    expect(result.session.turnPhase).not.toHaveProperty('timerPause');
    expect(mock.set).toHaveBeenCalledWith(expect.objectContaining({ path: expect.stringMatching(/^sessions\/s1\/events\/presence-timer-/) }), expect.objectContaining({ type: 'timer-pause', action: 'resumed', reason: 'empty-session' }));
  } finally { now.mockRestore(); }
});

it.each([
  { status: 'claimed', holderUid: 'u2', replacementStatus: undefined },
  { status: 'open', holderUid: 'u2', replacementStatus: undefined },
  { status: 'open', holderUid: null, replacementStatus: 'awaiting-re-role' },
])('clears stale join console authority and requests selection for $status/$replacementStatus', async ({ status, holderUid, replacementStatus }) => {
  mock.enforceReadOrder = true;
  const fields: Record<string, unknown> = {
    uid: 'u1', sessionId: 's1', role: 'player', connected: false,
    seatId: 'admiral', assignedRoleId: 'admiral', activeConsoleRoleId: 'admiral',
    replacementRoleId: null, replacementStatus,
  };
  mock.update.mockImplementation((ref: { path: string }, update: Record<string, unknown>) => {
    if (ref.path === 'sessions/s1/players/u1') Object.assign(fields, update);
  });
  mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'joinAttemptLimits/u1') return snapshot({}, false);
    if (path === 'joinCodes/482109') return snapshot({ sessionId: 's1' });
    if (path === 'sessions/s1') return snapshot({ name: 'Table one', phase: 'lobby' });
    if (path === 'sessions/s1/players/u1') return snapshot(fields);
    if (path === 'sessions/s1/players') return snapshot({}, true);
    if (path === 'sessions/s1/seats/admiral') return snapshot({ status, holderUid, roleId: 'admiral' });
    if (path.startsWith('sessions/s1/seats/') || path === 'activeMemberships/u1' ||
        path === 'sessions/s1/fleetGroups/fleet-1' || path === 'sessions/s1/serverState/navigation') return snapshot({}, false);
    if (path === 'sessions/s1/serverState/voyage33Movement') return snapshot({}, false);
    throw new Error(`Unexpected read: ${path}`);
  });
  await expect(joinSession.run(request('482109'))).resolves.toMatchObject({
    stationSelectionRequired: true,
    player: { uid: 'u1', seatId: null, activeConsoleRoleId: null },
  });
  expect(fields).toMatchObject({ connected: true, seatId: null, activeConsoleRoleId: null });
  expect(mock.update).not.toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/seats/admiral' }),
    expect.objectContaining({ holderUid: 'u1' }),
  );
});


it.each([
  { pressEnabled: false, pressHolderUid: 'u1' },
  { pressEnabled: true, pressHolderUid: 'u2' },
])('requests station selection when joining with stale Press authority: $pressEnabled/$pressHolderUid', async (pressState) => {
  mock.enforceReadOrder = true;
  const fields: Record<string, unknown> = {
    uid: 'u1', sessionId: 's1', role: 'player', connected: false,
    seatId: null, assignedRoleId: 'press-officer', activeConsoleRoleId: 'press-officer',
  };
  mock.update.mockImplementation((ref: { path: string }, update: Record<string, unknown>) => {
    if (ref.path === 'sessions/s1/players/u1') Object.assign(fields, update);
  });
  mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'joinAttemptLimits/u1') return snapshot({}, false);
    if (path === 'joinCodes/482109') return snapshot({ sessionId: 's1' });
    if (path === 'sessions/s1') return snapshot({ name: 'Table one', phase: 'lobby', ...pressState });
    if (path === 'sessions/s1/players/u1') return snapshot(fields);
    if (path === 'sessions/s1/players') return snapshot({}, true);
    if (path.startsWith('sessions/s1/seats/') || path === 'activeMemberships/u1' ||
        path === 'sessions/s1/fleetGroups/fleet-1' || path === 'sessions/s1/serverState/navigation') return snapshot({}, false);
    if (path === 'sessions/s1/serverState/voyage33Movement') return snapshot({}, false);
    throw new Error(`Unexpected read: ${path}`);
  });
  await expect(joinSession.run(request('482109'))).resolves.toMatchObject({
    stationSelectionRequired: true,
    player: { uid: 'u1', seatId: null, assignedRoleId: null, activeConsoleRoleId: null },
  });
  expect(fields).toMatchObject({ connected: true, activeConsoleRoleId: null, assignedRoleId: null });
  if (pressState.pressHolderUid === 'u2') {
    expect(mock.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ path: 'sessions/s1' }),
      expect.objectContaining({ pressHolderUid: 'u1' }),
    );
  }
});

it('joins an existing separated fleet without collapsing its partitions or changing the returning audience', async () => {
  mock.enforceReadOrder = true;
  const roles = [...recommendedRoleIds(8)];
  const vessels = activeVesselIdsForRoles(roles);
  const groups = [
    { id: 'fleet-1', vesselIds: [vessels[0]!], memberUids: ['gm'] },
    { id: 'fleet-2', vesselIds: vessels.slice(1), memberUids: ['u1'] },
  ];
  const playerFields = { uid: 'u1', sessionId: 's1', role: 'player', seatId: null, activeConsoleRoleId: null, fleetGroupId: 'fleet-2' };
  const players = [snapshot(playerFields, true, 'u1'), snapshot({ role: 'gm', fleetGroupId: 'fleet-1' }, true, 'gm')];
  mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'joinAttemptLimits/u1') return snapshot({}, false);
    if (path === 'joinCodes/482109') return snapshot({ sessionId: 's1' });
    if (path === 'sessions/s1') return snapshot({ phase: 'active', activeRoleIds: roles, activeVesselIds: vessels,
      fleetPartitionRevision: 1, playerCount: 8, chartId: 'A', expansion: 'base' });
    if (path === 'sessions/s1/players/u1') return snapshot(playerFields, true, 'u1');
    if (path === 'sessions/s1/players') return snapshot({}, true, '', players);
    if (path === 'sessions/s1/fleetGroups/fleet-1') return snapshot(groups[0]!, true, 'fleet-1');
    if (path === 'sessions/s1/fleetGroups') return snapshot({}, true, '', groups.map(group => snapshot(group, true, group.id)));
    if (path === 'sessions/s1/serverState/navigation') return snapshot({ revision: 1, pursuitGroups: { 'fleet-1': 2, 'fleet-2': 5 },
      shipGalacticCoordinates: Object.fromEntries(vessels.map(id => [id, '0000'])) });
    if (path === 'activeMemberships/u1' || path.endsWith('/wolfAttackState/current') || path.includes('/seats/')) return snapshot({}, false);
    if (path === 'sessions/s1/serverState/voyage33Movement') return snapshot({}, false);
    throw new Error(`Unexpected read: ${path}`);
  });
  mock.update.mockImplementation((ref: { path: string }, fields: Record<string, unknown>) => {
    if (ref.path === 'sessions/s1/players/u1') Object.assign(playerFields, fields);
  });
  await expect(joinSession.run(request('482109'))).resolves.toMatchObject({ player: { fleetGroupId: 'fleet-2' } });
  expect(mock.update).not.toHaveBeenCalledWith(expect.objectContaining({ path: 'sessions/s1/fleetGroups/fleet-1' }), expect.anything());
  expect(mock.set).not.toHaveBeenCalledWith(expect.objectContaining({ path: 'sessions/s1/fleetGroups/fleet-2' }), expect.anything());
  expect(mock.set).toHaveBeenCalledWith(expect.objectContaining({ path: 'sessions/s1/serverState/navigation' }),
    expect.objectContaining({ pursuitGroups: { 'fleet-1': 2, 'fleet-2': 5 } }), expect.anything());
});


it('sanitizes nested operational data on live refresh before applying the current fleet audience', async () => {
  const roles = [...recommendedRoleIds(18)];
  const vessels = activeVesselIdsForRoles(roles);
  const privateMarker = 'SERVER-PRIVATE-MARKER';
  const escort = { type: 'pdf-escort-fighter-wing-view', revision: 1, cycle: 2, capacity: 4,
    fighters: 4, launched: true, mediumResolved: false, mediumActionCount: 0,
    shortResolved: false, shortRollCount: 0, losses: 0 };
  const fields = {
    pdfEscortWing: escort,
    name: 'Table one', joinCode: '482109', phase: 'active', currentTurn: 2,
    playerCount: 18, chartId: 'A', expansion: 'base', turnLimit: 8,
    activeRoleIds: roles, activeVesselIds: vessels,
    shipResources: { aegis: { fuel: 5, privateNotes: privateMarker }, shepherd: { fuel: 91 } },
    shipDamage: { aegis: { damagedSystemIds: ['storage'], destroyed: false, deckOrder: [privateMarker] } },
    maintenanceCycles: { aegis: { step: 2, revision: 1, results: { '1': 'Storage intact.' },
      charges: [], refuelled: [], facilitatorNotes: privateMarker } },
    shuttleDockings: [{ shuttleId: 'starlight', shipId: 'aegis', dockedAt: '2026-09-21T12:00:00.000Z', privateCard: privateMarker }],
    shuttleVisitLog: [{ id: 'visit-1', shuttleId: 'starlight', shipId: 'aegis', action: 'docked',
      occurredAt: '2026-09-21T12:00:00.000Z', privateCard: privateMarker }],
    shuttleCargo: { starlight: { food: 3, privateCard: privateMarker } },
    admiralDirectives: { revision: 1, entries: [{ id: 'directive-1', kind: 'fleet-policy',
      text: 'Keep formation.', cycle: 2, publishedAt: '2026-09-21T12:00:00.000Z', privateNotes: privateMarker }] },
    fleetTicker: { revision: 0, nextSequence: 0, replayCursor: 0, current: null,
      queued: [], draining: [], dismissed: [], internal: privateMarker },
    facilitatorNotes: privateMarker,
  };
  mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'sessions/s1') return snapshot(fields);
    if (path === 'sessions/s1/players/u1') return snapshot({ connected: true, role: 'player',
      fleetGroupId: 'fleet-2', connectionGeneration: 4, assignedRoleId: 'admiral', activeConsoleRoleId: 'admiral' });
    if (path === 'sessions/s1/fleetGroups') return { docs: [
      snapshot({ id: 'fleet-1', vesselIds: vessels.filter(id => id !== 'aegis'), memberUids: ['foreign'] }),
      snapshot({ id: 'fleet-2', vesselIds: ['aegis'], memberUids: ['u1'] }),
    ] };
    if (path === 'sessions/s1/shuttleDepartures') return { docs: [] };
    throw new Error(`Unexpected read: ${path}`);
  });
  const response = await getCurrentMemberSession.run({ auth: { uid: 'u1' }, data: { sessionId: 's1' } } as CallableRequest<{ sessionId: string }>) as { session: Record<string, unknown> };
  expect(JSON.stringify(response.session)).not.toContain(privateMarker);
  expect(response.session).toMatchObject({
    shipResources: { aegis: { fuel: 5 } },
    maintenanceCycles: { aegis: { step: 2, revision: 1, results: { '1': 'Storage intact.' } } },
    shipDamage: { aegis: { damagedSystemIds: ['storage'], destroyed: false } },
    shuttleCargo: { starlight: { food: 3 } },
    admiralDirectives: { revision: 1, entries: [{ id: 'directive-1', text: 'Keep formation.' }] },
    pdfEscortWing: escort,
    pressEnabled: true,
    memberSessionScope: { groupId: 'fleet-2', vesselIds: ['aegis'] },
  });
  expect(response.session.shipResources).not.toHaveProperty('shepherd');
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('retains only the current in-transit craft’s local history without inventing a docking', async () => {
  const roles = [...recommendedRoleIds(18)];
  const vessels = activeVesselIdsForRoles(roles);
  const control = { shuttleId: 'starlight', ownerRoleId: 'wing-commander', ownerUid: 'u1', holderUid: 'u1', revision: 2 };
  const visit = { id: 'own-departure', shuttleId: 'starlight', shipId: 'aegis', action: 'departed', occurredAt: '2026-10-03T12:00:00.000Z' };
  const fields = { name: 'Table one', joinCode: '482109', phase: 'active', currentTurn: 2,
    playerCount: 18, chartId: 'A', expansion: 'base', turnLimit: 8,
    activeRoleIds: roles, activeVesselIds: vessels, shuttleDockings: [],
    shuttleControl: { starlight: control },
    shuttleVisitLog: [visit, { ...visit, id: 'foreign-history', shipId: 'shepherd' },
      { ...visit, id: 'unknown-craft', shuttleId: 'private-craft' }],
  };
  mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'sessions/s1') return snapshot(fields);
    if (path === 'sessions/s1/players/u1') return snapshot({ connected: true, role: 'player',
      fleetGroupId: 'fleet-2', activeConsoleRoleId: 'wing-commander' });
    if (path === 'sessions/s1/fleetGroups') return { docs: [
      snapshot({ id: 'fleet-1', vesselIds: vessels.filter(id => id !== 'aegis'), memberUids: ['foreign'] }),
      snapshot({ id: 'fleet-2', vesselIds: ['aegis'], memberUids: ['u1'] }),
    ] };
    if (path === 'sessions/s1/shuttleDepartures') return { docs: [{ ...snapshot({ status: 'in-transit', fleetGroupId: 'fleet-2' }), id: 'starlight' }] };
    throw new Error(`Unexpected read: ${path}`);
  });
  const response = await getCurrentMemberSession.run({ auth: { uid: 'u1' }, data: { sessionId: 's1' } } as CallableRequest<{ sessionId: string }>) as { session: Record<string, unknown> };
  expect(response.session.shuttleControl).toEqual({ starlight: control });
  expect(response.session.shuttleDockings).toEqual([]);
  expect(response.session.shuttleVisitLog).toEqual([visit]);
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});
