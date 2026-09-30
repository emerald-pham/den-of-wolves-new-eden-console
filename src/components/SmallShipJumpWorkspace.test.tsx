import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, Player } from '@/types/game';
import SmallShipJumpWorkspace from './SmallShipJumpWorkspace';

vi.mock('@/lib/smallShipJumpService', () => ({
  getSmallShipJumpWorkspace: vi.fn(),
  jumpSmallShip: vi.fn(),
  chargeSmallShipJumpDrive: vi.fn(),
}));

const movementService = await import('@/lib/smallShipJumpService');

const session = {
  id: 'small-jump-workspace', name: 'Jump review', joinCode: '4821', phase: 'active', currentTurn: 4,
  createdAt: '2026-09-30T18:00:00.000Z', updatedAt: '2026-09-30T18:00:00.000Z',
  expansion: 'base', capybaraEnabled: true,
  turnPhase: {
    turn: 4, teamPhaseEndsAt: new Date(Date.now() + 60_000).toISOString(),
    openAirspaceEndsAt: new Date(Date.now() + 120_000).toISOString(),
    airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
  },
  smallShipStates: {
    gorgoneion: {
      id: 'gorgoneion', hostShipId: 'aegis', dockingRevision: 3, population: 1000, unrest: 0,
      cycle: { step: 0, revision: 8, results: {}, charges: ['jump-drive'], turn: 4 },
    },
  },
} as GameSession;

const projection = {
  viewer: 'captain', sessionId: session.id, smallShipId: 'gorgoneion', actorUid: 'captain-1',
  hostShipId: 'aegis', currentCoordinate: '0000', movementRevision: 2, dockingRevision: 3,
  cycleRevision: 8, currentTurn: 4, phase: 'coordination', charged: true, hostFuel: 5,
  knownDestinations: [
    { coordinate: '5143', length: 'short', fuelCost: 1 },
    { coordinate: '1413', length: 'short', fuelCost: 1 },
  ],
  arrivalCoordinates: ['0000'],
};

function installCaptain() {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity(session, {
    uid: 'captain-1', sessionId: session.id, displayName: 'Captain', role: 'player', seatId: null,
    replacementRoleId: 'gorgoneion-captain', replacementStatus: null, activeConsoleRoleId: null,
    joinedAt: '2026-01-01T00:00:00.000Z',
  } as Player);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
}

beforeEach(() => {
  vi.mocked(movementService.getSmallShipJumpWorkspace).mockReset();
  vi.mocked(movementService.jumpSmallShip).mockReset();
  vi.mocked(movementService.chargeSmallShipJumpDrive).mockReset();
  vi.mocked(movementService.getSmallShipJumpWorkspace).mockResolvedValue(projection as never);
  installCaptain();
});

describe('Small Ship Jump Drive workspace', () => {
  it('offers only server-projected known destinations and shows the host-fuel contract', async () => {
    render(<SmallShipJumpWorkspace smallShipId="gorgoneion" />);

    const workspace = await screen.findByRole('region', { name: 'Small-craft Jump Drive workspace' });
    const destination = within(workspace).getByRole('combobox', { name: 'Known destination' });
    expect(within(destination).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Select a known destination',
      '5143 // short // 1 host fuel',
      '1413 // short // 1 host fuel',
    ]);
    expect(within(workspace).queryByText('9997')).not.toBeInTheDocument();
    expect(within(workspace).getByText(/host fuel is spent only after the server validates the route/i)).toBeInTheDocument();
    expect(within(workspace).getByText(/successful jump.*detaches/i)).toBeInTheDocument();
  });

  it('submits the current movement, docking, and charge revisions with a server-resolved destination', async () => {
    const user = userEvent.setup();
    vi.mocked(movementService.jumpSmallShip).mockResolvedValue({
      status: 'committed', origin: '0000', destination: '5143', length: 'short', fuelCost: 1,
      remainingHostFuel: 4, movementRevision: 3, dockingRevision: 4, cycleRevision: 9,
    } as never);
    render(<SmallShipJumpWorkspace smallShipId="gorgoneion" />);

    const workspace = await screen.findByRole('region', { name: 'Small-craft Jump Drive workspace' });
    await user.selectOptions(within(workspace).getByRole('combobox', { name: 'Known destination' }), '5143');
    await user.click(within(workspace).getByRole('button', { name: 'Execute jump' }));

    expect(movementService.jumpSmallShip).toHaveBeenCalledWith(expect.objectContaining({
      smallShipId: 'gorgoneion', hostShipId: 'aegis', destination: '5143',
      expectedOrigin: '0000', expectedMovementRevision: 2, expectedDockingRevision: 3, expectedCycleRevision: 8,
      requestId: expect.stringMatching(/^[A-Za-z0-9_-]{1,128}$/),
    }), false);
    expect(await within(workspace).findByText(/committed.*5143.*host fuel 4/i)).toBeInTheDocument();
  });

  it('exposes a Team Phase charge control and records its successful result', async () => {
    const user = userEvent.setup();
    vi.mocked(movementService.getSmallShipJumpWorkspace).mockResolvedValue({
      ...projection, phase: 'team', cycleStep: 4, cycleTurn: 4, cycleCharges: ['missile-array'], charged: false,
    } as never);
    vi.mocked(movementService.chargeSmallShipJumpDrive).mockResolvedValue({ status: 'committed' } as never);
    render(<SmallShipJumpWorkspace smallShipId="gorgoneion" />);

    const workspace = await screen.findByRole('region', { name: 'Small-craft Jump Drive workspace' });
    await user.click(within(workspace).getByRole('button', { name: 'Charge Jump Drive' }));
    expect(movementService.chargeSmallShipJumpDrive).toHaveBeenCalledWith('gorgoneion', {
      expectedCycleRevision: 8, requestId: expect.any(String), consoles: ['missile-array', 'jump-drive'],
    }, false);
    expect(await within(workspace).findByText(/charge recorded for this cycle/i)).toBeInTheDocument();
  });

  it('keeps the same request identity when the first jump response is uncertain', async () => {
    const user = userEvent.setup();
    vi.mocked(movementService.jumpSmallShip)
      .mockRejectedValueOnce(new Error('connection result unavailable'))
      .mockResolvedValueOnce({ status: 'replayed', destination: '5143', remainingHostFuel: 4 } as never);
    render(<SmallShipJumpWorkspace smallShipId="gorgoneion" />);

    const workspace = await screen.findByRole('region', { name: 'Small-craft Jump Drive workspace' });
    await user.selectOptions(within(workspace).getByRole('combobox', { name: 'Known destination' }), '5143');
    await user.click(within(workspace).getByRole('button', { name: 'Execute jump' }));
    await user.click(await within(workspace).findByRole('button', { name: 'Retry exact jump' }));

    const attempts = vi.mocked(movementService.jumpSmallShip).mock.calls;
    expect(attempts).toHaveLength(2);
    expect(attempts[0]?.[0].requestId).toBe(attempts[1]?.[0].requestId);
    await waitFor(() => expect(within(workspace).getByText(/replayed.*5143/i)).toBeInTheDocument());
  });
});
