import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import ScoutTaxiCommunicationPanel from './ScoutTaxiCommunicationPanel';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@/lib/scoutTaxiCommunicationService', () => ({ createScoutTaxiCommunicationActions: () => ({ send }) }));
const control = { shuttleId: 'hummingbird' as const, ownerRoleId: 'quellon-explorer' as const,
  ownerUid: 'u1', holderUid: 'u1', revision: 0 };

beforeEach(() => {
  send.mockReset(); send.mockResolvedValue({ status: 'committed' });
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({ id: 's1', name: 'Table', joinCode: '4821', phase: 'active', currentTurn: 3,
    activeRoleIds: ['wing-commander', 'quellon-explorer', 'shepherd-scientist'], activeVesselIds: ['aegis', 'quellon', 'shepherd'],
    playerDiscovery: { sessionId: 's1', shipId: 'quellon', groupId: 'fleet-2', revision: 2,
      currentCoordinate: '1413', knownCoordinates: ['1413'], systems: [] },
    turnPhase: { turn: 3, teamPhaseEndsAt: '2099-01-01T00:00:00Z', openAirspaceEndsAt: '2099-01-01T00:10:00Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false } },
    ownerUid: 'gm1', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { uid: 'u1', sessionId: 's1', displayName: 'Operator', role: 'player', connected: true, fleetGroupId: 'fleet-2',
    assignedRoleId: 'quellon-explorer', seatId: 'quellon-explorer', activeConsoleRoleId: 'quellon-explorer',
    replacementRoleId: null, joinedAt: '2026-01-01T00:00:00Z' });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('offers an explicit bounded courier round trip and reports success only after the server', async () => {
  const user = userEvent.setup();
  render(<ScoutTaxiCommunicationPanel shuttleId="hummingbird" control={control} />);
  expect(screen.getByText(/one scouting attempt/i)).toBeInTheDocument();
  expect(screen.queryByLabelText(/coordinate|group|passenger|fuel quantity/i)).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText('Courier destination ship'), 'aegis');
  await user.type(screen.getByLabelText('Courier note'), 'Hold position.');
  await user.click(screen.getByRole('button', { name: 'Send scout taxi courier' }));
  await waitFor(() => expect(send).toHaveBeenCalledWith('aegis', 'Hold position.'));
  expect(await screen.findByText(/courier round trip completed/i)).toBeInTheDocument();
});

it('hides the courier action from another holder and from a replacement identity', () => {
  const view = render(<ScoutTaxiCommunicationPanel shuttleId="hummingbird" control={{ ...control, holderUid: 'other' }} />);
  expect(screen.queryByRole('region', { name: 'Hummingbird scout taxi courier' })).not.toBeInTheDocument();
  act(() => useSessionStore.getState().setMe({ ...useSessionStore.getState().me!, replacementRoleId: 'comms-officer' }));
  view.rerender(<ScoutTaxiCommunicationPanel shuttleId="hummingbird" control={control} />);
  expect(screen.queryByRole('region', { name: 'Hummingbird scout taxi courier' })).not.toBeInTheDocument();
});

it('does not paint a late success after a fleet audience change', async () => {
  let resolve!: () => void;
  send.mockImplementation(() => new Promise<void>(done => { resolve = done; }));
  const user = userEvent.setup();
  render(<ScoutTaxiCommunicationPanel shuttleId="hummingbird" control={control} />);
  await user.selectOptions(screen.getByLabelText('Courier destination ship'), 'aegis');
  await user.type(screen.getByLabelText('Courier note'), 'Private courier note.');
  await user.click(screen.getByRole('button', { name: 'Send scout taxi courier' }));
  act(() => useSessionStore.getState().setMe({ ...useSessionStore.getState().me!, fleetGroupId: 'fleet-3' }));
  await act(async () => { resolve(); });
  expect(screen.queryByText(/courier round trip completed/i)).not.toBeInTheDocument();
  expect(screen.getByLabelText('Courier note')).toHaveValue('');
});
