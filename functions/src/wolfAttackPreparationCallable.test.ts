import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

type Fields = Record<string, unknown>;

const mock = vi.hoisted(() => {
  const documents = new Map<string, Fields>();
  const writes = { update: vi.fn(), set: vi.fn() };
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
  const querySnapshot = (path: string) => ({
    docs: [...documents.keys()]
      .filter((candidate) => candidate.startsWith(`${path}/`) && !candidate.slice(path.length + 1).includes('/'))
      .map((candidate) => snapshot(candidate)),
  });
  const ref = (path: string) => ({ path, id: path.split('/').at(-1) ?? '' });
  const collection = (path: string) => ({ path });
  const get = vi.fn(async (target: { path: string }) =>
    target.path.endsWith('/fleetGroups') || target.path.endsWith('/players')
      ? querySnapshot(target.path) : snapshot(target.path));
  const update = vi.fn((target: { path: string }, fields: Fields) => {
    documents.set(target.path, { ...(documents.get(target.path) ?? {}), ...fields });
  });
  const set = vi.fn((target: { path: string }, fields: Fields) => {
    documents.set(target.path, { ...fields });
  });
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback({ get, update, set }));
  return { documents, get, ...writes, update, set, runTransaction, db: { doc: ref, collection, runTransaction } };
});

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mock.db,
  FieldValue: { serverTimestamp: () => 'server-time' },
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

import { stageWolfAttackPreparation } from './index';

const firstTurnCards = [
  ...Array<string>(10).fill('wolf-fighter-wing'),
  ...Array<string>(5).fill('wolf-assault-transport'),
];
const baseData = {
  sessionId: 's1',
  instanceId: 'gm-1',
  requestId: 'wolf-prep-1',
  expectedRevision: 0,
  turn: 1,
  shipIds: firstTurnCards,
  targetMode: 'pre-rolled' as const,
  targetAssignments: [{ cardIndex: 0, targetShipId: 'aegis' }],
  modifiers: ['aegis-command-and-control'] as const,
  notes: 'Keep the first target private until declaration.',
};

function request(data: Record<string, unknown> = baseData, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

function put(path: string, fields: Fields): void {
  mock.documents.set(path, { ...fields });
}

function session(fields: Fields = {}): void {
  put('sessions/s1', {
    phase: 'active',
    currentTurn: 1,
    activeVesselIds: ['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
    ...fields,
  });
}

function gm(uid = 'u1', instanceId = 'gm-1', fields: Fields = {}): void {
  put(`sessions/s1/players/${uid}`, { uid, role: 'gm', connected: true, ...fields });
  put(`sessions/s1/gmInstances/${instanceId}`, { uid, connected: true, lastSeenAt: new Date(), ...fields });
}

beforeEach(() => {
  mock.documents.clear();
  mock.get.mockClear();
  mock.update.mockClear();
  mock.set.mockClear();
  session();
  gm();
});

it('writes a private validated draft and no player event', async () => {
  await expect(stageWolfAttackPreparation.run(request())).resolves.toEqual(expect.objectContaining({
    turn: 1,
    revision: 1,
    shipIds: firstTurnCards,
    targetMode: 'pre-rolled',
    targetAssignments: [{ cardIndex: 0, targetShipId: 'aegis' }],
    modifiers: ['aegis-command-and-control'],
  }));
  expect(mock.documents.get('sessions/s1/wolfAttackPreparation/current')).toMatchObject({
    turn: 1, revision: 1, updatedAt: 'server-time',
  });
  expect(mock.documents.get('sessions/s1/wolfAttackPreparation/current/audit/wolf-prep-1')).toMatchObject({
    type: 'wolf-attack-preparation', turn: 1, revision: 1, actorUid: 'u1',
  });
  expect([...mock.documents.keys()].some((path) => path.includes('/events/'))).toBe(false);
});

it('audits legacy player-action preparation markers as inert choices', async () => {
  const markers = [
    'wolf-commander-target-reroll',
    'aegis-command-and-control',
    'gorgoneion-force-field-projector',
  ] as const;
  await expect(stageWolfAttackPreparation.run(request({
    ...baseData, requestId: 'legacy-player-markers', modifiers: markers,
  }))).resolves.toMatchObject({ modifiers: markers });

  expect(mock.documents.get('sessions/s1/wolfAttackPreparation/current/audit/legacy-player-markers'))
    .toMatchObject({
      type: 'wolf-attack-preparation',
      ignoredPlayerChoiceMarkers: [...markers].sort(),
    });
  expect(mock.documents.get('sessions/s1/wolfAttackPreparation/current'))
    .not.toHaveProperty('forceFieldTargetId');
});

it('replays an exact request without rewriting the private projection', async () => {
  await stageWolfAttackPreparation.run(request());
  mock.update.mockClear();
  mock.set.mockClear();
  await expect(stageWolfAttackPreparation.run(request())).resolves.toEqual(expect.objectContaining({ revision: 1 }));
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('rejects stale CAS, inactive targets, and invalid composition', async () => {
  await stageWolfAttackPreparation.run(request());
  await expect(stageWolfAttackPreparation.run(request({ ...baseData, requestId: 'stale', expectedRevision: 0 })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(stageWolfAttackPreparation.run(request({
    ...baseData, requestId: 'inactive-target', targetAssignments: [{ cardIndex: 0, targetShipId: 'capybara' }],
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(stageWolfAttackPreparation.run(request({
    ...baseData, requestId: 'bad-roster', shipIds: [...firstTurnCards.slice(1), 'wolf-destroyer'],
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
});

it('accepts the published P arrival composition and binds it to the selected Station group', async () => {
  session({ chartSelectionLocked: true, chartId: 'B' });
  put('sessions/s1/wolfAttackWindow/current', {
    status: 'due', turn: 1, revision: 1,
    targetGroupId: 'fleet-1', threatSiteCode: 'P', threatSourceId: 'arrival-jump-station',
  });
  put('sessions/s1/fleetGroups/fleet-1', { id: 'fleet-1', vesselIds: ['aegis'], memberUids: ['u1'] });
  put('sessions/s1/serverState/wolfArrivalPressure/groups/fleet-1', {
    type: 'wolf-base-arrival-pressure-state', groupId: 'fleet-1', chart: 'B', revision: 1,
    entries: [{
      type: 'wolf-base-arrival-pressure', status: 'operational', groupId: 'fleet-1', chart: 'B',
      coordinate: '1964', siteCode: 'P', sourceShipId: 'aegis', sourceTransitionId: 'jump-station',
      cycle: 1, revision: 1, attackStatus: 'scheduled', arrivalTiming: 'immediate',
      minimumBattleStations: 1, minimumOtherShipDamage: 20,
      missionAccess: 'blockedWhileWolfForcesRemain', recurringUntil: ['allWolfForcesDestroyed'],
    }],
  });
  put('sessions/s1/wolfAttackPressure/arrival-jump-station', {
    type: 'wolf-base-arrival-pressure-schedule', status: 'scheduled', sessionId: 's1',
    groupId: 'fleet-1', chart: 'B', coordinate: '1964', siteCode: 'P', sourceShipId: 'aegis',
    sourceTransitionId: 'jump-station', sourceCycle: 1, arrivalTiming: 'immediate',
    minimumBattleStations: 1, minimumOtherShipDamage: 20,
    recurringUntil: ['allWolfForcesDestroyed'], missionAccess: 'blockedWhileWolfForcesRemain',
  });
  const stationRoster = ['wolf-battlestation', ...Array<string>(10).fill('wolf-strikecarrier')];
  await expect(stageWolfAttackPreparation.run(request({
    ...baseData, requestId: 'p-arrival-preparation', shipIds: stationRoster,
  }))).resolves.toMatchObject({
    compositionKind: 'P', targetGroupId: 'fleet-1', shipIds: stationRoster,
  });
});

it('keeps a same-cycle P Station repeat roster under server authority', async () => {
  session({ chartSelectionLocked: true, chartId: 'B' });
  put('sessions/s1/wolfAttackWindow/current', {
    status: 'due', turn: 1, revision: 4,
    targetGroupId: 'fleet-1', threatSiteCode: 'P', threatSourceId: 'arrival-jump-station',
  });
  put('sessions/s1/fleetGroups/fleet-1', { id: 'fleet-1', vesselIds: ['aegis'], memberUids: ['u1'] });
  put('sessions/s1/wolfAttackState/current', {
    type: 'wolf-attack-state', status: 'resolved', currentStep: 'resolved', turn: 1, attackNumber: 3,
    attackId: 'wolf-attack-station-3', pStationSequence: {
      type: 'p-station-sequence', sequenceId: 'wolf-p-station-jump-station', groupId: 'fleet-1',
      chart: 'B', coordinate: '1964', stationId: 'P', sourceTransitionId: 'jump-station',
      sourceCycle: 1, attackNumber: 3,
    },
  });
  put('sessions/s1/wolfAttackPreparation/current', {
    turn: 1, revision: 6, shipIds: ['wolf-battlestation', 'wolf-fighter-wing'],
    targetMode: 'pre-rolled', targetAssignments: [], modifiers: [], notes: '',
    compositionKind: 'p-station-repeat', targetGroupId: 'fleet-1',
  });
  put('sessions/s1/serverState/wolfArrivalPressure/groups/fleet-1', {
    type: 'wolf-base-arrival-pressure-state', groupId: 'fleet-1', chart: 'B', revision: 1,
    entries: [{
      type: 'wolf-base-arrival-pressure', status: 'operational', groupId: 'fleet-1', chart: 'B',
      coordinate: '1964', siteCode: 'P', sourceShipId: 'aegis', sourceTransitionId: 'jump-station',
      cycle: 1, revision: 1, attackStatus: 'scheduled', arrivalTiming: 'immediate',
      minimumBattleStations: 1, minimumOtherShipDamage: 20,
      missionAccess: 'blockedWhileWolfForcesRemain', recurringUntil: ['allWolfForcesDestroyed'],
    }],
  });
  put('sessions/s1/wolfAttackPressure/arrival-jump-station', {
    type: 'wolf-base-arrival-pressure-schedule', status: 'scheduled', sessionId: 's1',
    groupId: 'fleet-1', chart: 'B', coordinate: '1964', siteCode: 'P', sourceShipId: 'aegis',
    sourceTransitionId: 'jump-station', sourceCycle: 1, arrivalTiming: 'immediate',
    minimumBattleStations: 1, minimumOtherShipDamage: 20,
    recurringUntil: ['allWolfForcesDestroyed'], missionAccess: 'blockedWhileWolfForcesRemain',
  });

  await expect(stageWolfAttackPreparation.run(request({
    ...baseData, requestId: 'p-repeat-forged-roster', expectedRevision: 6,
    shipIds: ['wolf-battlestation', ...Array<string>(10).fill('wolf-strikecarrier')],
  }))).rejects.toMatchObject({
    code: 'failed-precondition', message: expect.stringMatching(/survivor|server-generated|repeat/i),
  });
  expect(mock.documents.get('sessions/s1/wolfAttackPreparation/current')).toMatchObject({
    compositionKind: 'p-station-repeat', shipIds: ['wolf-battlestation', 'wolf-fighter-wing'],
  });
  expect(mock.set).not.toHaveBeenCalled();
});

it('requires the Commander composition to match ten plus only the selected group pursuit', async () => {
  put('sessions/s1/wolfAttackWindow/current', {
    status: 'due', turn: 1, revision: 1, targetGroupId: 'fleet-1', threatSiteCode: 'commander',
  });
  put('sessions/s1/fleetGroups/fleet-1', {
    id: 'fleet-1', vesselIds: ['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
    memberUids: ['u1'],
  });
  put('sessions/s1/players/u1', { uid: 'u1', role: 'gm', connected: true, fleetGroupId: 'fleet-1' });
  put('sessions/s1/players/wolfcmd', {
    uid: 'wolfcmd', role: 'player', connected: true, fleetGroupId: 'fleet-1', replacementRoleId: 'wolf-commander',
  });
  put('sessions/s1/serverState/navigation', { revision: 3, pursuitGroups: { 'fleet-1': 4 } });
  const commanderCycleAttack = {
    type: 'wolf-commander-cycle-attack', cycle: 1, ledgerId: 'cycle-1', groupId: 'fleet-1',
    targetGroupPursuit: 4, navigationRevision: 3, commanderUid: 'wolfcmd', attackNumber: 1,
    requestId: 'commander-dial-cycle-1',
  };
  put('sessions/s1/wolfCommanderCycleDials/cycle-1', {
    type: 'wolf-commander-cycle-dial', status: 'committed', cycle: 1,
    commanderCycleAttack, actorUid: 'wolfcmd',
  });
  const exactDial = ['wolf-strikecarrier', ...Array<string>(3).fill('wolf-cruiser')];
  await expect(stageWolfAttackPreparation.run(request({
    ...baseData, requestId: 'commander-exact-dial', shipIds: exactDial,
  }))).resolves.toMatchObject({
    compositionKind: 'commander', targetGroupId: 'fleet-1', targetGroupPursuit: 4, shipIds: exactDial,
  });
  await expect(stageWolfAttackPreparation.run(request({
    ...baseData, requestId: 'commander-wrong-dial', expectedRevision: 1,
    shipIds: ['wolf-strikecarrier', 'wolf-cruiser', 'wolf-cruiser', 'wolf-destroyer'],
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
});

it('replaces a prior-turn projection under CAS and replays the Turn 2 request', async () => {
  await stageWolfAttackPreparation.run(request());
  session({ currentTurn: 2 });
  const turnTwoData = {
    ...baseData,
    requestId: 'wolf-prep-turn-2',
    expectedRevision: 1,
    turn: 2,
    shipIds: ['wolf-battlestation', 'wolf-battlestation', 'wolf-cruiser'],
  };

  await expect(stageWolfAttackPreparation.run(request(turnTwoData))).resolves.toEqual(expect.objectContaining({
    turn: 2,
    revision: 2,
    shipIds: turnTwoData.shipIds,
  }));
  expect(mock.documents.get('sessions/s1/wolfAttackPreparation/current')).toMatchObject({ turn: 2, revision: 2 });

  mock.update.mockClear();
  mock.set.mockClear();
  await expect(stageWolfAttackPreparation.run(request(turnTwoData))).resolves.toEqual(expect.objectContaining({
    turn: 2,
    revision: 2,
  }));
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('rejects a future projection and missing or malformed persisted active-vessel tuples', async () => {
  await stageWolfAttackPreparation.run(request());
  session({ currentTurn: 2 });
  await stageWolfAttackPreparation.run(request({
    ...baseData,
    requestId: 'wolf-prep-turn-2',
    expectedRevision: 1,
    turn: 2,
    shipIds: ['wolf-battlestation', 'wolf-battlestation', 'wolf-cruiser'],
  }));
  session({ currentTurn: 1 });
  await expect(stageWolfAttackPreparation.run(request({ ...baseData, requestId: 'future-projection', expectedRevision: 2 })))
    .rejects.toMatchObject({ code: 'failed-precondition' });

  mock.documents.delete('sessions/s1/wolfAttackPreparation/current');
  session({ currentTurn: 1, activeVesselIds: undefined });
  await expect(stageWolfAttackPreparation.run(request({ ...baseData, requestId: 'missing-tuple' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  session({ activeVesselIds: ['aegis', 'aegis'] });
  await expect(stageWolfAttackPreparation.run(request({ ...baseData, requestId: 'duplicate-tuple' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  session({ activeVesselIds: ['aegis', 'not-a-vessel'] });
  await expect(stageWolfAttackPreparation.run(request({ ...baseData, requestId: 'malformed-tuple' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
});

it('requires an active GM, active phase, and current turn', async () => {
  put('sessions/s1/players/u1', { uid: 'u1', role: 'player', connected: true });
  await expect(stageWolfAttackPreparation.run(request())).rejects.toMatchObject({ code: 'permission-denied' });
  gm();
  session({ phase: 'lobby' });
  await expect(stageWolfAttackPreparation.run(request({ ...baseData, requestId: 'lobby' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  session({ phase: 'active', currentTurn: 2 });
  await expect(stageWolfAttackPreparation.run(request({ ...baseData, requestId: 'stale-turn' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
});
