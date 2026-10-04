import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

type Fields = Record<string, unknown>;

const mock = vi.hoisted(() => {
  const documents = new Map<string, Fields>();
  const snapshot = (path: string) => {
    const fields = documents.get(path);
    return {
      exists: fields !== undefined,
      id: path.split('/').at(-1) ?? '',
      ref: { path },
      get: (field: string) => fields?.[field],
      data: () => fields,
    };
  };
  const collectionSnapshot = (path: string) => ({
    docs: [...documents.keys()]
      .filter((documentPath) => documentPath.startsWith(`${path}/`) && documentPath.slice(path.length + 1).indexOf('/') === -1)
      .map((documentPath) => snapshot(documentPath)),
  });
  const ref = (path: string) => ({ path, id: path.split('/').at(-1) ?? '' });
  const collection = (path: string) => ({ path, kind: 'collection' as const });
  const get = vi.fn(async (target: { path: string; kind?: string }) =>
    target.kind === 'collection' ? collectionSnapshot(target.path) : snapshot(target.path));
  const set = vi.fn((target: { path: string }, fields: Fields) => {
    documents.set(target.path, { ...fields });
  });
  const update = vi.fn((target: { path: string }, fields: Fields) => {
    documents.set(target.path, { ...(documents.get(target.path) ?? {}), ...fields });
  });
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback({ get, set, update, delete: (target: { path: string }) => documents.delete(target.path) }));
  return { documents, get, set, update, runTransaction, db: { doc: ref, collection, runTransaction } };
});

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mock.db,
  FieldValue: { serverTimestamp: () => 'server-time', delete: () => 'delete-field' },
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error {
    constructor(readonly code: string, message: string) { super(message); }
  },
  onCall: (handler: (request: unknown) => unknown) => ({ run: handler }),
}));
vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_schedule: string, handler: (event: unknown) => unknown) => ({ run: handler }),
}));

import { castPresidentialBallot, configurePresidentialElection, resolvePresidentialElection } from './index';

const policy = {
  eligibleVoterUids: ['u2', 'u3', 'u4'],
  votingSystem: 'plurality',
  populationWeighting: 'ship-population',
  openCycle: 2,
  closeCycle: 2,
  vicePresidentEnabled: true,
  campaigning: 'structured',
  supplyUse: 'prohibited',
  campaignInstructions: 'One short statement per candidate. No fleet supplies may be used.',
  tieRule: 'facilitator-choice',
} as const;

function request(data: Record<string, unknown>, uid = 'gm'): CallableRequest<Record<string, unknown>> {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

function put(path: string, fields: Fields): void {
  mock.documents.set(path, { ...fields });
}

function provision(currentTurn = 2, phase: 'team' | 'coordination' = 'team'): void {
  const now = new Date();
  put('sessions/s1', {
    phase: 'active', currentTurn,
    activeRoleIds: ['dione-president', 'icebreaker-captain', 'shepherd-scientist'],
    shipSurvivors: { dione: 20_000, icebreaker: 50_000, shepherd: 30_000 },
    turnPhase: {
      turn: currentTurn,
      teamPhaseEndsAt: '2026-10-04T11:00:00.000Z',
      openAirspaceEndsAt: '2026-10-04T11:30:00.000Z',
      airspace: { state: phase === 'team' ? 'restricted' : 'lifted', tickerActive: true, pressAccess: phase === 'coordination' },
    },
    turnState: { currentTurn, maxTurn: 6, phase, phaseRevision: 1, startedAt: now.toISOString(), endsAt: '2026-10-04T11:30:00.000Z' },
  });
  put('sessions/s1/players/gm', { uid: 'gm', role: 'gm', connected: true });
  put('sessions/s1/gmInstances/gm-instance', { uid: 'gm', connected: true, lastSeenAt: now });
  put('sessions/s1/players/u2', { uid: 'u2', role: 'player', connected: true, assignedRoleId: 'dione-president' });
  put('sessions/s1/players/u3', { uid: 'u3', role: 'player', connected: true, assignedRoleId: 'icebreaker-captain' });
  put('sessions/s1/players/u4', { uid: 'u4', role: 'player', connected: true, assignedRoleId: 'shepherd-scientist' });
}

beforeEach(() => {
  mock.documents.clear();
  mock.get.mockClear();
  mock.set.mockClear();
  mock.update.mockClear();
  provision();
});

it('configures a complete pre-ballot policy from live roster authority and keeps derived ship mapping private', async () => {
  const result = await configurePresidentialElection.run(request({
    sessionId: 's1', instanceId: 'gm-instance', requestId: 'configure-election',
    expectedRevision: 0, policy,
  }));

  expect(result).toMatchObject({ status: 'committed', state: 'scheduled', revision: 1,
    policy: { eligibleVoterUids: ['u2', 'u3', 'u4'], openCycle: 2, closeCycle: 2,
      votingSystem: 'plurality', populationWeighting: 'ship-population',
      campaigning: 'structured', supplyUse: 'prohibited' } });
  expect(result).not.toHaveProperty('voterShipIds');
  expect(mock.documents.get('sessions/s1/presidentialElections/current')).toMatchObject({
    revision: 1, state: 'scheduled', policy: { voterShipIds: { u2: 'dione', u3: 'icebreaker', u4: 'shepherd' } },
  });
  expect(mock.documents.get('sessions/s1')).toMatchObject({ presidentialElection: { revision: 1, state: 'scheduled' } });
});

it('accepts one eligible private ballot during its configured Team cycles without returning votes', async () => {
  await configurePresidentialElection.run(request({
    sessionId: 's1', instanceId: 'gm-instance', requestId: 'configure-election', expectedRevision: 0,
    policy: { ...policy, openCycle: 2, closeCycle: 3, vicePresidentEnabled: false },
  }));

  const result = await castPresidentialBallot.run(request({
    sessionId: 's1', requestId: 'ballot-u2', expectedRevision: 1, presidentUid: 'u3',
  }, 'u2'));

  expect(result).toMatchObject({ status: 'committed', electionRevision: 1, requestId: 'ballot-u2' });
  expect(result).not.toHaveProperty('presidentUid');
  expect(result).not.toHaveProperty('ballots');
  expect(mock.documents.get('sessions/s1/presidentialElections/current/ballots/u2')).toMatchObject({
    voterUid: 'u2', ballot: { presidentUid: 'u3' },
  });
});

it('calculates a private population-weighted tally after the close cycle and commits the elected offices', async () => {
  await configurePresidentialElection.run(request({
    sessionId: 's1', instanceId: 'gm-instance', requestId: 'configure-election', expectedRevision: 0, policy,
  }));
  put('sessions/s1/presidentialElections/current/ballots/u2', { voterUid: 'u2', ballot: { presidentUid: 'u3', vicePresidentUid: 'u4' } });
  put('sessions/s1/presidentialElections/current/ballots/u3', { voterUid: 'u3', ballot: { presidentUid: 'u3', vicePresidentUid: 'u2' } });
  put('sessions/s1/presidentialElections/current/ballots/u4', { voterUid: 'u4', ballot: { presidentUid: 'u2', vicePresidentUid: 'u2' } });
  put('sessions/s1/players/u2', { uid: 'u2', role: 'player', connected: true, displayName: 'President Candidate' });
  put('sessions/s1/players/u3', { uid: 'u3', role: 'player', connected: true, displayName: 'Icebreaker Candidate' });
  put('sessions/s1/players/u4', { uid: 'u4', role: 'player', connected: true, displayName: 'Shepherd Candidate' });

  const result = await resolvePresidentialElection.run(request({
    sessionId: 's1', instanceId: 'gm-instance', requestId: 'resolve-election', expectedRevision: 1,
  }));

  expect(result).toMatchObject({ status: 'committed', state: 'resolved', revision: 2,
    presidentUid: 'u3', vicePresidentUid: 'u2',
    tally: { president: { totalVotes: 3, totalWeight: 100_000, winnerUid: 'u3' } } });
  expect(result).not.toHaveProperty('ballots');
  expect(result).not.toHaveProperty('voterUids');
  expect(mock.documents.get('sessions/s1')).toMatchObject({
    presidentialOffices: { presidentUid: 'u3', vicePresidentUid: 'u2' },
    pendingTeamAnnouncements: [{ kind: 'presidential-election', decidedCycle: 2 }],
  });
  expect(mock.documents.get('sessions/s1/presidentialElections/current/audit/resolve-election'))
    .toMatchObject({ action: 'resolve', tally: expect.objectContaining({ president: expect.any(Object) }) });
});

it('denies ineligible voters, wrong phases and early tally without writing a ballot or exposing a count', async () => {
  await configurePresidentialElection.run(request({
    sessionId: 's1', instanceId: 'gm-instance', requestId: 'configure-election', expectedRevision: 0,
    policy: { ...policy, openCycle: 2, closeCycle: 3 },
  }));
  await expect(castPresidentialBallot.run(request({
    sessionId: 's1', requestId: 'ineligible-ballot', expectedRevision: 1, presidentUid: 'u3',
  }, 'unknown'))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.documents.has('sessions/s1/presidentialElections/current/ballots/unknown')).toBe(false);

  await expect(resolvePresidentialElection.run(request({
    sessionId: 's1', instanceId: 'gm-instance', requestId: 'too-early', expectedRevision: 1,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.get('sessions/s1/presidentialElections/current')).toMatchObject({ state: 'scheduled', revision: 1 });
});

it('rejects stale ballots and changing an already submitted ballot', async () => {
  await configurePresidentialElection.run(request({
    sessionId: 's1', instanceId: 'gm-instance', requestId: 'configure-election', expectedRevision: 0,
    policy: { ...policy, openCycle: 2, closeCycle: 3, vicePresidentEnabled: false },
  }));
  await expect(castPresidentialBallot.run(request({
    sessionId: 's1', requestId: 'stale-ballot', expectedRevision: 0, presidentUid: 'u3',
  }, 'u2'))).rejects.toMatchObject({ code: 'failed-precondition' });

  await castPresidentialBallot.run(request({
    sessionId: 's1', requestId: 'ballot-once', expectedRevision: 1, presidentUid: 'u3',
  }, 'u2'));
  await expect(castPresidentialBallot.run(request({
    sessionId: 's1', requestId: 'ballot-replace', expectedRevision: 1, presidentUid: 'u4',
  }, 'u2'))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.get('sessions/s1/presidentialElections/current/ballots/u2')).toMatchObject({ ballot: { presidentUid: 'u3' } });
});
