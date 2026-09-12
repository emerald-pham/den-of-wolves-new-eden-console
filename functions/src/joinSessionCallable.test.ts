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
    Timestamp: MockTimestamp,
  };
});

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: (path: string) => {
      const ref = { path, get: () => mock.get(ref) };
      return ref;
    },
    collection: () => ({ doc: () => ({ path: 'generated-session' }) }),
    runTransaction: (callback: (tx: unknown) => unknown) => callback({
      get: mock.get,
      set: mock.set,
      update: mock.update,
      delete: mock.delete,
    }),
  }),
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: mock.Timestamp,
}));

import { joinSession } from './index';

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

function snapshot(fields: Record<string, unknown>, exists = true) {
  return { exists, get: (field: string) => fields[field] };
}

beforeEach(() => {
  mock.get.mockReset();
  mock.set.mockReset();
  mock.update.mockReset();
  mock.delete.mockReset();
});

it('records an allowed code attempt before looking up the code', async () => {
  mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'joinAttemptLimits/u1') return snapshot({}, false);
    if (path === 'joinCodes/482109') return snapshot({}, false);
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
    if (path === 'joinAttemptLimits/u1') return snapshot({}, false);
    if (path === `joinCodes/${joinCode}`) return snapshot({ sessionId: 's1' });
    if (path === 'sessions/s1') return snapshot({ name: 'Table one', phase: 'lobby' });
    if (path === 'sessions/s1/players/u1') return snapshot({}, false);
    if (path === 'activeMemberships/u1') return snapshot({}, false);
    if (path.startsWith('sessions/s1/seats/')) return snapshot({}, false);
    throw new Error(`Unexpected read: ${path}`);
  });

  await expect(joinSession.run(request(joinCode))).resolves.toMatchObject({
    session: { id: 's1', joinCode },
  });
});

it('omits a valid-shaped turn entity when it disagrees with the current phase or configured limit', async () => {
  mock.get.mockImplementation(({ path }: { path: string }) => {
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
    if (path === 'activeMemberships/u1') return snapshot({}, false);
    if (path.startsWith('sessions/s1/seats/')) return snapshot({}, false);
    throw new Error(`Unexpected read: ${path}`);
  });

  const response = await joinSession.run(request('482109')) as { session: Record<string, unknown> };

  expect(response.session).not.toHaveProperty('turnState');
});

it('projects only the public fleet ticker fields on join', async () => {
  mock.get.mockImplementation(({ path }: { path: string }) => {
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
    if (path === 'activeMemberships/u1') return snapshot({}, false);
    if (path.startsWith('sessions/s1/seats/')) return snapshot({}, false);
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

it('keeps a legacy inactive alert streamless until its server command writes a deadline', async () => {
  mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'joinAttemptLimits/u1') return snapshot({}, false);
    if (path === 'joinCodes/482109') return snapshot({ sessionId: 's1' });
    if (path === 'sessions/s1') return snapshot({
      name: 'Table one', phase: 'active', currentTurn: 1,
      fleetRedAlert: { active: false, revision: 1 },
    });
    if (path === 'sessions/s1/players/u1') return snapshot({}, false);
    if (path === 'activeMemberships/u1') return snapshot({}, false);
    if (path.startsWith('sessions/s1/seats/')) return snapshot({}, false);
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
    if (path === 'activeMemberships/u1') return snapshot({}, false);
    if (path.startsWith('sessions/s1/seats/')) return snapshot({}, false);
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
  mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'joinAttemptLimits/u1') return snapshot({}, false);
    if (path === 'joinCodes/482109') return snapshot({ sessionId: 's1' });
    if (path === 'sessions/s1') return snapshot({
      name: 'Table one',
      phase: 'lobby',
      ownerUid: 'owner',
    });
    if (path === 'sessions/s1/players/u1') return snapshot({
      displayName: 'Returning player',
      role: 'player',
      seatId: null,
      activeConsoleRoleId: null,
    });
    if (path === 'activeMemberships/u1') return snapshot({ sessionId: 's2' });
    if (path === 'sessions/s2/players/u1') return snapshot({ connected: false });
    if (path.startsWith('sessions/s1/seats/')) return snapshot({}, false);
    throw new Error('Unexpected read: ' + path);
  });

  await expect(joinSession.run(request('482109'))).resolves.toMatchObject({
    session: { id: 's1' },
    player: { seatId: null },
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
    if (path === 'joinAttemptLimits/u1') return snapshot({}, false);
    if (path === 'joinCodes/482109') return snapshot({ sessionId: 's1' });
    if (path === 'sessions/s1') return snapshot({ phase: 'lobby' });
    if (path === 'sessions/s1/players/u1') return snapshot({ kickedAt: 'server-time' });
    if (path === 'activeMemberships/u1') return snapshot({}, false);
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
    if (path === 'joinAttemptLimits/u1') return snapshot({}, false);
    if (path === 'joinCodes/482109') return snapshot({ sessionId: 's1' });
    if (path === 'sessions/s1') return snapshot({ phase: 'lobby' });
    if (path === 'sessions/s1/players/u1') return snapshot({}, false);
    if (path === 'activeMemberships/u1') return snapshot({ sessionId: 's2' });
    if (path === 'sessions/s2/players/u1') return snapshot({
      connected: true,
      lastSeenAt: mock.Timestamp.fromDate(new Date()),
    });
    throw new Error('Unexpected read: ' + path);
  });

  await expect(joinSession.run(request('482109'))).rejects.toMatchObject({
    code: 'failed-precondition',
  });

  expect(mock.update).not.toHaveBeenCalled();
});

it('treats a legacy connected player without a heartbeat as active elsewhere', async () => {
  mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'joinAttemptLimits/u1') return snapshot({}, false);
    if (path === 'joinCodes/482109') return snapshot({ sessionId: 's1' });
    if (path === 'sessions/s1') return snapshot({ phase: 'lobby' });
    if (path === 'sessions/s1/players/u1') return snapshot({}, false);
    if (path === 'activeMemberships/u1') return snapshot({ sessionId: 's2' });
    if (path === 'sessions/s2/players/u1') return snapshot({ connected: true });
    throw new Error('Unexpected read: ' + path);
  });

  await expect(joinSession.run(request('482109'))).rejects.toMatchObject({
    code: 'failed-precondition',
  });
  expect(mock.delete).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});
