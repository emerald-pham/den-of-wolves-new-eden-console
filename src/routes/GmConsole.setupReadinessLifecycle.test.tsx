import { StrictMode } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { GmInstance, Player } from '@/types/game';
import { recommendedRoleIds } from '@/data/rolePresets';
import { activeFleetShipIds } from '@/data/roles';
import { normalizeSessionConfiguration } from '../../functions/src/gameSetup';
import { useSessionStore } from '@/store/useSessionStore';
import { sessionFrom } from '@/lib/firestore';
import GmConsole from './GmConsole';

const io = vi.hoisted(() => ({
  call: vi.fn(), listen: vi.fn(),
  auth: { currentUser: { uid: 'original-setup-gm' }, authStateReady: vi.fn() },
}));
vi.mock('@/lib/firebase', () => ({ auth: () => io.auth, functions: () => ({}), app: () => ({}) }));
vi.mock('firebase/functions', () => ({
  httpsCallable: (_service: unknown, name: string) => (data: unknown) => io.call(name, data),
}));
vi.mock('firebase/auth', () => ({ signInAnonymously: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  getFirestore: () => ({}), connectFirestoreEmulator: vi.fn(),
  doc: (_db: unknown, path: string) => ({ path }),
  collection: (_db: unknown, path: string) => ({ path }),
  query: (reference: unknown) => reference, where: vi.fn(), orderBy: vi.fn(), limit: vi.fn(),
  onSnapshot: (...args: unknown[]) => io.listen(...args),
  getDocFromServer: async () => ({ exists: () => false }),
  Timestamp: class { toDate() { return new Date(0); } },
}));

// Real Firestore readers and lifecycle callbacks consume existing SDK-shaped
// frames; no component callback, authority predicate or scheduler is replaced.
interface NativeListener { path: string; next: (frame: ReturnType<typeof collectionFrame>) => void; active: boolean }
let listeners: NativeListener[];
function collectionFrame(records: readonly (Player | GmInstance)[]) {
  return { metadata: { fromCache: false }, exists: () => false, data: () => undefined,
    docs: records.map(record => ({ id: 'id' in record ? record.id : record.uid,
      data: () => record, get: (field: keyof typeof record) => record[field] })) };
}
function publishPlayers(players: readonly Player[]) {
  for (const listener of listeners.filter(item => item.active && item.path.endsWith('/players'))) {
    listener.next(collectionFrame(players));
  }
}
vi.mock('@/lib/vipHostService', () => ({
  attestVipHostVisit: vi.fn(),
  subscribeGmVipHostVisit: (_sessionId: string, _cycle: number, callback: (value: null) => void) => {
    callback(null); return vi.fn();
  },
}));
// Unrelated lazy workspaces do not define any setup/start predicate.
vi.mock('@/components/Voyage33MovementWorkspace', () => ({ default: () => null }));
vi.mock('@/components/SameTableTradeBaselineWorkspace', () => ({ default: () => null }));
vi.mock('@/components/GmStarmapModule', () => ({ default: () => null }));
vi.mock('@/components/GmScoutRevealController', () => ({ default: () => null }));
vi.mock('@/components/SmallShipOperations', () => ({ default: () => null }));
vi.mock('@/components/AwayMissionStartPanel', () => ({ default: () => null }));
vi.mock('@/components/BoardingSecurityTeamWorkspace', () => ({ default: () => null }));

const sessionId = 'native-setup-current';
const local: GmInstance = {
  id: 'original-setup-claim', sessionId, uid: 'original-setup-gm', name: 'Original GM',
  deviceLabel: 'native mounted fixture', claimedAt: '2026-10-06T00:00:00.000Z', responsibilities: [],
};
const gm: Player = {
  uid: local.uid, sessionId, displayName: 'Original GM', role: 'gm', connected: true,
  joinedAt: '2026-10-06T00:00:00.000Z',
};
let raw: Record<string, unknown>;
let unmount: (() => void) | undefined;

function canonicalSetup(playerCount: number) {
  const configuration = normalizeSessionConfiguration({ playerCount, chartId: 'A', expansion: 'base',
    turnLimit: 6, capybaraEnabled: false, dioneEnabled: playerCount >= 12 });
  const activeRoleIds = [...recommendedRoleIds(playerCount)];
  return { ...configuration, activeRoleIds, activeVesselIds: activeFleetShipIds(activeRoleIds, undefined) };
}
function currentSource(playerCount: number, revision: number) {
  const setup = canonicalSetup(playerCount);
  raw = { ...raw, ...setup, setup, setupRevision: revision };
  return sessionFrom(sessionId, raw);
}
async function mounted(playerCount = 8, strict = false) {
  const source = currentSource(playerCount, 17);
  useSessionStore.getState().setIdentity(source, gm);
  useSessionStore.getState().setGmInstance(local);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  const tree = <MemoryRouter initialEntries={['/gm']}><Routes>
    <Route path="/gm" element={<GmConsole />} />
    <Route path="/roles" element={<p>Ordinary role selection</p>} />
    <Route path="/console" element={<p>Ordinary console selection</p>} />
  </Routes></MemoryRouter>;
  unmount = render(strict ? <StrictMode>{tree}</StrictMode> : tree).unmount;
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Setup' }));
  await waitFor(() => {
    expect(listeners.filter(item => item.active && item.path.endsWith('/players'))).toHaveLength(2);
  });
  expect(screen.getByRole('combobox', { name: 'Recommended player count' })).toHaveValue(String(playerCount));
  expect(start()).toBeEnabled();
  return user;
}
const start = () => screen.getByRole('button', { name: 'Start full-game demo // Advance to Cycle 1' });
const setupRegion = () => screen.getByRole('region', { name: 'Setup' });
const setupCalls = () => io.call.mock.calls.filter(call => call[0] === 'confirmSetup');

beforeEach(() => {
  useSessionStore.getState().reset();
  listeners = [];
  io.call.mockReset(); io.auth.currentUser = { uid: local.uid };
  io.listen.mockImplementation((reference: { path: string }, options: unknown, next: NativeListener['next']) => {
    const callback = typeof options === 'function' ? options as NativeListener['next'] : next;
    const listener = { path: reference.path, next: callback, active: true }; listeners.push(listener);
    const records = reference.path.endsWith('/gmInstances') ? [local]
      : reference.path.endsWith('/players') ? [gm] : [];
    callback(collectionFrame(records));
    return () => { listener.active = false; };
  });
  raw = { name: 'Native normal setup', joinCode: '123456', phase: 'casting', currentTurn: 0,
    setupConfirmed: true, configurationLocked: false, pressEnabled: false,
    fullGameDemo: { status: 'preparing', progression: 'manual' },
    createdAt: '2026-10-06T00:00:00.000Z', updatedAt: '2026-10-06T00:00:00.000Z' };
  io.call.mockImplementation(async (endpoint: string, data: { sessionId: string; setup?: Record<string, unknown>;
    expectedSetupRevision?: number; requestId?: string }) => {
    if (endpoint === 'getWolfAmnestyView') return { data: { type: 'wolf-amnesty-view', sessionId, offer: null } };
    if (endpoint === 'listGmInstances') return { data: { instances: [local] } };
    if (endpoint !== 'confirmSetup') throw new Error(`Unexpected native callable ${endpoint}`);
    expect(data.sessionId).toBe(sessionId);
    const count = Number(data.setup?.playerCount);
    const setup = canonicalSetup(count);
    return { data: { status: 'committed', sessionId, requestId: data.requestId,
      setupConfirmed: true, setupRevision: Number(data.expectedSetupRevision) + 1, setup,
      expectedSetupRevision: data.expectedSetupRevision } };
  });
});
afterEach(async () => {
  console.info(JSON.stringify({ kind: 'native-gm-setup-readiness', test: expect.getState().currentTestName,
    sessionRoleCount: useSessionStore.getState().session?.activeRoleIds?.length,
    draftPlayerCount: (screen.queryByRole('combobox', { name: 'Recommended player count' }) as HTMLSelectElement | null)?.value,
    nativeCommandCount: setupCalls().length, nativeEndpoints: io.call.mock.calls.map(call => call[0]),
    sourceOriginalUid: useSessionStore.getState().me?.uid === local.uid,
    sourceOriginalInstance: useSessionStore.getState().gmInstance?.id === local.id }));
  if (unmount) await act(async () => unmount!()); unmount = undefined;
  useSessionStore.getState().reset();
});

describe('normal mounted full-game setup readiness', () => {
  it('keeps the exact confirmed eight-role source enabled through fresh same-role projections and assigned-but-unselected players', async () => {
    await mounted();
    for (let revision = 18; revision <= 25; revision++) {
      const roleId = recommendedRoleIds(8)[revision - 18]!;
      const player: Player = { uid: `native-${roleId}`, sessionId, displayName: `Native ${roleId}`, role: 'player',
        assignedRoleId: roleId, seatId: roleId, activeConsoleRoleId: null, connected: true,
        joinedAt: '2026-10-06T00:00:00.000Z' };
      await act(async () => {
        publishPlayers([gm, player]);
        useSessionStore.getState().setSession(currentSource(8, revision));
      });
      expect(start()).toBeEnabled();
      expect(screen.getByRole('combobox', { name: 'Recommended player count' })).toHaveValue('8');
      expect(screen.queryByText(/unconfirmed changes/i)).not.toBeInTheDocument();
    }
    expect(setupCalls()).toHaveLength(0);
  });

  it.each([
    [8, 14, false], [8, 14, true], [18, 8, false], [18, 8, true],
  ])('adopts a normal canonical server roster %i to %i without manufacturing an edited draft (StrictMode=%s)', async (before, after, strict) => {
    await mounted(before as number, strict as boolean);
    const originalDocument = performance.timeOrigin;
    await act(async () => {
      publishPlayers([gm]);
      useSessionStore.getState().setSession(currentSource(after as number, 18));
    });
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Recommended player count' })).toHaveValue(String(after)));
    expect(start()).toBeEnabled();
    expect(within(setupRegion()).getByText(`Roster synchronized // ${after} roles active`)).toBeInTheDocument();
    expect(performance.timeOrigin).toBe(originalDocument);
    expect(useSessionStore.getState().me).toEqual(gm);
    expect(useSessionStore.getState().gmInstance).toEqual(local);
    expect(useSessionStore.getState()).toMatchObject({ connection: 'live', sessionSnapshotFreshness: 'server' });
    expect(setupCalls()).toHaveLength(0);
  });

  it.each(['cache', 'offline', 'foreign-member-session', 'foreign-claim-uid', 'demoted'])
    ('cannot enable Start through a canonical source roster refresh after existing %s authority loss', async loss => {
      await mounted();
      await act(async () => {
        const store = useSessionStore.getState();
        if (loss === 'cache') store.setSessionSnapshotFreshness('cache');
        if (loss === 'offline') store.setConnection('offline');
        if (loss === 'foreign-member-session') store.setMe({ ...gm, sessionId: 'other-native-session' });
        if (loss === 'foreign-claim-uid') store.setGmInstance({ ...local, uid: 'other-native-gm' });
        if (loss === 'demoted') store.setMe({ ...gm, role: 'player' });
        store.setSession(currentSource(14, 18));
      });
      const control = screen.queryByRole('button', { name: 'Start full-game demo // Advance to Cycle 1' });
      if (control) expect(control).toBeDisabled();
      expect(setupCalls()).toHaveLength(0);
      expect(io.call.mock.calls.filter(call => call[0] === 'startGame')).toHaveLength(0);
      expect(useSessionStore.getState().me?.uid).toBe(gm.uid);
      if (loss === 'cache') expect(useSessionStore.getState().sessionSnapshotFreshness).toBe('cache');
      if (loss === 'offline') expect(useSessionStore.getState().connection).toBe('offline');
      if (loss === 'demoted') expect(useSessionStore.getState().me?.role).toBe('player');
    });

  it('preserves a genuine unconfirmed local draft when a different normal canonical server roster arrives', async () => {
    const user = await mounted();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Recommended player count' }), '9');
    expect(start()).toBeDisabled();
    await act(async () => useSessionStore.getState().setSession(currentSource(14, 18)));
    expect(screen.getByRole('combobox', { name: 'Recommended player count' })).toHaveValue('9');
    expect(start()).toBeDisabled();
    expect(setupCalls()).toHaveLength(0);
  });

  it('enables the current original GM only after its exact locally staged eight-role normal confirmation commits', async () => {
    const user = await mounted(18);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Recommended player count' }), '8');
    expect(start()).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Confirm setup // Confirm roster' }));
    await waitFor(() => expect(start()).toBeEnabled());
    expect(setupCalls()).toHaveLength(1);
    expect(io.call).toHaveBeenCalledWith('confirmSetup', expect.objectContaining({
      sessionId, instanceId: local.id, expectedSetupRevision: 17,
      setup: expect.objectContaining({ activeRoleIds: [...recommendedRoleIds(8)] }),
    }));
    expect(useSessionStore.getState().session?.activeRoleIds).toEqual(recommendedRoleIds(8));
    expect(within(setupRegion()).getByRole('status', { name: 'Roster confirmation status' }))
      .toHaveTextContent('Roster synchronized // server receipt committed.');
  });
});
