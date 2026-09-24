import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useSessionStore } from '@/store/useSessionStore';
import type { BaseCapybaraCargoTransferResult } from '@/lib/baseCapybaraCargoService';
import type { GameSession } from '@/types/game';

const mocks = vi.hoisted(() => ({ transfer: vi.fn() }));
vi.mock('@/lib/baseCapybaraCargoService', () => ({ transferBaseCapybaraCargo: mocks.transfer }));

import BaseCapybaraCargoTransferPanel from './BaseCapybaraCargoTransferPanel';

function installSession(overrides: Partial<GameSession> = {}): void {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner',
    createdAt: '', updatedAt: '',
  }, {
    uid: 'captain', sessionId: 's1', displayName: 'Captain', role: 'player', seatId: null,
    assignedRoleId: 'doctor', replacementRoleId: 'capybara-small-captain',
    activeConsoleRoleId: null, joinedAt: '',
  });
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!, expansion: 'base', capybaraEnabled: true,
    currentTurn: 3, phase: 'active', activeVesselIds: ['aegis'],
    turnPhase: {
      turn: 3, teamPhaseEndsAt: '2099-09-24T11:45:00.000Z',
      openAirspaceEndsAt: '2099-09-24T12:15:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
    smallShipStates: {
      'capybara-small': {
        id: 'capybara-small', hostShipId: 'aegis', dockingRevision: 2,
        population: 700, unrest: 0, cycle: { step: 0, revision: 0, results: {}, charges: [] },
      },
    },
    baseCapybaraCargo: {
      revision: 4,
      inventory: { securityTeams: 1, ore: 2, fuel: 3, food: 4, water: 5, materials: 6 },
    },
    shipResources: {
      aegis: { securityTeams: 3, ore: 5, fuel: 7, food: 9, water: 11, materials: 13 },
    },
    ...overrides,
  } as GameSession);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
}

beforeEach(() => {
  mocks.transfer.mockReset();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'capybara-cargo-stable-id') });
  installSession();
});

afterEach(() => vi.unstubAllGlobals());

it('shows the six cargo tracks and submits an exact current-host transfer', async () => {
  mocks.transfer.mockResolvedValue({
    status: 'committed', hostShipId: 'aegis', resourceId: 'food', direction: 'load',
    amount: 2, cycle: 3, cargoRevision: 5,
  } satisfies BaseCapybaraCargoTransferResult);
  render(<BaseCapybaraCargoTransferPanel />);
  const panel = screen.getByRole('region', { name: 'Cargo Transfer' });
  expect(within(panel).getByLabelText('Cargo inventory')).toHaveTextContent('Capybara Security Teams1');
  expect(within(panel).queryByText(/Scrap/i)).not.toBeInTheDocument();
  expect(within(panel).getByRole('option', { name: 'Load from host' })).toBeInTheDocument();
  expect(within(panel).getByRole('option', { name: 'Unload to host' })).toBeInTheDocument();

  fireEvent.change(within(panel).getByLabelText('Positive whole amount'), { target: { value: '2' } });
  const button = within(panel).getByRole('button', { name: 'Transfer cargo' });
  expect(button).toBeEnabled();
  fireEvent.click(button);
  await waitFor(() => expect(mocks.transfer).toHaveBeenCalledWith({
    requestId: 'capybara-cargo-stable-id', expectedCycle: 3, expectedRevision: 4,
    expectedDockingRevision: 2, expectedHostShipId: 'aegis',
    resourceId: 'food', direction: 'load', amount: 2,
  }));
  expect(await within(panel).findByText(/2 Food loaded onto Capybara from AEGIS/i)).toBeInTheDocument();
});

it('keeps an exact request id for retry after a failed response', async () => {
  mocks.transfer.mockRejectedValueOnce(new Error('network lost'));
  mocks.transfer.mockResolvedValueOnce({
    status: 'replayed', hostShipId: 'aegis', resourceId: 'food', direction: 'load',
    amount: 1, cycle: 3, cargoRevision: 5,
  } satisfies BaseCapybaraCargoTransferResult);
  render(<BaseCapybaraCargoTransferPanel />);
  const panel = screen.getByRole('region', { name: 'Cargo Transfer' });
  fireEvent.click(within(panel).getByRole('button', { name: 'Transfer cargo' }));
  expect(await within(panel).findByRole('alert')).toHaveTextContent('network lost');
  const firstCommand = mocks.transfer.mock.calls[0]?.[0];
  fireEvent.click(within(panel).getByRole('button', { name: 'Retry exact cargo request' }));
  await waitFor(() => expect(mocks.transfer).toHaveBeenCalledTimes(2));
  expect(mocks.transfer.mock.calls[1]?.[0]).toEqual(firstCommand);
  expect(await within(panel).findByText(/already recorded/i)).toBeInTheDocument();
});

it('unloads Capybara cargo to its active docked host', async () => {
  mocks.transfer.mockResolvedValue({
    status: 'committed', hostShipId: 'aegis', resourceId: 'ore', direction: 'unload',
    amount: 2, cycle: 3, cargoRevision: 5,
  } satisfies BaseCapybaraCargoTransferResult);
  render(<BaseCapybaraCargoTransferPanel />);
  const panel = screen.getByRole('region', { name: 'Cargo Transfer' });
  fireEvent.change(within(panel).getByLabelText('Resource'), { target: { value: 'ore' } });
  fireEvent.change(within(panel).getByLabelText('Direction'), { target: { value: 'unload' } });
  fireEvent.change(within(panel).getByLabelText('Positive whole amount'), { target: { value: '2' } });
  fireEvent.click(within(panel).getByRole('button', { name: 'Transfer cargo' }));
  await waitFor(() => expect(mocks.transfer).toHaveBeenCalledWith({
    requestId: 'capybara-cargo-stable-id', expectedCycle: 3, expectedRevision: 4,
    expectedDockingRevision: 2, expectedHostShipId: 'aegis',
    resourceId: 'ore', direction: 'unload', amount: 2,
  }));
  expect(await within(panel).findByText(/2 Ore unloaded from Capybara to AEGIS/i)).toBeInTheDocument();
});

it('disables transfer when the host is not in the canonical core roster or the cycle is stale', () => {
  act(() => installSession({ activeVesselIds: ['dione'] }));
  const { rerender } = render(<BaseCapybaraCargoTransferPanel />);
  const panel = screen.getByRole('region', { name: 'Cargo Transfer' });
  expect(within(panel).getByRole('button', { name: 'Transfer cargo' })).toBeDisabled();

  act(() => installSession({ activeVesselIds: ['aegis'], turnPhase: {
    turn: 2, teamPhaseEndsAt: '2099-09-24T11:45:00.000Z',
    openAirspaceEndsAt: '2099-09-24T12:15:00.000Z',
    airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
  } }));
  rerender(<BaseCapybaraCargoTransferPanel />);
  expect(within(panel).getByRole('button', { name: 'Transfer cargo' })).toBeDisabled();
});

it('keeps the transfer control disabled outside explicit base vessel mode', () => {
  act(() => installSession({ expansion: 'capybara' }));
  render(<BaseCapybaraCargoTransferPanel />);
  expect(screen.getByRole('button', { name: 'Transfer cargo' })).toBeDisabled();
});
