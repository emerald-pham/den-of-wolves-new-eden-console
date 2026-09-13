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

import { declareWolfAttack } from './index';
import { initialFighterWingCounts } from './fighterWings';

const firstTurnCards = [
  ...Array<string>(10).fill('wolf-fighter-wing'),
  ...Array<string>(5).fill('wolf-assault-transport'),
];
const baseData = {
  sessionId: 's1',
  instanceId: 'gm-1',
  requestId: 'wolf-declare-1',
  expectedRevision: 1,
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
    configurationLocked: true,
    currentTurn: 1,
    activeVesselIds: ['aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124'],
    activeRoleIds: ['admiral', 'wing-commander', 'dione-engineer', 'icebreaker-miner', 'quellon-explorer', 'shepherd-scientist', 'refinery-124-engineer'],
    fighterWingCounts: initialFighterWingCounts(),
    turnPhase: {
      turn: 1,
      teamPhaseEndsAt: new Date(Date.now() - 2_000).toISOString(),
      openAirspaceEndsAt: new Date(Date.now() + 60_000).toISOString(),
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
    },
    ...fields,
  });
}

function gm(uid = 'u1', instanceId = 'gm-1', fields: Fields = {}): void {
  put(`sessions/s1/players/${uid}`, { uid, role: 'gm', connected: true, ...fields });
  put(`sessions/s1/gmInstances/${instanceId}`, { uid, connected: true, lastSeenAt: new Date(), ...fields });
}

function preparation(fields: Fields = {}): void {
  put('sessions/s1/wolfAttackPreparation/current', {
    turn: 1,
    revision: 1,
    shipIds: firstTurnCards,
    targetMode: 'pre-rolled',
    targetAssignments: [{ cardIndex: 0, targetShipId: 'aegis' }],
    modifiers: ['aegis-command-and-control'],
    notes: 'hidden GM note',
    ...fields,
  });
}

function dueWindow(fields: Fields = {}): void {
  put('sessions/s1/wolfAttackWindow/current', { status: 'due', turn: 1, revision: 1, ...fields });
}

beforeEach(() => {
  mock.documents.clear();
  mock.get.mockClear();
  mock.update.mockClear();
  mock.set.mockClear();
  cryptoMock.randomInt.mockImplementation(() => 0);
  session();
  gm();
  preparation();
  dueWindow();
});

it('atomically locks airspace, snapshots parked craft, records a hidden stage receipt, and emits one safe announcement', async () => {
  const result = await declareWolfAttack.run(request());
  expect(result).toEqual(expect.objectContaining({
    status: 'committed', type: 'wolf-attack-declaration', turn: 1,
    currentStep: 'targeting', airspaceLocked: true, parkedCraftCount: expect.any(Number),
  }));
  expect(mock.documents.get('sessions/s1').turnPhase).toMatchObject({ airspace: { state: 'restricted' } });
  expect(mock.documents.get('sessions/s1/wolfAttackWindow/current')).toMatchObject({
    status: 'resolved', turn: 1, revision: 2,
  });
  const state = mock.documents.get('sessions/s1/wolfAttackState/current');
  expect(state).toMatchObject({
    type: 'wolf-attack-state', status: 'declared', currentStep: 'targeting',
    preparationRevision: 1, airspaceLocked: true,
    preparation: { notes: 'hidden GM note' },
    calculationReceipt: { type: 'wolf-combat-calculation-stage', step: 'targeting' },
  });
  const event = mock.documents.get('sessions/s1/events/wolf-attack-wolf-declare-1');
  expect(event).toMatchObject({
    type: 'wolf-attack-declared', status: 'declared', currentStep: 'targeting', airspace: 'locked',
  });
  expect(event).not.toHaveProperty('shipIds');
  expect(event).not.toHaveProperty('targetAssignments');
  expect(event).not.toHaveProperty('notes');
  expect(event).not.toHaveProperty('targeting');
  expect(event).not.toHaveProperty('calculationReceipt');
  expect(event).not.toHaveProperty('damage');
  expect(event).not.toHaveProperty('casualties');
  expect([...mock.documents.keys()].filter((path) => path.includes('/events/'))).toEqual([
    'sessions/s1/events/wolf-attack-wolf-declare-1',
  ]);
});

it('replays an exact request without a second transaction write', async () => {
  const first = await declareWolfAttack.run(request());
  const generatedSamples = cryptoMock.randomInt.mock.calls.length;
  mock.update.mockClear();
  mock.set.mockClear();
  await expect(declareWolfAttack.run(request())).resolves.toEqual(first);
  expect(cryptoMock.randomInt).toHaveBeenCalledTimes(generatedSamples);
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('rejects stale preparation, wrong actor, client outcomes, and malformed phase without writes', async () => {
  await expect(declareWolfAttack.run(request({ ...baseData, expectedRevision: 2, requestId: 'stale' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.has('sessions/s1/wolfAttackState/current')).toBe(false);

  await expect(declareWolfAttack.run(request({ ...baseData, requestId: 'outcome', dice: [6], damage: 42 })))
    .rejects.toMatchObject({ code: 'invalid-argument' });
  put('sessions/s1/players/u1', { uid: 'u1', role: 'player', connected: true });
  await expect(declareWolfAttack.run(request({ ...baseData, requestId: 'player' })))
    .rejects.toMatchObject({ code: 'permission-denied' });
  gm();
  session({ activeVesselIds: undefined });
  await expect(declareWolfAttack.run(request({ ...baseData, requestId: 'missing-fleet' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.has('sessions/s1/wolfAttackState/current')).toBe(false);
});

it('rejects an incomplete parking snapshot without locking airspace or announcing an attack', async () => {
  session({
    shuttleDockings: [{ shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'SESSION START' }],
  });

  await expect(declareWolfAttack.run(request({ ...baseData, requestId: 'unparked' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.has('sessions/s1/wolfAttackState/current')).toBe(false);
  expect(mock.documents.has('sessions/s1/events/wolf-attack-unparked')).toBe(false);
  expect(mock.documents.has('sessions/s1/commandReceipts/unparked')).toBe(false);
  expect(mock.documents.get('sessions/s1').turnPhase).toMatchObject({
    airspace: { state: 'lifted' },
  });
});

it('rejects a departed shuttle visit as in transit even when the docking projection is present', async () => {
  session({
    shuttleVisitLog: [{ shuttleId: 'starlight', action: 'departed', occurredAt: 'TURN 1' }],
  });

  await expect(declareWolfAttack.run(request({ ...baseData, requestId: 'in-transit' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.has('sessions/s1/wolfAttackState/current')).toBe(false);
  expect(mock.documents.has('sessions/s1/events/wolf-attack-in-transit')).toBe(false);
  expect(mock.documents.has('sessions/s1/commandReceipts/in-transit')).toBe(false);
});

it('uses the configured expansion target ring when full Capybara is active', async () => {
  session({ activeVesselIds: ['aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124', 'capybara'] });
  const result = await declareWolfAttack.run(request({ ...baseData, requestId: 'capybara' }));

  expect(result).toEqual(expect.objectContaining({ status: 'committed', requestId: 'capybara' }));
  expect(mock.documents.get('sessions/s1/wolfAttackState/current')).toMatchObject({
    calculationReceipt: { targeting: { ring: ['aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124', 'capybara'] } },
  });
});

it('records declaration-time base mapping, expansion rerolls, and excludes the small Capybara', async () => {
  const baseSamples = [0, 1, 2, 3, 4, 5, ...Array<number>(9).fill(0)];
  cryptoMock.randomInt.mockImplementation((upperBound: number) => {
    const sample = baseSamples.shift() ?? 0;
    if (sample >= upperBound) throw new Error(`sample ${sample} is outside ${upperBound}`);
    return sample;
  });
  await declareWolfAttack.run(request({ ...baseData, requestId: 'base-mapping' }));
  const baseReceipt = mock.documents.get('sessions/s1/wolfAttackState/current')?.calculationReceipt as {
    targeting: { ring: string[]; rolls: Array<{ target: string; initialDie: number }> };
  };
  expect(baseReceipt.targeting.ring).toEqual([
    'aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124',
  ]);
  expect(baseReceipt.targeting.rolls.slice(0, 6).map((roll) => roll.target)).toEqual(baseReceipt.targeting.ring);
  expect(baseReceipt.targeting.rolls.slice(0, 6).map((roll) => roll.initialDie)).toEqual([1, 2, 3, 4, 5, 6]);

  mock.documents.delete('sessions/s1/wolfAttackState/current');
  mock.documents.delete('sessions/s1/wolfAttackState/current/audit/base-mapping');
  mock.documents.delete('sessions/s1/events/wolf-attack-base-mapping');
  mock.documents.delete('sessions/s1/commandReceipts/base-mapping');
  session({ activeVesselIds: ['aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124', 'capybara'] });
  preparation();
  dueWindow();
  const expansionSamples = [6, 7, 0, ...Array<number>(12).fill(0)];
  cryptoMock.randomInt.mockImplementation((upperBound: number) => {
    const sample = expansionSamples.shift() ?? 0;
    if (sample >= upperBound) throw new Error(`sample ${sample} is outside ${upperBound}`);
    return sample;
  });
  await declareWolfAttack.run(request({ ...baseData, requestId: 'expansion-reroll' }));
  const expansionReceipt = mock.documents.get('sessions/s1/wolfAttackState/current')?.calculationReceipt as {
    targeting: { ring: string[]; rolls: Array<{ target: string; initialDie: number; printedRerolls?: number[] }> };
  };
  expect(expansionReceipt.targeting.ring).toEqual([
    'aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124', 'capybara',
  ]);
  expect(expansionReceipt.targeting.rolls[0]).toMatchObject({ initialDie: 7, target: 'capybara' });
  expect(expansionReceipt.targeting.rolls[1]).toMatchObject({ initialDie: 1, target: 'aegis', printedRerolls: [8] });

  mock.documents.delete('sessions/s1/wolfAttackState/current');
  mock.documents.delete('sessions/s1/wolfAttackState/current/audit/expansion-reroll');
  mock.documents.delete('sessions/s1/events/wolf-attack-expansion-reroll');
  mock.documents.delete('sessions/s1/commandReceipts/expansion-reroll');
  session({ activeVesselIds: ['aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124', 'capybara-small'] });
  preparation();
  dueWindow();
  await expect(declareWolfAttack.run(request({ ...baseData, requestId: 'small-capybara' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.has('sessions/s1/wolfAttackState/current')).toBe(false);
});

it('rejects a legacy request-id collision before an exact-replay shortcut', async () => {
  put('sessions/s1/events/wolf-legacy-collision', { legacy: true });
  await expect(declareWolfAttack.run(request({
    ...baseData, requestId: 'wolf-legacy-collision',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.has('sessions/s1/wolfAttackState/current')).toBe(false);
  expect(mock.documents.has('sessions/s1/commandReceipts/wolf-legacy-collision')).toBe(false);
});
