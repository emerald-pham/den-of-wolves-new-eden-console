import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import SmallShipOperations from './SmallShipOperations';

const { runSmallShipMaintenance, setSmallShipDocking } = vi.hoisted(() => ({
  runSmallShipMaintenance: vi.fn().mockResolvedValue(undefined),
  setSmallShipDocking: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/smallShipService', () => ({ runSmallShipMaintenance, setSmallShipDocking }));

beforeEach(() => {
  useSessionStore.getState().reset();
  useSessionStore.getState().setSession({
    id: 's1', phase: 'active', currentTurn: 2, activeVesselIds: ['aegis'],
    smallShipStates: {
      gorgoneion: {
        id: 'gorgoneion', hostShipId: 'aegis', dockingRevision: 1,
        population: 1_000, unrest: 0,
        cycle: { step: 0, revision: 0, results: {}, charges: [] },
      },
    },
  } as never);
});

it('shows the registered Missile Array rule while withholding its future firing action', () => {
  render(<SmallShipOperations />);

  const gorgoneion = screen.getByRole('region', { name: 'Gorgoneion small-ship operations' });
  const systems = within(gorgoneion).getByRole('region', { name: 'Gorgoneion registered systems' });
  const missileArray = within(systems).getByRole('article', {
    name: 'Missile Array system // unavailable',
  });
  expect(missileArray).toHaveTextContent('Wolf attack // not charged');
  expect(missileArray).toHaveTextContent('3 dice total: one at long, one at medium, and one at short range');
  expect(missileArray).toHaveTextContent('6+ / 5+ / 4+');
  expect(missileArray).toHaveTextContent('each target at most once per phase');
  expect(missileArray).toHaveTextContent(/action unavailable.*range-phase.*prompt 455/i);
  expect(within(missileArray).queryByRole('button')).not.toBeInTheDocument();
});

it('charges the canonical Missile Array id and renders only authoritative charge state', async () => {
  const user = userEvent.setup();
  const session = useSessionStore.getState().session!;
  useSessionStore.getState().setSession({
    ...session,
    smallShipStates: {
      ...session.smallShipStates,
      gorgoneion: {
        ...session.smallShipStates!.gorgoneion!,
        cycle: { step: 4, revision: 7, results: {}, charges: [], turn: 2 },
      },
    },
  });
  render(<SmallShipOperations />);

  const gorgoneion = screen.getByRole('region', { name: 'Gorgoneion small-ship operations' });
  const missileArray = within(gorgoneion).getByRole('article', {
    name: 'Missile Array system // unavailable',
  });
  expect(missileArray).toHaveTextContent('not charged');
  await user.click(within(gorgoneion).getByRole('checkbox', { name: 'Missile Array' }));
  await user.click(within(gorgoneion).getByRole('button', { name: 'Charge selected consoles' }));
  expect(runSmallShipMaintenance).toHaveBeenCalledWith(
    'gorgoneion', 'reactor', 7, { consoles: ['missile-array'] },
  );

  act(() => useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    smallShipStates: {
      ...useSessionStore.getState().session!.smallShipStates,
      gorgoneion: {
        ...useSessionStore.getState().session!.smallShipStates!.gorgoneion!,
        cycle: { step: 5, revision: 8, results: {}, charges: ['missile-array'], turn: 2 },
      },
    },
  }));
  expect(missileArray).toHaveTextContent('Wolf attack // charged');
  expect(within(missileArray).queryByRole('button')).not.toBeInTheDocument();
});
