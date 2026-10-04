import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

type Fields = Record<string, unknown>;

const mock = vi.hoisted(() => {
  const documents = new Map<string, Fields>();
  const snapshot = (path: string) => {
    const fields = documents.get(path);
    const isCollection = !fields;
    const prefix = `${path.replace(/\/$/, '')}/`;
    const docs = isCollection
      ? [...documents.entries()].flatMap(([candidatePath, value]) => {
        const relative = candidatePath.startsWith(prefix) ? candidatePath.slice(prefix.length) : '';
        return relative && !relative.includes('/')
          ? [{ id: relative, exists: true, ref: { path: candidatePath }, get: (field: string) => value[field], data: () => value }]
          : [];
      })
      : [];
    return {
      exists: fields !== undefined,
      id: path.split('/').at(-1) ?? '',
      ref: { path },
      docs,
      empty: docs.length === 0,
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
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback({ get, update, set }));
  return {
    documents, get, update, set, runTransaction,
    db: { doc: ref, collection: ref, runTransaction },
  };
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

import {
  createWolfAmnestyOffer,
  getWolfAmnestyView,
  publishWolfCommanderAddress,
  recordWolfAmnestyConsequence,
  respondToWolfAmnesty,
} from './index';

function put(path: string, fields: Fields): void {
  mock.documents.set(path, { ...fields });
}

function request(data: Fields, uid = 'commander'): CallableRequest<Fields> {
  return { data, auth: { uid } } as CallableRequest<Fields>;
}

function seedSession(): void {
  const teamEnd = new Date(Date.now() + 60_000).toISOString();
  put('sessions/s1', {
    phase: 'active', currentTurn: 3, activeVesselIds: ['aegis', 'dione', 'icebreaker'],
    turnPhase: { turn: 3, teamPhaseEndsAt: teamEnd,
      openAirspaceEndsAt: new Date(Date.parse(teamEnd) + 60_000).toISOString(),
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false } },
  });
  put('sessions/s1/players/commander', {
    uid: 'commander', role: 'player', connected: true, replacementRoleId: 'wolf-commander',
  });
  put('sessions/s1/players/dione-captain', {
    uid: 'dione-captain', role: 'player', connected: true,
    assignedRoleId: 'dione-captain', activeConsoleRoleId: 'dione-captain',
  });
  put('sessions/s1/players/gm', { uid: 'gm', role: 'gm', connected: true });
  put('sessions/s1/gmInstances/gm-browser', {
    uid: 'gm', connected: true, lastSeenAt: new Date(),
  });
}

beforeEach(() => {
  mock.documents.clear();
  mock.get.mockClear();
  mock.update.mockClear();
  mock.set.mockClear();
  seedSession();
});

it('publishes one attributable Commander address with only the fleet message in its event payload', async () => {
  await expect(publishWolfCommanderAddress.run(request({
    sessionId: 's1', requestId: 'commander-address-3', expectedCycle: 3,
    message: 'The fleet has one chance to yield before I return.',
  }))).resolves.toMatchObject({ status: 'committed', cycle: 3, actorRoleId: 'wolf-commander' });

  const events = [...mock.documents.entries()].filter(([path]) => path.includes('/events/'));
  expect(events).toHaveLength(1);
  expect(events[0]?.[1]).toMatchObject({
    type: 'wolf-commander-address', actorRoleId: 'wolf-commander',
    cycle: 3, message: 'The fleet has one chance to yield before I return.',
  });
  expect(events[0]?.[1]).not.toHaveProperty('shipIds');
  expect(events[0]?.[1]).not.toHaveProperty('damageCapacity');
  expect(mock.documents.get('sessions/s1/wolfCommanderAddresses/cycle-3'))
    .toMatchObject({ type: 'wolf-commander-address', cycle: 3, actorUid: 'commander' });
});

it('rejects a second Commander address in the same cycle without creating another event', async () => {
  await publishWolfCommanderAddress.run(request({
    sessionId: 's1', requestId: 'commander-address-first', expectedCycle: 3, message: 'First address.',
  }));
  await expect(publishWolfCommanderAddress.run(request({
    sessionId: 's1', requestId: 'commander-address-second', expectedCycle: 3, message: 'Second address.',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect([...mock.documents.keys()].filter((path) => path.includes('/events/'))).toHaveLength(1);
});

it('requires the current-cycle Commander address before offering amnesty and records a pending consequence', async () => {
  const requestData = {
    sessionId: 's1', requestId: 'amnesty-offer-3', expectedCycle: 3,
    targetShipId: 'dione', responseDeadlineMinutes: 10,
  };
  await expect(createWolfAmnestyOffer.run(request(requestData)))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  put('sessions/s1/wolfCommanderAddresses/cycle-3', {
    type: 'wolf-commander-address', cycle: 3, actorUid: 'commander', actorRoleId: 'wolf-commander',
  });

  await expect(createWolfAmnestyOffer.run(request(requestData))).resolves.toMatchObject({
    status: 'offered', cycle: 3, targetShipId: 'dione', targetUid: 'dione-captain',
    condition: 'surrender-by-medium-jump-to-0101', response: undefined,
  });
  expect(mock.documents.get('sessions/s1/wolfCommanderAmnesty/current'))
    .toMatchObject({ status: 'offered', targetUid: 'dione-captain', responseDeadline: expect.any(String) });
  expect(mock.documents.get('sessions/s1/wolfCommanderAmnesty/current')).not.toHaveProperty('ruling');
  expect([...mock.documents.keys()].filter((path) => path.includes('/events/'))).toHaveLength(0);
});

it('accepts a target captain response without deciding the bargain, then requires explicit GM consequence text', async () => {
  put('sessions/s1/wolfCommanderAmnesty/current', {
    type: 'wolf-amnesty-offer', sessionId: 's1', offerId: 'amnesty-3-1', cycle: 3, revision: 1,
    commanderUid: 'commander', targetShipId: 'dione', targetUid: 'dione-captain',
    condition: 'surrender-by-medium-jump-to-0101',
    responseDeadline: new Date(Date.now() + 60_000).toISOString(),
    status: 'offered',
  });

  await expect(respondToWolfAmnesty.run(request({
    sessionId: 's1', requestId: 'amnesty-response-3', expectedRevision: 1, answer: 'accept',
  }, 'other-player'))).rejects.toMatchObject({ code: 'permission-denied' });
  await expect(respondToWolfAmnesty.run(request({
    sessionId: 's1', requestId: 'amnesty-response-3', expectedRevision: 1, answer: 'accept',
  }, 'dione-captain'))).resolves.toMatchObject({
    status: 'accepted-pending-facilitator', response: 'accept', revision: 2,
  });
  expect(mock.documents.get('sessions/s1/wolfCommanderAmnesty/current')).not.toHaveProperty('ruling');

  await expect(recordWolfAmnestyConsequence.run(request({
    sessionId: 's1', instanceId: 'gm-browser', requestId: 'amnesty-ruling-3',
    expectedRevision: 2, text: 'Facilitator ruling: the Dione crew must still surrender by medium jump to 0101.',
  }, 'gm'))).resolves.toMatchObject({
    status: 'facilitator-ruled', revision: 3,
    ruling: 'Facilitator ruling: the Dione crew must still surrender by medium jump to 0101.',
  });
  expect(mock.documents.get('sessions/s1')).not.toHaveProperty('shipPositions');
  expect(mock.documents.get('sessions/s1/wolfCommanderAmnesty/current/audit/amnesty-ruling-3'))
    .toMatchObject({ action: 'facilitator-consequence', actorUid: 'gm' });
});

it('allows the GM to record an explicit ruling after the response deadline with no automatic response', async () => {
  put('sessions/s1/wolfCommanderAmnesty/current', {
    type: 'wolf-amnesty-offer', sessionId: 's1', offerId: 'amnesty-3-1', cycle: 3, revision: 1,
    commanderUid: 'commander', targetShipId: 'dione', targetUid: 'dione-captain',
    condition: 'surrender-by-medium-jump-to-0101', responseDeadline: '2026-10-04T11:00:00.000Z',
    status: 'offered',
  });
  vi.setSystemTime(new Date('2026-10-04T12:00:00.000Z'));
  await expect(recordWolfAmnestyConsequence.run(request({
    sessionId: 's1', instanceId: 'gm-browser', requestId: 'amnesty-expired-ruling',
    expectedRevision: 1, text: 'No response before the stated deadline; facilitator review required.',
  }, 'gm'))).resolves.toMatchObject({
    status: 'facilitator-ruled', response: undefined,
    ruling: 'No response before the stated deadline; facilitator review required.',
  });
  vi.useRealTimers();
});

it('filters the amnesty view to the Commander, target ship authority, and current GM', async () => {
  put('sessions/s1/wolfCommanderAmnesty/current', {
    type: 'wolf-amnesty-offer', sessionId: 's1', offerId: 'amnesty-3-1', cycle: 3, revision: 1,
    commanderUid: 'commander', targetShipId: 'dione', targetUid: 'dione-captain',
    condition: 'surrender-by-medium-jump-to-0101', responseDeadline: new Date(Date.now() + 60_000).toISOString(),
    status: 'offered',
  });
  await expect(getWolfAmnestyView.run(request({ sessionId: 's1' }, 'other-player')))
    .rejects.toMatchObject({ code: 'permission-denied' });
  await expect(getWolfAmnestyView.run(request({ sessionId: 's1' }, 'dione-captain')))
    .resolves.toMatchObject({ targetShipId: 'dione' });
  await expect(getWolfAmnestyView.run(request({ sessionId: 's1' }, 'commander')))
    .resolves.toMatchObject({ targetShipId: 'dione', targetUid: 'dione-captain' });
  await expect(getWolfAmnestyView.run(request({ sessionId: 's1' }, 'gm')))
    .resolves.toMatchObject({ targetShipId: 'dione' });
});
