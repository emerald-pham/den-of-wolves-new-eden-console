import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import GmAwayMissionLifecycleWorkspace from './GmAwayMissionLifecycleWorkspace';
import { useSessionStore } from '@/store/useSessionStore';
const mocks = vi.hoisted(() => ({ open: vi.fn(), create: vi.fn() }));
vi.mock('@/lib/awayMissionLifecycleService', () => ({
  createCurrentAwayMissionLifecycleActions: mocks.create,
}));
beforeEach(() => {
  useSessionStore.getState().reset();
  mocks.open.mockReset().mockResolvedValue(undefined);
  mocks.create.mockReturnValue({ openDiscards: mocks.open });
});
const publicState = {
  missionId: 'mission-1', groupId: 'fleet-1', siteCode: 'D', revision: 0,
  phase: 'awaiting-card-selection', status: 'active', overrun: false,
  missionLeaderUid: 'alice', participantCount: 1, opportunities: [{ id: 'D-1', label: 'Supplies' }],
  requestCounts: [], outcomes: null, rewards: null, specialRewards: null,
  custody: { status: 'mission-leader', holderUid: 'alice', shipId: null }, legalDropOffShipIds: [],
} as const;
function seed() {
  const store = useSessionStore.getState();
  store.setSession({ id: 's1', phase: 'active' } as never);
  store.setMe({ uid: 'gm1', sessionId: 's1', role: 'gm' } as never);
  store.setGmInstance({ id: 'bridge', sessionId: 's1', uid: 'gm1' } as never);
  useSessionStore.setState({ connection: 'live', sessionSnapshotFreshness: 'server' });
  store.setGmAwayMissionHandPointers([{
    sessionId: 's1', participantUid: 'alice', missionId: 'mission-1', handId: 'hand-1',
    phase: 'awaiting-card-selection', revision: 0, discarded: false, lifecyclePublicState: publicState,
  } as never]);
}
it('mounts the real facilitator lifecycle action without reading or rendering any participant hand', () => {
  seed();
  render(<GmAwayMissionLifecycleWorkspace />);
  fireEvent.click(screen.getByRole('button', { name: 'Open private discards' }));
  expect(mocks.open).toHaveBeenCalledOnce();
  expect(mocks.create).toHaveBeenCalledWith(expect.any(Function), 's1', 'gm1');
  expect(screen.queryByRole('region', { name: 'Your private mission cards' })).toBeNull();
});
it('closes facilitator controls when the accepted session projection is stale', () => {
  seed();
  useSessionStore.setState({ connection: 'offline', sessionSnapshotFreshness: 'cache' });
  render(<GmAwayMissionLifecycleWorkspace />);
  expect(screen.queryByRole('button', { name: 'Open private discards' })).toBeNull();
});
it('refuses mixed mission revisions rather than selecting an older participant pointer', () => {
  seed();
  const first = useSessionStore.getState().gmAwayMissionHandPointers[0]!;
  useSessionStore.getState().setGmAwayMissionHandPointers([
    first, { ...first, participantUid: 'bob', handId: 'hand-2', revision: 1,
      lifecyclePublicState: { ...publicState, revision: 1 } } as never,
  ]);
  render(<GmAwayMissionLifecycleWorkspace />);
  expect(screen.queryByRole('button', { name: 'Open private discards' })).toBeNull();
});
