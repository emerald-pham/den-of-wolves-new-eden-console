import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CallableRequest } from 'firebase-functions/v2/https';
import type * as FirestoreModule from '@/lib/firestore';
import { legacyFailedKProjectionFixture } from '../../tests/fixtures/legacyFailedKProjection';
import { missionDeck } from '../../functions/src/missionDeck';
import { useSessionStore } from '@/store/useSessionStore';

type Data = Record<string, unknown>;
type Reference = { path: string; id: string; isCollection: boolean };
type Snapshot = { id: string; exists: boolean; get(field: string): unknown; data(): Data | undefined };
type Write = { path: string; fields: Data; kind: 'set' | 'create' | 'update' };
const mock = vi.hoisted(() => ({ documents: new Map<string, Data>(), writes: [] as Write[], calls: [] as Data[],
  uid: 'gm', lossStep: '', staleOnce: false, alterReply: undefined as ((value: unknown) => unknown) | undefined,
  afterStep: undefined as ((step: string) => void) | undefined,
  invoke: undefined as ((payload: Data) => Promise<unknown>) | undefined, start: vi.fn() }));
const reference = (path: string, isCollection = false): Reference => ({ path, id: path.split('/').at(-1)!, isCollection });
const snapshot = (path: string): Snapshot => ({ id: path.split('/').at(-1)!, exists: mock.documents.has(path),
  get: field => mock.documents.get(path)?.[field], data: () => mock.documents.get(path) });
const database = {
  doc: (path: string) => reference(path), collection: (path: string) => reference(path, true),
  runTransaction: async <T,>(work: (tx: unknown) => Promise<T>): Promise<T> => {
    const writes: Write[] = [];
    const result = await work({
      get: async (ref: Reference) => ref.isCollection ? { docs: [...mock.documents.keys()]
        .filter(path => path.startsWith(ref.path + '/') && !path.slice(ref.path.length + 1).includes('/')).map(snapshot) } : snapshot(ref.path),
      set: (ref: Reference, fields: Data) => writes.push({ path: ref.path, fields, kind: 'set' }),
      create: (ref: Reference, fields: Data) => writes.push({ path: ref.path, fields, kind: 'create' }),
      update: (ref: Reference, fields: Data) => writes.push({ path: ref.path, fields, kind: 'update' }),
    });
    for (const write of writes) {
      if (write.kind === 'create' && mock.documents.has(write.path)) throw new Error('Duplicate fixture document.');
      if (write.kind !== 'update') mock.documents.set(write.path, { ...write.fields });
      else {
        const record = { ...mock.documents.get(write.path) };
        for (const [key, value] of Object.entries(write.fields)) {
          const parts = key.split('.'); let cursor = record;
          for (const part of parts.slice(0, -1)) { cursor[part] = { ...(cursor[part] as Data) }; cursor = cursor[part] as Data; }
          cursor[parts.at(-1)!] = value;
        }
        mock.documents.set(write.path, record);
      }
    }
    mock.writes.push(...writes); return result;
  },
};
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => database,
  FieldValue: { serverTimestamp: () => 'server-time', delete: () => 'delete-field' },
  Timestamp: class { static fromDate(date: Date) { return { toDate: () => date }; } },
}));
vi.mock('@/lib/firebase', () => ({ auth: () => ({ currentUser: { uid: mock.uid } }), functions: () => ({}), app: () => ({ name: 'controlled-k-preparation' }) }));
vi.mock('firebase/auth', () => ({ onAuthStateChanged: (_auth: unknown, next: (user: { uid: string }) => void) => { next({ uid: mock.uid }); return vi.fn(); } }));
vi.mock('firebase/functions', () => ({ httpsCallable: (_functions: unknown, name: string) => async (payload: Data) => {
  expect(name).toBe('repairAwayMissionProjectionPrivacy'); mock.calls.push({ ...payload });
  const data = await mock.invoke!(payload);
  if (mock.afterStep) mock.afterStep(String(payload.step));
  if (mock.lossStep === payload.step) { mock.lossStep = ''; throw new Error('lost acknowledgement'); }
  return { data: mock.alterReply ? mock.alterReply(data) : data };
} }));
vi.mock('@/lib/firestore', async original => ({ ...await original<typeof FirestoreModule>(),
  subscribeGmMissionOpportunities: (_id: string, next: (data: unknown[]) => void) => { next([opportunity]); return vi.fn(); },
  subscribeGmMissionStartSnapshots: (_id: string, next: (data: unknown[]) => void) => { next([]); return vi.fn(); },
}));
vi.mock('@/lib/sessionService', () => ({ startAwayMission: mock.start }));

import { repairAwayMissionProjectionPrivacy } from '../../functions/src/index';
import { sessionFrom } from '@/lib/firestore';
import AwayMissionStartPanel from './AwayMissionStartPanel';

const opportunity = { id: 'new-site', groupId: 'fleet-1', chart: 'A', coordinate: '5143', siteCode: 'L', sourceShipId: 'aegis', sourceTransitionId: 'jump-1', sourceCycle: 2 };
function seed() {
  const session = sessionFrom('s1', { name: 'Connected preparation table', phase: 'active', currentTurn: 2, playerCount: 8,
    chartId: 'A', chartSelectionLocked: true, setupRevision: 1, activeRoleIds: ['wing-commander'],
    turnPhase: { turn: 2, teamPhaseEndsAt: '2099-10-09T00:00:00.000Z', openAirspaceEndsAt: '2099-10-09T00:15:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true } },
    turnState: { currentTurn: 2, maxTurn: 6, phase: 'coordination', phaseRevision: 3,
      startedAt: '2099-10-09T00:00:00.000Z', endsAt: '2099-10-09T00:15:00.000Z' } });
  useSessionStore.setState({ session, me: { uid: 'gm', sessionId: 's1', role: 'gm', displayName: 'Facilitator',
    connected: true, seatId: null, joinedAt: '2026-10-09T00:00:00.000Z', connectionGeneration: 4 },
    gmInstance: { id: 'bridge', sessionId: 's1', uid: 'gm', name: 'Bridge', deviceLabel: 'Control', claimedAt: new Date().toISOString() },
    connection: 'live', sessionSnapshotFreshness: 'server' });
  mock.documents.set('sessions/s1', { phase: 'active' });
  mock.documents.set('sessions/s1/players/gm', { role: 'gm', connected: true });
  mock.documents.set('sessions/s1/gmInstances/bridge', { uid: 'gm', connected: true, lastSeenAt: new Date().toISOString() });
}
function liveProjection() {
  const value = mock.documents.get('sessions/s1')!.awayMissionProjectionSafety as Data;
  act(() => useSessionStore.setState({ session: { ...useSessionStore.getState().session!, awayMissionProjectionSafety: {
    policyVersion: 1, epoch: value.epoch as number, state: value.state as 'held' | 'ready',
  } } }));
}
function Consumer() {
  const session = useSessionStore(state => state.session);
  return <AwayMissionStartPanel session={session} instanceId="bridge" isGm players={[
    { uid: 'alice', sessionId: 's1', displayName: 'Alice', role: 'player', connected: true, assignedRoleId: 'wing-commander',
      fleetGroupId: 'fleet-1', seatId: null, joinedAt: '2026-10-09T00:00:00.000Z' },
  ]} />;
}
function chooseFirstDeal() {
  fireEvent.click(screen.getByRole('checkbox', { name: /Alice/ }));
  fireEvent.change(screen.getByLabelText('Mission Leader'), { target: { value: 'alice' } });
}
const prepare = () => fireEvent.click(screen.getByRole('button', { name: 'Prepare participant missions' }));
async function registered(payload: Data) { return repairAwayMissionProjectionPrivacy.run({ data: payload, auth: { uid: mock.uid } } as CallableRequest<Data>); }
async function maintain(step: string, requestId = step) {
  return registered({ sessionId: 's1', instanceId: 'bridge', requestId, repairRunId: 'baseline-run', step });
}
function seedLegacy() {
  const f = legacyFailedKProjectionFixture('s1'); const r = f.record; const opportunityId = 'k-privacy-fixture';
  mock.documents.set('sessions/s1/serverState/missionDeck', { ...r.lifecycle.deckState, dealtCount: r.lifecycle.dealtCount });
  const participants = [{ uid: 'alice', roleId: 'wing-commander' }, { uid: 'bob', roleId: 'icebreaker-miner' }];
  const crafts = [{ participantUid: 'alice', craftIds: ['starlight'] }, { participantUid: 'bob', craftIds: ['highwall'] }];
  const source = { missionId: f.missionId, requestId: 'start-fixture', actorUid: 'gm', opportunityId, groupId: 'fleet-1', chart: 'A',
    coordinate: f.pointers[0]!.coordinate, siteCode: 'K', sourceCycle: 2, missionLeaderUid: 'alice', missionLeaderRoleId: 'wing-commander',
    participantSnapshots: participants, participantCrafts: crafts, availableCarrierCraftIds: ['starlight', 'highwall'],
    handIds: f.pointers.map(p => p.handId), cardIds: f.hands.map(h => h.cardId), dealtFrom: 0, dealtThrough: 2 };
  mock.documents.set(`sessions/s1/serverState/awayMissions/instances/${f.missionId}`, { ...source, schemaVersion: 1,
    phase: r.lifecycle.phase, revision: r.revision, status: r.status, overrun: r.overrun, lifecycleRecord: r,
    discardedParticipantUids: ['alice', 'bob'], discardedCardIds: ['A♥', 'A♦'] });
  mock.documents.set(`sessions/s1/missionStartSnapshots/${opportunityId}`, { type: 'away-mission-start-snapshot', schemaVersion: 1,
    sessionId: 's1', ...source, missionLeader: { uid: 'alice', roleId: 'wing-commander' },
    stateDelta: { missionDeckDealtCountBefore: 0, missionDeckDealtCountAfter: 2 }, revisions: { missionDeck: { before: 0, after: 2 } },
    inputs: { participantSnapshots: participants, participantCrafts: crafts, availableCarrierCraftIds: ['starlight', 'highwall'], missionLeaderUid: 'alice' } });
  for (const pointer of f.pointers) mock.documents.set(`sessions/s1/awayMissionHandPointers/${pointer.handId}`, { ...pointer });
  for (const hand of f.hands) {
    const card = missionDeck().find(c => c.id === hand.cardId)!;
    mock.documents.set(`sessions/s1/awayMissionHands/${hand.handId}`, { ...hand, rank: card.rank, suit: card.suit, value: card.value });
  }
  mock.documents.set('sessions/s1/players/bob', { role: 'player', connected: false });
  return f;
}
function protectedBytes() {
  return [...mock.documents].filter(([p]) => !p.includes('/awayMissionProjectionPrivacy/')).map(([p, data]) => {
    const value = structuredClone(data); if (p === 'sessions/s1') delete value.awayMissionProjectionSafety;
    if (p.includes('/awayMissionHandPointers/')) delete value.lifecyclePublicState;
    return [p, value];
  });
}
beforeEach(() => {
  cleanup(); sessionStorage.clear(); useSessionStore.getState().reset(); mock.documents.clear(); mock.writes.length = 0;
  mock.calls.length = 0; mock.uid = 'gm'; mock.lossStep = ''; mock.staleOnce = false; mock.alterReply = undefined; mock.afterStep = undefined;
  mock.invoke = registered; mock.start.mockReset().mockResolvedValue({ status: 'committed', groupId: 'fleet-1', coordinate: '5143' });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }); seed();
});
afterEach(cleanup);

it('validates the unchanged actual registered empty namespace hold→verify→READY authority control', async () => {
  expect(await maintain('hold')).toMatchObject({ state: 'held' });
  expect(await maintain('repair')).toMatchObject({ state: 'held', pointerCount: 0, missionId: null });
  expect(await maintain('finalize')).toMatchObject({ state: 'ready' });
  expect(mock.documents.get('sessions/s1')!.awayMissionProjectionSafety).toMatchObject({ state: 'ready' });
});
it('validates full canonical legacy K setup through the existing registered loader and all-participant repair control', async () => {
  const f = seedLegacy(); const before = protectedBytes();
  expect(f.record.outcomes?.[0]).toMatchObject({ total: 20, difficulty: 30, criticalThreshold: 40, outcome: 'failure' });
  await maintain('hold');
  expect(await maintain('repair')).toMatchObject({ state: 'held', pointerCount: 2, missionId: f.missionId });
  await maintain('repair', 'verify'); await maintain('finalize');
  expect(protectedBytes()).toEqual(before);
  for (const pointer of f.pointers) expect((mock.documents.get(`sessions/s1/awayMissionHandPointers/${pointer.handId}`)!.lifecyclePublicState as Data).outcomes)
    .toEqual([expect.objectContaining({ difficulty: null, criticalThreshold: null, outcome: 'failure' })]);
});
it('keeps the existing first-deal action disabled while the actual session has no verified participant privacy readiness', () => {
  render(<Consumer />); chooseFirstDeal();
  expect(screen.getByRole('button', { name: 'Start mission' })).toBeDisabled();
  expect(mock.start).not.toHaveBeenCalled();
});
it('connects explicit GM preparation to actual empty-namespace maintenance and waits for live projection before first deal', async () => {
  render(<Consumer />); chooseFirstDeal(); prepare();
  await waitFor(() => expect(mock.calls.map(c => c.step)).toEqual(['hold', 'repair', 'finalize']));
  expect(mock.documents.get('sessions/s1')!.awayMissionProjectionSafety).toMatchObject({ state: 'ready' });
  expect(screen.getByRole('button', { name: 'Start mission' })).toBeDisabled();
  liveProjection(); await waitFor(() => expect(screen.getByRole('button', { name: 'Start mission' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Start mission' }));
  await waitFor(() => expect(mock.start).toHaveBeenCalledOnce());
  expect(new Set(mock.calls.map(c => c.repairRunId)).size).toBe(1);
  expect(new Set(mock.calls.map(c => c.requestId)).size).toBe(3);
});
it('connects preparation to complete legacy K participant sanitation including disconnected owners without gameplay writes', async () => {
  const f = seedLegacy(); const before = protectedBytes(); render(<Consumer />); prepare();
  await waitFor(() => expect(mock.calls.map(c => c.step)).toEqual(['hold', 'repair', 'repair', 'finalize']));
  expect(protectedBytes()).toEqual(before);
  for (const pointer of f.pointers) expect((mock.documents.get(`sessions/s1/awayMissionHandPointers/${pointer.handId}`)!.lifecyclePublicState as Data).outcomes)
    .toEqual([expect.objectContaining({ difficulty: null, criticalThreshold: null, total: 20 })]);
  expect(mock.documents.get('sessions/s1')!.awayMissionProjectionSafety).toMatchObject({ state: 'ready' });
});
it.each(['hold', 'repair', 'finalize'])('recovers lost %s acknowledgement using the exact saved command after remount', async step => {
  seedLegacy(); mock.lossStep = step; render(<Consumer />); prepare();
  await screen.findByRole('button', { name: 'Retry preparation' });
  const failed = { ...mock.calls.at(-1)! }; const writes = mock.writes.length;
  cleanup(); render(<Consumer />); fireEvent.click(screen.getByRole('button', { name: 'Retry preparation' }));
  await waitFor(() => expect(mock.documents.get('sessions/s1')!.awayMissionProjectionSafety).toMatchObject({ state: 'ready' }));
  const retry = mock.calls.find((call, index) => index >= mock.calls.length - 5 && call.requestId === failed.requestId && call !== failed);
  expect(mock.calls.filter(call => call.requestId === failed.requestId)).toHaveLength(2);
  expect(retry).toEqual(failed);
  if (step === 'finalize') expect(mock.writes).toHaveLength(writes);
  expect(screen.getByRole('button', { name: 'Start mission' })).toBeDisabled();
});
