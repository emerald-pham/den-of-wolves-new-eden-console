import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import type { GorgoneionRepairDronesResult } from '@/lib/gorgoneionRepairDronesService';
import type { GameSession } from '@/types/game';

const mocks = vi.hoisted(() => ({ repair: vi.fn() }));
vi.mock('@/lib/gorgoneionRepairDronesService', () => ({ repairWithGorgoneionDrones: mocks.repair }));

import GorgoneionRepairDronesPanel from './GorgoneionRepairDronesPanel';

function installSession(overrides: Partial<GameSession> = {}): void {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner',
    createdAt: '', updatedAt: '',
  }, {
    uid: 'captain', sessionId: 's1', displayName: 'Captain', role: 'player', seatId: null,
    assignedRoleId: 'warrior-captain', replacementRoleId: 'gorgoneion-captain',
    activeConsoleRoleId: null, joinedAt: '',
  });
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!, currentTurn: 3, phase: 'active',
    activeVesselIds: ['aegis', 'gorgoneion'],
    turnPhase: {
      turn: 3, teamPhaseEndsAt: '2099-09-22T11:45:00.000Z',
      openAirspaceEndsAt: '2099-09-22T12:15:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
    smallShipStates: {
      gorgoneion: {
        id: 'gorgoneion', hostShipId: 'aegis', dockingRevision: 2,
        population: 1_000, unrest: 0,
        cycle: {
          step: 5, revision: 5, results: { '1': 'rations', '2': 'unrest', '3': 'riot', '4': 'reactor' },
          charges: ['repair-drones'], turn: 3, chargingSkipped: false,
          startedAt: '2026-09-22T08:00:00.000Z',
        },
      },
    },
    shipDamage: { aegis: { damagedSystemIds: ['reactor', 'storage'], destroyed: false } },
    shipResources: {
      aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 3, securityTeams: 9 },
    },
    ...overrides,
  } as GameSession);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
}

beforeEach(() => {
  mocks.repair.mockReset();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'gorg-repair-stable-id') });
  installSession();
});

afterEach(() => vi.unstubAllGlobals());

it('exposes one source-charged repair and submits the selected current docked-host console', async () => {
  mocks.repair.mockResolvedValue({
    status: 'committed', hostShipId: 'aegis', systemId: 'reactor',
    materialsSpent: 3, materialsRemaining: 0, cycle: 3, repairRevision: 1,
  } satisfies GorgoneionRepairDronesResult);
  render(<GorgoneionRepairDronesPanel />);
  const panel = screen.getByRole('region', { name: 'Gorgoneion Repair Drones' });
  expect(within(panel).getByText(/spend exactly 3 materials.*repair 1 damaged console.*once per cycle/i))
    .toBeInTheDocument();
  expect(within(panel).getByText(/host materials \/\/ 3/)).toBeInTheDocument();
  expect(within(panel).getByRole('button', { name: 'Repair one console' })).toBeDisabled();

  fireEvent.change(within(panel).getByRole('combobox', { name: 'Gorgoneion repair console' }), {
    target: { value: 'reactor' },
  });
  const repair = within(panel).getByRole('button', { name: 'Repair one console' });
  expect(repair).toBeEnabled();
  fireEvent.click(repair);
  await waitFor(() => expect(mocks.repair).toHaveBeenCalledWith({
    requestId: 'gorg-repair-stable-id', expectedCycle: 3,
    expectedRepairRevision: 0, expectedDockingRevision: 2,
    expectedHostShipId: 'aegis', systemId: 'reactor',
  }));
  expect(await within(panel).findByText(/Repaired reactor on AEGIS \/\/ 0 materials remain/))
    .toBeInTheDocument();
});

it('keeps the charged action available after Team maintenance is closed in the current cycle', () => {
  const session = useSessionStore.getState().session!;
  useSessionStore.getState().setSession({
    ...session,
    smallShipStates: {
      ...session.smallShipStates,
      gorgoneion: {
        ...session.smallShipStates!.gorgoneion!,
        cycle: {
          ...session.smallShipStates!.gorgoneion!.cycle,
          step: 0, revision: 6, completedAt: '2026-09-22T08:05:00.000Z',
        },
      },
    },
  } as GameSession);

  render(<GorgoneionRepairDronesPanel />);
  const panel = screen.getByRole('region', { name: 'Gorgoneion Repair Drones' });
  fireEvent.change(within(panel).getByRole('combobox', { name: 'Gorgoneion repair console' }), {
    target: { value: 'reactor' },
  });
  expect(within(panel).queryByText(/Finish current-cycle Gorgoneion Team maintenance/i)).toBeNull();
  expect(within(panel).getByRole('button', { name: 'Repair one console' })).toBeEnabled();
});

it('blocks an uncharged action and a second repair recorded in the current cycle', () => {
  const state = useSessionStore.getState().session!;
  act(() => useSessionStore.getState().setSession({
    ...state,
    smallShipStates: {
      gorgoneion: {
        ...state.smallShipStates!.gorgoneion!,
        cycle: { ...state.smallShipStates!.gorgoneion!.cycle, charges: [] },
      },
    },
  } as GameSession));
  const view = render(<GorgoneionRepairDronesPanel />);
  let panel = screen.getByRole('region', { name: 'Gorgoneion Repair Drones' });
  expect(within(panel).getByRole('button', { name: 'Repair one console' })).toBeDisabled();
  expect(within(panel).getByText(/charge Repair Drones before repairing/i)).toBeInTheDocument();

  act(() => useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    smallShipStates: state.smallShipStates,
    gorgoneionRepairDrones: { cycle: 3, revision: 1, hostShipId: 'aegis', systemId: 'reactor' },
  } as GameSession));
  view.rerender(<GorgoneionRepairDronesPanel />);
  panel = screen.getByRole('region', { name: 'Gorgoneion Repair Drones' });
  expect(within(panel).getByText(/already been used this cycle/i)).toBeInTheDocument();
  expect(within(panel).getByRole('button', { name: 'Repair one console' })).toBeDisabled();
  expect(mocks.repair).not.toHaveBeenCalled();
});

it('does not let a historical Captain role replace the current replacement entitlement', () => {
  const currentSession = useSessionStore.getState().session!;
  useSessionStore.getState().setIdentity(currentSession, {
    ...useSessionStore.getState().me!, replacementRoleId: null,
  });
  render(<GorgoneionRepairDronesPanel />);
  const panel = screen.getByRole('region', { name: 'Gorgoneion Repair Drones' });
  expect(within(panel).getByText(/current Gorgoneion Captain replacement role/i)).toBeInTheDocument();
  expect(within(panel).getByRole('button', { name: 'Repair one console' })).toBeDisabled();
});
