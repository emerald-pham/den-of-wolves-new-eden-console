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
    enforceReadOrder: false,
    committedWrites: new Map<string, { fields: Record<string, unknown>; replace: boolean }>(),
    rateLimitMarkers: new Map<string, unknown>(),
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
      where: (field: string, operator: string, value: unknown) => ({ path, filters: [[field, operator, value]] }),
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
          if (reference.path === 'sessions/s1/presidentialElections/current' ||
              reference.path === 'sessions/s1/presidentialElections/current/ballots/u1') {
            base = { exists: false, data: () => undefined, get: () => undefined };
          } else if (reference.path !== 'sessions/s1/fleetGroups' && reference.path !== 'sessions/s1/shuttleDepartures') throw error;
          else base = { docs: [] };
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
          const reference = args[0] as { path?: string } | undefined;
          if (reference?.path?.startsWith('sessions/s1/serverState/callableRateLimit-')) {
            const marker = mock.rateLimitMarkers.get(reference.path);
            return {
              exists: marker !== undefined,
              data: () => marker,
            };
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

import { resumeSession } from './index';
import { recommendedRoleIds } from './roleConfiguration';
import { callableRateLimitDocumentId } from './callableRateLimit';
import { canonicalSessionSetup, normalizeSessionConfiguration, stableSeatsForRoles } from './gameSetup';
import { navigationState, playerDiscoveryProjection } from './navigationProjection';

function request(sessionId: string) {
  return {
    data: { sessionId },
    auth: { uid: 'u1' },
  } as CallableRequest<{ sessionId: string }>;
}

function snapshot(fields: Readonly<Record<string, unknown>>, exists = true) {
  return { exists, docs: [], data: () => fields, get: (field: string) => fields[field] };
}

function nonRateLimitSetCalls() {
  return mock.set.mock.calls.filter(([reference]) =>
    !(reference as { path: string }).path.startsWith('sessions/s1/serverState/callableRateLimit-'));
}

function prepareResume(
  seat: Readonly<Record<string, unknown>>,
  playerFields: Readonly<Record<string, unknown>> = {},
  sessionFields: Readonly<Record<string, unknown>> = {},
  navigationFields: Readonly<Record<string, unknown>> = {},
  navigationExists = false,
  seatExists = true,
) {
  mock.committedWrites.clear();
  const twoHoursAgo = mock.Timestamp.fromDate(new Date('2026-09-06T16:00:00.000Z'));
  const sessionData: Record<string, unknown> = {
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
  const storedSeatId = typeof playerData.seatId === 'string' ? playerData.seatId : null;
  const player = snapshot(playerData);

  mock.update.mockImplementation((ref: { path: string }, update: unknown) => {
    if (ref.path === 'sessions/s1' && typeof update === 'object' && update !== null) {
      for (const [field, value] of Object.entries(update)) {
        if (value === 'delete-field') delete sessionData[field];
        else sessionData[field] = value;
      }
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
    if (storedSeatId !== null && path === `sessions/s1/seats/${storedSeatId}`) {
      return snapshot(seat, seatExists);
    }
    if (path.startsWith('sessions/s1/seats/')) return snapshot({}, false);
    if (path === 'sessions/s1/wolfAttackState/current') return snapshot({}, false);
    if (path === 'sessions/s1/serverState/navigation') {
      const navigation = snapshot(navigationFields, navigationExists);
      return navigationExists ? { ...navigation, data: () => navigationFields } : navigation;
    }
    if (path.startsWith('sessions/s1/serverState/callableRateLimit-')) {
      const marker = mock.rateLimitMarkers.get(path);
      return snapshot(marker && typeof marker === 'object' ? marker as Record<string, unknown> : {}, marker !== undefined);
    }
    if (path === 'sessions/s1/serverState/voyage33Movement') return snapshot({}, false);
    throw new Error('Unexpected read: ' + path);
  });
  return { playerData, sessionData };
}

function enableClosedHistoryReads(groupId = 'fleet-1', memberUids = ['u1']) {
  const previousGet = mock.get.getMockImplementation();
  mock.get.mockImplementation((reference: { path: string }) => {
    if (reference.path === 'sessions/s1/fleetGroups') {
      const fields = { id: groupId, vesselIds: ['aegis'], memberUids };
      const groups = [{ id: groupId, data: () => fields, get: (field: string) => fields[field as keyof typeof fields] }];
      return { docs: groups };
    }
    if (reference.path === 'sessions/s1/shuttleDepartures') return { docs: [] };
    if (reference.path === 'sessions/s1/presidentialElections/current' ||
        reference.path === 'sessions/s1/presidentialElections/current/ballots/u1') {
      return snapshot({}, false);
    }
    return previousGet?.(reference);
  });
}

beforeEach(() => {
  mock.rateLimitMarkers.clear();
  mock.get.mockReset();
  mock.set.mockReset();
  mock.update.mockReset();
  mock.delete.mockReset();
  mock.enforceReadOrder = false;
  mock.committedWrites.clear();
  mock.set.mockImplementation((ref: { path: string }, value: unknown) => {
    if (ref.path.startsWith('sessions/s1/serverState/callableRateLimit-')) {
      mock.rateLimitMarkers.set(ref.path, value);
    }
  });
});

function prepareCurrentResume() {
  const setup = canonicalSessionSetup(normalizeSessionConfiguration({
    playerCount: 8, chartId: 'A', expansion: 'base', turnLimit: 6,
    dioneEnabled: false, capybaraEnabled: false, universalArbourEnabled: false, wolfCultEnabled: false,
  }), recommendedRoleIds(8));
  const navigation = { ...navigationState({
    shipGalacticCoordinates: Object.fromEntries(setup.activeVesselIds.map(shipId => [shipId, '0000'])),
    shipNavigationLogs: Object.fromEntries(setup.activeVesselIds.map(shipId => [shipId, []])),
    pursuitGroups: { 'fleet-1': 2 },
  }, setup.activeVesselIds), missionCommittedCraftIdsByHostShip: {} };
  const current = prepareResume(
    { ...stableSeatsForRoles(setup.activeRoleIds).find(seat => seat.id === 'admiral')!, status: 'claimed', holderUid: 'u1' },
    { connected: true, lastSeenAt: mock.Timestamp.fromDate(new Date()), connectionGeneration: 3,
      seatId: 'admiral', assignedRoleId: 'admiral', activeConsoleRoleId: 'admiral', fleetGroupId: 'fleet-1' },
    { ...setup, setup, deleteAfter: null }, { ...navigation, revision: 5 }, true,
  );
  const group = { id: 'fleet-1', vesselIds: [...setup.activeVesselIds], memberUids: ['u1'], memberShipIds: { u1: 'aegis' } };
  const discovery = playerDiscoveryProjection(snapshot(current.playerData), navigation, 5, group.vesselIds, undefined, 'u1', 'aegis');
  const underlying = mock.get.getMockImplementation()!;
  mock.get.mockImplementation((ref: { path: string; filters?: unknown[] }) => {
    if (ref.path === 'sessions/s1/players' && ref.filters) {
      return { docs: [{ ...snapshot(current.playerData), id: 'u1' }] };
    }
    if (ref.path === 'sessions/s1/fleetGroups/fleet-1') return snapshot(group);
    if (ref.path === 'sessions/s1/fleetGroups') return { docs: [{ ...snapshot(group), id: 'fleet-1' }] };
    if (ref.path === 'sessions/s1/playerDiscoveries/u1') return snapshot({ ...discovery, updatedAt: 'prior-server-time' });
    if (ref.path === 'activeMemberships/u1') return snapshot({ sessionId: 's1' });
    return underlying(ref);
  });
  return current;
}

it('renews a current live member without scanning every player or rewriting shared discovery', async () => {
  prepareCurrentResume();
  mock.enforceReadOrder = true;

  const reply = await resumeSession.run(request('s1'));

  expect(reply.player).toMatchObject({ connectionGeneration: 4, assignedRoleId: 'admiral', seatId: 'admiral', activeConsoleRoleId: 'admiral' });
  expect(mock.get.mock.calls.map(([ref]) => ref.path)).not.toContain('sessions/s1/players');
  expect(nonRateLimitSetCalls().map(([ref]) => ref.path)).toEqual(['activeMemberships/u1']);
  expect(mock.update.mock.calls.map(([ref]) => ref.path)).not.toContain('sessions/s1/serverState/navigation');
});

it('restores missing printed loyalty directives from the current holder private secret on resume', async () => {
  const current = prepareResume({ status: 'open', holderUid: null });
  const secretPath = 'sessions/s1/secrets/loyalty-u1';
  overrideResumeRead(secretPath, {
    visibleToUids: ['u1'],
    payload: { type: 'loyalty', kind: 'android', suspicion: null, proofRevealed: true },
  });
  mock.enforceReadOrder = true;

  await resumeSession.run(request('s1'));

  expect(mock.update).toHaveBeenCalledWith(
    expect.objectContaining({ path: secretPath }),
    expect.objectContaining({ payload: expect.objectContaining({
      type: 'loyalty', kind: 'android', suspicion: null, proofRevealed: true,
      directives: expect.arrayContaining([expect.stringMatching(/android identity secret/i)]),
    }) }),
  );
});

it.each([
  ['GM', { role: 'gm' }],
  ['replacement', { replacementStatus: 'awaiting-re-role', replacementRoleId: 'cadet' }],
  ['foreign audience', { secretAudience: ['u2'] }],
] as const)('does not backfill a private loyalty card for a %s resume', async (_label, override) => {
  const playerPatch = 'secretAudience' in override ? {} : { ...override };
  prepareResume({ status: 'open', holderUid: null }, playerPatch);
  const secretPath = 'sessions/s1/secrets/loyalty-u1';
  const visibleToUids = 'secretAudience' in override ? override.secretAudience : ['u1'];
  overrideResumeRead(secretPath, {
    visibleToUids,
    payload: { type: 'loyalty', kind: 'wolf-agent', suspicion: 0 },
  });
  mock.enforceReadOrder = true;

  await resumeSession.run(request('s1'));

  expect(mock.update.mock.calls.some(([reference]) =>
    (reference as { path: string }).path === secretPath)).toBe(false);
});

function overrideResumeRead(path: string, fields: Readonly<Record<string, unknown>>, exists = true) {
  const underlying = mock.get.getMockImplementation()!;
  mock.get.mockImplementation((ref: { path: string }) => ref.path === path ? snapshot(fields, exists) : underlying(ref));
}

function prepareCurrentPressResume() {
  const current = prepareCurrentResume();
  Object.assign(current.playerData, { assignedRoleId: null, seatId: null, activeConsoleRoleId: 'press-officer' });
  current.sessionData.pressEnabled = true;
  current.sessionData.pressHolderUid = 'u1';
  const group = { id: 'fleet-1', vesselIds: current.sessionData.activeVesselIds as string[], memberUids: ['u1'] };
  const underlying = mock.get.getMockImplementation()!;
  const navigation = underlying({ path: 'sessions/s1/serverState/navigation' }).data();
  const projection = playerDiscoveryProjection(snapshot(current.playerData), navigation, 5, group.vesselIds, undefined, 'u1');
  mock.get.mockImplementation((ref: { path: string }) => {
    if (ref.path === 'sessions/s1/fleetGroups/fleet-1') return snapshot(group);
    if (ref.path === 'sessions/s1/fleetGroups') return { docs: [{ ...snapshot(group), id: 'fleet-1' }] };
    if (ref.path === 'sessions/s1/playerDiscoveries/u1') return snapshot({ ...projection, updatedAt: 'prior-server-time' });
    return underlying(ref);
  });
  return current;
}

it('renews an unchanged current Press member without locking all core players or shared navigation', async () => {
  prepareCurrentPressResume();
  mock.enforceReadOrder = true;

  const reply = await resumeSession.run(request('s1'));

  expect(reply.player).toMatchObject({ connectionGeneration: 4, assignedRoleId: null, seatId: null, activeConsoleRoleId: 'press-officer' });
  const playerQueries = mock.get.mock.calls.map(([ref]) => ref as { path: string; filters?: unknown[] })
    .filter(ref => ref.path === 'sessions/s1/players');
  expect(playerQueries).toHaveLength(1);
  expect(playerQueries[0].filters).toEqual([['activeConsoleRoleId', '==', 'press-officer']]);
  expect(nonRateLimitSetCalls().map(([ref]) => ref.path)).toEqual(['activeMemberships/u1']);
  expect(mock.update.mock.calls.map(([ref]) => ref.path)).toEqual(['sessions/s1/players/u1']);
});

it.each(['disabled', 'foreign-holder', 'legacy-assignment', 'stale-view'])('keeps noncanonical Press %s on full protected recovery', async condition => {
  const current = prepareCurrentPressResume();
  if (condition === 'disabled') current.sessionData.pressEnabled = false;
  if (condition === 'foreign-holder') current.sessionData.pressHolderUid = 'u2';
  if (condition === 'legacy-assignment') current.playerData.assignedRoleId = 'press-officer';
  if (condition === 'stale-view') overrideResumeRead('sessions/s1/playerDiscoveries/u1', { revision: 4, loyalty: 'private-marker' });
  mock.enforceReadOrder = true;

  const reply = await resumeSession.run(request('s1'));

  const fullPlayerReads = mock.get.mock.calls.map(([ref]) => ref as { path: string; filters?: unknown[] })
    .filter(ref => ref.path === 'sessions/s1/players' && !ref.filters);
  expect(fullPlayerReads).toHaveLength(1);
  if (condition === 'disabled' || condition === 'foreign-holder') {
    expect(reply).toMatchObject({ stationSelectionRequired: true, player: { activeConsoleRoleId: null } });
  }
  if (condition === 'foreign-holder') expect(current.sessionData.pressHolderUid).toBe('u2');
  if (condition === 'legacy-assignment') expect(reply.player.assignedRoleId).toBeNull();
  if (condition === 'stale-view') expect(mock.committedWrites.get('sessions/s1/playerDiscoveries/u1')?.fields).not.toHaveProperty('loyalty');
});

it('uses full recovery when a live member has lost the active membership marker', async () => {
  prepareCurrentResume();
  overrideResumeRead('activeMemberships/u1', {}, false);
  mock.enforceReadOrder = true;

  const reply = await resumeSession.run(request('s1'));

  expect(reply.player).toMatchObject({ connectionGeneration: 4, seatId: 'admiral', assignedRoleId: 'admiral' });
  expect(mock.get.mock.calls.map(([ref]) => ref.path)).toContain('sessions/s1/players');
  expect(mock.committedWrites.get('activeMemberships/u1')?.fields).toMatchObject({ sessionId: 's1' });
});

it('keeps disconnected actors on the seat and membership recovery path', async () => {
  const current = prepareCurrentResume();
  current.playerData.connected = false;
  overrideResumeRead('sessions/s1/seats/admiral', { status: 'open', holderUid: null });
  mock.enforceReadOrder = true;

  const reply = await resumeSession.run(request('s1'));

  expect(reply.player).toMatchObject({ connectionGeneration: 4, seatId: 'admiral', assignedRoleId: 'admiral' });
  expect(mock.get.mock.calls.map(([ref]) => ref.path)).toContain('sessions/s1/players');
  expect(mock.committedWrites.get('sessions/s1/seats/admiral')?.fields).toMatchObject({ status: 'claimed', holderUid: 'u1' });
  expect(current.playerData).toMatchObject({ connected: true, lastSeenAt: 'server-time' });
});

it('does not let an otherwise current resume reclaim a foreign seat', async () => {
  prepareCurrentResume();
  overrideResumeRead('sessions/s1/seats/admiral', { status: 'claimed', holderUid: 'u2' });
  mock.enforceReadOrder = true;

  const reply = await resumeSession.run(request('s1'));

  expect(reply).toMatchObject({ stationSelectionRequired: true, player: {
    connectionGeneration: 4, seatId: null, activeConsoleRoleId: null, assignedRoleId: 'admiral',
  } });
  expect(mock.get.mock.calls.map(([ref]) => ref.path)).toContain('sessions/s1/players');
  const foreignSeatWrite = mock.committedWrites.get('sessions/s1/seats/admiral')?.fields ?? {};
  expect(foreignSeatWrite).not.toHaveProperty('holderUid');
  expect(foreignSeatWrite).not.toHaveProperty('status');
  expect(foreignSeatWrite).not.toHaveProperty('claimedAt');
});

it('rebuilds a stale or extra private discovery field instead of accepting it as current', async () => {
  prepareCurrentResume();
  overrideResumeRead('sessions/s1/playerDiscoveries/u1', { groupId: 'fleet-1', revision: 4, loyalty: 'private-marker' });
  mock.enforceReadOrder = true;

  await resumeSession.run(request('s1'));

  expect(mock.get.mock.calls.map(([ref]) => ref.path)).toContain('sessions/s1/players');
  const projection = mock.committedWrites.get('sessions/s1/playerDiscoveries/u1');
  expect(projection?.replace).toBe(true);
  expect(projection?.fields).toMatchObject({ revision: 5, groupId: 'fleet-1', shipId: 'aegis' });
  expect(projection?.fields).not.toHaveProperty('loyalty');
});

it('allows normal resume retries by the authenticated member and ignores spoofed rate-limit fields', async () => {
  prepareResume({ status: 'open', holderUid: null });
  const identity = { callableName: 'resumeSession', sessionId: 's1', uid: 'u1' } as const;
  const markerPath = `sessions/s1/serverState/callableRateLimit-${callableRateLimitDocumentId(identity)}`;
  const spoofedRequest = () => ({
    data: { sessionId: 's1', uid: 'u2', skipRateLimit: true, rateLimitIdentity: 'u2' },
    auth: { uid: 'u1' },
  }) as CallableRequest<{ sessionId: string; uid: string; skipRateLimit: boolean; rateLimitIdentity: string }>;

  for (let index = 0; index < 10; index += 1) await resumeSession.run(spoofedRequest());
  await expect(resumeSession.run(spoofedRequest())).rejects.toMatchObject({ code: 'resource-exhausted' });

  expect(mock.rateLimitMarkers.get(markerPath)).toMatchObject({
    type: 'callable-rate-limit', callableName: 'resumeSession', requestCount: 10,
  });
  expect(mock.rateLimitMarkers.has(`sessions/s1/serverState/callableRateLimit-${callableRateLimitDocumentId({
    ...identity, uid: 'u2',
  })}`)).toBe(false);
});

it('lets a player return after two idle hours, clearing only an occupied old seat', async () => {
  prepareResume({ status: 'claimed', holderUid: 'u2' });

  const response = await resumeSession.run(request('s1')) as {
    player: { seatId: string | null };
  };

  expect(response.player.seatId).toBeNull();
  expect(mock.update).not.toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/seats/seat-1' }), expect.anything(),
  );
  expect(mock.set).not.toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/seats/seat-1' }), expect.anything(),
  );
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
    text: 'AIRSPACE CONTROL // AIRSPACE CLOSED',
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
            discovery: { id: 'aegis-discovery', occurredAt: '2026-09-12T23:59:00.000Z' },
            attempts: [{ id: 'aegis-attempt', occurredAt: '2026-09-13T00:00:00.000Z' }],
            hazards: [{ id: 'aegis-hazard', occurredAt: '2026-09-13T00:01:00.000Z' }],
            rewards: [{ id: 'aegis-reward', occurredAt: '2026-09-13T00:02:00.000Z' }],
            clearedThreats: [{ id: 'aegis-threat', occurredAt: '2026-09-13T00:03:00.000Z' }],
            candidateProgress: [{ id: 'aegis-candidate', occurredAt: '2026-09-13T00:04:00.000Z' }],
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
    systemHistory: {
      '5143': {
        discovery: { id: 'aegis-discovery' },
        attempts: [{ id: 'aegis-attempt' }],
        hazards: [{ id: 'aegis-hazard' }],
        rewards: [{ id: 'aegis-reward' }],
        clearedThreats: [{ id: 'aegis-threat' }],
        candidateProgress: [{ id: 'aegis-candidate' }],
      },
    },
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

it('does not project a retained Press shuttle as docked when legacy docking fields are absent', async () => {
  prepareResume(
    { status: 'open', holderUid: null },
    {},
    {
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
    },
  );

  const response = await resumeSession.run(request('s1')) as { session: Record<string, unknown> };
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
  expect(nonRateLimitSetCalls()).toEqual([]);
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
  expect(mock.rateLimitMarkers.size).toBe(0);
  expect(mock.update).not.toHaveBeenCalled();
  expect(nonRateLimitSetCalls()).toEqual([]);
});

it('resumes an existing disconnected member into a privacy-scoped immutable closed history without restoring presence', async () => {
  const { sessionData, playerData } = prepareResume(
    { status: 'open', holderUid: null },
    { role: 'player', connected: false, fleetGroupId: 'fleet-1' },
    {
      phase: 'closed', currentTurn: 5, playerCount: 2, turnLimit: 7, activeVesselIds: ['aegis', 'shepherd'],
      chartId: 'C', setup: { secret: 'chart-route' }, loyalty: { u1: 'wolf' },
      fullGameDemo: { status: 'complete', progression: 'manual' },
      gameOutcome: { type: 'game-outcome', result: 'success', cause: 'candidate-complete', candidateCode: 'N',
        cycle: 4, occurredAt: '2026-10-05T12:00:00.000Z', sourceId: 'private-source', groupId: 'foreign-group' },
      survivorOutcome: { type: 'survivor-outcome', cycle: 4, occurredAt: '2026-10-05T12:00:00.000Z',
        fleetShipPopulation: 100, survivingShipPopulation: 50, evacuatedPopulation: 0, escapePodCapacity: 0,
        lostPopulation: 50, smallVesselPopulation: 0, admittedVesselPopulation: 0, finalSurvivors: 50,
        survivingShipIds: ['aegis', 'shepherd'], lostOrDestroyedShipIds: [] },
      debriefSnapshot: { type: 'session-debrief', version: 1, source: 'candidate', result: 'success',
        cause: 'candidate-complete', cycle: 4, occurredAt: '2026-10-05T12:00:00.000Z',
        committedAt: '2026-10-05T12:01:00.000Z',
        outcome: { type: 'game-outcome', result: 'success', cause: 'candidate-complete', candidateCode: 'N',
          cycle: 4, occurredAt: '2026-10-05T12:00:00.000Z' },
        survivorOutcome: { type: 'survivor-outcome', cycle: 4, occurredAt: '2026-10-05T12:00:00.000Z',
          fleetShipPopulation: 100, survivingShipPopulation: 50, evacuatedPopulation: 0, escapePodCapacity: 0,
          lostPopulation: 50, smallVesselPopulation: 0, admittedVesselPopulation: 0, finalSurvivors: 50,
          survivingShipIds: ['aegis'], lostOrDestroyedShipIds: [] },
        candidate: { code: 'N', groups: [
          { groupId: 'fleet-1', requirements: [{ id: 'paid-crossing', status: 'met' }],
            rolls: [{ id: 'passage', face: 4, result: 'success', audience: 'members' },
              { id: 'nebula-bonus', face: 2, result: 'success', audience: 'gm' }],
            losses: [{ shipId: 'aegis', reason: 'candidate-loss', audience: 'members' },
              { shipId: 'shepherd', reason: 'foreign-loss', audience: 'members' }],
            humanCalls: [{ id: 'opposite-side-sabotage', cycle: 4, audience: 'members' }] },
          { groupId: 'fleet-2', requirements: [{ id: 'foreign-route', status: 'met' }], rolls: [], losses: [], humanCalls: [] },
        ] },
      },
    },
  );
  enableClosedHistoryReads();

  const response = await resumeSession.run(request('s1')) as {
    session: Record<string, unknown>;
    player: Record<string, unknown>;
  };

  expect(response.session).toMatchObject({ phase: 'closed', fullGameDemo: { status: 'complete', progression: 'manual' },
    gameOutcome: { result: 'success', cause: 'candidate-complete', candidateCode: 'N' },
    debriefSnapshot: { candidate: { groups: [{
      requirements: [{ id: 'paid-crossing', status: 'met' }],
      rolls: [{ id: 'passage', face: 4, result: 'success' }],
      losses: [{ shipId: 'aegis', reason: 'candidate-loss' }],
      humanCalls: [{ id: 'opposite-side-sabotage', cycle: 4 }],
    }] } } });
  expect(response.session).not.toHaveProperty('chartId');
  expect(response.session).not.toHaveProperty('setup');
  expect(response.session).not.toHaveProperty('loyalty');
  expect(JSON.stringify(response.session)).not.toMatch(/foreign-group|foreign-route|nebula-bonus|private-source|shepherd/);
  expect(response.player).toMatchObject({ uid: 'u1', role: 'player', fleetGroupId: 'fleet-1' });
  expect(sessionData.phase).toBe('closed');
  expect(playerData.connected).toBe(false);
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.delete).not.toHaveBeenCalled();
  expect(nonRateLimitSetCalls()).toEqual([]);
});

it.each([
  ['outsider', { role: 'player', connected: false, fleetGroupId: 'fleet-1', kickedAt: undefined }],
  ['kicked member', { role: 'player', connected: false, fleetGroupId: 'fleet-1', kickedAt: 'removed' }],
  ['observer', { role: 'observer', connected: false, fleetGroupId: 'fleet-1' }],
])('does not restore %s into closed history', async (_label, actorFields) => {
  prepareResume({ status: 'open', holderUid: null }, actorFields,
    { phase: 'closed', activeVesselIds: ['aegis'] });
  enableClosedHistoryReads('fleet-1', _label === 'outsider' ? ['u2'] : ['u1']);

  await expect(resumeSession.run(request('s1'))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.delete).not.toHaveBeenCalled();
  expect(nonRateLimitSetCalls()).toEqual([]);
});

it('returns a replacement awaiting re-role to station selection without reviving historical assignment', async () => {
  prepareResume({ status: 'open', holderUid: null }, {
    assignedRoleId: 'admiral', replacementRoleId: null, replacementStatus: 'awaiting-re-role',
    seatId: null, activeConsoleRoleId: null,
  });

  const response = await resumeSession.run(request('s1')) as {
    stationSelectionRequired?: boolean;
    player: {
      assignedRoleId?: string | null;
      replacementRoleId?: string | null;
      seatId: string | null;
      activeConsoleRoleId: string | null;
    };
  };

  expect(response).toMatchObject({
    stationSelectionRequired: true,
    player: {
      assignedRoleId: 'admiral', replacementRoleId: null,
      seatId: null, activeConsoleRoleId: null,
    },
  });
  expect(mock.update).not.toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/seats/admiral' }),
    expect.objectContaining({ holderUid: 'u1' }),
  );
});

it('does not reclaim a historical open seat for a replacement awaiting re-role', async () => {
  prepareResume({ status: 'open', holderUid: null }, {
    assignedRoleId: 'admiral', replacementRoleId: null, replacementStatus: 'awaiting-re-role',
    seatId: 'admiral', activeConsoleRoleId: 'admiral',
  });

  const response = await resumeSession.run(request('s1')) as {
    stationSelectionRequired?: boolean;
    player: { seatId: string | null; activeConsoleRoleId: string | null };
  };

  expect(response).toMatchObject({
    stationSelectionRequired: true,
    player: { seatId: null, activeConsoleRoleId: null },
  });
  expect(mock.update).not.toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/seats/admiral' }),
    expect.objectContaining({ holderUid: 'u1' }),
  );
});

it('keeps the old seat when the returning player still holds it', async () => {
  prepareResume({ status: 'claimed', holderUid: 'u1' }, {
    assignedRoleId: 'admiral', seatId: 'admiral', replacementRoleId: 'wolf-commander',
  });

  const response = await resumeSession.run(request('s1')) as {
    player: { seatId: string | null; replacementRoleId?: string | null };
  };

  expect(response.player.seatId).toBe('admiral');
  expect(response.player.replacementRoleId).toBe('wolf-commander');
  expect(mock.get).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/seats/admiral' }),
  );
  expect(mock.update).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/players/u1' }),
    {
      connected: true,
      connectionGeneration: 1,
      fleetGroupId: 'fleet-1',
      lastSeenAt: 'server-time',
    },
  );
});

it('advances the server connection generation on every resume', async () => {
  prepareResume({ status: 'claimed', holderUid: 'u1' }, {
    connectionGeneration: 7,
  });

  const response = await resumeSession.run(request('s1')) as {
    player: { connectionGeneration?: number };
  };

  expect(response.player.connectionGeneration).toBe(8);
  expect(mock.update).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/players/u1' }),
    expect.objectContaining({ connectionGeneration: 8 }),
  );
});

it('returns the generation committed by resume when a newer resume lands before projection read', async () => {
  const { playerData } = prepareResume({ status: 'claimed', holderUid: 'u1' }, {
    connectionGeneration: 1,
  });
  const updateImplementation = mock.update.getMockImplementation();
  mock.update.mockImplementation((ref: { path: string }, update: unknown) => {
    updateImplementation?.(ref, update);
    if (ref.path === 'sessions/s1/players/u1' &&
        typeof update === 'object' && update !== null &&
        (update as { connectionGeneration?: unknown }).connectionGeneration === 2) {
      // Simulate another resume committing before the callable's follow-up
      // projection read. The response must retain this transaction's token.
      playerData.connectionGeneration = 3;
    }
  });

  const response = await resumeSession.run(request('s1')) as {
    player: { connectionGeneration?: number };
  };

  expect(response.player.connectionGeneration).toBe(2);
  expect(playerData.connectionGeneration).toBe(3);
});

it.each([Number.MAX_SAFE_INTEGER, 0, 'corrupt'])('fails closed for an unsafe stored generation: %s', async (connectionGeneration) => {
  prepareResume({ status: 'claimed', holderUid: 'u1' }, { connectionGeneration });

  await expect(resumeSession.run(request('s1'))).rejects.toMatchObject({
    code: 'failed-precondition',
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(nonRateLimitSetCalls()).toEqual([]);
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

it('reads the returning seat before canonical resume writes begin', async () => {
  mock.enforceReadOrder = true;
  prepareResume(
    { status: 'claimed', holderUid: 'u1' },
    {},
    {
      playerCount: 8,
      chartId: 'A',
      expansion: 'base',
      turnLimit: 8,
      dioneEnabled: false,
      capybaraEnabled: true,
      activeRoleIds: [...recommendedRoleIds(8)],
      activeVesselIds: ['aegis', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
    },
  );

  await expect(resumeSession.run(request('s1'))).resolves.toMatchObject({
    player: { seatId: 'seat-1' },
  });
});

it('reclaims a canonical missing seat after setup hydration without clearing its pointer', async () => {
  mock.enforceReadOrder = true;
  const activeRoleIds = [...recommendedRoleIds(8)];
  prepareResume(
    {},
    { seatId: activeRoleIds[0] },
    {
      playerCount: 8,
      chartId: 'A',
      expansion: 'base',
      turnLimit: 8,
      dioneEnabled: false,
      capybaraEnabled: true,
      activeRoleIds,
      activeVesselIds: ['aegis', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
    },
    {},
    false,
    false,
  );

  await expect(resumeSession.run(request('s1'))).resolves.toMatchObject({
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
    if (path === 'sessions/s1/wolfAttackState/current') return snapshot({}, false);
    if (path === 'sessions/s1/serverState/navigation') return snapshot({}, false);
    if (path === 'sessions/s1/serverState/voyage33Movement') return snapshot({}, false);
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
    if (path === 'sessions/s1/wolfAttackState/current') return snapshot({}, false);
    if (path === 'sessions/s1/serverState/navigation') return snapshot({}, false);
    if (path === 'sessions/s1/serverState/voyage33Movement') return snapshot({}, false);
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
    mock.committedWrites.clear();
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
      if (path === 'sessions/s1/wolfAttackState/current') return snapshot({}, false);
      if (path === 'sessions/s1/serverState/navigation') return snapshot({}, false);
    if (path === 'sessions/s1/serverState/voyage33Movement') return snapshot({}, false);
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

it('never takes a foreign holder from an inconsistent open seat', async () => {
  prepareResume({ status: 'open', holderUid: 'u2' }, {
    seatId: 'admiral', assignedRoleId: 'admiral', activeConsoleRoleId: 'admiral',
  });
  await expect(resumeSession.run(request('s1'))).resolves.toMatchObject({
    stationSelectionRequired: true,
    player: { seatId: null, activeConsoleRoleId: null },
  });
  expect(mock.update).not.toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/seats/admiral' }),
    expect.objectContaining({ holderUid: 'u1' }),
  );
});
