import type * as NodeCrypto from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import type { AwayMissionLifecycleCallableReply } from './awayMissionLifecycleCallable';
import type { AwayMissionPublicState } from './awayMissionLifecycleAdapter';

type Data = Record<string, unknown>;
interface MockReference {
  readonly path: string;
  readonly isCollection: boolean;
  readonly id: string | undefined;
  get(): Promise<MockSnapshot | MockQuerySnapshot>;
  where(): MockReference;
  orderBy(): MockReference;
  limit(): MockReference;
}
interface MockSnapshot {
  readonly exists: boolean;
  readonly id: string | undefined;
  readonly ref: MockReference;
  get(field: string): unknown;
  data(): Data | undefined;
}
interface MockQuerySnapshot { readonly docs: readonly MockSnapshot[]; readonly exists: boolean }
interface MockTransaction {
  get(target: MockReference): Promise<MockSnapshot | MockQuerySnapshot>;
  set(target: MockReference, fields: Data): void;
  create(target: MockReference, fields: Data): void;
  update(target: MockReference, fields: Data): void;
}
type ResolvedMissionReply = AwayMissionLifecycleCallableReply & {
  readonly publicState: AwayMissionPublicState & {
    readonly outcomes: NonNullable<AwayMissionPublicState['outcomes']>;
    readonly rewards: NonNullable<AwayMissionPublicState['rewards']>;
  };
};
type MockSessionData = Data & {
  turnPhase: { airspace: { state: string }; teamPhaseEndsAt: string };
  turnState: { phase: string; endsAt: string };
  shipResources: Record<string, { materials: number }>;
  shipDamage: Record<string, { damagedSystemIds: string[]; destroyed: boolean }>;
  shipUpgrades: Record<string, string[]>;
  shuttleDockings: ReturnType<typeof initialShuttleDockingsForRoles>;
  shuttleVisitLog: ReturnType<typeof initialShuttleVisitsForDockings>;
};

const mock = vi.hoisted(() => {
  const documents = new Map<string, Data>();
  const ref = (path: string, isCollection = false): MockReference => ({ path, isCollection, id: path.split('/').at(-1),
    get: async () => read(ref(path, isCollection)), where: () => ref(path, isCollection), orderBy: () => ref(path, isCollection), limit: () => ref(path, isCollection) });
  const snapshot = (path: string): MockSnapshot => {
    const fields = documents.get(path);
    return { exists: fields !== undefined, id: path.split('/').at(-1), ref: ref(path), get: (field: string) => fields?.[field], data: () => fields };
  };
  const writes: { kind: string; path: string; fields: Data }[] = [];
  const read = (target: MockReference): MockSnapshot | MockQuerySnapshot => {
    const children = [...documents.keys()].filter(path => path.startsWith(target.path + '/') && path.slice(target.path.length + 1).indexOf('/') < 0);
    return target.isCollection ? { docs: children.map(snapshot), exists: true } : snapshot(target.path);
  };
  let retryCallbacks = 0;
  let loseAcknowledgement = false;
  const runTransaction = async <T>(work: (tx: MockTransaction) => Promise<T>): Promise<T> => {
    let result!: T;
    let staged: typeof writes = [];
    const tx: MockTransaction = {
      get: async (target: MockReference) => read(target),
      set: (target: MockReference, fields: Data) => staged.push({ kind: 'set', path: target.path, fields }),
      create: (target: MockReference, fields: Data) => staged.push({ kind: 'create', path: target.path, fields }),
      update: (target: MockReference, fields: Data) => staged.push({ kind: 'update', path: target.path, fields }),
    };
    const retries = retryCallbacks; retryCallbacks = 0;
    for (let attempt = 0; attempt <= retries; attempt += 1) { staged = []; result = await work(tx); }
    for (const write of staged) {
      if (write.kind === 'create' && documents.has(write.path)) throw new Error('Duplicate document');
      if (write.kind !== 'update') documents.set(write.path, { ...write.fields });
      else {
        const next = structuredClone(documents.get(write.path) ?? {});
        for (const [path, value] of Object.entries(write.fields)) {
          const parts = path.split('.'); let cursor = next;
          for (const part of parts.slice(0, -1)) { cursor[part] = { ...((cursor[part] ?? {}) as Data) }; cursor = cursor[part] as Data; }
          cursor[parts.at(-1)!] = value;
        }
        documents.set(write.path, next);
      }
    }
    writes.push(...staged);
    if (loseAcknowledgement) { loseAcknowledgement = false; throw new Error('lost acknowledgement'); }
    return result;
  };
  return { documents, writes, ref, snapshot, db: { doc: ref, collection: (path: string) => ref(path, true), runTransaction }, d6: 2,
    retry: (count: number) => { retryCallbacks = count; }, loseAck: () => { loseAcknowledgement = true; },
    resetTransactionFaults: () => { retryCallbacks = 0; loseAcknowledgement = false; } };
});
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mock.db,
  FieldValue: { serverTimestamp: () => 'server-time', delete: () => 'delete-field' },
  Timestamp: class MockTimestamp {
    constructor(private readonly date: Date) {} static fromDate(date: Date) { return new MockTimestamp(date); }
    toDate() { return this.date; }
  },
}));
vi.mock('node:crypto', async original => ({ ...await original<typeof NodeCrypto>(), randomInt: vi.fn((low: number, high?: number) => high ? mock.d6 : 0) }));

import { commitAwayMissionLifecycleCommand, stageWolfAttackPreparation, declareWolfAttack,
  readEndeavourResearchWorkspace, advanceEndeavourResearchTrack, getWolfAttackThreatWindowOptions,
  setWolfAttackWindow, advanceWolfAttackLifecycle, getWolfBoardingSpecialChoice } from './index';
import { missionDeck, missionDeckStateFromCards } from './missionDeck';
import { awayMissionHandId } from './awayMissionCards';
import { organiserSitesForChart } from './starChartLookup';
import { activeVesselIdsForRoles } from './gameSetup';
import { recommendedRoleIds } from './roleConfiguration';
import { scheduledWolfAttackComposition } from './wolfAttackComposition';
import { EXPANDED_WOLF_TARGET_RING, resolveWolfTargeting, wolfCombatRoster } from './wolfCombatMath';
import { resolvedWolfAttackForCarryover } from './wolfAttackCarryover';
import { configuredWolfAttackTargetRing } from './wolfAttackTargetRing';
import { INITIAL_SHIP_SURVIVORS } from './shipPopulation';
import { initialShuttleDockingsForRoles, initialShuttleVisitsForDockings } from './shuttlecraft';
import { initialFighterWingCounts } from './fighterWings';

const roles = [...recommendedRoleIds(8)];
const ships = [...activeVesselIdsForRoles(roles)];
const sessionId = 's1';
const missionId = 'mission-parity';
const missionPath = `sessions/s1/serverState/awayMissions/instances/${missionId}`;
const put = (path: string, fields: Record<string, unknown>) => mock.documents.set(path, fields);
const currentRevision = () => mock.documents.get(missionPath)!.revision as number;
const command = (type: string, fields: Record<string, unknown> = {}, uid = 'alice') => ({ auth: { uid }, data: {
  sessionId, missionId, type, requestId: `${type}-${uid}-${currentRevision()}`, expectedRevision: currentRevision(), ...fields,
  ...(uid === 'gm' ? { instanceId: 'bridge' } : {}),
} }) as CallableRequest<Record<string, unknown>>;
const send = (type: string, fields: Record<string, unknown> = {}, uid = 'alice') => commitAwayMissionLifecycleCommand.run(command(type, fields, uid));

function seed(siteCode: string) {
  const coordinate = Object.entries(organiserSitesForChart('A')).find(([, site]) => site.code === siteCode)![0];
  const roster = [{ uid: 'alice', roleId: 'wing-commander' }, { uid: 'bob', roleId: 'icebreaker-miner' }, { uid: 'scientist', roleId: 'shepherd-scientist' }];
  const bindings = [{ participantUid: 'alice', craftIds: ['starlight'] }, { participantUid: 'bob', craftIds: ['highwall'] }, { participantUid: 'scientist', craftIds: ['endeavour'] }];
  const orderedIds = ['A♥', 'A♦', 'A♣', '10♥', '10♦', '10♣', '9♥', '9♦', '9♣'];
  const ordered = orderedIds.map(id => missionDeck().find(card => card.id === id)!);
  const deck = missionDeckStateFromCards([...ordered, ...missionDeck().filter(card => !orderedIds.includes(card.id))]);
  const initialIds = orderedIds.slice(0, 3);
  const opportunityId = 'parity';
  const session = {
    phase: 'active', currentTurn: 2, setupRevision: 1, playerCount: 8, chartId: 'A', chartSelectionLocked: true, configurationLocked: true,
    expansion: 'base', turnLimit: 6, dioneEnabled: false, capybaraEnabled: false, universalArbourEnabled: false, wolfCultEnabled: false,
    activeRoleIds: roles, activeVesselIds: ships,
    fighterWingCounts: initialFighterWingCounts(),
    turnPhase: { turn: 2, teamPhaseEndsAt: '2099-10-08T12:00:00.000Z', openAirspaceEndsAt: '2099-10-08T12:15:00.000Z', airspace: { state: 'lifted', tickerActive: true, pressAccess: true } },
    turnState: { currentTurn: 2, maxTurn: 6, phase: 'coordination', phaseRevision: 3, startedAt: '2099-10-08T12:00:00.000Z', endsAt: '2099-10-08T12:15:00.000Z' },
    shipResources: Object.fromEntries(ships.map(ship => [ship, { ore: 1, fuel: 0, food: 0, water: 0, materials: 0, securityTeams: 0 }])),
    shipDamage: { 'refinery-124': { damagedSystemIds: ['reactor', 'jump-drive'], destroyed: false } },
    shipUpgrades: {},
  };
  put('sessions/s1', session);
  roster.forEach(({ uid, roleId }) => put(`sessions/s1/players/${uid}`, { role: 'player', connected: true, assignedRoleId: roleId, fleetGroupId: 'fleet-1' }));
  put('sessions/s1/players/gm', { role: 'gm', connected: true, fleetGroupId: 'fleet-1' });
  put('sessions/s1/gmInstances/bridge', { uid: 'gm', connected: true, lastSeenAt: Timestamp.fromDate(new Date()) });
  put('sessions/s1/fleetGroups/fleet-1', { id: 'fleet-1', vesselIds: ships, memberUids: [...roster.map(({ uid }) => uid), 'gm'] });
  put('sessions/s1/serverState/navigation', { revision: 2, shipGalacticCoordinates: Object.fromEntries(ships.map(ship => [ship, coordinate])), shipNavigationLogs: {}, pursuitGroups: { 'fleet-1': 2 } });
  put('sessions/s1/serverState/missionDeck', { ...deck, dealtCount: 3 });
  put(missionPath, { schemaVersion: 1, phase: 'awaiting-card-selection', revision: 0, discardedParticipantUids: [], discardedCardIds: [],
    missionId, requestId: 'start-parity', actorUid: 'gm', groupId: 'fleet-1', opportunityId, chart: 'A', coordinate, siteCode,
    sourceCycle: 2, missionLeaderUid: 'alice', missionLeaderRoleId: 'wing-commander', participantSnapshots: roster,
    participantCrafts: bindings, availableCarrierCraftIds: ['starlight', 'highwall', 'endeavour'],
    handIds: roster.map(({ uid }) => awayMissionHandId(missionId, uid)), cardIds: initialIds, dealtFrom: 0, dealtThrough: 3 });
  put(`sessions/s1/missionStartSnapshots/${opportunityId}`, { type: 'away-mission-start-snapshot', schemaVersion: 1, sessionId, missionId, opportunityId,
    requestId: 'start-parity', groupId: 'fleet-1', chart: 'A', coordinate, siteCode, sourceCycle: 2, missionLeader: { uid: 'alice', roleId: 'wing-commander' },
    stateDelta: { missionDeckDealtCountBefore: 0, missionDeckDealtCountAfter: 3 }, revisions: { missionDeck: { before: 0, after: 3 } },
    inputs: { participantSnapshots: roster, participantCrafts: bindings, availableCarrierCraftIds: ['starlight', 'highwall', 'endeavour'], missionLeaderUid: 'alice' } });
  roster.forEach(({ uid }, index) => {
    const handId = awayMissionHandId(missionId, uid); const card = ordered[index]!;
    put(`sessions/s1/awayMissionHands/${handId}`, { type: 'away-mission-hand', sessionId, handId, missionId, participantUid: uid,
      cardId: card.id, rank: card.rank, suit: card.suit, value: card.value });
    put(`sessions/s1/awayMissionHandPointers/${handId}`, { type: 'away-mission-hand-pointer', sessionId, handId, missionId, participantUid: uid,
      groupId: 'fleet-1', chart: 'A', coordinate, siteCode, sourceCycle: 2, participantCount: 3, missionLeaderUid: 'alice', missionLeaderRoleId: 'wing-commander',
      phase: 'awaiting-card-selection', revision: 0, discarded: false });
  });
  return coordinate;
}
async function resolve(site: string, opportunity: string, contributors = 3, setup?: () => Promise<void> | void) {
  seed(site);
  await setup?.();
  const uids = ['alice', 'bob', 'scientist']; const initialIds = ['A♥', 'A♦', 'A♣']; const extraIds = ['10♥', '10♦', '10♣'];
  for (const uid of uids.slice(0, contributors)) await send('distributeExtraCard', { participantUid: uid, opportunityId: opportunity });
  await send('openDiscards', {}, 'gm');
  for (const [index, uid] of uids.entries()) await send('discardCard', { cardId: initialIds[index] }, uid);
  let reply!: AwayMissionLifecycleCallableReply;
  for (const [index, uid] of uids.entries()) reply = await send('assignCards', { placements: index < contributors ? [{ cardId: extraIds[index], opportunityId: opportunity }] : [] }, uid);
  expect(reply.publicState.status).toBe('resolved');
  return reply as ResolvedMissionReply;
}
beforeEach(() => { mock.documents.clear(); mock.writes.length = 0; mock.d6 = 2; mock.resetTransactionFaults(); });

it.each(['fresh reply', 'alice', 'bob', 'scientist'] as const)(
  'redacts failed K difficulty in the actual %s resolution consumer without changing protected arithmetic', async surface => {
    mock.d6 = 6;
    const reply = await resolve('K', 'K-1', 1);
    const protectedRecord = mock.documents.get(missionPath)!.lifecycleRecord as {
      outcomes: AwayMissionPublicState['outcomes']; rewards: AwayMissionPublicState['rewards'];
    };
    expect(protectedRecord.outcomes).toEqual([expect.objectContaining({ opportunityId: 'K-1',
      contributorCount: 1, total: 20, bonusTotal: 0, difficulty: 30, criticalThreshold: 40, outcome: 'failure' })]);
    expect(protectedRecord.rewards).toEqual([expect.objectContaining({ opportunityId: 'K-1', branch: 'none', resources: {}, effects: [] })]);
    let state = reply.publicState;
    if (surface !== 'fresh reply') {
      const snapshot = await mock.ref(`sessions/s1/awayMissionHandPointers/${awayMissionHandId(missionId, surface)}`).get();
      expect('data' in snapshot && snapshot.exists).toBe(true);
      state = ('data' in snapshot ? snapshot.data()?.lifecyclePublicState : undefined) as AwayMissionPublicState;
    }
    expect(state.outcomes).toEqual([expect.objectContaining({ opportunityId: 'K-1',
      contributorCount: 1, total: 20, bonusTotal: 0, difficulty: null, criticalThreshold: null, outcome: 'failure' })]);
    expect(state.rewards).toEqual([expect.objectContaining({ opportunityId: 'K-1', branch: 'none', resources: {}, effects: [] })]);
    expect(JSON.stringify(state)).not.toMatch(/secretD6|cardId|cardTotal|bonusBreakdown/);
  });
it('retains successful K reward quantities and exact replay while redacting its public thresholds', async () => {
  mock.d6 = 3;
  const reply = await resolve('K', 'K-1', 1);
  const record = mock.documents.get(missionPath)!.lifecycleRecord as { outcomes: AwayMissionPublicState['outcomes'] };
  expect(record.outcomes).toEqual([expect.objectContaining({ contributorCount: 1, total: 20,
    difficulty: 15, criticalThreshold: 25, outcome: 'success' })]);
  expect(reply.publicState.rewards).toEqual([expect.objectContaining({ opportunityId: 'K-1',
    branch: 'success', resources: { food: 6, water: 6, fuel: 6, materials: 3 } })]);
  const request = { auth: { uid: 'scientist' }, data: { sessionId, missionId, type: 'assignCards',
    requestId: reply.requestId, expectedRevision: reply.revision - 1, placements: [] } } as CallableRequest<Record<string, unknown>>;
  const writes = mock.writes.length;
  const replay = await commitAwayMissionLifecycleCommand.run(request);
  expect(replay.status).toBe('replayed');
  expect(replay.publicState.rewards).toEqual(reply.publicState.rewards);
  expect(mock.writes).toHaveLength(writes);
  for (const state of [reply.publicState, replay.publicState]) expect(state.outcomes)
    .toEqual([expect.objectContaining({ total: 20, difficulty: null, criticalThreshold: null, outcome: 'success' })]);
});
it('preserves another site\'s public numeric difficulty and protected resolution unchanged', async () => {
  const reply = await resolve('D', 'D-1', 1);
  expect(reply.publicState.outcomes.find(result => result.opportunityId === 'D-1'))
    .toMatchObject({ contributorCount: 1, total: 20, difficulty: 14, criticalThreshold: 20, outcome: 'critical-success' });
  const record = mock.documents.get(missionPath)!.lifecycleRecord as { outcomes: AwayMissionPublicState['outcomes'] };
  expect(record.outcomes?.find(result => result.opportunityId === 'D-1'))
    .toMatchObject({ difficulty: 14, criticalThreshold: 20, outcome: 'critical-success' });
});

async function stageK() {
  mock.d6 = 3;
  const resolved = await resolve('K', 'K-1', 1);
  expect(resolved.publicState.outcomes.find((result) => result.opportunityId === 'K-1'))
    .toMatchObject({ contributorCount: 1, outcome: 'success' });
  return stageWolfAttackPreparation.run({ auth: { uid: 'gm' }, data: { sessionId: 's1', instanceId: 'bridge',
    requestId: 'prepare-k-parity', expectedRevision: 0, turn: 2, shipIds: Array<string>(15).fill('wolf-fighter-wing'),
    targetMode: 'pre-rolled', targetAssignments: [], modifiers: [], notes: '' } } as CallableRequest<Record<string, unknown>>);
}
it('carries the real noncritical K resolution into the ordinary private attack preparation', async () => {
  expect(await stageK()).toMatchObject({ compositionKind: 'K', targetGroupId: 'fleet-1' });
});
it('declares the source-bound immediate K attack through the normal registered declaration', async () => {
  const prepared = await stageK();
  const request = { auth: { uid: 'gm' }, data: { sessionId: 's1', instanceId: 'bridge', requestId: 'declare-k-parity',
    expectedRevision: prepared.revision } } as CallableRequest<Record<string, unknown>>;
  await expect(declareWolfAttack.run(request)).resolves.toMatchObject({ status: 'committed', type: 'wolf-attack-declaration', turn: 2 });
  expect(mock.documents.get('sessions/s1/wolfAttackState/current')).toMatchObject({ threatSiteCode: 'K',
    threatSourceId: 'mission-mission-parity', targetGroupId: 'fleet-1' });
  const writes = mock.writes.length;
  expect((await declareWolfAttack.run(request)).status).toBe('committed');
  expect(mock.writes).toHaveLength(writes);
  expect(mock.documents.get('sessions/s1/wolfAttackPressure/mission-mission-parity')).toMatchObject({ status: 'declared' });
});

it.each([['C', 'C-2'], ['H', 'H-2'], ['H', 'H-3'], ['F', 'F-3'], ['G', 'G-3'], ['L', 'L-3'], ['M', 'M-3']])(
  'keeps %s %s in leader custody until its printed targets are selected', async (site, opportunity) => {
    const reply = await resolve(site, opportunity);
    expect(reply.publicState.rewards.find((reward) => reward.opportunityId === opportunity)!.branch).not.toBe('none');
    const writes = mock.writes.length;
    await expect(send('dropOff', { shipId: 'aegis' })).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mock.writes).toHaveLength(writes);
    expect(mock.documents.get(missionPath)!.status).toBe('resolved');
  });

it('applies the fixed I3 ECM and Jump Drive unlock through the actual automatic resolver once', async () => {
  await resolve('I', 'I-3');
  expect(mock.documents.get('sessions/s1/serverState/endeavourResearch')).toMatchObject({ 'ecm-device': 4, 'jump-drive': 4 });
  expect(mock.documents.get('sessions/s1/serverState/endeavourResearchCadence')).toEqual({ cycle: 2, revision: 1, choices: [] });
});
it('continues the actual normal research reader and Team writer after a resolved C2 reward without consuming a choice', async () => {
  const scientist = { auth: { uid: 'scientist' }, data: { sessionId: 's1' } } as CallableRequest<Record<string, unknown>>;
  await resolve('C', 'C-2', 3, async () => {
    mock.documents.get('sessions/s1')!.shuttleControl = { endeavour: { shuttleId: 'endeavour', ownerRoleId: 'shepherd-scientist',
      ownerUid: 'scientist', holderUid: 'scientist', revision: 0 } };
    expect(await readEndeavourResearchWorkspace.run(scientist)).toMatchObject({ researchRevision: 0, progress: {}, cadence: { choices: [] } });
  });
  await send('chooseRewardTargets', { opportunityId: 'C-2', choice: { kind: 'research', trackIds: ['reactor'] } });
  await send('dropOff', { shipId: 'aegis' });
  expect(await readEndeavourResearchWorkspace.run(scientist)).toMatchObject({ researchRevision: 1, progress: { reactor: 1 },
    cadence: { choices: [] }, tracks: expect.arrayContaining([expect.objectContaining({ trackId: 'reactor', crossedBoxes: 2, currentMaterialCost: 7 })]) });
  const session = mock.documents.get('sessions/s1')! as MockSessionData;
  session.turnPhase.airspace.state = 'restricted'; session.turnState.phase = 'team';
  session.turnState.endsAt = session.turnPhase.teamPhaseEndsAt;
  await expect(advanceEndeavourResearchTrack.run({ auth: scientist.auth, data: { sessionId: 's1', requestId: 'research-after-c2',
    expectedControlRevision: 0, expectedResearchRevision: 1, expectedCycle: 2, trackId: 'reactor', funding: 'standard' } } as CallableRequest<Record<string, unknown>>))
    .resolves.toMatchObject({ status: 'committed', researchRevision: 2, progress: { reactor: 2 },
      cadence: { choices: [{ trackId: 'reactor', funding: 'standard', oreCost: 0 }] } });
});
it.each([
  ['C', 'C-2', ['reactor'], { reactor: 1 }],
  ['H', 'H-2', ['reactor', 'reactor'], { reactor: 2 }],
  ['H', 'H-3', ['jump-drive'], { 'jump-drive': 4 }],
])('settles %s %s selected research once without charging a Team choice', async (site, opportunity, trackIds, progress) => {
  const resolved = await resolve(site as string, opportunity as string);
  expect(resolved.privateState?.rewardOptions).toBeUndefined(); // final actor is the other participant
  const choice = { kind: 'research', trackIds };
  const foreign = command('chooseRewardTargets', { opportunityId: opportunity, choice }, 'bob');
  await expect(commitAwayMissionLifecycleCommand.run(foreign)).rejects.toMatchObject({ code: 'permission-denied' });
  await send('chooseRewardTargets', { opportunityId: opportunity, choice });
  const request = command('dropOff', { shipId: 'aegis' });
  mock.retry(1); mock.loseAck();
  await expect(commitAwayMissionLifecycleCommand.run(request)).rejects.toThrow('lost acknowledgement');
  expect(mock.documents.get('sessions/s1/serverState/endeavourResearch')).toEqual(progress);
  expect(mock.documents.get('sessions/s1/serverState/endeavourResearchCadence')).toEqual({ cycle: 2, revision: 1, choices: [] });
  const writes = mock.writes.length;
  expect((await commitAwayMissionLifecycleCommand.run(request)).status).toBe('replayed');
  expect(mock.writes).toHaveLength(writes);
  expect((mock.documents.get('sessions/s1') as MockSessionData).shipResources.aegis.materials).toBe(0);
});
it.each([
  ['F', 'F-3', 'upgrade', [{ shipId: 'refinery-124', systemId: 'fuel-refinery' }]],
  ['F', 'F-3', 'repair', [{ shipId: 'refinery-124', systemId: 'reactor' }, { shipId: 'refinery-124', systemId: 'jump-drive' }]],
  ['G', 'G-3', 'upgrade', [{ shipId: 'aegis', systemId: 'reactor' }]],
  ['L', 'L-3', 'upgrade', [{ shipId: 'aegis', systemId: 'point-defence-lasers' }, { shipId: 'aegis', systemId: 'missile-launchers' }]],
  ['M', 'M-3', 'upgrade', [{ shipId: 'aegis', systemId: 'point-defence-lasers' }, { shipId: 'aegis', systemId: 'missile-launchers' }, { shipId: 'aegis', systemId: 'command-and-control' }]],
])('settles %s %s %s console targets once with no ordinary purchase cost', async (site, opportunity, action, targets) => {
  await resolve(site as string, opportunity as string);
  const selected: AwayMissionLifecycleCallableReply = await send('chooseRewardTargets', {
    opportunityId: opportunity, choice: { kind: 'consoles', action, targets } });
  const request = command('dropOff', { shipId: 'aegis' });
  mock.retry(1);
  const reply = await commitAwayMissionLifecycleCommand.run(request);
  expect(reply.publicState.status).toBe('complete');
  const session = mock.documents.get('sessions/s1')! as MockSessionData;
  for (const target of targets as { shipId: string; systemId: string }[]) {
    if (action === 'upgrade') expect(session.shipUpgrades[target.shipId]).toContain(target.systemId);
    else expect(session.shipDamage[target.shipId].damagedSystemIds).not.toContain(target.systemId);
  }
  expect(session.shipResources.aegis.materials).toBe(site === 'G' ? 6 : 0);
  expect(session.shipResources['refinery-124'].materials).toBe(0);
  const writes = mock.writes.length;
  expect((await commitAwayMissionLifecycleCommand.run(request)).status).toBe('replayed');
  expect(mock.writes).toHaveLength(writes);
  const expectedEffects = site === 'F'
    ? [{ kind: 'upgradeOrRepairConsoles', target: 'refinery-124',
      choices: [{ action: 'upgrade', amount: 1 }, { action: 'repair', amount: 2 }], selection: 'choice' }]
    : [{ kind: 'upgradeConsoles', target: site === 'G' ? 'any' : 'weapon', amount: site === 'G' ? 1 : site === 'L' ? 2 : 3 }];
  const selection = [{ opportunityId: opportunity, choice: { kind: 'consoles', action, targets } }];
  expect(selected.privateState?.rewardChoices).toEqual(selection);
  expect(selected.privateState?.rewardOptions).toEqual(expect.arrayContaining([
    expect.objectContaining({ opportunityId: opportunity, consoleTargets: expect.arrayContaining(
      (targets as { shipId: string; systemId: string }[]).map(target => expect.objectContaining(target)),
    ) }),
  ]));
  const replayReply: AwayMissionLifecycleCallableReply = await commitAwayMissionLifecycleCommand.run(request);
  expect(replayReply.privateState?.rewardChoices).toEqual(selection);
  expect(mock.writes).toHaveLength(writes);
  const bobHand = mock.documents.get(`sessions/s1/awayMissionHands/${awayMissionHandId(missionId, 'bob')}`)!;
  expect(bobHand.lifecyclePrivateState).not.toHaveProperty('rewardChoices');
  expect(bobHand.lifecyclePrivateState).not.toHaveProperty('rewardOptions');
  for (const publicState of [reply.publicState, replayReply.publicState]) {
    expect(Object.keys(publicState).sort()).toEqual(['missionId', 'groupId', 'siteCode', 'revision', 'phase', 'status',
      'overrun', 'missionLeaderUid', 'participantCount', 'opportunities', 'requestCounts', 'outcomes', 'rewards',
      'specialRewards', 'custody', 'legalDropOffShipIds'].sort());
    const rewardIndex = publicState.rewards!.findIndex(reward => reward.opportunityId === opportunity);
    expect(publicState.rewards![rewardIndex].effects).toEqual(expectedEffects);
    const staticF3EffectPath = site === 'F' ? `rewards.${rewardIndex}.effects.0` : null;
    const excludedKeys = new Set(['rewardChoices', 'rewardOptions', 'choice', 'trackIds', 'targets',
      'consoleTargets', 'consoleActions', 'systemId', 'canUpgrade', 'canRepair', 'cardId', 'cardIds', 'cards']);
    const assertPublicFields = (value: unknown, path = ''): void => {
      if (Array.isArray(value)) { value.forEach((entry, index) => assertPublicFields(entry, `${path}.${index}`)); return; }
      if (typeof value === 'string') expect(value).not.toMatch(/(?:A|4|5|6|7|8|9|10|J|Q|K)[♥♦♣]/);
      if (!value || typeof value !== 'object') return;
      for (const [key, nested] of Object.entries(value)) {
        expect(excludedKeys.has(key)).toBe(false);
        if (key === 'choices' || key === 'selection') expect(path).toBe(staticF3EffectPath);
        assertPublicFields(nested, path ? `${path}.${key}` : key);
      }
    };
    assertPublicFields(publicState);
  }
});
it('rechecks a console that became ineligible after selection before any delivery write', async () => {
  await resolve('F', 'F-3');
  await send('chooseRewardTargets', { opportunityId: 'F-3', choice: { kind: 'consoles', action: 'upgrade',
    targets: [{ shipId: 'refinery-124', systemId: 'fuel-refinery' }] } });
  (mock.documents.get('sessions/s1')! as MockSessionData).shipUpgrades['refinery-124'] = ['fuel-refinery'];
  const writes = mock.writes.length;
  await expect(send('dropOff', { shipId: 'aegis' })).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.writes).toHaveLength(writes);
  expect(mock.documents.get(missionPath)!.status).toBe('resolved');
});

it.each(['I-1', 'I-2'])('grants %s to the authoritative fleet in protected navigation at resolution', async opportunity => {
  await resolve('I', opportunity);
  const benefits = mock.documents.get('sessions/s1/serverState/navigation')!.missionNebulaBenefitsByShip as Record<string, Data>;
  expect(Object.keys(benefits ?? {}).sort()).toEqual([...ships].sort());
  expect(benefits.aegis).toMatchObject({ missionId, suppressMaintenanceDamage: opportunity === 'I-1', freeExitFuel: opportunity === 'I-2' });
  expect(mock.documents.get('sessions/s1')).not.toHaveProperty('missionNebulaBenefitsByShip');
});
it.each([[6, 1, true, 'failure'], [3, 1, true, 'success'], [2, 1, false, 'critical-success'], [2, 3, false, 'critical-success'], [2, 0, false, 'automatic-failure']] as const)(
  'schedules K only for a resolved noncritical attempt (d6=%s, contributors=%s)', async (d6, contributors, expected, outcome) => {
    mock.d6 = d6;
    const resolved = await resolve('K', 'K-1', contributors);
    expect(resolved.publicState.outcomes.find((result) => result.opportunityId === 'K-1'))
      .toMatchObject({ contributorCount: contributors, outcome });
    const pressure = mock.documents.get(`sessions/s1/wolfAttackPressure/mission-${missionId}`);
    if (expected) {
      expect(pressure).toMatchObject({ status: 'scheduled', arrivalTiming: 'immediate', groupId: 'fleet-1', siteCode: 'K', missionId });
      expect(mock.documents.get('sessions/s1/wolfAttackWindow/current')).toMatchObject({ status: 'due', turn: 2, targetGroupId: 'fleet-1' });
      expect(JSON.stringify(pressure)).not.toMatch(/secretD6|difficulty|cardId|cardTotal/);
    } else expect(pressure).toBeUndefined();
  });

it('retains queued K pressure while another real attack window remains live', async () => {
  mock.d6 = 3;
  const prior = { status: 'due', turn: 2, revision: 4, targetGroupId: 'fleet-1' };
  await resolve('K', 'K-1', 1, () => {
    put('sessions/s1/wolfAttackWindow/current', prior);
    put('sessions/s1/wolfAttackState/current', { type: 'wolf-attack-state', status: 'declared', currentStep: 'targeting' });
  });
  expect(mock.documents.get('sessions/s1/wolfAttackWindow/current')).toEqual(prior);
  expect(mock.documents.get(`sessions/s1/wolfAttackPressure/mission-${missionId}`)).toMatchObject({ status: 'scheduled', siteCode: 'K' });
});

it('reads only the live protected K attempt and revalidates it before retaining its due window', async () => {
  mock.d6 = 3;
  await resolve('K', 'K-1', 1);
  const gm = { auth: { uid: 'gm' }, data: { sessionId, instanceId: 'bridge', targetGroupId: 'fleet-1' } } as CallableRequest<Record<string, unknown>>;
  const options = await getWolfAttackThreatWindowOptions.run(gm);
  expect(options.sources).toEqual([{ siteCode: 'K', sourceId: `mission-${missionId}`, sourceCycle: 2,
    coordinate: mock.documents.get(missionPath)!.coordinate }]);
  const request = { auth: gm.auth, data: { sessionId, instanceId: 'bridge', requestId: 'retain-k-window', expectedRevision: 1,
    status: 'due', targetGroupId: 'fleet-1', threatSiteCode: 'K', threatSourceId: `mission-${missionId}` } } as CallableRequest<Record<string, unknown>>;
  expect(await setWolfAttackWindow.run(request)).toMatchObject({ threatSiteCode: 'K', revision: 1 });
  const writes = mock.writes.length;
  expect(await setWolfAttackWindow.run(request)).toMatchObject({ threatSiteCode: 'K', revision: 1 });
  expect(mock.writes).toHaveLength(writes);
  mock.documents.get(`sessions/s1/wolfAttackPressure/mission-${missionId}`)!.resolutionRequestId = 'foreign-attempt';
  expect((await getWolfAttackThreatWindowOptions.run(gm)).sources).toEqual([]);
  await expect(setWolfAttackWindow.run({ ...request, data: { ...request.data, requestId: 'retain-foreign-k-window' } }))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.writes).toHaveLength(writes);
});

it('accepts the actual resolved noncritical K source through the existing window setter', async () => {
  mock.d6 = 3;
  const resolved = await resolve('K', 'K-1', 1);
  expect(resolved.publicState.outcomes.find((result) => result.opportunityId === 'K-1'))
    .toMatchObject({ outcome: 'success', contributorCount: 1 });
  await expect(setWolfAttackWindow.run({ auth: { uid: 'gm' }, data: { sessionId, instanceId: 'bridge',
    requestId: 'current-k-window-source', expectedRevision: 1, status: 'due', targetGroupId: 'fleet-1',
    threatSiteCode: 'K', threatSourceId: `mission-${missionId}` } } as CallableRequest<Record<string, unknown>>))
    .resolves.toMatchObject({ status: 'due', threatSiteCode: 'K', threatSourceId: `mission-${missionId}`, revision: 1 });
});

it('binds the real queued K attempt to actual parent finalization and the next same-cycle declaration', async () => {
  mock.d6 = 3;
  const parentId = 'wolf-attack-parent-k';
  const shipIds = Array<string>(15).fill('wolf-fighter-wing');
  await resolve('K', 'K-1', 1, () => {
    const session = mock.documents.get('sessions/s1')! as MockSessionData;
    session.turnPhase.airspace.state = 'restricted';
    session.turnState.phase = 'team';
    session.turnState.endsAt = session.turnPhase.teamPhaseEndsAt;
    session.shipSurvivors = Object.fromEntries(ships.map(shipId => [shipId, INITIAL_SHIP_SURVIVORS[shipId]]));
    session.shipDamage = Object.fromEntries(ships.map(shipId => [shipId, { damagedSystemIds: [], destroyed: false }]));
    session.shuttleDockings = [...initialShuttleDockingsForRoles(roles),
      { shuttleId: 'wobbly', shipId: 'quellon', dockedAt: 'SESSION START' },
      { shuttleId: 'ally', shipId: 'shepherd', dockedAt: 'SESSION START' }];
    session.shuttleVisitLog = initialShuttleVisitsForDockings(session.shuttleDockings);
    const targetRing = configuredWolfAttackTargetRing(ships, { playerCount: 8, expansion: 'base' });
    const targeting = resolveWolfTargeting(scheduledWolfAttackComposition(2, shipIds), {}, targetRing, () => 0);
    const combatRoster = wolfCombatRoster(targeting);
    const targetSnapshot = combatRoster.map(({ instanceId, target }) => ({ instanceId, target }));
    const emptyRange = (range: string) => ({ range, targetSnapshot, dice: [], assignments: [], targetShifts: [], unusedHitsByAction: [],
      damageByInstance: {}, destroyedInstanceIds: [], destructionDamageByTarget: Object.fromEntries(EXPANDED_WOLF_TARGET_RING.map(shipId => [shipId, 0])) });
    put('sessions/s1/wolfAttackWindow/current', { status: 'resolved', turn: 2, revision: 7, targetGroupId: 'fleet-1' });
    put('sessions/s1/wolfAttackState/current', { type: 'wolf-attack-state', status: 'declared', currentStep: 'boarding',
      revision: 10, turn: 2, attackId: parentId, announcementId: parentId, attackNumber: 1,
      airspaceLocked: true, deadlineAt: '2099-10-08T12:15:00.000Z',
      preparation: { turn: 2, revision: 1, shipIds, targetMode: 'pre-rolled', targetAssignments: [], modifiers: [], notes: '' },
      calculationReceipt: { type: 'wolf-combat-calculation-stage', version: 1, turn: 2, step: 'targeting', targeting },
      combatRoster, rangeReceipts: ['long-range', 'medium-range', 'short-range'].map(emptyRange),
      rangeDecisions: Object.fromEntries(['long-range', 'medium-range', 'short-range'].map(range => [range, { status: 'committed' }])),
      boardingDefenceChoices: {} });
  });
  const unfinished = mock.documents.get('sessions/s1/wolfAttackState/current')!;
  expect(unfinished.status).toBe('declared');
  expect(await getWolfBoardingSpecialChoice.run({ auth: { uid: 'alice' }, data: { sessionId } } as CallableRequest<Record<string, unknown>>))
    .toMatchObject({ type: 'wolf-boarding-special-choice-unavailable', reason: 'no-special-choice' });
  for (let step = 0; step < 6 && mock.documents.get('sessions/s1/wolfAttackState/current')!.status !== 'resolved'; step += 1) {
    await advanceWolfAttackLifecycle.run({ params: { sessionId } });
  }
  const parent = mock.documents.get('sessions/s1/wolfAttackState/current')!;
  const audit = mock.documents.get('sessions/s1/wolfAttackState/current/audit/wolf-finalized-2')!;
  expect(parent.resolutionBlocker).toBeUndefined();
  expect(parent).toMatchObject({ status: 'resolved', currentStep: 'resolved', attackId: parentId, airspaceLocked: false });
  expect(resolvedWolfAttackForCarryover(parent, audit, 3)).toMatchObject({ attackId: parentId, attackNumber: 1 });
  expect(mock.documents.get(`sessions/s1/wolfAttackPressure/mission-${missionId}`)).toMatchObject({ status: 'scheduled', siteCode: 'K' });
  const windowRequest = { auth: { uid: 'gm' }, data: { sessionId, instanceId: 'bridge', requestId: 'queued-k-after-finalization',
    expectedRevision: mock.documents.get('sessions/s1/wolfAttackWindow/current')!.revision, status: 'due', targetGroupId: 'fleet-1',
    threatSiteCode: 'K', threatSourceId: `mission-${missionId}` } } as CallableRequest<Record<string, unknown>>;
  put('sessions/s1/wolfAttackState/current', unfinished);
  await expect(setWolfAttackWindow.run({ ...windowRequest, data: { ...windowRequest.data, requestId: 'unfinalized-k-parent' } }))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  put('sessions/s1/wolfAttackState/current', parent);
  expect(await setWolfAttackWindow.run(windowRequest)).toMatchObject({ status: 'due', threatSiteCode: 'K' });
  const prepared = await stageWolfAttackPreparation.run({ auth: windowRequest.auth, data: { sessionId, instanceId: 'bridge',
    requestId: 'queued-k-preparation', expectedRevision: 0, turn: 2, shipIds, targetMode: 'pre-rolled', targetAssignments: [], modifiers: [], notes: '' } } as CallableRequest<Record<string, unknown>>);
  await expect(declareWolfAttack.run({ auth: windowRequest.auth, data: { sessionId, instanceId: 'bridge', requestId: 'queued-k-declaration',
    expectedRevision: prepared.revision } } as CallableRequest<Record<string, unknown>>))
    .resolves.toMatchObject({ status: 'committed', type: 'wolf-attack-declaration', turn: 2 });
  expect(mock.documents.get('sessions/s1/wolfAttackState/current')).toMatchObject({ attackNumber: 2, previousAttackId: parentId,
    threatSiteCode: 'K', threatSourceId: `mission-${missionId}` });
});
