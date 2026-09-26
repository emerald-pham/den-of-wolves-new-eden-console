import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import ScoutRequestControls from './ScoutRequestControls';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/lib/scoutRequestService', () => ({ requestScout: request }));

function setOwner(entitlementId: string): void {
  const current = useSessionStore.getState();
  const session = current.session!;
  const mapping = {
    starlight: ['wing-commander', 'aegis'],
    hummingbird: ['quellon-explorer', 'quellon'],
    endeavour: ['shepherd-scientist', 'shepherd'],
    'comms-officer': ['comms-officer', 'aegis'],
  } as const;
  const [ownerRoleId] = mapping[entitlementId as keyof typeof mapping];
  const replacement = entitlementId === 'comms-officer';
  current.setSession({ ...session, activeVesselIds: ['aegis', 'quellon', 'shepherd'] });
  current.setMe({
    ...current.me!, role: 'player', assignedRoleId: replacement ? 'wing-commander' : ownerRoleId,
    seatId: replacement ? 'wing-commander' : ownerRoleId,
    replacementRoleId: replacement ? 'comms-officer' : null,
    activeConsoleRoleId: replacement ? null : ownerRoleId,
  });
}

beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue({
    status: 'requested', resolution: 'pending', requestId: 'scout-1', sessionId: 's1', cycle: 2,
    entitlementId: 'starlight', source: 'craft', ownerRoleId: 'wing-commander',
    anchorShipId: 'aegis', targetCoordinate: '5143',
  });
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity(
    {
      id: 's1', name: 'Table', joinCode: '4821', phase: 'active', currentTurn: 2,
      activeRoleIds: ['wing-commander', 'quellon-explorer', 'shepherd-scientist'],
      activeVesselIds: ['aegis', 'quellon', 'shepherd'],
      turnPhase: {
        turn: 2, teamPhaseEndsAt: '2099-01-01T00:00:00.000Z',
        openAirspaceEndsAt: '2099-01-01T00:10:00.000Z',
        airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
      },
      ownerUid: 'gm1', createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      uid: 'u1', sessionId: 's1', displayName: 'Operator', role: 'player', seatId: 'wing-commander',
      assignedRoleId: 'wing-commander', replacementRoleId: null,
      activeConsoleRoleId: 'wing-commander', joinedAt: '2026-01-01T00:00:00.000Z',
    },
  );
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('records only a coordinate request and leaves follow-up with a facilitator', async () => {
  const user = userEvent.setup();
  setOwner('starlight');
  render(<ScoutRequestControls entitlementId="starlight" />);

  const controls = screen.getByRole('region', { name: 'Starlight scouting request' });
  expect(controls).toHaveTextContent('Coordination');
  expect(controls).not.toHaveTextContent(/jump|fuel|range|per cycle/i);
  expect(within(controls).getByLabelText('Printed system coordinate')).toHaveAttribute('inputmode', 'numeric');
  expect(controls).not.toHaveTextContent(/chart fact|organiser reveal|system name/i);

  await user.type(within(controls).getByLabelText('Printed system coordinate'), '5143');
  await user.click(within(controls).getByRole('button', { name: 'Record request' }));

  await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({
    entitlementId: 'starlight', targetCoordinate: '5143', requestId: expect.any(String),
  })));
  expect(await within(controls).findByRole('status')).toHaveTextContent(/request recorded.*facilitator/i);
});

it('keeps the exact command identity and coordinate when the caller retries', async () => {
  const user = userEvent.setup();
  setOwner('hummingbird');
  request.mockRejectedValueOnce(Object.assign(new Error('The connection closed before confirmation.'), {
    code: 'functions/unavailable',
  }));
  request.mockResolvedValueOnce({
    status: 'replayed', resolution: 'pending', requestId: 'same-scout-id', sessionId: 's1', cycle: 2,
    entitlementId: 'hummingbird', source: 'craft', ownerRoleId: 'quellon-explorer',
    anchorShipId: 'quellon', targetCoordinate: '5143',
  });
  render(<ScoutRequestControls entitlementId="hummingbird" />);

  const controls = screen.getByRole('region', { name: 'Hummingbird scouting request' });
  await user.type(within(controls).getByLabelText('Printed system coordinate'), '5143');
  await user.click(within(controls).getByRole('button', { name: 'Record request' }));
  expect(await within(controls).findByRole('alert')).toBeVisible();
  const retryButton = within(controls).getByRole('button', { name: 'Retry same request' });
  expect(within(controls).getByLabelText('Printed system coordinate')).toBeDisabled();
  await user.click(retryButton);

  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  expect(request.mock.calls[1]?.[0]).toEqual(request.mock.calls[0]?.[0]);
  expect(await within(controls).findByRole('status')).toHaveTextContent(/request recorded/i);
});

it('allows correction after a definitive server rejection and starts a new request', async () => {
  const user = userEvent.setup();
  setOwner('starlight');
  request.mockRejectedValueOnce(Object.assign(new Error('Coordinate is not printed.'), {
    code: 'functions/invalid-argument',
  }));
  render(<ScoutRequestControls entitlementId="starlight" />);

  const controls = screen.getByRole('region', { name: 'Starlight scouting request' });
  const coordinate = within(controls).getByLabelText('Printed system coordinate');
  await user.type(coordinate, '9999');
  await user.click(within(controls).getByRole('button', { name: 'Record request' }));

  expect(await within(controls).findByRole('alert')).toHaveTextContent(/server rejected.*printed coordinate/i);
  expect(coordinate).toBeEnabled();
  expect(within(controls).getByRole('button', { name: 'Record request' })).toBeEnabled();
  const rejectedRequestId = request.mock.calls[0]?.[0].requestId;

  await user.clear(coordinate);
  await user.type(coordinate, '5143');
  await user.click(within(controls).getByRole('button', { name: 'Record request' }));

  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  expect(request.mock.calls[1]?.[0]).toEqual(expect.objectContaining({
    targetCoordinate: '5143', requestId: expect.any(String),
  }));
  expect(request.mock.calls[1]?.[0].requestId).not.toBe(rejectedRequestId);
  expect(await within(controls).findByRole('status')).toHaveTextContent(/request recorded/i);
});

it.each(['session', 'uid', 'cycle'] as const)(
  'does not reuse a retained retry after the %s authority changes', async (changedAuthority) => {
    const user = userEvent.setup();
    setOwner('hummingbird');
    request.mockRejectedValueOnce(new Error('The connection closed before confirmation.'));
    render(<ScoutRequestControls entitlementId="hummingbird" />);

    const controls = screen.getByRole('region', { name: 'Hummingbird scouting request' });
    const coordinate = within(controls).getByLabelText('Printed system coordinate');
    await user.type(coordinate, '5143');
    await user.click(within(controls).getByRole('button', { name: 'Record request' }));
    expect(await within(controls).findByRole('button', { name: 'Retry same request' })).toBeVisible();
    const firstRequestId = request.mock.calls[0]?.[0].requestId;

    act(() => {
      const current = useSessionStore.getState();
      if (changedAuthority === 'session') {
        current.setSession({ ...current.session!, id: 's2' });
        current.setMe({ ...current.me!, sessionId: 's2' });
      } else if (changedAuthority === 'uid') {
        current.setMe({ ...current.me!, uid: 'u2' });
      } else {
        const session = current.session!;
        current.setSession({
          ...session,
          currentTurn: 3,
          turnPhase: { ...session.turnPhase!, turn: 3 },
        });
      }
    });

    expect(coordinate).toBeEnabled();
    const newRequestButton = within(controls).getByRole('button', { name: 'Record request' });
    expect(newRequestButton).toBeEnabled();
    await user.click(newRequestButton);

    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(request.mock.calls[1]?.[0].requestId).not.toBe(firstRequestId);
  },
);

it('shows the form only for the exact replacement assignment and gates Team phase', async () => {
  setOwner('comms-officer');
  const { rerender } = render(<ScoutRequestControls entitlementId="comms-officer" />);
  const controls = screen.getByRole('region', { name: 'Comms Officer scouting request' });

  act(() => {
    useSessionStore.getState().setSession({
      ...useSessionStore.getState().session!,
      turnPhase: {
        ...useSessionStore.getState().session!.turnPhase!,
        airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
      },
    });
  });
  rerender(<ScoutRequestControls entitlementId="comms-officer" />);
  expect(within(controls).getByRole('button', { name: 'Record request' })).toBeDisabled();
  expect(within(controls).getByText(/available during an active coordination/i)).toBeVisible();

  act(() => {
    useSessionStore.getState().setMe({ ...useSessionStore.getState().me!, replacementRoleId: 'doctor' });
  });
  rerender(<ScoutRequestControls entitlementId="comms-officer" />);
  expect(screen.queryByRole('region', { name: 'Comms Officer scouting request' })).not.toBeInTheDocument();
  expect(request).not.toHaveBeenCalled();
});
