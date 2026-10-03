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
    .filter((candidate) => candidate.startsWith(`${path}/`) && !candidate.slice(path.length + 1).includes('/'))
    .map(snapshot) });
  const get = vi.fn(async (target: { path: string }) =>
    target.path.endsWith('/players') || target.path.endsWith('/fleetGroups')
      ? querySnapshot(target.path) : snapshot(target.path));
  const set = vi.fn((target: { path: string }, fields: Fields) => documents.set(target.path, { ...fields }));
  const update = vi.fn((target: { path: string }, fields: Fields) => {
    const value = { ...(documents.get(target.path) ?? {}) };
    for (const [path, field] of Object.entries(fields)) {
      const parts = path.split('.');
      let cursor = value;
      for (const part of parts.slice(0, -1)) {
        const nested = cursor[part];
        cursor[part] = { ...(nested && typeof nested === 'object' && !Array.isArray(nested) ? nested : {}) };
        cursor = cursor[part] as Fields;
      }
      cursor[parts.at(-1)!] = field;
    }
    documents.set(target.path, value);
  });
  const ref = (path: string) => ({ path, id: path.split('/').at(-1) ?? '', get: async () => snapshot(path) });
  const collection = (path: string) => ({ path, get: async () => querySnapshot(path) });
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback({ get, set, update, delete: vi.fn() }));
  return { documents, get, set, update, runTransaction, db: { doc: ref, collection, runTransaction } };
});
const entropy = vi.hoisted(() => ({ randomInt: vi.fn() }));
vi.mock('node:crypto', async (importOriginal) => ({ ...await importOriginal(), ...entropy }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => testState.db,
  FieldValue: { serverTimestamp: () => 'server-time' }, Timestamp: { now: () => ({ toMillis: () => Date.now() }) } }));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error { constructor(readonly code: string, message: string) { super(message); } },
  onCall: (handler: (request: unknown) => unknown) => ({ run: handler }),
}));
vi.mock('firebase-functions/v2/firestore', () => ({ onDocumentWritten: (_path: string, handler: (event: unknown) => unknown) => ({ run: handler }) }));
vi.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: (_schedule: string, handler: (event: unknown) => unknown) => ({ run: handler }) }));

import { commitWolfBoardingSpecialChoice, getWolfBoardingSpecialChoice } from './index';

const targeting = resolveWolfTargeting(firstTurnWolfAttackComposition(), {}, undefined, () => 0);
function request(data: Record<string, unknown>, uid = 'commander-1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}
function put(path: string, fields: Fields) { testState.documents.set(path, { ...fields }); }

beforeEach(() => {
  testState.documents.clear();
  testState.get.mockClear(); testState.set.mockClear(); testState.update.mockClear(); testState.runTransaction.mockClear();
  entropy.randomInt.mockReset().mockReturnValue(5);
  put('sessions/s1', {
    phase: 'active', currentTurn: 1, activeVesselIds: ['aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124'],
    activeRoleIds: ['executive-officer'],
    turnPhase: { turn: 1, teamPhaseEndsAt: '2026-10-03T12:10:00.000Z', openAirspaceEndsAt: '2026-10-03T12:20:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false } },
    shipResources: { aegis: { securityTeams: 4 } }, shipDamage: { aegis: { damagedSystemIds: [], destroyed: false } },
    shuttleFuelled: { pallas: true },
  });
  put('sessions/s1/players/xo-1', { uid: 'xo-1', role: 'player', connected: true,
    assignedRoleId: 'executive-officer', activeConsoleRoleId: 'executive-officer', fleetGroupId: 'fleet-1' });
  put('sessions/s1/players/commander-1', { uid: 'commander-1', role: 'player', connected: true,
    replacementRoleId: 'wolf-commander', replacementStatus: null });
  put('sessions/s1/fleetGroups/fleet-1', { id: 'fleet-1', vesselIds: ['aegis'],
    memberUids: ['xo-1'], memberShipIds: { 'xo-1': 'aegis' } });
  const roster = wolfCombatRoster(targeting);
  const targets = ['aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124'];
  const emptyRange = (range: string, snapshot = roster) => ({ range,
    targetSnapshot: snapshot.map(({ instanceId, target }) => ({ instanceId, target })),
    targetShifts: [], dice: [], assignments: [], unusedHitsByAction: [],
    damageByInstance: {}, destroyedInstanceIds: [], destructionDamageByTarget: Object.fromEntries(targets.map((id) => [id, 0])) });
  put('sessions/s1/wolfAttackState/current', {
    type: 'wolf-attack-state', status: 'declared', currentStep: 'boarding', airspaceLocked: true,
    turn: 1, revision: 10, attackId: 'wolf-attack-test-1', deadlineAt: '2026-10-03T12:20:00.000Z',
    calculationReceipt: { type: 'wolf-combat-calculation-stage', version: 1, turn: 1, step: 'targeting', targeting },
    combatRoster: roster, rangeReceipts: [emptyRange('long-range'), emptyRange('medium-range'), emptyRange('short-range')],
    boardingDefenceChoices: {}, privateNotes: 'never return this field',
  });
});

it('offers and commits the Commander choice only to the assigned Commander with revision-bound replay', async () => {
  const view = await getWolfBoardingSpecialChoice.run(request({ sessionId: 's1' }));
  expect(view).toMatchObject({ type: 'wolf-boarding-special-choice-view', turn: 1, revision: 10,
    choice: { kind: 'commander', targets: [{ targetShipId: 'aegis', boardingParties: 20 }] } });
  expect(view).not.toHaveProperty('privateNotes');
  await expect(getWolfBoardingSpecialChoice.run(request({ sessionId: 's1' }, 'xo-1')))
    .resolves.toMatchObject({ type: 'wolf-boarding-special-choice-unavailable' });

  const payload = { sessionId: 's1', requestId: 'commander-board-1', expectedTurn: 1, expectedRevision: 10,
    choice: { kind: 'commander', targetShipId: 'aegis' } };
  const committed = await commitWolfBoardingSpecialChoice.run(request(payload));
  expect(committed).toMatchObject({ status: 'committed', type: 'wolf-boarding-special-choice', revision: 11 });
  expect(testState.documents.get('sessions/s1/wolfAttackState/current'))
    .toMatchObject({ boardingCommanderChoice: { targetShipId: 'aegis', actorUid: 'commander-1' } });
  expect(await commitWolfBoardingSpecialChoice.run(request(payload))).toEqual(committed);
  await expect(commitWolfBoardingSpecialChoice.run(request({ ...payload, requestId: 'not-commander' }, 'xo-1')))
    .rejects.toMatchObject({ code: 'permission-denied' });
});

it('uses the committed Medium target shift for current boarding target choices', async () => {
  const statePath = 'sessions/s1/wolfAttackState/current';
  const state = testState.documents.get(statePath)!;
  const roster = state.combatRoster as ReturnType<typeof wolfCombatRoster>;
  const beforeMedium = roster.map(({ instanceId, target }) => ({ instanceId, target }));
  const medium = {
    range: 'medium-range',
    targetSnapshot: beforeMedium,
    targetShifts: [{ sourceId: 'maliades' as const, choiceIndex: 0, rosterIndex: 10,
      shift: 1 as const, fromDie: 1, toDie: 2 }],
  };
  const shiftedRoster = roster.map((ship, index) => index === 10 ? { ...ship, target: 'dione' as const } : ship);
  const afterMedium = shiftedRoster.map(({ instanceId, target }) => ({ instanceId, target }));
  const short = { range: 'short-range', targetSnapshot: afterMedium, targetShifts: [] };
  testState.documents.set(statePath, {
    ...state, combatRoster: shiftedRoster,
    rangeReceipts: [
      { range: 'long-range', targetSnapshot: beforeMedium, targetShifts: [] },
      medium, short,
    ],
  });

  const view = await getWolfBoardingSpecialChoice.run(request({ sessionId: 's1' }));

  expect(view).toMatchObject({ choice: { kind: 'commander', targets: [
    { targetShipId: 'aegis', boardingParties: 16 },
    { targetShipId: 'dione', boardingParties: 4 },
  ] } });
});
