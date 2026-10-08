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
  onCall: (optionsOrHandler: unknown, maybeHandler?: (request: unknown) => unknown) => ({ run: maybeHandler ?? optionsOrHandler }),
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
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false } },
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
  }))).resolves.toMatchObject({ status: 'committed', requestId: 'commander-address-3',
    cycle: 3, actorRoleId: 'wolf-commander' });

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

it.each(['manual', 'automatic'] as const)('denies a new Commander Team address in %s Coordination without an event or receipt', async progression => {
  const session = mock.documents.get('sessions/s1')!;
  put('sessions/s1', { ...session,
    ...(progression === 'manual' ? { fullGameDemo: { status: 'active', progression: 'manual' } } : {}),
    turnPhase: { ...(session.turnPhase as Fields), ...(progression === 'manual' ? { progression: 'manual' } : {}),
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false } },
  });
  const before = structuredClone([...mock.documents]);
  await expect(publishWolfCommanderAddress.run(request({
    sessionId: 's1', requestId: `coordination-address-${progression}`, expectedCycle: 3,
    message: 'An address must wait for the next live Team Phase.',
  }))).rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringMatching(/live Team Phase/) });
  expect([...mock.documents]).toEqual(before);
  expect(mock.documents.has('sessions/s1/wolfCommanderAddresses/cycle-3')).toBe(false);
});

it('permits a manual restricted Team address after its stored deadline and recovers only the exact current Commander receipt in Coordination', async () => {
  const session = mock.documents.get('sessions/s1')!;
  put('sessions/s1', { ...session, fullGameDemo: { status: 'active', progression: 'manual' },
    turnPhase: { ...(session.turnPhase as Fields), progression: 'manual',
      teamPhaseEndsAt: '2020-01-01T00:00:00.000Z', openAirspaceEndsAt: '2020-01-01T00:10:00.000Z' },
  });
  const payload = { sessionId: 's1', requestId: 'manual-team-address', expectedCycle: 3, message: 'Team address.' };
  const committed = await publishWolfCommanderAddress.run(request(payload));
  put('sessions/s1', { ...mock.documents.get('sessions/s1'),
    turnPhase: { ...(mock.documents.get('sessions/s1')!.turnPhase as Fields),
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false } },
  });
  const before = structuredClone([...mock.documents]);
  await expect(publishWolfCommanderAddress.run(request(payload))).resolves.toEqual(committed);
  await expect(publishWolfCommanderAddress.run(request({ ...payload, message: 'Changed message.' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(publishWolfCommanderAddress.run(request(payload, 'gm')))
    .rejects.toMatchObject({ code: 'permission-denied' });
  expect([...mock.documents]).toEqual(before);
  put('sessions/s1/players/commander', { ...mock.documents.get('sessions/s1/players/commander'), connected: false });
  await expect(publishWolfCommanderAddress.run(request(payload)))
    .rejects.toMatchObject({ code: 'permission-denied' });
});

it('still rejects an expired ordinary restricted Team address', async () => {
  const session = mock.documents.get('sessions/s1')!;
  put('sessions/s1', { ...session,
    turnPhase: { ...(session.turnPhase as Fields), teamPhaseEndsAt: '2020-01-01T00:00:00.000Z' },
  });
  await expect(publishWolfCommanderAddress.run(request({
    sessionId: 's1', requestId: 'expired-normal-address', expectedCycle: 3, message: 'Too late.',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.has('sessions/s1/wolfCommanderAddresses/cycle-3')).toBe(false);
});

it('offers the printed amnesty condition without requiring a prior address and records a pending consequence', async () => {
  const requestData = {
    sessionId: 's1', requestId: 'amnesty-offer-3', expectedCycle: 3,
    targetShipId: 'dione', responseDeadlineMinutes: 10,
  };
  const result = await createWolfAmnestyOffer.run(request(requestData));
  expect(result).toMatchObject({
    status: 'offered', cycle: 3, targetShipId: 'dione', targetUid: 'dione-captain',
    condition: 'surrender-by-medium-jump-to-0101',
  });
  expect(mock.documents.has('sessions/s1/wolfCommanderAddresses/cycle-3')).toBe(false);
  await expect(createWolfAmnestyOffer.run(request(requestData))).resolves.toEqual(result);
  await expect(createWolfAmnestyOffer.run(request(requestData, 'other-player')))
    .rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.documents.get('sessions/s1/wolfCommanderAmnesty/current'))
    .toMatchObject({ status: 'offered', targetUid: 'dione-captain', responseDeadline: expect.any(String) });
  expect(mock.documents.get('sessions/s1/wolfCommanderAmnesty/current')).not.toHaveProperty('ruling');
  expect([...mock.documents.keys()].filter((path) => path.includes('/events/') && path.includes('amnesty'))).toHaveLength(0);
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
  put('sessions/s1/gmInstances/gm-browser', {
    uid: 'gm', connected: true, lastSeenAt: new Date(),
  });
  await expect(recordWolfAmnestyConsequence.run(request({
    sessionId: 's1', instanceId: 'gm-browser', requestId: 'amnesty-expired-ruling',
    expectedRevision: 1, text: 'No response before the stated deadline; facilitator review required.',
  }, 'gm'))).resolves.toMatchObject({
    status: 'facilitator-ruled',
    ruling: 'No response before the stated deadline; facilitator review required.',
  });
  vi.useRealTimers();
});

it('keeps manual full-game amnesty response and GM ruling available after the stored deadline', async () => {
  const session = mock.documents.get('sessions/s1')!;
  const phase = session.turnPhase as Fields;
  put('sessions/s1', {
    ...session,
    fullGameDemo: { status: 'active', progression: 'manual' },
    turnPhase: { ...phase, progression: 'manual' },
  });
  put('sessions/s1/wolfCommanderAmnesty/current', {
    type: 'wolf-amnesty-offer', sessionId: 's1', offerId: 'amnesty-3-manual', cycle: 3, revision: 1,
    commanderUid: 'commander', targetShipId: 'dione', targetUid: 'dione-captain',
    condition: 'surrender-by-medium-jump-to-0101', responseDeadline: '2000-01-01T00:00:00.000Z',
    status: 'offered',
  });

  await expect(respondToWolfAmnesty.run(request({
    sessionId: 's1', requestId: 'amnesty-manual-response', expectedRevision: 1, answer: 'accept',
  }, 'dione-captain'))).resolves.toMatchObject({
    status: 'accepted-pending-facilitator', response: 'accept', revision: 2,
  });

  put('sessions/s1/wolfCommanderAmnesty/current', {
    type: 'wolf-amnesty-offer', sessionId: 's1', offerId: 'amnesty-3-manual-ruling', cycle: 3, revision: 1,
    commanderUid: 'commander', targetShipId: 'dione', targetUid: 'dione-captain',
    condition: 'surrender-by-medium-jump-to-0101', responseDeadline: '2000-01-01T00:00:00.000Z',
    status: 'offered',
  });
  await expect(recordWolfAmnestyConsequence.run(request({
    sessionId: 's1', instanceId: 'gm-browser', requestId: 'amnesty-manual-ruling',
    expectedRevision: 1, text: 'Facilitator records the explicit demo consequence.',
  }, 'gm'))).resolves.toMatchObject({
    status: 'facilitator-ruled', ruling: 'Facilitator records the explicit demo consequence.', revision: 2,
  });
});

it('filters the amnesty view to the Commander, target ship authority, and current GM', async () => {
  put('sessions/s1/wolfCommanderAddresses/cycle-3', {
    type: 'wolf-commander-address', status: 'committed', cycle: 3, actorUid: 'commander',
  });
  put('sessions/s1/wolfCommanderAmnesty/current', {
    type: 'wolf-amnesty-offer', sessionId: 's1', offerId: 'amnesty-3-1', cycle: 3, revision: 1,
    commanderUid: 'commander', targetShipId: 'dione', targetUid: 'dione-captain',
    condition: 'surrender-by-medium-jump-to-0101', responseDeadline: new Date(Date.now() + 60_000).toISOString(),
    status: 'offered',
  });
  put('sessions/s1/players/other-player', { uid: 'other-player', role: 'player', connected: true });
  await expect(getWolfAmnestyView.run(request({ sessionId: 's1' }, 'other-player')))
    .resolves.toMatchObject({ offer: null });
  const captainView = await getWolfAmnestyView.run(request({ sessionId: 's1' }, 'dione-captain'));
  expect(captainView).toMatchObject({ offer: { targetShipId: 'dione' } });
  expect(captainView).not.toHaveProperty('commanderAddressPublished');
  await expect(getWolfAmnestyView.run(request({ sessionId: 's1' }, 'commander')))
    .resolves.toMatchObject({
      commanderAddressPublished: true,
      offer: { targetShipId: 'dione', targetUid: 'dione-captain' },
    });
  await expect(getWolfAmnestyView.run(request({ sessionId: 's1' }, 'gm')))
    .resolves.toMatchObject({ offer: { targetShipId: 'dione' } });
});
