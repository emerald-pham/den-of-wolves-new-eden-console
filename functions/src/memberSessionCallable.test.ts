import { beforeEach, expect, it, vi } from 'vitest';
import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import { createCurrentMemberSessionReader } from './memberSessionCallable';

let records: Record<string, Record<string, unknown>>;
const snapshot = (path: string) => ({ id: path.split('/').at(-1), exists: !!records[path],
  data: () => records[path], get: (key: string) => records[path]?.[key] });
const db = { doc: (path: string) => ({ path }), collection: (path: string) => ({ path, collection: true }),
  runTransaction: async (read: (tx: unknown) => unknown) => read({ get: async ({ path, collection }: { path: string; collection?: boolean }) =>
    collection ? { docs: Object.keys(records).filter(key => key.startsWith(path + '/') && key.slice(path.length + 1).indexOf('/') < 0).map(snapshot) }
      : snapshot(path) }),
} as unknown as Firestore;
// These fixtures already represent parsed public operational values; this suite
// isolates the transactional audience selector from the production index parser.
const projectSession = vi.fn((source: DocumentSnapshot, sessionId: string) => ({ ...source.data(), id: sessionId }));
const read = createCurrentMemberSessionReader({ db, projectSession });
const request = (data: Record<string, unknown> = { sessionId: 's1' }, uid = 'u1') => ({ auth: { uid }, data });
beforeEach(() => {
  projectSession.mockClear();
  projectSession.mockImplementation((source, sessionId) => ({ ...source.data(), id: sessionId }));
  records = {
    'sessions/s1': { name: 'Table', phase: 'active', currentTurn: 2, activeVesselIds: ['aegis', 'shepherd'],
      turnPhase: { turn: 2 }, shipResources: { aegis: { fuel: 90 }, shepherd: { fuel: 3 } },
      missionCraftCommitments: { hidden: 'mission-card' },
      shuttleDockings: [{ shuttleId: 'starlight', shipId: 'aegis' }, { shuttleId: 'endeavour', shipId: 'shepherd' }] },
    'sessions/s1/players/u1': { connected: true, role: 'player', fleetGroupId: 'fleet-2', connectionGeneration: 4,
      assignedRoleId: 'shepherd-captain', activeConsoleRoleId: 'shepherd-captain' },
    'sessions/s1/fleetGroups/fleet-1': { id: 'fleet-1', vesselIds: ['aegis'], memberUids: ['u2'] },
    'sessions/s1/fleetGroups/fleet-2': { id: 'fleet-2', vesselIds: ['shepherd'], memberUids: ['u1'] },
  };
});
it('reads live membership and state atomically with no caller-selected audience', async () => {
  const value = await read(request());
  expect(value).toMatchObject({ type: 'current-member-session', sessionId: 's1', actorUid: 'u1',
    groupId: 'fleet-2', connectionGeneration: 4, assignedRoleId: 'shepherd-captain' });
  expect(value.session.shipResources).toEqual({ shepherd: { fuel: 3 } });
  expect(value.session).not.toHaveProperty('missionCraftCommitments');
  await expect(read(request({ sessionId: 's1', groupId: 'fleet-1' }))).rejects.toMatchObject({ code: 'invalid-argument' });
  await expect(read(request({ sessionId: 's1', viewerShipId: 'aegis' }))).rejects.toMatchObject({ code: 'invalid-argument' });
});
it('uses a lock-free consistent transaction for the member projection', async () => {
  const transaction = vi.spyOn(db, 'runTransaction');
  try {
    await read(request());
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { readOnly: true });
  } finally { transaction.mockRestore(); }
});
it('denies wrong actor, disconnected actor, kicked actor and malformed membership', async () => {
  await expect(read(request(undefined, 'stranger'))).rejects.toMatchObject({ code: 'permission-denied' });
  for (const patch of [{ connected: false }, { kickedAt: 'now' }, { fleetGroupId: 'fleet-1' }]) {
    const previous = records['sessions/s1/players/u1']!;
    records['sessions/s1/players/u1'] = { ...previous, ...patch };
    await expect(read(request())).rejects.toMatchObject({ code: 'permission-denied' });
    records['sessions/s1/players/u1'] = previous;
  }
});
it('tracks actual craft group while in transit and removes it after foreign arrival', async () => {
  records['sessions/s1']!.shuttleDockings = [{ shuttleId: 'endeavour', shipId: 'aegis' }];
  records['sessions/s1']!.shuttleControl = { endeavour: { holderUid: 'u1' } };
  records['sessions/s1/shuttleDepartures/endeavour'] = { shuttleId: 'endeavour', status: 'in-transit', fleetGroupId: 'fleet-2' };
  expect((await read(request())).session.shuttleControl).toEqual({ endeavour: { holderUid: 'u1' } });
  records['sessions/s1/shuttleDepartures/endeavour']!.status = 'completed';
  expect((await read(request())).session.shuttleControl).toEqual({});
});

it('keeps only the current Press holder’s own SNN operations through docking and transit', async () => {
  const actor = records['sessions/s1/players/u1']!;
  Object.assign(actor, { assignedRoleId: null, activeConsoleRoleId: 'press-officer' });
  const snn = { shuttleId: 'snn-press-shuttle', ownerRoleId: 'press-officer', ownerUid: 'u1', holderUid: 'u1', revision: 1 };
  Object.assign(records['sessions/s1']!, {
    pressEnabled: true, pressHolderUid: 'u1',
    shuttleControl: { 'snn-press-shuttle': snn, starlight: { holderUid: 'u2' } },
    shuttleCargo: { 'snn-press-shuttle': { fuel: 1 }, starlight: { fuel: 99 } },
    shuttleFuelled: { 'snn-press-shuttle': true, starlight: true },
    shuttleDockings: [{ shuttleId: 'snn-press-shuttle', shipId: 'aegis', dockedAt: 'now' },
      { shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'now' }],
    shuttleVisitLog: [{ shuttleId: 'snn-press-shuttle', shipId: 'aegis', id: 'own-visit' },
      { shuttleId: 'starlight', shipId: 'aegis', id: 'foreign-visit' }],
  });
  const docked = (await read(request())).session;
  expect(docked.shipResources).toEqual({});
  expect(docked.shuttleControl).toEqual({ 'snn-press-shuttle': snn });
  expect(docked.shuttleCargo).toEqual({ 'snn-press-shuttle': { fuel: 1 } });
  expect(docked.shuttleFuelled).toEqual({ 'snn-press-shuttle': true });
  expect(docked.shuttleDockings).toEqual([{ shuttleId: 'snn-press-shuttle', shipId: 'aegis', dockedAt: 'now' }]);
  expect(docked.shuttleVisitLog).toEqual([{ shuttleId: 'snn-press-shuttle', shipId: 'aegis', id: 'own-visit' }]);
  records['sessions/s1']!.shuttleDockings = [];
  records['sessions/s1/shuttleDepartures/snn-press-shuttle'] = { shuttleId: 'snn-press-shuttle', status: 'in-transit', fleetGroupId: 'fleet-1' };
  expect((await read(request())).session.shuttleControl).toEqual({ 'snn-press-shuttle': snn });
  for (const change of [{ pressHolderUid: 'u2' }, { pressEnabled: false },
    { shuttleControl: { 'snn-press-shuttle': { ...snn, holderUid: 'u2' } } }]) {
    const previous = { ...records['sessions/s1'] };
    Object.assign(records['sessions/s1']!, change);
    expect((await read(request())).session.shuttleControl).toEqual({});
    records['sessions/s1'] = previous;
  }
});


it('uses the required public parser on the same transaction snapshot instead of spreading the stored root', async () => {
  projectSession.mockImplementation((_source, sessionId) => ({ id: sessionId, phase: 'active',
    activeVesselIds: ['aegis', 'shepherd'], shipResources: { shepherd: { fuel: 3 } } }));
  records['sessions/s1']!.fleetTicker = { internal: 'server-private' };
  const response = await read(request());
  expect(projectSession).toHaveBeenCalledWith(expect.objectContaining({ exists: true }), 's1');
  expect(response.session.shipResources).toEqual({ shepherd: { fuel: 3 } });
  expect(response.session).not.toHaveProperty('fleetTicker');
  expect(response.session).not.toHaveProperty('missionCraftCommitments');
});

it('returns only entitled immutable history for an existing disconnected member after closure', async () => {
  records['sessions/s1'] = {
    ...records['sessions/s1'], phase: 'closed', chartId: 'C',
    setup: { chartId: 'C', hiddenChartRoute: 'secret' }, loyalty: { hidden: true }, hand: ['private-card'],
    fullGameDemo: { status: 'complete', progression: 'manual' },
    gameOutcome: { type: 'game-outcome', result: 'success', cause: 'candidate-complete', candidateCode: 'N',
      cycle: 4, occurredAt: '2026-10-05T12:00:00.000Z', groupId: 'foreign', sourceId: 'secret', leftBehindShipIds: ['aegis'] },
    debriefSnapshot: {
      type: 'session-debrief', version: 1, source: 'candidate', result: 'success', cause: 'candidate-complete',
      cycle: 4, occurredAt: '2026-10-05T12:00:00.000Z', committedAt: '2026-10-05T12:01:00.000Z',
      outcome: { type: 'game-outcome', result: 'success', cause: 'candidate-complete', candidateCode: 'N',
        cycle: 4, occurredAt: '2026-10-05T12:00:00.000Z' },
      candidate: { code: 'N', groups: [
        { groupId: 'fleet-2', requirements: [{ id: 'paid-crossing', status: 'met' }],
          rolls: [{ id: 'passage', face: 4, result: 'success', audience: 'members' },
            { id: 'nebula-bonus', face: 2, result: 'success', audience: 'gm' }],
          losses: [{ shipId: 'shepherd', reason: 'candidate-loss', audience: 'members' },
            { shipId: 'aegis', reason: 'foreign-loss', audience: 'members' }],
          humanCalls: [{ id: 'opposite-side-sabotage', cycle: 4, audience: 'members' }] },
        { groupId: 'fleet-1', requirements: [{ id: 'foreign-route', status: 'met' }], rolls: [], losses: [], humanCalls: [] },
      ] },
    },
  };
  records['sessions/s1/players/u1'] = { ...records['sessions/s1/players/u1'], connected: false };

  const response = await read(request());
  expect(response.session).toMatchObject({ phase: 'closed', fullGameDemo: { status: 'complete', progression: 'manual' },
    gameOutcome: { result: 'success', cause: 'candidate-complete', candidateCode: 'N' },
    debriefSnapshot: { result: 'success', candidate: { groups: [{
      requirements: [{ id: 'paid-crossing', status: 'met' }], rolls: [{ id: 'passage', face: 4, result: 'success' }],
      losses: [{ shipId: 'shepherd', reason: 'candidate-loss' }],
      humanCalls: [{ id: 'opposite-side-sabotage', cycle: 4 }],
    }] } } });
  for (const key of ['chartId', 'setup', 'loyalty', 'hand', 'shipResources', 'shipDamage']) {
    expect(response.session).not.toHaveProperty(key);
  }
  expect(JSON.stringify(response.session)).not.toMatch(/foreign|sourceId|nebula-bonus|aegis|fleet-1|hiddenChartRoute/);
});

it('reads closed history without parsing retained operational setup or scanning raw session state', async () => {
  records['sessions/s1'] = {
    ...records['sessions/s1'], phase: 'closed', chartId: 'corrupt-private-chart', setup: { invalid: true },
    debriefSnapshot: { type: 'session-debrief', version: 1, source: 'final-cycle', result: 'completed',
      cause: 'final-cycle', cycle: 2, occurredAt: '2026-10-05T12:00:00.000Z', committedAt: '2026-10-05T12:01:00.000Z' },
  };
  records['sessions/s1/players/u1']!.connected = false;
  projectSession.mockImplementation(() => { throw new Error('closed history must not parse operational setup'); });

  const response = await read(request());

  expect(response.session).toMatchObject({ phase: 'closed', debriefSnapshot: { result: 'completed' } });
  expect(response.session).not.toHaveProperty('setup');
  expect(response.session).not.toHaveProperty('chartId');
  expect(projectSession).not.toHaveBeenCalled();
});

it('retains a valid full-game preparation marker in the current member projection', async () => {
  records['sessions/s1']!.fullGameDemo = { status: 'preparing', progression: 'manual' };

  expect((await read(request())).session.fullGameDemo).toEqual({ status: 'preparing', progression: 'manual' });
});

it.each(['held', 'ready'] as const)('returns the server-owned K privacy epoch to the current member (%s)', async state => {
  records['sessions/s1']!.awayMissionProjectionSafety = { policyVersion: 1, epoch: 3, state, writeRevision: 17 };

  const response = await read(request());

  expect(response.actorUid).toBe('u1');
  expect(response.session.shipResources).toEqual({ shepherd: { fuel: 3 } });
  expect(response.session.awayMissionProjectionSafety).toEqual({ policyVersion: 1, epoch: 3, state });
  expect(JSON.stringify(response.session)).not.toContain('writeRevision');
});

it('keeps current GM readiness independent of a held K privacy epoch and denies foreign membership', async () => {
  records['sessions/s1']!.awayMissionProjectionSafety = { policyVersion: 1, epoch: 3, state: 'held', writeRevision: 17 };
  records['sessions/s1/players/u1']!.role = 'gm';

  const response = await read(request());

  expect(response.session.shipResources).toEqual({ aegis: { fuel: 90 }, shepherd: { fuel: 3 } });
  expect(response.session).not.toHaveProperty('missionCraftCommitments');
  await expect(read(request(undefined, 'stranger'))).rejects.toMatchObject({ code: 'permission-denied' });
});

it('denies closed history to disconnected outsiders, stale-group readers, and kicked members', async () => {
  records['sessions/s1']!.phase = 'closed';
  records['sessions/s1/players/u1']!.connected = false;
  await expect(read(request(undefined, 'stranger'))).rejects.toMatchObject({ code: 'permission-denied' });
  records['sessions/s1/players/u1']!.fleetGroupId = 'fleet-1';
  await expect(read(request())).rejects.toMatchObject({ code: 'permission-denied' });
  records['sessions/s1/players/u1']!.fleetGroupId = 'fleet-2';
  records['sessions/s1/players/u1']!.kickedAt = '2026-10-05T12:00:00.000Z';
  await expect(read(request())).rejects.toMatchObject({ code: 'permission-denied' });
});
