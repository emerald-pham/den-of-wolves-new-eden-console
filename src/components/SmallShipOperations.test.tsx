import { render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import SmallShipOperations from './SmallShipOperations';

vi.mock('@/lib/smallShipService', () => ({
  runSmallShipMaintenance: vi.fn(),
  setSmallShipDocking: vi.fn(),
}));

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
  expect(missileArray).toHaveTextContent('Wolf attack // charged console');
  expect(missileArray).toHaveTextContent('3 dice at long, medium, and short range');
  expect(missileArray).toHaveTextContent('6+ / 5+ / 4+');
  expect(missileArray).toHaveTextContent('each target at most once per phase');
  expect(missileArray).toHaveTextContent(/action unavailable.*range-phase.*prompt 455/i);
  expect(within(missileArray).queryByRole('button')).not.toBeInTheDocument();
});
