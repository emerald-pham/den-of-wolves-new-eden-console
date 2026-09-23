import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { firstTurnWolfAttackComposition } from './wolfAttackComposition';
import { CORE_WOLF_TARGET_RING, resolveWolfTargeting } from './wolfCombatMath';

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
  const querySnapshot = (path: string) => ({
    docs: [...documents.keys()]
      .filter((candidate) => candidate.startsWith(`${path}/`) &&
        !candidate.slice(path.length + 1).includes('/'))
      .map((candidate) => snapshot(candidate)),
  });
  const ref = (path: string) => ({
    path,
    id: path.split('/').at(-1) ?? '',
    get: async () => snapshot(path),
  });
  const collection = (path: string) => ({ path, get: async () => querySnapshot(path) });
  const get = vi.fn(async (target: { path: string }) =>
    target.path.endsWith('/players') ? querySnapshot(target.path) : snapshot(target.path));
  const update = vi.fn((target: { path: string }, fields: Fields) => {
    documents.set(target.path, { ...(documents.get(target.path) ?? {}), ...fields });
  });
  const set = vi.fn((target: { path: string }, fields: Fields) => {
    documents.set(target.path, { ...fields });
  });
  const remove = vi.fn((target: { path: string }) => documents.delete(target.path));
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback({ get, update, set, delete: remove }));
  return { documents, get, update, set, remove, runTransaction, db: { doc: ref, collection, runTransaction } };
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
  applyAegisCommandAndControl,
  applyWolfCommanderTargetRerolls,
  finishWolfCommanderTargetingRerolls,
  getAegisCommandAndControl,
  launchDioneMaliades,
} from './index';

const firstTurnCards = [
  ...Array<string>(10).fill('wolf-fighter-wing'),
  ...Array<string>(5).fill('wolf-assault-transport'),
];
const targeting = resolveWolfTargeting(
  firstTurnWolfAttackComposition(), {}, CORE_WOLF_TARGET_RING, () => 1,
);

function request(data: Record<string, unknown>, uid = 'xo-1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

function put(path: string, fields: Fields): void {
  mock.documents.set(path, { ...fields });
}

function player(uid: string, fields: Fields = {}): void {
  put(`sessions/s1/players/${uid}`, {
    uid, role: 'player', connected: true, ...fields,
  });
}

function attackState(fields: Fields = {}): void {
  put('sessions/s1/wolfAttackState/current', {
    type: 'wolf-attack-state', status: 'declared', currentStep: 'targeting', airspaceLocked: true,
    turn: 1, revision: 1, commanderRerollIndexes: [],
    preparation: {
      turn: 1, revision: 1, shipIds: firstTurnCards, targetMode: 'pre-rolled',
      targetAssignments: [], modifiers: ['aegis-command-and-control'], notes: 'private GM note',
    },
    calculationReceipt: { type: 'wolf-combat-calculation-stage', version: 1, turn: 1, step: 'targeting', targeting },
    ...fields,
  });
}

function session(fields: Fields = {}): void {
  put('sessions/s1', {
    phase: 'active', currentTurn: 1,
    activeRoleIds: ['executive-officer', 'wolf-commander'],
    activeVesselIds: ['aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124'],
    maintenanceCycles: {
      aegis: {
        turn: 1, step: 7, revision: 2, results: { '5': 'Reactor powered up.' },
        charges: ['command-and-control'], refuelled: [],
      },
    },
    shipDamage: { aegis: { damagedSystemIds: [], destroyed: false } },
    ...fields,
  });
}

function currentGame(options: { readonly commander?: boolean; readonly connected?: boolean } = {}): void {
  mock.documents.clear();
  session();
  attackState();
  player('xo-1', {
    assignedRoleId: 'executive-officer', activeConsoleRoleId: 'executive-officer',
  });
  if (options.commander !== false) {
    player('commander-1', {
      replacementRoleId: 'wolf-commander', connected: options.connected ?? true,
    });
  }
}

function makeMaliadesLaunchable(): void {
  const sessionFields = mock.documents.get('sessions/s1')!;
  const stateFields = mock.documents.get('sessions/s1/wolfAttackState/current')!;
  mock.documents.set('sessions/s1', {
    ...sessionFields,
    activeRoleIds: [...(sessionFields.activeRoleIds as string[]), 'dione-engineer'],
    turnPhase: {
      turn: 1, teamPhaseEndsAt: '2026-01-01T00:00:00.000Z',
      openAirspaceEndsAt: '2026-01-01T00:10:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
    maintenanceCycles: {
      ...(sessionFields.maintenanceCycles as Fields),
      dione: {
        turn: 1, step: 7, revision: 4,
        results: { '5': 'Reactor powered up. Charged 1/4 consoles.' },
        charges: ['fighter-bay'], refuelled: [],
      },
    },
    shipDamage: {
      ...(sessionFields.shipDamage as Fields),
      dione: { damagedSystemIds: [], destroyed: false },
    },
  });
  mock.documents.set('sessions/s1/wolfAttackState/current', {
    ...stateFields,
    battleTableCraftActions: [
      { craftId: 'maliades', kind: 'shuttle', ownerRoleId: 'dione-engineer' },
    ],
    launchedCraftIds: [],
  });
  player('dione-1', {
    assignedRoleId: 'dione-engineer', seatId: 'dione-engineer',
    activeConsoleRoleId: 'dione-engineer',
  });
}

beforeEach(() => {
  currentGame();
  mock.get.mockClear();
  mock.update.mockClear();
  mock.set.mockClear();
  mock.runTransaction.mockClear();
});

it('requires a committed Commander finish even when the assigned Commander is disconnected', async () => {
  currentGame({ connected: false });
  await expect(getAegisCommandAndControl.run(request({ sessionId: 's1' }))).resolves.toMatchObject({
    eligible: false, commanderAssigned: true, rerollsFinalized: false,
    reason: 'commander-pending', targets: [],
  });
  await expect(applyAegisCommandAndControl.run(request({
    sessionId: 's1', requestId: 'redirect-pending', expectedTurn: 1, expectedRevision: 1, rosterIndex: 0,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.get('sessions/s1/wolfAttackState/current')).toMatchObject({ revision: 1 });
  expect([...mock.documents.keys()].some((path) => path.includes('redirect-pending'))).toBe(false);
});

it('finishes an empty Commander reroll window and consumes its exact private receipt in C&C', async () => {
  const finished = await finishWolfCommanderTargetingRerolls.run(request({
    sessionId: 's1', requestId: 'finish-1', expectedTurn: 1, expectedRevision: 1,
  }, 'commander-1'));
  expect(finished).toMatchObject({
    status: 'committed', type: 'wolf-commander-targeting-finish', turn: 1, revision: 2,
    view: { rerollsFinalized: true, eligibleRerollIndexes: [] },
  });
  expect(JSON.stringify(finished)).not.toMatch(/initialDie|finalDie|rerollDie|targetingReceipt|private GM note/);
  expect(mock.documents.get('sessions/s1/wolfAttackState/current/audit/finish-1')).toMatchObject({
    type: 'wolf-commander-targeting-finish', actorUid: 'commander-1', requestId: 'finish-1',
    turn: 1, revision: 2,
  });

  const redirected = await applyAegisCommandAndControl.run(request({
    sessionId: 's1', requestId: 'redirect-1', expectedTurn: 1, expectedRevision: 2, rosterIndex: 2,
  }));
  expect(redirected).toMatchObject({
    status: 'committed', type: 'aegis-command-and-control-result',
    revision: 3, rosterIndex: 2, shipId: 'wolf-fighter-wing', commanderCompletion: 'finished',
    view: { eligible: false, reason: 'already-used', redirectedShipId: 'wolf-fighter-wing', targets: [] },
  });
  expect(JSON.stringify(redirected)).not.toMatch(/initialDie|finalDie|rerollDie|targetingReceipt|private GM note/);
  const stored = mock.documents.get('sessions/s1/wolfAttackState/current');
  expect(stored?.commanderRerollCompletion).toMatchObject({
    status: 'finished', turn: 1, actorUid: 'commander-1', requestId: 'finish-1', revision: 2,
  });
  expect(stored?.commandAndControl).toMatchObject({
    turn: 1, revision: 3, actorUid: 'xo-1', requestId: 'redirect-1', rosterIndex: 2,
    shipId: 'wolf-fighter-wing', commanderCompletion: 'finished',
  });
  const receipt = (stored?.calculationReceipt as { targeting: { rolls: { target: string; modifiers: string[] }[] } }).targeting;
  expect(receipt.rolls[2]).toMatchObject({
    target: 'aegis', modifiers: ['command-and-control-redirect'],
  });
  expect(mock.documents.get('sessions/s1/wolfAttackState/current/audit/redirect-1')).toMatchObject({
    type: 'aegis-command-and-control-redirect', actorRoleId: 'executive-officer',
    commanderCompletion: 'finished', rosterIndex: 2, shipId: 'wolf-fighter-wing',
  });
});

it('preserves a Commander finish across an unrelated Maliades revision before C&C', async () => {
  const finished = await finishWolfCommanderTargetingRerolls.run(request({
    sessionId: 's1', requestId: 'finish-before-maliades', expectedTurn: 1, expectedRevision: 1,
  }, 'commander-1'));
  expect(finished.revision).toBe(2);
  makeMaliadesLaunchable();

  await expect(launchDioneMaliades.run(request({
    sessionId: 's1', requestId: 'maliades-after-finish', expectedTurn: 1, expectedRevision: 2,
  }, 'dione-1'))).resolves.toMatchObject({ status: 'committed', revision: 3 });

  const redirected = await applyAegisCommandAndControl.run(request({
    sessionId: 's1', requestId: 'redirect-after-maliades', expectedTurn: 1,
    expectedRevision: 3, rosterIndex: 0,
  }));
  expect(redirected).toMatchObject({ revision: 4, commanderCompletion: 'finished' });
  expect(await getAegisCommandAndControl.run(request({ sessionId: 's1' }))).toMatchObject({
    revision: 4, eligible: false, rerollsFinalized: true,
    reason: 'already-used', redirectedShipId: 'wolf-fighter-wing',
  });
});

it('keeps a no-Commander redirect readable after an unrelated Maliades revision', async () => {
  currentGame({ commander: false });
  await expect(applyAegisCommandAndControl.run(request({
    sessionId: 's1', requestId: 'redirect-before-maliades', expectedTurn: 1,
    expectedRevision: 1, rosterIndex: 0,
  }))).resolves.toMatchObject({ revision: 2, commanderCompletion: 'no-commander' });
  makeMaliadesLaunchable();

  await expect(launchDioneMaliades.run(request({
    sessionId: 's1', requestId: 'maliades-after-no-commander', expectedTurn: 1, expectedRevision: 2,
  }, 'dione-1'))).resolves.toMatchObject({ status: 'committed', revision: 3 });
  await expect(getAegisCommandAndControl.run(request({ sessionId: 's1' }))).resolves.toMatchObject({
    revision: 3, eligible: false, rerollsFinalized: true,
    reason: 'already-used', redirectedShipId: 'wolf-fighter-wing',
  });
});

it('writes auditable no-Commander completion only from actual player assignments', async () => {
  currentGame({ commander: false });
  const view = await getAegisCommandAndControl.run(request({ sessionId: 's1' }));
  expect(view).toMatchObject({
    eligible: true, commanderAssigned: false, rerollsFinalized: false,
    targets: expect.arrayContaining([{ rosterIndex: 0, shipId: 'wolf-fighter-wing' }]),
  });
  expect(view.targets).toHaveLength(15);
  expect(JSON.stringify(view)).not.toMatch(/initialDie|finalDie|rerollDie|targetingReceipt|private GM note/);
  const result = await applyAegisCommandAndControl.run(request({
    sessionId: 's1', requestId: 'redirect-no-commander', expectedTurn: 1,
    expectedRevision: 1, rosterIndex: 0,
  }));
  expect(result).toMatchObject({ commanderCompletion: 'no-commander', rosterIndex: 0 });
  expect(mock.documents.get('sessions/s1/wolfAttackState/current')).toMatchObject({
    revision: 2,
    commanderRerollCompletion: {
      status: 'no-commander', turn: 1, actorUid: 'xo-1', requestId: 'redirect-no-commander', revision: 2,
    },
  });
  expect(mock.documents.get('sessions/s1/wolfAttackState/current/audit/redirect-no-commander')).toMatchObject({
    commanderCompletion: 'no-commander', actorUid: 'xo-1',
  });
});

it('does not infer an assigned Commander from the enabled-role list', async () => {
  currentGame({ commander: false });
  const enabled = mock.documents.get('sessions/s1')!;
  expect(enabled.activeRoleIds).toContain('wolf-commander');
  await expect(applyAegisCommandAndControl.run(request({
    sessionId: 's1', requestId: 'no-assignment-is-not-an-error', expectedTurn: 1,
    expectedRevision: 1, rosterIndex: 0,
  }))).resolves.toMatchObject({ commanderCompletion: 'no-commander' });
});

it('does not grant C&C read access to a player without the bound Executive Officer post', async () => {
  currentGame();
  player('intruder', { assignedRoleId: 'admiral', activeConsoleRoleId: 'executive-officer' });
  await expect(getAegisCommandAndControl.run(request({ sessionId: 's1' }, 'intruder')))
    .rejects.toMatchObject({ code: 'permission-denied' });
});

it('requires the finish request to match the current revision', async () => {
  await expect(finishWolfCommanderTargetingRerolls.run(request({
    sessionId: 's1', requestId: 'stale-finish', expectedTurn: 1, expectedRevision: 2,
  }, 'commander-1'))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.get('sessions/s1/wolfAttackState/current')).toMatchObject({ revision: 1 });
  expect([...mock.documents.keys()].some((path) => path.includes('stale-finish'))).toBe(false);
});

it('rejects rerolls after finish and rejects a stale C&C revision without mutating the receipt', async () => {
  await finishWolfCommanderTargetingRerolls.run(request({
    sessionId: 's1', requestId: 'finish-1', expectedTurn: 1, expectedRevision: 1,
  }, 'commander-1'));
  await expect(applyWolfCommanderTargetRerolls.run(request({
    sessionId: 's1', requestId: 'reroll-after-finish', expectedTurn: 1,
    expectedRevision: 2, rosterIndexes: [1],
  }, 'commander-1'))).rejects.toMatchObject({ code: 'failed-precondition' });

  await expect(applyAegisCommandAndControl.run(request({
    sessionId: 's1', requestId: 'stale-redirect', expectedTurn: 1, expectedRevision: 1, rosterIndex: 0,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.get('sessions/s1/wolfAttackState/current')).toMatchObject({ revision: 2 });
});

it('replays the same redirect exactly once and rejects a reused request id with different input', async () => {
  currentGame({ commander: false });
  const data = {
    sessionId: 's1', requestId: 'redirect-once', expectedTurn: 1, expectedRevision: 1, rosterIndex: 0,
  };
  const first = await applyAegisCommandAndControl.run(request(data));
  const replay = await applyAegisCommandAndControl.run(request(data));
  expect(replay).toEqual(first);
  expect(mock.documents.get('sessions/s1/wolfAttackState/current')).toMatchObject({ revision: 2 });
  expect(mock.documents.get('sessions/s1/wolfAttackState/current/audit/redirect-once')).toMatchObject({
    type: 'aegis-command-and-control-redirect', revision: 2,
  });

  await expect(applyAegisCommandAndControl.run(request({ ...data, rosterIndex: 1 })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.get('sessions/s1/wolfAttackState/current')).toMatchObject({ revision: 2 });
  expect((mock.documents.get('sessions/s1/wolfAttackState/current')?.calculationReceipt as {
    targeting: { rolls: { modifiers: string[] }[] };
  }).targeting.rolls.filter((roll) => roll.modifiers.includes('command-and-control-redirect'))).toHaveLength(1);
});

it('rejects a malformed replay result with receipt-only or private fields', async () => {
  currentGame({ commander: false });
  const data = {
    sessionId: 's1', requestId: 'redirect-corrupt-replay', expectedTurn: 1, expectedRevision: 1, rosterIndex: 0,
  };
  const first = await applyAegisCommandAndControl.run(request(data));
  const receiptPath = 'sessions/s1/commandReceipts/redirect-corrupt-replay';
  const receipt = mock.documents.get(receiptPath)!;
  mock.documents.set(receiptPath, {
    ...receipt,
    result: { ...(first as Fields), targetingReceipt: { rolls: [{ finalDie: 6, target: 'dione' }] } },
  });

  await expect(applyAegisCommandAndControl.run(request(data)))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.get('sessions/s1/wolfAttackState/current')).toMatchObject({ revision: 2 });
});

it('rejects a malformed Commander finish replay with extra private receipt fields', async () => {
  const data = {
    sessionId: 's1', requestId: 'finish-malformed-replay', expectedTurn: 1, expectedRevision: 1,
  };
  const first = await finishWolfCommanderTargetingRerolls.run(request(data, 'commander-1'));
  const receiptPath = 'sessions/s1/commandReceipts/finish-malformed-replay';
  const stored = mock.documents.get(receiptPath)!;
  mock.documents.set(receiptPath, {
    ...stored,
    result: {
      ...(first as Fields),
      view: {
        ...(first as Fields).view as Fields,
        rolls: [{ rosterIndex: 0, shipId: 'wolf-fighter-wing', die: 2, target: 'dione', initialDie: 5 }],
      },
    },
  });

  await expect(finishWolfCommanderTargetingRerolls.run(request(data, 'commander-1')))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.get('sessions/s1/wolfAttackState/current')).toMatchObject({ revision: 2 });
});

it('fails closed when a same-turn C&C marker has no matching private targeting receipt', async () => {
  attackState({ commandAndControl: {
    turn: 1, revision: 2, actorUid: 'xo-1', actorRoleId: 'executive-officer',
    requestId: 'missing-redirect', rosterIndex: 0, shipId: 'wolf-fighter-wing',
    commanderCompletion: 'no-commander',
  }, commanderRerollCompletion: {
    status: 'no-commander', turn: 1, revision: 2, actorUid: 'xo-1', requestId: 'missing-redirect',
  } });
  await expect(getAegisCommandAndControl.run(request({ sessionId: 's1' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
});

it.each([
  ['uncharged', { maintenanceCycles: { aegis: {
    turn: 1, step: 7, revision: 2, results: { '5': 'Reactor powered up.' }, charges: [], refuelled: [],
  } } }],
  ['damaged', { shipDamage: { aegis: { damagedSystemIds: ['command-and-control'], destroyed: false } } }],
  ['unknown damage', { shipDamage: { aegis: { damagedSystemIds: [], destroyed: 'unknown' } } }],
])('rejects C&C while AEGIS is %s', async (_label, sessionFields) => {
  currentGame({ commander: false });
  session(sessionFields);
  await expect(applyAegisCommandAndControl.run(request({
    sessionId: 's1', requestId: 'blocked-redirect', expectedTurn: 1, expectedRevision: 1, rosterIndex: 0,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.get('sessions/s1/wolfAttackState/current')).toMatchObject({ revision: 1 });
});

it('rejects a spoofed C&C outcome instead of accepting a client target or die', async () => {
  await expect(applyAegisCommandAndControl.run(request({
    sessionId: 's1', requestId: 'spoofed', expectedTurn: 1, expectedRevision: 1,
    rosterIndex: 0, target: 'aegis', die: 1,
  }))).rejects.toMatchObject({ code: 'invalid-argument' });
});
