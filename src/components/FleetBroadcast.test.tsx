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

it('passes the authoritative current identity and queued precedence to the ticker', () => {
  useSessionStore.getState().setIdentity(
    {
      id: 's1', name: 'Table', joinCode: '1234', phase: 'active', ownerUid: 'u1',
      createdAt: '', updatedAt: '',
      fleetTicker: {
        revision: 7,
        nextSequence: 3,
        replayCursor: 3,
        current: {
          id: 's1:fleet-ticker:3', sequence: 3, source: 'admiral', priority: 80,
          text: 'ICSN ADMIRAL // RED ALERT', tone: 'danger', gap: 'standard',
          createdAt: '2026-09-12T13:00:00.000Z',
        },
        queued: [{
          id: 's1:fleet-ticker:2', sequence: 2, source: 'press', priority: 20,
          text: 'SNN // REPORT', tone: 'normal', gap: 'long',
          createdAt: '2026-09-12T12:59:00.000Z',
        }],
        draining: [],
        dismissed: [],
      },
    },
    { uid: 'u1', sessionId: 's1', displayName: 'Admiral', role: 'player', seatId: null,
      activeConsoleRoleId: 'admiral', joinedAt: '' },
  );

  render(<FleetBroadcast />);
  const props = (renderTicker.mock.calls[0] as unknown[] | undefined)?.[0] as {
    message?: { id: string; pressText?: string; serverAuthoritative?: boolean };
    queue?: readonly { id: string; serverAuthoritative?: boolean }[];
  };
  expect(props.message).toMatchObject({
    id: 's1:fleet-ticker:3', serverAuthoritative: true, pressText: 'SNN // REPORT',
  });
  expect(props.queue ?? []).toEqual([]);
});
