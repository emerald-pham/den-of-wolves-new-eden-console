import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { emptyVoyage33MaintenanceState } from '../../functions/src/voyage33Maintenance';
import { shipRationSchedule } from '@/data/shipPopulation';
import type { GameSession } from '@/types/game';
import Voyage33MaintenancePanel from './Voyage33MaintenancePanel';
vi.mock('@/lib/smallShipService', () => ({ runVoyage33Maintenance: vi.fn() }));

it('shows the population-based food and water costs before host-funded rations', () => {
  const state = emptyVoyage33MaintenanceState('dione');
  state.cycle.step = 1;
  const schedule = shipRationSchedule('icebreaker', state.population);
  render(<Voyage33MaintenancePanel session={{ id: 's1' } as GameSession} state={state}
    hostShipId="dione" hostName="Dione" hostResources={{ ore: 0, fuel: 4, food: 20, water: 20, materials: 0, securityTeams: 0 }}
    currentTurn={1} phase="team" authorityReady={false} />);
  expect(screen.getByRole('button', { name: 'Apply host-funded rations' })).toHaveAccessibleDescription(
    new RegExp(`Food costs.*${schedule.food.join(' / ')}.*Water costs.*${schedule.water.join(' / ')}.*ration bonus`, 'i'),
  );
});

// Retrospective validation of existing behavior; no historical RED claim.
it.each([
  [1000, '0 / 3 / 5 / 8', '0 / 2 / 3 / 6'],
  [15001, '0 / 3 / 7 / 11', '0 / 2 / 5 / 8'],
  [40000, '0 / 4 / 9 / 13', '0 / 4 / 7 / 10'],
] as const)('renders the actual costs for population %s', (population, food, water) => {
  const state = emptyVoyage33MaintenanceState('dione');
  state.population = population;
  state.cycle.step = 1;
  render(<Voyage33MaintenancePanel session={{ id: 's1' } as GameSession} state={state}
    hostShipId="dione" hostName="Dione" hostResources={{ ore: 0, fuel: 4, food: 20, water: 20, materials: 0, securityTeams: 0 }}
    currentTurn={1} phase="team" authorityReady={false} />);
  const button = screen.getByRole('button', { name: 'Apply host-funded rations' });
  expect(button).toHaveAccessibleDescription(`Food costs by level 0 / 1 / 2 / 3: ${food}. Water costs: ${water}. Each selected level adds 3 to the combined ration bonus for the unrest check.`);
  expect(button).toBeDisabled();
});

it.each([-1, 40001, 1.5])('does not invent a ration schedule for unsupported population %s', (population) => {
  const state = emptyVoyage33MaintenanceState('dione');
  state.population = population;
  state.cycle.step = 1;
  render(<Voyage33MaintenancePanel session={{ id: 's1' } as GameSession} state={state}
    hostShipId="dione" hostName="Dione" hostResources={{ ore: 0, fuel: 4, food: 20, water: 20, materials: 0, securityTeams: 0 }}
    currentTurn={1} phase="team" authorityReady={false} />);
  expect(screen.getByRole('button', { name: 'Apply host-funded rations' })).toHaveAccessibleDescription('Ration costs unavailable: the current population is outside the printed track.');
  expect(screen.queryByText(/Food costs by level/)).not.toBeInTheDocument();
});
