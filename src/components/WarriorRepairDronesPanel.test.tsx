import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import type { WarriorRepairDronesResult } from '@/lib/warriorRepairDronesService';
import type { GameSession } from '@/types/game';

const mocks = vi.hoisted(() => ({ repair: vi.fn() }));
vi.mock('@/lib/warriorRepairDronesService', () => ({ repairWithWarriorDrones: mocks.repair }));

import WarriorRepairDronesPanel from './WarriorRepairDronesPanel';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function staleResult(repairCycle = 1, repairRevision = 1): WarriorRepairDronesResult {
  return {
    status: 'stale', hostShipId: 'icebreaker', systemIds: ['storage', 'reactor'],
    cycle: 3, repairCycle, repairRevision,
  };
}

function installSession(overrides: Partial<GameSession> = {}): void {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner',
    createdAt: '', updatedAt: '',
  }, {
    uid: 'captain', sessionId: 's1', displayName: 'Captain', role: 'player', seatId: null,
    assignedRoleId: 'doctor', replacementRoleId: 'warrior-captain',
    activeConsoleRoleId: null, joinedAt: '',
  });
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!, currentTurn: 3, phase: 'active',
    activeVesselIds: ['icebreaker'],
    turnPhase: {
      turn: 3, teamPhaseEndsAt: '2099-09-24T11:45:00.000Z',
      openAirspaceEndsAt: '2099-09-24T12:15:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
    smallShipStates: {
      warrior: {
        id: 'warrior', hostShipId: 'icebreaker', dockingRevision: 2,
        population: 2_000, unrest: 0,
        cycle: {
          step: 5, revision: 5, results: { '1': 'rations', '2': 'unrest', '3': 'riot', '4': 'reactor' },
          charges: ['repair-drones'], turn: 3, chargingSkipped: false,
          startedAt: '2026-09-24T08:00:00.000Z',
        },
      },
    },
    shipDamage: { icebreaker: { damagedSystemIds: ['storage', 'reactor', 'jump-drive'], destroyed: false } },
    shipResources: {
      icebreaker: { ore: 0, fuel: 4, food: 11, water: 9, materials: 9, securityTeams: 2 },
    },
    ...overrides,
  } as GameSession);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
}

beforeEach(() => {
  mocks.repair.mockReset();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'warrior-repair-stable-id') });
  installSession();
});

afterEach(() => vi.unstubAllGlobals());

it('exposes the charged repair and submits one or two selected current-host consoles', async () => {
  mocks.repair.mockResolvedValue({
    status: 'committed', hostShipId: 'icebreaker', systemIds: ['storage', 'reactor'],
    materialsSpent: 6, materialsRemaining: 3, cycle: 3, repairRevision: 1,
  } satisfies WarriorRepairDronesResult);
  render(<WarriorRepairDronesPanel />);
  const panel = screen.getByRole('region', { name: 'Warrior Repair Drones' });
  expect(within(panel).getByText(/spend exactly 6 materials.*repair one or two damaged consoles.*once per cycle/i))
    .toBeInTheDocument();
  expect(within(panel).getByText(/host materials \/\/ 9/)).toBeInTheDocument();
  const button = within(panel).getByRole('button', { name: 'Repair selected consoles' });
  expect(button).toBeDisabled();

  const choices = within(panel).getAllByRole('checkbox');
  fireEvent.click(choices[0]!);
  expect(button).toBeEnabled();
  fireEvent.click(choices[1]!);
  expect(button).toBeEnabled();
  fireEvent.click(button);
  await waitFor(() => expect(mocks.repair).toHaveBeenCalledWith({
    requestId: 'warrior-repair-stable-id', expectedCycle: 3,
    expectedRepairRevision: 0, expectedDockingRevision: 2,
    expectedHostShipId: 'icebreaker', systemIds: ['storage', 'reactor'],
  }));
  expect(await within(panel).findByText(/Repaired .* on Icebreaker \/\/ 3 materials remain/))
    .toBeInTheDocument();
  expect(within(panel).getByText(/already been used this cycle/i)).toBeInTheDocument();
});

it('keeps a current-cycle charge usable after Team maintenance closes', () => {
  const session = useSessionStore.getState().session!;
  useSessionStore.getState().setSession({
    ...session,
    smallShipStates: {
      ...session.smallShipStates,
      warrior: {
        ...session.smallShipStates!.warrior!,
        cycle: {
          ...session.smallShipStates!.warrior!.cycle,
          step: 0, revision: 6, completedAt: '2026-09-24T08:05:00.000Z',
        },
      },
    },
  } as GameSession);

  render(<WarriorRepairDronesPanel />);
  const panel = screen.getByRole('region', { name: 'Warrior Repair Drones' });
  fireEvent.click(within(panel).getAllByRole('checkbox')[0]!);
  expect(within(panel).queryByText(/Finish current-cycle Warrior Team maintenance/i)).toBeNull();
  expect(within(panel).getByRole('button', { name: 'Repair selected consoles' })).toBeEnabled();
});

it('blocks uncharged, spent, historical-role, and non-canonical-roster authority', () => {
  const initial = useSessionStore.getState().session!;
  act(() => useSessionStore.getState().setSession({
    ...initial,
    smallShipStates: {
      warrior: {
        ...initial.smallShipStates!.warrior!,
        cycle: { ...initial.smallShipStates!.warrior!.cycle, charges: [] },
      },
    },
  } as GameSession));
  const view = render(<WarriorRepairDronesPanel />);
  let panel = screen.getByRole('region', { name: 'Warrior Repair Drones' });
  expect(within(panel).getByRole('button', { name: 'Repair selected consoles' })).toBeDisabled();

  act(() => useSessionStore.getState().setSession({
    ...initial,
    warriorRepairDrones: { cycle: 3, revision: 1, hostShipId: 'icebreaker', systemIds: ['storage'] },
  } as GameSession));
  view.rerender(<WarriorRepairDronesPanel />);
  panel = screen.getByRole('region', { name: 'Warrior Repair Drones' });
  expect(within(panel).getByText(/already been used this cycle/i)).toBeInTheDocument();

  act(() => {
    useSessionStore.getState().setIdentity(useSessionStore.getState().session!, {
      ...useSessionStore.getState().me!, assignedRoleId: 'warrior-captain', replacementRoleId: null,
    });
    useSessionStore.getState().setSession({
      ...initial,
      activeVesselIds: ['icebreaker', 'warrior'] as GameSession['activeVesselIds'],
    } as GameSession);
  });
  view.rerender(<WarriorRepairDronesPanel />);
  panel = screen.getByRole('region', { name: 'Warrior Repair Drones' });
  expect(within(panel).getByText(/current Warrior Captain replacement role/i)).toBeInTheDocument();
  expect(within(panel).getByRole('button', { name: 'Repair selected consoles' })).toBeDisabled();
  expect(mocks.repair).not.toHaveBeenCalled();
});

it('uses a newer snapshot CAS that arrives before the stale result and preserves both consoles', async () => {
  vi.stubGlobal('crypto', { randomUUID: vi.fn().mockReturnValueOnce('initial-warrior-id').mockReturnValueOnce('fresh-warrior-id') });
  const pending = deferred<WarriorRepairDronesResult>();
  mocks.repair.mockReturnValue(pending.promise);
  render(<WarriorRepairDronesPanel />);
  const panel = screen.getByRole('region', { name: 'Warrior Repair Drones' });
  const choices = within(panel).getAllByRole('checkbox');
  fireEvent.click(choices[0]!);
  fireEvent.click(choices[1]!);
  fireEvent.click(within(panel).getByRole('button', { name: 'Repair selected consoles' }));

  act(() => useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    warriorRepairDrones: { cycle: 2, revision: 2, hostShipId: 'icebreaker', systemIds: ['storage'] },
  } as GameSession));
  await act(async () => pending.resolve(staleResult(1, 1)));

  expect(choices[0]).toBeChecked();
  expect(choices[1]).toBeChecked();
  expect(await within(panel).findByRole('button', { name: 'Retry repair with current revision' }))
    .toBeEnabled();
  mocks.repair.mockResolvedValue({
    status: 'committed', hostShipId: 'icebreaker', systemIds: ['storage', 'reactor'],
    materialsSpent: 6, materialsRemaining: 3, cycle: 3, repairRevision: 3,
  });
  fireEvent.click(within(panel).getByRole('button', { name: 'Retry repair with current revision' }));
  await waitFor(() => expect(mocks.repair).toHaveBeenLastCalledWith({
    requestId: 'fresh-warrior-id', expectedCycle: 3, expectedRepairRevision: 2,
    expectedDockingRevision: 2, expectedHostShipId: 'icebreaker', systemIds: ['storage', 'reactor'],
  }));
});

it('advances a prepared stale retry when a newer snapshot arrives later', async () => {
  vi.stubGlobal('crypto', {
    randomUUID: vi.fn().mockReturnValueOnce('initial-warrior-id')
      .mockReturnValueOnce('stale-retry-id').mockReturnValueOnce('newer-retry-id'),
  });
  mocks.repair.mockResolvedValueOnce(staleResult(1, 1));
  render(<WarriorRepairDronesPanel />);
  const panel = screen.getByRole('region', { name: 'Warrior Repair Drones' });
  const choices = within(panel).getAllByRole('checkbox');
  fireEvent.click(choices[0]!);
  fireEvent.click(choices[1]!);
  fireEvent.click(within(panel).getByRole('button', { name: 'Repair selected consoles' }));

  const retry = await within(panel).findByRole('button', { name: 'Retry repair with current revision' });
  expect(retry).toBeEnabled();
  act(() => useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    warriorRepairDrones: { cycle: 2, revision: 2, hostShipId: 'icebreaker', systemIds: ['storage'] },
  } as GameSession));
  await waitFor(() => expect(within(panel).getByText(/fresh request id/i)).toBeInTheDocument());
  expect(choices[0]).toBeChecked();
  expect(choices[1]).toBeChecked();

  mocks.repair.mockResolvedValue({
    status: 'committed', hostShipId: 'icebreaker', systemIds: ['storage', 'reactor'],
    materialsSpent: 6, materialsRemaining: 3, cycle: 3, repairRevision: 3,
  });
  fireEvent.click(within(panel).getByRole('button', { name: 'Retry repair with current revision' }));
  await waitFor(() => expect(mocks.repair).toHaveBeenLastCalledWith({
    requestId: 'newer-retry-id', expectedCycle: 3, expectedRepairRevision: 2,
    expectedDockingRevision: 2, expectedHostShipId: 'icebreaker', systemIds: ['storage', 'reactor'],
  }));
  expect(mocks.repair).toHaveBeenCalledTimes(2);
});

it('ignores a stale result after the Captain authority changes while it is pending', async () => {
  const pending = deferred<WarriorRepairDronesResult>();
  mocks.repair.mockReturnValue(pending.promise);
  render(<WarriorRepairDronesPanel />);
  const panel = screen.getByRole('region', { name: 'Warrior Repair Drones' });
  const choices = within(panel).getAllByRole('checkbox');
  fireEvent.click(choices[0]!);
  fireEvent.click(within(panel).getByRole('button', { name: 'Repair selected consoles' }));
  act(() => useSessionStore.getState().setIdentity(useSessionStore.getState().session!, {
    ...useSessionStore.getState().me!, replacementRoleId: null,
  }));
  await act(async () => pending.resolve(staleResult(1, 1)));

  expect(within(panel).queryByRole('button', { name: 'Retry repair with current revision' })).toBeNull();
  expect(within(panel).queryByText(/repair state changed/i)).toBeNull();
  expect(mocks.repair).toHaveBeenCalledTimes(1);
});

it('preserves the selections but blocks retry when the stale repair already used this cycle', async () => {
  mocks.repair.mockResolvedValueOnce(staleResult(3, 1));
  render(<WarriorRepairDronesPanel />);
  const panel = screen.getByRole('region', { name: 'Warrior Repair Drones' });
  const choices = within(panel).getAllByRole('checkbox');
  fireEvent.click(choices[0]!);
  fireEvent.click(choices[1]!);
  fireEvent.click(within(panel).getByRole('button', { name: 'Repair selected consoles' }));

  await waitFor(() => expect(panel.textContent).toMatch(/review the current console damage/i));
  expect(choices[0]).toBeChecked();
  expect(choices[1]).toBeChecked();
  expect(within(panel).queryByRole('button', { name: 'Retry repair with current revision' })).toBeNull();
});
