import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { GameSession, SmallShipState } from '@/types/game';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('@/lib/vulcanLabourService', () => ({ runVulcanAdditionalLabour: mocks.run }));
import VulcanAdditionalLabourPanel from './VulcanAdditionalLabourPanel';

const completed: SmallShipState['cycle'] = { step: 0, revision: 6, turn: 1,
  results: { '1': 'rations', '2': 'unrest', '3': 'riot', '4': 'reactor' },
  startedAt: '2026-10-05T09:00:00.000Z', completedAt: '2026-10-05T09:05:00.000Z',
  chargingSkipped: false, charges: ['additional-labour-1', 'additional-labour-2'] };

type CycleOverrides = { [Key in keyof SmallShipState['cycle']]?: SmallShipState['cycle'][Key] | undefined };

function install(overrides: CycleOverrides = {}, airspace: 'restricted' | 'lifted' = 'lifted') {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Vulcan training', joinCode: '4123', phase: 'active', currentTurn: 1,
    createdAt: '', updatedAt: '', activeVesselIds: ['aegis'],
    turnPhase: { turn: 1, progression: 'manual', teamPhaseEndsAt: '2020-01-01T00:00:00.000Z',
      openAirspaceEndsAt: '2020-01-01T00:10:00.000Z',
      airspace: { state: airspace, tickerActive: true, pressAccess: false } },
    smallShipStates: { vulcan: { id: 'vulcan', hostShipId: 'aegis', dockingRevision: 1,
      population: 1000, unrest: 0, cycle: { ...completed, ...overrides } } },
  } as GameSession, { uid: 'captain', sessionId: 's1', displayName: 'DEMO // Vulcan', role: 'player',
    assignedRoleId: 'wing-commander', replacementRoleId: 'vulcan-captain',
    activeConsoleRoleId: null, seatId: null, joinedAt: '' });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
}

beforeEach(() => { mocks.run.mockReset().mockResolvedValue({ status: 'committed' }); install(); });

it('offers a completed current-cycle Team charge and submits the actual source and target revisions', async () => {
  render(<VulcanAdditionalLabourPanel />);
  const action = screen.getByRole('button', { name: 'Use Additional Labour // 2 left' });
  expect(action).toBeEnabled();
  fireEvent.change(screen.getByLabelText('Additional Labour target console'), { target: { value: 'jump-drive' } });
  fireEvent.click(action);
  await waitFor(() => expect(mocks.run).toHaveBeenCalledWith(
    'additional-labour-1', 'aegis', 'jump-drive', 6, 0, undefined, undefined));
});

it('keeps the charge disabled during restricted Team Phase', () => {
  install({}, 'restricted'); render(<VulcanAdditionalLabourPanel />);
  expect(screen.getByRole('button', { name: 'Use Additional Labour // 2 left' })).toBeDisabled();
  expect(screen.getByText('Additional Labour is available during Coordination Phase.')).toBeVisible();
  expect(mocks.run).not.toHaveBeenCalled();
});

it.each([
  { completedAt: undefined }, { completedAt: 'invalid' }, { startedAt: undefined },
  { results: { '1': 'rations', '2': 'unrest', '3': 'riot' } },
  { chargingSkipped: true }, { turn: 2 }, { charges: [] },
])('does not offer a malformed, unfinished, stale, or spent closed cycle: %j', overrides => {
  install(overrides); render(<VulcanAdditionalLabourPanel />);
  expect(screen.queryByRole('button', { name: /Use Additional Labour/ })).not.toBeInTheDocument();
  expect(mocks.run).not.toHaveBeenCalled();
});
