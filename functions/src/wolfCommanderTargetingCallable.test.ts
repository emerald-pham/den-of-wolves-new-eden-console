import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const cryptoMock = vi.hoisted(() => ({ randomInt: vi.fn() }));
vi.mock('node:crypto', () => cryptoMock);

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
  const ref = (path: string) => ({
    path,
    id: path.split('/').at(-1) ?? '',
    get: async () => snapshot(path),
  });
  const get = vi.fn(async (target: { path: string }) => snapshot(target.path));
  const update = vi.fn((target: { path: string }, fields: Fields) => {
    documents.set(target.path, { ...(documents.get(target.path) ?? {}), ...fields });
  });
  const set = vi.fn((target: { path: string }, fields: Fields) => {
    documents.set(target.path, { ...fields });
  });
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback({ get, update, set }));
  return { documents, get, update, set, runTransaction, db: { doc: ref, runTransaction } };
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
  applyWolfCommanderTargetRerolls,
  declareWolfAttack,
  getWolfCommanderTargeting,
} from './index';
import { initialFighterWingCounts } from './fighterWings';

const firstTurnCards = [
  ...Array<string>(10).fill('wolf-fighter-wing'),
  ...Array<string>(5).fill('wolf-assault-transport'),
];
const declarationData = {
  sessionId: 's1', instanceId: 'gm-1', requestId: 'wolf-declare-1', expectedRevision: 1,
};

function request(data: Record<string, unknown>, uid: string) {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

function put(path: string, fields: Fields): void {
  mock.documents.set(path, { ...fields });
}

function session(fields: Fields = {}): void {
  put('sessions/s1', {
    phase: 'active', configurationLocked: true, currentTurn: 1,
    activeVesselIds: ['aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124'],
    activeRoleIds: ['admiral', 'wing-commander', 'dione-engineer', 'icebreaker-miner', 'quellon-explorer', 'shepherd-scientist', 'refinery-124-engineer'],
    fighterWingCounts: initialFighterWingCounts(),
    turnPhase: {
      turn: 1, teamPhaseEndsAt: new Date(Date.now() - 2_000).toISOString(),
      openAirspaceEndsAt: new Date(Date.now() + 60_000).toISOString(),
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
    },
    ...fields,
  });
}

function gm(): void {
  put('sessions/s1/players/gm-1', { uid: 'gm-1', role: 'gm', connected: true });
  put('sessions/s1/gmInstances/gm-1', { uid: 'gm-1', connected: true, lastSeenAt: new Date() });
}

function preparation(): void {
  put('sessions/s1/wolfAttackPreparation/current', {
    turn: 1, revision: 1, shipIds: firstTurnCards, targetMode: 'pre-rolled',
    targetAssignments: [{ cardIndex: 0, targetShipId: 'aegis' }],
    modifiers: ['wolf-commander-target-reroll'], notes: 'hidden GM note',
  });
}

function dueWindow(): void {
  put('sessions/s1/wolfAttackWindow/current', { status: 'due', turn: 1, revision: 1 });
}

async function declare(): Promise<void> {
  await declareWolfAttack.run(request(declarationData, 'gm-1'));
  put('sessions/s1/players/wolf-1', {
    uid: 'wolf-1', role: 'player', connected: true, replacementRoleId: 'wolf-commander',
  });
}

beforeEach(() => {
  mock.documents.clear();
  mock.get.mockClear();
  mock.update.mockClear();
  mock.set.mockClear();
  cryptoMock.randomInt.mockImplementation(() => 0);
  session(); gm(); preparation(); dueWindow();
});

it('reads a filtered current-dice view and patches only selected receipt rolls', async () => {
  await declare();
  const declarationSamples = cryptoMock.randomInt.mock.calls.length;
  cryptoMock.randomInt.mockImplementationOnce(() => 1).mockImplementationOnce(() => 2);

  const first = await applyWolfCommanderTargetRerolls.run(request({
    sessionId: 's1', requestId: 'wolf-reroll-1', expectedTurn: 1, expectedRevision: 1,
    rosterIndexes: [2, 0],
  }, 'wolf-1'));
  expect(first).toMatchObject({ status: 'committed', revision: 2, rerolledIndexes: [0, 2] });
  const state = mock.documents.get('sessions/s1/wolfAttackState/current')!;
  expect(state.commanderRerollIndexes).toEqual([0, 2]);
  expect((state.calculationReceipt as Fields).targeting).toMatchObject({
    rolls: expect.arrayContaining([
      expect.objectContaining({ rosterIndex: 0, initialDie: 1, rerollDie: 2, target: 'dione' }),
      expect.objectContaining({ rosterIndex: 1, initialDie: 1, finalDie: 1 }),
      expect.objectContaining({ rosterIndex: 2, initialDie: 1, rerollDie: 3, target: 'icebreaker' }),
    ]),
  });
  expect(cryptoMock.randomInt).toHaveBeenCalledTimes(declarationSamples + 2);

  const view = await getWolfCommanderTargeting.run(request({ sessionId: 's1' }, 'wolf-1'));
  expect(view).toMatchObject({ type: 'wolf-commander-targeting-view', revision: 2 });
  expect(view).not.toHaveProperty('calculationReceipt');
  expect(view).toMatchObject({ eligibleRerollIndexes: expect.not.arrayContaining([0, 2]) });
});

it('replays exactly without another random sample and rejects stale or consumed selections', async () => {
  await declare();
  cryptoMock.randomInt.mockImplementationOnce(() => 1);
  const payload = {
    sessionId: 's1', requestId: 'wolf-reroll-replay', expectedTurn: 1, expectedRevision: 1,
    rosterIndexes: [0],
  };
  const first = await applyWolfCommanderTargetRerolls.run(request(payload, 'wolf-1'));
  const samples = cryptoMock.randomInt.mock.calls.length;
  await expect(applyWolfCommanderTargetRerolls.run(request(payload, 'wolf-1'))).resolves.toEqual(first);
  expect(cryptoMock.randomInt).toHaveBeenCalledTimes(samples);

  await expect(applyWolfCommanderTargetRerolls.run(request({
    ...payload, requestId: 'wolf-reroll-stale', expectedRevision: 1, rosterIndexes: [1],
  }, 'wolf-1'))).rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(applyWolfCommanderTargetRerolls.run(request({
    ...payload, requestId: 'wolf-reroll-consumed', expectedRevision: 2, rosterIndexes: [0],
  }, 'wolf-1'))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(cryptoMock.randomInt).toHaveBeenCalledTimes(samples);
});

it('denies the GM and historical role, and never exposes the view to another player', async () => {
  await declare();
  put('sessions/s1/players/old-role', {
    uid: 'old-role', role: 'player', connected: true, assignedRoleId: 'wolf-commander',
  });
  put('sessions/s1/players/other', { uid: 'other', role: 'player', connected: true });
  await expect(getWolfCommanderTargeting.run(request({ sessionId: 's1' }, 'gm-1')))
    .rejects.toMatchObject({ code: 'permission-denied' });
  await expect(getWolfCommanderTargeting.run(request({ sessionId: 's1' }, 'old-role')))
    .rejects.toMatchObject({ code: 'permission-denied' });
  await expect(applyWolfCommanderTargetRerolls.run(request({
    sessionId: 's1', requestId: 'wrong-actor', expectedTurn: 1, expectedRevision: 1, rosterIndexes: [0],
  }, 'other'))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.documents.get('sessions/s1/wolfAttackState/current')?.commanderRerollIndexes).toEqual([]);
});

it('keeps the targeting action closed after the targeting stage', async () => {
  await declare();
  mock.documents.set('sessions/s1/wolfAttackState/current', {
    ...mock.documents.get('sessions/s1/wolfAttackState/current'), currentStep: 'long-range',
  });
  await expect(applyWolfCommanderTargetRerolls.run(request({
    sessionId: 's1', requestId: 'after-targeting', expectedTurn: 1, expectedRevision: 1, rosterIndexes: [0],
  }, 'wolf-1'))).rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(getWolfCommanderTargeting.run(request({ sessionId: 's1' }, 'wolf-1')))
    .resolves.toMatchObject({ type: 'wolf-commander-targeting-unavailable', reason: 'not-targeting' });
});
