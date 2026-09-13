import { act, render } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import FleetBroadcast from './FleetBroadcast';

const renderTicker = vi.hoisted(() => vi.fn(() => null));

const TURN_ZERO_ATC_TEXT = 'AIRSPACE CONTROL // TURN 0 // STANDING BY';
const TURN_ONE_AIRSPACE_TEXT = 'AIRSPACE CONTROL // AIRSPACE CLOSED // AIRSPACE LOCKDOWN, ALL CREW MUST RETURN TO ORIGIN SHIPS / STAY IN THEIR ORIGIN SHIPS // SHUTTLES MUST STAY AT CURRENT LOCATION.';

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
    fallback?: { id: string; serverAuthoritative?: boolean };
  };
  expect(props.message).toMatchObject({
    id: 's1:fleet-ticker:3', serverAuthoritative: true,
  });
  expect(props.message).not.toHaveProperty('pressText');
  expect(props.fallback).toEqual(props.queue?.[0]);
  expect(props.queue).toMatchObject([
    { id: 's1:fleet-ticker:2', serverAuthoritative: true },
  ]);
});

it('shows server-owned Turn 0 ATC before Press publishes and follows the Turn 1 transition', () => {
  const turnZeroSession = {
    id: 's1', name: 'Table', joinCode: '1234', phase: 'lobby' as const, ownerUid: 'u1',
    currentTurn: 0, createdAt: '', updatedAt: '',
    fleetTicker: {
      revision: 1, nextSequence: 1, replayCursor: 1,
      current: {
        id: 's1:fleet-ticker:1', sequence: 1, source: 'automatic' as const,
        priority: 30, sourceId: 'turn-zero-atc', text: TURN_ZERO_ATC_TEXT,
        tone: 'normal' as const, gap: 'long' as const, createdAt: '2026-09-13T16:00:00.000Z',
      },
      queued: [], draining: [], dismissed: [],
    },
  };
  const member = {
    uid: 'u1', sessionId: 's1', displayName: 'Admiral', role: 'player' as const,
    seatId: null, activeConsoleRoleId: null, joinedAt: '',
  };
  useSessionStore.getState().setIdentity(turnZeroSession, member);

  render(<FleetBroadcast />);
  const turnZeroProps = (renderTicker.mock.calls.at(-1) as unknown[] | undefined)?.[0] as {
    message?: { id: string; text: string; serverAuthoritative?: boolean };
  };
  expect(turnZeroProps.message).toMatchObject({
    id: 's1:fleet-ticker:1', text: TURN_ZERO_ATC_TEXT, serverAuthoritative: true,
  });
  expect(turnZeroProps.message?.text).not.toContain('IRIS');

  act(() => useSessionStore.getState().setIdentity({
    ...turnZeroSession,
    phase: 'active',
    currentTurn: 1,
    fleetTicker: {
      revision: 2, nextSequence: 2, replayCursor: 2,
      current: {
        id: 's1:fleet-ticker:2', sequence: 2, source: 'automatic' as const,
        priority: 40, sourceId: 'airspace:1:restricted', text: TURN_ONE_AIRSPACE_TEXT,
        tone: 'normal' as const, gap: 'long' as const, createdAt: '2026-09-13T16:01:00.000Z',
      },
      queued: [], draining: [], dismissed: [],
    },
  }, member));

  const turnOneProps = (renderTicker.mock.calls.at(-1) as unknown[] | undefined)?.[0] as {
    message?: { id: string; text: string; serverAuthoritative?: boolean };
  };
  expect(turnOneProps.message).toMatchObject({
    id: 's1:fleet-ticker:2', text: TURN_ONE_AIRSPACE_TEXT, serverAuthoritative: true,
  });
  expect(turnOneProps.message?.text).not.toContain('IRIS');
});

it('does not resurrect legacy copy after an authoritative stream is empty', () => {
  useSessionStore.getState().setIdentity(
    {
      id: 's1', name: 'Table', joinCode: '1234', phase: 'active', ownerUid: 'u1',
      createdAt: '', updatedAt: '',
      pressDispatch: {
        revision: 1,
        dispatches: [{ id: 'press-1', text: 'SNN // OLD COPY' }],
      },
      fleetTicker: {
        revision: 8,
        nextSequence: 4,
        replayCursor: 4,
        current: null,
        queued: [],
        draining: [],
        dismissed: [{
          id: 's1:fleet-ticker:4', sequence: 4, revision: 8,
          dismissedAt: '2026-09-12T13:00:00.000Z',
        }],
      },
    },
    { uid: 'u1', sessionId: 's1', displayName: 'Admiral', role: 'player', seatId: null,
      activeConsoleRoleId: 'admiral', joinedAt: '' },
  );

  render(<FleetBroadcast />);
  const props = (renderTicker.mock.calls[0] as unknown[] | undefined)?.[0] as Record<string, unknown>;
  expect(props.message).toMatchObject({
    text: 'AIRSPACE CONTROL // AWAITING DISPATCH',
  });
  expect(JSON.stringify(props)).not.toContain('OLD COPY');
});


it('keeps a neutral ticker present before the first server dispatch arrives', () => {
  render(<FleetBroadcast />);
  const props = (renderTicker.mock.calls[0] as unknown[])[0] as {
    message: { text: string };
  };
  expect(props.message.text).toBe('AIRSPACE CONTROL // AWAITING DISPATCH');
});

it.each([undefined, {
  revision: 0, nextSequence: 0, replayCursor: 0,
  current: null, queued: [], draining: [], dismissed: [],
}])('does not rebuild historical Press or ATC copy from a pending stream (%j)', (fleetTicker) => {
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!,
    currentTurn: 1,
    ...(fleetTicker ? { fleetTicker } : {}),
    pressDispatch: { revision: 2, dispatches: [{ id: 'old-news', text: 'OLD PRESS COPY' }] },
    turnPhase: {
      turn: 1,
      teamPhaseEndsAt: '2026-09-13T12:05:00.000Z',
      openAirspaceEndsAt: '2026-09-13T12:25:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
    fleetRedAlert: { active: false, revision: 4 },
  });
  render(<FleetBroadcast />);
  const props = (renderTicker.mock.calls[0] as unknown[])[0];
  expect(props).toMatchObject({ message: { text: 'AIRSPACE CONTROL // AWAITING DISPATCH' } });
  expect(JSON.stringify(props)).not.toMatch(/OLD PRESS COPY|AIRSPACE OPEN|STAND DOWN/);
});
