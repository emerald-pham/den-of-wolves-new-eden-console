import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import FleetGroupWorkspace from './FleetGroupWorkspace';
import { useSessionStore } from '@/store/useSessionStore';
const mocks = vi.hoisted(() => ({ read: vi.fn(), send: vi.fn(), confirm: vi.fn() }));
vi.mock('@/lib/fleetGroupService', () => ({ createCurrentFleetGroupActions: () => ({
  read: mocks.read, send: mocks.send, confirmPartition: mocks.confirm,
}) }));
beforeEach(() => {
  useSessionStore.getState().reset();
  mocks.read.mockReset().mockResolvedValue({ groupId: 'fleet-2', messages: [{ id: 'r1', actorUid: 'bob', text: 'Hold here.', sentAt: '2026-09-30T10:00:00Z' }] });
  mocks.send.mockReset().mockResolvedValue({ status: 'committed', groupId: 'fleet-2', messageId: 'r2' });
  mocks.confirm.mockReset().mockResolvedValue({ status: 'committed', navigationRevision: 2, groupIds: ['fleet-1', 'fleet-2'] });
});
function seed(role = 'player') {
  useSessionStore.setState({ session: { id: 's1', phase: 'active', playerDiscovery: { groupId: 'fleet-2', revision: 1 } } as never,
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
