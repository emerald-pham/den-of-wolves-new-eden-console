import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SESSION_STORAGE_KEY, useSessionStore } from '@/store/useSessionStore';
import { restoreSessionRoute } from '@/lib/sessionRoute';
import type { Player, WolfAttackMemberView } from '@/types/game';
import type * as FirebaseModule from '@/lib/firebase';
import type * as FirestoreModule from '@/lib/firestore';
import type * as SessionServiceModule from '@/lib/sessionService';
import type * as MissionServiceModule from '@/lib/awayMissionLifecycleService';
import SessionMode from './SessionMode';
import RoleBrief from './RoleBrief';

const COLONEL = 'refinery-124-pdf-colonel';

// Mimics the participant's private mission listener; the callable below is the real client command path.
const missionFeed = vi.hoisted(() => ({
  call: vi.fn(),
  listener: undefined as ((state: unknown) => void) | undefined,
  latest: undefined as unknown,
  publish(state: unknown): void {
    missionFeed.latest = state;
    missionFeed.listener?.(state);
  },
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn((_functions: unknown, name: string) => name === 'commitAwayMissionLifecycleCommand'
    ? missionFeed.call
    : vi.fn().mockResolvedValue({ data: null })),
}));
vi.mock('@/lib/firebase', async (importOriginal) => ({
  ...(await importOriginal<typeof FirebaseModule>()),
  auth: () => ({ currentUser: { uid: 'u1' } }),
  functions: vi.fn(() => ({ kind: 'functions' })),
}));
vi.mock('@/lib/sessionService', async (importOriginal) => ({
  ...(await importOriginal<typeof SessionServiceModule>()),
  selectConsoleRole: vi.fn(),
  releaseConsoleRole: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof FirestoreModule>()),
  subscribeConnectedPlayers: vi.fn(() => vi.fn()),
  subscribeShipConfetti: vi.fn(() => vi.fn()),
  subscribeDamageDraws: vi.fn((_sessionId, onDraws: (draws: never[]) => void) => {
    onDraws([]);
    return vi.fn();
  }),
  subscribeVipCards: vi.fn(() => vi.fn()),
  subscribeWolfAttackMemberView: vi.fn((_sessionId: string, onView: (view: WolfAttackMemberView | null) => void) => {
    onView(null);
    return vi.fn();
  }),
}));
vi.mock('@/lib/awayMissionLifecycleService', async (importOriginal) => ({
  ...(await importOriginal<typeof MissionServiceModule>()),
  subscribeToOwnAwayMissionLifecycles: vi.fn((_sessionId, _uid, onState: (state: unknown) => void) => {
    missionFeed.listener = onState;
    if (missionFeed.latest) onState(missionFeed.latest);
    return vi.fn();
  }),
}));

const colonel: Player = {
  uid: 'u1', sessionId: 's1', displayName: 'Colonel', role: 'player', seatId: COLONEL,
  assignedRoleId: COLONEL, activeConsoleRoleId: COLONEL, joinedAt: '2026-11-05T00:00:00.000Z',
};
const colonelBrief = {
  assignmentUid: 'u1', roleId: COLONEL, roleName: 'P.D.F. Colonel', vesselName: 'Refinery 124',
  text: 'Command the Escort Wing.', commonRules: 'Keep this brief private.', setupRevision: 1,
};

// The PDF Escort Wing carries the Colonel to Wolf Base L without a Fighter Bay charge.
const missionPublic = {
  missionId: 'mission-pdf', groupId: 'fleet-1', siteCode: 'L', revision: 3,
  phase: 'assignment-ready', status: 'active', overrun: false, missionLeaderUid: 'u1',
  participantCount: 1,
  opportunities: [
    { id: 'L-1', label: 'Salvage the station wreckage' },
    { id: 'L-2', label: 'Raid the fuel depot' },
    { id: 'L-3', label: 'Salvage advanced weaponry' },
  ],
  requestCounts: [], outcomes: null, rewards: null, specialRewards: null,
  custody: { status: 'mission-leader', holderUid: 'u1', shipId: null }, legalDropOffShipIds: [],
};
const missionHand = {
  missionId: 'mission-pdf', participantUid: 'u1', revision: 3, phase: 'assignment-ready',
  cards: [
    { id: '10♦', value: 10, status: 'remaining', opportunityId: null },
    { id: 'A♥', value: 10, status: 'remaining', opportunityId: null },
  ],
  reclamatorSalvage: null,
};
// Server-owned resolution: the Escort Wing adds +1 salvage on L-1 and +2 search and rescue on L-2.
const resolvedPublic = {
  ...missionPublic, revision: 4, status: 'resolved', phase: 'resolved',
  outcomes: [
    { opportunityId: 'L-1', contributorCount: 1, total: 16, bonusTotal: 1,
      difficulty: 15, criticalThreshold: 20, outcome: 'success' },
    { opportunityId: 'L-2', contributorCount: 1, total: 17, bonusTotal: 2,
      difficulty: 15, criticalThreshold: 20, outcome: 'success' },
    { opportunityId: 'L-3', contributorCount: 0, total: 0, bonusTotal: 0,
      difficulty: null, criticalThreshold: null, outcome: 'automatic-failure' },
  ],
  rewards: [
    { opportunityId: 'L-1', branch: 'success', resources: { materials: 10 }, effects: [], bulkHaulageApplied: false },
    { opportunityId: 'L-2', branch: 'success', resources: { ore: 10 }, effects: [], bulkHaulageApplied: false },
  ],
};
const resolvedHand = {
  ...missionHand, revision: 4, phase: 'resolved', assignmentCommitted: true,
  cards: [
    { id: '10♦', value: 10, status: 'assigned', opportunityId: 'L-1' },
    { id: 'A♥', value: 10, status: 'assigned', opportunityId: 'L-2' },
  ],
};
const missionReady = (publicState: object, privateState: object) => ({
  status: 'ready', projectionMissing: false, missions: [{ publicState, privateState }],
});
const interrupted = () => Object.assign(new Error('The mission uplink was interrupted.'), { code: 'functions/unavailable' });

function seedColonelSession(): void {
  const state = useSessionStore.getState();
  state.reset();
  state.setIdentity({
    id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', ownerUid: 'gm1',
    currentTurn: 2, activeRoleIds: [COLONEL], activeVesselIds: ['refinery-124'],
    createdAt: '2026-11-05T00:00:00.000Z', updatedAt: '2026-11-05T00:00:00.000Z',
  } as never, colonel);
  state.setMode('console');
  state.setConnection('live');
  state.setSessionSnapshotFreshness('server');
  state.setRoleBrief(colonelBrief);
}

function ColonelRoutes({ initial }: { readonly initial: string }) {
  return (
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/console" element={<SessionMode mode="console" />} />
        <Route path="/brief" element={<RoleBrief />} />
      </Routes>
    </MemoryRouter>
  );
}

async function reloadAt(route: string): Promise<string> {
  useSessionStore.getState().setLastRoute(route);
  const persisted = localStorage.getItem(SESSION_STORAGE_KEY);
  expect(persisted).toBeTruthy();
  useSessionStore.getState().reset();
  localStorage.setItem(SESSION_STORAGE_KEY, persisted!);
  await act(async () => { await useSessionStore.persist.rehydrate(); });
  return restoreSessionRoute(useSessionStore.getState().lastRoute);
}

function setConnection(connection: 'live' | 'offline'): void {
  act(() => {
    useSessionStore.getState().setConnection(connection);
    useSessionStore.getState().setSessionSnapshotFreshness(connection === 'live' ? 'server' : 'cache');
  });
}

async function openColonelMission(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.click(screen.getByRole('link', { name: 'Open private brief' }));
  return screen.findByRole('region', { name: 'Away mission // mission-pdf' });
}

function expectResolvedResult(mission: HTMLElement): void {
  expect(mission).toHaveTextContent(/success \/\/ total 16/i);
  expect(mission).toHaveTextContent(/reward \/\/ materials 10/i);
  expect(mission).toHaveTextContent(/success \/\/ total 17/i);
  expect(mission).toHaveTextContent(/reward \/\/ ore 10/i);
  expect(within(mission).getByRole('article', { name: 'Private card 10♦' })).toHaveTextContent(/assigned face down/i);
  expect(within(mission).queryByRole('button', { name: 'Submit mission assignments' })).not.toBeInTheDocument();
}

beforeEach(() => {
  localStorage.clear();
  missionFeed.call.mockReset();
  missionFeed.latest = undefined;
  missionFeed.listener = undefined;
  seedColonelSession();
  missionFeed.publish(missionReady(missionPublic, missionHand));
});

it('retries an interrupted Colonel assignment with the identical request and keeps one committed result after a reload', async () => {
  const user = userEvent.setup();
  render(<ColonelRoutes initial="/console" />);

  const mission = await openColonelMission(user);
  await user.selectOptions(within(mission).getByLabelText('Opportunity for 10♦'), 'L-1');
  await user.selectOptions(within(mission).getByLabelText('Opportunity for A♥'), 'L-2');
  missionFeed.call.mockRejectedValueOnce(interrupted());
  await user.click(within(mission).getByRole('button', { name: 'Submit mission assignments' }));
  expect(await within(mission).findByRole('alert')).toHaveTextContent(/uplink was interrupted/i);

  missionFeed.call.mockImplementationOnce(async (payload: { requestId: string }) => {
    act(() => missionFeed.publish(missionReady(resolvedPublic, resolvedHand)));
    return { data: {
      status: 'replayed', sessionId: 's1', missionId: 'mission-pdf', requestId: payload.requestId,
      revision: 4, publicState: resolvedPublic, privateState: resolvedHand,
    } };
  });
  await user.click(within(mission).getByRole('button', { name: 'Submit mission assignments' }));
  await waitFor(() => expect(missionFeed.call).toHaveBeenCalledTimes(2));
  expect(missionFeed.call.mock.calls[0]?.[0]).toMatchObject({
    sessionId: 's1', missionId: 'mission-pdf', expectedRevision: 3, type: 'assignCards',
    placements: [{ cardId: '10♦', opportunityId: 'L-1' }, { cardId: 'A♥', opportunityId: 'L-2' }],
  });
  expect(missionFeed.call.mock.calls[1]?.[0]).toEqual(missionFeed.call.mock.calls[0]?.[0]);
  await waitFor(() => expectResolvedResult(screen.getByRole('region', { name: 'Away mission // mission-pdf' })));

  cleanup();
  const route = await reloadAt('/brief');
  expect(route).toBe('/console');
  render(<ColonelRoutes initial={route} />);
  setConnection('live');
  // The private brief is refreshed from the server on resume, never restored from storage.
  act(() => useSessionStore.getState().setRoleBrief(colonelBrief));
  expectResolvedResult(await openColonelMission(user));
  expect(missionFeed.call).toHaveBeenCalledTimes(2);

  await user.click(screen.getByRole('link', { name: /return to station catalog/i }));
  expect(await screen.findByRole('heading', { name: /stations and consoles/i })).toBeInTheDocument();
});

it('shows the Colonel the server-committed result after a reconnect instead of submitting again', async () => {
  const user = userEvent.setup();
  render(<ColonelRoutes initial="/console" />);

  const mission = await openColonelMission(user);
  await user.selectOptions(within(mission).getByLabelText('Opportunity for 10♦'), 'L-1');
  await user.selectOptions(within(mission).getByLabelText('Opportunity for A♥'), 'L-2');
  missionFeed.call.mockRejectedValueOnce(interrupted());
  await user.click(within(mission).getByRole('button', { name: 'Submit mission assignments' }));
  expect(await within(mission).findByRole('alert')).toHaveTextContent(/uplink was interrupted/i);

  setConnection('offline');
  setConnection('live');
  act(() => missionFeed.publish(missionReady(resolvedPublic, resolvedHand)));

  await waitFor(() => expectResolvedResult(screen.getByRole('region', { name: 'Away mission // mission-pdf' })));
  expect(missionFeed.call).toHaveBeenCalledTimes(1);
});
