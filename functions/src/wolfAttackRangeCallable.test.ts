import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { firstTurnWolfAttackComposition } from './wolfAttackComposition';
import { CORE_WOLF_TARGET_RING } from './wolfCombatMath';
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
  advanceWolfAttackLifecycle,
  getWolfRangeActionChoice,
  getWolfBoardingDefenceChoice,
  commitWolfBoardingDefenceChoice,
  getWolfForceFieldChoice,
  commitWolfForceFieldChoice,
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
    assignedRoleId: 'executive-officer', activeConsoleRoleId: 'executive-officer', fleetGroupId: 'fleet-1' });
  put('sessions/s1/fleetGroups/fleet-1', {
    id: 'fleet-1',
    vesselIds: ['aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124'],
    memberUids: ['xo-1'], memberShipIds: { 'xo-1': 'aegis' },
  });
  put('sessions/s1/wolfAttackState/current', {
    type: 'wolf-attack-state', status: 'declared', currentStep: 'long-range', airspaceLocked: true,
    turn: 1, revision: 4, attackId: 'wolf-attack-test-1', deadlineAt: '2026-10-02T12:10:00.000Z',
    commanderRerollIndexes: [],
    preparation: { turn: 1, revision: 1, shipIds: [...firstTurnWolfAttackComposition().shipIds],
      targetMode: 'pre-rolled', targetAssignments: [], modifiers: [], notes: '' },
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

it('publishes a private GM decision summary with configured-but-disconnected roles distinct from unavailable actions', async () => {
  put('sessions/s1/players/wolf-commander-1', {
    uid: 'wolf-commander-1', role: 'player', replacementRoleId: 'wolf-commander', connected: false,
  });
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  put('sessions/s1/wolfAttackState/current', { ...attack, currentStep: 'targeting' });

  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });

  expect(testState.documents.get('sessions/s1/wolfAttackState/current')).toMatchObject({
    decisionSummary: {
      commander: { status: 'pending', actors: [{ uid: 'wolf-commander-1', connected: false }] },
      commandAndControl: { status: 'waiting-for-commander', reason: 'waiting-for-commander' },
      forceField: { status: 'not-needed' },
    },
  });
  const summary = testState.documents.get('sessions/s1/wolfAttackState/current')!.decisionSummary as Fields;
  expect(summary).not.toHaveProperty('rolls');
  expect(summary).not.toHaveProperty('composition');
});

it('denies the EO range projection after the current berth moves away from AEGIS', async () => {
  const group = testState.documents.get('sessions/s1/fleetGroups/fleet-1')!;
  put('sessions/s1/fleetGroups/fleet-1', { ...group, memberShipIds: { 'xo-1': 'dione' } });

  await expect(getWolfRangeActionChoice.run(request({ sessionId: 's1' })))
    .rejects.toMatchObject({ code: 'permission-denied' });
});

it('denies use/pass writes after the EO has taxied away from AEGIS', async () => {
  const group = testState.documents.get('sessions/s1/fleetGroups/fleet-1')!;
  put('sessions/s1/fleetGroups/fleet-1', { ...group, memberShipIds: { 'xo-1': 'dione' } });

  await expect(commitWolfRangeActionChoice.run(request({
    sessionId: 's1', requestId: 'taxied-eo-pass', expectedTurn: 1, expectedRevision: 4,
    range: 'long-range', actionIds: [],
  }))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(testState.documents.has('sessions/s1/commandReceipts/taxied-eo-pass')).toBe(false);
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
  const lockedRevision = state.revision as number;
  const applied = await assignWolfRangeTargets.run(request({
    sessionId: 's1', requestId: 'target-long-1', expectedTurn: 1, expectedRevision: lockedRevision,
    range: 'long-range', assignments: [{ actionId: 'aegis-missile-launchers-long', contactIds: ['contact-1'] }],
  }));
  expect(applied).toMatchObject({ status: 'committed', type: 'wolf-range-target-assignment', currentStep: 'medium-range' });
  expect(entropy.randomInt).not.toHaveBeenCalled();
  const after = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  expect(after.rangeReceipts).toEqual(expect.arrayContaining([expect.objectContaining({ range: 'long-range' })]));
  expect(after.revision).toBe(lockedRevision + 1);
  expect(testState.documents.get('sessions/s1/wolfAttackState/current/audit/target-long-1'))
    .toMatchObject({ type: 'wolf-range-target-assignment', fromStep: 'long-range', toStep: 'medium-range' });
});

it('reconstructs a partially selected Medium Range lock after an entitled reconnect', async () => {
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  put('sessions/s1/wolfAttackState/current', { ...attack, currentStep: 'medium-range', revision: 4 });
  const initial = await getWolfRangeActionChoice.run(request({ sessionId: 's1' }));
  expect(initial).toMatchObject({ eligibleActions: [
    { actionId: 'aegis-missile-launchers-medium' },
    { actionId: 'aegis-point-defence-lasers-medium' },
  ] });

  const locked = await commitWolfRangeActionChoice.run(request({
    sessionId: 's1', requestId: 'lock-medium-missiles-only', expectedTurn: 1, expectedRevision: 4,
    range: 'medium-range', actionIds: ['aegis-missile-launchers-medium'],
  }));
  expect(locked).toMatchObject({ choiceStatus: 'targets-required', hitSlots: [
    { actionId: 'aegis-missile-launchers-medium', count: 5 },
  ] });

  const reconnected = await getWolfRangeActionChoice.run(request({ sessionId: 's1' }));
  expect(reconnected).toMatchObject({
    choiceStatus: 'targets-required',
    hitSlots: [{ actionId: 'aegis-missile-launchers-medium', count: 5 }],
  });
  expect(reconnected.hitSlots).not.toContainEqual(expect.objectContaining({ actionId: 'aegis-point-defence-lasers-medium' }));
});

it('caps excess server hits at the live distinct contacts and preserves the private full-hit receipt', async () => {
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  const roster = (attack.combatRoster as Array<Record<string, unknown>>).map((ship, index) => ({
    ...ship, destroyed: index !== 10,
  }));
  put('sessions/s1/wolfAttackState/current', { ...attack, currentStep: 'medium-range', revision: 4, combatRoster: roster });

  const lock = await commitWolfRangeActionChoice.run(request({
    sessionId: 's1', requestId: 'lock-medium-overflow', expectedTurn: 1, expectedRevision: 4,
    range: 'medium-range', actionIds: ['aegis-missile-launchers-medium'],
  }));
  expect(lock.hitSlots).toEqual([{ actionId: 'aegis-missile-launchers-medium', count: 5 }]);
  const committed = await assignWolfRangeTargets.run(request({
    sessionId: 's1', requestId: 'assign-medium-overflow', expectedTurn: 1, expectedRevision: lock.revision,
    range: 'medium-range', assignments: [{ actionId: 'aegis-missile-launchers-medium', contactIds: ['contact-11'] }],
  }));

  const state = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  const receipt = (state.rangeReceipts as Array<Record<string, unknown>>).find(({ range }) => range === 'medium-range')!;
  expect(committed).toMatchObject({ currentStep: 'short-range', committedContacts: 1 });
  expect(receipt).toMatchObject({
    dice: [{ actionId: 'aegis-missile-launchers-medium', rolls: [6, 6, 6, 6, 6], successes: 5, damage: 5 }],
    assignments: [{ actionId: 'aegis-missile-launchers-medium', targetInstanceIds: ['10:wolf-assault-transport'] }],
    damageByInstance: { '10:wolf-assault-transport': 1 },
    unusedHitsByAction: [{ actionId: 'aegis-missile-launchers-medium', count: 4 }],
  });
  expect(entropy.randomInt).toHaveBeenCalledTimes(5);
});

it('commits an empty target assignment when Short Range has no legal live contacts', async () => {
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  const roster = (attack.combatRoster as Array<Record<string, unknown>>).map((ship) => ({ ...ship, destroyed: true }));
  put('sessions/s1/wolfAttackState/current', { ...attack, currentStep: 'short-range', revision: 4, combatRoster: roster });

  const choice = await commitWolfRangeActionChoice.run(request({
    sessionId: 's1', requestId: 'lock-short-no-contact', expectedTurn: 1, expectedRevision: 4,
    range: 'short-range', actionIds: ['aegis-point-defence-lasers-short'],
  }));
  expect(choice.hitSlots).toEqual([{ actionId: 'aegis-point-defence-lasers-short', count: 2 }]);
  const committed = await assignWolfRangeTargets.run(request({
    sessionId: 's1', requestId: 'assign-short-no-contact', expectedTurn: 1, expectedRevision: choice.revision,
    range: 'short-range', assignments: [{ actionId: 'aegis-point-defence-lasers-short', contactIds: [] }],
  }));

  const state = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  const receipt = (state.rangeReceipts as Array<Record<string, unknown>>).find(({ range }) => range === 'short-range')!;
  expect(committed).toMatchObject({ currentStep: 'boarding', committedContacts: 0 });
  expect(receipt).toMatchObject({
    dice: [{ actionId: 'aegis-point-defence-lasers-short', rolls: [6, 6], successes: 2, damage: 2 }],
    assignments: [{ actionId: 'aegis-point-defence-lasers-short', targetInstanceIds: [] }],
    damageByInstance: {},
    unusedHitsByAction: [{ actionId: 'aegis-point-defence-lasers-short', count: 2 }],
  });
});

it('records an explicit range pass in the final receipt and member-safe results', async () => {
  const pass = await commitWolfRangeActionChoice.run(request({
    sessionId: 's1', requestId: 'pass-long-1', expectedTurn: 1, expectedRevision: 4,
    range: 'long-range', actionIds: [],
  }));
  expect(pass).toMatchObject({ status: 'committed', choiceStatus: 'passed' });
  const state = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  expect(state.rangeReceipts).toEqual(expect.arrayContaining([expect.objectContaining({
    range: 'long-range', dice: [], assignments: [],
  })]));
  expect(state.memberResults).toEqual(expect.arrayContaining([expect.objectContaining({
    status: 'committed', range: 'long-range', sourceId: 'aegis-weapons',
    effect: 'AEGIS passed Long Range weapons', outcome: { damage: 0, destroyed: false },
  })]));
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

it('opens Long Range automatically when targeting has no Commander and no available C&C choice', async () => {
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  put('sessions/s1/wolfAttackState/current', { ...attack, currentStep: 'targeting', revision: 4 });
  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });
  expect(testState.documents.get('sessions/s1/wolfAttackState/current')).toMatchObject({
    currentStep: 'long-range', revision: 5,
    commanderRerollCompletion: { status: 'no-commander', turn: 1, revision: 5, actorUid: 'server',
      requestId: 'wolf-no-commander-1' },
  });
  expect(testState.documents.get('sessions/s1/wolfAttackState/current/audit/auto-targeting-1'))
    .toMatchObject({ type: 'wolf-attack-targeting-auto-advance', fromStep: 'targeting', toStep: 'long-range' });
});

it('does not run automatic attack progression through any current session pause', async () => {
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  put('sessions/s1/wolfAttackState/current', { ...attack, currentStep: 'targeting', revision: 4 });
  const session = testState.documents.get('sessions/s1')!;
  put('sessions/s1', { ...session, turnPhase: { ...session.turnPhase as Fields,
    timerPause: { reason: 'turn-interstitial', pausedAt: '2026-10-02T12:00:00.000Z', remainingMs: 5000 } } });
  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });
  expect(testState.documents.get('sessions/s1/wolfAttackState/current'))
    .toMatchObject({ currentStep: 'targeting', revision: 4 });
});

it('marks a charged range unavailable and continues when the fleet configuration has no Executive Officer', async () => {
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  put('sessions/s1/wolfAttackState/current', { ...attack, currentStep: 'long-range', revision: 4 });
  const session = testState.documents.get('sessions/s1')!;
  put('sessions/s1', { ...session, activeRoleIds: [] });

  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });

  const state = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  expect(state).toMatchObject({ currentStep: 'medium-range', revision: 5,
    rangeDecisions: { 'long-range': { status: 'unavailable', reason: 'no-configured-executive-officer' } } });
  expect(testState.documents.get('sessions/s1').maintenanceCycles).toMatchObject({
    aegis: { charges: ['missile-launchers', 'point-defence-lasers'] },
  });
  expect(testState.documents.get('sessions/s1/wolfAttackState/current/audit/auto-long-range-1'))
    .toMatchObject({ type: 'wolf-range-automatic-unavailable', range: 'long-range', toStep: 'medium-range' });
  expect(state.rangeReceipts).toMatchObject([
    { range: 'long-range', dice: [], assignments: [], unusedHitsByAction: [] },
  ]);
});

it('keeps a charged range pending while the configured Executive Officer is disconnected', async () => {
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  put('sessions/s1/wolfAttackState/current', { ...attack, currentStep: 'long-range', revision: 4 });
  const player = testState.documents.get('sessions/s1/players/xo-1')!;
  put('sessions/s1/players/xo-1', { ...player, connected: false });

  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });

  expect(testState.documents.get('sessions/s1/wolfAttackState/current'))
    .toMatchObject({ currentStep: 'long-range', revision: 4 });
});

it('does not leave charged Command and Control ownerless when no Executive Officer is configured', async () => {
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  put('sessions/s1/wolfAttackState/current', { ...attack, currentStep: 'targeting', revision: 4 });
  const session = testState.documents.get('sessions/s1')!;
  put('sessions/s1', { ...session, activeRoleIds: [], maintenanceCycles: {
    ...session.maintenanceCycles as Fields,
    aegis: { ...((session.maintenanceCycles as Fields).aegis as Fields), charges: ['command-and-control'] },
  } });

  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });

  expect(testState.documents.get('sessions/s1/wolfAttackState/current')).toMatchObject({
    currentStep: 'long-range', revision: 5,
    targetingCompletion: { commandAndControl: 'unavailable' },
  });
  expect(testState.documents.get('sessions/s1/wolfAttackState/current/audit/auto-targeting-1'))
    .toMatchObject({ commandAndControl: 'unavailable', reason: 'no-configured-executive-officer' });
  expect(testState.documents.get('sessions/s1').maintenanceCycles).toMatchObject({
    aegis: { charges: ['command-and-control'] },
  });
});

function openBoardingFixture(): void {
  const targets = ['aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124'];
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  const emptyRange = (range: string) => ({ range, dice: [], assignments: [], unusedHitsByAction: [],
    damageByInstance: {}, destroyedInstanceIds: [], destructionDamageByTarget: Object.fromEntries(targets.map((id) => [id, 0])) });
  const current = new Date();
  const future = (milliseconds: number) => new Date(current.getTime() + milliseconds).toISOString();
  put('sessions/s1', {
    ...testState.documents.get('sessions/s1'),
    shipResources: { aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 1, securityTeams: 4 } },
    shipSurvivors: { aegis: 2500, dione: 100000, icebreaker: 40000, quellon: 30000, shepherd: 30000, 'refinery-124': 20000 },
    shipDamage: Object.fromEntries(targets.map((id) => [id, { damagedSystemIds: [], destroyed: false }])),
    shipUnrest: Object.fromEntries(targets.map((id) => [id, 0])),
    turnPhase: { turn: 1, teamPhaseEndsAt: future(-1000), openAirspaceEndsAt: future(300000),
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false } },
  });
  put('sessions/s1/wolfAttackState/current', {
    ...attack, currentStep: 'boarding', revision: 10, rangeReceipts: [
      emptyRange('long-range'), emptyRange('medium-range'), emptyRange('short-range'),
    ],
    rangeDecisions: Object.fromEntries(['long-range', 'medium-range', 'short-range'].map((range) => [range, { status: 'committed' }])),
    boardingDefenceChoices: {},
  });
}

it('commits only the target ship crew boarding choice, reserves teams, then auto-resolves and reopens once', async () => {
  openBoardingFixture();
  const view = await getWolfBoardingDefenceChoice.run(request({ sessionId: 's1' }));
  expect(view).toMatchObject({ type: 'wolf-boarding-defence-choice-view', turn: 1, revision: 10,
    targetShipId: 'aegis', boardingParties: 20, availableSecurityTeams: 4, choiceStatus: 'pending' });
  expect(view).not.toHaveProperty('combatRoster');
  expect(view).not.toHaveProperty('rolls');

  await expect(commitWolfBoardingDefenceChoice.run(request({
    sessionId: 's1', requestId: 'boarding-wrong-actor', expectedTurn: 1, expectedRevision: 10,
    targetShipId: 'dione', securityTeams: 2,
  }, 'not-seated'))).rejects.toMatchObject({ code: 'permission-denied' });
  await expect(commitWolfBoardingDefenceChoice.run(request({
    sessionId: 's1', requestId: 'boarding-stale', expectedTurn: 1, expectedRevision: 9,
    targetShipId: 'aegis', securityTeams: 2,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });

  const payload = { sessionId: 's1', requestId: 'boarding-aegis-1', expectedTurn: 1,
    expectedRevision: 10, targetShipId: 'aegis', securityTeams: 2 };
  const committed = await commitWolfBoardingDefenceChoice.run(request(payload));
  expect(committed).toMatchObject({ type: 'wolf-boarding-defence-choice', revision: 11,
    targetShipId: 'aegis', securityTeams: 2, currentStep: 'boarding' });
  expect((testState.documents.get('sessions/s1')!.shipResources as Fields).aegis)
    .toMatchObject({ securityTeams: 2 });
  expect(await commitWolfBoardingDefenceChoice.run(request(payload))).toEqual(committed);

  const priorOpenDeadline = ((testState.documents.get('sessions/s1')!.turnPhase as Fields).openAirspaceEndsAt);
  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });
  const state = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  const session = testState.documents.get('sessions/s1')!;
  expect(state).toMatchObject({ status: 'resolved', currentStep: 'resolved', airspaceLocked: false,
    parkingReleaseCondition: 'normal-movement-reopened', calculationReceipt: { type: 'wolf-combat-calculation',
      boarding: [{ target: 'aegis', boardingParties: 20, securityTeams: 2, survivingBoardingParties: 18 }] } });
  expect(session.turnPhase).toMatchObject({ turn: 1, airspace: { state: 'lifted', tickerActive: true } });
  expect((session.turnPhase as Fields).openAirspaceEndsAt).toBe(priorOpenDeadline);
  expect((session.shipResources as Fields).aegis).toMatchObject({ securityTeams: 4 });
  expect(testState.documents.has('sessions/s1/events/wolf-attack-airspace-reopened-1')).toBe(true);
  const revision = state.revision;
  const drawCount = entropy.randomInt.mock.calls.length;
  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });
  expect(testState.documents.get('sessions/s1/wolfAttackState/current')!.revision).toBe(revision);
  expect(entropy.randomInt).toHaveBeenCalledTimes(drawCount);
});

it('keeps boarding pending through disconnect and scopes the projection to the current mapped berth', async () => {
  openBoardingFixture();
  const player = testState.documents.get('sessions/s1/players/xo-1')!;
  put('sessions/s1/players/xo-1', { ...player, connected: false });
  await expect(getWolfBoardingDefenceChoice.run(request({ sessionId: 's1' })))
    .rejects.toMatchObject({ code: 'permission-denied' });
  put('sessions/s1/players/xo-1', player);
  const group = testState.documents.get('sessions/s1/fleetGroups/fleet-1')!;
  put('sessions/s1/fleetGroups/fleet-1', { ...group, memberShipIds: {} });
  await expect(getWolfBoardingDefenceChoice.run(request({ sessionId: 's1' })))
    .rejects.toMatchObject({ code: 'permission-denied' });
  put('sessions/s1/fleetGroups/fleet-1', { ...group, memberShipIds: { 'xo-1': 'dione' } });
  const otherBerth = await getWolfBoardingDefenceChoice.run(request({ sessionId: 's1' }));
  expect(otherBerth).toMatchObject({ type: 'wolf-boarding-defence-choice-unavailable', reason: 'no-boarders' });
  expect(otherBerth).not.toHaveProperty('availableSecurityTeams');
  expect(testState.documents.get('sessions/s1/wolfAttackState/current'))
    .toMatchObject({ currentStep: 'boarding', boardingDefenceChoices: {} });
});

it('reads casualty alert audiences before any final boarding write under Firestore transaction ordering', async () => {
  openBoardingFixture();
  entropy.randomInt.mockReturnValue(0);
  await commitWolfBoardingDefenceChoice.run(request({ sessionId: 's1', requestId: 'boarding-alert-order',
    expectedTurn: 1, expectedRevision: 10, targetShipId: 'aegis', securityTeams: 0 }));
  testState.runTransaction.mockImplementationOnce(async (callback: (tx: unknown) => unknown) => {
    let wrote = false;
    return callback({
      get: async (target: { path: string }) => {
        if (wrote) throw new Error('Firestore transactions require all reads before all writes.');
        if (target.path.endsWith('/gmInstances')) return { docs: [{ id: 'gm-current' }] };
        return testState.get(target);
      },
      set: (target: { path: string }, fields: Fields) => { wrote = true; testState.set(target, fields); },
      update: (target: { path: string }, fields: Fields) => { wrote = true; testState.update(target, fields); },
      delete: (target: { path: string }) => { wrote = true; testState.remove(target); },
    });
  });

  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });

  expect(testState.documents.get('sessions/s1/wolfAttackState/current'))
    .toMatchObject({ status: 'resolved', currentStep: 'resolved', airspaceLocked: false });
  expect(testState.documents.get('sessions/s1')).toMatchObject({
    turnPhase: { airspace: { state: 'lifted' } },
    populationAlerts: { aegis: { targetGmInstanceIds: ['gm-current'] } },
  });
});

it('bounds the boarding choice by current resources and holds it during a session pause', async () => {
  openBoardingFixture();
  await expect(commitWolfBoardingDefenceChoice.run(request({
    sessionId: 's1', requestId: 'too-many-teams', expectedTurn: 1, expectedRevision: 10,
    targetShipId: 'aegis', securityTeams: 5,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  const session = testState.documents.get('sessions/s1')!;
  put('sessions/s1', { ...session, turnPhase: { ...session.turnPhase as Fields,
    timerPause: { reason: 'turn-interstitial', pausedAt: '2026-10-02T12:00:00.000Z', remainingMs: 5000 } } });
  await expect(getWolfBoardingDefenceChoice.run(request({ sessionId: 's1' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect((testState.documents.get('sessions/s1').shipResources as Fields).aegis)
    .toMatchObject({ securityTeams: 4 });
});

function openForceFieldFixture(): void {
  const session = testState.documents.get('sessions/s1')!;
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  const composition = firstTurnWolfAttackComposition();
  const turnPhase = session.turnPhase as Fields;
  put('sessions/s1', {
    ...session,
    activeRoleIds: [],
    turnPhase: { ...turnPhase, airspace: { state: 'restricted', tickerActive: true, pressAccess: false } },
    smallShipStates: {
      gorgoneion: {
        id: 'gorgoneion', hostShipId: 'aegis', dockingRevision: 1, population: 1_000, unrest: 0,
        cycle: { step: 4, revision: 2, results: { '4': 'Reactor charged.' }, charges: ['force-field-projector'], turn: 1 },
      },
    },
  });
  put('sessions/s1/players/gorg-1', {
    uid: 'gorg-1', role: 'player', connected: true, replacementRoleId: 'gorgoneion-captain',
    replacementStatus: null, activeConsoleRoleId: null, seatId: null, fleetGroupId: 'fleet-1',
  });
  put('sessions/s1/fleetGroups/fleet-1', {
    id: 'fleet-1', vesselIds: [...CORE_WOLF_TARGET_RING], memberUids: ['gorg-1'],
    memberShipIds: { 'gorg-1': 'aegis' },
  });
  put('sessions/s1/wolfAttackState/current', {
    ...attack, currentStep: 'targeting', revision: 4,
    calculationReceipt: {
      type: 'wolf-combat-calculation-stage', version: 1, turn: 1, step: 'pre-target-force-field',
      generatedAt: '2026-10-03T11:00:00.000Z', targetRing: [...CORE_WOLF_TARGET_RING],
      pursuitPressure: { navigationRevision: 1, groupValues: { 'fleet-1': 2 } },
      composition: { shipIds: [...composition.shipIds], counts: { ...composition.counts },
        damageCapacity: composition.damageCapacity },
    },
    forceFieldChoice: {
      status: 'pending', turn: 1, revision: 4, hostShipId: 'aegis', dockingRevision: 1,
      configuredCaptainUid: 'gorg-1',
    },
  });
}

it('requires the current Gorgoneion Captain to choose or pass before targeting rolls are exposed', async () => {
  openForceFieldFixture();
  const view = await getWolfForceFieldChoice.run(request({ sessionId: 's1' }, 'gorg-1'));
  expect(view).toMatchObject({
    type: 'wolf-force-field-choice-view', turn: 1, revision: 4, attackId: 'wolf-attack-test-1',
    hostShipId: 'aegis', dockingRevision: 1, choiceStatus: 'pending',
    targetShipIds: CORE_WOLF_TARGET_RING,
  });
  expect(view).not.toHaveProperty('targeting');
  expect(view).not.toHaveProperty('rolls');
  await expect(getWolfForceFieldChoice.run(request({ sessionId: 's1' }, 'xo-1')))
    .rejects.toMatchObject({ code: 'permission-denied' });

  const payload = { sessionId: 's1', requestId: 'force-field-use', expectedTurn: 1,
    expectedRevision: 4, targetShipId: 'aegis' };
  const result = await commitWolfForceFieldChoice.run(request(payload, 'gorg-1'));
  expect(result).toMatchObject({ type: 'wolf-force-field-choice', status: 'committed', turn: 1,
    revision: 5, targetShipId: 'aegis', choiceStatus: 'selected' });
  expect(testState.documents.get('sessions/s1/wolfAttackState/current'))
    .toMatchObject({ currentStep: 'targeting', calculationReceipt: { step: 'pre-target-force-field' },
      forceFieldChoice: { status: 'selected', targetShipId: 'aegis', actorUid: 'gorg-1' } });
  expect(await commitWolfForceFieldChoice.run(request(payload, 'gorg-1'))).toEqual(result);
});

it('records an explicit Force Field pass and denies stale or lost-host writes', async () => {
  openForceFieldFixture();
  await expect(commitWolfForceFieldChoice.run(request({ sessionId: 's1', requestId: 'force-stale',
    expectedTurn: 1, expectedRevision: 3, targetShipId: null }, 'gorg-1')))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  put('sessions/s1/fleetGroups/fleet-1', {
    id: 'fleet-1', vesselIds: [...CORE_WOLF_TARGET_RING], memberUids: ['gorg-1'], memberShipIds: { 'gorg-1': 'dione' },
  });
  await expect(commitWolfForceFieldChoice.run(request({ sessionId: 's1', requestId: 'force-lost-host',
    expectedTurn: 1, expectedRevision: 4, targetShipId: 'aegis' }, 'gorg-1')))
    .rejects.toMatchObject({ code: 'permission-denied' });
  put('sessions/s1/fleetGroups/fleet-1', {
    id: 'fleet-1', vesselIds: [...CORE_WOLF_TARGET_RING], memberUids: ['gorg-1'], memberShipIds: { 'gorg-1': 'aegis' },
  });
  const result = await commitWolfForceFieldChoice.run(request({ sessionId: 's1', requestId: 'force-pass',
    expectedTurn: 1, expectedRevision: 4, targetShipId: null }, 'gorg-1'));
  expect(result).toMatchObject({ choiceStatus: 'passed', targetShipId: null, revision: 5 });
});

it('limits Force Field targets to active ships in the current Captain group', async () => {
  openForceFieldFixture();
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  put('sessions/s1/wolfAttackState/current', {
    ...attack,
    preparation: { ...attack.preparation as Fields, notes: 'private facilitator text',
      modifiers: ['gorgoneion-force-field-projector'] },
  });
  put('sessions/s1/fleetGroups/fleet-1', {
    id: 'fleet-1', vesselIds: ['aegis', 'dione'], memberUids: ['gorg-1'],
    memberShipIds: { 'gorg-1': 'aegis' }, privateCoordinates: { aegis: 'secret-local-position' },
  });
  put('sessions/s1/fleetGroups/fleet-2', {
    id: 'fleet-2', vesselIds: ['icebreaker', 'quellon', 'shepherd', 'refinery-124'],
    memberUids: ['other-group-player'], memberShipIds: { 'other-group-player': 'icebreaker' },
    privateCoordinates: { icebreaker: 'secret-remote-position' },
  });

  const view = await getWolfForceFieldChoice.run(request({ sessionId: 's1' }, 'gorg-1'));
  expect(view).toMatchObject({ fleetGroupId: 'fleet-1', hostShipId: 'aegis', targetShipIds: ['aegis', 'dione'] });
  expect(JSON.stringify(view)).not.toContain('icebreaker');
  expect(JSON.stringify(view)).not.toContain('secret-remote-position');
  expect(JSON.stringify(view)).not.toContain('private facilitator text');

  await expect(commitWolfForceFieldChoice.run(request({
    sessionId: 's1', requestId: 'cross-group-force-field', expectedTurn: 1,
    expectedRevision: 4, targetShipId: 'icebreaker',
  }, 'gorg-1'))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(testState.documents.has('sessions/s1/commandReceipts/cross-group-force-field')).toBe(false);
});

it.each([
  ['explicit small-ship destruction marker', { destroyed: true }],
  ['explicit damaged-system marker', { damagedSystemIds: ['force-field-projector'] }],
])('fails closed on an unsupported %s without spending or fabricating a projector use', async (_label, marker) => {
  openForceFieldFixture();
  const session = testState.documents.get('sessions/s1')!;
  const smallShips = session.smallShipStates as Fields;
  const gorgoneion = smallShips.gorgoneion as Fields;
  put('sessions/s1', {
    ...session,
    smallShipStates: { ...smallShips, gorgoneion: { ...gorgoneion, ...marker } },
  });

  await expect(commitWolfForceFieldChoice.run(request({
    sessionId: 's1', requestId: `unsupported-force-field-${_label.replaceAll(' ', '-')}`,
    expectedTurn: 1, expectedRevision: 4, targetShipId: 'aegis',
  }, 'gorg-1'))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(testState.documents.get('sessions/s1/wolfAttackState/current'))
    .toMatchObject({ forceFieldChoice: { status: 'pending' } });
});

it('checks current Captain group authority before replaying an unchanged Force Field request', async () => {
  openForceFieldFixture();
  const payload = { sessionId: 's1', requestId: 'force-field-replay-after-move', expectedTurn: 1,
    expectedRevision: 4, targetShipId: 'aegis' };
  const committed = await commitWolfForceFieldChoice.run(request(payload, 'gorg-1'));
  expect(committed).toMatchObject({ choiceStatus: 'selected', targetShipId: 'aegis' });

  put('sessions/s1/fleetGroups/fleet-1', {
    id: 'fleet-1', vesselIds: [...CORE_WOLF_TARGET_RING], memberUids: ['gorg-1'],
    memberShipIds: { 'gorg-1': 'dione' },
  });
  await expect(commitWolfForceFieldChoice.run(request(payload, 'gorg-1')))
    .rejects.toMatchObject({ code: 'permission-denied' });
});

it.each(['targeting', 'long-range', 'resolved'])('replays a committed Captain choice after automatic %s progression without new writes or dice', async (step) => {
  openForceFieldFixture();
  const payload = { sessionId: 's1', requestId: `force-retry-${step}`, expectedTurn: 1,
    expectedRevision: 4, targetShipId: 'aegis' };
  const committed = await commitWolfForceFieldChoice.run(request(payload, 'gorg-1'));
  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });
  const progressed = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  put('sessions/s1/wolfAttackState/current', { ...progressed, currentStep: step,
    status: step === 'resolved' ? 'resolved' : 'declared', airspaceLocked: step !== 'resolved' });
  const savedDocuments = structuredClone([...testState.documents]);
  const drawCount = entropy.randomInt.mock.calls.length;
  testState.set.mockClear(); testState.update.mockClear(); testState.remove.mockClear();

  expect(await commitWolfForceFieldChoice.run(request(payload, 'gorg-1'))).toEqual(committed);
  expect([...testState.documents]).toEqual(savedDocuments);
  expect(entropy.randomInt).toHaveBeenCalledTimes(drawCount);
  expect(testState.set).not.toHaveBeenCalled(); expect(testState.update).not.toHaveBeenCalled();
  expect(testState.remove).not.toHaveBeenCalled();

  await expect(commitWolfForceFieldChoice.run(request({ ...payload, requestId: `new-${step}` }, 'gorg-1')))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  const group = testState.documents.get('sessions/s1/fleetGroups/fleet-1')!;
  put('sessions/s1/fleetGroups/fleet-1', { ...group, memberShipIds: { 'gorg-1': 'dione' } });
  await expect(commitWolfForceFieldChoice.run(request(payload, 'gorg-1')))
    .rejects.toMatchObject({ code: 'permission-denied' });
});

it('rolls targeting once after the committed Captain choice and continues from the server receipt', async () => {
  openForceFieldFixture();
  const payload = { sessionId: 's1', requestId: 'force-field-auto-targeting', expectedTurn: 1,
    expectedRevision: 4, targetShipId: 'aegis' };
  await commitWolfForceFieldChoice.run(request(payload, 'gorg-1'));

  const chosen = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  expect(chosen).toMatchObject({ currentStep: 'targeting', revision: 5,
    calculationReceipt: { step: 'pre-target-force-field' },
    forceFieldChoice: { status: 'selected', targetShipId: 'aegis' } });
  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });

  const targeted = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  expect(targeted).toMatchObject({ currentStep: 'targeting', revision: 6,
    calculationReceipt: { step: 'targeting', targeting: { ring: CORE_WOLF_TARGET_RING } },
    forceFieldChoice: { status: 'selected', targetShipId: 'aegis' } });
  const targetingReceipt = (targeted.calculationReceipt as Fields).targeting;
  const drawCount = entropy.randomInt.mock.calls.length;
  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });
  const afterProgress = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  expect((afterProgress.calculationReceipt as Fields).targeting).toEqual(targetingReceipt);
  expect(entropy.randomInt).toHaveBeenCalledTimes(drawCount);
});
