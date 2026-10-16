import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import PdfNewsRelayPanel from './PdfNewsRelayPanel';

const mocks = vi.hoisted(() => ({ createActions: vi.fn(), read: vi.fn(), send: vi.fn() }));
vi.mock('@/lib/fleetGroupService', () => ({
  createCurrentFleetGroupActions: mocks.createActions,
}));

beforeEach(() => {
  useSessionStore.getState().reset();
  mocks.read.mockReset().mockResolvedValue({ groupId: 'fleet-2', messages: [
    { id: 'note-1', actorUid: 'other-player', text: 'Relay: hold position.', sentAt: '2026-10-05T10:00:00Z' },
  ] });
  mocks.send.mockReset().mockResolvedValue({ status: 'committed', groupId: 'fleet-2', messageId: 'note-2' });
  mocks.createActions.mockReset().mockReturnValue({ read: mocks.read, send: mocks.send });
  useSessionStore.getState().setIdentity(
    { id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', currentTurn: 2,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    { uid: 'colonel', sessionId: 's1', displayName: 'PDF Colonel', role: 'player',
      seatId: 'refinery-124-pdf-colonel', assignedRoleId: 'refinery-124-pdf-colonel',
      activeConsoleRoleId: 'refinery-124-pdf-colonel', fleetGroupId: 'fleet-2',
      joinedAt: '2026-01-01T00:00:00.000Z' },
  );
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('relays notes only through the active PDF Colonel current-group audience', async () => {
  render(<PdfNewsRelayPanel enabled />);

  expect(await screen.findByText('Relay: hold position.')).toBeVisible();
  expect(mocks.read).toHaveBeenCalledOnce();
  expect(screen.getByRole('region', { name: 'PDF Colonel group news relay' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: /share|taxi|local group position/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /share|taxi|confirm separated/i })).not.toBeInTheDocument();

  fireEvent.change(screen.getByRole('textbox', { name: 'Message to current fleet group' }), {
    target: { value: 'The outer route is clear.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Relay message to current group' }));
  await waitFor(() => expect(mocks.send).toHaveBeenCalledWith('The outer route is clear.'));
  expect(await screen.findByRole('status')).toHaveTextContent(/sent to your current fleet group/i);
});

it('does not read or send while PDF role authority is stale or disconnected', () => {
  useSessionStore.getState().setConnection('offline');
  render(<PdfNewsRelayPanel enabled />);

  expect(screen.getByRole('status')).toHaveTextContent(/reconnect.*current pdf colonel authority/i);
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
});

it('clears the previous group notes and draft when current group authority changes', async () => {
  render(<PdfNewsRelayPanel enabled />);
  expect(await screen.findByText('Relay: hold position.')).toBeVisible();
  fireEvent.change(screen.getByRole('textbox', { name: 'Message to current fleet group' }), {
    target: { value: 'Private draft for this group.' },
  });

  mocks.read.mockResolvedValueOnce({ groupId: 'fleet-3', messages: [
    { id: 'note-3', actorUid: 'third-player', text: 'New group update.', sentAt: '2026-10-05T10:01:00Z' },
  ] });
  await act(async () => {
    useSessionStore.setState(state => ({ me: { ...state.me!, fleetGroupId: 'fleet-3' } as never }));
  });

  expect(await screen.findByText('New group update.')).toBeVisible();
  expect(screen.queryByText('Relay: hold position.')).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Message to current fleet group' })).toHaveValue('');
});
