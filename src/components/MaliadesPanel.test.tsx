import { render, screen, waitFor } from '@testing-library/react';
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
const state = { revision: 1, attackId: 'attack-2', attackCycle: 2, launched: true, damage: 1 as const, destroyed: false, medium: null, short: null };

beforeEach(() => {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity(
    {
      id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', ownerUid: 'gm1',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', currentTurn: 2,
      turnPhase: {
        turn: 2, teamPhaseEndsAt: '2099-09-22T12:00:00.000Z', openAirspaceEndsAt: '2099-09-22T12:15:00.000Z',
        airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
      },
      maliadesState: state,
    },
    { uid: 'u1', sessionId: 's1', displayName: 'Engineer', role: 'player', seatId: null,
      assignedRoleId: 'dione-engineer', activeConsoleRoleId: 'dione-engineer', joinedAt: '2026-01-01T00:00:00.000Z' },
  );
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  mocks.repair.mockResolvedValue({ status: 'committed', cycle: 2, revision: 2, state: { ...state, revision: 2 }, hostShipId: 'dione', damageRepaired: 1, materialsRemaining: 3 });
});

it('withholds range choices until safe Wolf targets are available and keeps fuelled repair', async () => {
  const user = userEvent.setup();
  render(<MaliadesPanel control={control} docking={docking} fuelled />);
  expect(screen.getByRole('heading', { name: 'Maliades operations' })).toBeVisible();
  expect(screen.getByText(/medium and short attacks are unavailable/i)).toBeVisible();
  expect(screen.queryByLabelText('Attack target')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /resolve medium range/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /resolve short range/i })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /repair 1 damage/i }));
  await waitFor(() => expect(mocks.repair).toHaveBeenCalledWith(2, 1, 'dione', 1));
  expect(screen.getByRole('status')).toHaveTextContent(/repair committed/i);
});
