import { act, render } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import FleetBroadcast from './FleetBroadcast';

const renderTicker = vi.hoisted(() => vi.fn(() => null));

vi.mock('./FleetTicker', () => ({ default: renderTicker }));

beforeEach(() => {
  renderTicker.mockClear();
  sessionStorage.clear();
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity(
    { id: 's1', name: 'Table', joinCode: '1234', phase: 'active', ownerUid: 'u1', createdAt: '', updatedAt: '' },
    { uid: 'u1', sessionId: 's1', displayName: 'Admiral', role: 'player', seatId: null, activeConsoleRoleId: 'admiral', joinedAt: '' },
  );
});

it('does not rebuild the persistent ticker for seat-only snapshots', () => {
  render(<FleetBroadcast />);
  expect(renderTicker).toHaveBeenCalledTimes(1);
  renderTicker.mockClear();

  act(() => useSessionStore.getState().setSeats([{
    id: 'seat-1', sessionId: 's1', label: 'Bridge', factionId: null,
    status: 'open', holderUid: null, claimedAt: null,
  }]));

  expect(renderTicker).not.toHaveBeenCalled();
});
