import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession } from '@/types/game';

const mocks = vi.hoisted(() => ({ transfer: vi.fn() }));
vi.mock('@/lib/baseCapybaraCargoService', () => ({ transferBaseCapybaraCargo: vi.fn(), transferWarriorCargo: mocks.transfer }));

import { SmallShipCargoTransferPanel } from './BaseCapybaraCargoTransferPanel';

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
    ...useSessionStore.getState().session!, expansion: 'none', capybaraEnabled: false,
    currentTurn: 3, phase: 'active', activeVesselIds: ['aegis'],
    turnPhase: {
      turn: 3, teamPhaseEndsAt: '2099-09-24T11:45:00.000Z',
      openAirspaceEndsAt: '2099-09-24T12:15:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
    smallShipStates: {
      'warrior': {
        id: 'warrior', hostShipId: 'aegis', dockingRevision: 2,
        population: 700, unrest: 0, cycle: { step: 0, revision: 0, results: {}, charges: [] },
      },
    },
    warriorCargo: {
      revision: 4,
      inventory: { securityTeams: 1, ore: 2, fuel: 3, food: 4, water: 5, materials: 6 },
    },
    shipResources: {
      aegis: { securityTeams: 3, ore: 5, fuel: 7, food: 9, water: 11, materials: 13 },
    },
    shipDamage: { aegis: { damagedSystemIds: [], destroyed: false } },
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


const panel = () => render(<SmallShipCargoTransferPanel smallShipId="warrior" />);
it('offers the six source tracks and exact host/revision command under the original ordinary UID', async () => {
  mocks.transfer.mockResolvedValue({status:'committed', hostShipId:'aegis', resourceId:'food', direction:'load', amount:1, cycle:3, cargoRevision:5});
  panel();
  expect(screen.getByLabelText('Cargo inventory')).toHaveTextContent('Warrior Security Teams1');
  expect(screen.queryByText(/Scrap/i)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name:'Transfer cargo'}));
  await waitFor(() => expect(mocks.transfer).toHaveBeenCalledWith(expect.objectContaining({expectedCycle:3, expectedRevision:4, expectedHostShipId:'aegis', expectedDockingRevision:2})));
  expect(await screen.findByText(/loaded onto Warrior/i)).toBeInTheDocument();
});
it('recovers the same request after an interrupted reply but suppresses revoked or foreign-UID results', async () => {
  mocks.transfer.mockRejectedValueOnce(new Error('reply interrupted'));
  mocks.transfer.mockResolvedValueOnce({status:'replayed', hostShipId:'aegis', resourceId:'food', direction:'load', amount:1, cycle:3, cargoRevision:5});
  panel();
  fireEvent.click(screen.getByRole('button', {name:'Transfer cargo'}));
  await screen.findByRole('alert');
  const command = mocks.transfer.mock.calls[0]![0];
  fireEvent.click(screen.getByRole('button', {name:'Retry exact cargo request'}));
  await screen.findByText(/already recorded/i);
  expect(mocks.transfer.mock.calls[1]![0]).toEqual(command);
  act(() => useSessionStore.getState().setMe({...useSessionStore.getState().me!, uid:'another'}));
  expect(screen.queryByText(/already recorded/i)).not.toBeInTheDocument();
});
it('disables new cargo while session freshness is cached and names the reconnect blocker', () => {
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  panel();
  expect(screen.getByRole('button', {name:'Transfer cargo'})).toBeDisabled();
  expect(screen.getByText(/reconnect.*live session/i)).toBeInTheDocument();
});
it('withholds new Warrior cargo in active mutiny and names the next facilitator action', () => {
  const ship = useSessionStore.getState().session!.smallShipStates!.warrior!;
  useSessionStore.getState().setSession({ ...useSessionStore.getState().session!,
    smallShipStates: { warrior: { ...ship, unrest: 10,
      mutiny: { status: 'active', revision: 1, triggerUnrest: 10, triggeredAt: '2026-10-05T00:00:00.000Z' },
    } },
  });
  panel();
  expect(screen.getByRole('button', {name:'Transfer cargo'})).toBeDisabled();
  expect(screen.getByText(/facilitator.*new Captain/i)).toBeInTheDocument();
  expect(mocks.transfer).not.toHaveBeenCalled();
});
it('withdraws in-flight notices and retry controls when the replacement role is revoked', async () => {
  let resolve!: (value: unknown) => void;
  mocks.transfer.mockImplementation(() => new Promise(done => {resolve = done;}));
  panel();
  fireEvent.click(screen.getByRole('button', {name:'Transfer cargo'}));
  act(() => useSessionStore.getState().setMe({...useSessionStore.getState().me!, replacementRoleId:'vulcan-captain'}));
  await act(async () => resolve({status:'committed', hostShipId:'aegis', resourceId:'food', direction:'load', amount:1, cycle:3, cargoRevision:5}));
  expect(screen.queryByText(/loaded onto Warrior/i)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', {name:'Retry exact cargo request'})).not.toBeInTheDocument();
});
