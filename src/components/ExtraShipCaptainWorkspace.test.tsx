import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, Player } from '@/types/game';
import ExtraShipCaptainWorkspace from './ExtraShipCaptainWorkspace';

vi.mock('@/lib/smallShipJumpService', () => ({
  getSmallShipJumpWorkspace: vi.fn(),
  jumpSmallShip: vi.fn(),
  chargeSmallShipJumpDrive: vi.fn(),
}));

const movementService = await import('@/lib/smallShipJumpService');

const baseSession = {
  id: 'extra-captain-jump', name: 'Captain test', joinCode: '4821', phase: 'active', currentTurn: 4,
  createdAt: '2026-09-30T18:00:00.000Z', updatedAt: '2026-09-30T18:00:00.000Z',
  expansion: 'base', capybaraEnabled: true,
  smallShipStates: {
    gorgoneion: {
      id: 'gorgoneion', hostShipId: 'aegis', dockingRevision: 1, population: 1000, unrest: 0,
      cycle: { step: 0, revision: 1, results: {}, charges: [], turn: 4 },
    },
    'capybara-small': {
      id: 'capybara-small', hostShipId: 'aegis', dockingRevision: 1, population: 2000, unrest: 0,
      cycle: { step: 0, revision: 1, results: {}, charges: [], turn: 4 },
    },
  },
} as GameSession;

function installCaptain(roleId: 'gorgoneion-captain' | 'capybara-small-captain', session = baseSession) {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity(session, {
    uid: 'captain-1', sessionId: session.id, displayName: 'Captain', role: 'player', seatId: null,
    replacementRoleId: roleId, replacementStatus: null, activeConsoleRoleId: null,
    joinedAt: '2026-01-01T00:00:00.000Z',
  } as Player);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
}

beforeEach(() => {
  vi.mocked(movementService.getSmallShipJumpWorkspace).mockReset().mockResolvedValue({
    viewer: 'captain', sessionId: baseSession.id, smallShipId: 'gorgoneion', hostShipId: 'aegis',
    currentCoordinate: '0000', movementRevision: 0, dockingRevision: 1,
    cycleRevision: 1, currentTurn: 4, phase: 'team', charged: false, hostFuel: 5,
    knownDestinations: [], arrivalCoordinates: [],
  } as never);
  useSessionStore.getState().reset();
});

describe('extra-ship Captain Jump Drive integration', () => {
  it.each([
    ['gorgoneion-captain', 'gorgoneion'],
    ['capybara-small-captain', 'capybara-small'],
  ] as const)('mounts the connected movement workspace for %s', async (roleId, smallShipId) => {
    installCaptain(roleId);
    render(<ExtraShipCaptainWorkspace roleId={roleId} />);

    expect(await screen.findByRole('region', { name: 'Small-craft Jump Drive workspace' })).toBeInTheDocument();
    expect(movementService.getSmallShipJumpWorkspace).toHaveBeenCalledWith(smallShipId);
  });

  it('keeps the expansion Capybara out of the base small-craft movement workspace', () => {
    installCaptain('capybara-small-captain', {
      ...baseSession,
      expansion: 'capybara',
    } as GameSession);
    render(<ExtraShipCaptainWorkspace roleId="capybara-small-captain" />);

    expect(screen.getByRole('alert')).toHaveTextContent(/different Capybara mode/i);
    expect(screen.queryByRole('region', { name: 'Small-craft Jump Drive workspace' })).not.toBeInTheDocument();
    expect(movementService.getSmallShipJumpWorkspace).not.toHaveBeenCalled();
  });
});
