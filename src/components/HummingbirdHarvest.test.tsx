import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import type { HummingbirdHarvest as HummingbirdHarvestState } from '@/types/game';
import { useSessionStore } from '@/store/useSessionStore';
import HummingbirdHarvest from './HummingbirdHarvest';

let publishHarvest: ((harvest: HummingbirdHarvestState | null) => void) | undefined;
let harvestListeners: Array<(harvest: HummingbirdHarvestState | null) => void> = [];
const { rollHummingbirdHarvest, allocateHummingbirdHarvest } = vi.hoisted(() => ({
  rollHummingbirdHarvest: vi.fn().mockResolvedValue(undefined),
  allocateHummingbirdHarvest: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/firestore', () => ({
  subscribeHummingbirdHarvest: vi.fn((_sessionId, _uid, onHarvest) => {
    publishHarvest = onHarvest;
    harvestListeners.push(onHarvest);
    onHarvest(null);
    return vi.fn();
  }),
}));

vi.mock('@/lib/hummingbirdHarvestService', () => ({
  rollHummingbirdHarvest,
  allocateHummingbirdHarvest,
}));

const docking = { shuttleId: 'hummingbird', shipId: 'quellon', dockedAt: '2026-09-12T00:00:00.000Z' } as const;

const pending: HummingbirdHarvestState = {
  sessionId: 's1', ownerUid: 'u1', turn: 2, hostShipId: 'quellon', revision: 1,
  status: 'pending', rolls: [2, 5], requestId: 'request-1', createdAt: '2026-09-12T00:00:00.000Z',
};

beforeEach(() => {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity(
    {
      id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', ownerUid: 'gm1',
      currentTurn: 2, activeRoleIds: ['quellon-explorer'],
      shuttleDockings: { hummingbird: docking }, shuttleFuelled: { hummingbird: true },
      createdAt: '2026-09-12T00:00:00.000Z', updatedAt: '2026-09-12T00:00:00.000Z',
    } as never,
    {
      uid: 'u1', sessionId: 's1', displayName: 'Explorer', role: 'player', seatId: null,
      assignedRoleId: 'quellon-explorer', activeConsoleRoleId: 'quellon-explorer',
      joinedAt: '2026-09-12T00:00:00.000Z',
    },
  );
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  rollHummingbirdHarvest.mockClear();
  allocateHummingbirdHarvest.mockClear();
  publishHarvest = undefined;
  harvestListeners = [];
});

it('rolls once, exposes both choices, and activates the visible choice with Enter', async () => {
  const user = userEvent.setup();
  render(<HummingbirdHarvest docking={docking} fuelled={true} />);

  await user.click(screen.getByRole('button', { name: /roll 2d6/i }));
  expect(rollHummingbirdHarvest).toHaveBeenCalledWith(0);

  act(() => publishHarvest?.(pending));
  const firstChoice = screen.getByRole('button', { name: /die 1: 2 food \/ 5 water/i });
  expect(firstChoice).toBeVisible();
  firstChoice.focus();
  await user.keyboard('{Enter}');
  expect(allocateHummingbirdHarvest).toHaveBeenCalledWith(1, 0);
});

it('shows the resolved allocation and withholds controls from an unavailable player', () => {
  render(<HummingbirdHarvest docking={docking} fuelled={true} />);
  act(() => publishHarvest?.({
    ...pending, status: 'resolved', foodDieIndex: 1, food: 5, water: 2,
    resolvedAt: '2026-09-12T00:01:00.000Z',
  }));
  expect(screen.getByRole('status')).toHaveTextContent(/5 food and 2 water added to hummingbird cargo/i);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();

  act(() => useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, activeConsoleRoleId: 'aegis-admiral',
  }));
  expect(screen.getByRole('status')).toHaveTextContent(/active quellon explorer console is required/i);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('shows a plain unavailable state outside the Coordination Phase', () => {
  const session = useSessionStore.getState().session;
  if (!session) throw new Error('Expected the render session.');
  useSessionStore.getState().setSession({
    ...session,
    turnPhase: {
      turn: 2,
      teamPhaseEndsAt: '2026-09-12T00:05:00.000Z',
      openAirspaceEndsAt: '2026-09-12T00:20:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
  });
  render(<HummingbirdHarvest docking={docking} fuelled={true} />);
  expect(screen.getByRole('status')).toHaveTextContent(/requires the coordination phase/i);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('does not retain a private roll while the session identity changes', () => {
  render(<HummingbirdHarvest docking={docking} fuelled={true} />);
  act(() => publishHarvest?.(pending));
  expect(screen.getByRole('button', { name: /die 1: 2 food/i })).toBeVisible();

  const state = useSessionStore.getState();
  const session = state.session;
  const me = state.me;
  if (!session || !me) throw new Error('Expected a live Hummingbird fixture.');
  act(() => state.setIdentity({ ...session, id: 's2' }, { ...me, sessionId: 's2' }));

  expect(screen.queryByRole('button', { name: /die 1: 2 food/i })).not.toBeInTheDocument();
  act(() => harvestListeners[0]?.(pending));
  expect(screen.queryByRole('button', { name: /die 1: 2 food/i })).not.toBeInTheDocument();
});

it('clears the receipt when a replacement supersedes the Explorer console', () => {
  render(<HummingbirdHarvest docking={docking} fuelled={true} />);
  act(() => publishHarvest?.(pending));
  expect(screen.getByRole('button', { name: /die 1: 2 food/i })).toBeVisible();

  act(() => useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, replacementRoleId: 'doctor', activeConsoleRoleId: 'quellon-explorer',
  }));

  expect(screen.queryByRole('button', { name: /die 1: 2 food/i })).not.toBeInTheDocument();
  act(() => harvestListeners[0]?.(pending));
  expect(screen.queryByRole('button', { name: /die 1: 2 food/i })).not.toBeInTheDocument();
});
