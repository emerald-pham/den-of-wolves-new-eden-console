import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { firstTurnWolfAttackComposition } from './wolfAttackComposition';
import { resolveWolfTargeting, wolfCombatRoster } from './wolfCombatMath';

type Fields = Record<string, unknown>;

const testState = vi.hoisted(() => {
  const documents = new Map<string, Fields>();
  const snapshot = (path: string) => {
    const value = documents.get(path);
    return { exists: value !== undefined, id: path.split('/').at(-1) ?? '', ref: { path },
      get: (field: string) => value?.[field], data: () => value };
  };
  const querySnapshot = (path: string) => ({ docs: [...documents.keys()]
    .filter((candidate) => candidate.startsWith(`${path}/`) &&
      !candidate.slice(path.length + 1).includes('/')).map(snapshot) });
  const get = vi.fn(async (target: { path: string }) => target.path.endsWith('/players')
    ? querySnapshot(target.path) : snapshot(target.path));
  const set = vi.fn((target: { path: string }, fields: Fields) => documents.set(target.path, { ...fields }));
  const update = vi.fn((target: { path: string }, fields: Fields) => documents.set(target.path,
    { ...(documents.get(target.path) ?? {}), ...fields }));
  const remove = vi.fn((target: { path: string }) => documents.delete(target.path));
  const ref = (path: string) => ({ path, id: path.split('/').at(-1) ?? '', get: async () => snapshot(path) });
  const collection = (path: string) => ({ path, get: async () => querySnapshot(path) });
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback({ get, set, update, delete: remove }));
  return { documents, get, set, update, remove, runTransaction, db: { doc: ref, collection, runTransaction } };
});

const entropy = vi.hoisted(() => ({ randomInt: vi.fn() }));
vi.mock('node:crypto', async (importOriginal) => ({ ...await importOriginal(), ...entropy }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => testState.db,
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error { constructor(readonly code: string, message: string) { super(message); } },
  onCall: (handler: (request: unknown) => unknown) => ({ run: handler }),
}));
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: (_path: string, handler: (event: unknown) => unknown) => ({ run: handler }),
}));
vi.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: (_schedule: string, handler: (event: unknown) => unknown) => ({ run: handler }) }));

import {
  assignWolfRangeTargets,
  commitWolfRangeActionChoice,
  getWolfRangeActionChoice,
} from './index';

const targeting = resolveWolfTargeting(firstTurnWolfAttackComposition(), {}, undefined, () => 0);

function request(data: Record<string, unknown>, uid = 'xo-1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

function put(path: string, fields: Fields): void { testState.documents.set(path, { ...fields }); }

function resetFixture(): void {
  testState.documents.clear();
  testState.get.mockClear();
  testState.set.mockClear();
  testState.update.mockClear();
  testState.remove.mockClear();
  testState.runTransaction.mockClear();
  entropy.randomInt.mockReset().mockImplementation(() => 5);
  const roster = wolfCombatRoster(targeting);
  put('sessions/s1', {
    phase: 'active', currentTurn: 1, activeVesselIds: ['aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124'],
    activeRoleIds: ['executive-officer'],
    turnPhase: { turn: 1, teamPhaseEndsAt: '2026-10-02T12:00:00.000Z', openAirspaceEndsAt: '2026-10-02T12:10:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false } },
    maintenanceCycles: { aegis: { turn: 1, step: 7, revision: 2, results: { '5': 'Reactor powered up.' },
      charges: ['missile-launchers', 'point-defence-lasers'], refuelled: [] } },
    shipDamage: { aegis: { damagedSystemIds: [], destroyed: false } },
    shipUpgrades: { aegis: ['missile-launchers'] },
  });
  put('sessions/s1/players/xo-1', { uid: 'xo-1', role: 'player', connected: true,
    assignedRoleId: 'executive-officer', activeConsoleRoleId: 'executive-officer' });
  put('sessions/s1/wolfAttackState/current', {
    type: 'wolf-attack-state', status: 'declared', currentStep: 'long-range', airspaceLocked: true,
    turn: 1, revision: 4, attackId: 'wolf-attack-test-1', deadlineAt: '2026-10-02T12:10:00.000Z',
    calculationReceipt: { type: 'wolf-combat-calculation-stage', version: 1, turn: 1, step: 'targeting', targeting },
    combatRoster: roster,
    privateNotes: 'never returned to AEGIS',
  });
}

beforeEach(resetFixture);

it('returns only current source-derived actions and opaque target contacts to the entitled Executive Officer', async () => {
  const view = await getWolfRangeActionChoice.run(request({ sessionId: 's1' }));
  expect(view).toMatchObject({
    type: 'wolf-range-action-choice-view', sessionId: 's1', turn: 1, revision: 4,
    range: 'long-range', currentStep: 'long-range', choiceStatus: 'pending',
    eligibleActions: [{ actionId: 'aegis-missile-launchers-long', sourceId: 'aegis-missile-launchers', range: 'long-range' }],
  });
  expect(view).not.toHaveProperty('privateNotes');
  expect(view).not.toHaveProperty('targeting');
  expect(view).not.toHaveProperty('combatRoster');
  await expect(getWolfRangeActionChoice.run(request({ sessionId: 's1' }, 'other')))
    .rejects.toMatchObject({ code: 'permission-denied' });
});

it('locks one server-generated Long Range attack once and assigns it without rerolling', async () => {
  const choice = await commitWolfRangeActionChoice.run(request({
    sessionId: 's1', requestId: 'lock-long-1', expectedTurn: 1, expectedRevision: 4,
    range: 'long-range', actionIds: ['aegis-missile-launchers-long'],
  }));
  expect(choice).toMatchObject({ status: 'committed', choiceStatus: 'targets-required', hitSlots: [{ actionId: 'aegis-missile-launchers-long', count: 1 }] });
  expect(choice).not.toHaveProperty('rolls');
  expect(entropy.randomInt).not.toHaveBeenCalled();

  const state = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  expect(state.rangeDecisions).toMatchObject({
    'long-range': { status: 'locked', actionIds: ['aegis-missile-launchers-long'], lock: { range: 'long-range' } },
  });
  const contacts = state.combatRoster as Array<{ instanceId: string }>;
  const lockedRevision = state.revision as number;
  const applied = await assignWolfRangeTargets.run(request({
    sessionId: 's1', requestId: 'target-long-1', expectedTurn: 1, expectedRevision: lockedRevision,
    range: 'long-range', assignments: [{ actionId: 'aegis-missile-launchers-long', contactIds: [contacts[0]!.instanceId] }],
  }));
  expect(applied).toMatchObject({ status: 'committed', type: 'wolf-range-target-assignment', currentStep: 'medium-range' });
  expect(entropy.randomInt).not.toHaveBeenCalled();
  const after = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  expect(after.rangeReceipts).toEqual(expect.arrayContaining([expect.objectContaining({ range: 'long-range' })]));
  expect(after.revision).toBe(lockedRevision + 1);
  expect(testState.documents.get('sessions/s1/wolfAttackState/current/audit/target-long-1'))
    .toMatchObject({ type: 'wolf-range-target-assignment', fromStep: 'long-range', toStep: 'medium-range' });
});

it('records an explicit pass, rejects stale/wrong-phase/wrong-actor writes, and honors pause', async () => {
  await expect(commitWolfRangeActionChoice.run(request({
    sessionId: 's1', requestId: 'stale-long', expectedTurn: 1, expectedRevision: 3,
    range: 'long-range', actionIds: [],
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(commitWolfRangeActionChoice.run(request({
    sessionId: 's1', requestId: 'wrong-range', expectedTurn: 1, expectedRevision: 4,
    range: 'medium-range', actionIds: [],
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(commitWolfRangeActionChoice.run(request({
    sessionId: 's1', requestId: 'wrong-user', expectedTurn: 1, expectedRevision: 4,
    range: 'long-range', actionIds: [],
  }, 'other'))).rejects.toMatchObject({ code: 'permission-denied' });

  const session = testState.documents.get('sessions/s1')!;
  put('sessions/s1', { ...session, turnPhase: { ...session.turnPhase as Fields,
    timerPause: { reason: 'turn-interstitial', pausedAt: '2026-10-02T12:00:00.000Z', remainingMs: 5000 } } });
  await expect(commitWolfRangeActionChoice.run(request({
    sessionId: 's1', requestId: 'paused-long', expectedTurn: 1, expectedRevision: 4,
    range: 'long-range', actionIds: [],
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(testState.documents.has('sessions/s1/commandReceipts/paused-long')).toBe(false);
});
