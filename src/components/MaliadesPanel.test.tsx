import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import MaliadesPanel from './MaliadesPanel';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ repair: vi.fn() }));
vi.mock('@/lib/maliadesService', () => ({
  repairMaliades: mocks.repair,
}));

const control = { shuttleId: 'maliades', ownerRoleId: 'dione-engineer', ownerUid: 'owner', holderUid: 'u1', revision: 2 } as const;
const docking = { shuttleId: 'maliades', shipId: 'dione', dockedAt: 'SESSION START' } as const;
const state = { revision: 2, attackId: 'attack-2', attackCycle: 2, launched: true, damage: 1 as const, destroyed: false, medium: null, short: null };
const staleReply = {
  status: 'stale', sessionId: 's1', requestId: 'repair-request-1', craftId: 'maliades',
  expectedHostShipId: 'dione', damageToRepair: 1,
  expectedControlRevision: 2, currentControlRevision: 3,
  expectedRevision: 2, currentRevision: 3, expectedCycle: 2, currentCycle: 2,
} as const;

function updateSession(patch: Record<string, unknown>): void {
  const current = useSessionStore.getState();
  act(() => current.setIdentity({ ...current.session!, ...patch } as never, current.me!));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

beforeEach(() => {
  mocks.repair.mockReset();
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity(
    {
      id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', ownerUid: 'gm1',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', currentTurn: 2,
      activeVesselIds: ['dione'],
      turnPhase: {
        turn: 2, teamPhaseEndsAt: '2099-09-22T12:00:00.000Z', openAirspaceEndsAt: '2099-09-22T12:15:00.000Z',
        airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
      },
      shuttleControl: { maliades: control }, shuttleDockings: [docking], shuttleFuelled: { maliades: true },
      shipResources: { dione: { ore: 0, fuel: 3, food: 13, water: 14, materials: 4, securityTeams: 2 } },
      shipDamage: { dione: { damagedSystemIds: [], destroyed: false } },
      maliadesState: state,
    },
    { uid: 'u1', sessionId: 's1', displayName: 'Engineer', role: 'player', seatId: null,
      assignedRoleId: 'dione-engineer', activeConsoleRoleId: 'dione-engineer', fleetGroupId: 'fleet-1', joinedAt: '2026-01-01T00:00:00.000Z' },
  );
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  mocks.repair.mockResolvedValue({ status: 'committed', cycle: 2, revision: 3, state: { ...state, revision: 3, damage: 0 }, hostShipId: 'dione', damageRepaired: 1, materialsRemaining: 3 });
});

it('withholds range choices until safe Wolf targets are available and keeps fuelled repair', async () => {
  const user = userEvent.setup();
  expect(useSessionStore.getState().session?.shuttleControl?.maliades).toEqual(control);
  expect(useSessionStore.getState().me).toMatchObject({ uid: 'u1', role: 'player', assignedRoleId: 'dione-engineer', activeConsoleRoleId: 'dione-engineer' });
  render(<MaliadesPanel control={control} docking={docking} fuelled />);
  expect(screen.getByRole('heading', { name: 'Maliades operations' })).toBeVisible();
  expect(screen.getByText(/medium and short attacks are unavailable/i)).toBeVisible();
  expect(screen.queryByLabelText('Attack target')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /resolve medium range/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /resolve short range/i })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /repair 1 damage/i }));
  await waitFor(() => expect(mocks.repair).toHaveBeenCalledWith(2, 2, 'dione', 1));
  expect(screen.getByRole('status')).toHaveTextContent(/repair committed/i);
});

it('can repair from a current operational member view without receiving private range results', async () => {
  const user = userEvent.setup();
  updateSession({maliadesState: {
    type: 'maliades-operational-view', revision: 2, attackId: 'attack-2', attackCycle: 2,
    launched: true, damage: 1, destroyed: false, mediumResolved: true, shortResolved: false,
  }});
  render(<MaliadesPanel control={control} docking={docking} fuelled />);
  await user.click(screen.getByRole('button', {name: /repair 1 damage/i}));
  await waitFor(() => expect(mocks.repair).toHaveBeenCalledWith(2, 2, 'dione', 1));
});

it.each(['stale reply arrives before the current snapshot', 'current snapshot arrives before the stale reply'])(
  'waits for live repair state and requires an explicit fresh retry when %s', async (order) => {
    const user = userEvent.setup();
    const pending = deferred<{ status: string; requestId: string; sessionId: string; craftId: string; expectedHostShipId: string; damageToRepair: number; expectedControlRevision: number; currentControlRevision: number; expectedRevision: number; currentRevision: number; expectedCycle: number; currentCycle: number }>();
    mocks.repair.mockReturnValueOnce(pending.promise).mockResolvedValue({
      status: 'committed', cycle: 2, revision: 4, state: { ...state, revision: 4, damage: 0 },
      hostShipId: 'dione', damageRepaired: 1, materialsRemaining: 2,
    });
    render(<MaliadesPanel control={control} docking={docking} fuelled />);
    await user.click(screen.getByRole('button', { name: /repair 1 damage/i }));
    await waitFor(() => expect(mocks.repair).toHaveBeenCalledTimes(1));

    if (order === 'current snapshot arrives before the stale reply') {
      updateSession({
        shuttleControl: { maliades: { ...control, revision: 3 } },
        maliadesState: { ...state, revision: 3 },
      });
    }
    await act(async () => pending.resolve(staleReply));

    const retry = await screen.findByRole('button', { name: /retry maliades repair/i });
    if (order === 'stale reply arrives before the current snapshot') {
      expect(retry).toBeDisabled();
      expect(mocks.repair).toHaveBeenCalledTimes(1);
      updateSession({
        shuttleControl: { maliades: { ...control, revision: 3 } },
        maliadesState: { ...state, revision: 3 },
      });
    }
    await waitFor(() => expect(retry).toBeEnabled());
    expect(mocks.repair).toHaveBeenCalledTimes(1);
    await user.click(retry);
    await waitFor(() => expect(mocks.repair).toHaveBeenCalledTimes(2));
    expect(mocks.repair).toHaveBeenLastCalledWith(2, 3, 'dione', 1);
    expect(screen.getByRole('status')).toHaveTextContent(/repair committed/i);
  },
);

it.each([
  ['Dione Engineer role', (_session: Record<string, unknown>, me: Record<string, unknown>) => { me.activeConsoleRoleId = 'other-role'; }],
  ['Maliades holder', (session: Record<string, unknown>) => {
    session.shuttleControl = { maliades: { ...control, holderUid: 'other', revision: 3 } };
  }],
  ['fleet group', (_session: Record<string, unknown>, me: Record<string, unknown>) => { me.fleetGroupId = 'other-group'; }],
  ['host docking', (session: Record<string, unknown>) => { session.shuttleDockings = [{ ...docking, shipId: 'aegis' }]; }],
  ['Team Phase', (session: Record<string, unknown>) => { session.turnPhase = { ...session.turnPhase as object, airspace: { state: 'lifted', tickerActive: true, pressAccess: false } }; }],
])('discards pending stale recovery when %s authority changes', async (_label, changeAuthority) => {
  const user = userEvent.setup();
  const pending = deferred<typeof staleReply>();
  mocks.repair.mockReturnValueOnce(pending.promise);
  render(<MaliadesPanel control={control} docking={docking} fuelled />);
  await user.click(screen.getByRole('button', { name: /repair 1 damage/i }));
  await waitFor(() => expect(mocks.repair).toHaveBeenCalledTimes(1));
  const current = useSessionStore.getState();
  const session = { ...current.session! } as unknown as Record<string, unknown>;
  const me = { ...current.me! } as unknown as Record<string, unknown>;
  changeAuthority(session, me);
  act(() => current.setIdentity(session as never, me as never));
  await act(async () => pending.resolve(staleReply));

  expect(await screen.findByRole('status')).toHaveTextContent(/authority.*changed/i);
  expect(screen.queryByRole('button', { name: /retry maliades repair/i })).not.toBeInTheDocument();
  expect(mocks.repair).toHaveBeenCalledTimes(1);
});
