import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { firstTurnWolfAttackComposition } from './wolfAttackComposition';
import { EXPANDED_WOLF_TARGET_RING, resolveWolfTargeting, wolfCombatRoster } from './wolfCombatMath';

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
    target.path.endsWith('/players') || target.path.endsWith('/fleetGroups') || target.path.endsWith('/gmInstances')
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
  const remove = vi.fn((target: { path: string }) => documents.delete(target.path));
  const collection = (path: string) => ({ path, get: async () => querySnapshot(path) });
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback({ get, set, update, delete: remove }));
  return { documents, get, set, update, remove, runTransaction, db: { doc: ref, collection, runTransaction } };
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

import {
  advanceWolfAttackLifecycle,
  commitWolfBoardingDefenceChoice,
  commitWolfBoardingSpecialChoice,
  getWolfBoardingSpecialChoice,
} from './index';

const targeting = resolveWolfTargeting(firstTurnWolfAttackComposition(), {}, undefined, () => 0);
function request(data: Record<string, unknown>, uid = 'commander-1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}
function put(path: string, fields: Fields) { testState.documents.set(path, { ...fields }); }

beforeEach(() => {
  testState.documents.clear();
  testState.get.mockClear(); testState.set.mockClear(); testState.update.mockClear(); testState.runTransaction.mockClear();
  testState.remove.mockClear();
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

it('removes a kicked Commander from the current boarding authority instead of leaving their choice open', async () => {
  const commander = testState.documents.get('sessions/s1/players/commander-1')!;
  put('sessions/s1/players/commander-1', { ...commander, kickedAt: '2026-10-03T12:00:00.000Z' });

  await expect(getWolfBoardingSpecialChoice.run(request({ sessionId: 's1' }, 'commander-1')))
    .resolves.toMatchObject({ type: 'wolf-boarding-special-choice-unavailable', reason: 'not-your-choice' });
});

it('auto-records zero-team defence only when no current target-crew actor remains', async () => {
  const session = testState.documents.get('sessions/s1')!;
  put('sessions/s1', { ...session, activeRoleIds: [] });
  const xo = testState.documents.get('sessions/s1/players/xo-1')!;
  put('sessions/s1/players/xo-1', { ...xo, replacementStatus: 'awaiting-re-role' });
  const state = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  put('sessions/s1/wolfAttackState/current', { ...state, boardingCommanderChoice: {
    targetShipId: null, actorUid: 'commander-1', actorRoleId: 'wolf-commander',
    requestId: 'commander-no-lead', turn: 1, revision: 9,
  } });

  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });

  expect(testState.documents.get('sessions/s1/wolfAttackState/current'))
    .toMatchObject({ revision: 11, boardingDefenceChoices: { aegis: {
      type: 'wolf-boarding-defence-choice', status: 'unavailable', reason: 'no-current-crew-actor',
      targetShipId: 'aegis', securityTeams: 0, actorUid: 'server', actorRoleId: 'server',
    } } });
  expect(testState.documents.get('sessions/s1/wolfAttackState/current/audit/wolf-no-boarding-defence-aegis-1'))
    .toMatchObject({ type: 'wolf-boarding-defence-unavailable', reason: 'no-current-crew-actor',
      targetShipId: 'aegis', securityTeams: 0 });
  expect((testState.documents.get('sessions/s1').shipResources as Fields).aegis)
    .toMatchObject({ securityTeams: 4 });
});

it('does not turn a kicked Rosal Militia Leader into a pending special actor', async () => {
  const statePath = 'sessions/s1/wolfAttackState/current';
  const state = testState.documents.get(statePath)!;
  put(statePath, { ...state, boardingCommanderChoice: {
    targetShipId: null, actorUid: 'commander-1', actorRoleId: 'wolf-commander',
    requestId: 'commander-no-lead', turn: 1, revision: 9,
  }, boardingRelocationChoices: { pallas: { target: 'aegis' } } });
  put('sessions/s1/players/militia-1', { uid: 'militia-1', role: 'player', connected: true,
    replacementRoleId: 'rosal-militia-leader', replacementStatus: null, fleetGroupId: 'fleet-1' });
  const group = testState.documents.get('sessions/s1/fleetGroups/fleet-1')!;
  put('sessions/s1/fleetGroups/fleet-1', { ...group,
    memberUids: [...(group.memberUids as string[]), 'militia-1'],
    memberShipIds: { ...(group.memberShipIds as Fields), 'militia-1': 'aegis' } });
  await commitWolfBoardingDefenceChoice.run(request({ sessionId: 's1', requestId: 'militia-target-defence',
    expectedTurn: 1, expectedRevision: 10, targetShipId: 'aegis', securityTeams: 0 }, 'xo-1'));
  const militia = testState.documents.get('sessions/s1/players/militia-1')!;
  put('sessions/s1/players/militia-1', { ...militia, kickedAt: '2026-10-03T12:00:00.000Z' });

  await expect(getWolfBoardingSpecialChoice.run(request({ sessionId: 's1' }, 'militia-1')))
    .resolves.toMatchObject({ type: 'wolf-boarding-special-choice-unavailable', reason: 'automatic-progress-pending' });
});

const sessionPath = 'sessions/s1';
const attackPath = `${sessionPath}/wolfAttackState/current`;
function fields(path: string): Fields { return testState.documents.get(path)!; }
function patch(path: string, delta: Fields) { put(path, { ...fields(path), ...delta }); }
function completeBoardingFixture() {
  const hosts = fields(sessionPath).activeVesselIds as string[];
  patch(sessionPath, { setupRevision: 4,
    shuttleControl: { pallas: { shuttleId: 'pallas', ownerRoleId: 'executive-officer',
      ownerUid: 'xo-1', holderUid: 'xo-1', revision: 0 } },
    shipDamage: Object.fromEntries(hosts.map(host => [host, { damagedSystemIds: [], destroyed: false }])),
    shipSurvivors: { aegis: 2500, dione: 100000, icebreaker: 40000, quellon: 30000, shepherd: 30000, 'refinery-124': 20000 },
    shipUnrest: Object.fromEntries(hosts.map(host => [host, 0])),
  });
  patch(attackPath, { rangeReceipts: (fields(attackPath).rangeReceipts as Fields[]).map(receipt => ({ ...receipt,
    destructionDamageByTarget: Object.fromEntries(EXPANDED_WOLF_TARGET_RING.map(host => [host, 0])) })) });
}
function seatMilitia() {
  put(`${sessionPath}/players/militia-1`, { uid: 'militia-1', role: 'player', connected: true,
    assignedRoleId: 'shepherd-scientist', replacementRoleId: 'rosal-militia-leader',
    replacementStatus: null, seatId: null, activeConsoleRoleId: null, fleetGroupId: 'fleet-1' });
  const groupPath = `${sessionPath}/fleetGroups/fleet-1`;
  patch(groupPath, { memberUids: ['xo-1', 'militia-1'],
    memberShipIds: { 'xo-1': 'aegis', 'militia-1': 'aegis' } });
}
async function special(uid: string, choice: Fields, requestId: string, instanceId?: string) {
  const payload = { sessionId: 's1', requestId, expectedTurn: 1, expectedRevision: fields(attackPath).revision,
    choice, ...(instanceId ? { instanceId } : {}) };
  const result = await commitWolfBoardingSpecialChoice.run(request(payload, uid));
  return { uid, payload, result };
}
async function skipCommanderAndRelocation() {
  await special('commander-1', { kind: 'commander', targetShipId: null }, 'review-no-commander');
  const view = await getWolfBoardingSpecialChoice.run(request({ sessionId: 's1' }, 'xo-1'));
  if (view.type !== 'wolf-boarding-special-choice-view' || view.choice.kind !== 'relocation') throw new Error('Expected relocation');
  await special('xo-1', { kind: 'relocation', craftId: 'pallas', targetShipId: null,
    expectedControlRevision: view.choice.controlRevision }, 'review-no-relocation');
}
async function crewDefence(securityTeams: number) {
  await commitWolfBoardingDefenceChoice.run(request({ sessionId: 's1', requestId: 'review-crew-defence',
    expectedTurn: 1, expectedRevision: fields(attackPath).revision, targetShipId: 'aegis', securityTeams }, 'xo-1'));
}
const specialCases = ['commander', 'relocation', 'militia', 'aegis-reroll', 'pallas-reroll', 'commander-ruling'] as const;
async function commitSpecialFixture(kind: typeof specialCases[number]) {
  completeBoardingFixture();
  if (kind === 'commander') return special('commander-1', { kind: 'commander', targetShipId: 'aegis' }, 'review-commander');
  if (kind === 'relocation') {
    await special('commander-1', { kind: 'commander', targetShipId: null }, 'review-no-commander');
    return special('xo-1', { kind: 'relocation', craftId: 'pallas', targetShipId: 'dione',
      expectedControlRevision: 0 }, 'review-relocation');
  }
  if (kind === 'commander-ruling') {
    patch(sessionPath, { shipResources: { aegis: { securityTeams: 22 } } });
    await special('commander-1', { kind: 'commander', targetShipId: 'aegis' }, 'review-commander');
    await special('xo-1', { kind: 'relocation', craftId: 'pallas', targetShipId: null,
      expectedControlRevision: 0 }, 'review-no-relocation');
    await crewDefence(22);
  } else {
    if (kind === 'militia') seatMilitia();
    await skipCommanderAndRelocation();
    await crewDefence(kind === 'militia' ? 0 : 2);
    if (kind === 'militia') return special('militia-1', { kind: 'militia', targetShipId: 'aegis',
      militiaDoubleTeams: true, militiaFrontLineDice: 1 }, 'review-militia');
  }
  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });
  const eoChoice = { kind: 'reroll', source: 'aegis', targetShipId: 'aegis', dieIndexes: kind === 'aegis-reroll' ? [0] : [] };
  const eo = await special('xo-1', eoChoice, 'review-eo-reroll');
  if (kind === 'aegis-reroll') return eo;
  const pallas = await special('xo-1', { kind: 'reroll', source: 'pallas', targetShipId: 'aegis',
    dieIndexes: kind === 'pallas-reroll' ? [0] : [] }, 'review-pallas-reroll');
  if (kind === 'pallas-reroll') return pallas;
  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });
  put(`${sessionPath}/players/gm-1`, { uid: 'gm-1', role: 'gm', connected: true });
  put(`${sessionPath}/gmInstances/gm-instance`, { uid: 'gm-1', connected: true, lastSeenAt: new Date() });
  return special('gm-1', { kind: 'commander-ruling', targetShipId: 'aegis', rulingText: 'Explicit current ruling.' },
    'review-commander-ruling', 'gm-instance');
}
function noAdditionalWrites(before: Fields[], draws: number) {
  expect([...testState.documents.values()]).toEqual(before);
  expect(entropy.randomInt.mock.calls.length).toBe(draws);
}

it.each(specialCases)('R1 preserves authorized %s exact replay after its stage closes', async kind => {
  const committed = await commitSpecialFixture(kind);
  const before = structuredClone([...testState.documents.values()]);
  const draws = entropy.randomInt.mock.calls.length;
  await expect(commitWolfBoardingSpecialChoice.run(request(committed.payload, committed.uid))).resolves.toEqual(committed.result);
  noAdditionalWrites(before, draws);
});

it.each(specialCases)('R1 denies %s receipt replay after current role revocation', async kind => {
  const committed = await commitSpecialFixture(kind);
  patch(`${sessionPath}/players/${committed.uid}`, kind === 'commander-ruling'
    ? { role: 'player' } : { assignedRoleId: null, activeConsoleRoleId: null,
      replacementRoleId: null, replacementStatus: 'awaiting-re-role' });
  const before = structuredClone([...testState.documents.values()]);
  const draws = entropy.randomInt.mock.calls.length;
  await expect(commitWolfBoardingSpecialChoice.run(request(committed.payload, committed.uid)))
    .rejects.toMatchObject({ code: 'permission-denied' });
  noAdditionalWrites(before, draws);
});

it.each(specialCases.flatMap(kind => ['later-cycle', 'different-attack'].map(change => ({ kind, change }))))(
  'R1 denies $kind replay in $change despite an intact saved receipt', async ({ kind, change }) => {
    const committed = await commitSpecialFixture(kind);
    if (change === 'later-cycle') { patch(sessionPath, { currentTurn: 2 }); patch(attackPath, { turn: 2 }); }
    else patch(attackPath, { attackId: 'wolf-different-current-attack' });
    const before = structuredClone([...testState.documents.values()]);
    const draws = entropy.randomInt.mock.calls.length;
    await expect(commitWolfBoardingSpecialChoice.run(request(committed.payload, committed.uid)))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    noAdditionalWrites(before, draws);
  },
);

it.each(['aegis-reroll', 'militia'] as const)('R1 denies %s replay after the actor leaves its authoritative berth', async kind => {
  const committed = await commitSpecialFixture(kind);
  const groupPath = `${sessionPath}/fleetGroups/fleet-1`;
  patch(groupPath, { vesselIds: ['aegis', 'dione'], memberShipIds: {
    ...(fields(groupPath).memberShipIds as Fields), [committed.uid]: 'dione' } });
  const before = structuredClone([...testState.documents.values()]);
  const draws = entropy.randomInt.mock.calls.length;
  await expect(commitWolfBoardingSpecialChoice.run(request(committed.payload, committed.uid)))
    .rejects.toMatchObject({ code: 'permission-denied' });
  noAdditionalWrites(before, draws);
});

it.each(['relocation', 'pallas-reroll'] as const)('R1 denies %s replay after holder custody revision changes', async kind => {
  const committed = await commitSpecialFixture(kind);
  const control = fields(sessionPath).shuttleControl as Record<string, Fields> | undefined;
  patch(sessionPath, { shuttleControl: { ...control, pallas: { shuttleId: 'pallas', ownerRoleId: 'executive-officer',
    ownerUid: 'xo-1', holderUid: 'commander-1', revision: (control?.pallas?.revision as number ?? 0) + 1 } } });
  const before = structuredClone([...testState.documents.values()]);
  const draws = entropy.randomInt.mock.calls.length;
  await expect(commitWolfBoardingSpecialChoice.run(request(committed.payload, committed.uid)))
    .rejects.toMatchObject({ code: 'permission-denied' });
  noAdditionalWrites(before, draws);
});

it.each(['expired', 'disconnected', 'foreign-holder'])('R1 rejects saved private GM ruling under a %s lease', async change => {
  const committed = await commitSpecialFixture('commander-ruling');
  patch(`${sessionPath}/gmInstances/gm-instance`, change === 'expired' ? { lastSeenAt: new Date(Date.now() - 600_000) }
    : change === 'disconnected' ? { connected: false } : { uid: 'another-gm' });
  const before = structuredClone([...testState.documents.values()]);
  const draws = entropy.randomInt.mock.calls.length;
  await expect(commitWolfBoardingSpecialChoice.run(request(committed.payload, committed.uid)))
    .rejects.toMatchObject({ code: 'permission-denied' });
  noAdditionalWrites(before, draws);
});

async function pendingEoFixture() {
  completeBoardingFixture();
  await skipCommanderAndRelocation();
  await crewDefence(2);
  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });
  patch(attackPath, { boardingRerollChoices: { pallas: { source: 'pallas', targetShipId: 'aegis', dieIndexes: [],
    rolls: [], actorUid: 'xo-1', requestId: 'review-pallas-pass', turn: 1, revision: fields(attackPath).revision } } });
}
it.each([{ activeConsoleRoleId: null }, { activeConsoleRoleId: 'admiral' }, { connected: false }])(
  'R2 retains assigned EO reroll entitlement under %j', async delta => {
    await pendingEoFixture();
    patch(`${sessionPath}/players/xo-1`, delta);
    const before = structuredClone(fields(attackPath));
    await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });
    expect(fields(attackPath)).toMatchObject({ status: 'declared', currentStep: 'boarding', revision: before.revision });
    expect(fields(attackPath)).not.toHaveProperty('calculationReceipt.boarding');
    await expect(commitWolfBoardingSpecialChoice.run(request({ sessionId: 's1', requestId: 'review-away-eo',
      expectedTurn: 1, expectedRevision: before.revision,
      choice: { kind: 'reroll', source: 'aegis', targetShipId: 'aegis', dieIndexes: [] } }, 'xo-1')))
      .rejects.toMatchObject({ code: 'permission-denied' });
  },
);
it.each(['removed', 'kicked', 'replaced', 'wrong-berth'].flatMap(change => [false, true].map(rerolled => ({ change, rerolled }))))(
  'R2 audits $change EO as unavailable while preserving prior Pallas reroll=$rerolled', async ({ change, rerolled }) => {
  await pendingEoFixture();
  if (rerolled) patch(attackPath, { boardingRerollChoices: { pallas: { source: 'pallas', targetShipId: 'aegis',
    dieIndexes: [0], rolls: [6], actorUid: 'xo-1', requestId: 'review-pallas-pass', turn: 1,
    revision: fields(attackPath).revision } } });
  const committedPallas = structuredClone((fields(attackPath).boardingRerollChoices as Fields).pallas);
  if (change === 'wrong-berth') patch(`${sessionPath}/fleetGroups/fleet-1`, { vesselIds: ['aegis', 'dione'], memberShipIds: { 'xo-1': 'dione' } });
  else patch(`${sessionPath}/players/xo-1`, change === 'removed' ? { assignedRoleId: null }
    : change === 'kicked' ? { kickedAt: '2026-10-03T12:00:00.000Z' } : { replacementRoleId: 'doctor' });
  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });
  expect(fields(attackPath)).toMatchObject({ status: 'resolved' });
  expect(fields(`${attackPath}/audit/wolf-finalized-1`)).toMatchObject({
    boardingRerollAvailability: { aegis: { status: 'unavailable', reason: 'no-current-executive-officer' } } });
  expect((fields(attackPath).boardingRerollChoices as Fields).pallas).toEqual(committedPallas);
  const before = structuredClone([...testState.documents.values()]);
  const draws = entropy.randomInt.mock.calls.length;
  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });
  noAdditionalWrites(before, draws);
});

it.each([20, 21, 22])('R3 uses Commander-adjusted parties for the Militia boundary with %i teams', async teams => {
  completeBoardingFixture();
  seatMilitia();
  patch(sessionPath, { shipResources: { aegis: { securityTeams: teams } } });
  await special('commander-1', { kind: 'commander', targetShipId: 'aegis' }, 'review-commander');
  await special('xo-1', { kind: 'relocation', craftId: 'pallas', targetShipId: null,
    expectedControlRevision: 0 }, 'review-no-relocation');
  await crewDefence(1);
  const view = await getWolfBoardingSpecialChoice.run(request({ sessionId: 's1' }, 'militia-1'));
  expect(view).toMatchObject({ choice: { kind: 'militia', boardingParties: 22, doubleDiceAvailable: teams < 22 } });
  const commit = () => special('militia-1', { kind: 'militia', targetShipId: 'aegis',
    militiaDoubleTeams: true, militiaFrontLineDice: 0 }, 'review-double-militia');
  if (teams < 22) await expect(commit()).resolves.toMatchObject({ result: { status: 'committed' } });
  else await expect(commit()).rejects.toMatchObject({ code: 'failed-precondition' });
});

async function militiaDeathFixture(frontLineDice = 1, rerollToSurvive = false) {
  completeBoardingFixture();
  seatMilitia();
  const targeting = resolveWolfTargeting({ ...firstTurnWolfAttackComposition(), shipIds: ['wolf-assault-transport'] }, {}, undefined, () => 0);
  const roster = wolfCombatRoster(targeting);
  patch(attackPath, { combatRoster: roster,
    calculationReceipt: { type: 'wolf-combat-calculation-stage', version: 1, turn: 1, step: 'targeting', targeting },
    rangeReceipts: (fields(attackPath).rangeReceipts as Fields[]).map(receipt => ({ ...receipt,
      targetSnapshot: roster.map(({ instanceId, target }) => ({ instanceId, target })) })) });
  await skipCommanderAndRelocation();
  await crewDefence(0);
  const militia = await special('militia-1', { kind: 'militia', targetShipId: 'aegis', militiaDoubleTeams: false,
    militiaFrontLineDice: frontLineDice }, 'review-militia-front-line');
  put(`${sessionPath}/roleBriefs/militia-1`, { ownerUid: 'militia-1', roleId: 'rosal-militia-leader' });
  put(`${sessionPath}/playerDiscoveries/militia-1`, { ownerUid: 'militia-1', roleId: 'rosal-militia-leader' });
  put(`${sessionPath}/replacementEligibility/militia-1`, { sessionId: 's1', targetUid: 'militia-1', eligible: false,
    reason: 'removed', revision: 3, consumedByRequestId: 'earlier-assignment' });
  put(`${sessionPath}/secrets/loyalty-militia-1`, { ownerUid: 'militia-1', unchangedHistoricalLoyalty: true });
  entropy.randomInt.mockReturnValue(0);
  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });
  expect(fields(attackPath).resolutionBlocker).toBeUndefined();
  if (frontLineDice > 0) {
    if (rerollToSurvive) entropy.randomInt.mockReturnValue(5);
    await special('xo-1', { kind: 'reroll', source: 'aegis', targetShipId: 'aegis',
      dieIndexes: rerollToSurvive ? [0] : [] }, 'review-death-eo-pass');
    await special('xo-1', { kind: 'reroll', source: 'pallas', targetShipId: 'aegis', dieIndexes: [] }, 'review-death-pallas-pass');
  }
  return militia;
}
it('R4 atomically consumes the committed front-line death through the existing re-role state and private audit once', async () => {
  const militia = await militiaDeathFixture();
  const historicalLoyalty = structuredClone(fields(`${sessionPath}/secrets/loyalty-militia-1`));
  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });
  expect(fields(attackPath)).toMatchObject({ status: 'resolved', calculationReceipt: { boarding: [{ militiaLeaderKilled: true }] } });
  expect(fields(`${sessionPath}/players/militia-1`)).toMatchObject({ assignedRoleId: 'shepherd-scientist',
    replacementRoleId: null, replacementStatus: 'awaiting-re-role', activeConsoleRoleId: null, seatId: null });
  expect(fields(sessionPath)).toMatchObject({ setupRevision: 5 });
  expect(fields(`${sessionPath}/replacementEligibility/militia-1`)).toMatchObject({ reason: 'dead', eligible: true, revision: 4,
    actorUid: 'server', source: 'wolf-boarding', attackId: 'wolf-attack-test-1', targetShipId: 'aegis' });
  expect(fields(`${attackPath}/audit/wolf-finalized-1`)).toMatchObject({ characterDeaths: [{ actorUid: 'militia-1',
    roleId: 'rosal-militia-leader', choiceRequestId: 'review-militia-front-line', reason: 'front-line-die-one' }] });
  expect(testState.documents.has(`${sessionPath}/roleBriefs/militia-1`)).toBe(false);
  expect(testState.documents.has(`${sessionPath}/playerDiscoveries/militia-1`)).toBe(false);
  expect(fields(`${sessionPath}/secrets/loyalty-militia-1`)).toEqual(historicalLoyalty);
  const before = structuredClone([...testState.documents.values()]);
  const draws = entropy.randomInt.mock.calls.length;
  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });
  noAdditionalWrites(before, draws);
  await expect(commitWolfBoardingSpecialChoice.run(request(militia.payload, militia.uid)))
    .rejects.toMatchObject({ code: 'permission-denied' });
});
it.each([{ frontLineDice: 0, rerollToSurvive: false }, { frontLineDice: 1, rerollToSurvive: true }])(
  'R4 leaves a living Militia character assigned for %j', async options => {
    await militiaDeathFixture(options.frontLineDice, options.rerollToSurvive);
    await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });
    expect(fields(attackPath)).toMatchObject({ status: 'resolved', calculationReceipt: { boarding: [{ militiaLeaderKilled: false }] } });
    expect(fields(`${sessionPath}/players/militia-1`)).toMatchObject({ replacementRoleId: 'rosal-militia-leader', replacementStatus: null });
    expect(fields(`${sessionPath}/replacementEligibility/militia-1`)).toMatchObject({ eligible: false, revision: 3 });
    expect(fields(sessionPath)).toMatchObject({ setupRevision: 4 });
  },
);

it('R1 preserves current Commander and private GM exact receipts after actual automatic finalization', async () => {
  const ruling = await commitSpecialFixture('commander-ruling');
  const commanderPayload = { sessionId: 's1', requestId: 'review-commander', expectedTurn: 1, expectedRevision: 10,
    choice: { kind: 'commander', targetShipId: 'aegis' } };
  const commanderResult = await commitWolfBoardingSpecialChoice.run(request(commanderPayload));
  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });
  expect(fields(attackPath)).toMatchObject({ status: 'resolved' });
  const before = structuredClone([...testState.documents.values()]);
  const draws = entropy.randomInt.mock.calls.length;
  await expect(commitWolfBoardingSpecialChoice.run(request(ruling.payload, ruling.uid))).resolves.toEqual(ruling.result);
  await expect(commitWolfBoardingSpecialChoice.run(request(commanderPayload))).resolves.toEqual(commanderResult);
  noAdditionalWrites(before, draws);
});
