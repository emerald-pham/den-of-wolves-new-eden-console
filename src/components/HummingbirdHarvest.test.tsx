import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import type { GameSession, HummingbirdHarvest as HummingbirdHarvestState } from '@/types/game';
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
const timestamp = '2026-09-12T00:00:00.000Z';

const pending: HummingbirdHarvestState = {
  sessionId: 's1', ownerUid: 'u1', turn: 2, hostShipId: 'quellon', revision: 1,
  status: 'pending', rolls: [2, 5], requestId: 'request-1', createdAt: '2026-09-12T00:00:00.000Z',
};

function withoutTurnPhase(session: GameSession): Omit<GameSession, 'turnPhase'> {
  const copy = { ...session } as Omit<GameSession, 'turnPhase'> & {
    turnPhase?: NonNullable<GameSession['turnPhase']>;
  };
  delete copy.turnPhase;
  return copy;
}

function staleReply(
  harvest: HummingbirdHarvestState,
  requestId: string,
): Record<string, unknown> {
  return {
    status: 'stale', sessionId: 's1', requestId, harvest,
    actorUid: 'u1', actorRoleId: 'quellon-explorer', vesselId: 'hummingbird',
    hostShipId: 'quellon', turn: 2, phase: 'active', revision: harvest.revision,
    idempotencyKey: requestId, auditId: `hummingbird-harvest-${requestId}`,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity(
    {
      id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', ownerUid: 'gm1',
      currentTurn: 2, activeRoleIds: ['quellon-explorer'], activeVesselIds: ['quellon'],
      shuttleDockings: [docking], shuttleFuelled: { hummingbird: true },
      turnPhase: {
        turn: 2,
        teamPhaseEndsAt: '2026-09-12T00:05:00.000Z',
        openAirspaceEndsAt: '2026-09-12T00:20:00.000Z',
        airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
      },
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
  rollHummingbirdHarvest.mockResolvedValue(undefined);
  allocateHummingbirdHarvest.mockClear();
  allocateHummingbirdHarvest.mockResolvedValue(undefined);
  publishHarvest = undefined;
  harvestListeners = [];
});

it('rolls once, exposes both choices, and activates the visible choice with Enter', async () => {
  const user = userEvent.setup();
  render(<HummingbirdHarvest docking={docking} fuelled={true} />);

  await user.click(screen.getByRole('button', { name: /roll 2d6/i }));
  expect(rollHummingbirdHarvest).toHaveBeenCalledWith(0, expect.any(String));

  act(() => publishHarvest?.(pending));
  const firstChoice = screen.getByRole('button', { name: /die 1: 2 food \/ 5 water/i });
  expect(firstChoice).toBeVisible();
  firstChoice.focus();
  await user.keyboard('{Enter}');
  expect(allocateHummingbirdHarvest).toHaveBeenCalledWith(1, 0, expect.any(String));
});

it('recovers the current private roll from a validated stale reply', async () => {
  const user = userEvent.setup();
  rollHummingbirdHarvest.mockImplementationOnce(async (_revision: number, requestId: string) =>
    staleReply(pending, requestId));
  render(<HummingbirdHarvest docking={docking} fuelled={true} />);

  await user.click(screen.getByRole('button', { name: /roll 2d6/i }));

  expect(await screen.findByRole('button', { name: /die 1: 2 food \/ 5 water/i })).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('uses the previous resolved revision when the next cycle starts', async () => {
  const user = userEvent.setup();
  render(<HummingbirdHarvest docking={docking} fuelled={true} />);
  act(() => publishHarvest?.({
    ...pending, turn: 1, revision: 4, status: 'resolved', foodDieIndex: 0,
    food: 2, water: 5, resolvedAt: timestamp,
  }));

  expect(screen.queryByText(/resolved this cycle/i)).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /roll 2d6/i }));

  expect(rollHummingbirdHarvest).toHaveBeenCalledWith(4, expect.any(String));
});

it('does not expose or retry a pending roll after its cycle advances', () => {
  const session = useSessionStore.getState().session!;
  useSessionStore.getState().setSession({
    ...session,
    currentTurn: 3,
    turnPhase: {
      turn: 3,
      teamPhaseEndsAt: '2026-09-12T01:05:00.000Z',
      openAirspaceEndsAt: '2026-09-12T01:20:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
    },
  });
  render(<HummingbirdHarvest docking={docking} fuelled={true} />);
  act(() => publishHarvest?.({ ...pending, turn: 2 }));

  expect(screen.getByRole('status')).toHaveTextContent(/pending Hummingbird harvest no longer matches/i);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.queryByText(/die 1: 2 food/i)).not.toBeInTheDocument();
});

it('preserves the selected die and reuses the same request id after an uncertain allocation', async () => {
  const user = userEvent.setup();
  allocateHummingbirdHarvest
    .mockRejectedValueOnce({ code: 'functions/unavailable' })
    .mockResolvedValueOnce(undefined);
  render(<HummingbirdHarvest docking={docking} fuelled={true} />);
  act(() => publishHarvest?.(pending));

  await user.click(screen.getByRole('button', { name: /die 2: 5 food \/ 2 water/i }));
  const retry = await screen.findByRole('button', { name: /retry die 2 allocation/i });
  expect(screen.getByRole('button', { name: /die 2: 5 food \/ 2 water/i })).toHaveAttribute('aria-pressed', 'true');
  const originalRequestId = allocateHummingbirdHarvest.mock.calls[0]?.[2];

  await user.click(retry);

  expect(allocateHummingbirdHarvest).toHaveBeenNthCalledWith(2, 1, 1, originalRequestId);
});

it('preserves a pending die choice after stale recovery and gives an explicit retry a fresh request id', async () => {
  const user = userEvent.setup();
  const newerPending = { ...pending, revision: 2, requestId: 'new-roll' };
  allocateHummingbirdHarvest.mockImplementationOnce(async (_revision: number, _index: 0 | 1, requestId: string) =>
    staleReply(newerPending, requestId));
  render(<HummingbirdHarvest docking={docking} fuelled={true} />);
  act(() => publishHarvest?.(pending));

  await user.click(screen.getByRole('button', { name: /die 2: 5 food \/ 2 water/i }));

  const retainedChoice = await screen.findByRole('button', { name: /die 2: 5 food \/ 2 water/i });
  expect(retainedChoice).toHaveAttribute('aria-pressed', 'true');
  expect(allocateHummingbirdHarvest).toHaveBeenCalledTimes(1);
  const firstRequestId = allocateHummingbirdHarvest.mock.calls[0]?.[2];

  await user.click(retainedChoice);

  expect(allocateHummingbirdHarvest).toHaveBeenCalledTimes(2);
  expect(allocateHummingbirdHarvest).toHaveBeenLastCalledWith(2, 1, expect.any(String));
  expect(allocateHummingbirdHarvest.mock.calls[1]?.[2]).not.toBe(firstRequestId);
});

it('does not let a delayed stale reply replace a newer private listener snapshot', async () => {
  const user = userEvent.setup();
  const request = deferred<Record<string, unknown>>();
  rollHummingbirdHarvest.mockReturnValueOnce(request.promise);
  render(<HummingbirdHarvest docking={docking} fuelled={true} />);

  await user.click(screen.getByRole('button', { name: /roll 2d6/i }));
  const resolved: HummingbirdHarvestState = {
    ...pending, revision: 2, status: 'resolved', foodDieIndex: 0,
    food: 2, water: 5, resolvedAt: timestamp,
  };
  act(() => publishHarvest?.(resolved));
  await act(async () => {
    request.resolve(staleReply(pending, 'late-roll'));
  });

  expect(screen.getByText(/2 food and 5 water added/i)).toHaveAttribute('role', 'status');
  expect(screen.queryByRole('button', { name: /die 1:/i })).not.toBeInTheDocument();
});

it('discards a delayed private stale reply after the Explorer role is lost', async () => {
  const user = userEvent.setup();
  const request = deferred<Record<string, unknown>>();
  rollHummingbirdHarvest.mockReturnValueOnce(request.promise);
  render(<HummingbirdHarvest docking={docking} fuelled={true} />);

  await user.click(screen.getByRole('button', { name: /roll 2d6/i }));
  act(() => useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, activeConsoleRoleId: 'quellon-captain',
  }));
  await act(async () => {
    request.resolve(staleReply(pending, 'late-roll'));
  });

  expect(screen.queryByRole('button', { name: /die 1:/i })).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent(/active quellon explorer console is required/i);
});

it.each([
  ['the Hummingbird is no longer docked', () => {
    const session = useSessionStore.getState().session!;
    useSessionStore.getState().setSession({ ...session, shuttleDockings: [] });
  }, /current Hummingbird docking state/i],
  ['the phase becomes unknown', () => {
    const session = useSessionStore.getState().session!;
    useSessionStore.getState().setSession(withoutTurnPhase(session));
  }, /requires the Coordination Phase/i],
  ['the Explorer role is removed from session configuration', () => {
    const session = useSessionStore.getState().session!;
    useSessionStore.getState().setSession({ ...session, activeRoleIds: [] });
  }, /active Quellon Explorer console is required/i],
] as const)('hides a delayed private stale reply after %s', async (_label, revokeAuthority, statusPattern) => {
  const user = userEvent.setup();
  const request = deferred<Record<string, unknown>>();
  rollHummingbirdHarvest.mockReturnValueOnce(request.promise);
  render(<HummingbirdHarvest docking={docking} fuelled={true} />);

  await user.click(screen.getByRole('button', { name: /roll 2d6/i }));
  act(revokeAuthority);
  await act(async () => {
    request.resolve(staleReply(pending, 'late-roll'));
  });

  expect(screen.queryByRole('button', { name: /die 1:/i })).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent(statusPattern);
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
