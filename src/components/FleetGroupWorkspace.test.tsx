import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import FleetGroupWorkspace from './FleetGroupWorkspace';
import { useSessionStore } from '@/store/useSessionStore';
const mocks = vi.hoisted(() => ({ read: vi.fn(), send: vi.fn(), confirm: vi.fn(), readNavigation: vi.fn(), share: vi.fn(), transferTaxi: vi.fn(),
  roster: [{ uid: 'crew-1', displayName: 'Pilot Mira', role: 'player', connected: true, fleetGroupId: 'fleet-2', assignedRoleId: 'quellon-engineer' }] }));
vi.mock('@/lib/fleetGroupService', () => ({ createCurrentFleetGroupActions: () => ({
  read: mocks.read, send: mocks.send, confirmPartition: mocks.confirm,
  readNavigation: mocks.readNavigation, share: mocks.share, transferTaxi: mocks.transferTaxi,
}) }));
vi.mock('@/lib/firestore', () => ({ subscribeConnectedPlayers: (_sessionId: string, onPlayers: (players: unknown[]) => void) => {
  onPlayers(mocks.roster); return vi.fn();
} }));
beforeEach(() => {
  useSessionStore.getState().reset();
  mocks.read.mockReset().mockResolvedValue({ groupId: 'fleet-2', messages: [{ id: 'r1', actorUid: 'bob', text: 'Hold here.', sentAt: '2026-09-30T10:00:00Z' }] });
  mocks.send.mockReset().mockResolvedValue({ status: 'committed', groupId: 'fleet-2', messageId: 'r2' });
  mocks.confirm.mockReset().mockResolvedValue({ status: 'committed', navigationRevision: 2, groupIds: ['fleet-1', 'fleet-2'] });
  mocks.readNavigation.mockReset().mockResolvedValue({ groupId: 'fleet-2', navigationRevision: 1, fleetPartitionRevision: 1,
    sampledAt: '2026-10-02T10:00:00Z', ships: [
      { shipId: 'quellon', fleetGroupId: 'fleet-2', coordinate: '0000' },
      { shipId: 'capybara', fleetGroupId: 'fleet-2', coordinate: '1413' },
    ], transits: [] });
  mocks.share.mockReset().mockResolvedValue({ status: 'committed', requestId: 'share-1', groupId: 'fleet-2',
    coordinate: '1413', recipientShipIds: ['quellon'], navigationRevision: 2 });
  mocks.transferTaxi.mockReset().mockResolvedValue({ status: 'committed', requestId: 'taxi-1', kind: 'fuel',
    sourceGroupId: 'fleet-2', targetGroupId: 'fleet-1', targetShipId: 'aegis', units: 1 });
});
function seed(role = 'player') {
  useSessionStore.setState({ session: { id: 's1', phase: 'active', currentTurn: 3,
    playerDiscovery: { groupId: 'fleet-2', revision: 1, knownCoordinates: ['0000', '1413'],
      fleetGroupVesselIds: ['quellon', 'capybara'], fleetGroupPursuitValue: 2 } } as never,
    me: { uid: 'alice', sessionId: 's1', role, fleetGroupId: 'fleet-2' } as never,
    connection: 'live', sessionSnapshotFreshness: 'server', gmInstance: role === 'gm' ? { id: 'bridge', sessionId: 's1', uid: 'alice' } as never : null });
}
it('renders own group notes and sends a bounded group note through the connected service', async () => {
  seed(); render(<FleetGroupWorkspace />);
  expect(await screen.findByText('Hold here.')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Note to your fleet group'), { target: { value: 'Stay together.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send group note' }));
  await waitFor(() => expect(mocks.send).toHaveBeenCalledWith('Stay together.'));
  expect(screen.queryByRole('button', { name: 'Confirm separated fleet groups' })).toBeNull();
});
it('mounts the facilitator partition confirmation but hides notes when context goes stale', async () => {
  seed('gm'); const result = render(<FleetGroupWorkspace />);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm separated fleet groups' }));
  await waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce());
  act(() => { useSessionStore.setState({ connection: 'offline' }); }); result.rerender(<FleetGroupWorkspace />);
  expect(screen.queryByText('Hold here.')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Send group note' })).toBeNull();
});

it('shares only a known coordinate to selected ships from the fresh current-group projection', async () => {
  seed(); render(<FleetGroupWorkspace />);
  const system = await screen.findByLabelText('Scanned system to share');
  fireEvent.change(system, { target: { value: '1413' } });
  fireEvent.click(screen.getByLabelText('Quellon'));
  fireEvent.click(screen.getByRole('button', { name: 'Share scanned system' }));
  await waitFor(() => expect(mocks.share).toHaveBeenCalledWith('1413', ['quellon']));
  expect(await screen.findByRole('status')).toHaveTextContent(/shared/i);
});

it('offers a legal taxi payload form and reports the server committed fuel result', async () => {
  seed(); render(<FleetGroupWorkspace />);
  fireEvent.change(await screen.findByLabelText('Taxi destination ship'), { target: { value: 'aegis' } });
  fireEvent.change(screen.getByLabelText('Taxi payload'), { target: { value: 'fuel' } });
  fireEvent.change(screen.getByLabelText('Fuel units'), { target: { value: '1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send scout taxi' }));
  await waitFor(() => expect(mocks.transferTaxi).toHaveBeenCalledWith({ shuttleId: 'hummingbird', targetShipId: 'aegis', payload: { kind: 'fuel', units: 1 } }));
  expect(await screen.findByRole('status')).toHaveTextContent(/fuel/i);
});

it('lets the current taxi owner select at most two connected members from the server scoped group roster', async () => {
  seed(); useSessionStore.setState(state => ({ me: { ...state.me!, assignedRoleId: 'quellon-explorer' } as never }));
  render(<FleetGroupWorkspace />);
  fireEvent.change(await screen.findByLabelText('Taxi destination ship'), { target: { value: 'aegis' } });
  fireEvent.change(screen.getByLabelText('Taxi payload'), { target: { value: 'players' } });
  fireEvent.click(screen.getByLabelText('Pilot Mira'));
  fireEvent.click(screen.getByRole('button', { name: 'Send scout taxi' }));
  await waitFor(() => expect(mocks.transferTaxi).toHaveBeenCalledWith({ shuttleId: 'hummingbird', targetShipId: 'aegis',
    payload: { kind: 'players', playerUids: ['crew-1'] } }));
});
