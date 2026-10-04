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
  const ref = (path: string) => ({ path, id: path.split('/').at(-1) ?? '' });
  const get = vi.fn(async (target: { path: string }) => snapshot(target.path));
  const update = vi.fn((target: { path: string }, fields: Fields) => {
    documents.set(target.path, { ...(documents.get(target.path) ?? {}), ...fields });
  });
  const set = vi.fn((target: { path: string }, fields: Fields) => {
    documents.set(target.path, { ...fields });
  });
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback({ get, update, set }));
  return { documents, get, ...writes, update, set, runTransaction, db: { doc: ref, runTransaction } };
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

import { getWolfAttackThreatWindowOptions, setWolfAttackWindow } from './index';
import { emptySmallShipState } from './smallShip';
import { organiserSitesForChart } from './starChartLookup';

const baseData = {
  sessionId: 's1',
  instanceId: 'gm-1',
  requestId: 'wolf-1',
  expectedRevision: 0,
  status: 'due' as const,
};

function request(data: Record<string, unknown> = baseData, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

it('projects only live source-backed threat choices to the active GM for the selected group', async () => {
  const sites = organiserSitesForChart('B');
  const outpost = Object.entries(sites).find(([, site]) => site.code === 'L')?.[0];
  const fortress = Object.entries(sites).find(([, site]) => site.code === 'M')?.[0];
  if (!outpost || !fortress) throw new Error('The test chart needs an outpost and fortress.');
  session({ chartSelectionLocked: true, chartId: 'B', activeVesselIds: ['aegis', 'dione'] });
  put('sessions/s1/fleetGroups/fleet-2', { id: 'fleet-2', vesselIds: ['aegis'], memberUids: [] });
  put('sessions/s1/serverState/wolfArrivalPressure/groups/fleet-2', {
    type: 'wolf-base-arrival-pressure-state', groupId: 'fleet-2', chart: 'B', revision: 2,
    entries: [
      { type: 'wolf-base-arrival-pressure', status: 'operational', groupId: 'fleet-2', chart: 'B',
        coordinate: outpost, siteCode: 'L', sourceShipId: 'aegis', sourceTransitionId: 'jump-outpost',
        cycle: 1, revision: 1, attackStatus: 'scheduled', arrivalTiming: 'immediate', minimumBattleStations: 1,
        minimumOtherShipDamage: 20, missionAccess: 'blockedWhileWolfBaseOperational', recurringUntil: ['baseDestroyed', 'jumpAway'] },
      { type: 'wolf-base-arrival-pressure', status: 'operational', groupId: 'fleet-2', chart: 'B',
        coordinate: fortress, siteCode: 'M', sourceShipId: 'aegis', sourceTransitionId: 'jump-fortress',
        cycle: 1, revision: 2, attackStatus: 'scheduled', arrivalTiming: 'immediate', minimumBattleStations: 2,
        minimumOtherShipDamage: 25, missionAccess: 'blockedWhileWolfBaseOperational', recurringUntil: ['baseDestroyed', 'jumpAway'] },
    ],
  });
  const schedule = {
    type: 'wolf-base-arrival-pressure-schedule', status: 'scheduled', sessionId: 's1', groupId: 'fleet-2',
    chart: 'B', coordinate: outpost, siteCode: 'L', sourceShipId: 'aegis', sourceTransitionId: 'jump-outpost',
    sourceCycle: 1, arrivalTiming: 'immediate', minimumBattleStations: 1, minimumOtherShipDamage: 20,
    recurringUntil: ['baseDestroyed', 'jumpAway'], missionAccess: 'blockedWhileWolfBaseOperational',
  };
  put('sessions/s1/wolfAttackPressure/arrival-jump-outpost', schedule);
  put('sessions/s1/wolfAttackPressure/arrival-jump-fortress', {
    ...schedule, coordinate: fortress, siteCode: 'M', sourceTransitionId: 'jump-fortress', sourceCycle: 1,
    minimumBattleStations: 2, minimumOtherShipDamage: 25,
  });

  await expect(getWolfAttackThreatWindowOptions.run(request({ sessionId: 's1', instanceId: 'gm-1', targetGroupId: 'fleet-2' })))
    .resolves.toEqual({
      type: 'wolf-attack-threat-window-options', sessionId: 's1', targetGroupId: 'fleet-2', cycle: 1,
      sources: [
        { siteCode: 'L', sourceId: 'arrival-jump-outpost', sourceCycle: 1, coordinate: outpost },
        { siteCode: 'M', sourceId: 'arrival-jump-fortress', sourceCycle: 1, coordinate: fortress },
      ],
    });
});

it('denies threat source choices to non-GM and non-live facilitator instances', async () => {
  await expect(getWolfAttackThreatWindowOptions.run(request({ sessionId: 's1', instanceId: 'gm-1', targetGroupId: 'fleet-1' }, 'u2')))
    .rejects.toMatchObject({ code: 'permission-denied' });
  await expect(getWolfAttackThreatWindowOptions.run(request({ sessionId: 's1', instanceId: 'gm-absent', targetGroupId: 'fleet-1' })))
    .rejects.toMatchObject({ code: 'permission-denied' });
});

function put(path: string, fields: Fields): void {
  mock.documents.set(path, { ...fields });
}

function session(fields: Fields = {}): void {
  put('sessions/s1', { phase: 'active', currentTurn: 1, ...fields });
}

function gm(uid = 'u1', instanceId = 'gm-1', fields: Fields = {}): void {
  put(`sessions/s1/players/${uid}`, { uid, role: 'gm', connected: true, ...fields });
  put(`sessions/s1/gmInstances/${instanceId}`, { uid, connected: true, lastSeenAt: new Date() });
}

beforeEach(() => {
  mock.documents.clear();
  mock.get.mockClear();
  mock.update.mockClear();
  mock.set.mockClear();
  session();
  gm();
});

it('marks the private Turn 1 window with a monotonic revision and GM-only audit', async () => {
  await expect(setWolfAttackWindow.run(request())).resolves.toEqual({
    status: 'due', turn: 1, revision: 1,
  });

  expect(mock.documents.get('sessions/s1/wolfAttackWindow/current')).toMatchObject({
    status: 'due', turn: 1, revision: 1, updatedAt: 'server-time',
  });
  expect(mock.documents.get('sessions/s1/wolfAttackWindow/current/audit/wolf-1')).toMatchObject({
    type: 'wolf-attack-window', action: 'due', turn: 1, revision: 1, actorUid: 'u1',
  });
  expect(mock.documents.get('sessions/s1/commandReceipts/wolf-1')).toMatchObject({
    fingerprint: {
      action: 'set-wolf-attack-window', sessionId: 's1', requestId: 'wolf-1',
      actorUid: 'u1', instanceId: 'gm-1', expectedRevision: 0,
      payload: { status: 'due' },
    },
    result: { status: 'due', turn: 1, revision: 1 },
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect([...mock.documents.keys()].some((path) => path.includes('/events/'))).toBe(false);
});

it('binds a threat timing marker to its selected fleet group and server source', async () => {
  session({ chartSelectionLocked: true, chartId: 'B', activeVesselIds: ['aegis'] });
  put('sessions/s1/fleetGroups/fleet-2', {
    id: 'fleet-2', vesselIds: ['aegis'], memberUids: [],
  });
  put('sessions/s1/serverState/wolfArrivalPressure/groups/fleet-2', {
    type: 'wolf-base-arrival-pressure-state', groupId: 'fleet-2', chart: 'B', revision: 1,
    entries: [{
      type: 'wolf-base-arrival-pressure', status: 'operational', groupId: 'fleet-2', chart: 'B',
      coordinate: '1964', siteCode: 'P', sourceShipId: 'aegis', sourceTransitionId: 'jump-station',
      cycle: 1, revision: 1, attackStatus: 'scheduled', arrivalTiming: 'immediate',
      minimumBattleStations: 1, minimumOtherShipDamage: 20,
      missionAccess: 'blockedWhileWolfForcesRemain', recurringUntil: ['allWolfForcesDestroyed'],
    }],
  });
  put('sessions/s1/wolfAttackPressure/arrival-jump-station', {
    type: 'wolf-base-arrival-pressure-schedule', status: 'scheduled', sessionId: 's1',
    groupId: 'fleet-2', chart: 'B', coordinate: '1964', siteCode: 'P', sourceShipId: 'aegis',
    sourceTransitionId: 'jump-station', sourceCycle: 1, arrivalTiming: 'immediate',
    minimumBattleStations: 1, minimumOtherShipDamage: 20,
    recurringUntil: ['allWolfForcesDestroyed'], missionAccess: 'blockedWhileWolfForcesRemain',
  });
  const sourceData = {
    ...baseData,
    requestId: 'wolf-station-window',
    targetGroupId: 'fleet-2',
    threatSiteCode: 'P',
    threatSourceId: 'arrival-jump-station',
  };
  await expect(setWolfAttackWindow.run(request(sourceData))).resolves.toEqual({
    status: 'due', turn: 1, revision: 1,
    targetGroupId: 'fleet-2', threatSiteCode: 'P', threatSourceId: 'arrival-jump-station',
  });
  expect(mock.documents.get('sessions/s1/wolfAttackWindow/current/audit/wolf-station-window'))
    .toMatchObject({ targetGroupId: 'fleet-2', threatSiteCode: 'P', threatSourceId: 'arrival-jump-station' });
  expect(mock.documents.get('sessions/s1/commandReceipts/wolf-station-window'))
    .toMatchObject({ result: { targetGroupId: 'fleet-2', threatSiteCode: 'P' } });
});

it('rejects a caller-invented base source instead of opening an untriggered threat window', async () => {
  session({ chartSelectionLocked: true, chartId: 'B', activeVesselIds: ['aegis'] });
  put('sessions/s1/fleetGroups/fleet-2', {
    id: 'fleet-2', vesselIds: ['aegis'], memberUids: [],
  });
  put('sessions/s1/serverState/wolfArrivalPressure/groups/fleet-2', {
    type: 'wolf-base-arrival-pressure-state', groupId: 'fleet-2', chart: 'B', revision: 1,
    entries: [],
  });
  await expect(setWolfAttackWindow.run(request({
    ...baseData, requestId: 'wolf-forged-source', targetGroupId: 'fleet-2',
    threatSiteCode: 'P', threatSourceId: 'arrival-never-happened',
  }))).rejects.toMatchObject({
    code: 'failed-precondition', message: expect.stringMatching(/source|arrival|station/i),
  });
  expect(mock.documents.has('sessions/s1/wolfAttackWindow/current')).toBe(false);
  expect(mock.documents.has('sessions/s1/commandReceipts/wolf-forged-source')).toBe(false);
});

it('does not make the facilitator reopen a finalized P Station repeat window', async () => {
  const sequence = {
    type: 'p-station-sequence', sequenceId: 'wolf-p-station-jump-station', groupId: 'fleet-1',
    chart: 'B', coordinate: '1964', stationId: 'P', sourceTransitionId: 'jump-station',
    sourceCycle: 1, attackNumber: 3,
  };
  const survivor = {
    instanceId: '0:wolf-battlestation', shipId: 'wolf-battlestation', target: 'aegis',
  };
  const ranges = [
    { range: 'long-range', targetSnapshot: [], targetShifts: [], destroyedInstanceIds: ['1:wolf-cruiser'] },
    { range: 'medium-range', targetSnapshot: [], targetShifts: [], destroyedInstanceIds: [] },
    { range: 'short-range', targetSnapshot: [], targetShifts: [], destroyedInstanceIds: [] },
  ];
  const receipt = {
    type: 'wolf-combat-calculation', version: 1, requestId: 'wolf-final-wolf-attack-station-3',
    phase: { turn: 1, phase: 'coordination', serverTime: '2026-10-03T20:00:00.000Z',
      deadlineAt: '2026-10-03T20:10:00.000Z', overrun: false },
    targeting: { ring: ['aegis'], rolls: [] }, ranges, boarding: [], fleetDamage: [],
    forceField: { status: 'unavailable', preventedDamage: 0 },
    returningInstanceIds: ['0:wolf-battlestation'],
    survivingWolfShips: [survivor],
  };
  const carryover = {
    sourceAttackId: 'wolf-attack-station-2', sourceTurn: 1,
    sourceInstanceIds: ['0:wolf-battlestation'], rosterInstanceIds: ['0:wolf-battlestation'],
  };
  session({
    currentTurn: 1, chartSelectionLocked: true, chartId: 'B', activeVesselIds: ['aegis'],
  });
  put('sessions/s1/fleetGroups/fleet-1', { id: 'fleet-1', vesselIds: ['aegis'], memberUids: [] });
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
  put('sessions/s1/wolfAttackWindow/current', {
    status: 'resolved', turn: 1, revision: 3, targetGroupId: 'fleet-1',
    threatSiteCode: 'P', threatSourceId: 'arrival-jump-station',
  });
  put('sessions/s1/wolfAttackState/current', {
    type: 'wolf-attack-state', status: 'resolved', currentStep: 'resolved',
    attackId: 'wolf-attack-station-3', announcementId: 'wolf-attack-station-3', turn: 1,
    attackNumber: 3, previousAttackId: 'wolf-attack-station-2', carryover,
    revision: 9, airspaceLocked: false, parkingReleaseCondition: 'normal-movement-reopened',
    resolvedAt: '2026-10-03T20:00:00.000Z', finalizationRequestId: receipt.requestId,
    calculationReceipt: receipt,
    combatRoster: [
      { ...survivor, damageTaken: 0, destroyed: false },
      { instanceId: '1:wolf-cruiser', shipId: 'wolf-cruiser', target: 'aegis', damageTaken: 3, destroyed: true },
    ],
    pStationSequence: sequence,
  });
  put('sessions/s1/wolfAttackState/current/audit/wolf-finalized-1', {
    type: 'wolf-attack-finalization', turn: 1, revision: 9, actorUid: 'server',
    attackId: 'wolf-attack-station-3', requestId: receipt.requestId, receipt,
    attackNumber: 3, previousAttackId: 'wolf-attack-station-2', carryover, pStationSequence: sequence,
    rangeReceipts: ranges,
  });

  await expect(setWolfAttackWindow.run(request({
    ...baseData, requestId: 'wolf-station-repeat-4', expectedRevision: 3,
    targetGroupId: 'fleet-1', threatSiteCode: 'P', threatSourceId: 'arrival-jump-station',
  }))).rejects.toMatchObject({
    code: 'failed-precondition', message: expect.stringMatching(/timing marker.*unavailable|automatic|finalized/i),
  });
  expect(mock.documents.get('sessions/s1/wolfAttackWindow/current')).toMatchObject({
    status: 'resolved', turn: 1, revision: 3,
  });
  expect(mock.documents.has('sessions/s1/wolfAttackPreparation/current')).toBe(false);
  expect(mock.documents.has('sessions/s1/commandReceipts/wolf-station-repeat-4')).toBe(false);
});

it('requires a due marker before resolving and permits deferred Turn 2 recovery', async () => {
  await expect(setWolfAttackWindow.run(request({ ...baseData, status: 'deferred', requestId: 'wolf-defer' })))
    .resolves.toEqual({ status: 'deferred', turn: 2, revision: 1 });

  session({ currentTurn: 2 });
  await expect(setWolfAttackWindow.run(request({
    ...baseData, requestId: 'wolf-due-2', expectedRevision: 1,
  }))).resolves.toEqual({ status: 'due', turn: 2, revision: 2 });
  await expect(setWolfAttackWindow.run(request({
    ...baseData, requestId: 'wolf-resolve-2', expectedRevision: 2, status: 'resolved',
  }))).resolves.toEqual({ status: 'resolved', turn: 2, revision: 3 });
});

it('lets the facilitator select a later due window only after a finalized prior attack', async () => {
  const priorReceipt = {
    type: 'wolf-combat-calculation', version: 1, requestId: 'wolf-final-wolf-attack-prior',
    phase: { turn: 1, phase: 'coordination', serverTime: '2026-10-03T20:00:00.000Z',
      deadlineAt: '2026-10-03T20:10:00.000Z', overrun: false },
    targeting: { ring: ['aegis'], rolls: [] }, ranges: [
      { range: 'long-range', targetSnapshot: [], targetShifts: [] },
      { range: 'medium-range', targetSnapshot: [], targetShifts: [] },
      { range: 'short-range', targetSnapshot: [], targetShifts: [] },
    ], boarding: [], fleetDamage: [], forceField: { status: 'unavailable', preventedDamage: 0 },
    returningInstanceIds: ['0:wolf-fighter-wing'],
  };
  session({ currentTurn: 2 });
  put('sessions/s1/wolfAttackWindow/current', { status: 'resolved', turn: 1, revision: 2 });
  put('sessions/s1/wolfAttackState/current', {
    type: 'wolf-attack-state', status: 'resolved', currentStep: 'resolved',
    attackId: 'wolf-attack-prior', announcementId: 'wolf-attack-prior', turn: 1,
    attackNumber: 1, revision: 4, airspaceLocked: false,
    parkingReleaseCondition: 'normal-movement-reopened', resolvedAt: '2026-10-03T20:00:00.000Z',
    finalizationRequestId: 'wolf-final-wolf-attack-prior', calculationReceipt: priorReceipt,
  });
  put('sessions/s1/wolfAttackState/current/audit/wolf-finalized-1', {
    type: 'wolf-attack-finalization', turn: 1, revision: 4, actorUid: 'server',
    attackId: 'wolf-attack-prior', requestId: 'wolf-final-wolf-attack-prior', receipt: priorReceipt,
    rangeReceipts: priorReceipt.ranges,
  });

  await expect(setWolfAttackWindow.run(request({
    ...baseData, requestId: 'wolf-second-due', expectedRevision: 2,
  }))).resolves.toEqual({ status: 'due', turn: 2, revision: 3 });
  expect(mock.documents.get('sessions/s1/wolfAttackWindow/current/audit/wolf-second-due'))
    .toMatchObject({ action: 'due', turn: 2, actorUid: 'u1' });
});

it('allows the second additional attack after the second attack is finalized', async () => {
  const secondReceipt = {
    type: 'wolf-combat-calculation', version: 1, requestId: 'wolf-final-wolf-attack-second',
    phase: { turn: 2, phase: 'coordination', serverTime: '2026-10-03T20:00:00.000Z',
      deadlineAt: '2026-10-03T20:10:00.000Z', overrun: false },
    targeting: { ring: ['aegis'], rolls: [] }, ranges: [
      { range: 'long-range', targetSnapshot: [], targetShifts: [] },
      { range: 'medium-range', targetSnapshot: [], targetShifts: [] },
      { range: 'short-range', targetSnapshot: [], targetShifts: [] },
    ], boarding: [], fleetDamage: [], forceField: { status: 'unavailable', preventedDamage: 0 },
    returningInstanceIds: ['0:wolf-fighter-wing'],
  };
  const carryover = {
    sourceAttackId: 'wolf-attack-first', sourceTurn: 1,
    sourceInstanceIds: ['0:wolf-fighter-wing'], rosterInstanceIds: ['0:wolf-fighter-wing'],
  };
  session({ currentTurn: 3 });
  put('sessions/s1/wolfAttackWindow/current', { status: 'resolved', turn: 2, revision: 3 });
  put('sessions/s1/wolfAttackState/current', {
    type: 'wolf-attack-state', status: 'resolved', currentStep: 'resolved',
    attackId: 'wolf-attack-second', announcementId: 'wolf-attack-second', turn: 2,
    attackNumber: 2, previousAttackId: 'wolf-attack-first', carryover,
    revision: 7, airspaceLocked: false, parkingReleaseCondition: 'normal-movement-reopened',
    resolvedAt: '2026-10-03T20:00:00.000Z',
    finalizationRequestId: 'wolf-final-wolf-attack-second', calculationReceipt: secondReceipt,
  });
  put('sessions/s1/wolfAttackState/current/audit/wolf-finalized-2', {
    type: 'wolf-attack-finalization', turn: 2, revision: 7, actorUid: 'server',
    attackId: 'wolf-attack-second', requestId: 'wolf-final-wolf-attack-second', receipt: secondReceipt,
    attackNumber: 2, previousAttackId: 'wolf-attack-first', carryover,
    rangeReceipts: secondReceipt.ranges,
  });

  await expect(setWolfAttackWindow.run(request({
    ...baseData, requestId: 'wolf-third-due', expectedRevision: 3,
  }))).resolves.toEqual({ status: 'due', turn: 3, revision: 4 });
});

it('keeps a later attack window closed while the previous attack is unresolved', async () => {
  session({ currentTurn: 2 });
  put('sessions/s1/wolfAttackWindow/current', { status: 'resolved', turn: 1, revision: 2 });
  put('sessions/s1/wolfAttackState/current', {
    type: 'wolf-attack-state', status: 'declared', currentStep: 'medium-range',
    attackId: 'wolf-attack-still-running', turn: 1, revision: 6, airspaceLocked: true,
    parkingReleaseCondition: 'normal-movement-reopened',
  });

  await expect(setWolfAttackWindow.run(request({
    ...baseData, requestId: 'wolf-unresolved-next', expectedRevision: 2,
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/previous Wolf attack must finish/i),
  });
  expect(mock.documents.get('sessions/s1/wolfAttackWindow/current')).toEqual({
    status: 'resolved', turn: 1, revision: 2,
  });
  expect(mock.documents.has('sessions/s1/wolfAttackWindow/current/audit/wolf-unresolved-next')).toBe(false);
});

it('does not open more than two additional facilitator-selected attacks', async () => {
  session({ currentTurn: 4 });
  put('sessions/s1/wolfAttackWindow/current', { status: 'resolved', turn: 3, revision: 8 });
  const thirdReceipt = {
    type: 'wolf-combat-calculation', version: 1, requestId: 'wolf-final-wolf-attack-third',
    phase: { turn: 3, phase: 'coordination', serverTime: '2026-10-03T20:00:00.000Z',
      deadlineAt: '2026-10-03T20:10:00.000Z', overrun: false },
    targeting: { ring: ['aegis'], rolls: [] }, ranges: [
      { range: 'long-range', targetSnapshot: [], targetShifts: [] },
      { range: 'medium-range', targetSnapshot: [], targetShifts: [] },
      { range: 'short-range', targetSnapshot: [], targetShifts: [] },
    ], boarding: [], fleetDamage: [],
    forceField: { status: 'unavailable', preventedDamage: 0 }, returningInstanceIds: [],
  };
  put('sessions/s1/wolfAttackState/current', {
    type: 'wolf-attack-state', status: 'resolved', currentStep: 'resolved',
    attackId: 'wolf-attack-third', announcementId: 'wolf-attack-third', turn: 3,
    attackNumber: 3, previousAttackId: 'wolf-attack-second', carryover: {
      sourceAttackId: 'wolf-attack-second', sourceTurn: 2,
      sourceInstanceIds: ['0:wolf-fighter-wing'], rosterInstanceIds: ['0:wolf-fighter-wing'],
    }, revision: 9, airspaceLocked: false,
    parkingReleaseCondition: 'normal-movement-reopened', resolvedAt: '2026-10-03T20:00:00.000Z',
    finalizationRequestId: 'wolf-final-wolf-attack-third', calculationReceipt: thirdReceipt,
  });
  put('sessions/s1/wolfAttackState/current/audit/wolf-finalized-3', {
    type: 'wolf-attack-finalization', turn: 3, revision: 9, actorUid: 'server',
    attackId: 'wolf-attack-third', requestId: 'wolf-final-wolf-attack-third', receipt: thirdReceipt,
    attackNumber: 3, previousAttackId: 'wolf-attack-second',
    carryover: {
      sourceAttackId: 'wolf-attack-second', sourceTurn: 2,
      sourceInstanceIds: ['0:wolf-fighter-wing'], rosterInstanceIds: ['0:wolf-fighter-wing'],
    },
    rangeReceipts: thirdReceipt.ranges,
  });

  await expect(setWolfAttackWindow.run(request({
    ...baseData, requestId: 'wolf-fourth-due', expectedRevision: 8,
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/only one or two additional Wolf attacks/i),
  });
  expect(mock.documents.get('sessions/s1/wolfAttackWindow/current')).toEqual({
    status: 'resolved', turn: 3, revision: 8,
  });
  expect(mock.documents.has('sessions/s1/wolfAttackWindow/current/audit/wolf-fourth-due')).toBe(false);
});

it('denies ordinary facilitator attack selection after the chain cap, even for a Commander source', async () => {
  session({ currentTurn: 1, activeVesselIds: ['aegis'] });
  put('sessions/s1/fleetGroups/fleet-1', { id: 'fleet-1', vesselIds: ['aegis'], memberUids: [] });
  put('sessions/s1/wolfAttackWindow/current', {
    status: 'resolved', turn: 1, revision: 2, targetGroupId: 'fleet-1', threatSiteCode: 'commander',
  });
  put('sessions/s1/wolfAttackState/current', {
    type: 'wolf-attack-state', status: 'resolved', currentStep: 'resolved',
    attackId: 'wolf-attack-commander-cycle-1', announcementId: 'wolf-attack-commander-cycle-1',
    turn: 1, attackNumber: 1, revision: 6, airspaceLocked: false,
    parkingReleaseCondition: 'normal-movement-reopened', resolvedAt: '2026-10-03T20:00:00.000Z',
  });
  await expect(setWolfAttackWindow.run(request({
    ...baseData, requestId: 'commander-same-cycle-repeat', expectedRevision: 2,
    targetGroupId: 'fleet-1', threatSiteCode: 'commander',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.has('sessions/s1/wolfAttackWindow/current/audit/commander-same-cycle-repeat')).toBe(false);

  const receipt = {
    type: 'wolf-combat-calculation', version: 1, requestId: 'wolf-final-wolf-attack-commander-three',
    phase: { turn: 3, phase: 'coordination', serverTime: '2026-10-03T20:00:00.000Z',
      deadlineAt: '2026-10-03T20:10:00.000Z', overrun: false },
    targeting: { ring: ['aegis'], rolls: [] }, ranges: [
      { range: 'long-range', targetSnapshot: [], targetShifts: [] },
      { range: 'medium-range', targetSnapshot: [], targetShifts: [] },
      { range: 'short-range', targetSnapshot: [], targetShifts: [] },
    ], boarding: [], fleetDamage: [], forceField: { status: 'unavailable', preventedDamage: 0 },
    returningInstanceIds: [],
  };
  const carryover = {
    sourceAttackId: 'wolf-attack-commander-two', sourceTurn: 2,
    sourceInstanceIds: ['0:wolf-fighter-wing'], rosterInstanceIds: ['0:wolf-fighter-wing'],
  };
  session({ currentTurn: 4, activeVesselIds: ['aegis'] });
  put('sessions/s1/wolfAttackWindow/current', {
    status: 'resolved', turn: 3, revision: 8, targetGroupId: 'fleet-1', threatSiteCode: 'commander',
  });
  put('sessions/s1/wolfAttackState/current', {
    type: 'wolf-attack-state', status: 'resolved', currentStep: 'resolved',
    attackId: 'wolf-attack-commander-three', announcementId: 'wolf-attack-commander-three',
    turn: 3, attackNumber: 3, previousAttackId: 'wolf-attack-commander-two', carryover,
    revision: 9, airspaceLocked: false,
    parkingReleaseCondition: 'normal-movement-reopened', resolvedAt: '2026-10-03T20:00:00.000Z',
    finalizationRequestId: receipt.requestId, calculationReceipt: receipt,
  });
  put('sessions/s1/wolfAttackState/current/audit/wolf-finalized-3', {
    type: 'wolf-attack-finalization', turn: 3, revision: 9, actorUid: 'server',
    attackId: 'wolf-attack-commander-three', requestId: receipt.requestId, receipt,
    attackNumber: 3, previousAttackId: 'wolf-attack-commander-two', carryover,
    rangeReceipts: receipt.ranges,
  });
  await expect(setWolfAttackWindow.run(request({
    ...baseData, requestId: 'commander-cycle-4-attempt', expectedRevision: 8,
    targetGroupId: 'fleet-1', threatSiteCode: 'commander',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.get('sessions/s1/wolfAttackWindow/current')).toMatchObject({
    status: 'resolved', turn: 3, revision: 8,
  });
  expect(mock.documents.has('sessions/s1/wolfAttackWindow/current/audit/commander-cycle-4-attempt')).toBe(false);
});

it('replays an exact request without a second projection or audit write', async () => {
  await setWolfAttackWindow.run(request());
  mock.update.mockClear();
  mock.set.mockClear();

  await expect(setWolfAttackWindow.run(request())).resolves.toEqual({
    status: 'due', turn: 1, revision: 1,
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('rejects stale opposite actions without changing the private marker', async () => {
  await setWolfAttackWindow.run(request());
  mock.update.mockClear();
  mock.set.mockClear();

  await expect(setWolfAttackWindow.run(request({
    ...baseData, requestId: 'wolf-stale', expectedRevision: 0, status: 'deferred',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.documents.get('sessions/s1/wolfAttackWindow/current')).toMatchObject({
    status: 'due', turn: 1, revision: 1,
  });
});

it('rejects a stale same-status retry without writing a receipt', async () => {
  await setWolfAttackWindow.run(request());
  mock.update.mockClear();
  mock.set.mockClear();

  await expect(setWolfAttackWindow.run(request({
    ...baseData, requestId: 'wolf-stale-same-status', expectedRevision: 0, status: 'due',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.documents.has('sessions/s1/commandReceipts/wolf-stale-same-status')).toBe(false);
});

it('requires an admitted small ship to stay docked for its Wolf-attack window', async () => {
  session({ smallShipStates: { gorgoneion: emptySmallShipState('gorgoneion') } });
  await expect(setWolfAttackWindow.run(request({ ...baseData, requestId: 'wolf-undocked' })))
    .rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringMatching(/docked.*Wolf attack/i) });
  expect(mock.documents.has('sessions/s1/wolfAttackWindow/current')).toBe(false);
});

it('rejects every legacy M1 request namespace collision before any write', async () => {
  const requestId = 'wolf-legacy-collision';
  const legacyPaths = [
    `sessions/s1/setupMutationRequests/${requestId}`,
    `sessions/s1/gmResponsibilityRequests/${requestId}`,
    `sessions/s1/seatMutationRequests/${requestId}`,
    `sessions/s1/loyaltyAssignmentRequests/${requestId}`,
    `sessionStartRequests/s1_${requestId}`,
    `sessions/s1/events/setup-confirm-${requestId}`,
    `sessions/s1/events/gm-responsibility-${requestId}`,
    `sessions/s1/events/start-${requestId}`,
    `sessions/s1/events/seat-claim-${requestId}`,
    `sessions/s1/events/seat-release-${requestId}`,
    `sessions/s1/events/${requestId}`,
    `sessions/s1/events/press-availability-${requestId}`,
  ];

  for (const path of legacyPaths) {
    mock.documents.clear();
    mock.update.mockClear();
    mock.set.mockClear();
    session();
    gm();
    put(path, { legacy: true });

    await expect(setWolfAttackWindow.run(request({ ...baseData, requestId })))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mock.update).not.toHaveBeenCalled();
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.documents.has('sessions/s1/wolfAttackWindow/current')).toBe(false);
    expect(mock.documents.has(`sessions/s1/commandReceipts/${requestId}`)).toBe(false);
  }
});

it('denies non-GM, stale instances, malformed, closed, and out-of-window commands', async () => {
  await expect(setWolfAttackWindow.run(request({ ...baseData, status: 'later' }))).rejects
    .toMatchObject({ code: 'invalid-argument' });
  session({ phase: 'closed' });
  await expect(setWolfAttackWindow.run(request())).rejects.toMatchObject({ code: 'failed-precondition' });
  session({ phase: 'active', currentTurn: 0 });
  await expect(setWolfAttackWindow.run(request())).rejects.toMatchObject({ code: 'failed-precondition' });
  session({ currentTurn: 3 });
  await expect(setWolfAttackWindow.run(request())).rejects.toMatchObject({ code: 'failed-precondition' });
  session({ phase: 'lobby', currentTurn: 1 });
  await expect(setWolfAttackWindow.run(request())).rejects.toMatchObject({ code: 'failed-precondition' });
  session({ currentTurn: 1 });
  put('sessions/s1/players/u1', { uid: 'u1', role: 'player', connected: true });
  await expect(setWolfAttackWindow.run(request())).rejects.toMatchObject({ code: 'permission-denied' });
  put('sessions/s1/players/u1', { uid: 'u1', role: 'gm', connected: true });
  put('sessions/s1/gmInstances/gm-1', { uid: 'u2', connected: true });
  await expect(setWolfAttackWindow.run(request())).rejects.toMatchObject({ code: 'permission-denied' });
  await expect(setWolfAttackWindow.run({ data: baseData } as CallableRequest<typeof baseData>))
    .rejects.toMatchObject({ code: 'unauthenticated' });
  expect(mock.update).not.toHaveBeenCalled();
});
