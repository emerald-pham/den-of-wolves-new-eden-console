import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const mock = vi.hoisted(() => {
  class MockTimestamp {
    constructor(private readonly value: Date) {}

    static fromDate(value: Date) {
      return new MockTimestamp(value);
    }

    static fromMillis(value: number) {
      return new MockTimestamp(new Date(value));
    }

    toDate() {
      return this.value;
    }

    toMillis() {
      return this.value.getTime();
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
      const ref = { path, id: path.split('/').at(-1) ?? '', get: () => mock.get(ref) };
      return ref;
    },
    collection: (path: string) => ({
      path,
      doc: (id?: string) => ({ path: path + '/' + (id ?? 'generated-session') }),
    }),
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

import { resumeSession } from './index';
import { recommendedRoleIds } from './roleConfiguration';

function request(sessionId: string) {
  return {
    data: { sessionId },
    auth: { uid: 'u1' },
  } as CallableRequest<{ sessionId: string }>;
}

function snapshot(fields: Readonly<Record<string, unknown>>, exists = true) {
  return { exists, docs: [], get: (field: string) => fields[field] };
}

function prepareResume(
  seat: Readonly<Record<string, unknown>>,
  playerFields: Readonly<Record<string, unknown>> = {},
  sessionFields: Readonly<Record<string, unknown>> = {},
  navigationFields: Readonly<Record<string, unknown>> = {},
  navigationExists = false,
) {
  const twoHoursAgo = mock.Timestamp.fromDate(new Date('2026-09-06T16:00:00.000Z'));
  const sessionData = {
    name: 'Table one',
    joinCode: '482109',
    phase: 'lobby',
    ownerUid: 'owner',
    createdAt: mock.Timestamp.fromDate(new Date('2026-09-01T00:00:00.000Z')),
    updatedAt: mock.Timestamp.fromDate(new Date('2026-09-01T00:00:00.000Z')),
    ...sessionFields,
  };
  const session = snapshot(sessionData);
  const playerData: Record<string, unknown> = {
    uid: 'u1',
    sessionId: 's1',
    displayName: 'Returning player',
    role: 'player',
    seatId: 'seat-1',
    activeConsoleRoleId: null,
    connected: false,
    lastSeenAt: twoHoursAgo,
    joinedAt: mock.Timestamp.fromDate(new Date('2026-09-01T00:00:00.000Z')),
    ...playerFields,
  };
  const player = snapshot(playerData);

  mock.update.mockImplementation((ref: { path: string }, update: unknown) => {
    if (ref.path === 'sessions/s1' && typeof update === 'object' && update !== null) {
      Object.assign(sessionData, update);
    }
    if (ref.path === 'sessions/s1/players/u1' && typeof update === 'object' && update !== null) {
      Object.assign(playerData, update);
    }
  });

  mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'sessions/s1/fleetGroups/fleet-1') return snapshot({}, false);
    if (path === 'sessions/s1') return session;
    if (path === 'sessions/s1/players/u1') return player;
    if (path === 'sessions/s1/players') return snapshot({}, true);
    if (path === 'activeMemberships/u1') return snapshot({}, false);
    if (path === 'sessions/s1/seats/seat-1') return snapshot(seat);
    if (path.startsWith('sessions/s1/seats/')) return snapshot({}, false);
    if (path === 'sessions/s1/serverState/navigation') {
      const navigation = snapshot(navigationFields, navigationExists);
      return navigationExists ? { ...navigation, data: () => navigationFields } : navigation;
    }
    throw new Error('Unexpected read: ' + path);
  });
}

beforeEach(() => {
  mock.get.mockReset();
  mock.set.mockReset();
  mock.update.mockReset();
  mock.delete.mockReset();
});

it('lets a player return after two idle hours, clearing only an occupied old seat', async () => {
  prepareResume({ status: 'claimed', holderUid: 'u2' });

  const response = await resumeSession.run(request('s1')) as {
    player: { seatId: string | null };
  };

  expect(response.player.seatId).toBeNull();
  expect(mock.get).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/seats/seat-1' }),
  );
  expect(mock.update).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/players/u1' }),
    expect.objectContaining({
      connected: true,
      lastSeenAt: 'server-time',
      seatId: null,
    }),
  );
  expect(mock.set).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'activeMemberships/u1' }),
    expect.objectContaining({ sessionId: 's1' }),
  );
});

it('persists the Turn 0 ATC bulletin while resuming an existing empty stream', async () => {
  prepareResume({ status: 'open', holderUid: null }, {}, { currentTurn: 0 });

  const response = await resumeSession.run(request('s1')) as {
    session: { fleetTicker: { current: { sourceId: string; text: string } } };
  };

  expect(response.session.fleetTicker.current).toMatchObject({
    sourceId: 'turn-zero-atc',
    text: 'AIRSPACE CONTROL // TURN 0 // STANDING BY',
  });
  expect(mock.update).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1' }),
    expect.objectContaining({ fleetTicker: expect.objectContaining({ revision: 1 }) }),
  );
});

it('persists the current-turn ATC baseline while resuming an empty stream', async () => {
  prepareResume({ status: 'open', holderUid: null }, {}, {
    phase: 'active',
    currentTurn: 2,
    turnPhase: {
      turn: 2,
      teamPhaseEndsAt: '2026-09-06T20:03:00.000Z',
      openAirspaceEndsAt: '2026-09-06T20:18:00.000Z',
      airspace: { state: 'lifted', tickerActive: false, pressAccess: false },
    },
  });

  const response = await resumeSession.run(request('s1')) as {
    session: { fleetTicker: { current: { sourceId: string; text: string } } };
  };

  expect(response.session.fleetTicker.current).toMatchObject({
    sourceId: 'airspace:2:lifted',
    text: 'AIRSPACE CONTROL // AIRSPACE OPEN',
  });
});

it('defaults a legacy resume reply with no Press toggle to enabled', async () => {
  prepareResume({ status: 'open', holderUid: null });

  const response = await resumeSession.run(request('s1')) as {
    session: { pressEnabled: boolean };
  };

  expect(response.session.pressEnabled).toBe(true);
});

it('rebuilds private history from the server navigation snapshot during resume', async () => {
  prepareResume(
    { status: 'open', holderUid: null },
    { assignedRoleId: 'admiral', fleetGroupId: 'fleet-1' },
    {
      playerCount: 12,
      activeRoleIds: ['admiral', 'dione-captain'],
      activeVesselIds: ['aegis', 'dione'],
      dioneEnabled: true,
    },
    {
      revision: 4,
      shipGalacticCoordinates: { aegis: '5143', dione: '8378' },
      shipNavigationLogs: { aegis: [], dione: [] },
      systemHistory: {
        aegis: {
          '5143': {
            coordinate: '5143',
            attempts: [{ id: 'aegis-attempt', occurredAt: '2026-09-13T00:00:00.000Z' }],
            hazards: [], rewards: [], clearedThreats: [], candidateProgress: [],
          },
        },
        dione: {
          '8378': {
            coordinate: '8378',
            attempts: [{ id: 'dione-attempt', occurredAt: '2026-09-13T00:00:00.000Z' }],
            hazards: [], rewards: [], clearedThreats: [], candidateProgress: [],
          },
        },
      },
    },
    true,
  );

  await resumeSession.run(request('s1'));

  const privateProjection = mock.set.mock.calls.find(([ref]) =>
    ref.path === 'sessions/s1/playerDiscoveries/u1')?.[1] as Record<string, unknown> | undefined;
  expect(privateProjection).toMatchObject({
    revision: 4,
    systemHistory: { '5143': { attempts: [{ id: 'aegis-attempt' }] } },
  });
  expect(privateProjection?.systemHistory).not.toHaveProperty('8378');

  const gmProjection = mock.set.mock.calls.find(([ref]) =>
    ref.path === 'sessions/s1/gmDiscovery/current')?.[1] as Record<string, unknown> | undefined;
  expect(gmProjection?.systemHistory).toHaveProperty('dione.8378');
});

it('projects only public fleet ticker fields on resume', async () => {
  prepareResume(
    { status: 'open', holderUid: null },
    {},
    {
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
    },
  );

  const response = await resumeSession.run(request('s1')) as { session: Record<string, unknown> };
  const ticker = response.session.fleetTicker as Record<string, unknown>;
  expect(ticker).toMatchObject({
    revision: 2,
    current: { id: 's1:fleet-ticker:2', text: 'RED ALERT' },
  });
  expect(ticker).not.toHaveProperty('internal');
  expect(ticker.current).not.toHaveProperty('internal');
});

it('omits a valid-shaped turn entity when it disagrees with the current phase or configured limit', async () => {
  prepareResume(
    { status: 'open', holderUid: null },
    {},
    {
      phase: 'active',
      currentTurn: 2,
      turnLimit: 7,
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
    },
  );

  const response = await resumeSession.run(request('s1')) as { session: Record<string, unknown> };

  expect(response.session).not.toHaveProperty('turnState');
});

it('returns only operational fields when legacy root maps contain hidden-shaped fields', async () => {
  prepareResume(
    { status: 'open', holderUid: null },
    {},
    {
      activeVesselIds: ['aegis'],
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
    },
  );

  const response = await resumeSession.run(request('s1')) as { session: Record<string, unknown> };
  const hiddenKeys = new Set([
    'brief', 'candidateBonus', 'deck', 'deckOrder', 'decks', 'facilitatorNote', 'facilitatorNotes',
    'loyalty', 'loyaltyAssignment', 'loyaltyAssignments', 'loyalties', 'notes', 'privateCard',
    'privateBrief', 'privateBriefs', 'privateCards', 'privateNotes', 'roleBrief', 'roleBriefs',
    'setupReceipt', 'wolfAssignment',
  ]);
  const findHidden = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.flatMap(findHidden);
    if (typeof value !== 'object' || value === null) return [];
    return Object.entries(value).flatMap(([key, nested]) =>
      hiddenKeys.has(key) ? [key] : findHidden(nested));
  };
  expect(findHidden(response.session)).toEqual([]);
  expect(response.session).toMatchObject({
    maintenanceCycles: { aegis: { step: 2, revision: 1, results: { '1': 'Storage intact.' } } },
    shuttleCargo: { starlight: { food: 3 } },
    shipDamage: { aegis: { damagedSystemIds: ['storage'], destroyed: false } },
    shipUpgrades: { aegis: ['storage'] },
    shuttleDockings: [{ shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'SESSION START' }],
    shuttleVisitLog: [{
      id: 'starlight-initial-aegis-docking', shuttleId: 'starlight', shipId: 'aegis',
      action: 'docked', occurredAt: 'SESSION START',
    }],
    confettiUsedShipIds: ['aegis'],
    shuttleFuelled: { starlight: true },
  });
});

it('returns a typed setup error before seat writes for a malformed persisted mode', async () => {
  prepareResume(
    { status: 'open', holderUid: null },
    {},
    {
      playerCount: 19,
      expansion: 'base',
      capybaraEnabled: true,
      activeRoleIds: recommendedRoleIds(19),
    },
  );

  await expect(resumeSession.run(request('s1'))).rejects.toMatchObject({
    code: 'failed-precondition',
    details: { commandError: 'malformed-input' },
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('clears stale Press authority on disabled resume while preserving dispatch history', async () => {
  prepareResume(
    { status: 'claimed', holderUid: 'u1' },
    { activeConsoleRoleId: 'press-officer' },
    {
      pressEnabled: false,
      pressDispatch: {
        dispatches: [{ id: 'dispatch-1', text: 'SNN // Earlier copy' }],
        revision: 3,
      },
    },
  );

  const response = await resumeSession.run(request('s1')) as {
    session: { pressEnabled: boolean; pressDispatch: unknown };
    player: { activeConsoleRoleId: string | null };
  };

  expect(response.session).toMatchObject({
    pressEnabled: false,
    pressDispatch: {
      dispatches: [{ id: 'dispatch-1', text: 'SNN // Earlier copy' }],
      revision: 3,
    },
  });
  expect(response.player.activeConsoleRoleId).toBeNull();
  expect(mock.update).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/players/u1' }),
    expect.objectContaining({ activeConsoleRoleId: null }),
  );
});

it('rejects a kicked browser before restoring its session', async () => {
  prepareResume({ status: 'open', holderUid: null }, { kickedAt: 'server-time' });

  await expect(resumeSession.run(request('s1'))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: 'This browser was kicked from that session and cannot rejoin.',
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('keeps the old seat when the returning player still holds it', async () => {
  prepareResume({ status: 'claimed', holderUid: 'u1' }, {
    assignedRoleId: 'admiral', replacementRoleId: 'wolf-commander',
  });

  const response = await resumeSession.run(request('s1')) as {
    player: { seatId: string | null; replacementRoleId?: string | null };
  };

  expect(response.player.seatId).toBe('seat-1');
  expect(response.player.replacementRoleId).toBe('wolf-commander');
  expect(mock.get).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/seats/seat-1' }),
  );
  expect(mock.update).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/players/u1' }),
    { connected: true, fleetGroupId: 'fleet-1', lastSeenAt: 'server-time' },
  );
});

it('reclaims an open old seat before resuming the player after two idle hours', async () => {
  prepareResume({ status: 'open', holderUid: null });

  const response = await resumeSession.run(request('s1')) as {
    player: { seatId: string | null };
  };

  expect(response.player.seatId).toBe('seat-1');
  expect(mock.update).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/seats/seat-1' }),
    {
      status: 'claimed',
      holderUid: 'u1',
      claimedAt: 'server-time',
    },
  );
});

it('rejects a session that closes after the initial read but before resume commits', async () => {
  let sessionReads = 0;
  mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'sessions/s1/fleetGroups/fleet-1') return snapshot({}, false);
    if (path === 'sessions/s1') {
      sessionReads += 1;
      return snapshot({
        name: 'Table one',
        joinCode: '482109',
        phase: sessionReads === 1 ? 'lobby' : 'closed',
        ownerUid: 'owner',
      });
    }
    if (path === 'sessions/s1/players/u1') {
      return snapshot({
        displayName: 'Returning player',
        role: 'player',
        seatId: null,
        activeConsoleRoleId: null,
      });
    }
    if (path === 'sessions/s1/players') return snapshot({}, true);
    if (path === 'activeMemberships/u1') return snapshot({}, false);
    if (path.startsWith('sessions/s1/seats/')) return snapshot({}, false);
    if (path === 'sessions/s1/serverState/navigation') return snapshot({}, false);
    throw new Error('Unexpected read: ' + path);
  });

  await expect(resumeSession.run(request('s1'))).rejects.toMatchObject({
    code: 'failed-precondition',
  });

  expect(mock.update).not.toHaveBeenCalled();
});

it('returns fresh server state after the resume transaction instead of its initial snapshot', async () => {
  let sessionReads = 0;
  let playerReads = 0;
  mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'sessions/s1/fleetGroups/fleet-1') return snapshot({}, false);
    if (path === 'sessions/s1') {
      sessionReads += 1;
      return snapshot({
        name: sessionReads === 1 ? 'Old name' : 'Server name',
        joinCode: '482109',
        phase: 'lobby',
        ownerUid: 'owner',
      });
    }
    if (path === 'sessions/s1/players/u1') {
      playerReads += 1;
      return snapshot({
        displayName: playerReads === 1 ? 'Old player name' : 'Server player name',
        role: 'player',
        seatId: null,
        activeConsoleRoleId: null,
      });
    }
    if (path === 'sessions/s1/players') return snapshot({}, true);
    if (path === 'activeMemberships/u1') return snapshot({}, false);
    if (path.startsWith('sessions/s1/seats/')) return snapshot({}, false);
    if (path === 'sessions/s1/serverState/navigation') return snapshot({}, false);
    throw new Error('Unexpected read: ' + path);
  });

  const response = await resumeSession.run(request('s1')) as {
    session: { name: string };
    player: { displayName: string };
  };

  expect(response.session.name).toBe('Server name');
  expect(response.player.displayName).toBe('Server player name');
});

it('replaces a stale membership lock but refuses an active membership in another session', async () => {
  const originalPrepare = (membership: Record<string, unknown>, otherPlayer: Record<string, unknown>) => {
    mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'sessions/s1/fleetGroups/fleet-1') return snapshot({}, false);
      if (path === 'sessions/s1') return snapshot({
        name: 'Table one',
        joinCode: '482109',
        phase: 'lobby',
        ownerUid: 'owner',
      });
      if (path === 'sessions/s1/players/u1') return snapshot({
        displayName: 'Returning player',
        role: 'player',
        seatId: null,
        activeConsoleRoleId: null,
      });
      if (path === 'sessions/s1/players') return snapshot({}, true);
      if (path === 'activeMemberships/u1') return snapshot(membership);
      if (path === 'sessions/s2/players/u1') return snapshot(otherPlayer);
      if (path.startsWith('sessions/s1/seats/')) return snapshot({}, false);
      if (path === 'sessions/s1/serverState/navigation') return snapshot({}, false);
      throw new Error('Unexpected read: ' + path);
    });
  };

  originalPrepare(
    { sessionId: 's2' },
    {
      connected: false,
      lastSeenAt: mock.Timestamp.fromDate(new Date('2026-09-06T16:00:00.000Z')),
    },
  );
  await expect(resumeSession.run(request('s1'))).resolves.toMatchObject({
    player: { seatId: null },
  });
  expect(mock.delete).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'activeMemberships/u1' }),
  );
  expect(mock.set).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'activeMemberships/u1' }),
    expect.objectContaining({ sessionId: 's1' }),
  );

  mock.delete.mockClear();
  mock.set.mockClear();
  originalPrepare(
    { sessionId: 's2' },
    {
      connected: true,
      lastSeenAt: mock.Timestamp.fromDate(new Date()),
    },
  );
  await expect(resumeSession.run(request('s1'))).rejects.toMatchObject({
    code: 'failed-precondition',
  });
  expect(mock.delete).not.toHaveBeenCalled();
});


afterEach(() => vi.useRealTimers());

it('resumes an empty-session hold exactly once and returns the shifted authoritative clock', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T18:00:00.000Z'));
  prepareResume({}, { seatId: null }, {
    phase: 'active', currentTurn: 2,
    turnPhase: {
      turn: 2,
      teamPhaseEndsAt: '2026-09-06T15:03:00.000Z',
      openAirspaceEndsAt: '2026-09-06T15:18:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
      timerPause: { reason: 'empty-session', window: 'restricted', remainingMs: 180_000, pausedAt: '2026-09-06T15:00:00.000Z' },
    },
  });
  const first = await resumeSession.run(request('s1'));
  expect(first.session.turnPhase).toMatchObject({
    teamPhaseEndsAt: '2026-09-06T18:03:00.000Z',
    openAirspaceEndsAt: '2026-09-06T18:18:00.000Z',
  });
  expect(first.session.turnPhase).not.toHaveProperty('timerPause');
  vi.setSystemTime(new Date('2026-09-06T18:00:30.000Z'));
  const second = await resumeSession.run(request('s1'));
  expect(second.session.turnPhase).toEqual(first.session.turnPhase);
});

it('does not release a deliberate emergency hold during reconnect', async () => {
  const held = {
    turn: 2,
    teamPhaseEndsAt: '2026-09-06T15:03:00.000Z',
    openAirspaceEndsAt: '2026-09-06T15:18:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    timerPause: { window: 'restricted', remainingMs: 180_000, pausedAt: '2026-09-06T15:00:00.000Z' },
  };
  prepareResume({}, { seatId: null }, { phase: 'active', currentTurn: 2, turnPhase: held });
  expect((await resumeSession.run(request('s1'))).session.turnPhase).toEqual(held);
});
